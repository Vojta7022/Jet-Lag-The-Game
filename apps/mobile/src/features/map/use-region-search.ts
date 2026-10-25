import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  PlayableRegionCatalogEntry,
  RegionSourceAttribution
} from './region-types.ts';
import type { RegionDataSource } from './region-data-source.ts';
import {
  createRegionSearchRequestState,
  editRegionSearchQuery,
  submitRegionSearchQuery
} from './region-search-model.ts';

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

export async function resolveRegionSearchSelectionById(args: {
  regionId: string;
  regions: PlayableRegionCatalogEntry[];
  source: RegionDataSource;
}): Promise<PlayableRegionCatalogEntry | undefined> {
  return args.regions.find((region) => region.regionId === args.regionId) ??
    args.source.getRegionById(args.regionId);
}

export function shouldApplyResolvedRegionSearchSelection(
  requestedRegionId: string,
  currentSelectedRegionId: string | undefined
): boolean {
  return requestedRegionId === currentSelectedRegionId;
}

export function useRegionSearch(args: UseRegionSearchArgs) {
  const [searchState, setSearchState] = useState(() => createRegionSearchRequestState(args.initialQuery ?? ''));
  const [regions, setRegions] = useState<PlayableRegionCatalogEntry[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<PlayableRegionCatalogEntry | undefined>(undefined);
  const [sourceLabel, setSourceLabel] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | undefined>(undefined);
  const [attribution, setAttribution] = useState<RegionSourceAttribution | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const selectedRegionIdRef = useRef(args.initialRegionId);
  const lastAppliedExternalQueryRef = useRef(normalizeExternalSearchQuery(args.initialQuery));
  const lastAppliedExternalRegionIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const nextQuery = normalizeExternalSearchQuery(args.initialQuery);
    if (!shouldApplyExternalRegionSearchValue(lastAppliedExternalQueryRef.current, nextQuery)) {
      return;
    }

    lastAppliedExternalQueryRef.current = nextQuery;
    setSearchState((current) => current.draftQuery === nextQuery
      ? current
      : editRegionSearchQuery(current, nextQuery));
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

    let cancelled = false;
    void resolveRegionSearchSelectionById({
      regionId: args.initialRegionId,
      regions,
      source: args.source
    }).then((region) => {
      if (
        !region ||
        cancelled ||
        !shouldApplyResolvedRegionSearchSelection(region.regionId, selectedRegionIdRef.current)
      ) return;
      setSelectedRegion((currentRegion) => (
        currentRegion?.regionId === region.regionId ? currentRegion : region
      ));
    }).catch((error: unknown) => {
      if (cancelled) return;
      setErrorMessage(error instanceof Error ? error.message : 'The selected region boundary could not be loaded.');
    });

    return () => {
      cancelled = true;
    };
  }, [args.initialRegionId, args.source, regions]);

  useEffect(() => {
    let cancelled = false;
    const requestQuery = searchState.requestQuery;

    async function runSearch() {
      if (searchState.requestId === 0 || requestQuery.length < 2) {
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
        const response = await args.source.searchRegions(requestQuery);
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
  }, [args.source, searchState.requestQuery, searchState.requestId]);

  const selectedRegionId = selectedRegion?.regionId;
  const query = searchState.draftQuery;
  const minimumQueryLengthMet = query.trim().length >= 2;
  const hasCurrentSearch = searchState.requestId > 0 && searchState.requestQuery === query.trim();

  const setQuery = useCallback((value: string) => {
    lastAppliedExternalQueryRef.current = value;
    setErrorMessage(undefined);
    setSearchState((current) => (current.draftQuery === value ? current : editRegionSearchQuery(current, value)));
  }, []);

  const submitSearch = useCallback(() => {
    setErrorMessage(undefined);
    setSearchState((current) => submitRegionSearchQuery(current));
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
    const currentQuery = searchState.draftQuery.trim();
    if (currentQuery.length < 2) return;
    submitSearch();
  }, [searchState.draftQuery, submitSearch]);

  const clearSelection = useCallback(() => {
    lastAppliedExternalRegionIdRef.current = undefined;
    selectedRegionIdRef.current = undefined;
    setSelectedRegion((currentRegion) => (currentRegion ? undefined : currentRegion));
  }, []);

  return useMemo(() => ({
    query,
    setQuery,
    submitSearch,
    minimumQueryLengthMet,
    hasCurrentSearch,
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
    submitSearch,
    hasCurrentSearch,
    regions,
    retrySearch,
    selectRegion,
    selectedRegion,
    selectedRegionId,
    sourceLabel,
    usingFallback
  ]);
}
