import type { GeoJsonGeometryModel } from '../../../shared-types/src/index.ts';

import { pointInGeometry, geometryBoundingBox, createMultiPolygonGeometry, type LonLat } from './geojson.ts';
import { midpoint, projectCoordinate, unprojectCoordinate } from './planar.ts';

export interface GridFilterResult {
  keptGeometry?: GeoJsonGeometryModel;
  removedGeometry?: GeoJsonGeometryModel;
  keptCount: number;
  removedCount: number;
}

function buildCellPolygon(center: LonLat, halfStepLon: number, halfStepLat: number): LonLat[][] {
  return [[
    [center[0] - halfStepLon, center[1] - halfStepLat],
    [center[0] + halfStepLon, center[1] - halfStepLat],
    [center[0] + halfStepLon, center[1] + halfStepLat],
    [center[0] - halfStepLon, center[1] + halfStepLat],
    [center[0] - halfStepLon, center[1] - halfStepLat]
  ]];
}

export function filterGeometryByGrid(args: {
  baseGeometry: GeoJsonGeometryModel;
  stepMeters: number;
  predicate: (point: LonLat) => boolean;
}): GridFilterResult {
  const boundingBox = geometryBoundingBox(args.baseGeometry);
  if (!boundingBox) {
    return {
      keptCount: 0,
      removedCount: 0
    };
  }

  const originLatitude = (boundingBox.minLat + boundingBox.maxLat) / 2;
  const topLeft = projectCoordinate([boundingBox.minLon, boundingBox.maxLat], originLatitude);
  const bottomRight = projectCoordinate([boundingBox.maxLon, boundingBox.minLat], originLatitude);
  const halfStep = args.stepMeters / 2;
  const originCenter = midpoint(
    [boundingBox.minLon, boundingBox.minLat],
    [boundingBox.maxLon, boundingBox.maxLat]
  );
  const halfStepCoordinate = unprojectCoordinate(
    {
      x: projectCoordinate(originCenter, originLatitude).x + halfStep,
      y: projectCoordinate(originCenter, originLatitude).y + halfStep
    },
    originLatitude
  );
  const halfStepLon = Math.abs(halfStepCoordinate[0] - originCenter[0]);
  const halfStepLat = Math.abs(halfStepCoordinate[1] - originCenter[1]);

  const keptCells: LonLat[][][] = [];
  const removedCells: LonLat[][][] = [];

  for (let y = bottomRight.y + halfStep; y <= topLeft.y; y += args.stepMeters) {
    for (let x = topLeft.x + halfStep; x <= bottomRight.x; x += args.stepMeters) {
      const center = unprojectCoordinate({ x, y }, originLatitude);
      if (!pointInGeometry(center, args.baseGeometry)) {
        continue;
      }

      const cell = buildCellPolygon(center, halfStepLon, halfStepLat);
      if (args.predicate(center)) {
        keptCells.push(cell);
      } else {
        removedCells.push(cell);
      }
    }
  }

  return {
    keptGeometry: createMultiPolygonGeometry(keptCells),
    removedGeometry: createMultiPolygonGeometry(removedCells),
    keptCount: keptCells.length,
    removedCount: removedCells.length
  };
}
