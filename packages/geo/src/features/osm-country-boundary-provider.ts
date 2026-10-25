import type { GeoJsonGeometryModel, QuestionFeatureDatasetModel } from '../../../shared-types/src/index.ts';
import { geometryHasArea } from '../geometry/geojson.ts';

const NOMINATIM_LOOKUP_URL = 'https://nominatim.openstreetmap.org/lookup';
const NOMINATIM_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';
const COUNTRY_BOUNDARY_SOURCE_VERSION = 'nominatim-country-boundary-v1';

interface NominatimBoundaryResult {
  osm_type?: unknown;
  osm_id?: unknown;
  addresstype?: unknown;
  name?: unknown;
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
  geojson?: unknown;
}

export interface CountryBoundaryDataProvider {
  loadCountryBoundaries(osmRegionIds: string[]): Promise<QuestionFeatureDatasetModel | undefined>;
}

export interface OpenStreetMapCountryBoundaryProviderOptions {
  endpoint?: string;
  fetch?: typeof fetch;
  now?: () => string;
  cacheMilliseconds?: number;
  minimumRequestIntervalMs?: number;
}

function parseOsmRegionId(value: string): { type: 'relation' | 'way'; id: number; nominatimId: string } | undefined {
  const match = /^osm:(relation|way):(\d+)$/.exec(value);
  if (!match) return undefined;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return undefined;
  return { type: match[1] as 'relation' | 'way', id, nominatimId: `${match[1] === 'relation' ? 'R' : 'W'}${id}` };
}

function asGeometry(value: unknown): GeoJsonGeometryModel | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const geometry = value as GeoJsonGeometryModel;
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return undefined;
  return geometryHasArea(geometry) ? geometry : undefined;
}

function asFiniteCoordinate(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstBoundaryCoordinate(geometry: GeoJsonGeometryModel): [number, number] | undefined {
  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates)) return undefined;
  let coordinate: unknown;
  if (geometry.type === 'Polygon') {
    const ring = coordinates[0];
    if (Array.isArray(ring)) coordinate = ring[0];
  } else if (geometry.type === 'MultiPolygon') {
    const polygon = coordinates[0];
    const ring = Array.isArray(polygon) ? polygon[0] : undefined;
    if (Array.isArray(ring)) coordinate = ring[0];
  }
  if (!Array.isArray(coordinate) || coordinate.length < 2) return undefined;
  const longitude = Number(coordinate[0]);
  const latitude = Number(coordinate[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return undefined;
  return [longitude, latitude];
}

function toFeature(result: NominatimBoundaryResult, requestedId: string): QuestionFeatureDatasetModel['features'][number] | undefined {
  const parsedId = parseOsmRegionId(requestedId);
  const type = result.osm_type;
  const osmId = asFiniteCoordinate(result.osm_id);
  const geometry = asGeometry(result.geojson);
  if (!parsedId || type !== parsedId.type || osmId !== parsedId.id || result.addresstype !== 'country' || !geometry) return undefined;
  const boundaryCoordinate = firstBoundaryCoordinate(geometry);
  if (!boundaryCoordinate) return undefined;
  const label = typeof result.name === 'string' && result.name.trim()
    ? result.name.trim()
    : typeof result.display_name === 'string' ? result.display_name.trim() : requestedId;
  return {
    featureId: requestedId,
    featureClassId: 'country-boundary',
    label,
    latitude: boundaryCoordinate[1],
    longitude: boundaryCoordinate[0],
    geometrySupport: 'polygon',
    coverage: 'exact',
    geometry,
    properties: { osmType: type, osmId, addressType: 'country' }
  };
}

export class OpenStreetMapCountryBoundaryProvider implements CountryBoundaryDataProvider {
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => string;
  private readonly cacheMilliseconds: number;
  private readonly minimumRequestIntervalMs: number;
  private readonly cache = new Map<string, { expiresAt: number; feature: QuestionFeatureDatasetModel['features'][number] }>();
  private readonly inFlight = new Map<string, Promise<QuestionFeatureDatasetModel | undefined>>();
  private requestQueue: Promise<void> = Promise.resolve();
  private lastRequestStartedAt = 0;

  constructor(options: OpenStreetMapCountryBoundaryProviderOptions = {}) {
    this.endpoint = options.endpoint ?? NOMINATIM_LOOKUP_URL;
    this.fetcher = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date().toISOString());
    this.cacheMilliseconds = options.cacheMilliseconds ?? 24 * 60 * 60_000;
    this.minimumRequestIntervalMs = options.minimumRequestIntervalMs ?? 1_000;
  }

  async loadCountryBoundaries(osmRegionIds: string[]): Promise<QuestionFeatureDatasetModel | undefined> {
    const requestedIds = [...new Set(osmRegionIds)];
    if (requestedIds.length === 0 || requestedIds.length > 50 || requestedIds.some((id) => !parseOsmRegionId(id))) return undefined;
    const cacheKey = requestedIds.slice().sort().join(',');
    const existing = this.inFlight.get(cacheKey);
    if (existing) return existing;
    const request = this.loadUncachedOrCached(requestedIds);
    this.inFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async loadUncachedOrCached(requestedIds: string[]): Promise<QuestionFeatureDatasetModel | undefined> {
    const now = Date.parse(this.now());
    const features = new Map<string, QuestionFeatureDatasetModel['features'][number]>();
    const missing: string[] = [];
    for (const id of requestedIds) {
      const cached = this.cache.get(id);
      if (cached && cached.expiresAt > now) features.set(id, cached.feature);
      else missing.push(id);
    }

    if (missing.length > 0) {
      const osmIds = missing.map((id) => parseOsmRegionId(id)!.nominatimId).join(',');
      const url = new URL(this.endpoint);
      url.searchParams.set('osm_ids', osmIds);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('extratags', '1');
      url.searchParams.set('polygon_geojson', '1');
      const response = await this.fetchLookup(url.toString(), {
        headers: {
          accept: 'application/json',
          'user-agent': 'JetLagTheGame/0.1 (+https://github.com/Vojta7022/Jet-Lag-The-Game; OSM country boundary lookup)'
        },
        signal: AbortSignal.timeout(20_000)
      });
      if (!response.ok) throw new Error(`OpenStreetMap country boundary lookup failed with HTTP ${response.status}.`);
      const body: unknown = await response.json();
      if (!Array.isArray(body)) return undefined;
      const missingSet = new Set(missing);
      for (const value of body) {
        if (!value || typeof value !== 'object') continue;
        const result = value as NominatimBoundaryResult;
        const osmType = result.osm_type === 'relation' ? 'relation' : result.osm_type === 'way' ? 'way' : undefined;
        const osmId = asFiniteCoordinate(result.osm_id);
        const requestedId = osmType && osmId ? `osm:${osmType}:${osmId}` : undefined;
        if (!requestedId || !missingSet.has(requestedId)) continue;
        const feature = toFeature(result, requestedId);
        if (!feature) continue;
        features.set(requestedId, feature);
        this.cache.set(requestedId, { expiresAt: now + this.cacheMilliseconds, feature });
      }
    }

    if (features.size !== requestedIds.length) return undefined;
    return {
      source: 'OpenStreetMap',
      sourceUrl: NOMINATIM_ATTRIBUTION_URL,
      sourceVersion: COUNTRY_BOUNDARY_SOURCE_VERSION,
      retrievedAt: this.now(),
      coverage: 'exact',
      features: requestedIds.map((id) => features.get(id)!)
    };
  }

  private async fetchLookup(url: string, init: RequestInit): Promise<Response> {
    const request = this.requestQueue.then(async () => {
      const delayMs = this.minimumRequestIntervalMs - (Date.now() - this.lastRequestStartedAt);
      if (this.lastRequestStartedAt > 0 && delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
      this.lastRequestStartedAt = Date.now();
      return this.fetcher(url, { ...init, signal: init.signal ?? AbortSignal.timeout(20_000) });
    });
    this.requestQueue = request.then(() => undefined, () => undefined);
    return request;
  }
}
