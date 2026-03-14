import assert from 'node:assert/strict';
import test from 'node:test';

import { SupabaseOnlineTransportAdapter } from '../../packages/transport/src/index.ts';
import { makeRecipient } from './helpers.ts';
import {
  createOnlineHarness,
  makeOnlineCommandRequest,
  makeOnlineSession
} from './online.helpers.ts';

test('supabase online transport adapter catches up from realtime fanout using authenticated online runtime calls', async () => {
  const { contentPack, realtime, runtime } = createOnlineHarness();
  const matchId = 'online-adapter-match';
  const hostSession = makeOnlineSession('auth-host-1', { defaultPlayerId: 'host-1' });
  const hiderSession = makeOnlineSession('auth-hider-1', { defaultPlayerId: 'hider-1' });
  const publicSession = makeOnlineSession('auth-public-1');

  const hostAdapter = new SupabaseOnlineTransportAdapter(runtime, realtime);
  const hiderAdapter = new SupabaseOnlineTransportAdapter(runtime, realtime);
  const publicAdapter = new SupabaseOnlineTransportAdapter(runtime, realtime);

  await hostAdapter.connect({
    sessionId: 'host-admin-session',
    authSession: hostSession,
    recipient: makeRecipient('host-admin:host-1', {
      actorId: hostSession.authUserId,
      playerId: 'host-1',
      role: 'host',
      scope: 'host_admin'
    })
  });
  await hiderAdapter.connect({
    sessionId: 'player-hider-session',
    authSession: hiderSession,
    recipient: makeRecipient('player-private:hider-1', {
      actorId: hiderSession.authUserId,
      playerId: 'hider-1',
      role: 'spectator',
      scope: 'player_private'
    })
  });
  await publicAdapter.connect({
    sessionId: 'public-session',
    authSession: publicSession,
    recipient: makeRecipient('public_match', {
      actorId: publicSession.authUserId,
      scope: 'public_match'
    })
  });

  const createResult = await hostAdapter.submit({
    matchId,
    commandId: 'command-1',
    occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 1)).toISOString(),
    actor: {
      actorId: 'ignored-by-adapter',
      role: 'host',
      playerId: 'host-1'
    },
    command: {
      type: 'create_match',
      payload: {
        mode: 'online',
        contentPackId: contentPack.packId,
        hostPlayerId: 'host-1',
        hostDisplayName: 'Host',
        initialScale: 'small'
      }
    }
  });

  assert.equal(createResult.accepted, true);

  const initialSnapshot = await publicAdapter.requestSnapshot({ matchId });
  const receivedSyncs = [];

  await publicAdapter.subscribe(
    {
      matchId,
      deliverInitialSync: false,
      cursor: {
        snapshotVersion: initialSnapshot.snapshotVersion,
        lastEventSequence: initialSnapshot.lastEventSequence
      }
    },
    async (envelope) => {
      receivedSyncs.push(envelope);
    }
  );

  const joinResult = await hiderAdapter.submit({
    matchId,
    commandId: 'command-2',
    occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 2)).toISOString(),
    actor: {
      actorId: 'ignored-by-adapter',
      role: 'hider',
      playerId: 'hider-1'
    },
    command: {
      type: 'join_match',
      payload: {
        playerId: 'hider-1',
        displayName: 'Hider'
      }
    }
  });

  assert.equal(joinResult.accepted, true);
  assert.equal(receivedSyncs.length, 1);
  assert.equal(receivedSyncs[0]?.kind, 'delta');
  assert.equal(receivedSyncs[0]?.eventStream.events.length, 1);
  assert.equal(receivedSyncs[0]?.eventStream.events[0]?.detail, 'summary');
  assert.equal(receivedSyncs[0]?.projectionDelivery.projection.players.length, 2);
  assert.equal(receivedSyncs[0]?.projectionDelivery.projection.hiddenState, undefined);

  const reconnect = await publicAdapter.reconnect({
    matchId,
    cursor: {
      snapshotVersion: 999,
      lastEventSequence: 999
    }
  });

  assert.equal(reconnect.kind, 'snapshot');
  assert.equal(reconnect.requiresResync, true);
});
