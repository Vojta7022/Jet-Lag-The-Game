import type { GeometryBounds, MapViewport } from './map-geometry.ts';

export const OSM_TILE_URL_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const MAX_MERCATOR_LATITUDE = 85.05112878;
const TILE_EDGE_EPSILON = 1e-9;

export interface OsmTileImage {
  zoom: number;
  xTile: number;
  yTile: number;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OsmTileLayout {
  zoom: number;
  tiles: OsmTileImage[];
  attribution: '© OpenStreetMap contributors';
}

function longitudeToTileX(longitude: number, zoom: number) {
  return ((longitude + 180) / 360) * 2 ** zoom;
}

function latitudeToTileY(latitude: number, zoom: number) {
  const clamped = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));
  const radians = (clamped * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * 2 ** zoom;
}

function tileXToLongitude(x: number, zoom: number) {
  return (x / 2 ** zoom) * 360 - 180;
}

function tileYToLatitude(y: number, zoom: number) {
  const mercator = Math.PI * (1 - (2 * y) / 2 ** zoom);
  return (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
}

function visibleTileRange(bounds: GeometryBounds, zoom: number) {
  const maxIndex = 2 ** zoom - 1;
  const minX = Math.max(0, Math.floor(longitudeToTileX(bounds.minLongitude, zoom)));
  const maxX = Math.min(maxIndex, Math.floor(longitudeToTileX(bounds.maxLongitude, zoom) - TILE_EDGE_EPSILON));
  const minY = Math.max(0, Math.floor(latitudeToTileY(bounds.maxLatitude, zoom)));
  const maxY = Math.min(maxIndex, Math.floor(latitudeToTileY(bounds.minLatitude, zoom) - TILE_EDGE_EPSILON));
  return { minX, maxX, minY, maxY, count: (maxX - minX + 1) * (maxY - minY + 1) };
}

function mapX(longitude: number, bounds: GeometryBounds, viewport: MapViewport) {
  const span = bounds.maxLongitude - bounds.minLongitude || 1;
  return viewport.padding + ((longitude - bounds.minLongitude) / span) * Math.max(viewport.width - 2 * viewport.padding, 1);
}

function mapY(latitude: number, bounds: GeometryBounds, viewport: MapViewport) {
  const span = bounds.maxLatitude - bounds.minLatitude || 1;
  return viewport.height - viewport.padding - ((latitude - bounds.minLatitude) / span) * Math.max(viewport.height - 2 * viewport.padding, 1);
}

export function buildOsmTileLayout(
  bounds: GeometryBounds,
  viewport: MapViewport,
  maxTiles = 16
): OsmTileLayout {
  let zoom = 0;
  let range = visibleTileRange(bounds, zoom);
  for (let candidate = 18; candidate >= 0; candidate -= 1) {
    const candidateRange = visibleTileRange(bounds, candidate);
    if (candidateRange.count <= maxTiles) {
      zoom = candidate;
      range = candidateRange;
      break;
    }
  }

  const tiles: OsmTileImage[] = [];
  for (let xTile = range.minX; xTile <= range.maxX; xTile += 1) {
    for (let yTile = range.minY; yTile <= range.maxY; yTile += 1) {
      const west = tileXToLongitude(xTile, zoom);
      const east = tileXToLongitude(xTile + 1, zoom);
      const north = tileYToLatitude(yTile, zoom);
      const south = tileYToLatitude(yTile + 1, zoom);
      const x = mapX(west, bounds, viewport);
      const right = mapX(east, bounds, viewport);
      const y = mapY(north, bounds, viewport);
      const bottom = mapY(south, bounds, viewport);
      const url = OSM_TILE_URL_TEMPLATE
        .replace('{z}', String(zoom))
        .replace('{x}', String(xTile))
        .replace('{y}', String(yTile));

      tiles.push({ zoom, xTile, yTile, url, x, y, width: right - x, height: bottom - y });
    }
  }

  return { zoom, tiles, attribution: '© OpenStreetMap contributors' };
}
