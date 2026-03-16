import type {
  DomainCommand,
  MatchProjection
} from '../../../../../packages/shared-types/src/index.ts';

const ROLE_ASSIGNMENT_STATES = ['draft', 'lobby', 'role_assignment'] as const;

export function isRoleAssignmentStage(lifecycleState: string | undefined): boolean {
  return Boolean(lifecycleState && ROLE_ASSIGNMENT_STATES.includes(lifecycleState as (typeof ROLE_ASSIGNMENT_STATES)[number]));
}

export function hasRequiredRoleAssignments(projection: MatchProjection | undefined): boolean {
  if (!projection) {
    return false;
  }

  const assignedRoles = projection.players.map((player) => player.role);
  return assignedRoles.includes('hider') && assignedRoles.includes('seeker');
}

export function getAssignablePlayers(projection: MatchProjection | undefined) {
  if (!projection) {
    return [];
  }

  return projection.players.filter((player) => player.role !== 'host');
}

export function buildRoleAssignmentCommands(
  projection: MatchProjection,
  targetPlayerId: string,
  nextRole: 'hider' | 'seeker'
): DomainCommand[] {
  if (nextRole === 'seeker') {
    return [{
      type: 'assign_role',
      payload: {
        targetPlayerId,
        role: 'seeker',
        teamId: 'team-seeker'
      }
    }];
  }

  return getAssignablePlayers(projection).map((player) => ({
    type: 'assign_role',
    payload: {
      targetPlayerId: player.playerId,
      role: player.playerId === targetPlayerId ? 'hider' : 'seeker',
      teamId: player.playerId === targetPlayerId ? 'team-hider' : 'team-seeker'
    }
  }));
}
