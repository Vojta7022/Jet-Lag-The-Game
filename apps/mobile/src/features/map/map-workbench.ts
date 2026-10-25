import type { GeoJsonGeometryModel } from '../../../../../packages/shared-types/src/index.ts';

import { isValidScenarioCustomGeometry, type MapScenarioCustomOverlay, type MapScenarioCustomStation } from './map-scenarios.ts';
import { filterStationsToGeometry, type TransitStationCandidate } from './station-layer.ts';

interface LayerImportOptions {
  name: string;
  color: string;
}

function featureName(properties: unknown, fallback: string): string {
  if (!properties || typeof properties !== 'object') return fallback;
  const values = properties as Record<string, unknown>;
  for (const key of ['name', 'title', 'label']) {
    if (typeof values[key] === 'string' && values[key].trim()) return values[key].trim().slice(0, 100);
  }
  return fallback;
}

function asFeature(value: unknown, index: number, options: LayerImportOptions): MapScenarioCustomOverlay {
  if (!value || typeof value !== 'object') throw new Error('This is not valid GeoJSON.');
  const item = value as Record<string, unknown>;
  const geometry = item.type === 'Feature' ? item.geometry : item;
  if (!isValidScenarioCustomGeometry(geometry)) throw new Error('This is not valid GeoJSON. Check its geometry and coordinate order.');
  const fallbackName = options.name.trim() || `Layer ${index + 1}`;
  const name = featureName(item.type === 'Feature' ? item.properties : undefined, fallbackName);
  const id = `layer-${index + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'custom'}`;
  return { id, name, color: options.color, visible: true, geometry: geometry as GeoJsonGeometryModel };
}

export function parseCustomOverlayGeoJson(value: string, options: LayerImportOptions): MapScenarioCustomOverlay[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error('Paste a valid GeoJSON object.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Paste a valid GeoJSON object.');
  const document = parsed as Record<string, unknown>;
  let layers: MapScenarioCustomOverlay[];
  if (document.type === 'FeatureCollection' && Array.isArray(document.features)) {
    layers = document.features.map((feature, index) => asFeature(feature, index, options));
  } else {
    layers = [asFeature(parsed, 0, options)];
  }
  if (!layers.length || layers.length > 100) throw new Error('A map import must contain between 1 and 100 features.');
  if (!/^#[0-9a-f]{6}$/i.test(options.color)) throw new Error('Choose a six-digit hex color for this layer.');
  return layers;
}

function parseCsvRow(row: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index]!;
    if (character === '"' && row[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  if (quoted) throw new Error('Station data has an unclosed quoted field.');
  return values;
}

export function parseCustomStationsCsv(value: string): MapScenarioCustomStation[] {
  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('Station data needs a header and at least one station row.');
  const headers = parseCsvRow(lines[0]!).map((header) => header.trim().toLowerCase());
  const nameIndex = headers.findIndex((header) => ['name', 'station', 'station_name'].includes(header));
  const latitudeIndex = headers.findIndex((header) => ['latitude', 'lat'].includes(header));
  const longitudeIndex = headers.findIndex((header) => ['longitude', 'lon', 'lng'].includes(header));
  if (nameIndex < 0 || latitudeIndex < 0 || longitudeIndex < 0) {
    throw new Error('Station data needs name, latitude, and longitude columns.');
  }
  const stations = lines.slice(1).map((line, index) => {
    const row = parseCsvRow(line);
    const name = row[nameIndex]?.trim();
    const latitudeValue = row[latitudeIndex]?.trim();
    const longitudeValue = row[longitudeIndex]?.trim();
    const latitude = Number(latitudeValue);
    const longitude = Number(longitudeValue);
    if (!name || !latitudeValue || !longitudeValue || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error(`Station data row ${index + 2} has a missing name or invalid coordinates.`);
    }
    return { id: `custom:csv:${index + 2}`, name, latitude, longitude };
  });
  if (stations.length > 2000) throw new Error('Station data can include at most 2,000 stations.');
  return stations;
}

export function parseCustomStationsGeoJson(value: string): MapScenarioCustomStation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error('Station data is not valid GeoJSON.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Station data is not valid GeoJSON.');
  const document = parsed as Record<string, unknown>;
  const features = document.type === 'FeatureCollection'
    ? document.features
    : document.type === 'Feature'
      ? [document]
      : [];
  if (!Array.isArray(features) || features.length === 0 || features.length > 2000) {
    throw new Error('Station GeoJSON must contain between 1 and 2,000 Point features.');
  }
  return features.map((feature, index) => {
    if (!feature || typeof feature !== 'object') throw new Error(`Station GeoJSON feature ${index + 1} is invalid.`);
    const item = feature as Record<string, unknown>;
    const geometry = item.geometry as Record<string, unknown> | null;
    const coordinates = geometry?.coordinates;
    const props = item.properties && typeof item.properties === 'object' ? item.properties as Record<string, unknown> : {};
    const name = featureName(props, `Custom station ${index + 1}`);
    if (geometry?.type !== 'Point' || !isValidScenarioCustomGeometry(geometry) || !Array.isArray(coordinates)) {
      throw new Error(`Station GeoJSON feature ${index + 1} must be a valid Point.`);
    }
    return {
      id: `custom:geojson:${index + 1}`,
      name,
      longitude: coordinates[0] as number,
      latitude: coordinates[1] as number
    };
  });
}

function decodeXmlText(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}

export function parseCustomStationsKml(value: string): MapScenarioCustomStation[] {
  const stations: MapScenarioCustomStation[] = [];
  const placemarks = value.match(/<Placemark\b[^>]*>[\s\S]*?<\/Placemark>/gi) ?? [];
  for (const placemark of placemarks) {
    const coordinatesText = placemark.match(/<coordinates\b[^>]*>\s*([^<\s]+)\s*<\/coordinates>/i)?.[1];
    if (!coordinatesText) continue;
    const [longitudeText, latitudeText] = coordinatesText.split(',');
    const longitude = Number(longitudeText);
    const latitude = Number(latitudeText);
    const name = decodeXmlText(placemark.match(/<name\b[^>]*>([\s\S]*?)<\/name>/i)?.[1] ?? `Custom station ${stations.length + 1}`);
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error(`KML station ${stations.length + 1} has invalid coordinates.`);
    }
    stations.push({ id: `custom:kml:${stations.length + 1}`, name, latitude, longitude });
  }
  if (stations.length === 0 || stations.length > 2000) {
    throw new Error('KML station data must contain between 1 and 2,000 point placemarks.');
  }
  return stations;
}

export function combineStationSources(
  source: 'osm' | 'custom' | 'both',
  boundary: GeoJsonGeometryModel,
  osmStations: TransitStationCandidate[],
  customStations: MapScenarioCustomStation[]
): TransitStationCandidate[] {
  const candidates = [
    ...(source === 'custom' ? [] : osmStations),
    ...(source === 'osm' ? [] : customStations.map((station) => ({
      stationId: `custom:${station.id}`,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      kind: 'Custom station'
    })))
  ];
  const unique = new Map(candidates.map((station) => [station.stationId, station]));
  return filterStationsToGeometry([...unique.values()], boundary).sort((left, right) => left.name.localeCompare(right.name));
}
