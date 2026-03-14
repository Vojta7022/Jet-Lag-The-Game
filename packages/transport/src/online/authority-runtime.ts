import { randomUUID } from 'node:crypto';

import type {
  AuthorityRuntime,
  CatchUpRequest,
  CommandEnvelope,
  CommandGateway,
  CommandSubmissionResult,
  ContentPack,
  MatchAggregate,
  MatchRuntimeSnapshot,
  OnlineAuthSession,
  OnlineCatchUpAccessRequest,
  OnlineCommandRequest,
  OnlineProjectionAccessRequest,
  OnlineReconnectAccessRequest,
  ProjectionRecord,
  ReconnectRequest,
  SnapshotRequest,
  SubscriptionRequest,
  SyncCursor,
  SyncEnvelope,
  SyncListener,
  TransportSubscription
} from '../../../shared-types/src/index.ts';
import { reduceMatchAggregate } from '../../../engine/src/index.ts';

import { TransportRuntimeError } from '../errors.ts';
import { EngineCommandGateway } from '../engine-command-gateway.ts';
import { buildSyncEnvelope, createMatchSnapshot } from '../sync.ts';

import { DefaultOnlineSessionBinder } from './auth.ts';
import type {
  OnlineRealtimeFanout,
  OnlineRepositoryBundle,
  OnlineSessionBinder,
  OnlineTransportService
} from './contracts.ts';
import {
  buildProjectionChannelName,
  buildProjectionRecord,
  buildProjectionRecords
} from './projection-targets.ts';
import { toFanoutNotice } from './realtime.ts';

interface OnlineRuntimeSubscriptionRecord {
  subscriptionId: string;
  request: SubscriptionRequest;
  listener: SyncListener;
  cursor?: SyncCursor;
}

export interface OnlineAuthorityRuntimeOptions {
  contentPacks: ContentPack[];
  repositories: OnlineRepositoryBundle;
  realtimeFanout: OnlineRealtimeFanout;
  gateway?: CommandGateway;
  sessionBinder?: OnlineSessionBinder;
}

function toMatchRecord(aggregate: MatchAggregate) {
  return {
    matchId: aggregate.matchId,
    mode: aggregate.mode,
    lifecycleState: aggregate.lifecycleState,
    revision: aggregate.revision,
    contentPackId: aggregate.contentPackId,
    createdByPlayerId: aggregate.createdByPlayerId,
    selectedRulesetId: aggregate.selectedRulesetId,
    selectedScale: aggregate.selectedScale,
    createdAt: aggregate.createdAt,
    updatedAt: aggregate.updatedAt
  };
}

export class OnlineAuthorityRuntime implements AuthorityRuntime, OnlineTransportService {
  readonly mode = 'online_cloud' as const;
  readonly gateway: CommandGateway;

  private readonly repositories: OnlineRepositoryBundle;
  private readonly realtimeFanout: OnlineRealtimeFanout;
  private readonly sessionBinder: OnlineSessionBinder;
  private readonly contentPacksById: Map<string, ContentPack>;
  private readonly aggregateCache = new Map<string, MatchAggregate>();
  private readonly subscriptionsByMatchId = new Map<string, Map<string, OnlineRuntimeSubscriptionRecord>>();

  constructor(options: OnlineAuthorityRuntimeOptions) {
    this.gateway = options.gateway ?? new EngineCommandGateway();
    this.repositories = options.repositories;
    this.realtimeFanout = options.realtimeFanout;
    this.sessionBinder = options.sessionBinder ?? new DefaultOnlineSessionBinder();
    this.contentPacksById = new Map(options.contentPacks.map((contentPack) => [contentPack.packId, contentPack]));
  }

  async submitAuthenticatedCommand(
    session: OnlineAuthSession,
    request: OnlineCommandRequest
  ): Promise<CommandSubmissionResult> {
    const aggregate = await this.loadAggregate(request.matchId);
    const binding = await this.sessionBinder.bindCommandEnvelope(session, request, aggregate);
    return this.submitBoundCommand(binding.envelope);
  }

  async requestAuthenticatedSnapshot(
    session: OnlineAuthSession,
    request: OnlineProjectionAccessRequest
  ): Promise<SyncEnvelope> {
    const aggregate = await this.loadAggregate(request.matchId);
    const recipient = await this.sessionBinder.bindRecipient(session, request, aggregate);
    return this.requestSnapshot({
      matchId: request.matchId,
      recipient
    });
  }

  async catchUpAuthenticated(
    session: OnlineAuthSession,
    request: OnlineCatchUpAccessRequest
  ): Promise<SyncEnvelope> {
    const aggregate = await this.loadAggregate(request.matchId);
    const recipient = await this.sessionBinder.bindRecipient(session, request, aggregate);
    return this.catchUp({
      matchId: request.matchId,
      recipient,
      cursor: request.cursor
    });
  }

  async reconnectAuthenticated(
    session: OnlineAuthSession,
    request: OnlineReconnectAccessRequest
  ): Promise<SyncEnvelope> {
    const aggregate = await this.loadAggregate(request.matchId);
    const recipient = await this.sessionBinder.bindRecipient(session, request, aggregate);
    return this.reconnect({
      matchId: request.matchId,
      recipient,
      cursor: request.cursor
    });
  }

  async submitCommand(envelope: CommandEnvelope): Promise<CommandSubmissionResult> {
    return this.submitBoundCommand(envelope);
  }

  async requestSnapshot(request: SnapshotRequest): Promise<SyncEnvelope> {
    return this.buildEnvelopeForRequest(request.matchId, request.recipient, undefined, 'snapshot');
  }

  async catchUp(request: CatchUpRequest): Promise<SyncEnvelope> {
    return this.buildEnvelopeForRequest(request.matchId, request.recipient, request.cursor, 'delta');
  }

  async reconnect(request: ReconnectRequest): Promise<SyncEnvelope> {
    return this.buildEnvelopeForRequest(request.matchId, request.recipient, request.cursor);
  }

  async subscribe(
    request: SubscriptionRequest,
    listener: SyncListener
  ): Promise<TransportSubscription> {
    const subscriptionId = `subscription:${randomUUID()}`;
    const matchSubscriptions =
      this.subscriptionsByMatchId.get(request.matchId) ?? new Map<string, OnlineRuntimeSubscriptionRecord>();

    const record: OnlineRuntimeSubscriptionRecord = {
      subscriptionId,
      request,
      listener,
      cursor: request.cursor
    };

    matchSubscriptions.set(subscriptionId, record);
    this.subscriptionsByMatchId.set(request.matchId, matchSubscriptions);

    if (request.deliverInitialSync !== false) {
      const envelope = await this.reconnect({
        matchId: request.matchId,
        recipient: request.recipient,
        cursor: request.cursor
      });
      record.cursor = this.cursorFromSync(envelope);
      await listener(envelope);
    }

    return {
      subscriptionId,
      unsubscribe: async () => {
        const subscriptions = this.subscriptionsByMatchId.get(request.matchId);
        subscriptions?.delete(subscriptionId);
        if (subscriptions && subscriptions.size === 0) {
          this.subscriptionsByMatchId.delete(request.matchId);
        }
      }
    };
  }

  async recoverMatch(matchId: string): Promise<MatchRuntimeSnapshot | undefined> {
    const snapshot = await this.repositories.snapshots.getLatest(matchId);
    const trailingEvents = await this.repositories.events.listAfterSequence(
      matchId,
      snapshot?.lastEventSequence ?? 0
    );

    if (!snapshot && trailingEvents.length === 0) {
      return undefined;
    }

    let aggregate = snapshot?.aggregate;
    for (const event of trailingEvents) {
      aggregate = reduceMatchAggregate(aggregate, event);
    }

    if (!aggregate) {
      return undefined;
    }

    const recoveredSnapshot = createMatchSnapshot(aggregate, this.mode);
    this.aggregateCache.set(matchId, aggregate);
    await this.repositories.snapshots.save(recoveredSnapshot);
    await this.repositories.matches.save(toMatchRecord(aggregate));
    return recoveredSnapshot;
  }

  private async submitBoundCommand(envelope: CommandEnvelope): Promise<CommandSubmissionResult> {
    const aggregate = await this.loadAggregate(envelope.matchId);
    const contentPack = await this.resolveContentPack(aggregate, envelope);
    const result = await this.gateway.submit({
      aggregate,
      contentPack,
      envelope
    });

    if (!result.accepted || !result.aggregate) {
      return result;
    }

    await this.repositories.events.append(envelope.matchId, result.events);
    await this.repositories.matches.save(toMatchRecord(result.aggregate));

    const snapshot = createMatchSnapshot(result.aggregate, this.mode);
    await this.repositories.snapshots.save(snapshot);
    this.aggregateCache.set(envelope.matchId, result.aggregate);

    const projectionRecords = buildProjectionRecords(result.aggregate, contentPack, this.mode);
    await this.repositories.projections.saveMany(projectionRecords);
    await this.realtimeFanout.publish(
      projectionRecords.map((record) =>
        toFanoutNotice(
          record,
          buildProjectionChannelName(record.matchId, record.recipientId)
        )
      )
    );

    await this.notifyLocalSubscribers(envelope.matchId);

    return {
      ...result,
      snapshot
    };
  }

  private async buildEnvelopeForRequest(
    matchId: string,
    recipient: SnapshotRequest['recipient'],
    cursor?: SyncCursor,
    forceKind?: 'snapshot' | 'delta'
  ): Promise<SyncEnvelope> {
    const aggregate = await this.loadAggregate(matchId);
    if (!aggregate) {
      throw new TransportRuntimeError('MATCH_NOT_FOUND', `No match with id "${matchId}" is available.`);
    }

    const contentPack = await this.resolveContentPack(aggregate);
    const events = cursor
      ? await this.repositories.events.listAfterSequence(matchId, cursor.lastEventSequence ?? 0)
      : [];
    const storedProjection = await this.loadProjectionRecord(matchId, recipient, aggregate, contentPack);

    return buildSyncEnvelope({
      aggregate,
      contentPack,
      runtimeMode: this.mode,
      recipient,
      events,
      cursor,
      forceKind,
      projection: storedProjection.projection,
      generatedAt: storedProjection.generatedAt
    });
  }

  private async loadProjectionRecord(
    matchId: string,
    recipient: SnapshotRequest['recipient'],
    aggregate: MatchAggregate,
    contentPack: ContentPack
  ): Promise<ProjectionRecord> {
    const stored = await this.repositories.projections.getLatest({
      matchId,
      projectionScope: recipient.scope,
      recipientId: recipient.recipientId
    });

    if (stored && stored.snapshotVersion >= aggregate.revision) {
      return stored;
    }

    const rebuilt = buildProjectionRecord(aggregate, contentPack, this.mode, recipient);
    await this.repositories.projections.saveMany([rebuilt]);
    return rebuilt;
  }

  private async notifyLocalSubscribers(matchId: string): Promise<void> {
    const subscriptions = this.subscriptionsByMatchId.get(matchId);
    if (!subscriptions || subscriptions.size === 0) {
      return;
    }

    for (const record of subscriptions.values()) {
      const envelope = record.cursor
        ? await this.catchUp({
            matchId,
            recipient: record.request.recipient,
            cursor: record.cursor
          })
        : await this.reconnect({
            matchId,
            recipient: record.request.recipient,
            cursor: record.request.cursor
          });

      record.cursor = this.cursorFromSync(envelope);
      await record.listener(envelope);
    }
  }

  private cursorFromSync(envelope: SyncEnvelope): SyncCursor {
    return {
      snapshotVersion: envelope.snapshotVersion,
      lastEventSequence: envelope.lastEventSequence
    };
  }

  private async loadAggregate(matchId: string): Promise<MatchAggregate | undefined> {
    const cached = this.aggregateCache.get(matchId);
    if (cached) {
      return cached;
    }

    const recovered = await this.recoverMatch(matchId);
    return recovered?.aggregate;
  }

  private async resolveContentPack(
    aggregate?: MatchAggregate,
    envelope?: CommandEnvelope
  ): Promise<ContentPack> {
    const packId =
      aggregate?.contentPackId ??
      (envelope?.command.type === 'create_match' ? envelope.command.payload.contentPackId : undefined);

    if (!packId) {
      throw new TransportRuntimeError(
        'CONTENT_PACK_REQUIRED',
        'Online runtime could not determine which content pack should be used.'
      );
    }

    const contentPack = this.contentPacksById.get(packId);
    if (!contentPack) {
      throw new TransportRuntimeError(
        'CONTENT_PACK_NOT_FOUND',
        `Content pack "${packId}" is not registered with the online runtime.`
      );
    }

    const ref = await this.repositories.contentPackReferences.getByPackId(packId);
    if (!ref) {
      await this.repositories.contentPackReferences.save({
        packId: contentPack.packId,
        packVersion: contentPack.packVersion,
        title: contentPack.title,
        status: contentPack.status,
        sourceFingerprint: contentPack.sourceFingerprint,
        compatibilityModes: contentPack.compatibility.supportedModes,
        registeredAt: new Date().toISOString()
      });
    }

    return contentPack;
  }
}
