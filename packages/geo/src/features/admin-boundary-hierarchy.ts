import type { GeoJsonGeometryModel, QuestionFeatureRecordModel } from '../../../shared-types/src/index.ts';
import { pointInGeometry, polygonRingsFromGeometry } from '../geometry/geojson.ts';

interface Coordinate {
  lon?: unknown;
  lat?: unknown;
}

interface BoundaryMember {
  type?: unknown;
  role?: unknown;
  ref?: unknown;
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
  const boundaryWays: Array<{ wayId: number; coordinates: [number, number][] }> = [];
  for (const memberValue of boundary.members) {
    if (!memberValue || typeof memberValue !== 'object') continue;
    const member = memberValue as BoundaryMember;
    if (member.type !== 'way' || !Array.isArray(member.geometry)) continue;
    const way = member.geometry.map(coordinate).filter((point): point is [number, number] => point !== undefined);
    if (way.length < 2) continue;
    if (member.role === 'outer' && typeof member.ref === 'number') {
      boundaryWays.push({ wayId: member.ref, coordinates: way });
    }
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
    properties: { adminLevel, adminBoundaryWays: boundaryWays },
    geometry
  };
}

const ADMIN_LEVEL_RANGES: [number, number][] = [[3, 4], [5, 6], [7, 8], [9, 10]];

function expectedAdminLevel(features: QuestionFeatureRecordModel[], ordinal: number): number | undefined {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > ADMIN_LEVEL_RANGES.length) return undefined;
  let selectedLevel: number | undefined;
  for (const [minimumLevel, maximumLevel] of ADMIN_LEVEL_RANGES.slice(0, ordinal)) {
    const levels = [...new Set(features
      .filter((feature) => feature.featureClassId === 'admin-boundary')
      .map((feature) => feature.properties?.adminLevel)
      .filter((level): level is number => typeof level === 'number' && level >= minimumLevel && level <= maximumLevel))];
    if (levels.length !== 1) return undefined;
    selectedLevel = levels[0];
  }
  return selectedLevel;
}

export function buildSharedAdministrativeBorders(
  features: QuestionFeatureRecordModel[],
  divisionOrdinal: number,
  featureClassId: string,
  label: string
): QuestionFeatureRecordModel[] {
  const adminLevel = expectedAdminLevel(features, divisionOrdinal);
  if (adminLevel === undefined) return [];
  const regions = features.filter((feature) => feature.featureClassId === 'admin-boundary' &&
    feature.properties?.adminLevel === adminLevel);
  const ways = new Map<number, { areaIds: Set<string>; coordinates: [number, number][] }>();
  for (const region of regions) {
    const boundaryWays = region.properties?.adminBoundaryWays;
    if (!Array.isArray(boundaryWays)) continue;
    for (const item of boundaryWays) {
      if (!item || typeof item !== 'object') continue;
      const way = item as { wayId?: unknown; coordinates?: unknown };
      if (typeof way.wayId !== 'number' || !Array.isArray(way.coordinates)) continue;
      const coordinates = way.coordinates.filter((point): point is [number, number] =>
        Array.isArray(point) && point.length >= 2 && typeof point[0] === 'number' && typeof point[1] === 'number');
      if (coordinates.length < 2) continue;
      const shared = ways.get(way.wayId) ?? { areaIds: new Set<string>(), coordinates };
      shared.areaIds.add(region.featureId);
      ways.set(way.wayId, shared);
    }
  }

  return [...ways.entries()]
    .filter(([, way]) => way.areaIds.size >= 2)
    .sort(([left], [right]) => left - right)
    .map(([wayId, way]) => ({
      featureId: `osm:admin-border/${adminLevel}/${wayId}`,
      featureClassId,
      label,
      longitude: way.coordinates.reduce((sum, point) => sum + point[0], 0) / way.coordinates.length,
      latitude: way.coordinates.reduce((sum, point) => sum + point[1], 0) / way.coordinates.length,
      geometrySupport: 'line',
      coverage: 'approximate',
      properties: { adminLevel, sharedAreaIds: [...way.areaIds].sort() },
      geometry: { type: 'MultiLineString', coordinates: [way.coordinates] }
    }));
}

function segmentsIntersect(
  a: [number, number], b: [number, number], c: [number, number], d: [number, number]
): boolean {
  const cross = (p: [number, number], q: [number, number], r: [number, number]) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const onSegment = (p: [number, number], q: [number, number], r: [number, number]) =>
    Math.min(p[0], r[0]) <= q[0] && q[0] <= Math.max(p[0], r[0]) &&
    Math.min(p[1], r[1]) <= q[1] && q[1] <= Math.max(p[1], r[1]);
  const first = cross(a, b, c);
  const second = cross(a, b, d);
  const third = cross(c, d, a);
  const fourth = cross(c, d, b);
  if (((first > 0 && second < 0) || (first < 0 && second > 0)) &&
    ((third > 0 && fourth < 0) || (third < 0 && fourth > 0))) return true;
  return (first === 0 && onSegment(a, c, b)) || (second === 0 && onSegment(a, d, b)) ||
    (third === 0 && onSegment(c, a, d)) || (fourth === 0 && onSegment(c, b, d));
}

export function lineGeometryIntersectsPolygon(lineGeometry: GeoJsonGeometryModel | undefined, polygon: GeoJsonGeometryModel): boolean {
  if (!lineGeometry || (lineGeometry.type !== 'LineString' && lineGeometry.type !== 'MultiLineString')) return false;
  const rawLines = lineGeometry.type === 'LineString'
    ? [lineGeometry.coordinates]
    : lineGeometry.coordinates;
  if (!Array.isArray(rawLines)) return false;
  const polygonRings = polygonRingsFromGeometry(polygon).flat();
  for (const rawLine of rawLines) {
    if (!Array.isArray(rawLine)) continue;
    const line = rawLine.filter((point): point is [number, number] =>
      Array.isArray(point) && point.length >= 2 && typeof point[0] === 'number' && typeof point[1] === 'number');
    if (line.some((point) => pointInGeometry(point, polygon))) return true;
    for (let lineIndex = 0; lineIndex < line.length - 1; lineIndex += 1) {
      for (const ring of polygonRings) {
        for (let ringIndex = 0; ringIndex < ring.length - 1; ringIndex += 1) {
          if (segmentsIntersect(line[lineIndex]!, line[lineIndex + 1]!, ring[ringIndex]!, ring[ringIndex + 1]!)) return true;
        }
      }
    }
  }
  return false;
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

export function distanceToFeatureMeters(
  point: [number, number],
  feature: {
    geometry?: GeoJsonGeometryModel;
    longitude?: number;
    latitude?: number;
    representativePoint?: { longitude: number; latitude: number };
  }
): number | undefined {
  if (feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') {
    const rawLines = feature.geometry.type === 'LineString'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
    if (!Array.isArray(rawLines)) return undefined;
    const segments: Ring[] = [];
    for (const rawLine of rawLines) {
      if (!Array.isArray(rawLine)) continue;
      const coordinates = rawLine.filter((value): value is [number, number] =>
        Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number');
      if (coordinates.length >= 2) segments.push(coordinates);
    }
    return distanceToCoordinateLinesMeters(point, segments);
  }
  if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
    const rings = polygonRingsFromGeometry(feature.geometry).flat();
    return distanceToCoordinateLinesMeters(point, rings);
  }
  const featurePoint = feature.representativePoint
    ? [feature.representativePoint.longitude, feature.representativePoint.latitude] as [number, number]
    : typeof feature.longitude === 'number' && typeof feature.latitude === 'number'
      ? [feature.longitude, feature.latitude] as [number, number]
      : undefined;
  return featurePoint ? haversineDistanceMeters(point, featurePoint) : undefined;
}

function distanceToCoordinateLinesMeters(point: [number, number], lines: [number, number][][]): number | undefined {
  const latitudeRadians = point[1] * Math.PI / 180;
  const metersPerDegreeLatitude = 111_132;
  const metersPerDegreeLongitude = 111_320 * Math.cos(latitudeRadians);
  let minimum = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    for (let index = 0; index < line.length - 1; index += 1) {
      const left = line[index]!;
      const right = line[index + 1]!;
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

function haversineDistanceMeters(left: [number, number], right: [number, number]): number {
  const earthRadiusMeters = 6_371_008.8;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLatitude = toRadians(right[1] - left[1]);
  const deltaLongitude = toRadians(right[0] - left[0]);
  const latitudeA = toRadians(left[1]);
  const latitudeB = toRadians(right[1]);
  const haversine = Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}
