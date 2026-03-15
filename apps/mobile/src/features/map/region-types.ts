import type {
  GeoJsonGeometryModel,
  PlayableRegionKind
} from '../../../../../packages/shared-types/src/index.ts';

export type RegionCatalogSourceKind = 'seed_catalog' | 'provider_catalog';

export interface RegionProviderMetadata {
  providerKey: string;
  providerLabel: string;
  osmType?: string;
  osmId?: number;
  resultClass?: string;
  resultType?: string;
  placeRank?: number;
  importance?: number;
  boundarySource: 'search_geometry' | 'lookup_geometry' | 'seed_fallback';
}

export interface PlayableRegionCatalogEntry {
  regionId: string;
  displayName: string;
  regionKind: PlayableRegionKind;
  summary: string;
  featureDatasetRefs: string[];
  geometry: GeoJsonGeometryModel;
  sourceKind: RegionCatalogSourceKind;
  sourceLabel: string;
  searchAliases: string[];
  countryLabel?: string;
  parentRegionLabel?: string;
  providerMetadata?: RegionProviderMetadata;
}

export interface RegionSearchResponse {
  regions: PlayableRegionCatalogEntry[];
  sourceLabel: string;
  usingFallback: boolean;
  noticeMessage?: string;
}
