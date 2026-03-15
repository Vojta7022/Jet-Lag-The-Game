import type {
  GeoJsonGeometryModel,
  VisibleMapProjection
} from '../../../../../packages/shared-types/src/index.ts';

import type { SeedPlayableRegion } from './seed-regions.ts';

export interface GeometryBounds {
  minLongitude: number;
  maxLongitude: number;
  minLatitude: number;
  maxLatitude: number;
}

export interface GeometryPoint {
  longitude: number;
  latitude: number;
}

export interface MapViewport {
  width: number;
  height: number;
  padding: number;
}

type Ring = GeometryPoint[];
type PolygonRings = Ring[];

function isFiniteCoordinatePair(value: unknown): value is [number, number] {
  return Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]);
}

function toRing(value: unknown): Ring {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isFiniteCoordinatePair)
    .map(([longitude, latitude]) => ({ longitude, latitude }));
}

function toPolygonRings(value: unknown): PolygonRings {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((ring) => toRing(ring))
    .filter((ring) => ring.length >= 3);
}

function toLineString(value: unknown): Ring {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isFiniteCoordinatePair)
    .map(([longitude, latitude]) => ({ longitude, latitude }));
}

export function extractPolygonRings(geometry: GeoJsonGeometryModel | undefined): PolygonRings[] {
  if (!geometry?.type || !geometry.coordinates) {
    return [];
  }

  if (geometry.type === 'Polygon') {
    const polygon = toPolygonRings(geometry.coordinates);
    return polygon.length > 0 ? [polygon] : [];
  }

  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .map((polygon) => toPolygonRings(polygon))
      .filter((polygon) => polygon.length > 0);
  }

  return [];
}

export function extractLineStrings(geometry: GeoJsonGeometryModel | undefined): Ring[] {
  if (!geometry?.type || !geometry.coordinates) {
    return [];
  }

  if (geometry.type === 'LineString') {
    const line = toLineString(geometry.coordinates);
    return line.length >= 2 ? [line] : [];
  }

  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .map((line) => toLineString(line))
      .filter((line) => line.length >= 2);
  }

  return [];
}

export function extractPoints(geometry: GeoJsonGeometryModel | undefined): GeometryPoint[] {
  if (!geometry?.type || !geometry.coordinates) {
    return [];
  }

  if (geometry.type === 'Point') {
    return isFiniteCoordinatePair(geometry.coordinates)
      ? [{ longitude: geometry.coordinates[0], latitude: geometry.coordinates[1] }]
      : [];
  }

  if (geometry.type === 'MultiPoint' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .filter(isFiniteCoordinatePair)
      .map(([longitude, latitude]) => ({ longitude, latitude }));
  }

  return [];
}

function collectGeometryPoints(geometry: GeoJsonGeometryModel | undefined): GeometryPoint[] {
  const polygonPoints = extractPolygonRings(geometry).flatMap((polygon) => polygon.flatMap((ring) => ring));
  const linePoints = extractLineStrings(geometry).flatMap((line) => line);
  const pointGeometries = extractPoints(geometry);

  return [...polygonPoints, ...linePoints, ...pointGeometries];
}

export function getGeometryBounds(geometry: GeoJsonGeometryModel | undefined): GeometryBounds | undefined {
  const points = collectGeometryPoints(geometry);
  if (points.length === 0) {
    return undefined;
  }

  let minLongitude = Number.POSITIVE_INFINITY;
  let maxLongitude = Number.NEGATIVE_INFINITY;
  let minLatitude = Number.POSITIVE_INFINITY;
  let maxLatitude = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minLongitude = Math.min(minLongitude, point.longitude);
    maxLongitude = Math.max(maxLongitude, point.longitude);
    minLatitude = Math.min(minLatitude, point.latitude);
    maxLatitude = Math.max(maxLatitude, point.latitude);
  }

  return {
    minLongitude,
    maxLongitude,
    minLatitude,
    maxLatitude
  };
}

export function mergeBounds(bounds: Array<GeometryBounds | undefined>): GeometryBounds | undefined {
  const defined = bounds.filter((value): value is GeometryBounds => Boolean(value));
  if (defined.length === 0) {
    return undefined;
  }

  return {
    minLongitude: Math.min(...defined.map((bound) => bound.minLongitude)),
    maxLongitude: Math.max(...defined.map((bound) => bound.maxLongitude)),
    minLatitude: Math.min(...defined.map((bound) => bound.minLatitude)),
    maxLatitude: Math.max(...defined.map((bound) => bound.maxLatitude))
  };
}

function normalizeCoordinate(value: number, min: number, max: number, length: number, padding: number): number {
  const span = max - min || 1;
  return padding + ((value - min) / span) * Math.max(length - padding * 2, 1);
}

export function geometryToSvgPath(
  geometry: GeoJsonGeometryModel | undefined,
  bounds: GeometryBounds | undefined,
  viewport: MapViewport
): string {
  if (!geometry || !bounds) {
    return '';
  }

  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
    return extractLineStrings(geometry)
      .map((line) =>
        line
          .map((point, index) => {
            const x = normalizeCoordinate(
              point.longitude,
              bounds.minLongitude,
              bounds.maxLongitude,
              viewport.width,
              viewport.padding
            );
            const y = viewport.height - normalizeCoordinate(
              point.latitude,
              bounds.minLatitude,
              bounds.maxLatitude,
              viewport.height,
              viewport.padding
            );

            return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
          })
          .join(' ')
      )
      .join(' ');
  }

  const polygons = extractPolygonRings(geometry);
  const segments: string[] = [];

  for (const polygon of polygons) {
    for (const ring of polygon) {
      const commands = ring.map((point, index) => {
        const x = normalizeCoordinate(
          point.longitude,
          bounds.minLongitude,
          bounds.maxLongitude,
          viewport.width,
          viewport.padding
        );
        const y = viewport.height - normalizeCoordinate(
          point.latitude,
          bounds.minLatitude,
          bounds.maxLatitude,
          viewport.height,
          viewport.padding
        );

        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      });

      if (commands.length > 0) {
        segments.push(`${commands.join(' ')} Z`);
      }
    }
  }

  return segments.join(' ');
}

export function projectGeometryPoints(
  geometry: GeoJsonGeometryModel | undefined,
  bounds: GeometryBounds | undefined,
  viewport: MapViewport
): Array<{ x: number; y: number }> {
  if (!geometry || !bounds) {
    return [];
  }

  return extractPoints(geometry).map((point) => ({
    x: normalizeCoordinate(
      point.longitude,
      bounds.minLongitude,
      bounds.maxLongitude,
      viewport.width,
      viewport.padding
    ),
    y: viewport.height - normalizeCoordinate(
      point.latitude,
      bounds.minLatitude,
      bounds.maxLatitude,
      viewport.height,
      viewport.padding
    )
  }));
}

export function getPreferredMapGeometry(args: {
  visibleMap?: VisibleMapProjection;
  previewRegion?: SeedPlayableRegion;
}): GeoJsonGeometryModel | undefined {
  if (args.visibleMap?.playableBoundary.geometry) {
    return args.visibleMap.playableBoundary.geometry;
  }

  return args.previewRegion?.geometry;
}
