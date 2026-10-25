import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ContentPack } from '../../../packages/shared-types/src/index.ts';
import { mobileAppEnvironment } from '../src/config/env.ts';
import { ContentPackCatalog } from '../src/runtime/content-pack-catalog.ts';
import { MobileRuntimeOrchestrator } from '../src/runtime/mobile-runtime-orchestrator.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

class MemoryContentPackStorage {
  value: string | null = null;
  async getItem() { return this.value; }
  async setItem(_key: string, value: string) { this.value = value; }
}

test('configured mobile online mode uses the authenticated Edge Function without reading game tables directly', async () => {
  const contentPack = JSON.parse(readFileSync(generatedPackPath, 'utf8')) as ContentPack;
  const alternatePack: ContentPack = { ...contentPack, packVersion: '0.2.0', title: 'Online Extension Pack' };
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  const edgeBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/auth/v1/signup')) {
      return new Response(JSON.stringify({
        access_token: 'user-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'user-refresh-token',
        user: {
          id: 'supabase-user-1', aud: 'authenticated', role: 'authenticated',
          user_metadata: { requested_player_id: 'host-1', local_auth_user_id: 'local-host-1' }
        }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/functions/v1/game-authority')) {
      const body = JSON.parse(String(init?.body)) as { operation: string };
      edgeBodies.push(body as unknown as Record<string, unknown>);
      if (body.operation === 'publish_content_pack') {
        return new Response(JSON.stringify({ published: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (body.operation === 'create_match') {
        return new Response(JSON.stringify({
          matchId: 'remote-match-1', joinCode: 'JET123',
          result: { accepted: true, matchId: 'remote-match-1', commandId: 'create-1', events: [] }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (body.operation === 'join_match') {
        return new Response(JSON.stringify({
          matchId: 'remote-match-1',
          result: { accepted: true, matchId: 'remote-match-1', commandId: 'join-1', events: [] }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (body.operation === 'get_content_pack') {
        return new Response(JSON.stringify({ contentPack: alternatePack }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ sync: {
        matchId: 'remote-match-1', projectionDelivery: { projection: { players: [{ playerId: 'seeker-1', role: 'spectator' }] } }
      } }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }
    throw new Error(`Unexpected direct backend request: ${url}`);
  }) as typeof fetch;

  try {
    const onlineSessionManager = {
      isConfigured: () => true,
      async createOnlineAuthSession(profile: { playerId: string }) {
        return {
          authProvider: 'supabase' as const, authSessionId: `session-${profile.playerId}`, authUserId: `auth-${profile.playerId}`,
          defaultPlayerId: profile.playerId, accessToken: `token-${profile.playerId}`, memberships: []
        };
      }
    };
    const orchestrator = new MobileRuntimeOrchestrator({
      contentPack,
      contentPacks: [contentPack, alternatePack],
      environment: {
        ...mobileAppEnvironment,
        onlineProjectUrl: 'https://project.supabase.co',
        onlineAnonKey: 'publishable-key'
      },
      onlineSessionManager
    });
    const result = await orchestrator.createMatch({
      displayName: 'Host', playerId: 'host-1', authUserId: 'local-host-1'
    }, {
      runtimeKind: 'online_foundation', matchId: 'remote-match-1', initialScale: 'small',
      contentPackId: alternatePack.packId, contentPackVersion: alternatePack.packVersion
    });

    assert.equal(result.connection.runtimeMode, 'online_cloud');
    assert.equal(result.connection.joinCode, 'JET123');
    const installedPackStorage = new MemoryContentPackStorage();
    const cleanPlayerOrchestrator = new MobileRuntimeOrchestrator({
      contentPack,
      contentPackCatalog: new ContentPackCatalog(installedPackStorage),
      environment: {
        ...mobileAppEnvironment,
        onlineProjectUrl: 'https://project.supabase.co',
        onlineAnonKey: 'publishable-key'
      },
      onlineSessionManager
    });
    const joined = await cleanPlayerOrchestrator.joinMatch({ displayName: 'Seeker', playerId: 'seeker-1', authUserId: 'local-seeker' }, {
      runtimeKind: 'online_foundation', joinCode: 'jet 123'
    });
    assert.equal(joined.connection.matchId, 'remote-match-1');
    assert.equal(joined.connection.recipient.playerId, 'seeker-1');
    assert.deepEqual(edgeBodies.map((body) => body.operation), ['publish_content_pack', 'create_match', 'snapshot', 'join_match', 'get_content_pack', 'snapshot']);
    assert.equal(edgeBodies[3]?.joinCode, 'JET123');
    assert.ok(cleanPlayerOrchestrator.getInstalledContentPacks().some((pack) => pack.packId === alternatePack.packId && pack.packVersion === alternatePack.packVersion));
    assert.ok(JSON.parse(installedPackStorage.value ?? '[]').some((pack: ContentPack) => pack.packId === alternatePack.packId && pack.packVersion === alternatePack.packVersion));
    assert.ok(urls.some((url) => url.includes('/functions/v1/game-authority')));
    assert.equal(urls.some((url) => url.includes('/rest/v1/')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
