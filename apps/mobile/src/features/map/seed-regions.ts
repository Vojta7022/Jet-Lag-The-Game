import type { GeoJsonGeometryModel } from '../../../../../packages/shared-types/src/index.ts';

import type { PlayableRegionCatalogEntry } from './region-types.ts';

export interface SeedPlayableRegion extends PlayableRegionCatalogEntry {
  sourceKind: 'seed_catalog';
}

function polygon(coordinates: Array<[number, number]>): GeoJsonGeometryModel {
  return {
    type: 'Polygon',
    coordinates: [[...coordinates, coordinates[0]]]
  };
}

export const seedPlayableRegions: SeedPlayableRegion[] = [
  {
    regionId: 'seed-prague-city',
    displayName: 'Prague',
    regionKind: 'city',
    summary: 'Seed city boundary for first-pass map selection and bounded search rendering.',
    featureDatasetRefs: ['osm-core', 'osm-admin', 'transit-registry'],
    sourceKind: 'seed_catalog',
    sourceLabel: 'Bundled seed region catalog',
    searchAliases: ['Praha', 'Prague City', 'Hlavni mesto Praha', 'Czech capital'],
    countryLabel: 'Czechia',
    parentRegionLabel: 'Prague',
    providerMetadata: {
      providerKey: 'seed_catalog',
      providerLabel: 'Bundled seed region catalog',
      boundarySource: 'seed_fallback'
    },
    geometry: polygon([
      [14.22, 50.17],
      [14.72, 50.17],
      [14.72, 50.21],
      [14.68, 50.39],
      [14.45, 50.54],
      [14.18, 50.48],
      [14.11, 50.28]
    ])
  },
  {
    regionId: 'seed-central-bohemia',
    displayName: 'Central Bohemia',
    regionKind: 'admin_region',
    summary: 'Seed administrative boundary for a larger regional search surface around Prague.',
    featureDatasetRefs: ['osm-core', 'osm-admin', 'rail-network', 'surface-water'],
    sourceKind: 'seed_catalog',
    sourceLabel: 'Bundled seed region catalog',
    searchAliases: ['Central Bohemian Region', 'Stredocesky Kraj', 'Bohemia', 'Prague hinterland'],
    countryLabel: 'Czechia',
    parentRegionLabel: 'Central Bohemia',
    providerMetadata: {
      providerKey: 'seed_catalog',
      providerLabel: 'Bundled seed region catalog',
      boundarySource: 'seed_fallback'
    },
    geometry: polygon([
      [13.15, 49.74],
      [15.55, 49.74],
      [15.72, 50.09],
      [15.55, 50.58],
      [15.04, 50.91],
      [13.62, 50.84],
      [12.98, 50.35]
    ])
  },
  {
    regionId: 'seed-vienna-city',
    displayName: 'Vienna',
    regionKind: 'city',
    summary: 'Alternative city-scale seed region for testing different map footprints.',
    featureDatasetRefs: ['osm-core', 'osm-admin', 'transit-registry', 'rail-network'],
    sourceKind: 'seed_catalog',
    sourceLabel: 'Bundled seed region catalog',
    searchAliases: ['Wien', 'Vienna City', 'Austrian capital'],
    countryLabel: 'Austria',
    parentRegionLabel: 'Vienna',
    providerMetadata: {
      providerKey: 'seed_catalog',
      providerLabel: 'Bundled seed region catalog',
      boundarySource: 'seed_fallback'
    },
    geometry: polygon([
      [16.17, 48.12],
      [16.58, 48.12],
      [16.58, 48.32],
      [16.44, 48.39],
      [16.21, 48.36],
      [16.11, 48.23]
    ])
  }
];

export function getSeedPlayableRegion(regionId: string): SeedPlayableRegion | undefined {
  return seedPlayableRegions.find((region) => region.regionId === regionId);
}
