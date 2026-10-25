import {
  createMultiPolygonGeometry,
  createPolygonGeometry,
  pointInGeometry,
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

function buildCompositeRegionId(regions: PlayableRegionCatalogEntry[], excludedRegions: PlayableRegionCatalogEntry[]): string {
  const includedIds = regions.map((region) => region.regionId).sort().join('+');
  const excludedIds = excludedRegions.map((region) => region.regionId).sort().join('-');
  return `composite:${includedIds}${excludedIds ? `\\exclude:${excludedIds}` : ''}`;
}

function buildCompositeDisplayLabel(regions: PlayableRegionCatalogEntry[], excludedRegions: PlayableRegionCatalogEntry[]): string {
  const included = regions.map((region) => region.displayName).join(' + ');
  const excluded = excludedRegions.map((region) => region.displayName).join(' − ');
  return excluded ? `${included} − ${excluded}` : included;
}

function buildCompositeSummary(regions: PlayableRegionCatalogEntry[], excludedRegions: PlayableRegionCatalogEntry[]): string {
  const sourceLabels = Array.from(new Set([...regions, ...excludedRegions].map((region) => region.sourceLabel)));
  const regionNames = regions.map((region) => region.displayName).join(', ');
  const excludedNames = excludedRegions.map((region) => region.displayName).join(', ');
  const exclusionSummary = excludedNames ? ` Excluded: ${excludedNames}.` : '';
  return `Composite playable region built from ${regions.length} included region${regions.length === 1 ? '' : 's'}: ${regionNames}.${exclusionSummary} Source${sourceLabels.length === 1 ? '' : 's'}: ${sourceLabels.join(', ')}.`;
}

function combineFeatureDatasetRefs(regions: PlayableRegionCatalogEntry[], excludedRegions: PlayableRegionCatalogEntry[]): string[] {
  return Array.from(new Set([...regions, ...excludedRegions].flatMap((region) => region.featureDatasetRefs)));
}

function combineSearchAliases(regions: PlayableRegionCatalogEntry[], excludedRegions: PlayableRegionCatalogEntry[]): string[] {
  return Array.from(new Set([...regions, ...excludedRegions].flatMap((region) => [
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

function cross(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentIntersects(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const first = cross(a, b, c);
  const second = cross(a, b, d);
  const third = cross(c, d, a);
  const fourth = cross(c, d, b);
  return first * second <= 0 && third * fourth <= 0 &&
    Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <= Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
    Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <= Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]));
}

function polygonBoundariesIntersect(left: number[][][], right: number[][][]): boolean {
  const leftRings = left as [number, number][][];
  const rightRings = right as [number, number][][];
  return leftRings.some((leftRing) => rightRings.some((rightRing) => {
    for (let leftIndex = 0; leftIndex < leftRing.length - 1; leftIndex += 1) {
      for (let rightIndex = 0; rightIndex < rightRing.length - 1; rightIndex += 1) {
        if (segmentIntersects(leftRing[leftIndex]!, leftRing[leftIndex + 1]!, rightRing[rightIndex]!, rightRing[rightIndex + 1]!)) {
          return true;
        }
      }
    }
    return false;
  }));
}

function buildDifferenceGeometry(
  includedRegions: PlayableRegionCatalogEntry[],
  excludedRegions: PlayableRegionCatalogEntry[]
) {
  const includedPolygons = includedRegions.flatMap((region) => polygonRingsFromGeometry(region.geometry));
  const outputPolygons = includedPolygons.map((polygon) => polygon.map((ring) => [...ring]));
  let invalidOverlap = false;

  for (const excludedRegion of excludedRegions) {
    const excludedPolygons = polygonRingsFromGeometry(excludedRegion.geometry);
    if (excludedPolygons.length === 0 || excludedPolygons.some((polygon) => polygon.length !== 1)) return undefined;

    for (const excludedPolygon of excludedPolygons) {
      const excludedOuterRing = excludedPolygon[0];
      if (!excludedOuterRing || excludedOuterRing.length < 4) return undefined;
      let matchedIncludedPolygon = false;
      const excludedGeometry = createPolygonGeometry(excludedPolygon);
      if (!excludedGeometry) return undefined;

      includedPolygons.forEach((includedPolygon, index) => {
        const includedGeometry = createPolygonGeometry(includedPolygon);
        const includedOuter = includedPolygon[0];
        if (!includedGeometry || !includedOuter) return;
        const fullyInside = excludedOuterRing.slice(0, -1).every((point) => pointInGeometry(point, includedGeometry));
        const boundaryIntersects = polygonBoundariesIntersect([excludedOuterRing], includedPolygon);
        const touchesIncluded = excludedOuterRing.slice(0, -1).some((point) => pointInGeometry(point, includedGeometry));
        const includesExcluded = includedOuter.slice(0, -1).some((point) => pointInGeometry(point, excludedGeometry));
        if (!fullyInside || boundaryIntersects) {
          if (boundaryIntersects || touchesIncluded || includesExcluded) invalidOverlap = true;
          return;
        }
        matchedIncludedPolygon = true;
        outputPolygons[index]!.push([...excludedOuterRing]);
      });

      if (!matchedIncludedPolygon || invalidOverlap) return undefined;
    }
  }

  const geometry = outputPolygons.length === 1
    ? createPolygonGeometry(outputPolygons[0]!)
    : createMultiPolygonGeometry(outputPolygons);
  return geometry;
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
  selectedRegions: PlayableRegionCatalogEntry[],
  excludedRegions: PlayableRegionCatalogEntry[] = []
): PlayableRegionCatalogEntry | undefined {
  const allRegions = dedupeRegions(selectedRegions);
  const allExcludedRegions = dedupeRegions(excludedRegions).filter((region) => !allRegions.some((included) => included.regionId === region.regionId));
  if (allRegions.length === 0) {
    return undefined;
  }

  if (allRegions.length === 1 && allExcludedRegions.length === 0) {
    return allRegions[0];
  }

  const rawCombinedGeometry = allExcludedRegions.length > 0
    ? buildDifferenceGeometry(allRegions, allExcludedRegions)
    : buildRawCombinedGeometry(allRegions);
  if (!rawCombinedGeometry) {
    return undefined;
  }

  const displayLabel = buildCompositeDisplayLabel(allRegions, allExcludedRegions);
  const summary = buildCompositeSummary(allRegions, allExcludedRegions);
  const disconnectedWarning = analyzeCompositeRegionWarning(allRegions);

  return {
    regionId: buildCompositeRegionId(allRegions, allExcludedRegions),
    displayName: displayLabel,
    regionKind: 'custom',
    summary,
    featureDatasetRefs: combineFeatureDatasetRefs(allRegions, allExcludedRegions),
    geometry: rawCombinedGeometry,
    sourceKind: 'composite_selection',
    sourceLabel: 'Composite region builder',
    searchAliases: combineSearchAliases(allRegions, allExcludedRegions),
    countryLabel: joinUnique(allRegions.map((region) => region.countryLabel)),
    parentRegionLabel: undefined,
    compositeMetadata: {
      componentRegions: allRegions.map(createComponentRegion),
      excludedRegions: allExcludedRegions.map(createComponentRegion),
      sourceProviderLabels: Array.from(new Set([...allRegions, ...allExcludedRegions].map((region) => region.sourceLabel))),
      combinedGeometry: rawCombinedGeometry,
      rawCombinedGeometry,
      displayLabel,
      summary,
      dissolveStatus: 'disabled_stable_raw',
      dissolveNotice: allExcludedRegions.length === 0
        ? 'Stable composite rendering is using the raw component boundaries. Shared internal borders may remain visible until a future robust union implementation is added.'
        : undefined,
      disconnectedWarning
    }
  };
}
