import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchProjection } from '../../packages/engine/src/index.ts';
import { loadEngineTestContentPack, recordLocationUpdate, setupMatchToSeekReady } from './helpers.ts';

test('movement projections include seeker breadcrumbs while keeping hider raw movement hidden', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);

  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1',
    role: 'seeker',
    latitude: 50.081,
    longitude: 14.424,
    accuracyMeters: 15,
    step: 70
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1',
    role: 'seeker',
    latitude: 50.083,
    longitude: 14.438,
    accuracyMeters: 12,
    step: 71
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1',
    role: 'hider',
    latitude: 50.050,
    longitude: 14.470,
    accuracyMeters: 10,
    step: 72
  });

  const hostProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'host_admin',
    viewerPlayerId: 'host-1',
    viewerRole: 'host'
  });
  const seekerProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private',
    viewerPlayerId: 'seeker-1',
    viewerTeamId: 'team-seeker',
    viewerRole: 'seeker'
  });
  const hiderProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private',
    viewerPlayerId: 'hider-1',
    viewerTeamId: 'team-hider',
    viewerRole: 'hider'
  });
  const publicProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'public_match'
  });

  assert.equal(hostProjection.visibleMovementTracks.length, 1);
  assert.equal(hostProjection.visibleMovementTracks[0]?.playerId, 'seeker-1');
  assert.equal(hostProjection.visibleMovementTracks[0]?.samples.length, 2);

  assert.equal(seekerProjection.visibleMovementTracks.length, 1);
  assert.equal(seekerProjection.visibleMovementTracks[0]?.playerId, 'seeker-1');
  assert.equal(seekerProjection.visibleMovementTracks[0]?.latestSample?.longitude, 14.438);

  assert.equal(hiderProjection.visibleMovementTracks.length, 0);
  assert.equal(publicProjection.visibleMovementTracks.length, 0);
});
