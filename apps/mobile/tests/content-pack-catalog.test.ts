import assert from 'node:assert/strict';
import test from 'node:test';

import type { ContentPack } from '../../../packages/shared-types/src/index.ts';
import { loadEngineTestContentPack } from '../../../tests/engine/helpers.ts';
import { ContentPackCatalog, parseContentPackJson } from '../src/runtime/content-pack-catalog.ts';

class MemoryKeyValueStore {
  value: string | null = null;
  async getItem() { return this.value; }
  async setItem(_key: string, value: string) { this.value = value; }
}

test('content pack JSON import rejects malformed or blocking-invalid packs', () => {
  assert.throws(() => parseContentPackJson('{bad json'), /valid JSON/);
  assert.throws(() => parseContentPackJson(JSON.stringify({ packId: 'missing-fields' })), /blocking validation/);
});

test('installed content pack catalog persists distinct versions and restores them', async () => {
  const storage = new MemoryKeyValueStore();
  const catalog = new ContentPackCatalog(storage, 'test-content-packs');
  const basePack = loadEngineTestContentPack();
  const alternateVersion: ContentPack = { ...basePack, packVersion: '0.2.0', title: 'Alternate Rules' };

  await catalog.install(parseContentPackJson(JSON.stringify(basePack)));
  await catalog.install(parseContentPackJson(JSON.stringify(alternateVersion)));

  const restored = await new ContentPackCatalog(storage, 'test-content-packs').load();
  assert.deepEqual(restored.map((pack) => `${pack.packId}@${pack.packVersion}`), [
    `${basePack.packId}@${basePack.packVersion}`,
    `${alternateVersion.packId}@${alternateVersion.packVersion}`
  ]);
});

test('content pack catalog refuses to replace a previously installed immutable version', async () => {
  const catalog = new ContentPackCatalog(new MemoryKeyValueStore(), 'test-content-packs');
  const pack = loadEngineTestContentPack();
  await catalog.install(pack);
  await assert.rejects(
    () => catalog.install({ ...pack, title: 'Changed Without Version Bump' }),
    /already installed with different contents/
  );
});
