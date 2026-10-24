import assert from 'node:assert/strict';
import test from 'node:test';

import { buildQuestionSelectionState } from '../../packages/domain/src/index.ts';
import { buildProjectionChannelName } from '../../packages/transport/src/index.ts';
import {
  MockOnlineRealtimeFanout,
  SupabaseContentPackReferenceRepository,
  SupabaseEventRepository,
  SupabaseMatchRepository,
  SupabaseSnapshotRepository,
  InMemorySupabaseTableClient,
  InMemoryOnlineAuthorityRepository,
  OnlineAuthorityRuntime
} from '../../packages/transport/src/index.ts';
import { createTransportHarness, makeRecipient } from './helpers.ts';
import {
  createOnlineHarness,
  makeOnlineCommandRequest,
  makeOnlineSession,
  submitOnlineSequence,
  setupOnlineMatchToHidePhase
} from './online.helpers.ts';

test('online runtime commits authoritative changes atomically when configured for server mode', async () => {
  const { contentPack, repositories, realtime } = createOnlineHarness();
  const commits: Array<{ expectedRevision: number | null; result: { events: unknown[] }; projections: unknown[] }> = [];
  const atomicStore = new class extends InMemoryOnlineAuthorityRepository {
    override async commit(input: Parameters<InMemoryOnlineAuthorityRepository['commit']>[0]) {
      commits.push({ expectedRevision: input.expectedRevision, result: input.result, projections: input.projections });
      return super.commit(input);
    }
  }();
  const runtime = new OnlineAuthorityRuntime({
    contentPacks: [contentPack],
    repositories,
    authorityRepository: atomicStore,
    realtimeFanout: realtime
  });
  const hostSession = makeOnlineSession('atomic-host', { defaultPlayerId: 'host-atomic' });
  const matchId = 'atomic-runtime-match';

  const createRequest = makeOnlineCommandRequest(hostSession, matchId, 1, {
    type: 'create_match',
    payload: {
      mode: 'online', contentPackId: contentPack.packId, hostPlayerId: 'host-atomic',
      hostDisplayName: 'Atomic Host', initialScale: 'small'
    }
  });
  const created = await runtime.submitAuthenticatedCommand(hostSession, createRequest);
  const retry = await runtime.submitAuthenticatedCommand(hostSession, createRequest);
  const joined = await runtime.submitAuthenticatedCommand(hostSession, makeOnlineCommandRequest(hostSession, matchId, 2, {
    type: 'join_match', payload: { playerId: 'setup-player', displayName: 'Setup Player' }
  }));

  assert.equal(created.accepted, true);
  assert.equal(created.aggregate, undefined);
  assert.deepEqual(created.events, []);
  assert.equal(retry.accepted, true);
  assert.equal(retry.commandId, created.commandId);
  assert.equal(joined.accepted, true);
  assert.deepEqual(commits.map((commit) => commit.expectedRevision), [null, 1]);
  assert.ok(commits.every((commit) => commit.projections.length > 0));
  assert.ok(commits.every((commit) => commit.result.events.length === 0));
});

test('online authority loads matching features server-side and completes answer plus map deduction atomically', async () => {
  const { contentPack, repositories, realtime } = createOnlineHarness();
  const providerCalls: Array<{ featureClassIds: string[]; regionType: string }> = [];
  const runtime = new OnlineAuthorityRuntime({
    contentPacks: [contentPack],
    repositories,
    realtimeFanout: realtime,
    questionFeatureDataProvider: {
      async load(request) {
        providerCalls.push({
          featureClassIds: request.featureClassIds,
          regionType: request.regionGeometry.type
        });
        return {
          source: 'OpenStreetMap',
          sourceUrl: 'https://www.openstreetmap.org/copyright',
          sourceVersion: 'test-feature-snapshot-v1',
          retrievedAt: '2026-10-24T00:00:16.000Z',
          coverage: 'approximate',
          features: [
            { featureId: 'osm:node/1', featureClassId: 'hospital', label: 'West Hospital', longitude: 103.799, latitude: 1.1, geometrySupport: 'point', coverage: 'approximate' },
            { featureId: 'osm:node/2', featureClassId: 'hospital', label: 'East Hospital', longitude: 103.821, latitude: 1.1, geometrySupport: 'point', coverage: 'approximate' }
          ]
        };
      }
    }
  });
  const { matchId, hostSession, hiderSession, seekerSession } = await setupOnlineMatchToHidePhase(runtime, contentPack.packId, 'feature-authority-match');
  await submitOnlineSequence(runtime, [
    { session: hiderSession, request: makeOnlineCommandRequest(hiderSession, matchId, 11, {
      type: 'lock_hider_location', payload: { latitude: 1.1, longitude: 103.82, accuracyMeters: 5 }
    }) },
    { session: hostSession, request: makeOnlineCommandRequest(hostSession, matchId, 12, {
      type: 'end_hide_phase', payload: {}
    }) },
    { session: seekerSession, request: makeOnlineCommandRequest(seekerSession, matchId, 13, {
      type: 'update_location', payload: { latitude: 1.1, longitude: 103.8, accuracyMeters: 5, source: 'device' }
    }) },
    { session: hiderSession, request: makeOnlineCommandRequest(hiderSession, matchId, 14, {
      type: 'update_location', payload: { latitude: 1.1, longitude: 103.82, accuracyMeters: 5, source: 'device' }
    }) },
    { session: seekerSession, request: makeOnlineCommandRequest(seekerSession, matchId, 15, {
      type: 'begin_question_prompt', payload: {}
    }) }
  ]);
  const asked = await runtime.submitAuthenticatedCommand(seekerSession, makeOnlineCommandRequest(seekerSession, matchId, 16, {
    type: 'ask_question',
    payload: {
      questionInstanceId: 'question:online-matching',
      templateId: 'matching-hospital',
      targetTeamId: 'team-hider',
      featureData: [{ featureId: 'spoofed', featureClassId: 'hospital', longitude: 0, latitude: 0 }]
    } as never
  }));

  assert.equal(asked.accepted, true);
  assert.deepEqual(providerCalls, [{ featureClassIds: ['hospital'], regionType: 'Polygon' }]);
  assert.equal(asked.aggregate?.questionInstances['question:online-matching']?.answer?.value, 'no');
  assert.equal(Object.values(asked.aggregate?.constraints ?? {}).some((constraint) =>
    constraint.sourceQuestionInstanceId === 'question:online-matching'), true);
});

test('online authority computes Station Name Length from its trusted station snapshot and applies the matching geometry', async () => {
  const { contentPack, repositories, realtime } = createOnlineHarness();
  const providerCalls: string[][] = [];
  const runtime = new OnlineAuthorityRuntime({
    contentPacks: [contentPack],
    repositories,
    realtimeFanout: realtime,
    questionFeatureDataProvider: {
      async load(request) {
        providerCalls.push(request.featureClassIds);
        return {
          source: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/copyright',
          sourceVersion: 'test-feature-snapshot-v1', retrievedAt: '2026-10-24T00:00:16.000Z',
          coverage: 'approximate', features: [
            { featureId: 'osm:node/1', featureClassId: 'stations-name-length', label: 'Café', longitude: 103.799, latitude: 1.1, geometrySupport: 'point', coverage: 'approximate' },
            { featureId: 'osm:node/2', featureClassId: 'stations-name-length', label: 'Cafe\u0301', longitude: 103.821, latitude: 1.1, geometrySupport: 'point', coverage: 'approximate' },
            { featureId: 'osm:node/3', featureClassId: 'stations-name-length', label: 'Broadway', longitude: 103.81, latitude: 1.1, geometrySupport: 'point', coverage: 'approximate' }
          ]
        };
      }
    }
  });
  const { matchId, hostSession, hiderSession, seekerSession } = await setupOnlineMatchToHidePhase(runtime, contentPack.packId, 'station-name-match');
  await submitOnlineSequence(runtime, [
    { session: hiderSession, request: makeOnlineCommandRequest(hiderSession, matchId, 11, {
      type: 'lock_hider_location', payload: { latitude: 1.1, longitude: 103.82, accuracyMeters: 5 }
    }) },
    { session: hostSession, request: makeOnlineCommandRequest(hostSession, matchId, 12, {
      type: 'end_hide_phase', payload: {}
    }) },
    { session: seekerSession, request: makeOnlineCommandRequest(seekerSession, matchId, 13, {
      type: 'update_location', payload: { latitude: 1.1, longitude: 103.8, accuracyMeters: 5, source: 'device' }
    }) },
    { session: hiderSession, request: makeOnlineCommandRequest(hiderSession, matchId, 14, {
      type: 'update_location', payload: { latitude: 1.1, longitude: 103.82, accuracyMeters: 5, source: 'device' }
    }) },
    { session: seekerSession, request: makeOnlineCommandRequest(seekerSession, matchId, 15, {
      type: 'begin_question_prompt', payload: {}
    }) }
  ]);
  const asked = await runtime.submitAuthenticatedCommand(seekerSession, makeOnlineCommandRequest(seekerSession, matchId, 16, {
    type: 'ask_question',
    payload: {
      questionInstanceId: 'question:online-station-name',
      templateId: 'matching-stations-name-length',
      targetTeamId: 'team-hider',
      featureData: [{ featureId: 'spoofed', featureClassId: 'stations-name-length', label: 'Wrong', longitude: 0, latitude: 0 }]
    } as never
  }));

  assert.equal(asked.accepted, true);
  assert.deepEqual(providerCalls, [['stations-name-length']]);
  assert.equal(asked.aggregate?.questionInstances['question:online-station-name']?.answer?.value, 'yes');
  const constraint = Object.values(asked.aggregate?.constraints ?? {}).find((item) =>
    item.sourceQuestionInstanceId === 'question:online-station-name'
  );
  assert.equal(constraint?.resolutionMode, 'approximate');
  assert.match(constraint?.explanation.summary ?? '', /nearest station name/i);
});

test('online authority resolves scanned Tentacles from its seeker-anchored candidate set', async () => {
  const { contentPack, repositories, realtime } = createOnlineHarness();
  const providerCalls: string[][] = [];
  const runtime = new OnlineAuthorityRuntime({
    contentPacks: [contentPack],
    repositories,
    realtimeFanout: realtime,
    questionFeatureDataProvider: {
      async load(request) {
        providerCalls.push(request.featureClassIds);
        return {
          source: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/copyright',
          sourceVersion: 'test-feature-snapshot-v1', retrievedAt: '2026-10-24T00:00:16.000Z',
          coverage: 'approximate', features: [
            { featureId: 'osm:node/10', featureClassId: 'museums', label: 'Near Museum', longitude: 14.205, latitude: 50.2, geometrySupport: 'point', coverage: 'approximate' },
            { featureId: 'osm:node/11', featureClassId: 'museums', label: 'Farther Museum', longitude: 14.208, latitude: 50.2, geometrySupport: 'point', coverage: 'approximate' },
            { featureId: 'osm:node/12', featureClassId: 'museums', label: 'Outside Reach Museum', longitude: 14.23, latitude: 50.2, geometrySupport: 'point', coverage: 'approximate' }
          ]
        };
      }
    }
  });
  const { matchId, hostSession, hiderSession, seekerSession } = await setupOnlineMatchToHidePhase(
    runtime, contentPack.packId, 'feature-tentacles-match', 'medium'
  );
  await submitOnlineSequence(runtime, [
    { session: hiderSession, request: makeOnlineCommandRequest(hiderSession, matchId, 11, {
      type: 'lock_hider_location', payload: { latitude: 50.2, longitude: 14.2045, accuracyMeters: 5 }
    }) },
    { session: hostSession, request: makeOnlineCommandRequest(hostSession, matchId, 12, {
      type: 'end_hide_phase', payload: {}
    }) },
    { session: seekerSession, request: makeOnlineCommandRequest(seekerSession, matchId, 13, {
      type: 'update_location', payload: { latitude: 50.2, longitude: 14.2, accuracyMeters: 5, source: 'device' }
    }) },
    { session: hiderSession, request: makeOnlineCommandRequest(hiderSession, matchId, 14, {
      type: 'update_location', payload: { latitude: 50.2, longitude: 14.2045, accuracyMeters: 5, source: 'device' }
    }) },
    { session: seekerSession, request: makeOnlineCommandRequest(seekerSession, matchId, 15, {
      type: 'begin_question_prompt', payload: {}
    }) }
  ]);
  const asked = await runtime.submitAuthenticatedCommand(seekerSession, makeOnlineCommandRequest(seekerSession, matchId, 16, {
    type: 'ask_question',
    payload: {
      questionInstanceId: 'question:online-tentacles',
      templateId: 'tentacles-museums-1600',
      targetTeamId: 'team-hider',
      featureData: [{ featureId: 'spoofed', featureClassId: 'museums', longitude: 0, latitude: 0 }]
    } as never
  }));

  assert.equal(asked.accepted, true);
  assert.deepEqual(providerCalls, [['museums']]);
  assert.equal(asked.aggregate?.questionInstances['question:online-tentacles']?.answer?.selectedFeatureId, 'osm:node/10');
  assert.equal(Object.values(asked.aggregate?.constraints ?? {}).some((constraint) =>
    constraint.sourceQuestionInstanceId === 'question:online-tentacles'), true);
  const recordedConstraint = Object.values(asked.aggregate?.constraints ?? {}).find((constraint) =>
    constraint.sourceQuestionInstanceId === 'question:online-tentacles');
  assert.deepEqual(recordedConstraint?.metadata.candidateFeatureIds, ['osm:node/10', 'osm:node/11']);
});

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
  const storedMatch = await repositories.matches.getByMatchId(matchId);
  assert.equal(storedMatch?.revision, 1);
  assert.match(storedMatch?.joinCode ?? '', /^[A-Z0-9]{6}$/);
  assert.equal((await repositories.matches.getByJoinCode(storedMatch?.joinCode ?? ''))?.matchId, matchId);
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

test('online auth binding lets the host add setup players while still blocking non-host impersonation and scope escalation', async () => {
  const { contentPack, runtime } = createOnlineHarness();
  const hostSession = makeOnlineSession('auth-host-1', { defaultPlayerId: 'host-1' });
  const playerSession = makeOnlineSession('auth-player-1', { defaultPlayerId: 'player-1' });
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

  const hostAddedPlayer = await runtime.submitAuthenticatedCommand(
    hostSession,
    makeOnlineCommandRequest(hostSession, matchId, 2, {
      type: 'join_match',
      payload: {
        playerId: 'seed-hider',
        displayName: 'Seed Hider'
      }
    })
  );

  assert.equal(hostAddedPlayer.accepted, true);

  await assert.rejects(
    runtime.submitAuthenticatedCommand(
      playerSession,
      makeOnlineCommandRequest(playerSession, matchId, 3, {
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

test('online joiners can request player_private after joining even before role assignment', async () => {
  const { contentPack, runtime } = createOnlineHarness();
  const hostSession = makeOnlineSession('auth-host-join-scope', { defaultPlayerId: 'host-1' });
  const joiningSession = makeOnlineSession('auth-joining-player', { defaultPlayerId: 'player-2' });
  const publicSession = makeOnlineSession('auth-public-player-private');
  const matchId = 'online-join-player-private';

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

  const joined = await runtime.submitAuthenticatedCommand(
    joiningSession,
    makeOnlineCommandRequest(joiningSession, matchId, 2, {
      type: 'join_match',
      payload: {
        playerId: 'player-2',
        displayName: 'Second Device Player'
      }
    })
  );

  assert.equal(joined.accepted, true);

  const privateSnapshot = await runtime.requestAuthenticatedSnapshot(joiningSession, {
    matchId,
    requestedScope: 'player_private'
  });

  assert.equal(privateSnapshot.projectionScope, 'player_private');
  assert.ok(
    privateSnapshot.projectionDelivery.projection.players.some((player) => player.playerId === 'player-2')
  );

  await assert.rejects(
    runtime.requestAuthenticatedSnapshot(joiningSession, {
      matchId,
      requestedScope: 'team_private'
    }),
    /not allowed for this authenticated session|require a bound team identity/i
  );

  await assert.rejects(
    runtime.requestAuthenticatedSnapshot(publicSession, {
      matchId,
      requestedScope: 'player_private'
    }),
    /not allowed for this authenticated session/i
  );
});

test('online join fails with a precise state-unavailable error when match metadata exists but events are not ready yet', async () => {
  const { contentPack, runtime, tableClient } = createOnlineHarness();
  const joiningSession = makeOnlineSession('auth-joining-state-wait', { defaultPlayerId: 'player-2' });
  const matchId = 'online-join-state-wait';

  await tableClient.upsert(
    'matches',
    {
      matchId,
      joinCode: 'WAIT42',
      mode: 'online',
      lifecycleState: 'draft',
      revision: 1,
      contentPackId: contentPack.packId,
      createdByPlayerId: 'host-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    ['matchId']
  );

  await assert.rejects(
    runtime.submitAuthenticatedCommand(
      joiningSession,
      makeOnlineCommandRequest(joiningSession, matchId, 1, {
        type: 'join_match',
        payload: {
          playerId: 'player-2',
          displayName: 'Joining Player'
        }
      })
    ),
    /event or snapshot state is not available yet/i
  );
});

test('online join fails with a precise metadata error when the stored match row lacks content-pack metadata', async () => {
  const { runtime, tableClient } = createOnlineHarness();
  const joiningSession = makeOnlineSession('auth-joining-metadata-missing', { defaultPlayerId: 'player-3' });
  const matchId = 'online-join-metadata-missing';

  await tableClient.upsert(
    'matches',
    {
      matchId,
      joinCode: 'META42',
      mode: 'online',
      lifecycleState: 'draft',
      revision: 1,
      createdByPlayerId: 'host-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    ['matchId']
  );

  await assert.rejects(
    runtime.submitAuthenticatedCommand(
      joiningSession,
      makeOnlineCommandRequest(joiningSession, matchId, 1, {
        type: 'join_match',
        payload: {
          playerId: 'player-3',
          displayName: 'Joining Player'
        }
      })
    ),
    /missing its content pack metadata/i
  );
});

test('online host keeps host-admin access even after joining a team during role assignment', async () => {
  const { contentPack, runtime } = createOnlineHarness();
  const hostSession = makeOnlineSession('auth-host-team-play', { defaultPlayerId: 'host-1' });
  const seekerSession = makeOnlineSession('auth-seeker-team-play', { defaultPlayerId: 'player-2' });
  const matchId = 'online-host-team-play';

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

  await runtime.submitAuthenticatedCommand(
    seekerSession,
    makeOnlineCommandRequest(seekerSession, matchId, 2, {
      type: 'join_match',
      payload: {
        playerId: 'player-2',
        displayName: 'Second Player'
      }
    })
  );

  const assignedHost = await runtime.submitAuthenticatedCommand(
    hostSession,
    makeOnlineCommandRequest(hostSession, matchId, 3, {
      type: 'assign_role',
      payload: {
        targetPlayerId: 'host-1',
        role: 'hider',
        teamId: 'team-hider'
      }
    })
  );

  const assignedSeeker = await runtime.submitAuthenticatedCommand(
    hostSession,
    makeOnlineCommandRequest(hostSession, matchId, 4, {
      type: 'assign_role',
      payload: {
        targetPlayerId: 'player-2',
        role: 'seeker',
        teamId: 'team-seeker'
      }
    })
  );

  const confirmed = await runtime.submitAuthenticatedCommand(
    hostSession,
    makeOnlineCommandRequest(hostSession, matchId, 5, {
      type: 'confirm_roles',
      payload: {}
    })
  );

  assert.equal(assignedHost.accepted, true);
  assert.equal(assignedSeeker.accepted, true);
  assert.equal(confirmed.accepted, true);

  const hostAdminSnapshot = await runtime.requestAuthenticatedSnapshot(hostSession, {
    matchId,
    requestedScope: 'host_admin'
  });

  assert.equal(hostAdminSnapshot.projectionScope, 'host_admin');
  assert.ok(
    hostAdminSnapshot.projectionDelivery.projection.players.some(
      (player) => player.playerId === 'host-1' && player.role === 'hider'
    )
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

test('online runtime automatically ends an overdue hide phase once the hider location is locked', async () => {
  const { contentPack, runtime } = createOnlineHarness();
  const setup = await setupOnlineMatchToHidePhase(runtime, contentPack.packId, 'online-auto-hide-phase');

  const locked = await runtime.submitAuthenticatedCommand(
    setup.hiderSession,
    makeOnlineCommandRequest(setup.hiderSession, setup.matchId, 11, {
      type: 'lock_hider_location',
      payload: {
        latitude: 50.08,
        longitude: 14.43,
        accuracyMeters: 10
      }
    })
  );

  assert.equal(locked.accepted, true);
  assert.equal(locked.snapshot?.aggregate.lifecycleState, 'hide_phase');

  const hostSnapshot = await runtime.requestAuthenticatedSnapshot(setup.hostSession, {
    matchId: setup.matchId,
    requestedScope: 'host_admin'
  });

  assert.equal(hostSnapshot.projectionDelivery.projection.lifecycleState, 'seek_phase');
  assert.equal(hostSnapshot.projectionDelivery.projection.seekPhaseSubstate, 'ready');
});

test('online runtime automatically completes overdue cooldown before serving the next snapshot', async () => {
  const { contentPack, runtime } = createOnlineHarness();
  const setup = await setupOnlineMatchToHidePhase(runtime, contentPack.packId, 'online-auto-cooldown');

  await runtime.submitAuthenticatedCommand(
    setup.hiderSession,
    makeOnlineCommandRequest(setup.hiderSession, setup.matchId, 11, {
      type: 'lock_hider_location',
      payload: {
        latitude: 50.08,
        longitude: 14.43,
        accuracyMeters: 10
      }
    })
  );

  const readySnapshot = await runtime.requestAuthenticatedSnapshot(setup.hostSession, {
    matchId: setup.matchId,
    requestedScope: 'host_admin'
  });
  assert.equal(readySnapshot.projectionDelivery.projection.seekPhaseSubstate, 'ready');

  await runtime.submitAuthenticatedCommand(
    setup.hiderSession,
    makeOnlineCommandRequest(setup.hiderSession, setup.matchId, 12, {
      type: 'update_location',
      payload: { latitude: 50.08, longitude: 14.43, accuracyMeters: 5, source: 'device' }
    })
  );
  await runtime.submitAuthenticatedCommand(
    setup.seekerSession,
    makeOnlineCommandRequest(setup.seekerSession, setup.matchId, 13, {
      type: 'update_location',
      payload: { latitude: 50.081, longitude: 14.43, accuracyMeters: 5, source: 'device' }
    })
  );

  const radarCategory = contentPack.questionCategories.find((entry) => entry.categoryId === 'radar');
  assert.ok(radarCategory);
  const radarSelection = buildQuestionSelectionState({
    contentPack,
    category: radarCategory!,
    selectedScale: 'small',
    askedQuestions: []
  });

  await runtime.submitAuthenticatedCommand(
    setup.seekerSession,
    makeOnlineCommandRequest(setup.seekerSession, setup.matchId, 14, {
      type: 'begin_question_prompt',
      payload: {}
    })
  );
  const applied = await runtime.submitAuthenticatedCommand(
    setup.seekerSession,
    makeOnlineCommandRequest(setup.seekerSession, setup.matchId, 15, {
      type: 'ask_question',
      payload: {
        questionInstanceId: 'question:auto-cooldown',
        templateId: radarSelection.availableTemplateIds[0]!,
        targetTeamId: 'team-hider'
      }
    })
  );
  assert.equal(applied.accepted, true);
  assert.equal(applied.snapshot?.aggregate.seekPhaseSubstate, 'cooldown');

  const cooledSnapshot = await runtime.requestAuthenticatedSnapshot(setup.hostSession, {
    matchId: setup.matchId,
    requestedScope: 'host_admin'
  });

  assert.equal(cooledSnapshot.projectionDelivery.projection.seekPhaseSubstate, 'ready');
});

test('online runtime rebuilds create_map_region projections from authoritative state when projection cache persistence fails', async () => {
  const tableClient = new InMemorySupabaseTableClient();
  const contentPack = createOnlineHarness().contentPack;
  const repositories = {
    matches: new SupabaseMatchRepository(tableClient),
    events: new SupabaseEventRepository(tableClient),
    snapshots: new SupabaseSnapshotRepository(tableClient),
    projections: {
      async saveMany() {
        throw new Error('projection cache write failed');
      },
      async getLatest() {
        throw new Error('projection cache read failed');
      }
    },
    contentPackReferences: new SupabaseContentPackReferenceRepository(tableClient)
  };
  const runtime = new OnlineAuthorityRuntime({
    contentPacks: [contentPack],
    repositories,
    realtimeFanout: new MockOnlineRealtimeFanout()
  });
  const hostSession = makeOnlineSession('auth-host-projection-fallback', { defaultPlayerId: 'host-1' });
  const hiderSession = makeOnlineSession('auth-hider-projection-fallback', { defaultPlayerId: 'hider-1' });
  const seekerSession = makeOnlineSession('auth-seeker-projection-fallback', { defaultPlayerId: 'seeker-1' });
  const matchId = 'online-region-projection-fallback';

  await submitOnlineSequence(runtime, [
    {
      session: hostSession,
      request: makeOnlineCommandRequest(hostSession, matchId, 1, {
        type: 'create_match',
        payload: {
          mode: 'online',
          contentPackId: contentPack.packId,
          hostPlayerId: 'host-1',
          hostDisplayName: 'Host',
          initialScale: 'small'
        }
      })
    },
    {
      session: hiderSession,
      request: makeOnlineCommandRequest(hiderSession, matchId, 2, {
        type: 'join_match',
        payload: {
          playerId: 'hider-1',
          displayName: 'Hider'
        }
      })
    },
    {
      session: seekerSession,
      request: makeOnlineCommandRequest(seekerSession, matchId, 3, {
        type: 'join_match',
        payload: {
          playerId: 'seeker-1',
          displayName: 'Seeker'
        }
      })
    },
    {
      session: hostSession,
      request: makeOnlineCommandRequest(hostSession, matchId, 4, {
        type: 'assign_role',
        payload: {
          targetPlayerId: 'hider-1',
          role: 'hider',
          teamId: 'team-hider'
        }
      })
    },
    {
      session: hostSession,
      request: makeOnlineCommandRequest(hostSession, matchId, 5, {
        type: 'assign_role',
        payload: {
          targetPlayerId: 'seeker-1',
          role: 'seeker',
          teamId: 'team-seeker'
        }
      })
    },
    {
      session: hostSession,
      request: makeOnlineCommandRequest(hostSession, matchId, 6, {
        type: 'confirm_roles',
        payload: {}
      })
    },
    {
      session: hostSession,
      request: makeOnlineCommandRequest(hostSession, matchId, 7, {
        type: 'set_ruleset',
        payload: {
          rulesetId: 'test-ruleset'
        }
      })
    },
    {
      session: hostSession,
      request: makeOnlineCommandRequest(hostSession, matchId, 8, {
        type: 'confirm_rules',
        payload: {}
      })
    }
  ]);

  const applied = await runtime.submitAuthenticatedCommand(
    hostSession,
    makeOnlineCommandRequest(hostSession, matchId, 9, {
      type: 'create_map_region',
      payload: {
        regionId: 'region-fallback',
        displayName: 'Fallback Region',
        regionKind: 'city',
        featureDatasetRefs: ['osm-core'],
        geometry: {
          type: 'Polygon',
          coordinates: [[[14.3, 50.0], [14.6, 50.0], [14.6, 50.2], [14.3, 50.2], [14.3, 50.0]]]
        }
      }
    })
  );

  assert.equal(applied.accepted, true);

  const snapshot = await runtime.requestAuthenticatedSnapshot(hostSession, {
    matchId,
    requestedScope: 'host_admin'
  });

  assert.equal(snapshot.projectionDelivery.projection.visibleMap?.regionId, 'region-fallback');
  assert.equal(snapshot.projectionDelivery.projection.visibleMap?.displayName, 'Fallback Region');
});
