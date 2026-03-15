import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PlayableRegionCatalogEntry } from './region-types.ts';
import type { RegionDataSource } from './region-data-source.ts';

interface UseRegionSearchArgs {
  source: RegionDataSource;
  initialRegionId?: string;
}

export function useRegionSearch(args: UseRegionSearchArgs) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [regions, setRegions] = useState<PlayableRegionCatalogEntry[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<PlayableRegionCatalogEntry | undefined>(undefined);
  const [sourceLabel, setSourceLabel] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [reloadToken, setReloadToken] = useState(0);
  const selectedRegionIdRef = useRef(args.initialRegionId);

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
        setSourceLabel('');
        setUsingFallback(false);
        setNoticeMessage(undefined);
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
        setSelectedRegion((currentRegion) => {
          if (currentRegion && (response.regions.some((region) => region.regionId === currentRegion.regionId) || debouncedQuery.trim().length >= 2)) {
            return currentRegion;
          }

          if (selectedRegionIdRef.current) {
            return response.regions.find((region) => region.regionId === selectedRegionIdRef.current);
          }

          return response.regions[0];
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setRegions([]);
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

  const selectRegion = useCallback(async (regionId: string) => {
    selectedRegionIdRef.current = regionId;
    const localMatch = regions.find((region) => region.regionId === regionId);
    if (localMatch) {
      setSelectedRegion(localMatch);
      return;
    }

    try {
      const region = await args.source.getRegionById(regionId);
      if (region) {
        setSelectedRegion(region);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The region boundary could not be loaded.');
    }
  }, [args.source, regions]);

  const retrySearch = useCallback(() => {
    setReloadToken((value) => value + 1);
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
    isLoading,
    errorMessage,
    selectRegion,
    retrySearch
  }), [
    errorMessage,
    isLoading,
    minimumQueryLengthMet,
    noticeMessage,
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
