import type { QuestionFeatureDatasetModel, QuestionFeatureRecordModel } from '../../../shared-types/src/index.ts';
import { distanceToGeometryMeters } from '../../../geo/src/index.ts';
import type { DistantCuisineChallengeModel, LocationSampleModel } from '../../../shared-types/src/index.ts';

function isCountryBoundaryFeature(feature: QuestionFeatureRecordModel | undefined, regionId: string): feature is QuestionFeatureRecordModel & { geometry: NonNullable<QuestionFeatureRecordModel['geometry']> } {
  if (!feature || feature.featureId !== regionId || feature.featureClassId !== 'country-boundary' || feature.coverage !== 'exact' || !feature.geometry) return false;
  if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') return false;
  const properties = feature.properties;
  if (properties?.addressType !== 'country') return false;
  const match = /^osm:(relation|way):(\d+)$/.exec(regionId);
  return Boolean(match && properties.osmType === match[1] && Number(properties.osmId) === Number(match[2]));
}

export function computeDistantCuisineDistances(args: {
  challenge: DistantCuisineChallengeModel;
  location: Pick<LocationSampleModel, 'latitude' | 'longitude'>;
  dataset?: QuestionFeatureDatasetModel;
}): { sourceCountryDistanceMeters: number; targetCountryDistanceMeters: number } | undefined {
  const source = args.challenge.origin;
  const target = args.challenge.target;
  if (!source || !target || args.dataset?.source !== 'OpenStreetMap' || args.dataset.coverage !== 'exact') return undefined;
  const sourceBoundary = args.dataset.features.find((feature) => isCountryBoundaryFeature(feature, source.cuisineCountryRegionId));
  const targetBoundary = args.dataset.features.find((feature) => isCountryBoundaryFeature(feature, target.cuisineCountryRegionId));
  if (!sourceBoundary?.geometry || !targetBoundary?.geometry) return undefined;
  const point: [number, number] = [args.location.longitude, args.location.latitude];
  const sourceCountryDistanceMeters = distanceToGeometryMeters(point, sourceBoundary.geometry);
  const targetCountryDistanceMeters = distanceToGeometryMeters(point, targetBoundary.geometry);
  if (sourceCountryDistanceMeters === undefined || targetCountryDistanceMeters === undefined) return undefined;
  return { sourceCountryDistanceMeters, targetCountryDistanceMeters };
}
