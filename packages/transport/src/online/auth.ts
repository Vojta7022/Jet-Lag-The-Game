import type {
  CommandEnvelope,
  MatchAggregate,
  MatchRole,
  OnlineAuthSession,
  OnlineCommandRequest,
  OnlineProjectionAccessRequest,
  ProjectionRecipient,
  ProjectionScope
} from '../../../shared-types/src/index.ts';
import { getPlayerRole, getPlayerTeam } from '../../../domain/src/index.ts';

import { TransportRuntimeError } from '../errors.ts';

import type {
  OnlineSessionAccessBinding,
  OnlineSessionBinder
} from './contracts.ts';
import { buildProjectionRecipientId } from './projection-targets.ts';

function defaultScopesForRole(role: MatchRole): ProjectionScope[] {
  switch (role) {
    case 'host':
      return ['host_admin', 'player_private', 'public_match', 'event_feed_public'];
    case 'hider':
    case 'seeker':
      return ['team_private', 'player_private', 'public_match', 'event_feed_public'];
    case 'spectator':
      return ['public_match', 'event_feed_public'];
    case 'system':
      return ['authority', 'host_admin', 'team_private', 'player_private', 'public_match', 'event_feed_public'];
    default:
      return ['public_match', 'event_feed_public'];
  }
}

function findMembership(session: OnlineAuthSession, matchId: string) {
  return session.memberships.find((membership) => membership.matchId === matchId);
}

function assertCommandPlayerMatch(
  session: OnlineAuthSession,
  request: OnlineCommandRequest,
  role: MatchRole
): void {
  if (request.command.type === 'create_match') {
    if (session.defaultPlayerId && request.command.payload.hostPlayerId !== session.defaultPlayerId) {
      throw new TransportRuntimeError(
        'AUTH_PLAYER_MISMATCH',
        'Create match host player must match the authenticated session player.'
      );
    }
  }

  if (request.command.type === 'join_match') {
    if (role === 'host' || role === 'system') {
      return;
    }

    const expectedPlayerId = session.defaultPlayerId ?? findMembership(session, request.matchId)?.playerId;
    if (expectedPlayerId && request.command.payload.playerId !== expectedPlayerId) {
      throw new TransportRuntimeError(
        'AUTH_PLAYER_MISMATCH',
        'Join match player must match the authenticated session player.'
      );
    }
  }
}

async function resolveAccessBinding(
  session: OnlineAuthSession,
  matchId: string,
  aggregate?: MatchAggregate
): Promise<OnlineSessionAccessBinding> {
  if (session.serviceRole) {
    return {
      actorId: session.authUserId,
      role: 'system',
      allowedScopes: defaultScopesForRole('system')
    };
  }

  const membership = findMembership(session, matchId);
  const playerId = membership?.playerId ?? session.defaultPlayerId;
  const derivedRole = aggregate ? getPlayerRole(aggregate, playerId) : undefined;
  const derivedTeamId = aggregate ? getPlayerTeam(aggregate, playerId)?.teamId : undefined;
  const role = membership?.role ?? derivedRole ?? (playerId ? 'spectator' : 'spectator');
  const teamId = membership?.teamId ?? derivedTeamId;
  const allowedScopes = membership?.allowedScopes ?? defaultScopesForRole(role);

  if (!session.defaultPlayerId && !membership && !aggregate) {
    return {
      actorId: session.authUserId,
      role: 'spectator',
      allowedScopes: defaultScopesForRole('spectator')
    };
  }

  return {
    actorId: session.authUserId,
    playerId,
    teamId,
    role,
    allowedScopes
  };
}

export class DefaultOnlineSessionBinder implements OnlineSessionBinder {
  async bindCommandEnvelope(
    session: OnlineAuthSession,
    request: OnlineCommandRequest,
    aggregate?: MatchAggregate
  ): Promise<{
    recipient: ProjectionRecipient;
    envelope: CommandEnvelope;
  }> {
    const access = await resolveAccessBinding(session, request.matchId, aggregate);
    assertCommandPlayerMatch(session, request, access.role);

    if (!session.serviceRole && request.command.type !== 'create_match' && request.command.type !== 'join_match' && !access.playerId) {
      throw new TransportRuntimeError(
        'MATCH_MEMBERSHIP_REQUIRED',
        'Authenticated commands require a bound player identity for this match.'
      );
    }

    const recipient = await this.bindRecipient(
      session,
      {
        matchId: request.matchId,
        requestedScope:
          access.role === 'host'
            ? 'host_admin'
            : access.role === 'spectator'
              ? 'public_match'
              : 'player_private'
      },
      aggregate
    );

    return {
      recipient,
      envelope: {
        commandId: request.commandId,
        matchId: request.matchId,
        actor: {
          actorId: access.actorId,
          playerId: access.playerId,
          role:
            request.command.type === 'create_match'
              ? 'host'
              : request.command.type === 'join_match'
                ? 'spectator'
                : access.role
        },
        occurredAt: request.occurredAt,
        idempotencyKey: request.idempotencyKey,
        clientSequence: request.clientSequence,
        command: request.command
      }
    };
  }

  async bindRecipient(
    session: OnlineAuthSession,
    request: OnlineProjectionAccessRequest,
    aggregate?: MatchAggregate
  ): Promise<ProjectionRecipient> {
    const access = await resolveAccessBinding(session, request.matchId, aggregate);
    const requestedScope = request.requestedScope ?? access.allowedScopes[0] ?? 'public_match';

    if (!access.allowedScopes.includes(requestedScope)) {
      throw new TransportRuntimeError(
        'PROJECTION_SCOPE_FORBIDDEN',
        `The requested scope "${requestedScope}" is not allowed for this authenticated session.`
      );
    }

    if (requestedScope === 'team_private' && !access.teamId) {
      throw new TransportRuntimeError(
        'TEAM_SCOPE_REQUIRES_TEAM',
        'Team-private projections require a bound team identity.'
      );
    }

    if ((requestedScope === 'player_private' || requestedScope === 'host_admin') && !access.playerId && !session.serviceRole) {
      throw new TransportRuntimeError(
        'PLAYER_SCOPE_REQUIRES_PLAYER',
        'This projection scope requires a bound player identity.'
      );
    }

    return {
      recipientId: buildProjectionRecipientId(requestedScope, access.playerId, access.teamId),
      actorId: access.actorId,
      playerId: access.playerId,
      teamId: access.teamId,
      role: access.role,
      scope: requestedScope
    };
  }
}
