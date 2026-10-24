import type {
  GeoJsonGeometryModel,
  QuestionFeatureDatasetModel,
  QuestionFeatureRecordModel
} from '../../../shared-types/src/index.ts';

import { geometryBoundingBox, pointInGeometry } from '../geometry/geojson.ts';

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
const OSM_SOURCE_VERSION = 'overpass-bbox-center-v1';

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
  return Object.hasOwn(SELECTORS_BY_FEATURE_CLASS, featureClassId);
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

interface OverpassElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown };
  tags?: Record<string, unknown>;
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
    for (const featureClassId of [...new Set(request.featureClassIds)]) {
      const selectors = SELECTORS_BY_FEATURE_CLASS[featureClassId];
      if (!selectors) continue;
      const query = queryFor(selectors, box);
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
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

    if ([...new Set(request.featureClassIds)].every((featureClassId) => !SELECTORS_BY_FEATURE_CLASS[featureClassId])) return undefined;
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
