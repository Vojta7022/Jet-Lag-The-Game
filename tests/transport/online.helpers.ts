import assert from 'node:assert/strict';

import type {
  OnlineAuthSession,
  OnlineCommandRequest
} from '../../packages/shared-types/src/index.ts';
import {
  MockOnlineRealtimeFanout,
  OnlineAuthorityRuntime,
  SupabaseContentPackReferenceRepository,
  SupabaseEventRepository,
  SupabaseMatchRepository,
  SupabaseProjectionRepository,
  SupabaseSnapshotRepository,
  InMemorySupabaseTableClient
} from '../../packages/transport/src/index.ts';
import {
  loadEngineTestContentPack,
  makeEnvelope,
  makeSquarePolygon
} from '../engine/helpers.ts';

export function createOnlineHarness() {
  const contentPack = loadEngineTestContentPack();
  const tableClient = new InMemorySupabaseTableClient();
  const realtime = new MockOnlineRealtimeFanout();
  const repositories = {
    matches: new SupabaseMatchRepository(tableClient),
    events: new SupabaseEventRepository(tableClient),
    snapshots: new SupabaseSnapshotRepository(tableClient),
    projections: new SupabaseProjectionRepository(tableClient),
    contentPackReferences: new SupabaseContentPackReferenceRepository(tableClient)
  };
  const runtime = new OnlineAuthorityRuntime({
    contentPacks: [contentPack],
    repositories,
    realtimeFanout: realtime
  });

  return {
    contentPack,
    tableClient,
    realtime,
    repositories,
    runtime
  };
}

export function makeOnlineSession(
  authUserId: string,
  options: {
    defaultPlayerId?: string;
    memberships?: OnlineAuthSession['memberships'];
    serviceRole?: boolean;
  } = {}
): OnlineAuthSession {
  return {
    authProvider: 'supabase',
    authSessionId: `session:${authUserId}`,
    authUserId,
    defaultPlayerId: options.defaultPlayerId,
    serviceRole: options.serviceRole,
    memberships: options.memberships ?? []
  };
}

export function makeOnlineCommandRequest(
  session: OnlineAuthSession,
  matchId: string,
  step: number,
  command: OnlineCommandRequest['command']
): OnlineCommandRequest {
  const envelope = makeEnvelope(
    matchId,
    {
      actorId: session.authUserId,
      playerId: session.defaultPlayerId,
      role: 'spectator'
    },
    command,
    step
  );

  return {
    matchId,
    commandId: envelope.commandId,
    occurredAt: envelope.occurredAt,
    idempotencyKey: envelope.idempotencyKey,
    clientSequence: envelope.clientSequence,
    command
  };
}

export async function submitOnlineSequence(
  runtime: OnlineAuthorityRuntime,
  commands: Array<{ session: OnlineAuthSession; request: OnlineCommandRequest }>
): Promise<void> {
  for (const entry of commands) {
    const result = await runtime.submitAuthenticatedCommand(entry.session, entry.request);
    assert.equal(result.accepted, true, result.rejection?.message ?? 'Expected online command to be accepted.');
  }
}

export async function setupOnlineMatchToHidePhase(
  runtime: OnlineAuthorityRuntime,
  contentPackId: string,
  matchId = 'online-match-1'
) {
  const hostSession = makeOnlineSession('auth-host-1', { defaultPlayerId: 'host-1' });
  const hiderSession = makeOnlineSession('auth-hider-1', { defaultPlayerId: 'hider-1' });
  const seekerSession = makeOnlineSession('auth-seeker-1', { defaultPlayerId: 'seeker-1' });

  await submitOnlineSequence(runtime, [
    {
      session: hostSession,
      request: makeOnlineCommandRequest(hostSession, matchId, 1, {
        type: 'create_match',
        payload: {
          mode: 'online',
          contentPackId,
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
    },
    {
      session: hostSession,
      request: makeOnlineCommandRequest(hostSession, matchId, 9, {
        type: 'create_map_region',
        payload: {
          regionId: 'region-1',
          displayName: 'Prague',
          regionKind: 'city',
          featureDatasetRefs: ['osm-core', 'transit-registry'],
          geometry: makeSquarePolygon()
        }
      })
    },
    {
      session: hostSession,
      request: makeOnlineCommandRequest(hostSession, matchId, 10, {
        type: 'start_match',
        payload: {}
      })
    }
  ]);

  return {
    matchId,
    hostSession,
    hiderSession,
    seekerSession
  };
}
