import assert from 'node:assert/strict';
import test from 'node:test';

import type { ContentPack } from '../../packages/shared-types/src/index.ts';
import {
  InMemoryDurableLocalHostPersistence,
  NearbyGuestTransportAdapter,
  NearbyHostAuthorityRuntime
} from '../../packages/transport/src/index.ts';
import { makeEnvelope } from '../engine/helpers.ts';
import { loadEngineTestContentPack } from '../engine/helpers.ts';
import { setupRuntimeToHidePhase } from './helpers.ts';

function createNearbyHarness(options: {
  now?: () => Date;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
} = {}): {
  contentPack: ContentPack;
  persistence: InMemoryDurableLocalHostPersistence;
  runtime: NearbyHostAuthorityRuntime;
} {
  const contentPack = loadEngineTestContentPack();
  const persistence = new InMemoryDurableLocalHostPersistence();
  const runtime = new NearbyHostAuthorityRuntime({
    contentPacks: [contentPack],
    persistence,
    now: options.now,
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    heartbeatTimeoutMs: options.heartbeatTimeoutMs
  });

  return {
    contentPack,
    persistence,
    runtime
  };
}

test('nearby host runtime binds guest sessions to current roles and delivers scoped deltas', async () => {
  const { contentPack, persistence, runtime } = createNearbyHarness();
  const matchId = await setupRuntimeToHidePhase(runtime, contentPack, 'nearby-host-match', 'local_nearby');
  const offer = await runtime.createJoinOffer(matchId, {
    hostSessionId: 'host-device-1',
    hostAlias: 'Host Tablet'
  });
  const guestSession = await runtime.joinWithCode({
    matchId,
    joinCode: offer.joinCode,
    joinToken: offer.joinToken,
    playerId: 'hider-1',
    displayName: 'Hider Phone',
    requestedScope: 'team_private'
  });
  const adapter = new NearbyGuestTransportAdapter(runtime);
  const deliveries = [];

  await adapter.connect({
    sessionId: 'guest-transport-1',
    recipient: guestSession.projectionRecipient,
    guestSession
  });

  const initialSnapshot = await adapter.requestSnapshot({ matchId });
  assert.equal(initialSnapshot.kind, 'snapshot');
  assert.equal(initialSnapshot.projectionScope, 'team_private');
  assert.equal(initialSnapshot.projectionDelivery.projection.hiddenState, undefined);
  assert.equal(initialSnapshot.projectionDelivery.projection.visibleCards.length, 0);

  await adapter.subscribe({
    matchId,
    cursor: {
      snapshotVersion: initialSnapshot.snapshotVersion,
      lastEventSequence: initialSnapshot.lastEventSequence
    },
    deliverInitialSync: false
  }, async (envelope) => {
    deliveries.push(envelope);
  });

  const result = await adapter.submit(
    makeEnvelope(
      matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'spectator' },
      {
        type: 'draw_card',
        payload: {
          deckId: 'hider-main'
        }
      },
      11
    )
  );

  assert.equal(result.accepted, true);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0]?.kind, 'delta');
  assert.equal(deliveries[0]?.eventStream.events.length, 0);
  assert.equal(deliveries[0]?.projectionDelivery.projection.visibleCards.length, 1);

  const refreshedSession = await persistence.loadGuestSession(matchId, guestSession.guestSessionId);
  assert.equal(refreshedSession?.roleHint, 'hider');
  assert.equal(refreshedSession?.projectionRecipient.recipientId, 'team_private:team-hider');
});

test('nearby guest adapters support heartbeat status, catch-up deltas, and reconnect resync', async () => {
  let now = new Date('2026-01-01T00:00:00.000Z');
  const { contentPack, runtime } = createNearbyHarness({
    now: () => new Date(now),
    heartbeatIntervalMs: 5_000,
    heartbeatTimeoutMs: 20_000
  });
  const matchId = await setupRuntimeToHidePhase(runtime, contentPack, 'nearby-catchup-match', 'local_nearby');
  const offer = await runtime.createJoinOffer(matchId, {
    hostSessionId: 'host-device-1',
    hostAlias: 'Host Tablet'
  });
  const guestSession = await runtime.joinWithCode({
    matchId,
    joinCode: offer.joinCode,
    playerId: 'seeker-1',
    displayName: 'Seeker Phone',
    requestedScope: 'player_private'
  });
  const adapter = new NearbyGuestTransportAdapter(runtime);

  await adapter.connect({
    sessionId: 'guest-transport-2',
    recipient: guestSession.projectionRecipient,
    guestSession
  });

  const beforeHeartbeat = await runtime.getHostAvailability(matchId);
  assert.equal(beforeHeartbeat.state, 'offline');

  await runtime.emitHeartbeat(matchId);
  const available = await runtime.getHostAvailability(matchId);
  assert.equal(available.state, 'available');

  const initialSnapshot = await adapter.requestSnapshot({ matchId });

  await runtime.submitCommand(
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'pause_match',
        payload: {
          reason: 'Battery check'
        }
      },
      11
    )
  );

  const delta = await adapter.catchUp({
    matchId,
    cursor: {
      snapshotVersion: initialSnapshot.snapshotVersion,
      lastEventSequence: initialSnapshot.lastEventSequence
    }
  });
  assert.equal(delta.kind, 'delta');
  assert.equal(delta.requiresResync, false);
  assert.equal(delta.eventStream.events.length, 1);
  assert.equal(delta.eventStream.events[0]?.detail, 'summary');
  assert.equal(delta.projectionDelivery.projection.paused?.reason, 'Battery check');

  const resync = await adapter.reconnect({
    matchId,
    cursor: {
      snapshotVersion: 999,
      lastEventSequence: 999
    }
  });
  assert.equal(resync.kind, 'snapshot');
  assert.equal(resync.requiresResync, true);
  assert.equal(resync.eventStream.events.length, 0);

  now = new Date(now.getTime() + 12_000);
  const stale = await runtime.getHostAvailability(matchId);
  assert.equal(stale.state, 'stale');

  now = new Date(now.getTime() + 10_000);
  const offline = await runtime.getHostAvailability(matchId);
  assert.equal(offline.state, 'offline');
});

test('nearby host persistence can restore match state, join offers, and guest sessions after restart', async () => {
  const { contentPack, persistence, runtime } = createNearbyHarness();
  const matchId = await setupRuntimeToHidePhase(runtime, contentPack, 'nearby-recovery-match', 'local_nearby');
  const offer = await runtime.createJoinOffer(matchId, {
    hostSessionId: 'host-device-1',
    hostAlias: 'Host Tablet'
  });
  const guestSession = await runtime.joinWithCode({
    matchId,
    joinCode: offer.joinCode,
    joinToken: offer.joinToken,
    playerId: 'seeker-1',
    displayName: 'Seeker Phone',
    requestedScope: 'player_private'
  });

  await runtime.emitHeartbeat(matchId);

  const exportedState = await persistence.exportDurableState();
  const recoveredPersistence = new InMemoryDurableLocalHostPersistence();
  await recoveredPersistence.importDurableState(exportedState);

  const recoveredRuntime = new NearbyHostAuthorityRuntime({
    contentPacks: [contentPack],
    persistence: recoveredPersistence
  });

  const recovered = await recoveredRuntime.recoverMatch(matchId);
  assert.ok(recovered);
  assert.equal(recovered?.aggregate.lifecycleState, 'hide_phase');
  assert.equal(recovered?.aggregate.mapRegion?.displayName, 'Prague');
  assert.equal((await recoveredRuntime.loadJoinOffer(matchId))?.joinCode, offer.joinCode);
  assert.equal((await recoveredPersistence.listGuestSessions(matchId)).length, 1);

  const recoveredGuest = await recoveredPersistence.loadGuestSession(matchId, guestSession.guestSessionId);
  const adapter = new NearbyGuestTransportAdapter(recoveredRuntime);
  await adapter.connect({
    sessionId: 'guest-transport-3',
    recipient: recoveredGuest!.projectionRecipient,
    guestSession: recoveredGuest!
  });

  const snapshot = await adapter.requestSnapshot({ matchId });
  assert.equal(snapshot.kind, 'snapshot');
  assert.equal(snapshot.projectionDelivery.projection.players.length, 3);
  assert.equal(snapshot.projectionDelivery.projection.hiddenState, undefined);
});
