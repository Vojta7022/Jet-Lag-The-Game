import type { GeoJsonGeometryModel } from '../../../shared-types/src/index.ts';

import { distanceMeters, midpoint, projectCoordinate, unprojectCoordinate } from './planar.ts';
import {
  createMultiPolygonGeometry,
  createPolygonGeometry,
  geometryBoundingBox,
  polygonRingsFromGeometry,
  type LonLat
} from './geojson.ts';

interface ProjectedRingPoint {
  coordinate: LonLat;
  projectedX: number;
  projectedY: number;
}

function crossProduct(origin: LonLat, left: LonLat, right: LonLat, originLatitude: number): number {
  const projectedOrigin = projectCoordinate(origin, originLatitude);
  const projectedLeft = projectCoordinate(left, originLatitude);
  const projectedRight = projectCoordinate(right, originLatitude);

  return (
    (projectedLeft.x - projectedOrigin.x) * (projectedRight.y - projectedOrigin.y) -
    (projectedLeft.y - projectedOrigin.y) * (projectedRight.x - projectedOrigin.x)
  );
}

export function isConvexRing(ring: LonLat[]): boolean {
  if (ring.length < 4) {
    return false;
  }

  const originLatitude = ring.reduce((sum, coordinate) => sum + coordinate[1], 0) / ring.length;
  let sign = 0;

  for (let index = 0; index < ring.length - 2; index += 1) {
    const cross = crossProduct(ring[index], ring[index + 1], ring[index + 2], originLatitude);
    if (Math.abs(cross) < Number.EPSILON) {
      continue;
    }

    const nextSign = Math.sign(cross);
    if (sign === 0) {
      sign = nextSign;
      continue;
    }

    if (sign !== nextSign) {
      return false;
    }
  }

  return true;
}

function clipPointAgainstHalfPlane(
  point: LonLat,
  lineStart: LonLat,
  lineEnd: LonLat,
  keepSign: 1 | -1,
  originLatitude: number
): boolean {
  return keepSign * crossProduct(lineStart, lineEnd, point, originLatitude) >= -1e-9;
}

function lineIntersection(
  segmentStart: LonLat,
  segmentEnd: LonLat,
  lineStart: LonLat,
  lineEnd: LonLat,
  originLatitude: number
): LonLat {
  const a = projectCoordinate(segmentStart, originLatitude);
  const b = projectCoordinate(segmentEnd, originLatitude);
  const c = projectCoordinate(lineStart, originLatitude);
  const d = projectCoordinate(lineEnd, originLatitude);

  const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denominator) < 1e-9) {
    return segmentEnd;
  }

  const determinantSegment = a.x * b.y - a.y * b.x;
  const determinantLine = c.x * d.y - c.y * d.x;
  const intersection = {
    x: (determinantSegment * (c.x - d.x) - (a.x - b.x) * determinantLine) / denominator,
    y: (determinantSegment * (c.y - d.y) - (a.y - b.y) * determinantLine) / denominator
  };

  return unprojectCoordinate(intersection, originLatitude);
}

function clipRingAgainstHalfPlane(
  ring: LonLat[],
  lineStart: LonLat,
  lineEnd: LonLat,
  keepSign: 1 | -1,
  originLatitude: number
): LonLat[] {
  const output: LonLat[] = [];

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const previous = ring[(index + ring.length - 1) % ring.length];
    const currentInside = clipPointAgainstHalfPlane(current, lineStart, lineEnd, keepSign, originLatitude);
    const previousInside = clipPointAgainstHalfPlane(previous, lineStart, lineEnd, keepSign, originLatitude);

    if (currentInside) {
      if (!previousInside) {
        output.push(lineIntersection(previous, current, lineStart, lineEnd, originLatitude));
      }
      output.push(current);
    } else if (previousInside) {
      output.push(lineIntersection(previous, current, lineStart, lineEnd, originLatitude));
    }
  }

  if (output.length === 0) {
    return output;
  }

  const first = output[0];
  const last = output[output.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    output.push(first);
  }

  return output;
}

export function clipGeometryWithHalfPlane(args: {
  subject: GeoJsonGeometryModel;
  lineStart: LonLat;
  lineEnd: LonLat;
  keepSide: 'left' | 'right';
}): GeoJsonGeometryModel | undefined {
  const polygons = polygonRingsFromGeometry(args.subject);
  if (polygons.length === 0) {
    return undefined;
  }

  const boundingBox = geometryBoundingBox(args.subject);
  const originLatitude = boundingBox ? (boundingBox.minLat + boundingBox.maxLat) / 2 : args.lineStart[1];
  const keepSign = args.keepSide === 'left' ? 1 : -1;
  const clippedPolygons = polygons
    .map((polygon) => {
      const clippedOuter = clipRingAgainstHalfPlane(
        polygon[0],
        args.lineStart,
        args.lineEnd,
        keepSign,
        originLatitude
      );
      return clippedOuter.length >= 4 ? [clippedOuter] : [];
    })
    .filter((polygon) => polygon.length > 0);

  if (clippedPolygons.length === 0) {
    return undefined;
  }

  return clippedPolygons.length === 1
    ? createPolygonGeometry(clippedPolygons[0])
    : createMultiPolygonGeometry(clippedPolygons);
}

export function clipGeometryToConvexPolygon(args: {
  subject: GeoJsonGeometryModel;
  clip: GeoJsonGeometryModel;
}): GeoJsonGeometryModel | undefined {
  const clipPolygon = polygonRingsFromGeometry(args.clip)[0]?.[0];
  if (!clipPolygon || !isConvexRing(clipPolygon)) {
    return undefined;
  }

  let clipped = args.subject;
  const originLatitude = clipPolygon.reduce((sum, coordinate) => sum + coordinate[1], 0) / clipPolygon.length;

  for (let index = 0; index < clipPolygon.length - 1; index += 1) {
    const lineStart = clipPolygon[index];
    const lineEnd = clipPolygon[index + 1];
    const insideTestPoint = clipPolygon[(index + 2) % (clipPolygon.length - 1)];
    const keepSide =
      crossProduct(lineStart, lineEnd, insideTestPoint, originLatitude) >= 0 ? 'left' : 'right';
    clipped = clipGeometryWithHalfPlane({
      subject: clipped,
      lineStart,
      lineEnd,
      keepSide
    }) as GeoJsonGeometryModel;

    if (!clipped) {
      return undefined;
    }
  }

  return clipped;
}

export function buildCirclePolygon(args: {
  center: LonLat;
  radiusMeters: number;
  segments?: number;
}): GeoJsonGeometryModel {
  const segments = Math.max(24, args.segments ?? 48);
  const originLatitude = args.center[1];
  const projectedCenter = projectCoordinate(args.center, originLatitude);
  const ring: LonLat[] = [];

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    ring.push(
      unprojectCoordinate(
        {
          x: projectedCenter.x + Math.cos(angle) * args.radiusMeters,
          y: projectedCenter.y + Math.sin(angle) * args.radiusMeters
        },
        originLatitude
      )
    );
  }

  return createPolygonGeometry([ring]) as GeoJsonGeometryModel;
}

export function relationHalfPlane(args: {
  from: LonLat;
  to: LonLat;
  relation: 'closer_to_to' | 'closer_to_from';
  subject: GeoJsonGeometryModel;
}): GeoJsonGeometryModel | undefined {
  const pivot = midpoint(args.from, args.to);
  const dx = args.to[0] - args.from[0];
  const dy = args.to[1] - args.from[1];
  const normalEnd: LonLat = [pivot[0] - dy, pivot[1] + dx];

  const targetSidePoint = args.relation === 'closer_to_to' ? args.to : args.from;
  const originLatitude = (args.from[1] + args.to[1]) / 2;
  const keepSide =
    crossProduct(pivot, normalEnd, targetSidePoint, originLatitude) >= 0 ? 'left' : 'right';

  return clipGeometryWithHalfPlane({
    subject: args.subject,
    lineStart: pivot,
    lineEnd: normalEnd,
    keepSide
  });
}

export function withinDistance(
  point: LonLat,
  target: LonLat,
  thresholdMeters: number
): boolean {
  return distanceMeters(point, target) <= thresholdMeters;
}
