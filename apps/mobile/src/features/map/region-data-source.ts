import { mobileAppEnvironment } from '../../config/env.ts';

import {
  createNominatimRegionProvider,
  type RegionBoundaryProvider,
  RegionProviderUnavailableError
} from './osm-region-provider.ts';
import { seedPlayableRegions } from './seed-regions.ts';
import type {
  PlayableRegionCatalogEntry,
  RegionSearchResponse
} from './region-types.ts';

export interface RegionDataSource {
  searchRegions: (query: string) => Promise<RegionSearchResponse>;
  getRegionById: (regionId: string) => Promise<PlayableRegionCatalogEntry | undefined>;
}

const seedSourceLabel = 'Bundled seed region catalog';

function normalizeSearchValue(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenizeSearchQuery(value: string): string[] {
  const normalized = normalizeSearchValue(value);
  return normalized ? normalized.split(/\s+/g) : [];
}

function buildSearchHaystack(region: PlayableRegionCatalogEntry): string[] {
  return [
    region.displayName,
    region.summary,
    region.regionKind,
    region.countryLabel ?? '',
    region.parentRegionLabel ?? '',
    ...region.searchAliases,
    ...region.featureDatasetRefs
  ].map(normalizeSearchValue);
}

function scoreRegionMatch(region: PlayableRegionCatalogEntry, queryTokens: string[]): number {
  if (queryTokens.length === 0) {
    return 1;
  }

  const searchableFields = buildSearchHaystack(region);
  let score = 0;

  for (const token of queryTokens) {
    const tokenScore = searchableFields.reduce((best, field) => {
      if (field === token) {
        return Math.max(best, 120);
      }

      if (field.startsWith(token)) {
        return Math.max(best, 90);
      }

      if (field.includes(` ${token}`) || field.includes(token)) {
        return Math.max(best, 60);
      }

      return best;
    }, 0);

    if (tokenScore === 0) {
      return 0;
    }

    score += tokenScore;
  }

  return score;
}

export function createSeedRegionDataSource(
  regions: PlayableRegionCatalogEntry[] = seedPlayableRegions
): RegionDataSource {
  const byId = new Map(regions.map((region) => [region.regionId, region]));

  return {
    async searchRegions(query) {
      if (!query.trim()) {
        return {
          regions: [],
          sourceLabel: seedSourceLabel,
          usingFallback: true
        };
      }

      const queryTokens = tokenizeSearchQuery(query);
      const scoredRegions = regions
        .map((region) => ({
          region,
          score: scoreRegionMatch(region, queryTokens)
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          return left.region.displayName.localeCompare(right.region.displayName);
        })
        .map((entry) => entry.region);

      return {
        regions: scoredRegions,
        sourceLabel: seedSourceLabel,
        usingFallback: true,
        noticeMessage: 'The bundled seed catalog is acting as the fallback region source.'
      };
    },

    async getRegionById(regionId) {
      return byId.get(regionId);
    }
  };
}

export function createProviderBackedRegionDataSource(args: {
  provider: RegionBoundaryProvider;
  fallback: RegionDataSource;
}): RegionDataSource {
  const fallback = args.fallback;

  return {
    async searchRegions(query) {
      if (!query.trim()) {
        return {
          regions: [],
          sourceLabel: args.provider.providerLabel,
          usingFallback: false
        };
      }

      try {
        const providerResults = await args.provider.searchRegions(query);
        return {
          regions: providerResults,
          sourceLabel: args.provider.providerLabel,
          usingFallback: false
        };
      } catch (error) {
        if (!(error instanceof RegionProviderUnavailableError)) {
          throw error;
        }

        const fallbackResponse = await fallback.searchRegions(query);
        return {
          ...fallbackResponse,
          usingFallback: true,
          noticeMessage: `${args.provider.providerLabel} is unavailable right now. The bundled seed fallback is being used for local/dev continuity.`
        };
      }
    },

    async getRegionById(regionId) {
      try {
        const providerRegion = await args.provider.getRegionById(regionId);
        if (providerRegion) {
          return providerRegion;
        }
      } catch (error) {
        if (!(error instanceof RegionProviderUnavailableError)) {
          throw error;
        }
      }

      return fallback.getRegionById(regionId);
    }
  };
}

export const mobileRegionDataSource = createProviderBackedRegionDataSource({
  provider: createNominatimRegionProvider({
    baseUrl: mobileAppEnvironment.regionProviderBaseUrl,
    email: mobileAppEnvironment.regionProviderContactEmail,
    throttleMs: mobileAppEnvironment.regionProviderThrottleMs,
    cacheTtlMs: mobileAppEnvironment.regionProviderCacheTtlSeconds * 1000
  }),
  fallback: createSeedRegionDataSource()
});
