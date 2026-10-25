import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

import type { TransitStationCandidate } from './station-layer.ts';
import type { PlayableRegionCatalogEntry } from './region-types.ts';

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

export function encodeMapScenario(scenario: MapScenario): string {
  const compressed = deflateSync(strToU8(JSON.stringify(scenario)));
  let binary = '';
  for (const byte of compressed) binary += String.fromCharCode(byte);
  return `z${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
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
    const parsed = JSON.parse(json) as Partial<MapScenario>;
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
    return parsed as MapScenario;
  } catch (error) {
    if (error instanceof Error && error.message === 'unsupported version') {
      throw new Error('Unsupported map scenario version. Update the app to load this map.');
    }
    throw new Error('This is not a valid map scenario.');
  }
}

export function createMapScenario(args: Omit<MapScenario, 'version' | 'savedAt'> & { savedAt?: string }): MapScenario {
  return {
    ...args,
    version: 1,
    savedAt: args.savedAt ?? new Date().toISOString()
  };
}
