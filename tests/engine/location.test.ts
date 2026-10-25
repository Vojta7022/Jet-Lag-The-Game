import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchProjection, executeCommand } from '../../packages/engine/src/index.ts';
import { loadEngineTestContentPack, makeEnvelope, recordLocationUpdate, setupMatchToSeekReady } from './helpers.ts';

test('authoritative location history preserves reported altitude and vertical accuracy', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToSeekReady(contentPack);
  const result = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'update_location',
    payload: {
      latitude: 50.081,
      longitude: 14.424,
      accuracyMeters: 8,
      altitudeMeters: 235.4,
      altitudeAccuracyMeters: 6.2,
      altitudeReference: 'wgs84_ellipsoid',
      source: 'device'
    }
  } as never, 69), contentPack);

  const sample = result.aggregate.locationSamples.at(-1);
  assert.equal(sample?.altitudeMeters, 235.4);
  assert.equal(sample?.altitudeAccuracyMeters, 6.2);
  assert.equal(sample?.altitudeReference, 'wgs84_ellipsoid');
  const seekerProjection = buildMatchProjection(result.aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });
  const visibleSeekerSample = seekerProjection.visibleMovementTracks[0]?.latestSample;
  assert.ok(visibleSeekerSample);
  assert.equal('altitudeMeters' in visibleSeekerSample, false);
});

test('location updates reject nonfinite or negative altitude accuracy', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToSeekReady(contentPack);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'update_location',
    payload: {
      latitude: 50.081,
      longitude: 14.424,
      altitudeMeters: 235.4,
      altitudeAccuracyMeters: -1,
      source: 'device'
    }
  } as never, 70), contentPack), /altitude accuracy/i);
});

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
  const hiderTeamProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private',
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

  assert.equal(hiderProjection.visibleMovementTracks.length, 1);
  assert.equal(hiderProjection.visibleMovementTracks[0]?.playerId, 'seeker-1');
  assert.equal(hiderTeamProjection.visibleMovementTracks.length, 1);
  assert.equal(hiderTeamProjection.visibleMovementTracks[0]?.playerId, 'seeker-1');
  assert.equal(hiderTeamProjection.visibleMovementTracks[0]?.samples.length, 2);
  assert.equal(hiderTeamProjection.visibleMovementTracks.some((track) => track.playerId === 'hider-1'), false);
  assert.equal(publicProjection.visibleMovementTracks.length, 0);
});
