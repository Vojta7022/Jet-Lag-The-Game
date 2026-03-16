import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { ContentPack } from '../../../packages/shared-types/src/index.ts';

import { mobileAppEnvironment } from '../src/config/env.ts';
import { MobileRuntimeOrchestrator } from '../src/runtime/mobile-runtime-orchestrator.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

function loadContentPack(): ContentPack {
  return JSON.parse(readFileSync(generatedPackPath, 'utf8')) as ContentPack;
}

test('runtime orchestrator can create host sessions across all supported foundations', async () => {
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack: loadContentPack(),
    environment: mobileAppEnvironment
  });
  const profile = {
    displayName: 'Host',
    playerId: 'host-1',
    authUserId: 'auth-host-1'
  };

  const inMemory = await orchestrator.createMatch(profile, {
    runtimeKind: 'in_memory',
    matchId: 'mobile-memory-match',
    initialScale: 'small',
    matchMode: 'single_device_referee'
  });
  const online = await orchestrator.createMatch(profile, {
    runtimeKind: 'online_foundation',
    matchId: 'mobile-online-match',
    initialScale: 'small'
  });
  const nearby = await orchestrator.createMatch(profile, {
    runtimeKind: 'nearby_host_authority',
    matchId: 'mobile-nearby-match',
    initialScale: 'small'
  });
  const singleDevice = await orchestrator.createMatch(profile, {
    runtimeKind: 'single_device_referee',
    matchId: 'mobile-referee-match',
    initialScale: 'small'
  });

  assert.equal(inMemory.connection.runtimeMode, 'single_device_referee');
  assert.equal(online.connection.runtimeMode, 'online_cloud');
  assert.equal(online.connection.recipient.playerId, 'host-1');
  assert.equal(online.connection.recipient.actorId, 'auth-host-1');
  assert.match(online.connection.joinCode ?? '', /^[A-Z0-9]{6}$/);
  assert.equal(online.resolvedSessionProfile?.playerId, 'host-1');
  assert.equal(online.resolvedSessionProfile?.authUserId, 'auth-host-1');
  assert.equal(nearby.connection.runtimeMode, 'lan_host_authority');
  assert.equal(singleDevice.connection.runtimeMode, 'single_device_referee');
  assert.ok(nearby.connection.joinOffer?.joinCode);

  await orchestrator.disconnect(inMemory.connection);
  await orchestrator.disconnect(online.connection);
  await orchestrator.disconnect(nearby.connection);
  await orchestrator.disconnect(singleDevice.connection);
});

test('runtime orchestrator nearby guest flow uses host-authoritative join data and returns scoped snapshots', async () => {
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack: loadContentPack(),
    environment: mobileAppEnvironment
  });
  const host = await orchestrator.createMatch(
    {
      displayName: 'Nearby Host',
      playerId: 'host-1',
      authUserId: 'auth-host-1'
    },
    {
      runtimeKind: 'nearby_host_authority',
      matchId: 'mobile-nearby-guest-match',
      initialScale: 'small'
    }
  );

  const guest = await orchestrator.joinMatch(
    {
      displayName: 'Guest Player',
      playerId: 'guest-1',
      authUserId: 'auth-guest-1'
    },
    {
      runtimeKind: 'nearby_host_authority',
      matchId: 'mobile-nearby-guest-match',
      joinCode: host.connection.joinOffer?.joinCode,
      joinToken: host.connection.joinOffer?.joinToken,
      requestedScope: 'player_private'
    }
  );

  assert.equal(guest.connection.transportFlavor, 'nearby_guest');
  assert.equal(guest.initialSync.projectionScope, 'player_private');
  assert.equal(guest.initialSync.projectionDelivery.projection.hiddenState, undefined);
  assert.equal(guest.initialSync.projectionDelivery.projection.players.length >= 2, true);

  await orchestrator.disconnect(host.connection);
  await orchestrator.disconnect(guest.connection);
});

test('runtime orchestrator lets online players join by short join code even when display names match', async () => {
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack: loadContentPack(),
    environment: mobileAppEnvironment
  });

  const host = await orchestrator.createMatch(
    {
      displayName: 'Alex',
      playerId: 'host-1',
      authUserId: 'auth-host-1'
    },
    {
      runtimeKind: 'online_foundation',
      matchId: 'mobile-online-join-code-match',
      initialScale: 'small'
    }
  );

  const guest = await orchestrator.joinMatch(
    {
      displayName: 'Alex',
      playerId: 'guest-1',
      authUserId: 'auth-guest-1'
    },
    {
      runtimeKind: 'online_foundation',
      joinCode: host.connection.joinCode,
      requestedScope: 'player_private'
    }
  );

  assert.match(host.connection.joinCode ?? '', /^[A-Z0-9]{6}$/);
  assert.equal(guest.connection.matchId, host.connection.matchId);
  assert.equal(guest.connection.joinCode, host.connection.joinCode);
  assert.equal(guest.initialSync.projectionScope, 'player_private');
  assert.equal(
    guest.initialSync.projectionDelivery.projection.players.filter((player) => player.displayName === 'Alex').length >= 2,
    true
  );

  await orchestrator.disconnect(host.connection);
  await orchestrator.disconnect(guest.connection);
});
