import type {
  DomainCommand,
  MatchProjection
} from '../../../../../packages/shared-types/src/index.ts';

import { mobileShellRulesetId } from '../../runtime/augment-content-pack.ts';

export const mapSetupSeedPlayers = {
  hider: {
    playerId: 'seed-hider',
    displayName: 'Seed Hider'
  },
  seeker: {
    playerId: 'seed-seeker',
    displayName: 'Seed Seeker'
  }
};

function hasPlayer(projection: MatchProjection, playerId: string): boolean {
  return projection.players.some((player) => player.playerId === playerId);
}

function hasAssignedRole(projection: MatchProjection, role: 'hider' | 'seeker'): boolean {
  return projection.players.some((player) => player.role === role);
}

function roleForPlayer(projection: MatchProjection, playerId: string) {
  return projection.players.find((player) => player.playerId === playerId)?.role;
}

export function buildMapSetupBootstrapCommands(
  projection: MatchProjection,
  rulesetId = mobileShellRulesetId
): DomainCommand[] {
  if (
    projection.lifecycleState === 'map_setup' ||
    projection.lifecycleState === 'hide_phase' ||
    projection.lifecycleState === 'seek_phase' ||
    projection.lifecycleState === 'endgame' ||
    projection.lifecycleState === 'game_complete' ||
    projection.lifecycleState === 'archived'
  ) {
    return [];
  }

  const commands: DomainCommand[] = [];

  if (!hasAssignedRole(projection, 'hider')) {
    if (!hasPlayer(projection, mapSetupSeedPlayers.hider.playerId)) {
      commands.push({
        type: 'join_match',
        payload: {
          playerId: mapSetupSeedPlayers.hider.playerId,
          displayName: mapSetupSeedPlayers.hider.displayName
        }
      });
    }

    if (roleForPlayer(projection, mapSetupSeedPlayers.hider.playerId) !== 'hider') {
      commands.push({
        type: 'assign_role',
        payload: {
          targetPlayerId: mapSetupSeedPlayers.hider.playerId,
          role: 'hider',
          teamId: 'team-hider'
        }
      });
    }
  }

  if (!hasAssignedRole(projection, 'seeker')) {
    if (!hasPlayer(projection, mapSetupSeedPlayers.seeker.playerId)) {
      commands.push({
        type: 'join_match',
        payload: {
          playerId: mapSetupSeedPlayers.seeker.playerId,
          displayName: mapSetupSeedPlayers.seeker.displayName
        }
      });
    }

    if (roleForPlayer(projection, mapSetupSeedPlayers.seeker.playerId) !== 'seeker') {
      commands.push({
        type: 'assign_role',
        payload: {
          targetPlayerId: mapSetupSeedPlayers.seeker.playerId,
          role: 'seeker',
          teamId: 'team-seeker'
        }
      });
    }
  }

  if (
    projection.lifecycleState === 'draft' ||
    projection.lifecycleState === 'lobby' ||
    projection.lifecycleState === 'role_assignment'
  ) {
    commands.push({
      type: 'confirm_roles',
      payload: {}
    });
  }

  if (
    projection.lifecycleState === 'draft' ||
    projection.lifecycleState === 'lobby' ||
    projection.lifecycleState === 'role_assignment' ||
    projection.lifecycleState === 'rules_confirmation'
  ) {
    if (projection.selectedRulesetId !== rulesetId) {
      commands.push({
        type: 'set_ruleset',
        payload: {
          rulesetId
        }
      });
    }

    commands.push({
      type: 'confirm_rules',
      payload: {}
    });
  }

  return commands;
}
