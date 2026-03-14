import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProjectionChannelName } from '../../packages/transport/src/index.ts';
import { createTransportHarness, makeRecipient } from './helpers.ts';
import {
  createOnlineHarness,
  makeOnlineCommandRequest,
  makeOnlineSession,
  setupOnlineMatchToHidePhase
} from './online.helpers.ts';

test('online authority runtime persists repository records and publishes scoped fanout notices', async () => {
  const { contentPack, repositories, realtime, runtime } = createOnlineHarness();
  const hostSession = makeOnlineSession('auth-host-1', { defaultPlayerId: 'host-1' });
  const matchId = 'online-runtime-match';
  const publicNotices = [];
  const hostNotices = [];

  await realtime.subscribe(
    {
      matchId,
      recipientId: 'public_match',
      projectionScope: 'public_match',
      channelName: buildProjectionChannelName(matchId, 'public_match')
    },
    async (notice) => {
      publicNotices.push(notice);
    }
  );
  await realtime.subscribe(
    {
      matchId,
      recipientId: 'host_admin:host-1',
      projectionScope: 'host_admin',
      viewerPlayerId: 'host-1',
      channelName: buildProjectionChannelName(matchId, 'host_admin:host-1')
    },
    async (notice) => {
      hostNotices.push(notice);
    }
  );

  const result = await runtime.submitAuthenticatedCommand(
    hostSession,
    makeOnlineCommandRequest(hostSession, matchId, 1, {
      type: 'create_match',
      payload: {
        mode: 'online',
        contentPackId: contentPack.packId,
        hostPlayerId: 'host-1',
        hostDisplayName: 'Host',
        initialScale: 'small'
      }
    })
  );

  assert.equal(result.accepted, true);
  assert.equal((await repositories.matches.getByMatchId(matchId))?.revision, 1);
  assert.equal((await repositories.events.listAfterSequence(matchId, 0)).length, 1);
  assert.equal((await repositories.snapshots.getLatest(matchId))?.snapshotVersion, 1);
  assert.equal((await repositories.contentPackReferences.getByPackId(contentPack.packId))?.packVersion, contentPack.packVersion);
  assert.ok(await repositories.projections.getLatest({
    matchId,
    projectionScope: 'public_match',
    recipientId: 'public_match'
  }));
  assert.ok(await repositories.projections.getLatest({
    matchId,
    projectionScope: 'host_admin',
    recipientId: 'host_admin:host-1'
  }));
  assert.equal(publicNotices.length, 1);
  assert.equal(hostNotices.length, 1);
  assert.equal(publicNotices[0]?.projectionScope, 'public_match');
  assert.equal(hostNotices[0]?.projectionScope, 'host_admin');
});

test('online auth binding blocks impersonation and projection scope escalation', async () => {
  const { contentPack, runtime } = createOnlineHarness();
  const hostSession = makeOnlineSession('auth-host-1', { defaultPlayerId: 'host-1' });
  const publicSession = makeOnlineSession('auth-public-1');
  const matchId = 'online-auth-match';

  await runtime.submitAuthenticatedCommand(
    hostSession,
    makeOnlineCommandRequest(hostSession, matchId, 1, {
      type: 'create_match',
      payload: {
        mode: 'online',
        contentPackId: contentPack.packId,
        hostPlayerId: 'host-1',
        hostDisplayName: 'Host',
        initialScale: 'small'
      }
    })
  );

  await assert.rejects(
    runtime.submitAuthenticatedCommand(
      hostSession,
      makeOnlineCommandRequest(hostSession, matchId, 2, {
        type: 'join_match',
        payload: {
          playerId: 'hider-1',
          displayName: 'Impersonated Hider'
        }
      })
    ),
    /authenticated session player/i
  );

  await assert.rejects(
    runtime.requestAuthenticatedSnapshot(publicSession, {
      matchId,
      requestedScope: 'host_admin'
    }),
    /not allowed for this authenticated session/i
  );
});

test('online runtime serves redacted public projections while keeping host-admin projections privileged', async () => {
  const { contentPack, runtime } = createOnlineHarness();
  const setup = await setupOnlineMatchToHidePhase(runtime, contentPack.packId, 'online-redaction-match');

  await runtime.submitAuthenticatedCommand(
    setup.hiderSession,
    makeOnlineCommandRequest(setup.hiderSession, setup.matchId, 11, {
      type: 'draw_card',
      payload: {
        deckId: 'hider-main'
      }
    })
  );
  await runtime.submitAuthenticatedCommand(
    setup.hiderSession,
    makeOnlineCommandRequest(setup.hiderSession, setup.matchId, 12, {
      type: 'lock_hider_location',
      payload: {
        latitude: 50.08,
        longitude: 14.43,
        accuracyMeters: 10
      }
    })
  );

  const hostSnapshot = await runtime.requestAuthenticatedSnapshot(setup.hostSession, {
    matchId: setup.matchId,
    requestedScope: 'host_admin'
  });
  const publicSnapshot = await runtime.requestAuthenticatedSnapshot(makeOnlineSession('auth-public-1'), {
    matchId: setup.matchId,
    requestedScope: 'public_match'
  });

  assert.ok(hostSnapshot.projectionDelivery.projection.hiddenState?.hiderLocation);
  assert.ok(hostSnapshot.projectionDelivery.projection.visibleCards.length >= 1);
  assert.equal(publicSnapshot.projectionDelivery.projection.hiddenState, undefined);
  assert.equal(publicSnapshot.projectionDelivery.projection.visibleCards.length, 0);
  assert.equal(publicSnapshot.projectionDelivery.projection.visibleMap?.featureDatasetRefs.length, 0);
});
