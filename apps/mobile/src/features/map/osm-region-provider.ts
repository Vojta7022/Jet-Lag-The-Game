import type { GeoJsonGeometryModel } from '../../../../../packages/shared-types/src/index.ts';

import type {
  PlayableRegionCatalogEntry,
  RegionProviderMetadata
} from './region-types.ts';

export class RegionProviderUnavailableError extends Error {}

export interface RegionBoundaryProvider {
  providerKey: string;
  providerLabel: string;
  searchRegions: (query: string) => Promise<PlayableRegionCatalogEntry[]>;
  getRegionById: (regionId: string) => Promise<PlayableRegionCatalogEntry | undefined>;
}

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
  throttleMs: number;
  cacheTtlMs: number;
  fetchFn?: typeof fetch;
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

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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

function buildProviderMetadata(item: NominatimSearchItem, boundarySource: RegionProviderMetadata['boundarySource']): RegionProviderMetadata {
  return {
    providerKey: 'osm_nominatim',
    providerLabel: 'OpenStreetMap Nominatim',
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
  boundarySource: RegionProviderMetadata['boundarySource']
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
    sourceLabel: 'OpenStreetMap Nominatim',
    searchAliases: buildSearchAliases(item),
    countryLabel: safeTrimmedString(item.address?.country),
    parentRegionLabel: buildParentRegionLabel(item.address, displayName),
    providerMetadata: buildProviderMetadata(item, boundarySource)
  };
}

export function createNominatimRegionProvider(options: NominatimProviderOptions): RegionBoundaryProvider {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const searchCache = new Map<string, { expiresAt: number; value: PlayableRegionCatalogEntry[] }>();
  const regionCache = new Map<string, { expiresAt: number; value: PlayableRegionCatalogEntry }>();
  const itemCache = new Map<string, NominatimSearchItem>();
  let lastRequestStartedAt = 0;

  async function rateLimitedFetchJson<T>(url: URL): Promise<T> {
    const elapsed = Date.now() - lastRequestStartedAt;
    if (elapsed < options.throttleMs) {
      await sleep(options.throttleMs - elapsed);
    }

    lastRequestStartedAt = Date.now();

    let response: Response;
    try {
      response = await fetchFn(url.toString(), {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'en'
        }
      });
    } catch (error) {
      throw new RegionProviderUnavailableError(
        error instanceof Error ? error.message : 'The region provider could not be reached.'
      );
    }

    if (!response.ok) {
      throw new RegionProviderUnavailableError(
        `The region provider returned ${response.status} ${response.statusText}.`
      );
    }

    return response.json() as Promise<T>;
  }

  function getCachedSearch(query: string) {
    const cached = searchCache.get(query);
    if (!cached || cached.expiresAt < Date.now()) {
      return undefined;
    }

    return cached.value;
  }

  function setCachedSearch(query: string, value: PlayableRegionCatalogEntry[]) {
    searchCache.set(query, {
      expiresAt: Date.now() + options.cacheTtlMs,
      value
    });
  }

  function setCachedRegion(region: PlayableRegionCatalogEntry) {
    regionCache.set(region.regionId, {
      expiresAt: Date.now() + options.cacheTtlMs,
      value: region
    });
  }

  function getCachedRegion(regionId: string) {
    const cached = regionCache.get(regionId);
    if (!cached || cached.expiresAt < Date.now()) {
      return undefined;
    }

    return cached.value;
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

    const response = await rateLimitedFetchJson<NominatimSearchItem[]>(url);
    const itemsArray = Array.isArray(response) ? response : [];
    return new Map(itemsArray.map((item) => [buildRegionId(item), item]));
  }

  return {
    providerKey: 'osm_nominatim',
    providerLabel: 'OpenStreetMap Nominatim',

    async searchRegions(query) {
      const normalizedQuery = normalizeQueryKey(query);
      if (!normalizedQuery) {
        return [];
      }

      const cached = getCachedSearch(normalizedQuery);
      if (cached) {
        return cached;
      }

      const url = new URL('/search', options.baseUrl);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('polygon_geojson', '1');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('namedetails', '1');
      url.searchParams.set('dedupe', '1');
      url.searchParams.set('limit', '8');
      url.searchParams.set('q', query.trim());
      if (options.email) {
        url.searchParams.set('email', options.email);
      }

      const searchResults = await rateLimitedFetchJson<NominatimSearchItem[]>(url);
      const searchItems = Array.isArray(searchResults) ? searchResults : [];
      const relevantResults = searchItems.filter(isRelevantSearchItem);
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
        itemCache.set(buildRegionId(mergedItem), mergedItem);

        if (!geometry) {
          return [];
        }

        const region = mapSearchItemToRegion(
          mergedItem,
          geometry,
          isPolygonGeometry(item.geojson) ? 'search_geometry' : 'lookup_geometry'
        );
        setCachedRegion(region);
        return [region];
      });

      setCachedSearch(normalizedQuery, hydratedRegions);
      return hydratedRegions;
    },

    async getRegionById(regionId) {
      const cached = getCachedRegion(regionId);
      if (cached) {
        return cached;
      }

      const item = itemCache.get(regionId);
      if (!item) {
        return undefined;
      }

      if (isPolygonGeometry(item.geojson)) {
        const region = mapSearchItemToRegion(item, item.geojson, 'search_geometry');
        setCachedRegion(region);
        return region;
      }

      const lookupMap = await lookupMissingBoundaries([item]);
      const lookupItem = lookupMap.get(regionId);
      if (!lookupItem || !isPolygonGeometry(lookupItem.geojson)) {
        return undefined;
      }

      const region = mapSearchItemToRegion(lookupItem, lookupItem.geojson, 'lookup_geometry');
      setCachedRegion(region);
      return region;
    }
  };
}
