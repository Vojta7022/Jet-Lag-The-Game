import { createRandomUuid } from '../../../shared-types/src/index.ts';

import type {
  AuthorityRuntimeMode,
  ContentPack,
  MatchAggregate,
  MatchProjection,
  MatchRole,
  ProjectionRecipient,
  ProjectionRecord,
  ProjectionScope
} from '../../../shared-types/src/index.ts';
import { buildMatchProjection } from '../../../engine/src/index.ts';
import { getPlayerRole } from '../../../domain/src/index.ts';

export function buildProjectionRecipientId(
  scope: ProjectionScope,
  viewerPlayerId?: string,
  viewerTeamId?: string
): string {
  if (scope === 'host_admin' || scope === 'player_private') {
    return `${scope}:${viewerPlayerId ?? 'anonymous'}`;
  }

  if (scope === 'team_private') {
    return `${scope}:${viewerTeamId ?? 'unknown-team'}`;
  }

  return scope;
}

export function buildProjectionChannelName(matchId: string, recipientId: string): string {
  return `match:${matchId}:projection:${recipientId}`;
}

function makeRecipient(
  scope: ProjectionScope,
  actorId: string,
  options: {
    playerId?: string;
    teamId?: string;
    role?: MatchRole;
  } = {}
): ProjectionRecipient {
  return {
    recipientId: buildProjectionRecipientId(scope, options.playerId, options.teamId),
    actorId,
    playerId: options.playerId,
    teamId: options.teamId,
    role: options.role,
    scope
  };
}

export function enumerateProjectionRecipients(aggregate: MatchAggregate): ProjectionRecipient[] {
  const recipients: ProjectionRecipient[] = [
    makeRecipient('public_match', 'public-match'),
    makeRecipient('event_feed_public', 'public-feed')
  ];

  for (const player of Object.values(aggregate.players)) {
    const role = getPlayerRole(aggregate, player.playerId);
    const teamId = aggregate.roleAssignments[player.playerId]?.teamId;
    const hasHostAdminAccess = player.playerId === aggregate.createdByPlayerId;

    recipients.push(
      makeRecipient('player_private', player.playerId, {
        playerId: player.playerId,
        teamId,
        role
      })
    );

    if (role === 'host' || hasHostAdminAccess) {
      recipients.push(
        makeRecipient('host_admin', player.playerId, {
          playerId: player.playerId,
          role
        })
      );
    }
  }

  for (const team of Object.values(aggregate.teams)) {
    const viewerPlayerId = team.memberPlayerIds[0];
    const viewerRole = getPlayerRole(aggregate, viewerPlayerId);

    if (!viewerPlayerId) {
      continue;
    }

    recipients.push(
      makeRecipient('team_private', viewerPlayerId, {
        playerId: viewerPlayerId,
        teamId: team.teamId,
        role: viewerRole
      })
    );
  }

  return recipients;
}

export function buildProjectionRecord(
  aggregate: MatchAggregate,
  contentPack: ContentPack,
  runtimeMode: AuthorityRuntimeMode,
  recipient: ProjectionRecipient
): ProjectionRecord {
  const projection: MatchProjection = buildMatchProjection(aggregate, contentPack, {
    scope: recipient.scope,
    viewerPlayerId: recipient.playerId,
    viewerTeamId: recipient.teamId,
    viewerRole: recipient.role
  });

  return {
    projectionRecordId: `projection:${createRandomUuid()}`,
    matchId: aggregate.matchId,
    recipientId: recipient.recipientId,
    projectionScope: recipient.scope,
    viewerPlayerId: recipient.playerId,
    viewerTeamId: recipient.teamId,
    snapshotVersion: aggregate.revision,
    lastEventSequence: aggregate.revision,
    projection,
    generatedAt: aggregate.updatedAt
  };
}

export function buildProjectionRecords(
  aggregate: MatchAggregate,
  contentPack: ContentPack,
  runtimeMode: AuthorityRuntimeMode
): ProjectionRecord[] {
  return enumerateProjectionRecipients(aggregate).map((recipient) =>
    buildProjectionRecord(aggregate, contentPack, runtimeMode, recipient)
  );
}
