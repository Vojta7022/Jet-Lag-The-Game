import {
  createMultiPolygonGeometry,
  createPolygonGeometry,
  polygonRingsFromGeometry
} from '../../../../../packages/geo/src/index.ts';

import type {
  CompositeRegionComponent,
  CompositeRegionWarning,
  PlayableRegionCatalogEntry
} from './region-types.ts';
import { getGeometryBounds, type GeometryBounds } from './map-geometry.ts';

function dedupeRegions(regions: PlayableRegionCatalogEntry[]): PlayableRegionCatalogEntry[] {
  const seenRegionIds = new Set<string>();
  const uniqueRegions: PlayableRegionCatalogEntry[] = [];

  for (const region of regions) {
    if (seenRegionIds.has(region.regionId)) {
      continue;
    }

    seenRegionIds.add(region.regionId);
    uniqueRegions.push(region);
  }

  return uniqueRegions;
}

function createComponentRegion(region: PlayableRegionCatalogEntry): CompositeRegionComponent {
  return {
    regionId: region.regionId,
    displayName: region.displayName,
    regionKind: region.regionKind,
    summary: region.summary,
    geometry: region.geometry,
    featureDatasetRefs: region.featureDatasetRefs,
    sourceKind: region.sourceKind === 'composite_selection' ? 'provider_catalog' : region.sourceKind,
    sourceLabel: region.sourceLabel,
    countryLabel: region.countryLabel,
    parentRegionLabel: region.parentRegionLabel,
    providerMetadata: region.providerMetadata
  };
}

function joinUnique(values: Array<string | undefined>): string | undefined {
  const uniqueValues = Array.from(new Set(
    values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
  ));

  if (uniqueValues.length === 0) {
    return undefined;
  }

  return uniqueValues.join(', ');
}

function buildCompositeRegionId(regions: PlayableRegionCatalogEntry[]): string {
  return `composite:${regions.map((region) => region.regionId).sort().join('+')}`;
}

function buildCompositeDisplayLabel(regions: PlayableRegionCatalogEntry[]): string {
  return regions.map((region) => region.displayName).join(' + ');
}

function buildCompositeSummary(regions: PlayableRegionCatalogEntry[]): string {
  const sourceLabels = Array.from(new Set(regions.map((region) => region.sourceLabel)));
  const regionNames = regions.map((region) => region.displayName).join(', ');
  return `Composite playable region built from ${regions.length} selected regions: ${regionNames}. Source${sourceLabels.length === 1 ? '' : 's'}: ${sourceLabels.join(', ')}.`;
}

function combineFeatureDatasetRefs(regions: PlayableRegionCatalogEntry[]): string[] {
  return Array.from(new Set(regions.flatMap((region) => region.featureDatasetRefs)));
}

function combineSearchAliases(regions: PlayableRegionCatalogEntry[]): string[] {
  return Array.from(new Set(regions.flatMap((region) => [
    region.displayName,
    ...region.searchAliases
  ])));
}

function buildRawCombinedGeometry(regions: PlayableRegionCatalogEntry[]) {
  const polygons = regions.flatMap((region) => polygonRingsFromGeometry(region.geometry));
  if (polygons.length === 0) {
    return undefined;
  }

  if (polygons.length === 1) {
    return createPolygonGeometry(polygons[0] ?? []);
  }

  return createMultiPolygonGeometry(polygons);
}

function boundsAppearConnected(left: GeometryBounds | undefined, right: GeometryBounds | undefined): boolean {
  if (!left || !right) {
    return false;
  }

  const epsilon = 0.0005;
  const separatedLongitude =
    left.maxLongitude + epsilon < right.minLongitude ||
    right.maxLongitude + epsilon < left.minLongitude;
  const separatedLatitude =
    left.maxLatitude + epsilon < right.minLatitude ||
    right.maxLatitude + epsilon < left.minLatitude;

  return !separatedLongitude && !separatedLatitude;
}

export function addRegionToSelection(
  selectedRegions: PlayableRegionCatalogEntry[],
  region: PlayableRegionCatalogEntry
): PlayableRegionCatalogEntry[] {
  return dedupeRegions([...selectedRegions, region]);
}

export function removeRegionFromSelection(
  selectedRegions: PlayableRegionCatalogEntry[],
  regionId: string
): PlayableRegionCatalogEntry[] {
  return selectedRegions.filter((region) => region.regionId !== regionId);
}

export function clearSelectedRegions(): PlayableRegionCatalogEntry[] {
  return [];
}

export function analyzeCompositeRegionWarning(
  regions: PlayableRegionCatalogEntry[]
): CompositeRegionWarning | undefined {
  const uniqueRegions = dedupeRegions(regions);
  if (uniqueRegions.length <= 1) {
    return undefined;
  }

  const boundsByRegionId = new Map(
    uniqueRegions.map((region) => [region.regionId, getGeometryBounds(region.geometry)])
  );
  const visitedRegionIds = new Set<string>();
  let connectedGroupCount = 0;

  for (const region of uniqueRegions) {
    if (visitedRegionIds.has(region.regionId)) {
      continue;
    }

    connectedGroupCount += 1;
    const queue = [region];
    visitedRegionIds.add(region.regionId);

    while (queue.length > 0) {
      const currentRegion = queue.shift();
      if (!currentRegion) {
        continue;
      }

      const currentBounds = boundsByRegionId.get(currentRegion.regionId);
      for (const candidate of uniqueRegions) {
        if (visitedRegionIds.has(candidate.regionId)) {
          continue;
        }

        const candidateBounds = boundsByRegionId.get(candidate.regionId);
        if (!boundsAppearConnected(currentBounds, candidateBounds)) {
          continue;
        }

        visitedRegionIds.add(candidate.regionId);
        queue.push(candidate);
      }
    }
  }

  if (connectedGroupCount <= 1) {
    return undefined;
  }

  return {
    connectedGroupCount,
    summary: `The selected regions appear to form ${connectedGroupCount} disconnected groups. Applying them is allowed, but the playable map may contain separate islands.`
  };
}

export function buildCompositePlayableRegion(
  selectedRegions: PlayableRegionCatalogEntry[]
): PlayableRegionCatalogEntry | undefined {
  const allRegions = dedupeRegions(selectedRegions);
  if (allRegions.length === 0) {
    return undefined;
  }

  if (allRegions.length === 1) {
    return allRegions[0];
  }

  const rawCombinedGeometry = buildRawCombinedGeometry(allRegions);
  if (!rawCombinedGeometry) {
    return undefined;
  }

  const displayLabel = buildCompositeDisplayLabel(allRegions);
  const summary = buildCompositeSummary(allRegions);
  const disconnectedWarning = analyzeCompositeRegionWarning(allRegions);

  return {
    regionId: buildCompositeRegionId(allRegions),
    displayName: displayLabel,
    regionKind: 'custom',
    summary,
    featureDatasetRefs: combineFeatureDatasetRefs(allRegions),
    geometry: rawCombinedGeometry,
    sourceKind: 'composite_selection',
    sourceLabel: 'Composite region builder',
    searchAliases: combineSearchAliases(allRegions),
    countryLabel: joinUnique(allRegions.map((region) => region.countryLabel)),
    parentRegionLabel: undefined,
    compositeMetadata: {
      componentRegions: allRegions.map(createComponentRegion),
      sourceProviderLabels: Array.from(new Set(allRegions.map((region) => region.sourceLabel))),
      combinedGeometry: rawCombinedGeometry,
      rawCombinedGeometry,
      displayLabel,
      summary,
      dissolveStatus: 'disabled_stable_raw',
      dissolveNotice: 'Stable composite rendering is using the raw component boundaries. Shared internal borders may remain visible until a future robust union implementation is added.',
      disconnectedWarning
    }
  };
}
