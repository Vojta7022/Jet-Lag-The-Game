import assert from 'node:assert/strict';

import type {
  AuthorityRuntime,
  AuthorityRuntimeMode,
  CommandEnvelope,
  ContentPack,
  MatchMode,
  MatchRole,
  ProjectionRecipient
} from '../../packages/shared-types/src/index.ts';
import {
  InMemoryAuthorityRuntime,
  InMemoryRuntimePersistence
} from '../../packages/transport/src/index.ts';
import {
  loadEngineTestContentPack,
  makeEnvelope,
  makeSquarePolygon
} from '../engine/helpers.ts';

export interface TransportHarness {
  contentPack: ContentPack;
  persistence: InMemoryRuntimePersistence;
  runtime: InMemoryAuthorityRuntime;
}

export function createTransportHarness(
  mode: AuthorityRuntimeMode = 'single_device_referee'
): TransportHarness {
  const contentPack = loadEngineTestContentPack();
  const persistence = new InMemoryRuntimePersistence();
  const runtime = new InMemoryAuthorityRuntime({
    mode,
    contentPacks: [contentPack],
    persistence
  });

  return {
    contentPack,
    persistence,
    runtime
  };
}

export function makeRecipient(
  recipientId: string,
  options: {
    actorId: string;
    scope: ProjectionRecipient['scope'];
    playerId?: string;
    teamId?: string;
    role?: MatchRole;
  }
): ProjectionRecipient {
  return {
    recipientId,
    actorId: options.actorId,
    playerId: options.playerId,
    teamId: options.teamId,
    role: options.role,
    scope: options.scope
  };
}

export async function submitSequence(
  runtime: AuthorityRuntime,
  commands: CommandEnvelope[]
): Promise<void> {
  for (const command of commands) {
    const result = await runtime.submitCommand(command);
    assert.equal(result.accepted, true, result.rejection?.message ?? 'Expected command submission to succeed.');
  }
}

export async function setupRuntimeToHidePhase(
  runtime: AuthorityRuntime,
  contentPack: ContentPack,
  matchId = 'transport-match',
  matchMode: MatchMode = 'single_device_referee'
): Promise<string> {
  await submitSequence(runtime, [
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'create_match',
        payload: {
          mode: matchMode,
          contentPackId: contentPack.packId,
          hostPlayerId: 'host-1',
          hostDisplayName: 'Host',
          initialScale: 'small'
        }
      },
      1
    ),
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
    ),
    makeEnvelope(
      matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      {
        type: 'join_match',
        payload: {
          playerId: 'seeker-1',
          displayName: 'Seeker'
        }
      },
      3
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'assign_role',
        payload: {
          targetPlayerId: 'hider-1',
          role: 'hider',
          teamId: 'team-hider'
        }
      },
      4
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'assign_role',
        payload: {
          targetPlayerId: 'seeker-1',
          role: 'seeker',
          teamId: 'team-seeker'
        }
      },
      5
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'confirm_roles',
        payload: {}
      },
      6
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'set_ruleset',
        payload: {
          rulesetId: 'test-ruleset'
        }
      },
      7
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'confirm_rules',
        payload: {}
      },
      8
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'create_map_region',
        payload: {
          regionId: 'region-1',
          displayName: 'Prague',
          regionKind: 'city',
          featureDatasetRefs: ['osm-core', 'transit-registry'],
          geometry: makeSquarePolygon()
        }
      },
      9
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'start_match',
        payload: {}
      },
      10
    )
  ]);

  return matchId;
}
