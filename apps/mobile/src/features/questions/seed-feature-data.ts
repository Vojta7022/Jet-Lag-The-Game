import type { GeoFeatureRecord } from '../../../../../packages/geo/src/index.ts';

interface SeedFeaturePoint {
  featureId: string;
  label: string;
  latitude: number;
  longitude: number;
  featureClassIds: string[];
}

function buildFeatureRecords(regionId: string, points: SeedFeaturePoint[]): GeoFeatureRecord[] {
  return points.flatMap((point) =>
    point.featureClassIds.map((featureClassId) => ({
      featureId: `${regionId}:${point.featureId}:${featureClassId}`,
      featureClassId,
      label: point.label,
      representativePoint: {
        latitude: point.latitude,
        longitude: point.longitude
      },
      geometrySupport: 'point',
      coverage: 'approximate' as const,
      properties: {
        seedRegionId: regionId,
        seedData: true
      }
    }))
  );
}

const seedFeaturesByRegion = {
  'seed-prague-city': buildFeatureRecords('seed-prague-city', [
    {
      featureId: 'airport',
      label: 'Prague Airport Annex',
      latitude: 50.22,
      longitude: 14.27,
      featureClassIds: ['commercial-airport', 'a-commercial-airport']
    },
    {
      featureId: 'museum',
      label: 'Riverside Museum',
      latitude: 50.27,
      longitude: 14.42,
      featureClassIds: ['museum', 'museums']
    },
    {
      featureId: 'library',
      label: 'Old Town Library',
      latitude: 50.3,
      longitude: 14.41,
      featureClassIds: ['library', 'libraries']
    },
    {
      featureId: 'hospital',
      label: 'North Prague Hospital',
      latitude: 50.31,
      longitude: 14.5,
      featureClassIds: ['hospital', 'hospitals']
    },
    {
      featureId: 'park',
      label: 'Castle Gardens',
      latitude: 50.32,
      longitude: 14.36,
      featureClassIds: ['park']
    },
    {
      featureId: 'amusement',
      label: 'Riverside Fairgrounds',
      latitude: 50.28,
      longitude: 14.58,
      featureClassIds: ['amusement-park']
    },
    {
      featureId: 'zoo',
      label: 'Prague Hills Zoo',
      latitude: 50.38,
      longitude: 14.33,
      featureClassIds: ['zoo']
    },
    {
      featureId: 'aquarium',
      label: 'Vltava Aquarium',
      latitude: 50.22,
      longitude: 14.3,
      featureClassIds: ['aquarium']
    },
    {
      featureId: 'rail',
      label: 'Prague Central Rail',
      latitude: 50.29,
      longitude: 14.46,
      featureClassIds: ['rail-station', 'a-rail-station']
    },
    {
      featureId: 'transit',
      label: 'Metro Red Line',
      latitude: 50.28,
      longitude: 14.44,
      featureClassIds: ['transit-line', 'metro-lines', 'a-high-speed-train-line']
    },
    {
      featureId: 'movie',
      label: 'City Screen Theatre',
      latitude: 50.24,
      longitude: 14.39,
      featureClassIds: ['movie-theatre', 'movie-theaters']
    }
  ]),
  'seed-central-bohemia': buildFeatureRecords('seed-central-bohemia', [
    {
      featureId: 'airport',
      label: 'Regional Airfield',
      latitude: 50.26,
      longitude: 14.15,
      featureClassIds: ['commercial-airport', 'a-commercial-airport']
    },
    {
      featureId: 'museum',
      label: 'County Museum',
      latitude: 50.06,
      longitude: 14.52,
      featureClassIds: ['museum', 'museums']
    },
    {
      featureId: 'library',
      label: 'Regional Library',
      latitude: 50.2,
      longitude: 14.88,
      featureClassIds: ['library', 'libraries']
    },
    {
      featureId: 'hospital',
      label: 'County Hospital',
      latitude: 50.11,
      longitude: 14.22,
      featureClassIds: ['hospital', 'hospitals']
    },
    {
      featureId: 'park',
      label: 'Lake Park',
      latitude: 50.55,
      longitude: 14.61,
      featureClassIds: ['park']
    },
    {
      featureId: 'amusement',
      label: 'Summer Fair Park',
      latitude: 49.97,
      longitude: 14.63,
      featureClassIds: ['amusement-park']
    },
    {
      featureId: 'rail',
      label: 'Regional Junction',
      latitude: 50.17,
      longitude: 14.74,
      featureClassIds: ['rail-station', 'a-rail-station']
    },
    {
      featureId: 'transit',
      label: 'Express Rail Corridor',
      latitude: 50.36,
      longitude: 14.45,
      featureClassIds: ['transit-line', 'metro-lines', 'a-high-speed-train-line']
    }
  ]),
  'seed-vienna-city': buildFeatureRecords('seed-vienna-city', [
    {
      featureId: 'airport',
      label: 'Vienna City Air Link',
      latitude: 48.18,
      longitude: 16.55,
      featureClassIds: ['commercial-airport', 'a-commercial-airport']
    },
    {
      featureId: 'museum',
      label: 'Ring Museum',
      latitude: 48.21,
      longitude: 16.37,
      featureClassIds: ['museum', 'museums']
    },
    {
      featureId: 'library',
      label: 'Imperial Library',
      latitude: 48.22,
      longitude: 16.34,
      featureClassIds: ['library', 'libraries']
    },
    {
      featureId: 'hospital',
      label: 'Vienna General Hospital',
      latitude: 48.25,
      longitude: 16.34,
      featureClassIds: ['hospital', 'hospitals']
    },
    {
      featureId: 'park',
      label: 'Prater Park',
      latitude: 48.22,
      longitude: 16.41,
      featureClassIds: ['park']
    },
    {
      featureId: 'amusement',
      label: 'Prater Rides',
      latitude: 48.22,
      longitude: 16.4,
      featureClassIds: ['amusement-park']
    },
    {
      featureId: 'zoo',
      label: 'Schonbrunn Zoo',
      latitude: 48.19,
      longitude: 16.3,
      featureClassIds: ['zoo']
    },
    {
      featureId: 'aquarium',
      label: 'Danube Aquarium',
      latitude: 48.24,
      longitude: 16.45,
      featureClassIds: ['aquarium']
    },
    {
      featureId: 'rail',
      label: 'Vienna Central Station',
      latitude: 48.19,
      longitude: 16.38,
      featureClassIds: ['rail-station', 'a-rail-station']
    },
    {
      featureId: 'transit',
      label: 'Metro U1 Spine',
      latitude: 48.23,
      longitude: 16.37,
      featureClassIds: ['transit-line', 'metro-lines', 'a-high-speed-train-line']
    },
    {
      featureId: 'movie',
      label: 'Palace Cinema',
      latitude: 48.21,
      longitude: 16.36,
      featureClassIds: ['movie-theatre', 'movie-theaters']
    }
  ])
} as const satisfies Record<string, GeoFeatureRecord[]>;

export function getSeedRegionFeatureData(
  regionId: string | undefined,
  featureClassIds?: string[]
): GeoFeatureRecord[] {
  if (!regionId) {
    return [];
  }

  const features = seedFeaturesByRegion[regionId as keyof typeof seedFeaturesByRegion] ?? [];
  if (!featureClassIds || featureClassIds.length === 0) {
    return features;
  }

  const wanted = new Set(featureClassIds);
  return features.filter((feature) => wanted.has(feature.featureClassId));
}

export function hasSeedFeatureCoverage(
  regionId: string | undefined,
  featureClassIds?: string[]
): boolean {
  return getSeedRegionFeatureData(regionId, featureClassIds).length > 0;
}
