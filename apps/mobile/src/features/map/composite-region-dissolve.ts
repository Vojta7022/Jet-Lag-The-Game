import {
  createMultiPolygonGeometry,
  createPolygonGeometry,
  pointInGeometry,
  polygonRingsFromGeometry,
  projectCoordinate,
  unprojectCoordinate,
  type LonLat
} from '../../../../../packages/geo/src/index.ts';
import type { GeoJsonGeometryModel } from '../../../../../packages/shared-types/src/index.ts';

const pointPrecisionFactor = 1_000_000;
const boundaryOffsetMeters = 10;
const minimumSegmentLengthMeters = 0.5;
const defaultMaxBoundaryPointCount = 1_500;
const defaultMaxBoundarySegmentCount = 1_500;
const defaultMaxElapsedMs = 24;

interface BoundarySegment {
  start: LonLat;
  end: LonLat;
}

export interface CompositeRegionDissolveOptions {
  maxBoundaryPointCount?: number;
  maxBoundarySegmentCount?: number;
  maxElapsedMs?: number;
}

interface DissolveRuntime {
  startedAt: number;
  maxElapsedMs: number;
  remainingSegmentBudget: number;
}

interface DissolvedGeometryResult {
  geometry: GeoJsonGeometryModel;
  exact: true;
}

export interface DissolvedGeometryFallbackResult {
  exact: false;
  fallbackReason: 'too_complex' | 'error';
}

export type CompositeRegionDissolveResult =
  | DissolvedGeometryResult
  | DissolvedGeometryFallbackResult;

class DissolveAbortError extends Error {
  constructor() {
    super('Composite dissolve aborted due to safety limits.');
  }
}

function closeRing(ring: LonLat[]): LonLat[] {
  if (ring.length === 0) {
    return ring;
  }

  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }

  return [...ring, first];
}

function toPointKey(point: LonLat): string {
  return `${Math.round(point[0] * pointPrecisionFactor)}:${Math.round(point[1] * pointPrecisionFactor)}`;
}

function lonLatEquals(left: LonLat, right: LonLat): boolean {
  return toPointKey(left) === toPointKey(right);
}

function unionContainsPoint(point: LonLat, geometries: GeoJsonGeometryModel[]): boolean {
  return geometries.some((geometry) => pointInGeometry(point, geometry));
}

function countBoundaryPoints(componentGeometries: GeoJsonGeometryModel[]): number {
  return componentGeometries
    .flatMap((geometry) => polygonRingsFromGeometry(geometry))
    .reduce((total, polygon) => total + polygon.reduce((polygonTotal, ring) => polygonTotal + ring.length, 0), 0);
}

function assertWithinSafetyBudget(runtime: DissolveRuntime) {
  runtime.remainingSegmentBudget -= 1;
  if (runtime.remainingSegmentBudget < 0 || Date.now() - runtime.startedAt > runtime.maxElapsedMs) {
    throw new DissolveAbortError();
  }
}

function signedRingArea(ring: LonLat[]): number {
  if (ring.length < 4) {
    return 0;
  }

  const referenceLatitude = ring.reduce((sum, coordinate) => sum + coordinate[1], 0) / ring.length;
  let area = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = projectCoordinate(ring[index]!, referenceLatitude);
    const next = projectCoordinate(ring[index + 1]!, referenceLatitude);
    area += current.x * next.y - next.x * current.y;
  }

  return area / 2;
}

function sampleInteriorPointForRing(ring: LonLat[]): LonLat | undefined {
  if (ring.length < 4) {
    return undefined;
  }

  const uniquePoints = ring.slice(0, -1);
  if (uniquePoints.length === 0) {
    return undefined;
  }

  const averageLongitude =
    uniquePoints.reduce((sum, point) => sum + point[0], 0) / uniquePoints.length;
  const averageLatitude =
    uniquePoints.reduce((sum, point) => sum + point[1], 0) / uniquePoints.length;

  return [averageLongitude, averageLatitude];
}

function classifyBoundarySegment(
  start: LonLat,
  end: LonLat,
  componentGeometries: GeoJsonGeometryModel[],
  runtime: DissolveRuntime
): BoundarySegment | undefined {
  assertWithinSafetyBudget(runtime);

  const referenceLatitude = (start[1] + end[1]) / 2;
  const projectedStart = projectCoordinate(start, referenceLatitude);
  const projectedEnd = projectCoordinate(end, referenceLatitude);
  const dx = projectedEnd.x - projectedStart.x;
  const dy = projectedEnd.y - projectedStart.y;
  const length = Math.hypot(dx, dy);

  if (length < minimumSegmentLengthMeters) {
    return undefined;
  }

  const midpoint = {
    x: (projectedStart.x + projectedEnd.x) / 2,
    y: (projectedStart.y + projectedEnd.y) / 2
  };
  const normalX = -dy / length;
  const normalY = dx / length;
  const leftPoint = unprojectCoordinate(
    {
      x: midpoint.x + normalX * boundaryOffsetMeters,
      y: midpoint.y + normalY * boundaryOffsetMeters
    },
    referenceLatitude
  );
  const rightPoint = unprojectCoordinate(
    {
      x: midpoint.x - normalX * boundaryOffsetMeters,
      y: midpoint.y - normalY * boundaryOffsetMeters
    },
    referenceLatitude
  );
  const leftInside = unionContainsPoint(leftPoint, componentGeometries);
  const rightInside = unionContainsPoint(rightPoint, componentGeometries);

  if (leftInside === rightInside) {
    return undefined;
  }

  return leftInside
    ? { start, end }
    : { start: end, end: start };
}

function collectBoundarySegments(
  componentGeometries: GeoJsonGeometryModel[],
  runtime: DissolveRuntime
): BoundarySegment[] {
  const segments: BoundarySegment[] = [];

  for (const geometry of componentGeometries) {
    for (const polygon of polygonRingsFromGeometry(geometry)) {
      for (const ring of polygon) {
        const closedRing = closeRing(ring);
        for (let index = 0; index < closedRing.length - 1; index += 1) {
          const segment = classifyBoundarySegment(
            closedRing[index]!,
            closedRing[index + 1]!,
            componentGeometries,
            runtime
          );
          if (segment) {
            segments.push(segment);
          }
        }
      }
    }
  }

  return segments;
}

function reconstructBoundaryRings(
  segments: BoundarySegment[],
  runtime: DissolveRuntime
): LonLat[][] | undefined {
  if (segments.length === 0) {
    return undefined;
  }

  const outgoingSegments = new Map<string, number[]>();
  for (let index = 0; index < segments.length; index += 1) {
    const startKey = toPointKey(segments[index]!.start);
    const existing = outgoingSegments.get(startKey) ?? [];
    existing.push(index);
    outgoingSegments.set(startKey, existing);
  }

  const visitedSegments = new Set<number>();
  const rings: LonLat[][] = [];

  for (let index = 0; index < segments.length; index += 1) {
    if (visitedSegments.has(index)) {
      continue;
    }

    const startSegment = segments[index]!;
    const ring: LonLat[] = [startSegment.start, startSegment.end];
    visitedSegments.add(index);
    let currentPoint = startSegment.end;
    let safetyCounter = 0;

    while (!lonLatEquals(currentPoint, startSegment.start) && safetyCounter <= segments.length + 2) {
      assertWithinSafetyBudget(runtime);
      safetyCounter += 1;
      const nextSegmentCandidates = (outgoingSegments.get(toPointKey(currentPoint)) ?? []).filter(
        (candidateIndex) => !visitedSegments.has(candidateIndex)
      );
      const nextSegmentIndex = nextSegmentCandidates[0];

      if (nextSegmentCandidates.length > 1 || nextSegmentIndex === undefined) {
        return undefined;
      }

      const nextSegment = segments[nextSegmentIndex]!;
      visitedSegments.add(nextSegmentIndex);
      ring.push(nextSegment.end);
      currentPoint = nextSegment.end;
    }

    if (!lonLatEquals(ring[0]!, ring[ring.length - 1]!)) {
      return undefined;
    }

    if (ring.length >= 4) {
      rings.push(ring);
    }
  }

  return rings.length > 0 ? rings : undefined;
}

function groupRingsIntoPolygons(rings: LonLat[][]): LonLat[][][] | undefined {
  if (rings.length === 0) {
    return undefined;
  }

  const outerRings = rings.filter((ring) => signedRingArea(ring) > 0);
  const holeRings = rings.filter((ring) => signedRingArea(ring) < 0);

  if (outerRings.length === 0) {
    return undefined;
  }

  const polygons = outerRings.map((outerRing) => [outerRing]);

  for (const holeRing of holeRings) {
    const representativePoint = sampleInteriorPointForRing(holeRing);
    if (!representativePoint) {
      continue;
    }

    const containingPolygon = polygons.find((polygon) => pointInGeometry(
      representativePoint,
      createPolygonGeometry([polygon[0]!])
    ));

    if (containingPolygon) {
      containingPolygon.push(holeRing);
    }
  }

  return polygons;
}

function buildRawCombinedGeometry(componentGeometries: GeoJsonGeometryModel[]): GeoJsonGeometryModel | undefined {
  const polygons = componentGeometries.flatMap((geometry) => polygonRingsFromGeometry(geometry));
  if (polygons.length === 0) {
    return undefined;
  }

  if (polygons.length === 1) {
    return createPolygonGeometry(polygons[0]!);
  }

  return createMultiPolygonGeometry(polygons);
}

export function dissolveCompositeRegionGeometry(
  componentGeometries: GeoJsonGeometryModel[],
  options: CompositeRegionDissolveOptions = {}
): CompositeRegionDissolveResult | undefined {
  const totalBoundaryPoints = countBoundaryPoints(componentGeometries);
  const maxBoundaryPointCount = options.maxBoundaryPointCount ?? defaultMaxBoundaryPointCount;
  if (totalBoundaryPoints > maxBoundaryPointCount) {
    return {
      exact: false,
      fallbackReason: 'too_complex'
    };
  }

  const rawCombinedGeometry = buildRawCombinedGeometry(componentGeometries);
  if (!rawCombinedGeometry) {
    return undefined;
  }

  const runtime: DissolveRuntime = {
    startedAt: Date.now(),
    maxElapsedMs: options.maxElapsedMs ?? defaultMaxElapsedMs,
    remainingSegmentBudget: options.maxBoundarySegmentCount ?? defaultMaxBoundarySegmentCount
  };

  try {
    const boundarySegments = collectBoundarySegments(componentGeometries, runtime);
    const boundaryRings = reconstructBoundaryRings(boundarySegments, runtime);
    const boundaryPolygons = boundaryRings ? groupRingsIntoPolygons(boundaryRings) : undefined;

    if (!boundaryPolygons || boundaryPolygons.length === 0) {
      return {
        exact: false,
        fallbackReason: 'error'
      };
    }

    const geometry = boundaryPolygons.length === 1
      ? createPolygonGeometry(boundaryPolygons[0]!)
      : createMultiPolygonGeometry(boundaryPolygons);

    if (!geometry) {
      return {
        exact: false,
        fallbackReason: 'error'
      };
    }

    return {
      geometry,
      exact: true
    };
  } catch (error) {
    if (error instanceof DissolveAbortError) {
      return {
        exact: false,
        fallbackReason: 'too_complex'
      };
    }

    return {
      exact: false,
      fallbackReason: 'error'
    };
  }
}
