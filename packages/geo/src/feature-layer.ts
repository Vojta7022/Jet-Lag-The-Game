import type { GeometryPrecision, PlayableRegionKind } from '../../shared-types/src/index.ts';

export const SUPPORTED_FEATURE_TYPES = [
  'airport',
  'hospital',
  'zoo',
  'aquarium',
  'museum',
  'library',
  'park',
  'amusement_park',
  'transit_line',
  'rail_station',
  'admin_boundary',
  'coastline',
  'body_of_water'
] as const;

export type SupportedFeatureType = (typeof SUPPORTED_FEATURE_TYPES)[number];

export type FeatureGeometrySupport = 'point' | 'line' | 'polygon' | 'mixed' | 'metadata_only';

export interface FeatureDataCapability {
  featureType: SupportedFeatureType;
  coverage: GeometryPrecision;
  geometrySupport: FeatureGeometrySupport;
  notes?: string;
}

export interface FeatureDataLayerDescriptor {
  layerId: string;
  label: string;
  supportedRegionKinds: PlayableRegionKind[];
  capabilities: FeatureDataCapability[];
  notes?: string;
}

export interface RegionBoundaryRequest {
  regionId: string;
  regionKind: PlayableRegionKind;
}

export interface FeatureDataLayer {
  descriptor: FeatureDataLayerDescriptor;
}

export interface RegionBoundaryProvider {
  providerId: string;
  resolveBoundary(request: RegionBoundaryRequest): Promise<Record<string, unknown> | null> | Record<string, unknown> | null;
}
