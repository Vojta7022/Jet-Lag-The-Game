import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

import type { TransitStationCandidate } from './station-layer.ts';
import type { PlayableRegionCatalogEntry } from './region-types.ts';
import type {
  CustomMapOverlayModel,
  CustomMapStationModel,
  GeoJsonGeometryModel,
  MapStationSource
} from '../../../../../packages/shared-types/src/index.ts';

export type MapScenarioCustomOverlay = CustomMapOverlayModel;
export type MapScenarioCustomStation = CustomMapStationModel;

export interface MapScenario {
  version: 1;
  name: string;
  savedAt: string;
  query: string;
  selectedPreviewRegionId?: string;
  selectedRegions: PlayableRegionCatalogEntry[];
  excludedRegions?: PlayableRegionCatalogEntry[];
  selectedStation?: Pick<TransitStationCandidate, 'stationId' | 'name' | 'latitude' | 'longitude'>;
  hidingRadiusMeters?: number;
  customOverlays?: MapScenarioCustomOverlay[];
  stationSource?: MapStationSource;
  customStations?: MapScenarioCustomStation[];
  bridgeAvailability?: 'unknown' | 'present' | 'none';
}

function isCoordinateRing(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 4 && value.every((point) =>
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
    Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90
  );
}

function hasPlayableBoundary(region: PlayableRegionCatalogEntry): boolean {
  const geometry = region.geometry;
  const coordinates: unknown = geometry.coordinates;
  if (geometry.type === 'Polygon') {
    return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(isCoordinateRing);
  }
  if (geometry.type === 'MultiPolygon') {
    return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every((polygon) =>
      Array.isArray(polygon) && polygon.length > 0 && polygon.every(isCoordinateRing)
    );
  }
  return false;
}

function isPosition(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 2 &&
    Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 &&
    Number.isFinite(value[1]) && Math.abs(value[1]) <= 90;
}

function isLine(value: unknown, minimumLength = 2): boolean {
  return Array.isArray(value) && value.length >= minimumLength && value.every(isPosition);
}

function isRing(value: unknown): boolean {
  return isLine(value, 4) && Array.isArray(value) &&
    (value[0] as unknown[])[0] === (value[value.length - 1] as unknown[])[0] &&
    (value[0] as unknown[])[1] === (value[value.length - 1] as unknown[])[1];
}

export function isValidScenarioCustomGeometry(value: unknown, depth = 0): value is GeoJsonGeometryModel {
  if (!value || typeof value !== 'object' || depth > 8) return false;
  const geometry = value as GeoJsonGeometryModel;
  const coordinates = geometry.coordinates;
  switch (geometry.type) {
    case 'Point': return isPosition(coordinates);
    case 'MultiPoint': return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(isPosition);
    case 'LineString': return isLine(coordinates);
    case 'MultiLineString': return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every((line) => isLine(line));
    case 'Polygon': return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(isRing);
    case 'MultiPolygon': return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every((polygon) =>
      Array.isArray(polygon) && polygon.length > 0 && polygon.every(isRing)
    );
    case 'GeometryCollection': return Array.isArray(geometry.geometries) && geometry.geometries.length > 0 &&
      geometry.geometries.every((child) => isValidScenarioCustomGeometry(child, depth + 1));
    default: return false;
  }
}

function hasValidCustomData(parsed: Partial<MapScenario>): boolean {
  if (parsed.stationSource !== undefined && !['osm', 'custom', 'both'].includes(parsed.stationSource)) return false;
  if (parsed.bridgeAvailability !== undefined && !['unknown', 'present', 'none'].includes(parsed.bridgeAvailability)) return false;
  if (parsed.customOverlays !== undefined && (
    !Array.isArray(parsed.customOverlays) || parsed.customOverlays.length > 100 ||
    !parsed.customOverlays.every((overlay) => overlay &&
      typeof overlay.id === 'string' && overlay.id.length > 0 && overlay.id.length <= 100 &&
      typeof overlay.name === 'string' && overlay.name.trim().length > 0 && overlay.name.length <= 100 &&
      typeof overlay.color === 'string' && /^#[0-9a-f]{6}$/i.test(overlay.color) &&
      typeof overlay.visible === 'boolean' && isValidScenarioCustomGeometry(overlay.geometry))
  )) return false;
  if (parsed.customStations !== undefined && (
    !Array.isArray(parsed.customStations) || parsed.customStations.length > 2000 ||
    !parsed.customStations.every((station) => station &&
      typeof station.id === 'string' && station.id.length > 0 && station.id.length <= 100 &&
      typeof station.name === 'string' && station.name.trim().length > 0 && station.name.length <= 100 &&
      Number.isFinite(station.latitude) && station.latitude >= -90 && station.latitude <= 90 &&
      Number.isFinite(station.longitude) && station.longitude >= -180 && station.longitude <= 180)
  )) return false;
  return true;
}

export function encodeMapScenario(scenario: MapScenario): string {
  const compressed = deflateSync(strToU8(JSON.stringify(scenario)));
  let binary = '';
  for (const byte of compressed) binary += String.fromCharCode(byte);
  return `z${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

export function encodeMapScenarioJson(scenario: MapScenario): string {
  return JSON.stringify(scenario, null, 2);
}

function validateMapScenario(parsedValue: unknown): MapScenario {
  const parsed = parsedValue as Partial<MapScenario> | null;
  if (!parsed || typeof parsed !== 'object') throw new Error('missing scenario fields');
  if (parsed.version !== 1) throw new Error('unsupported version');
  if (
    typeof parsed.name !== 'string' ||
    parsed.name.length > 100 ||
    typeof parsed.savedAt !== 'string' ||
    typeof parsed.query !== 'string' ||
    parsed.query.length > 200 ||
    !Array.isArray(parsed.selectedRegions) ||
    parsed.selectedRegions.length === 0 ||
    parsed.selectedRegions.length > 50 ||
    !parsed.selectedRegions.every((region) =>
      region && typeof region.regionId === 'string' && typeof region.displayName === 'string' && hasPlayableBoundary(region)
    ) ||
    (parsed.excludedRegions !== undefined && (
      !Array.isArray(parsed.excludedRegions) ||
      parsed.excludedRegions.length > 50 ||
      !parsed.excludedRegions.every((region) =>
        region && typeof region.regionId === 'string' && typeof region.displayName === 'string' && hasPlayableBoundary(region)
      )
    ))
  ) {
    throw new Error('missing scenario fields');
  }
  if (parsed.selectedStation && (
    typeof parsed.selectedStation.stationId !== 'string' ||
    typeof parsed.selectedStation.name !== 'string' ||
    !Number.isFinite(parsed.selectedStation.latitude) || parsed.selectedStation.latitude < -90 || parsed.selectedStation.latitude > 90 ||
    !Number.isFinite(parsed.selectedStation.longitude) || parsed.selectedStation.longitude < -180 || parsed.selectedStation.longitude > 180
  )) {
    throw new Error('invalid station');
  }
  if (parsed.hidingRadiusMeters !== undefined &&
    (!Number.isFinite(parsed.hidingRadiusMeters) || parsed.hidingRadiusMeters <= 0 || parsed.hidingRadiusMeters > 100_000)) {
    throw new Error('invalid hiding radius');
  }
  if (!hasValidCustomData(parsed)) throw new Error('invalid custom map data');
  return parsed as MapScenario;
}

function scenarioError(error: unknown): Error {
  if (error instanceof Error && error.message === 'unsupported version') {
    return new Error('Unsupported map scenario version. Update the app to load this map.');
  }
  return new Error('This is not a valid map scenario.');
}

export function decodeMapScenarioJson(value: string): MapScenario {
  try {
    return validateMapScenario(JSON.parse(value) as unknown);
  } catch (error) {
    throw scenarioError(error);
  }
}

export function decodeMapScenario(value: string): MapScenario {
  try {
    const compressedPayload = value.startsWith('z');
    const token = compressedPayload ? value.slice(1) : value;
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const json = compressedPayload
      ? strFromU8(inflateSync(bytes))
      : decodeURIComponent(Array.from(binary, (character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    return decodeMapScenarioJson(json);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unsupported map scenario version.')) throw error;
    throw scenarioError(error);
  }
}

export function createMapScenario(args: Omit<MapScenario, 'version' | 'savedAt'> & { savedAt?: string }): MapScenario {
  return {
    ...args,
    version: 1,
    savedAt: args.savedAt ?? new Date().toISOString()
  };
}
