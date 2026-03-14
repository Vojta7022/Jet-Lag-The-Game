import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryAuthorityRuntime,
  InMemoryTransportAdapter
} from '../../packages/transport/src/index.ts';
import { makeEnvelope } from '../engine/helpers.ts';
import {
  createTransportHarness,
  makeRecipient
} from './helpers.ts';

test('authority runtime can recover match state from persisted snapshot and event log', async () => {
  const { contentPack, persistence, runtime } = createTransportHarness('lan_host_authority');
  const matchId = 'transport-recovery-match';

  await runtime.submitCommand(
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'create_match',
        payload: {
          mode: 'single_device_referee',
          contentPackId: contentPack.packId,
          hostPlayerId: 'host-1',
          hostDisplayName: 'Host',
          initialScale: 'small'
        }
      },
      1
    )
  );
  await runtime.submitCommand(
    makeEnvelope(
      matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'join_match',
        payload: {
          playerId: 'hider-1',
          displayName: 'Hider'
        }
      },
      2
    )
  );

  const recoveredRuntime = new InMemoryAuthorityRuntime({
    mode: 'lan_host_authority',
    contentPacks: [contentPack],
    persistence
  });
  const recoveredSnapshot = await recoveredRuntime.recoverMatch(matchId);

  assert.ok(recoveredSnapshot);
  assert.equal(recoveredSnapshot?.snapshotVersion, 2);
  assert.equal(Object.keys(recoveredSnapshot?.aggregate.players ?? {}).length, 2);

  const publicAdapter = new InMemoryTransportAdapter(recoveredRuntime);
  await publicAdapter.connect({
    sessionId: 'public-session',
    recipient: makeRecipient('public-session', {
      actorId: 'spectator-1',
      scope: 'public_match'
    })
  });

  const projectionSnapshot = await publicAdapter.requestSnapshot({ matchId });
  assert.equal(projectionSnapshot.snapshotVersion, 2);
  assert.equal(projectionSnapshot.projectionDelivery.projection.players.length, 2);
});

test('transport reconnect and catch-up contracts provide deltas and request resync for inconsistent cursors', async () => {
  const { contentPack, runtime } = createTransportHarness('online_cloud');
  const matchId = 'transport-catchup-match';
  const publicAdapter = new InMemoryTransportAdapter(runtime);

  await publicAdapter.connect({
    sessionId: 'public-session',
    recipient: makeRecipient('public-session', {
      actorId: 'spectator-1',
      scope: 'public_match'
    })
  });

  await runtime.submitCommand(
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'create_match',
        payload: {
          mode: 'online',
          contentPackId: contentPack.packId,
          hostPlayerId: 'host-1',
          hostDisplayName: 'Host',
          initialScale: 'small'
        }
      },
      1
    )
  );
  await runtime.submitCommand(
    makeEnvelope(
      matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'join_match',
        payload: {
          playerId: 'hider-1',
          displayName: 'Hider'
        }
      },
      2
    )
  );

  const initialSnapshot = await publicAdapter.requestSnapshot({ matchId });

  await runtime.submitCommand(
    makeEnvelope(
      matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      {
        type: 'join_match',
        payload: {
          playerId: 'seeker-1',
          displayName: 'Seeker'
        }
      },
      3
    )
  );

  const delta = await publicAdapter.catchUp({
    matchId,
    cursor: {
      snapshotVersion: initialSnapshot.snapshotVersion,
      lastEventSequence: initialSnapshot.lastEventSequence
    }
  });

  assert.equal(delta.kind, 'delta');
  assert.equal(delta.baseSnapshotVersion, initialSnapshot.snapshotVersion);
  assert.equal(delta.requiresResync, false);
  assert.equal(delta.eventStream.events.length, 1);
  assert.equal(delta.eventStream.events[0]?.detail, 'summary');
  assert.equal(delta.projectionDelivery.projection.players.length, 3);

  const resync = await publicAdapter.reconnect({
    matchId,
    cursor: {
      snapshotVersion: 999,
      lastEventSequence: 999
    }
  });

  assert.equal(resync.kind, 'snapshot');
  assert.equal(resync.requiresResync, true);
  assert.equal(resync.eventStream.events.length, 0);
  assert.equal(resync.projectionDelivery.projection.players.length, 3);
});
