export type LonLat = [number, number];

export interface ProjectedPoint {
  x: number;
  y: number;
}

const METERS_PER_DEGREE_LAT = 111_320;

function metersPerDegreeLongitude(latitude: number): number {
  return 111_320 * Math.cos((latitude * Math.PI) / 180);
}

export function projectCoordinate(coordinate: LonLat, originLatitude: number): ProjectedPoint {
  return {
    x: coordinate[0] * metersPerDegreeLongitude(originLatitude),
    y: coordinate[1] * METERS_PER_DEGREE_LAT
  };
}

export function unprojectCoordinate(point: ProjectedPoint, originLatitude: number): LonLat {
  return [
    point.x / metersPerDegreeLongitude(originLatitude),
    point.y / METERS_PER_DEGREE_LAT
  ];
}

export function distanceMeters(from: LonLat, to: LonLat, originLatitude?: number): number {
  const referenceLatitude = originLatitude ?? (from[1] + to[1]) / 2;
  const left = projectCoordinate(from, referenceLatitude);
  const right = projectCoordinate(to, referenceLatitude);
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function midpoint(from: LonLat, to: LonLat): LonLat {
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
}
