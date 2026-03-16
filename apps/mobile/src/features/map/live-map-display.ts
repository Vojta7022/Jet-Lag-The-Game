import type { VisibleMapProjection } from '../../../../../packages/shared-types/src/index.ts';

function hasMeaningfulSearchUpdate(visibleMap: VisibleMapProjection): boolean {
  return visibleMap.history.length > 0 ||
    visibleMap.eliminatedAreas.length > 0 ||
    visibleMap.constraintArtifacts.length > 0;
}

export function buildLiveMapDisplayProjection(
  visibleMap: VisibleMapProjection | undefined
): VisibleMapProjection | undefined {
  if (!visibleMap) {
    return undefined;
  }

  if (!visibleMap.remainingArea) {
    return visibleMap;
  }

  if (visibleMap.remainingArea.regionId !== visibleMap.regionId) {
    return {
      ...visibleMap,
      remainingArea: undefined
    };
  }

  if (!hasMeaningfulSearchUpdate(visibleMap)) {
    return {
      ...visibleMap,
      remainingArea: undefined
    };
  }

  return visibleMap;
}
