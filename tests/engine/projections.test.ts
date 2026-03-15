import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchProjection, executeCommand } from '../../packages/engine/src/index.ts';
import { loadEngineTestContentPack, makeEnvelope, setupMatchToHidePhase } from './helpers.ts';

test('projection builders redact hidden hider coordinates and private cards outside allowed scopes', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToHidePhase(contentPack);

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'draw_card',
        payload: {
          deckId: 'hider-main'
        }
      },
      50
    ),
    contentPack
  ).aggregate;

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'lock_hider_location',
        payload: {
          latitude: 48.2,
          longitude: 16.37,
          accuracyMeters: 12
        }
      },
      51
    ),
    contentPack
  ).aggregate;

  const authorityProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'authority',
    viewerPlayerId: 'host-1',
    viewerRole: 'host'
  });
  const publicProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'public_match'
  });
  const seekerTeamProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private',
    viewerPlayerId: 'seeker-1',
    viewerTeamId: 'team-seeker',
    viewerRole: 'seeker'
  });

  assert.ok(authorityProjection.hiddenState?.hiderLocation);
  assert.ok(authorityProjection.visibleCards.length > 0);
  assert.ok(authorityProjection.visibleEventLog.length >= publicProjection.visibleEventLog.length);
  assert.equal(authorityProjection.visibleMap?.displayName, 'Prague');
  assert.equal(authorityProjection.visibleMap?.featureDatasetRefs.length, 2);
  assert.deepEqual(
    authorityProjection.visibleMap?.remainingArea.geometry,
    authorityProjection.visibleMap?.playableBoundary.geometry
  );

  assert.equal(publicProjection.hiddenState, undefined);
  assert.equal(publicProjection.visibleCards.length, 0);
  assert.equal(
    publicProjection.visibleEventLog.every((entry) => entry.visibilityScope === 'public_match'),
    true
  );
  assert.equal(publicProjection.players.some((player) => player.role !== undefined), false);
  assert.equal(publicProjection.visibleMap?.displayName, 'Prague');
  assert.equal(publicProjection.visibleMap?.featureDatasetRefs.length, 0);

  assert.equal(seekerTeamProjection.hiddenState, undefined);
  assert.equal(seekerTeamProjection.visibleCards.length, 0);
  assert.equal(seekerTeamProjection.visibleMap?.remainingArea.clippedToRegion, true);
});
