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
    makeOnlineCommandRequest(setup.seekerSession, setup.matchId, 12, {
      type: 'begin_question_prompt',
      payload: {}
    })
  );
  await runtime.submitAuthenticatedCommand(
    setup.seekerSession,
    makeOnlineCommandRequest(setup.seekerSession, setup.matchId, 13, {
      type: 'ask_question',
      payload: {
        questionInstanceId: 'question:auto-cooldown',
        templateId: radarSelection.availableTemplateIds[0]!,
        targetTeamId: 'team-hider'
      }
    })
  );
  await runtime.submitAuthenticatedCommand(
    setup.hiderSession,
    makeOnlineCommandRequest(setup.hiderSession, setup.matchId, 14, {
      type: 'answer_question',
      payload: {
        questionInstanceId: 'question:auto-cooldown',
        answer: {
          value: 'yes'
        }
      }
    })
  );
  const applied = await runtime.submitAuthenticatedCommand(
    setup.hostSession,
    makeOnlineCommandRequest(setup.hostSession, setup.matchId, 15, {
      type: 'apply_constraint',
      payload: {
        questionInstanceId: 'question:auto-cooldown',
        constraintId: 'within-radius'
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
