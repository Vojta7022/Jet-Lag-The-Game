import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryTransportAdapter } from '../../packages/transport/src/index.ts';
import { makeEnvelope } from '../engine/helpers.ts';
import {
  createTransportHarness,
  makeRecipient,
  setupRuntimeToHidePhase
} from './helpers.ts';

test('transport submits commands and propagates scoped sync envelopes without bypassing engine validation', async () => {
  const { contentPack, runtime } = createTransportHarness();
  const matchId = 'transport-flow-match';
  const hostAdapter = new InMemoryTransportAdapter(runtime);
  const publicAdapter = new InMemoryTransportAdapter(runtime);

  await hostAdapter.connect({
    sessionId: 'host-admin-session',
    recipient: makeRecipient('host-admin-session', {
      actorId: 'host-1',
      playerId: 'host-1',
      role: 'host',
      scope: 'host_admin'
    })
  });
  await publicAdapter.connect({
    sessionId: 'public-session',
    recipient: makeRecipient('public-session', {
      actorId: 'spectator-1',
      scope: 'public_match'
    })
  });

  const createResult = await hostAdapter.submit(
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

  assert.equal(createResult.accepted, true);
  assert.equal(createResult.aggregateRevision, 1);
  assert.equal(createResult.events[0]?.event.type, 'match_created');

  const hostSnapshot = await hostAdapter.requestSnapshot({ matchId });
  const publicSnapshot = await publicAdapter.requestSnapshot({ matchId });
  const hostDeltas = [];
  const publicDeltas = [];

  await hostAdapter.subscribe(
    {
      matchId,
      deliverInitialSync: false,
      cursor: {
        snapshotVersion: hostSnapshot.snapshotVersion,
        lastEventSequence: hostSnapshot.lastEventSequence
      }
    },
    async (envelope) => {
      hostDeltas.push(envelope);
    }
  );

  await publicAdapter.subscribe(
    {
      matchId,
      deliverInitialSync: false,
      cursor: {
        snapshotVersion: publicSnapshot.snapshotVersion,
        lastEventSequence: publicSnapshot.lastEventSequence
      }
    },
    async (envelope) => {
      publicDeltas.push(envelope);
    }
  );

  const joinResult = await hostAdapter.submit(
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

  assert.equal(joinResult.accepted, true);
  assert.equal(hostDeltas.length, 1);
  assert.equal(publicDeltas.length, 1);
  assert.equal(hostDeltas[0]?.kind, 'delta');
  assert.equal(publicDeltas[0]?.kind, 'delta');
  assert.equal(hostDeltas[0]?.eventStream.events[0]?.detail, 'full');
  assert.equal(hostDeltas[0]?.eventStream.events[0]?.event?.event.type, 'player_joined');
  assert.equal(publicDeltas[0]?.eventStream.events[0]?.detail, 'summary');
  assert.equal(publicDeltas[0]?.eventStream.events[0]?.event, undefined);
  assert.equal(publicDeltas[0]?.projectionDelivery.projection.hiddenState, undefined);
  assert.equal(publicDeltas[0]?.projectionDelivery.projection.players.length, 2);
});

test('transport snapshot delivery preserves projection redaction boundaries', async () => {
  const { contentPack, runtime } = createTransportHarness();
  const matchId = await setupRuntimeToHidePhase(runtime, contentPack, 'transport-redaction-match');
  const hostAdapter = new InMemoryTransportAdapter(runtime);
  const hiderTeamAdapter = new InMemoryTransportAdapter(runtime);
  const publicAdapter = new InMemoryTransportAdapter(runtime);

  await runtime.submitCommand(
    makeEnvelope(
      matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'draw_card',
        payload: {
          deckId: 'hider-main'
        }
      },
      11
    )
  );
  await runtime.submitCommand(
    makeEnvelope(
      matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'lock_hider_location',
        payload: {
          latitude: 50.08,
          longitude: 14.43,
          accuracyMeters: 8
        }
      },
      12
    )
  );

  await hostAdapter.connect({
    sessionId: 'host-admin-session',
    recipient: makeRecipient('host-admin-session', {
      actorId: 'host-1',
      playerId: 'host-1',
      role: 'host',
      scope: 'host_admin'
    })
  });
  await hiderTeamAdapter.connect({
    sessionId: 'hider-team-session',
    recipient: makeRecipient('hider-team-session', {
      actorId: 'hider-1',
      playerId: 'hider-1',
      role: 'hider',
      scope: 'team_private'
    })
  });
  await publicAdapter.connect({
    sessionId: 'public-session',
    recipient: makeRecipient('public-session', {
      actorId: 'spectator-1',
      scope: 'public_match'
    })
  });

  const hostSnapshot = await hostAdapter.requestSnapshot({ matchId });
  const hiderTeamSnapshot = await hiderTeamAdapter.requestSnapshot({ matchId });
  const publicSnapshot = await publicAdapter.requestSnapshot({ matchId });

  assert.ok(hostSnapshot.projectionDelivery.projection.hiddenState?.hiderLocation);
  assert.ok(hostSnapshot.projectionDelivery.projection.visibleCards.length >= 1);
  assert.equal(hiderTeamSnapshot.projectionDelivery.projection.hiddenState, undefined);
  assert.equal(hiderTeamSnapshot.projectionDelivery.projection.visibleCards.length, 1);
  assert.equal(publicSnapshot.projectionDelivery.projection.hiddenState, undefined);
  assert.equal(publicSnapshot.projectionDelivery.projection.visibleCards.length, 0);
  assert.equal(publicSnapshot.projectionDelivery.projection.visibleMap?.featureDatasetRefs.length, 0);
});
