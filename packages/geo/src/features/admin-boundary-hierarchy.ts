import type { GeoJsonGeometryModel, QuestionFeatureRecordModel } from '../../../shared-types/src/index.ts';
import { pointInGeometry, polygonRingsFromGeometry } from '../geometry/geojson.ts';

interface Coordinate {
  lon?: unknown;
  lat?: unknown;
}

interface BoundaryMember {
  type?: unknown;
  role?: unknown;
  geometry?: unknown;
}

interface BoundaryElement {
  type?: unknown;
  id?: unknown;
  tags?: Record<string, unknown>;
  members?: unknown;
}

type Ring = [number, number][];

function coordinate(value: unknown): [number, number] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { lon, lat } = value as Coordinate;
  return typeof lon === 'number' && Number.isFinite(lon) &&
    typeof lat === 'number' && Number.isFinite(lat) ? [lon, lat] : undefined;
}

function samePoint(left: [number, number], right: [number, number]): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function stitchRings(ways: [number, number][][]): Ring[] {
  const pending = ways.filter((way) => way.length >= 2).map((way) => [...way]);
  const rings: Ring[] = [];
  while (pending.length > 0) {
    let ring = pending.shift()!;
    let changed = true;
    while (!samePoint(ring[0]!, ring.at(-1)!) && changed) {
      changed = false;
      for (let index = 0; index < pending.length; index += 1) {
        const candidate = pending[index]!;
        const start = candidate[0]!;
        const end = candidate.at(-1)!;
        if (samePoint(ring.at(-1)!, start)) ring = [...ring, ...candidate.slice(1)];
        else if (samePoint(ring.at(-1)!, end)) ring = [...ring, ...candidate.slice(0, -1).reverse()];
        else if (samePoint(ring[0]!, end)) ring = [...candidate.slice(0, -1), ...ring];
        else if (samePoint(ring[0]!, start)) ring = [...candidate.slice(1).reverse(), ...ring];
        else continue;
        pending.splice(index, 1);
        changed = true;
        break;
      }
    }
    if (samePoint(ring[0]!, ring.at(-1)!) && ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function isClosedRing(ring: unknown[]): ring is [number, number][] {
  return ring.length >= 4 && ring.every((point) => Array.isArray(point) && point.length >= 2 &&
    typeof point[0] === 'number' && typeof point[1] === 'number') &&
    samePoint(ring[0] as [number, number], ring.at(-1) as [number, number]);
}

function signedArea(ring: [number, number][]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index]!;
    const next = ring[index + 1]!;
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area / 2);
}

function polygonContains(ring: Ring, point: [number, number]): boolean {
  return pointInGeometry(point, { type: 'Polygon', coordinates: [ring] });
}

function areaGeometry(outerRings: Ring[], innerRings: Ring[]): GeoJsonGeometryModel | undefined {
  if (outerRings.length === 0) return undefined;
  const polygons: Ring[][] = outerRings.map((outer) => [outer]);
  for (const inner of innerRings) {
    const point = inner[0];
    if (!point) continue;
    const polygonIndex = outerRings.findIndex((outer) => polygonContains(outer, point));
    if (polygonIndex >= 0) polygons[polygonIndex]!.push(inner);
  }
  return { type: 'MultiPolygon', coordinates: polygons };
}

export function assembleAdministrativeBoundary(element: unknown): QuestionFeatureRecordModel | undefined {
  if (!element || typeof element !== 'object') return undefined;
  const boundary = element as BoundaryElement;
  if (boundary.type !== 'relation' || typeof boundary.id !== 'number' ||
    boundary.tags?.boundary !== 'administrative') return undefined;
  const adminLevel = Number(boundary.tags.admin_level);
  if (!Number.isInteger(adminLevel) || adminLevel <= 2 || adminLevel > 12 || !Array.isArray(boundary.members)) return undefined;

  const outerWays: [number, number][][] = [];
  const innerWays: [number, number][][] = [];
  for (const memberValue of boundary.members) {
    if (!memberValue || typeof memberValue !== 'object') continue;
    const member = memberValue as BoundaryMember;
    if (member.type !== 'way' || !Array.isArray(member.geometry)) continue;
    const way = member.geometry.map(coordinate).filter((point): point is [number, number] => point !== undefined);
    if (way.length < 2) continue;
    if (member.role === 'outer') outerWays.push(way);
    if (member.role === 'inner') innerWays.push(way);
  }

  const outerRings = stitchRings(outerWays);
  const geometry = areaGeometry(outerRings, stitchRings(innerWays));
  if (!geometry) return undefined;
  const largestOuterRing = outerRings.sort((left, right) => signedArea(right) - signedArea(left))[0]!;
  const longitude = largestOuterRing.reduce((sum, point) => sum + point[0], 0) / (largestOuterRing.length - 1);
  const latitude = largestOuterRing.reduce((sum, point) => sum + point[1], 0) / (largestOuterRing.length - 1);
  const label = [boundary.tags.name, boundary.tags['name:en'], boundary.tags.official_name]
    .find((value) => typeof value === 'string' && value.trim());
  return {
    featureId: `osm:relation/${boundary.id}`,
    featureClassId: 'admin-boundary',
    label: typeof label === 'string' ? label.trim() : `Administrative division ${adminLevel}`,
    longitude,
    latitude,
    geometrySupport: 'polygon',
    coverage: 'approximate',
    properties: { adminLevel },
    geometry
  };
}

export function selectAdministrativeDivisionAtPoint(
  features: QuestionFeatureRecordModel[],
  point: [number, number],
  divisionOrdinal: number
): QuestionFeatureRecordModel | undefined {
  if (!Number.isInteger(divisionOrdinal) || divisionOrdinal < 1 || divisionOrdinal > 4) return undefined;
  const containing = features.filter((feature) => feature.featureClassId === 'admin-boundary' &&
    typeof feature.properties?.adminLevel === 'number' && feature.properties.adminLevel > 2 &&
    feature.geometry && polygonRingsFromGeometry(feature.geometry).length > 0 &&
    pointInGeometry(point, feature.geometry));
  const expectedLevelRanges: [number, number][] = [[3, 4], [5, 6], [7, 8], [9, 10]];
  let selected: QuestionFeatureRecordModel | undefined;
  for (const [index, [minimumLevel, maximumLevel]] of expectedLevelRanges.slice(0, divisionOrdinal).entries()) {
    const atOrdinal = containing.filter((feature) => {
      const level = feature.properties?.adminLevel;
      return typeof level === 'number' && level >= minimumLevel && level <= maximumLevel;
    });
    const levels = [...new Set(atOrdinal.map((feature) => feature.properties!.adminLevel as number))];
    if (levels.length !== 1) return undefined;
    const atLevel = atOrdinal.filter((feature) => feature.properties?.adminLevel === levels[0]);
    if (atLevel.length !== 1) return undefined;
    selected = atLevel[0];
    // A later ordinal cannot be treated as the requested division if an earlier
    // country-specific level is absent from the mapped hierarchy.
    if (index < divisionOrdinal - 1 && !selected) return undefined;
  }
  return selected;
}

export function distanceToAdministrativeBoundaryMeters(point: [number, number], feature: QuestionFeatureRecordModel): number | undefined {
  if (!feature.geometry) return undefined;
  const rings = polygonRingsFromGeometry(feature.geometry).flat();
  if (rings.length === 0) return undefined;
  const latitudeRadians = point[1] * Math.PI / 180;
  const metersPerDegreeLatitude = 111_132;
  const metersPerDegreeLongitude = 111_320 * Math.cos(latitudeRadians);
  let minimum = Number.POSITIVE_INFINITY;
  for (const ring of rings) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      const left = ring[index]!;
      const right = ring[index + 1]!;
      const ax = (left[0] - point[0]) * metersPerDegreeLongitude;
      const ay = (left[1] - point[1]) * metersPerDegreeLatitude;
      const bx = (right[0] - point[0]) * metersPerDegreeLongitude;
      const by = (right[1] - point[1]) * metersPerDegreeLatitude;
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
      minimum = Math.min(minimum, Math.hypot(ax + projection * dx, ay + projection * dy));
    }
  }
  return Number.isFinite(minimum) ? minimum : undefined;
}
