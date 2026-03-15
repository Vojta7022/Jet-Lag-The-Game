import type {
  AuthorityRuntimeMode,
  ContentPack,
  DomainEventEnvelope,
  MatchAggregate,
  MatchProjection,
  MatchRuntimeSnapshot,
  ProjectionRecipient,
  ProjectionViewer,
  SyncCursor,
  SyncEnvelope,
  SyncEnvelopeKind,
  TransportEventFrame
} from '../../shared-types/src/index.ts';
import { createRandomUuid } from '../../shared-types/src/index.ts';
import { buildMatchProjection } from '../../engine/src/index.ts';
import { getPlayerRole, getPlayerTeam } from '../../domain/src/index.ts';

function isTrustedScope(scope: ProjectionRecipient['scope']): boolean {
  return scope === 'authority' || scope === 'host_admin';
}

function canReceiveSummary(scope: ProjectionRecipient['scope'], event: DomainEventEnvelope): boolean {
  if (isTrustedScope(scope)) {
    return true;
  }

  return event.visibilityScope === 'public_match' || event.visibilityScope === 'event_feed_public';
}

export function buildProjectionViewer(
  aggregate: MatchAggregate,
  recipient: ProjectionRecipient
): ProjectionViewer {
  const viewerPlayerId = recipient.playerId;
  const viewerRole = recipient.role ?? getPlayerRole(aggregate, viewerPlayerId);
  const viewerTeamId = recipient.teamId ?? getPlayerTeam(aggregate, viewerPlayerId)?.teamId;

  return {
    scope: recipient.scope,
    viewerPlayerId,
    viewerTeamId,
    viewerRole
  };
}

export function createMatchSnapshot(
  aggregate: MatchAggregate,
  runtimeMode: AuthorityRuntimeMode
): MatchRuntimeSnapshot {
  return {
    snapshotId: `snapshot:${createRandomUuid()}`,
    matchId: aggregate.matchId,
    contentPackId: aggregate.contentPackId,
    runtimeMode,
    snapshotVersion: aggregate.revision,
    lastEventSequence: aggregate.revision,
    aggregate,
    createdAt: aggregate.updatedAt
  };
}

function buildEventFrames(
  recipient: ProjectionRecipient,
  events: DomainEventEnvelope[]
): TransportEventFrame[] {
  return events
    .filter((event) => canReceiveSummary(recipient.scope, event))
    .map((event) => ({
      eventId: event.eventId,
      sequence: event.sequence,
      type: event.event.type,
      occurredAt: event.occurredAt,
      actorId: event.actor.actorId,
      actorRole: event.actor.role,
      visibilityScope: event.visibilityScope,
      detail: isTrustedScope(recipient.scope) ? 'full' : 'summary',
      event: isTrustedScope(recipient.scope) ? event : undefined
    }));
}

function shouldRequireResync(
  aggregate: MatchAggregate,
  cursor: SyncCursor | undefined
): boolean {
  if (!cursor) {
    return false;
  }

  if (
    cursor.snapshotVersion !== undefined &&
    cursor.lastEventSequence !== undefined &&
    cursor.lastEventSequence < cursor.snapshotVersion
  ) {
    return true;
  }

  if (
    (cursor.snapshotVersion ?? 0) > aggregate.revision ||
    (cursor.lastEventSequence ?? 0) > aggregate.revision
  ) {
    return true;
  }

  return false;
}

export interface BuildSyncEnvelopeOptions {
  aggregate: MatchAggregate;
  contentPack: ContentPack;
  runtimeMode: AuthorityRuntimeMode;
  recipient: ProjectionRecipient;
  events: DomainEventEnvelope[];
  cursor?: SyncCursor;
  forceKind?: SyncEnvelopeKind;
  projection?: MatchProjection;
  generatedAt?: string;
}

export function buildSyncEnvelope(options: BuildSyncEnvelopeOptions): SyncEnvelope {
  const requiresResync = shouldRequireResync(options.aggregate, options.cursor);
  const kind =
    options.forceKind ??
    (requiresResync || !options.cursor || (options.cursor.snapshotVersion === undefined && options.cursor.lastEventSequence === undefined)
      ? 'snapshot'
      : 'delta');
  const generatedAt = options.generatedAt ?? options.aggregate.updatedAt;
  const projection =
    options.projection ??
    buildMatchProjection(
      options.aggregate,
      options.contentPack,
      buildProjectionViewer(options.aggregate, options.recipient)
    );
  const eventFrames = kind === 'snapshot' || requiresResync
    ? []
    : buildEventFrames(options.recipient, options.events);
  const lastSeenSequence = options.cursor?.lastEventSequence ?? 0;

  return {
    syncId: `sync:${createRandomUuid()}`,
    kind,
    matchId: options.aggregate.matchId,
    runtimeMode: options.runtimeMode,
    projectionScope: options.recipient.scope,
    snapshotVersion: options.aggregate.revision,
    lastEventSequence: options.aggregate.revision,
    baseSnapshotVersion: options.cursor?.snapshotVersion,
    requiresResync,
    projectionDelivery: {
      deliveryId: `delivery:${createRandomUuid()}`,
      matchId: options.aggregate.matchId,
      runtimeMode: options.runtimeMode,
      projectionScope: options.recipient.scope,
      recipient: options.recipient,
      snapshotVersion: options.aggregate.revision,
      lastEventSequence: options.aggregate.revision,
      projection,
      generatedAt
    },
    eventStream: {
      matchId: options.aggregate.matchId,
      projectionScope: options.recipient.scope,
      fromSequence: kind === 'snapshot' || requiresResync ? 0 : lastSeenSequence,
      toSequence: options.aggregate.revision,
      events: eventFrames
    },
    generatedAt
  };
}
