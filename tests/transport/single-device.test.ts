import assert from 'node:assert/strict';
import test from 'node:test';

import type { ContentPack } from '../../packages/shared-types/src/index.ts';
import {
  SingleDeviceRefereeRuntime,
  SingleDeviceRefereeTransportAdapter
} from '../../packages/transport/src/index.ts';
import { makeEnvelope } from '../engine/helpers.ts';
import { loadEngineTestContentPack } from '../engine/helpers.ts';
import { makeRecipient, setupRuntimeToHidePhase } from './helpers.ts';

function createSingleDeviceHarness(): {
  contentPack: ContentPack;
  runtime: SingleDeviceRefereeRuntime;
} {
  const contentPack = loadEngineTestContentPack();
  const runtime = new SingleDeviceRefereeRuntime({
    contentPacks: [contentPack]
  });

  return {
    contentPack,
    runtime
  };
}

test('single-device reveal flow opens only the scoped projection requested for protected handoff', async () => {
  const { contentPack, runtime } = createSingleDeviceHarness();
  const matchId = await setupRuntimeToHidePhase(
    runtime,
    contentPack,
    'single-device-reveal-match',
    'single_device_referee'
  );

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
          accuracyMeters: 10
        }
      },
      12
    )
  );

  const publicAdapter = new SingleDeviceRefereeTransportAdapter(runtime);
  await publicAdapter.connect({
    sessionId: 'public-referee-view',
    recipient: makeRecipient('public_match', {
      actorId: 'spectator-1',
      scope: 'public_match'
    })
  });
  const publicSnapshot = await publicAdapter.requestSnapshot({ matchId });
  assert.equal(publicSnapshot.projectionDelivery.projection.hiddenState, undefined);
  assert.equal(publicSnapshot.projectionDelivery.projection.visibleCards.length, 0);

  const refereeAdapter = new SingleDeviceRefereeTransportAdapter(runtime);
  await refereeAdapter.connect({
    sessionId: 'host-admin-referee-view',
    recipient: makeRecipient('host_admin:host-1', {
      actorId: 'host-1',
      playerId: 'host-1',
      role: 'host',
      scope: 'host_admin'
    })
  });

  const hostRevealTokenId = await refereeAdapter.armReveal({
    matchId,
    viewer: {
      scope: 'host_admin',
      viewerPlayerId: 'host-1',
      viewerRole: 'host'
    },
    reason: 'Protected referee reveal'
  });
  const hostReveal = await refereeAdapter.openReveal(hostRevealTokenId);
  assert.ok(hostReveal.projection.hiddenState?.hiderLocation);
  assert.ok(hostReveal.projection.visibleCards.length > 0);
  await refereeAdapter.hideReveal(hostRevealTokenId);

  const privateRevealTokenId = await refereeAdapter.armReveal({
    matchId,
    viewer: {
      scope: 'team_private',
      viewerPlayerId: 'hider-1',
      viewerTeamId: 'team-hider',
      viewerRole: 'hider'
    },
    reason: 'Pass device to hider'
  });
  const privateReveal = await refereeAdapter.openReveal(privateRevealTokenId);
  assert.equal(privateReveal.projection.hiddenState, undefined);
  assert.ok(privateReveal.projection.visibleCards.length > 0);
  await refereeAdapter.hideReveal(privateRevealTokenId);

  const revealTokens = await runtime.listRevealTokens(matchId);
  assert.equal(revealTokens.length, 2);
  assert.equal(revealTokens.every((token) => token.state === 'hidden'), true);
});

test('single-device reveal flow blocks overlapping reveals and repeated reveal transitions', async () => {
  const { contentPack, runtime } = createSingleDeviceHarness();
  const matchId = await setupRuntimeToHidePhase(
    runtime,
    contentPack,
    'single-device-guard-match',
    'single_device_referee'
  );

  const token = await runtime.armReveal({
    matchId,
    viewer: {
      scope: 'host_admin',
      viewerPlayerId: 'host-1',
      viewerRole: 'host'
    },
    reason: 'First reveal'
  });

  await assert.rejects(
    runtime.armReveal({
      matchId,
      viewer: {
        scope: 'player_private',
        viewerPlayerId: 'hider-1',
        viewerRole: 'hider'
      },
      reason: 'Competing reveal'
    }),
    /only one protected reveal/i
  );

  await runtime.openReveal(token.tokenId);
  await assert.rejects(
    runtime.openReveal(token.tokenId),
    /opened once while armed/i
  );

  await runtime.hideReveal(token.tokenId);
  await assert.rejects(
    runtime.hideReveal(token.tokenId),
    /already hidden/i
  );
});
