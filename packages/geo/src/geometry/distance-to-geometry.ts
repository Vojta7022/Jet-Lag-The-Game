import type { GeoJsonGeometryModel } from '../../../shared-types/src/index.ts';

import { pointInGeometry, polygonRingsFromGeometry } from './geojson.ts';
import type { LonLat } from './planar.ts';

type Vector3 = [number, number, number];

const EARTH_RADIUS_METERS = 6_371_008.8;
const ARC_TOLERANCE_RADIANS = 1e-10;

function unitVector([longitude, latitude]: LonLat): Vector3 {
  const longitudeRadians = longitude * Math.PI / 180;
  const latitudeRadians = latitude * Math.PI / 180;
  const latitudeRadius = Math.cos(latitudeRadians);
  return [
    latitudeRadius * Math.cos(longitudeRadians),
    latitudeRadius * Math.sin(longitudeRadians),
    Math.sin(latitudeRadians)
  ];
}

function dot(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function magnitude(vector: Vector3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function angularDistance(left: Vector3, right: Vector3): number {
  return Math.atan2(magnitude(cross(left, right)), Math.max(-1, Math.min(1, dot(left, right))));
}

function vectorDistanceMeters(left: Vector3, right: Vector3): number {
  return angularDistance(left, right) * EARTH_RADIUS_METERS;
}

function pointToArcDistanceMeters(point: Vector3, start: Vector3, end: Vector3): number {
  const arcAngle = angularDistance(start, end);
  if (arcAngle <= ARC_TOLERANCE_RADIANS || Math.PI - arcAngle <= ARC_TOLERANCE_RADIANS) {
    return Math.min(vectorDistanceMeters(point, start), vectorDistanceMeters(point, end));
  }

  const normal = cross(start, end);
  const normalLength = magnitude(normal);
  const unitNormal: Vector3 = [normal[0] / normalLength, normal[1] / normalLength, normal[2] / normalLength];
  const normalComponent = dot(point, unitNormal);
  const projected: Vector3 = [
    point[0] - normalComponent * unitNormal[0],
    point[1] - normalComponent * unitNormal[1],
    point[2] - normalComponent * unitNormal[2]
  ];
  const projectedLength = magnitude(projected);
  let nearestArcPointDistance = Number.POSITIVE_INFINITY;

  if (projectedLength > ARC_TOLERANCE_RADIANS) {
    const candidate: Vector3 = [projected[0] / projectedLength, projected[1] / projectedLength, projected[2] / projectedLength];
    for (const arcPoint of [candidate, [-candidate[0], -candidate[1], -candidate[2]] as Vector3]) {
      const splitArcAngle = angularDistance(start, arcPoint) + angularDistance(arcPoint, end);
      if (splitArcAngle <= arcAngle + ARC_TOLERANCE_RADIANS) {
        nearestArcPointDistance = Math.min(nearestArcPointDistance, vectorDistanceMeters(point, arcPoint));
      }
    }
  }

  return Math.min(nearestArcPointDistance, vectorDistanceMeters(point, start), vectorDistanceMeters(point, end));
}

/** Measures to the nearest point on a GeoJSON polygon boundary using spherical arcs. */
export function distanceToGeometryMeters(point: LonLat, geometry: GeoJsonGeometryModel | undefined): number | undefined {
  if (!geometry || !point.every(Number.isFinite) || point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90) {
    return undefined;
  }

  const polygons = polygonRingsFromGeometry(geometry);
  if (polygons.length === 0) return undefined;
  if (pointInGeometry(point, geometry)) return 0;

  const origin = unitVector(point);
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let index = 1; index < ring.length; index += 1) {
        const start = ring[index - 1];
        const end = ring[index];
        nearestDistance = Math.min(nearestDistance, pointToArcDistanceMeters(origin, unitVector(start), unitVector(end)));
      }
    }
  }

  return Number.isFinite(nearestDistance) ? nearestDistance : undefined;
}
