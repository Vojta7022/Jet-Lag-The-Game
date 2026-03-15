import type {
  GeoJsonGeometryModel,
  PlayableRegionKind
} from '../../../../../packages/shared-types/src/index.ts';

export type RegionCatalogSourceKind = 'seed_catalog' | 'provider_catalog' | 'composite_selection';

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

export interface CompositeRegionComponent {
  regionId: string;
  displayName: string;
  regionKind: PlayableRegionKind;
  summary: string;
  geometry: GeoJsonGeometryModel;
  featureDatasetRefs: string[];
  sourceKind: Exclude<RegionCatalogSourceKind, 'composite_selection'>;
  sourceLabel: string;
  countryLabel?: string;
  parentRegionLabel?: string;
  providerMetadata?: RegionProviderMetadata;
}

export interface CompositeRegionWarning {
  connectedGroupCount: number;
  summary: string;
}

export interface CompositeRegionMetadata {
  componentRegions: CompositeRegionComponent[];
  sourceProviderLabels: string[];
  combinedGeometry: GeoJsonGeometryModel;
  rawCombinedGeometry: GeoJsonGeometryModel;
  displayLabel: string;
  summary: string;
  dissolveStatus: 'disabled_stable_raw';
  dissolveNotice?: string;
  disconnectedWarning?: CompositeRegionWarning;
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
  compositeMetadata?: CompositeRegionMetadata;
}

export interface RegionSearchResponse {
  regions: PlayableRegionCatalogEntry[];
  sourceLabel: string;
  usingFallback: boolean;
  noticeMessage?: string;
}
