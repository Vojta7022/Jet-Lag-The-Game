import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOsmTileLayout } from '../src/features/map/map-tiles.ts';

test('web map requests only tiles covering the visible boundary and provides OSM attribution', () => {
  const layout = buildOsmTileLayout(
    { minLongitude: 14, maxLongitude: 14.4, minLatitude: 50, maxLatitude: 50.4 },
    { width: 960, height: 540, padding: 18 }
  );

  assert.ok(layout.tiles.length > 0);
  assert.ok(layout.tiles.length <= 16);
  assert.ok(layout.tiles.every((tile) => tile.url === `https://tile.openstreetmap.org/${tile.zoom}/${tile.xTile}/${tile.yTile}.png`));
  assert.equal(layout.attribution, '© OpenStreetMap contributors');
  assert.ok(layout.tiles.every((tile) => tile.width > 0 && tile.height > 0));
});

test('tile detail decreases as the playable map covers a much larger area', () => {
  const viewport = { width: 960, height: 540, padding: 18 };
  const city = buildOsmTileLayout(
    { minLongitude: 14, maxLongitude: 14.2, minLatitude: 50, maxLatitude: 50.2 }, viewport
  );
  const country = buildOsmTileLayout(
    { minLongitude: 12, maxLongitude: 18, minLatitude: 48, maxLatitude: 52 }, viewport
  );

  assert.ok(city.zoom > country.zoom);
});
