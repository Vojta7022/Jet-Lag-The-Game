import { mobileAppEnvironment } from '../../config/env.ts';

import {
  createNominatimRegionProvider,
  type RegionBoundaryProvider
} from './osm-region-provider.ts';
import {
  RegionProviderError,
  RegionProviderRateLimitError,
  RegionProviderUnavailableError
} from './region-provider.ts';
import { seedPlayableRegions } from './seed-regions.ts';
import type {
  PlayableRegionCatalogEntry,
  RegionSourceAttribution,
  RegionSearchResponse
} from './region-types.ts';

export interface RegionDataSource {
  searchRegions: (query: string) => Promise<RegionSearchResponse>;
  getRegionById: (regionId: string) => Promise<PlayableRegionCatalogEntry | undefined>;
}

const seedSourceLabel = 'Bundled seed region catalog';
const seedAttribution: RegionSourceAttribution = {
  providerKey: 'bundled_seed_catalog',
  label: seedSourceLabel,
  notice: 'Bundled seed regions are a fallback source only. They help local development continue when the live provider is unavailable.',
  usageMode: 'bundled_fallback'
};

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
          usingFallback: true,
          attribution: seedAttribution
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
        noticeMessage: 'The bundled seed catalog is acting as the fallback region source.',
        attribution: seedAttribution
      };
    },

    async getRegionById(regionId) {
      return byId.get(regionId);
    }
  };
}

function buildProviderFallbackNotice(
  provider: RegionBoundaryProvider,
  error: RegionProviderError
): string {
  if (error instanceof RegionProviderRateLimitError) {
    return `${provider.providerLabel} is rate limiting requests right now. The bundled seed fallback is being used temporarily. Retry in a moment or move this provider behind a proxy for production traffic.`;
  }

  if (error instanceof RegionProviderUnavailableError) {
    return `${provider.providerLabel} is unavailable right now. The bundled seed fallback is being used for local/dev continuity.`;
  }

  return `${provider.providerLabel} returned an unexpected response. The bundled seed fallback is being used until the provider configuration is fixed.`;
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
          usingFallback: false,
          attribution: args.provider.attribution
        };
      }

      try {
        const providerResults = await args.provider.searchRegions(query);
        return {
          regions: providerResults,
          sourceLabel: args.provider.providerLabel,
          usingFallback: false,
          attribution: args.provider.attribution
        };
      } catch (error) {
        if (!(error instanceof RegionProviderError)) {
          throw error;
        }

        const fallbackResponse = await fallback.searchRegions(query);
        return {
          ...fallbackResponse,
          usingFallback: true,
          noticeMessage: buildProviderFallbackNotice(args.provider, error),
          attribution: fallbackResponse.attribution ?? seedAttribution
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
        if (!(error instanceof RegionProviderError)) {
          throw error;
        }
      }

      return fallback.getRegionById(regionId);
    }
  };
}

export function createConfiguredRegionDataSource(
  environment = mobileAppEnvironment
): RegionDataSource {
  return createProviderBackedRegionDataSource({
    provider: createNominatimRegionProvider({
      baseUrl: environment.regionProviderBaseUrl,
      email: environment.regionProviderContactEmail,
      providerLabel: environment.regionProviderLabel,
      providerAttributionUrl: environment.regionProviderAttributionUrl,
      usageMode: environment.regionProviderUsageMode,
      throttleMs: environment.regionProviderThrottleMs,
      cacheTtlMs: environment.regionProviderCacheTtlSeconds * 1000,
      requestTimeoutMs: environment.regionProviderTimeoutMs
    }),
    fallback: createSeedRegionDataSource()
  });
}

export const mobileRegionDataSource = createConfiguredRegionDataSource();
