import type { GeometryPrecision } from '../../../shared-types/src/index.ts';

import type { GeoFeatureRecord } from '../feature-layer.ts';
import { representativePointFromGeometry, type LonLat } from '../geometry/geojson.ts';
import { distanceMeters } from '../geometry/planar.ts';

export interface FeatureQuerySupport {
  precision: GeometryPrecision;
  confidenceScore: number;
  reason: string;
}

export interface NearestFeatureResult extends FeatureQuerySupport {
  feature?: GeoFeatureRecord;
  distanceMeters?: number;
}

export interface ClosestCandidateResult extends FeatureQuerySupport {
  feature?: GeoFeatureRecord;
  rankedCandidates: Array<{
    featureId: string;
    distanceMeters: number;
  }>;
}

function representativePoint(feature: GeoFeatureRecord): LonLat | undefined {
  if (feature.representativePoint) {
    return [feature.representativePoint.longitude, feature.representativePoint.latitude];
  }

  return representativePointFromGeometry(feature.geometry);
}

function supportForFeatures(features: GeoFeatureRecord[]): FeatureQuerySupport {
  if (features.length === 0) {
    return {
      precision: 'metadata_only',
      confidenceScore: 0.1,
      reason: 'No matching features were available.'
    };
  }

  if (features.some((feature) => !representativePoint(feature))) {
    return {
      precision: 'metadata_only',
      confidenceScore: 0.2,
      reason: 'One or more matching features had no usable geometry or representative point.'
    };
  }

  if (features.some((feature) => feature.coverage === 'metadata_only')) {
    return {
      precision: 'metadata_only',
      confidenceScore: 0.2,
      reason: 'Matching features are metadata-only.'
    };
  }

  if (
    features.every(
      (feature) => feature.coverage === 'exact' && feature.geometrySupport === 'point'
    )
  ) {
    return {
      precision: 'exact',
      confidenceScore: 0.95,
      reason: 'All matching features are exact point features.'
    };
  }

  return {
    precision: 'approximate',
    confidenceScore: 0.65,
    reason: 'Feature lookup depends on representative points or approximate coverage.'
  };
}

export function filterFeaturesByClass(
  features: GeoFeatureRecord[],
  featureClassIds: string[]
): GeoFeatureRecord[] {
  const expected = new Set(featureClassIds);
  return features.filter((feature) => expected.has(feature.featureClassId));
}

export function queryWithinRadius(args: {
  features: GeoFeatureRecord[];
  featureClassIds: string[];
  center: LonLat;
  radiusMeters: number;
}): FeatureQuerySupport & {
  features: GeoFeatureRecord[];
} {
  const candidates = filterFeaturesByClass(args.features, args.featureClassIds).filter((feature) => {
    const point = representativePoint(feature);
    return point ? distanceMeters(point, args.center) <= args.radiusMeters : false;
  });

  const support = supportForFeatures(candidates);
  return {
    ...support,
    features: candidates
  };
}

export function queryNearestFeature(args: {
  features: GeoFeatureRecord[];
  featureClassIds: string[];
  point: LonLat;
}): NearestFeatureResult {
  const candidates = filterFeaturesByClass(args.features, args.featureClassIds);
  const support = supportForFeatures(candidates);

  if (support.precision === 'metadata_only') {
    return support;
  }

  const ranked = candidates
    .map((feature) => {
      const point = representativePoint(feature)!;
      return {
        feature,
        distanceMeters: distanceMeters(point, args.point)
      };
    })
    .sort((left, right) => left.distanceMeters - right.distanceMeters);

  const nearest = ranked[0];
  return {
    ...support,
    feature: nearest?.feature,
    distanceMeters: nearest?.distanceMeters
  };
}

export function queryClosestAmongCandidates(args: {
  candidates: GeoFeatureRecord[];
  point: LonLat;
}): ClosestCandidateResult {
  const support = supportForFeatures(args.candidates);
  if (support.precision === 'metadata_only') {
    return {
      ...support,
      rankedCandidates: []
    };
  }

  const rankedCandidates = args.candidates
    .map((feature) => {
      const point = representativePoint(feature)!;
      return {
        feature,
        distanceMeters: distanceMeters(point, args.point)
      };
    })
    .sort((left, right) => left.distanceMeters - right.distanceMeters);

  return {
    ...support,
    feature: rankedCandidates[0]?.feature,
    rankedCandidates: rankedCandidates.map((candidate) => ({
      featureId: candidate.feature.featureId,
      distanceMeters: candidate.distanceMeters
    }))
  };
}

export function representativePointForFeature(feature: GeoFeatureRecord): LonLat | undefined {
  return representativePoint(feature);
}
