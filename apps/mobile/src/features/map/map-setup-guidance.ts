import type { ScaleKey, VisibleMapProjection } from '../../../../../packages/shared-types/src/index.ts';

import type { PlayableRegionCatalogEntry } from './region-types.ts';

export interface MapScaleGuidanceModel {
  suggestedScale: ScaleKey;
  title: string;
  detail: string;
  note: string;
}

function hasCountrySizedSelection(region: PlayableRegionCatalogEntry) {
  const source = `${region.displayName} ${region.summary} ${region.countryLabel ?? ''}`.toLowerCase();
  return source.includes('country') || source.includes('republic') || source.includes('state');
}

export function buildMapScaleGuidanceModel(args: {
  selectedRegions: PlayableRegionCatalogEntry[];
  appliedMap?: VisibleMapProjection;
}): MapScaleGuidanceModel {
  const selection = args.selectedRegions;
  const selectionCount = selection.length;
  const currentRegionKind = selection[0]?.regionKind ?? args.appliedMap?.regionKind;
  const hasCountrySelection = selection.some(hasCountrySizedSelection);

  if (hasCountrySelection || selectionCount >= 3) {
    return {
      suggestedScale: 'large',
      title: 'Large-scale map recommended',
      detail: 'This setup covers several regions or country-sized boundaries, so a large game scale is the safest fit.',
      note: 'Match scale is chosen when the match is created in the current build.'
    };
  }

  if (selectionCount >= 2 || currentRegionKind === 'admin_region' || currentRegionKind === 'custom') {
    return {
      suggestedScale: 'medium',
      title: 'Medium-scale map recommended',
      detail: 'This playable region is broader than a single city, so medium scale is likely the best balance.',
      note: 'Match scale is chosen when the match is created in the current build.'
    };
  }

  return {
    suggestedScale: 'small',
    title: 'Small-scale map recommended',
    detail: 'A single city-sized playable region usually works best as a small game.',
    note: 'Match scale is chosen when the match is created in the current build.'
  };
}

export function buildAppliedRegionDraft(
  visibleMap: VisibleMapProjection | undefined
): PlayableRegionCatalogEntry[] {
  if (!visibleMap) {
    return [];
  }

  return [
    {
      regionId: visibleMap.regionId,
      displayName: visibleMap.displayName,
      regionKind: visibleMap.regionKind,
      summary: 'This is the playable region currently applied to the match.',
      featureDatasetRefs: visibleMap.featureDatasetRefs,
      geometry: visibleMap.playableBoundary.geometry ?? {
        type: 'Polygon',
        coordinates: []
      },
      sourceKind: 'composite_selection',
      sourceLabel: 'Applied match boundary',
      searchAliases: [visibleMap.displayName]
    }
  ];
}

export function resolveMapCanvasPreviewRegion(args: {
  appliedMap?: VisibleMapProjection;
  compositePreviewRegion?: PlayableRegionCatalogEntry;
  searchPreviewRegion?: PlayableRegionCatalogEntry;
  liveGameplayState: boolean;
  loadState: 'idle' | 'loading' | 'ready' | 'error';
}): PlayableRegionCatalogEntry | undefined {
  const draftPreviewRegion = args.compositePreviewRegion ?? args.searchPreviewRegion;

  if (!draftPreviewRegion) {
    return undefined;
  }

  if (args.liveGameplayState) {
    return undefined;
  }

  if (!args.appliedMap) {
    return draftPreviewRegion;
  }

  if (args.loadState === 'error') {
    return undefined;
  }

  return draftPreviewRegion.regionId === args.appliedMap.regionId
    ? undefined
    : draftPreviewRegion;
}
