import type { GeoJsonGeometryModel } from '../../../../../packages/shared-types/src/index.ts';
import type { MapCoordinate } from './map-geometry.ts';
import type { PlayableRegionCatalogEntry } from './region-types.ts';

export function buildDrawnExclusionRegion(
  name: string,
  points: MapCoordinate[]
): PlayableRegionCatalogEntry {
  const distinct = points.filter((point, index) =>
    points.findIndex((candidate) => candidate.latitude === point.latitude && candidate.longitude === point.longitude) === index
  );
  if (distinct.length < 3) throw new Error('A mask needs at least three distinct map points.');
  if (distinct.some((point) => !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 ||
    !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180)) {
    throw new Error('A mask contains an invalid map coordinate.');
  }

  const ring: [number, number][] = distinct.map(({ longitude, latitude }) => [longitude, latitude]);
  ring.push([...ring[0]!] as [number, number]);
  const twiceArea = ring.slice(0, -1).reduce((sum, point, index) => {
    const next = ring[index + 1]!;
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  if (Math.abs(twiceArea) < 1e-10) throw new Error('The mask points must enclose an area.');

  const displayName = name.trim() || 'Drawn exclusion';
  const geometry: GeoJsonGeometryModel = { type: 'Polygon', coordinates: [ring] };
  return {
    regionId: `drawn:${ring.map(([longitude, latitude]) => `${longitude.toFixed(5)},${latitude.toFixed(5)}`).join(';')}`,
    displayName,
    regionKind: 'custom',
    summary: 'Hand-drawn exclusion mask clipped to the included playable area.',
    featureDatasetRefs: [],
    geometry,
    sourceKind: 'composite_selection',
    sourceLabel: 'Map drawing',
    searchAliases: []
  };
}
