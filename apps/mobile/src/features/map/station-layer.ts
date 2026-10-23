import type { GeoJsonGeometryModel } from '../../../../../packages/shared-types/src/index.ts';
import { extractPolygonRings, getGeometryBounds } from './map-geometry.ts';

export interface TransitStationCandidate {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  kind?: string;
  osmType?: string;
  osmId?: number;
}

const EARTH_RADIUS_METERS = 6_371_008.8;
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function pointInRing(longitude: number, latitude: number, ring: Array<{longitude:number;latitude:number}>) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const a = ring[current]!;
    const b = ring[previous]!;
    const crosses = (a.latitude > latitude) !== (b.latitude > latitude) &&
      longitude < (b.longitude - a.longitude) * (latitude - a.latitude) /
        ((b.latitude - a.latitude) || Number.EPSILON) + a.longitude;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(longitude: number, latitude: number, rings: Array<Array<{longitude:number;latitude:number}>>) {
  return Boolean(rings[0] && pointInRing(longitude, latitude, rings[0]) &&
    !rings.slice(1).some((hole) => pointInRing(longitude, latitude, hole)));
}

export function filterStationsToGeometry(
  stations: TransitStationCandidate[],
  geometry: GeoJsonGeometryModel
): TransitStationCandidate[] {
  const polygons = extractPolygonRings(geometry);
  return stations.filter((station) => polygons.some((polygon) =>
    pointInPolygon(station.longitude, station.latitude, polygon)
  ));
}

export function getHidingRadiusMeters(scale: 'small' | 'medium' | 'large'): number {
  return scale === 'large' ? 1000 : 500;
}

export function buildHidingZoneCircle(
  center: { latitude: number; longitude: number },
  radiusMeters: number,
  steps = 64
): GeoJsonGeometryModel {
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
  const latitude = center.latitude * Math.PI / 180;
  const longitude = center.longitude * Math.PI / 180;
  const coordinates: number[][] = [];

  for (let index = 0; index <= steps; index += 1) {
    const bearing = index / steps * 2 * Math.PI;
    const pointLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const pointLongitude = longitude + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(pointLatitude)
    );
    coordinates.push([pointLongitude * 180 / Math.PI, pointLatitude * 180 / Math.PI]);
  }

  return { type: 'Polygon', coordinates: [coordinates] };
}

function stationFromOverpass(element: any): TransitStationCandidate | undefined {
  const latitude = Number(element.lat ?? element.center?.lat);
  const longitude = Number(element.lon ?? element.center?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  const tags = element.tags ?? {};
  const name = tags.name ?? tags['name:en'] ?? tags['name:local'];
  if (typeof name !== 'string' || !name.trim()) return undefined;
  return {
    stationId: `${element.type}/${element.id}`,
    name: name.trim(),
    latitude,
    longitude,
    kind: tags.railway ?? tags.public_transport ?? tags.amenity,
    osmType: element.type,
    osmId: element.id
  };
}

function stationDistanceMeters(left: TransitStationCandidate, right: TransitStationCandidate) {
  const lat1 = left.latitude * Math.PI / 180;
  const lat2 = right.latitude * Math.PI / 180;
  const deltaLat = lat2 - lat1;
  const deltaLon = (right.longitude - left.longitude) * Math.PI / 180;
  const haversine = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

function mergeNearbyDuplicates(stations: TransitStationCandidate[]) {
  const sorted = [...stations].sort((left, right) => left.stationId.localeCompare(right.stationId));
  const unique: TransitStationCandidate[] = [];
  for (const station of sorted) {
    const normalizedName = station.name.normalize('NFKC').trim().toLocaleLowerCase();
    const duplicate = unique.some((existing) =>
      existing.name.normalize('NFKC').trim().toLocaleLowerCase() === normalizedName &&
      stationDistanceMeters(existing, station) <= 200
    );
    if (!duplicate) unique.push(station);
  }
  return unique;
}

export async function findTransitStationsInGeometry(
  geometry: GeoJsonGeometryModel,
  options: { fetcher?: typeof fetch; endpoint?: string; signal?: AbortSignal } = {}
): Promise<TransitStationCandidate[]> {
  const bounds = getGeometryBounds(geometry);
  if (!bounds) return [];
  const query = `[out:json][timeout:25];(node[railway~"^(station|halt|tram_stop)$"](${bounds.minLatitude},${bounds.minLongitude},${bounds.maxLatitude},${bounds.maxLongitude});node[public_transport="station"](${bounds.minLatitude},${bounds.minLongitude},${bounds.maxLatitude},${bounds.maxLongitude});way[railway~"^(station|halt|tram_stop)$"](${bounds.minLatitude},${bounds.minLongitude},${bounds.maxLatitude},${bounds.maxLongitude});way[public_transport="station"](${bounds.minLatitude},${bounds.minLongitude},${bounds.maxLatitude},${bounds.maxLongitude}););out center tags;`;
  const response = await (options.fetcher ?? fetch)(options.endpoint ?? OVERPASS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ data: query }).toString(),
    signal: options.signal
  });
  if (!response.ok) throw new Error(`Transit station provider returned ${response.status}.`);
  const data = await response.json() as { elements?: any[] };
  const candidates = (data.elements ?? []).map(stationFromOverpass)
    .filter((station): station is TransitStationCandidate => Boolean(station));
  const unique = new Map(candidates.map((station) => [station.stationId, station]));
  return mergeNearbyDuplicates(filterStationsToGeometry([...unique.values()], geometry))
    .sort((a, b) => a.name.localeCompare(b.name));
}
