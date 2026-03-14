import type { GeoJsonGeometryModel } from '../../../shared-types/src/index.ts';

export type LonLat = [number, number];

export interface GeometryBoundingBox {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

function isLonLat(value: unknown): value is LonLat {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number';
}

function closeRing(ring: LonLat[]): LonLat[] {
  if (ring.length === 0) {
    return ring;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }

  return [...ring, first];
}

export function polygonRingsFromGeometry(geometry: GeoJsonGeometryModel | undefined): LonLat[][][] {
  if (!geometry?.type) {
    return [];
  }

  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    const rings = geometry.coordinates
      .filter((ring): ring is LonLat[] => Array.isArray(ring) && ring.every((coordinate) => isLonLat(coordinate)))
      .map((ring) => closeRing(ring));
    return rings.length > 0 ? [rings] : [];
  }

  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .filter((polygon): polygon is LonLat[][] => Array.isArray(polygon))
      .map((polygon) =>
        polygon
          .filter((ring): ring is LonLat[] => Array.isArray(ring) && ring.every((coordinate) => isLonLat(coordinate)))
          .map((ring) => closeRing(ring))
      )
      .filter((polygon) => polygon.length > 0);
  }

  return [];
}

export function geometryBoundingBox(geometry: GeoJsonGeometryModel | undefined): GeometryBoundingBox | undefined {
  const polygons = polygonRingsFromGeometry(geometry);
  const coordinates = polygons.flatMap((polygon) => polygon.flatMap((ring) => ring));
  if (coordinates.length === 0) {
    return undefined;
  }

  const lons = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);
  return {
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats)
  };
}

function pointInRing(point: LonLat, ring: LonLat[]): boolean {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const left = ring[index];
    const right = ring[previous];
    const intersects =
      left[1] > point[1] !== right[1] > point[1] &&
      point[0] < ((right[0] - left[0]) * (point[1] - left[1])) / (right[1] - left[1] || Number.EPSILON) + left[0];

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function pointInGeometry(point: LonLat, geometry: GeoJsonGeometryModel | undefined): boolean {
  const polygons = polygonRingsFromGeometry(geometry);
  for (const polygon of polygons) {
    const [outerRing, ...holes] = polygon;
    if (!outerRing || !pointInRing(point, outerRing)) {
      continue;
    }

    if (holes.some((hole) => pointInRing(point, hole))) {
      continue;
    }

    return true;
  }

  return false;
}

export function createPolygonGeometry(rings: LonLat[][]): GeoJsonGeometryModel | undefined {
  if (rings.length === 0 || rings[0].length < 4) {
    return undefined;
  }

  return {
    type: 'Polygon',
    coordinates: rings.map((ring) => closeRing(ring))
  };
}

export function createMultiPolygonGeometry(polygons: LonLat[][][]): GeoJsonGeometryModel | undefined {
  const normalized = polygons
    .map((polygon) => polygon.map((ring) => closeRing(ring)))
    .filter((polygon) => polygon.length > 0 && polygon[0].length >= 4);

  if (normalized.length === 0) {
    return undefined;
  }

  return {
    type: 'MultiPolygon',
    coordinates: normalized
  };
}

export function representativePointFromGeometry(
  geometry: GeoJsonGeometryModel | undefined
): LonLat | undefined {
  const boundingBox = geometryBoundingBox(geometry);
  if (!boundingBox) {
    return undefined;
  }

  return [
    (boundingBox.minLon + boundingBox.maxLon) / 2,
    (boundingBox.minLat + boundingBox.maxLat) / 2
  ];
}

export function geometryHasArea(geometry: GeoJsonGeometryModel | undefined): boolean {
  return polygonRingsFromGeometry(geometry).some((polygon) => polygon[0] && polygon[0].length >= 4);
}
