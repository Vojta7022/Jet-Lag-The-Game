import type {
  GeoJsonGeometryModel,
  QuestionFeatureDatasetModel,
  QuestionFeatureRecordModel
} from '../../../shared-types/src/index.ts';

import {
  geometryBoundingBox,
  pointInGeometry,
  polygonRingsFromGeometry,
  representativePointFromGeometry
} from '../geometry/geojson.ts';
import {
  assembleAdministrativeBoundary,
  assembleAreaGeometry,
  buildSharedAdministrativeBorders,
  buildSharedAdministrativeBordersAtLevel,
  lineGeometryIntersectsPolygon
} from './admin-boundary-hierarchy.ts';

interface OSMTagSelector {
  tags: Record<string, string>;
}

export interface QuestionFeatureDataRequest {
  featureClassIds: string[];
  regionGeometry: GeoJsonGeometryModel;
}

export interface QuestionFeatureDataProvider {
  load(request: QuestionFeatureDataRequest): Promise<QuestionFeatureDatasetModel | undefined>;
}

export interface OpenStreetMapQuestionFeatureProviderOptions {
  endpoint?: string;
  fetch?: typeof fetch;
  now?: () => string;
  maxElements?: number;
  cacheMilliseconds?: number;
}

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
const OSM_SOURCE_VERSION = 'overpass-question-features-v8';
const OSM_REQUEST_HEADERS = {
  'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
  accept: 'application/json',
  'user-agent': 'JetLagTheGame/0.1 (+https://github.com/Vojta7022/Jet-Lag-The-Game; OSM question feature lookup)'
};
const ADMIN_FEATURE_CLASS_IDS = /^(?:[1-4](?:st|nd|rd|th)-admin-)/;
const ADMIN_BORDER_FEATURE_CLASS = /^a-([1-4])(?:st|nd|rd|th)-admin-border-/;
const INTERNATIONAL_BORDER_FEATURE_CLASS = 'an-international-border';
const STREET_PATH_FEATURE_CLASS = 'street-or-path';
const BODY_OF_WATER_FEATURE_CLASS = 'a-body-of-water';
const COASTLINE_FEATURE_CLASS = 'a-coastline';
const METRO_LINES_FEATURE_CLASS = 'metro-lines';
const EXCLUDED_POOL_TAGS = new Set(['pool', 'swimming_pool']);
const NON_WALKABLE_OR_INACTIVE_HIGHWAYS = new Set([
  'abandoned', 'construction', 'corridor', 'elevator', 'planned', 'platform', 'proposed', 'razed'
]);

const SELECTORS_BY_FEATURE_CLASS: Record<string, OSMTagSelector[]> = {
  'a-commercial-airport': [{ tags: { aeroway: 'aerodrome', scheduled_service: 'yes' } }],
  'commercial-airport': [{ tags: { aeroway: 'aerodrome', scheduled_service: 'yes' } }],
  'a-rail-station': [{ tags: { railway: 'station' } }, { tags: { railway: 'halt' } }],
  'rail-station': [{ tags: { railway: 'station' } }, { tags: { railway: 'halt' } }],
  'stations-name-length': [
    { tags: { railway: 'station' } },
    { tags: { railway: 'halt' } },
    { tags: { railway: 'tram_stop' } },
    { tags: { railway: 'subway_entrance' } },
    { tags: { public_transport: 'station' } }
  ],
  aquarium: [{ tags: { tourism: 'aquarium' } }],
  aquariums: [{ tags: { tourism: 'aquarium' } }],
  'a-museum': [{ tags: { tourism: 'museum' } }, { tags: { museum: '*' } }],
  museum: [{ tags: { tourism: 'museum' } }, { tags: { museum: '*' } }],
  museums: [{ tags: { tourism: 'museum' } }, { tags: { museum: '*' } }],
  'a-library': [{ tags: { amenity: 'library' } }],
  library: [{ tags: { amenity: 'library' } }],
  libraries: [{ tags: { amenity: 'library' } }],
  'foreign-consulate': [{ tags: { office: 'diplomatic', diplomatic: 'consulate' } }],
  'a-hospital': [{ tags: { amenity: 'hospital' } }],
  hospital: [{ tags: { amenity: 'hospital' } }],
  hospitals: [{ tags: { amenity: 'hospital' } }],
  'a-zoo': [{ tags: { tourism: 'zoo' } }],
  zoo: [{ tags: { tourism: 'zoo' } }],
  zoos: [{ tags: { tourism: 'zoo' } }],
  'a-park': [{ tags: { leisure: 'park' } }],
  park: [{ tags: { leisure: 'park' } }],
  'a-golf-course': [{ tags: { leisure: 'golf_course' } }],
  'golf-course': [{ tags: { leisure: 'golf_course' } }],
  'a-amusement-park': [{ tags: { tourism: 'theme_park' } }],
  'amusement-park': [{ tags: { tourism: 'theme_park' } }],
  'amusement-parks': [{ tags: { tourism: 'theme_park' } }],
  'a-movie-theater': [{ tags: { amenity: 'cinema' } }],
  'movie-theatre': [{ tags: { amenity: 'cinema' } }],
  'movie-theaters': [{ tags: { amenity: 'cinema' } }],
  mountain: [{ tags: { natural: 'peak' } }],
  'a-mountain': [{ tags: { natural: 'peak' } }],
  landmass: [{ tags: { place: 'island' } }, { tags: { place: 'islet' } }]
};

export function hasOpenStreetMapFeatureClass(featureClassId: string): boolean {
  return Object.hasOwn(SELECTORS_BY_FEATURE_CLASS, featureClassId) ||
    featureClassId === STREET_PATH_FEATURE_CLASS ||
    featureClassId === BODY_OF_WATER_FEATURE_CLASS ||
    featureClassId === COASTLINE_FEATURE_CLASS ||
    featureClassId === INTERNATIONAL_BORDER_FEATURE_CLASS ||
    featureClassId === METRO_LINES_FEATURE_CLASS ||
    ADMIN_FEATURE_CLASS_IDS.test(featureClassId) || ADMIN_BORDER_FEATURE_CLASS.test(featureClassId);
}

function escapeOverpassValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function queryFor(selectors: OSMTagSelector[], box: NonNullable<ReturnType<typeof geometryBoundingBox>>): string {
  const bbox = `(${box.minLat},${box.minLon},${box.maxLat},${box.maxLon})`;
  const clauses = selectors.flatMap(({ tags }) => {
    const tagQuery = Object.entries(tags)
      .map(([key, value]) => value === '*'
        ? `["${escapeOverpassValue(key)}"]`
        : `["${escapeOverpassValue(key)}"="${escapeOverpassValue(value)}"]`)
      .join('');
    return ['node', 'way', 'relation'].map((element) => `${element}${tagQuery}${bbox};`);
  });
  return `[out:json][timeout:25];(${clauses.join('')});out center tags;`;
}

function adminBoundaryQueryFor(
  box: NonNullable<ReturnType<typeof geometryBoundingBox>>,
  adminLevel?: number
): string {
  const bbox = `(${box.minLat},${box.minLon},${box.maxLat},${box.maxLon})`;
  const level = adminLevel ? `["admin_level"="${adminLevel}"]` : '';
  return `[out:json][timeout:25];rel["boundary"="administrative"]${level}${bbox};out geom tags;`;
}

function streetPathQueryFor(box: NonNullable<ReturnType<typeof geometryBoundingBox>>): string {
  return `[out:json][timeout:25];way["highway"](${box.minLat},${box.minLon},${box.maxLat},${box.maxLon});out body geom;`;
}

function bodyOfWaterQueryFor(box: NonNullable<ReturnType<typeof geometryBoundingBox>>): string {
  const bbox = `(${box.minLat},${box.minLon},${box.maxLat},${box.maxLon})`;
  const selectors = [['natural', 'water'], ['landuse', 'reservoir']];
  const clauses = selectors.flatMap(([key, value]) => ['way', 'relation'].map((element) =>
    `${element}["${key}"="${value}"]["name"]${bbox};`));
  clauses.push(`way["waterway"="river"]["name"]${bbox};`);
  return `[out:json][timeout:25];(${clauses.join('')});out geom tags;`;
}

function coastlineQueryFor(box: NonNullable<ReturnType<typeof geometryBoundingBox>>): string {
  return `[out:json][timeout:25];way["natural"="coastline"](${box.minLat},${box.minLon},${box.maxLat},${box.maxLon});out body geom tags;`;
}

function metroLinesQueryFor(box: NonNullable<ReturnType<typeof geometryBoundingBox>>): string {
  return `[out:json][timeout:25];relation["type"="route"]["route"="subway"](${box.minLat},${box.minLon},${box.maxLat},${box.maxLon});out body geom;`;
}

interface OverpassElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown };
  nodes?: unknown;
  geometry?: unknown;
  members?: unknown;
  tags?: Record<string, unknown>;
}

function geometryCoordinates(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((point) => {
    if (!point || typeof point !== 'object') return [];
    const coordinate = point as { lon?: unknown; lat?: unknown };
    return typeof coordinate.lon === 'number' && Number.isFinite(coordinate.lon) &&
      typeof coordinate.lat === 'number' && Number.isFinite(coordinate.lat)
      ? [[coordinate.lon, coordinate.lat] as [number, number]]
      : [];
  });
}

function metroLineFeatures(
  elements: unknown[],
  regionGeometry: GeoJsonGeometryModel
): { features: QuestionFeatureRecordModel[]; complete: boolean } {
  const groups = new Map<string, {
    featureId: string;
    label: string;
    network: string;
    ref?: string;
    relationIds: Set<number>;
    lines: Map<string, [number, number][]>;
  }>();
  let complete = true;

  for (const raw of elements) {
    if (!raw || typeof raw !== 'object') continue;
    const relation = raw as OverpassElement;
    const tags = relation.tags ?? {};
    if (relation.type !== 'relation' || typeof relation.id !== 'number' ||
      tags.type !== 'route' || tags.route !== 'subway') continue;
    const ref = typeof tags.ref === 'string' && tags.ref.trim() ? tags.ref.trim() : undefined;
    const name = typeof tags.name === 'string' && tags.name.trim() ? tags.name.trim() : undefined;
    const identity = ref ?? name;
    if (!identity || !Array.isArray(relation.members)) {
      complete = false;
      continue;
    }
    const network = [tags.network, tags.operator].find((value) => typeof value === 'string' && value.trim()) as string | undefined;
    const networkLabel = network?.trim() ?? 'Unspecified network';
    const groupKey = `${networkLabel.normalize('NFC').toLowerCase()}\u0000${identity.normalize('NFC').toLowerCase()}`;
    const group = groups.get(groupKey) ?? {
      featureId: `osm:metro-line/${encodeURIComponent(networkLabel)}:${encodeURIComponent(identity)}`,
      label: ref ? (network ? `${ref} (${network.trim()})` : ref) : name!,
      network: networkLabel,
      ref,
      relationIds: new Set<number>(),
      lines: new Map<string, [number, number][]>()
    };
    group.relationIds.add(relation.id);

    for (const memberValue of relation.members) {
      if (!memberValue || typeof memberValue !== 'object') continue;
      const member = memberValue as { type?: unknown; ref?: unknown; role?: unknown; geometry?: unknown };
      if (member.type !== 'way' || (member.role && !['forward', 'backward', 'route'].includes(String(member.role)))) continue;
      const line = geometryCoordinates(member.geometry);
      if (line.length < 2 || typeof member.ref !== 'number') {
        complete = false;
        continue;
      }
      const geometry: GeoJsonGeometryModel = { type: 'LineString', coordinates: line };
      if (!lineGeometryIntersectsPolygon(geometry, regionGeometry)) continue;
      const forwardKey = JSON.stringify(line);
      const reverseKey = JSON.stringify([...line].reverse());
      group.lines.set(forwardKey < reverseKey ? forwardKey : reverseKey, line);
    }
    groups.set(groupKey, group);
  }

  const features: QuestionFeatureRecordModel[] = [];
  for (const group of groups.values()) {
    const lines = [...group.lines.values()];
    if (lines.length === 0) continue;
    const coordinates = lines.length === 1 ? lines[0]! : lines;
    const geometry: GeoJsonGeometryModel = lines.length === 1
      ? { type: 'LineString', coordinates }
      : { type: 'MultiLineString', coordinates };
    const representative = lines[Math.floor(lines.length / 2)]?.[Math.floor((lines[Math.floor(lines.length / 2)]?.length ?? 1) / 2)];
    if (!representative) {
      complete = false;
      continue;
    }
    features.push({
      featureId: group.featureId,
      featureClassId: METRO_LINES_FEATURE_CLASS,
      label: group.label,
      longitude: representative[0],
      latitude: representative[1],
      geometry,
      geometrySupport: 'line',
      coverage: 'approximate',
      properties: {
        network: group.network,
        ref: group.ref,
        relationIds: [...group.relationIds].sort((left, right) => left - right)
      }
    });
  }

  return { features, complete };
}

function waterGeometryIntersectsRegion(geometry: GeoJsonGeometryModel, region: GeoJsonGeometryModel): boolean {
  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
    return lineGeometryIntersectsPolygon(geometry, region);
  }
  const waterPolygons = polygonRingsFromGeometry(geometry);
  if (waterPolygons.some((polygon) => polygon[0]?.some((point) => pointInGeometry(point, region)))) return true;
  const regionPolygons = polygonRingsFromGeometry(region);
  if (regionPolygons.some((polygon) => polygon[0]?.some((point) => pointInGeometry(point, geometry)))) return true;
  return waterPolygons.some((polygon) => polygon.some((ring) =>
    lineGeometryIntersectsPolygon({ type: 'LineString', coordinates: ring }, region)));
}

function bodyOfWaterFeatures(
  elements: unknown[],
  regionGeometry: GeoJsonGeometryModel
): { features: QuestionFeatureRecordModel[]; complete: boolean } {
  const features: QuestionFeatureRecordModel[] = [];
  let complete = true;
  for (const raw of elements) {
    if (!raw || typeof raw !== 'object') continue;
    const element = raw as OverpassElement;
    if ((element.type !== 'way' && element.type !== 'relation') || typeof element.id !== 'number') continue;
    const tags = element.tags ?? {};
    const isRiverCenterline = tags.waterway === 'river';
    const isWater = tags.natural === 'water' || tags.landuse === 'reservoir' || isRiverCenterline;
    if (!isWater || tags.leisure === 'swimming_pool' || EXCLUDED_POOL_TAGS.has(String(tags.water ?? ''))) continue;
    const label = [tags.name, tags['name:en'], tags.official_name]
      .find((value) => typeof value === 'string' && value.trim());
    if (typeof label !== 'string') continue;

    let geometry: GeoJsonGeometryModel | undefined;
    let lineRepresentative: [number, number] | undefined;
    if (element.type === 'way') {
      const line = geometryCoordinates(element.geometry);
      if (line.length >= 4 && line[0]![0] === line.at(-1)![0] && line[0]![1] === line.at(-1)![1]) {
        geometry = { type: 'Polygon', coordinates: [line] };
      } else if (isRiverCenterline && line.length >= 2) {
        geometry = { type: 'LineString', coordinates: line };
        lineRepresentative = line[Math.floor(line.length / 2)];
      }
    } else if (Array.isArray(element.members)) {
      const outerWays: [number, number][][] = [];
      const innerWays: [number, number][][] = [];
      for (const memberValue of element.members) {
        if (!memberValue || typeof memberValue !== 'object') continue;
        const member = memberValue as { type?: unknown; role?: unknown; geometry?: unknown };
        if (member.type !== 'way' || (member.role !== 'outer' && member.role !== 'inner')) continue;
        const line = geometryCoordinates(member.geometry);
        if (line.length < 2) continue;
        if (member.role === 'outer') outerWays.push(line);
        else innerWays.push(line);
      }
      geometry = assembleAreaGeometry(outerWays, innerWays);
    }
    if (!geometry) {
      complete = false;
      continue;
    }
    if (!waterGeometryIntersectsRegion(geometry, regionGeometry)) continue;
    const representative = lineRepresentative ?? representativePointFromGeometry(geometry);
    if (!representative) {
      complete = false;
      continue;
    }
    features.push({
      featureId: `osm:${element.type}/${element.id}`,
      featureClassId: BODY_OF_WATER_FEATURE_CLASS,
      label: label.trim(),
      longitude: representative[0],
      latitude: representative[1],
      geometry,
      geometrySupport: geometry.type === 'Polygon' || geometry.type === 'MultiPolygon' ? 'polygon' : 'line',
      coverage: 'approximate',
      properties: { osmType: element.type, osmId: element.id, water: tags.water, waterway: tags.waterway }
    });
  }
  return { features, complete };
}

function coastlineFeatures(elements: unknown[], regionGeometry: GeoJsonGeometryModel): QuestionFeatureRecordModel[] {
  const features: QuestionFeatureRecordModel[] = [];
  for (const raw of elements) {
    if (!raw || typeof raw !== 'object') continue;
    const element = raw as OverpassElement;
    if (element.type !== 'way' || typeof element.id !== 'number' || element.tags?.natural !== 'coastline') continue;
    const coordinates = geometryCoordinates(element.geometry);
    if (coordinates.length < 2) continue;
    const geometry: GeoJsonGeometryModel = { type: 'LineString', coordinates };
    if (!lineGeometryIntersectsPolygon(geometry, regionGeometry)) continue;
    features.push({
      featureId: `osm:way/${element.id}`,
      featureClassId: COASTLINE_FEATURE_CLASS,
      label: 'Mapped coastline',
      longitude: coordinates[0]![0],
      latitude: coordinates[0]![1],
      geometry,
      geometrySupport: 'line',
      coverage: 'approximate',
      properties: { osmType: 'way', osmId: element.id, natural: 'coastline' }
    });
  }
  return features;
}

interface StreetWay {
  id: number;
  name?: string;
  nodeIds: number[];
  coordinates: [number, number][];
}

function streetWays(elements: unknown[]): StreetWay[] {
  return elements.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const element = raw as OverpassElement;
    if (element.type !== 'way' || typeof element.id !== 'number' ||
      !Array.isArray(element.nodes) || !Array.isArray(element.geometry)) return [];
    const nodeIds = element.nodes.filter((id): id is number => typeof id === 'number');
    const coordinates = element.geometry.flatMap((point) => {
      if (!point || typeof point !== 'object') return [];
      const geometryPoint = point as { lat?: unknown; lon?: unknown };
      return typeof geometryPoint.lon === 'number' && typeof geometryPoint.lat === 'number'
        ? [[geometryPoint.lon, geometryPoint.lat] as [number, number]]
        : [];
    });
    const highway = element.tags?.highway;
    if (typeof highway !== 'string' || NON_WALKABLE_OR_INACTIVE_HIGHWAYS.has(highway) ||
      nodeIds.length < 2 || coordinates.length !== nodeIds.length) return [];
    const rawName = element.tags?.name;
    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim().normalize('NFC') : undefined;
    return [{ id: element.id, name, nodeIds, coordinates }];
  });
}

function streetPathFeatures(elements: unknown[], regionGeometry: GeoJsonGeometryModel): QuestionFeatureRecordModel[] {
  const ways = streetWays(elements);
  const waysByNode = new Map<number, StreetWay[]>();
  for (const way of ways) {
    for (const nodeId of new Set(way.nodeIds)) {
      const incident = waysByNode.get(nodeId) ?? [];
      incident.push(way);
      waysByNode.set(nodeId, incident);
    }
  }

  const parent = new Map<number, number>(ways.map((way) => [way.id, way.id]));
  const find = (id: number): number => {
    const root = parent.get(id)!;
    if (root === id) return id;
    const representative = find(root);
    parent.set(id, representative);
    return representative;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(Math.max(leftRoot, rightRoot), Math.min(leftRoot, rightRoot));
  };

  for (const incidentWays of waysByNode.values()) {
    const namedByName = new Map<string, StreetWay[]>();
    for (const way of incidentWays) {
      if (!way.name) continue;
      const connected = namedByName.get(way.name) ?? [];
      connected.push(way);
      namedByName.set(way.name, connected);
    }
    for (const connected of namedByName.values()) {
      for (const way of connected.slice(1)) union(connected[0]!.id, way.id);
    }
  }

  const namedGroups = new Map<string, StreetWay[]>();
  for (const way of ways) {
    if (!way.name) continue;
    const key = `${way.name}\u0000${find(way.id)}`;
    const group = namedGroups.get(key) ?? [];
    group.push(way);
    namedGroups.set(key, group);
  }

  const features: QuestionFeatureRecordModel[] = [];
  const addFeature = (featureId: string, label: string, lines: [number, number][][], osmWayIds: number[]) => {
    if (lines.length === 0 || lines.some((line) => line.length < 2)) return;
    const geometry: GeoJsonGeometryModel = lines.length === 1
      ? { type: 'LineString', coordinates: lines[0]! }
      : { type: 'MultiLineString', coordinates: lines };
    if (!lineGeometryIntersectsPolygon(geometry, regionGeometry)) return;
    const [longitude, latitude] = lines[0]![0]!;
    features.push({
      featureId,
      featureClassId: STREET_PATH_FEATURE_CLASS,
      label,
      latitude,
      longitude,
      geometry,
      geometrySupport: 'line',
      coverage: 'approximate',
      properties: { osmWayIds }
    });
  };

  for (const group of namedGroups.values()) {
    const orderedWays = group.sort((left, right) => left.id - right.id);
    const wayIds = orderedWays.map((way) => way.id);
    addFeature(
      `osm:street-path/named/${wayIds.join('-')}`,
      orderedWays[0]!.name!,
      orderedWays.map((way) => way.coordinates),
      wayIds
    );
  }

  for (const way of ways.filter((candidate) => !candidate.name)) {
    const boundaries = [0];
    for (let index = 1; index < way.nodeIds.length - 1; index += 1) {
      if ((waysByNode.get(way.nodeIds[index]!)?.length ?? 0) > 1) boundaries.push(index);
    }
    boundaries.push(way.nodeIds.length - 1);
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index]!;
      const end = boundaries[index + 1]!;
      const line = way.coordinates.slice(start, end + 1);
      addFeature(
        `osm:street-path/unnamed/${way.id}/${way.nodeIds[start]}-${way.nodeIds[end]}`,
        'Unnamed street or path',
        [line],
        [way.id]
      );
    }
  }
  return features;
}

function asFeature(
  element: OverpassElement,
  featureClassId: string,
  regionGeometry: GeoJsonGeometryModel
): QuestionFeatureRecordModel | undefined {
  if ((element.type !== 'node' && element.type !== 'way' && element.type !== 'relation') || typeof element.id !== 'number') return undefined;
  const latitude = typeof element.lat === 'number' ? element.lat : element.center?.lat;
  const longitude = typeof element.lon === 'number' ? element.lon : element.center?.lon;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !pointInGeometry([longitude, latitude], regionGeometry)) return undefined;
  const tags = element.tags ?? {};
  const labelCandidates = featureClassId === 'stations-name-length'
    ? [tags.name, tags['name:en'], tags.official_name]
    : [tags.name, tags['name:en'], tags.official_name, tags.ref];
  const label = labelCandidates.find((value) => typeof value === 'string' && value.trim());
  if (featureClassId === 'stations-name-length' && typeof label !== 'string') return undefined;
  return {
    featureId: `osm:${element.type}/${element.id}`,
    featureClassId,
    label: typeof label === 'string' ? label.trim() : featureClassId.replaceAll('-', ' '),
    latitude,
    longitude,
    geometrySupport: element.type === 'node' ? 'point' : 'mixed',
    coverage: 'approximate',
    properties: { osmType: element.type, osmId: element.id }
  };
}

export class OpenStreetMapQuestionFeatureProvider implements QuestionFeatureDataProvider {
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => string;
  private readonly maxElements: number;
  private readonly cacheMilliseconds: number;
  private readonly cache = new Map<string, { expiresAt: number; dataset: QuestionFeatureDatasetModel }>();
  private readonly inFlight = new Map<string, Promise<QuestionFeatureDatasetModel | undefined>>();

  constructor(options: OpenStreetMapQuestionFeatureProviderOptions = {}) {
    this.endpoint = options.endpoint ?? OVERPASS_ENDPOINT;
    this.fetcher = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxElements = options.maxElements ?? 20_000;
    this.cacheMilliseconds = options.cacheMilliseconds ?? 5 * 60_000;
  }

  async load(request: QuestionFeatureDataRequest): Promise<QuestionFeatureDatasetModel | undefined> {
    const key = JSON.stringify({
      featureClassIds: [...new Set(request.featureClassIds)].sort(),
      regionGeometry: request.regionGeometry
    });
    const nowMs = Date.parse(this.now());
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > nowMs) return cached.dataset;
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const requestPromise = this.loadUncached(request).then((dataset) => {
      if (dataset) this.cache.set(key, { dataset, expiresAt: nowMs + this.cacheMilliseconds });
      return dataset;
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, requestPromise);
    return requestPromise;
  }

  private async loadUncached(request: QuestionFeatureDataRequest): Promise<QuestionFeatureDatasetModel | undefined> {
    const box = geometryBoundingBox(request.regionGeometry);
    if (!box) return undefined;

    const featuresById = new Map<string, QuestionFeatureRecordModel>();
    const featureClassIds = [...new Set(request.featureClassIds)];
    const needsInternationalBorders = featureClassIds.includes(INTERNATIONAL_BORDER_FEATURE_CLASS);
    const needsAdminBoundaries = needsInternationalBorders || featureClassIds.some((id) =>
      ADMIN_FEATURE_CLASS_IDS.test(id) || ADMIN_BORDER_FEATURE_CLASS.test(id));
    const adminBoundaries: QuestionFeatureRecordModel[] = [];
    if (needsAdminBoundaries) {
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: OSM_REQUEST_HEADERS,
        body: `data=${encodeURIComponent(adminBoundaryQueryFor(box, needsInternationalBorders ? 2 : undefined))}`,
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) throw new Error(`OpenStreetMap boundary lookup failed with HTTP ${response.status}.`);
      const raw = await response.text();
      if (new TextEncoder().encode(raw).byteLength > 8_000_000) throw new Error('OpenStreetMap boundary data exceeds the 8 MB safety limit.');
      const parsed = JSON.parse(raw) as { elements?: unknown };
      if (!Array.isArray(parsed.elements)) throw new Error('OpenStreetMap boundary response did not contain elements.');
      if (parsed.elements.length > this.maxElements) throw new Error(`OpenStreetMap returned more than ${this.maxElements} administrative boundaries for this question.`);
      for (const element of parsed.elements) {
        const feature = assembleAdministrativeBoundary(element);
        if (feature) {
          featuresById.set(feature.featureId, feature);
          adminBoundaries.push(feature);
        }
      }
      for (const featureClassId of featureClassIds) {
        if (featureClassId === INTERNATIONAL_BORDER_FEATURE_CLASS) {
          for (const border of buildSharedAdministrativeBordersAtLevel(
            adminBoundaries,
            2,
            INTERNATIONAL_BORDER_FEATURE_CLASS,
            'International Border',
            true
          )) {
            if (lineGeometryIntersectsPolygon(border.geometry, request.regionGeometry)) {
              featuresById.set(border.featureId, border);
            }
          }
          continue;
        }
        const match = featureClassId.match(ADMIN_BORDER_FEATURE_CLASS);
        if (!match) continue;
        const ordinal = Number(match[1]);
        const label = featureClassId.replaceAll('-', ' ');
        for (const border of buildSharedAdministrativeBorders(adminBoundaries, ordinal, featureClassId, label)) {
          if (lineGeometryIntersectsPolygon(border.geometry, request.regionGeometry)) {
            featuresById.set(border.featureId, border);
          }
        }
      }
    }

    for (const featureClassId of featureClassIds) {
      if (featureClassId === METRO_LINES_FEATURE_CLASS) {
        const response = await this.fetcher(this.endpoint, {
          method: 'POST',
          headers: OSM_REQUEST_HEADERS,
          body: `data=${encodeURIComponent(metroLinesQueryFor(box))}`,
          signal: AbortSignal.timeout(30_000)
        });
        if (!response.ok) throw new Error(`OpenStreetMap metro-line lookup failed with HTTP ${response.status}.`);
        const raw = await response.text();
        if (new TextEncoder().encode(raw).byteLength > 8_000_000) throw new Error('OpenStreetMap metro-line data exceeds the 8 MB safety limit.');
        const parsed = JSON.parse(raw) as { elements?: unknown };
        if (!Array.isArray(parsed.elements)) throw new Error('OpenStreetMap metro-line response did not contain elements.');
        if (parsed.elements.length > this.maxElements) throw new Error(`OpenStreetMap returned more than ${this.maxElements} metro-line relations for this question.`);
        const metroLines = metroLineFeatures(parsed.elements, request.regionGeometry);
        if (!metroLines.complete) return undefined;
        for (const feature of metroLines.features) featuresById.set(feature.featureId, feature);
        continue;
      }
      if (featureClassId === COASTLINE_FEATURE_CLASS) {
        const response = await this.fetcher(this.endpoint, {
          method: 'POST',
          headers: OSM_REQUEST_HEADERS,
          body: `data=${encodeURIComponent(coastlineQueryFor(box))}`,
          signal: AbortSignal.timeout(30_000)
        });
        if (!response.ok) throw new Error(`OpenStreetMap coastline lookup failed with HTTP ${response.status}.`);
        const raw = await response.text();
        if (new TextEncoder().encode(raw).byteLength > 8_000_000) throw new Error('OpenStreetMap coastline data exceeds the 8 MB safety limit.');
        const parsed = JSON.parse(raw) as { elements?: unknown };
        if (!Array.isArray(parsed.elements)) throw new Error('OpenStreetMap coastline response did not contain elements.');
        if (parsed.elements.length > this.maxElements) throw new Error(`OpenStreetMap returned more than ${this.maxElements} coastline segments for this question.`);
        for (const feature of coastlineFeatures(parsed.elements, request.regionGeometry)) featuresById.set(feature.featureId, feature);
        continue;
      }
      if (featureClassId === BODY_OF_WATER_FEATURE_CLASS) {
        const response = await this.fetcher(this.endpoint, {
          method: 'POST',
          headers: OSM_REQUEST_HEADERS,
          body: `data=${encodeURIComponent(bodyOfWaterQueryFor(box))}`,
          signal: AbortSignal.timeout(30_000)
        });
        if (!response.ok) throw new Error(`OpenStreetMap water lookup failed with HTTP ${response.status}.`);
        const raw = await response.text();
        if (new TextEncoder().encode(raw).byteLength > 8_000_000) throw new Error('OpenStreetMap water data exceeds the 8 MB safety limit.');
        const parsed = JSON.parse(raw) as { elements?: unknown };
        if (!Array.isArray(parsed.elements)) throw new Error('OpenStreetMap water response did not contain elements.');
        if (parsed.elements.length > this.maxElements) throw new Error(`OpenStreetMap returned more than ${this.maxElements} named water features for this question.`);
        const water = bodyOfWaterFeatures(parsed.elements, request.regionGeometry);
        if (!water.complete) return undefined;
        for (const feature of water.features) featuresById.set(feature.featureId, feature);
        continue;
      }
      if (featureClassId === STREET_PATH_FEATURE_CLASS) {
        const response = await this.fetcher(this.endpoint, {
          method: 'POST',
          headers: OSM_REQUEST_HEADERS,
          body: `data=${encodeURIComponent(streetPathQueryFor(box))}`,
          signal: AbortSignal.timeout(30_000)
        });
        if (!response.ok) throw new Error(`OpenStreetMap street/path lookup failed with HTTP ${response.status}.`);
        const raw = await response.text();
        if (new TextEncoder().encode(raw).byteLength > 8_000_000) throw new Error('OpenStreetMap street/path data exceeds the 8 MB safety limit.');
        const parsed = JSON.parse(raw) as { elements?: unknown };
        if (!Array.isArray(parsed.elements)) throw new Error('OpenStreetMap street/path response did not contain elements.');
        if (parsed.elements.length > this.maxElements) throw new Error(`OpenStreetMap returned more than ${this.maxElements} street/path ways for this question.`);
        for (const feature of streetPathFeatures(parsed.elements, request.regionGeometry)) {
          featuresById.set(feature.featureId, feature);
        }
        continue;
      }
      const selectors = SELECTORS_BY_FEATURE_CLASS[featureClassId];
      if (!selectors) continue;
      const query = queryFor(selectors, box);
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: OSM_REQUEST_HEADERS,
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) throw new Error(`OpenStreetMap feature lookup failed with HTTP ${response.status}.`);
      const raw = await response.text();
      if (new TextEncoder().encode(raw).byteLength > 8_000_000) throw new Error('OpenStreetMap feature data exceeds the 8 MB safety limit.');
      const parsed = JSON.parse(raw) as { elements?: unknown };
      if (!Array.isArray(parsed.elements)) throw new Error('OpenStreetMap feature response did not contain elements.');
      if (parsed.elements.length > this.maxElements) throw new Error(`OpenStreetMap returned more than ${this.maxElements} features for this question.`);
      for (const element of parsed.elements) {
        if (!element || typeof element !== 'object') continue;
        const feature = asFeature(element as OverpassElement, featureClassId, request.regionGeometry);
        if (feature) featuresById.set(feature.featureId, feature);
      }
    }

    if (featureClassIds.every((featureClassId) =>
      !SELECTORS_BY_FEATURE_CLASS[featureClassId] && !ADMIN_FEATURE_CLASS_IDS.test(featureClassId) &&
      !ADMIN_BORDER_FEATURE_CLASS.test(featureClassId) && featureClassId !== STREET_PATH_FEATURE_CLASS &&
      featureClassId !== INTERNATIONAL_BORDER_FEATURE_CLASS && featureClassId !== BODY_OF_WATER_FEATURE_CLASS &&
      featureClassId !== COASTLINE_FEATURE_CLASS && featureClassId !== METRO_LINES_FEATURE_CLASS)) return undefined;
    return {
      source: 'OpenStreetMap',
      sourceUrl: OSM_COPYRIGHT_URL,
      sourceVersion: OSM_SOURCE_VERSION,
      retrievedAt: this.now(),
      coverage: 'approximate',
      features: [...featuresById.values()].sort((left, right) => left.featureId.localeCompare(right.featureId))
    };
  }
}
