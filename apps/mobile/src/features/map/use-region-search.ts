import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  PlayableRegionCatalogEntry,
  RegionSourceAttribution
} from './region-types.ts';
import type { RegionDataSource } from './region-data-source.ts';

interface UseRegionSearchArgs {
  source: RegionDataSource;
  initialRegionId?: string;
  initialQuery?: string;
}

function normalizeExternalSearchQuery(value: string | undefined): string {
  return value ?? '';
}

export function shouldApplyExternalRegionSearchValue(
  lastAppliedValue: string | undefined,
  nextExternalValue: string | undefined
): boolean {
  return normalizeExternalSearchQuery(lastAppliedValue) !== normalizeExternalSearchQuery(nextExternalValue);
}

export function resolveRegionSearchSelection(args: {
  currentRegion?: PlayableRegionCatalogEntry;
  regions: PlayableRegionCatalogEntry[];
  selectedRegionId?: string;
}): PlayableRegionCatalogEntry | undefined {
  if (
    args.currentRegion &&
    args.regions.some((region) => region.regionId === args.currentRegion?.regionId)
  ) {
    return args.currentRegion;
  }

  if (args.selectedRegionId) {
    return args.regions.find((region) => region.regionId === args.selectedRegionId);
  }

  return args.regions[0];
}

export function useRegionSearch(args: UseRegionSearchArgs) {
  const [query, setQueryState] = useState(args.initialQuery ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(args.initialQuery ?? '');
  const [regions, setRegions] = useState<PlayableRegionCatalogEntry[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<PlayableRegionCatalogEntry | undefined>(undefined);
  const [sourceLabel, setSourceLabel] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | undefined>(undefined);
  const [attribution, setAttribution] = useState<RegionSourceAttribution | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [reloadToken, setReloadToken] = useState(0);
  const selectedRegionIdRef = useRef(args.initialRegionId);
  const lastAppliedExternalQueryRef = useRef(normalizeExternalSearchQuery(args.initialQuery));
  const lastAppliedExternalRegionIdRef = useRef(args.initialRegionId);

  useEffect(() => {
    const nextQuery = normalizeExternalSearchQuery(args.initialQuery);
    if (!shouldApplyExternalRegionSearchValue(lastAppliedExternalQueryRef.current, nextQuery)) {
      return;
    }

    lastAppliedExternalQueryRef.current = nextQuery;
    setQueryState((current) => (current === nextQuery ? current : nextQuery));
    setDebouncedQuery((current) => (current === nextQuery ? current : nextQuery));
  }, [args.initialQuery]);

  useEffect(() => {
    if (lastAppliedExternalRegionIdRef.current === args.initialRegionId) {
      return;
    }

    lastAppliedExternalRegionIdRef.current = args.initialRegionId;
    selectedRegionIdRef.current = args.initialRegionId;
    if (!args.initialRegionId) {
      setSelectedRegion((currentRegion) => (currentRegion ? undefined : currentRegion));
      return;
    }

    setSelectedRegion((currentRegion) => {
      if (currentRegion?.regionId === args.initialRegionId) {
        return currentRegion;
      }

      const localMatch = regions.find((region) => region.regionId === args.initialRegionId);
      return localMatch ?? currentRegion;
    });
  }, [args.initialRegionId, regions]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(query);
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    async function runSearch() {
      if (debouncedQuery.trim().length < 2) {
        setRegions([]);
        setSelectedRegion(undefined);
        setSourceLabel('');
        setUsingFallback(false);
        setNoticeMessage(undefined);
        setAttribution(undefined);
        setErrorMessage(undefined);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(undefined);
      setNoticeMessage(undefined);

      try {
        const response = await args.source.searchRegions(debouncedQuery);
        if (cancelled) {
          return;
        }

        setRegions(response.regions);
        setSourceLabel(response.sourceLabel);
        setUsingFallback(response.usingFallback);
        setNoticeMessage(response.noticeMessage);
        setAttribution(response.attribution);
        setSelectedRegion((currentRegion) => {
          const nextRegion = resolveRegionSearchSelection({
            currentRegion,
            regions: response.regions,
            selectedRegionId: selectedRegionIdRef.current
          });

          if (currentRegion?.regionId === nextRegion?.regionId) {
            return currentRegion;
          }

          return nextRegion;
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setRegions([]);
        setAttribution(undefined);
        setErrorMessage(error instanceof Error ? error.message : 'The region catalog failed to load.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void runSearch();

    return () => {
      cancelled = true;
    };
  }, [args.source, debouncedQuery, reloadToken]);

  const selectedRegionId = selectedRegion?.regionId;
  const minimumQueryLengthMet = debouncedQuery.trim().length >= 2;

  const setQuery = useCallback((value: string) => {
    lastAppliedExternalQueryRef.current = value;
    setQueryState((current) => (current === value ? current : value));
  }, []);

  const selectRegion = useCallback(async (regionId: string) => {
    lastAppliedExternalRegionIdRef.current = regionId;
    selectedRegionIdRef.current = regionId;
    const localMatch = regions.find((region) => region.regionId === regionId);
    if (localMatch) {
      setSelectedRegion((currentRegion) => (
        currentRegion?.regionId === localMatch.regionId ? currentRegion : localMatch
      ));
      return;
    }

    try {
      const region = await args.source.getRegionById(regionId);
      if (region) {
        setSelectedRegion((currentRegion) => (
          currentRegion?.regionId === region.regionId ? currentRegion : region
        ));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The region boundary could not be loaded.');
    }
  }, [args.source, regions]);

  const retrySearch = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  const clearSelection = useCallback(() => {
    lastAppliedExternalRegionIdRef.current = undefined;
    selectedRegionIdRef.current = undefined;
    setSelectedRegion((currentRegion) => (currentRegion ? undefined : currentRegion));
  }, []);

  return useMemo(() => ({
    query,
    setQuery,
    minimumQueryLengthMet,
    regions,
    selectedRegion,
    selectedRegionId,
    sourceLabel,
    usingFallback,
    noticeMessage,
    attribution,
    isLoading,
    errorMessage,
    selectRegion,
    retrySearch,
    clearSelection
  }), [
    clearSelection,
    errorMessage,
    isLoading,
    minimumQueryLengthMet,
    noticeMessage,
    attribution,
    query,
    regions,
    retrySearch,
    selectRegion,
    selectedRegion,
    selectedRegionId,
    sourceLabel,
    usingFallback
  ]);
}
