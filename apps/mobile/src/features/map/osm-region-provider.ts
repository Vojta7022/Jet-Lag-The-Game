import type { GeoJsonGeometryModel } from '../../../../../packages/shared-types/src/index.ts';

import {
  type RegionBoundaryProvider,
  RegionProviderResponseError
} from './region-provider.ts';
import {
  createRegionProviderJsonExecutor,
  type RegionProviderJsonExecutor
} from './region-provider-http.ts';
import type {
  PlayableRegionCatalogEntry,
  RegionProviderMetadata,
  RegionSourceUsageMode
} from './region-types.ts';

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
}

interface NominatimSearchItem {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  class?: string;
  type?: string;
  addresstype?: string;
  display_name?: string;
  namedetails?: Record<string, unknown>;
  address?: NominatimAddress;
  geojson?: GeoJsonGeometryModel;
  importance?: number;
  place_rank?: number;
}

interface NominatimProviderOptions {
  baseUrl: string;
  email?: string;
  providerLabel?: string;
  providerAttributionUrl?: string;
  usageMode?: RegionSourceUsageMode;
  throttleMs: number;
  cacheTtlMs: number;
  requestTimeoutMs?: number;
  fetchFn?: typeof fetch;
  requestExecutor?: RegionProviderJsonExecutor;
}

const relevantBoundaryTypes = new Set([
  'administrative',
  'city',
  'town',
  'village',
  'municipality',
  'county',
  'state',
  'province',
  'region',
  'city_district',
  'district'
]);

function safeTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function safeLowerCase(value: unknown): string | undefined {
  return safeTrimmedString(value)?.toLowerCase();
}

function normalizeQueryKey(value: unknown): string {
  const safeValue = safeTrimmedString(value);
  if (!safeValue) {
    return '';
  }

  return safeValue
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isPolygonGeometry(geometry: GeoJsonGeometryModel | undefined): geometry is GeoJsonGeometryModel {
  return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
}

function isRelevantSearchItem(item: NominatimSearchItem): boolean {
  const resultClass = safeLowerCase(item.class);
  const resultType = safeLowerCase(item.type);
  if (!resultType) {
    return false;
  }

  if (resultClass === 'boundary' && relevantBoundaryTypes.has(resultType)) {
    return true;
  }

  if (resultClass === 'place' && relevantBoundaryTypes.has(resultType)) {
    return true;
  }

  return relevantBoundaryTypes.has(resultType);
}

function toPlayableRegionKind(item: NominatimSearchItem): 'city' | 'admin_region' {
  const resultType = safeLowerCase(item.type);
  if (resultType === 'city' || resultType === 'town' || resultType === 'village' || resultType === 'municipality') {
    return 'city';
  }

  return 'admin_region';
}

function buildParentRegionLabel(address: NominatimAddress | undefined, displayName: string): string | undefined {
  const label =
    safeTrimmedString(address?.state) ??
    safeTrimmedString(address?.county) ??
    safeTrimmedString(address?.region);
  if (!label || label === displayName) {
    return undefined;
  }

  return label;
}

function buildSearchAliases(item: NominatimSearchItem): string[] {
  const namedetails = item.namedetails ?? {};
  return Array.from(new Set(
    Object.values(namedetails)
      .concat([
        namedetails.name,
        namedetails['name:en'],
        namedetails['name:cs'],
        namedetails['name:de']
      ])
      .map((value) => safeTrimmedString(value))
      .filter((value): value is string => Boolean(value))
  ));
}

function buildRegionId(item: NominatimSearchItem): string {
  const osmType = safeLowerCase(item.osm_type) ?? 'unknown';
  const osmId =
    Number.isFinite(item.osm_id) ? String(item.osm_id) :
    Number.isFinite(item.place_id) ? `place-${item.place_id}` :
    'unidentified';
  return `osm:${osmType}:${osmId}`;
}

function buildProviderMetadata(
  item: NominatimSearchItem,
  boundarySource: RegionProviderMetadata['boundarySource'],
  providerLabel: string
): RegionProviderMetadata {
  return {
    providerKey: 'osm_nominatim',
    providerLabel,
    osmType: safeTrimmedString(item.osm_type),
    osmId: Number.isFinite(item.osm_id) ? item.osm_id : undefined,
    resultClass: safeTrimmedString(item.class),
    resultType: safeTrimmedString(item.type),
    placeRank: Number.isFinite(item.place_rank) ? item.place_rank : undefined,
    importance: Number.isFinite(item.importance) ? item.importance : undefined,
    boundarySource
  };
}

function buildFallbackDisplayName(item: NominatimSearchItem): string {
  const address = item.address;
  return (
    safeTrimmedString(item.namedetails?.['name:en']) ??
    safeTrimmedString(item.namedetails?.name) ??
    safeTrimmedString(item.display_name)?.split(',')[0]?.trim() ??
    safeTrimmedString(address?.city) ??
    safeTrimmedString(address?.town) ??
    safeTrimmedString(address?.village) ??
    safeTrimmedString(address?.municipality) ??
    safeTrimmedString(address?.state) ??
    safeTrimmedString(address?.county) ??
    safeTrimmedString(address?.region) ??
    safeTrimmedString(address?.country) ??
    'Unnamed region'
  );
}

function buildSummary(item: NominatimSearchItem, displayName: string): string {
  const summary = safeTrimmedString(item.display_name);
  if (summary) {
    return summary;
  }

  const parts = Array.from(new Set([
    displayName,
    safeTrimmedString(item.address?.state),
    safeTrimmedString(item.address?.country)
  ].filter((value): value is string => Boolean(value))));

  return parts.join(', ') || displayName;
}

function mapSearchItemToRegion(
  item: NominatimSearchItem,
  geometry: GeoJsonGeometryModel,
  boundarySource: RegionProviderMetadata['boundarySource'],
  providerLabel: string
): PlayableRegionCatalogEntry {
  const displayName = buildFallbackDisplayName(item);

  return {
    regionId: buildRegionId(item),
    displayName,
    regionKind: toPlayableRegionKind(item),
    summary: buildSummary(item, displayName),
    featureDatasetRefs: ['osm-nominatim', 'osm-admin-boundaries'],
    geometry,
    sourceKind: 'provider_catalog',
    sourceLabel: providerLabel,
    searchAliases: buildSearchAliases(item),
    countryLabel: safeTrimmedString(item.address?.country),
    parentRegionLabel: buildParentRegionLabel(item.address, displayName),
    providerMetadata: buildProviderMetadata(item, boundarySource, providerLabel)
  };
}

export function createNominatimRegionProvider(options: NominatimProviderOptions): RegionBoundaryProvider {
  const providerLabel = safeTrimmedString(options.providerLabel) ?? 'OpenStreetMap Nominatim';
  const requestExecutor = options.requestExecutor ?? createRegionProviderJsonExecutor({
    baseUrl: options.baseUrl,
    throttleMs: options.throttleMs,
    timeoutMs: options.requestTimeoutMs ?? 12000,
    fetchFn: options.fetchFn,
    defaultHeaders: {
      'Accept-Language': 'en'
    }
  });
  const searchCache = new Map<string, { expiresAt: number; value: PlayableRegionCatalogEntry[] }>();
  const regionCache = new Map<string, { expiresAt: number; value: PlayableRegionCatalogEntry }>();
  const itemCache = new Map<string, { expiresAt: number; value: NominatimSearchItem }>();
  const searchInFlight = new Map<string, Promise<PlayableRegionCatalogEntry[]>>();
  const regionInFlight = new Map<string, Promise<PlayableRegionCatalogEntry | undefined>>();

  function buildAttributionNotice(): string {
    if (options.usageMode === 'proxy_backend_recommended') {
      return 'Requests are using a configurable Nominatim-compatible base URL. Keep server-side caching, rate limiting, and attribution in place for production.';
    }

    return 'Direct public Nominatim access is suitable for local or low-volume development only. Use a backend or proxy in production.';
  }

  function getCachedValue<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string): T | undefined {
    const cached = cache.get(key);
    if (!cached) {
      return undefined;
    }

    if (cached.expiresAt < Date.now()) {
      cache.delete(key);
      return undefined;
    }

    return cached.value;
  }

  function setCachedValue<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T) {
    cache.set(key, {
      expiresAt: Date.now() + options.cacheTtlMs,
      value
    });
  }

  function setCachedSearch(query: string, value: PlayableRegionCatalogEntry[]) {
    setCachedValue(searchCache, query, value);
  }

  function setCachedRegion(region: PlayableRegionCatalogEntry) {
    setCachedValue(regionCache, region.regionId, region);
  }

  function setCachedItem(item: NominatimSearchItem) {
    setCachedValue(itemCache, buildRegionId(item), item);
  }

  function getCachedRegion(regionId: string) {
    return getCachedValue(regionCache, regionId);
  }

  function getCachedSearch(query: string) {
    return getCachedValue(searchCache, query);
  }

  function getCachedItem(regionId: string) {
    return getCachedValue(itemCache, regionId);
  }

  function parseRegionId(regionId: string): { osmType: string; osmId: number } | undefined {
    const parts = regionId.split(':');
    if (parts.length !== 3 || parts[0] !== 'osm') {
      return undefined;
    }

    const osmId = Number(parts[2]);
    if (!Number.isFinite(osmId)) {
      return undefined;
    }

    return {
      osmType: parts[1] ?? '',
      osmId
    };
  }

  async function lookupMissingBoundaries(items: NominatimSearchItem[]): Promise<Map<string, NominatimSearchItem>> {
    const osmIds = items
      .filter((item) => (safeLowerCase(item.osm_type) === 'relation' || safeLowerCase(item.osm_type) === 'way') && Number.isFinite(item.osm_id))
      .map((item) => `${safeLowerCase(item.osm_type) === 'relation' ? 'R' : 'W'}${item.osm_id}`);

    if (osmIds.length === 0) {
      return new Map();
    }

    const url = new URL('/lookup', options.baseUrl);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('polygon_geojson', '1');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('namedetails', '1');
    url.searchParams.set('osm_ids', osmIds.join(','));
    if (options.email) {
      url.searchParams.set('email', options.email);
    }

    const response = await requestExecutor.getJson<NominatimSearchItem[]>({
      path: '/lookup',
      searchParams: Object.fromEntries(url.searchParams.entries()),
      cacheKey: `lookup:${osmIds.sort().join(',')}`
    });
    const itemsArray = Array.isArray(response) ? response : [];
    return new Map(itemsArray.map((item) => [buildRegionId(item), item]));
  }

  return {
    providerKey: 'osm_nominatim',
    providerLabel,
    attribution: {
      providerKey: 'osm_nominatim',
      label: providerLabel,
      notice: buildAttributionNotice(),
      url: safeTrimmedString(options.providerAttributionUrl) ?? 'https://nominatim.openstreetmap.org',
      usageMode: options.usageMode ?? 'direct_public_dev_only'
    },

    async searchRegions(query) {
      const normalizedQuery = normalizeQueryKey(query);
      if (!normalizedQuery) {
        return [];
      }

      const cached = getCachedSearch(normalizedQuery);
      if (cached) {
        return cached;
      }

      const inFlight = searchInFlight.get(normalizedQuery);
      if (inFlight) {
        return inFlight;
      }

      const searchPromise = (async () => {
        const searchResults = await requestExecutor.getJson<NominatimSearchItem[]>({
          path: '/search',
          searchParams: {
            format: 'jsonv2',
            polygon_geojson: '1',
            addressdetails: '1',
            namedetails: '1',
            dedupe: '1',
            limit: '8',
            q: query.trim(),
            email: options.email
          },
          cacheKey: `search:${normalizedQuery}`
        });

        if (!Array.isArray(searchResults)) {
          throw new RegionProviderResponseError('The region provider returned an unexpected search payload.');
        }

        const relevantResults = searchResults.filter(isRelevantSearchItem);
        const lookupMap = await lookupMissingBoundaries(
          relevantResults.filter((item) => !isPolygonGeometry(item.geojson))
        );

        const hydratedRegions = relevantResults.flatMap((item) => {
          const lookupItem = lookupMap.get(buildRegionId(item));
          const geometry = isPolygonGeometry(item.geojson)
            ? item.geojson
            : isPolygonGeometry(lookupItem?.geojson)
              ? lookupItem.geojson
              : undefined;

          const mergedItem = lookupItem ?? item;
          setCachedItem(mergedItem);

          if (!geometry) {
            return [];
          }

          const region = mapSearchItemToRegion(
            mergedItem,
            geometry,
            isPolygonGeometry(item.geojson) ? 'search_geometry' : 'lookup_geometry',
            providerLabel
          );
          setCachedRegion(region);
          return [region];
        });

        setCachedSearch(normalizedQuery, hydratedRegions);
        return hydratedRegions;
      })().finally(() => {
        searchInFlight.delete(normalizedQuery);
      });

      searchInFlight.set(normalizedQuery, searchPromise);
      return searchPromise;
    },

    async getRegionById(regionId) {
      const cached = getCachedRegion(regionId);
      if (cached) {
        return cached;
      }

      const inFlight = regionInFlight.get(regionId);
      if (inFlight) {
        return inFlight;
      }

      const regionPromise = (async () => {
        const item = getCachedItem(regionId);
        if (item && isPolygonGeometry(item.geojson)) {
          const region = mapSearchItemToRegion(item, item.geojson, 'search_geometry', providerLabel);
          setCachedRegion(region);
          return region;
        }

        const parsedId = parseRegionId(regionId);
        const lookupSourceItems = item
          ? [item]
          : parsedId && (parsedId.osmType === 'relation' || parsedId.osmType === 'way')
            ? [{
              osm_type: parsedId.osmType,
              osm_id: parsedId.osmId
            }]
            : [];

        if (lookupSourceItems.length === 0) {
          return undefined;
        }

        const lookupMap = await lookupMissingBoundaries(lookupSourceItems);
        const lookupItem = lookupMap.get(regionId);
        if (!lookupItem || !isPolygonGeometry(lookupItem.geojson)) {
          return undefined;
        }

        setCachedItem(lookupItem);
        const region = mapSearchItemToRegion(lookupItem, lookupItem.geojson, 'lookup_geometry', providerLabel);
        setCachedRegion(region);
        return region;
      })().finally(() => {
        regionInFlight.delete(regionId);
      });

      regionInFlight.set(regionId, regionPromise);
      return regionPromise;
    }
  };
}

export {
  RegionProviderRateLimitError,
  RegionProviderResponseError,
  RegionProviderUnavailableError
} from './region-provider.ts';
export type { RegionBoundaryProvider } from './region-provider.ts';
