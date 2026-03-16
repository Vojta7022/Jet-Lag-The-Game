import { createRandomUuid } from '../../../shared-types/src/index.ts';

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
import { reconcileRuntimeState } from '../reconcile-runtime-state.ts';
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

function makeJoinCode(): string {
  return createRandomUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
}

export class OnlineAuthorityRuntime implements AuthorityRuntime, OnlineTransportService {
  readonly mode = 'online_cloud' as const;
  readonly gateway: CommandGateway;

  private readonly repositories: OnlineRepositoryBundle;
  private readonly realtimeFanout: OnlineRealtimeFanout;
  private readonly sessionBinder: OnlineSessionBinder;
  private readonly contentPacksById: Map<string, ContentPack>;
  private readonly aggregateCache = new Map<string, MatchAggregate>();
  private readonly joinCodesByMatchId = new Map<string, string>();
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
    const subscriptionId = `subscription:${createRandomUuid()}`;
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
    const joinCode = await this.getOrCreateJoinCode(matchId);
    await this.repositories.matches.save({
      ...toMatchRecord(aggregate),
      joinCode
    });
    return recoveredSnapshot;
  }

  private async submitBoundCommand(envelope: CommandEnvelope): Promise<CommandSubmissionResult> {
    const reconciled = await this.reconcileAggregate(envelope.matchId, envelope.occurredAt);
    const aggregate = reconciled?.aggregate;
    if (!aggregate && envelope.command.type !== 'create_match') {
      await this.throwForMissingAggregateState(envelope.matchId);
    }
    const contentPack = await this.resolveContentPack(aggregate, envelope);
    const result = await this.gateway.submit({
      aggregate,
      contentPack,
      envelope
    });

    if (!result.accepted || !result.aggregate) {
      if (reconciled?.didChange) {
        await this.notifyLocalSubscribers(envelope.matchId);
      }

      return result;
    }

    await this.repositories.events.append(envelope.matchId, result.events);
    this.aggregateCache.set(envelope.matchId, result.aggregate);

    const snapshot = createMatchSnapshot(result.aggregate, this.mode);
    await this.persistDerivedStateBestEffort(result.aggregate, contentPack, snapshot);

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
    const aggregate = (await this.reconcileAggregate(matchId))?.aggregate;
    if (!aggregate) {
      await this.throwForMissingAggregateState(matchId);
    }

    const contentPack = await this.resolveContentPack(aggregate);
    const events = cursor
      ? await this.repositories.events.listAfterSequence(matchId, cursor.lastEventSequence ?? 0)
      : [];
    const storedProjection = await this.loadProjectionRecord(matchId, recipient, aggregate!, contentPack);

    return buildSyncEnvelope({
      aggregate: aggregate!,
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
    const stored = await this.tryLoadProjectionRecord(matchId, recipient);

    if (stored && stored.snapshotVersion >= aggregate.revision) {
      return stored;
    }

    const rebuilt = buildProjectionRecord(aggregate, contentPack, this.mode, recipient);
    await this.tryPersistProjectionRecords([rebuilt]);
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
      const storedMatch = await this.tryLoadMatchRecord(matchId);
      if (!storedMatch || storedMatch.revision <= cached.revision) {
        return cached;
      }
    }

    const recovered = await this.recoverMatch(matchId);
    if (recovered?.aggregate) {
      return recovered.aggregate;
    }

    if (cached) {
      return cached;
    }

    return undefined;
  }

  private async reconcileAggregate(
    matchId: string,
    occurredAt = new Date().toISOString()
  ): Promise<{ aggregate?: MatchAggregate; didChange: boolean }> {
    const aggregate = await this.loadAggregate(matchId);
    if (!aggregate) {
      return {
        aggregate: undefined,
        didChange: false
      };
    }

    const contentPack = await this.resolveContentPack(aggregate);
    const reconciliation = reconcileRuntimeState({
      aggregate,
      contentPack,
      occurredAt
    });

    if (reconciliation.events.length === 0) {
      return {
        aggregate,
        didChange: false
      };
    }

    await this.repositories.events.append(matchId, reconciliation.events);
    this.aggregateCache.set(matchId, reconciliation.aggregate);
    await this.persistDerivedStateBestEffort(
      reconciliation.aggregate,
      contentPack,
      createMatchSnapshot(reconciliation.aggregate, this.mode)
    );

    return {
      aggregate: reconciliation.aggregate,
      didChange: true
    };
  }

  private async resolveContentPack(
    aggregate?: MatchAggregate,
    envelope?: CommandEnvelope
  ): Promise<ContentPack> {
    const storedMatch = envelope?.matchId
      ? await this.tryLoadMatchRecord(envelope.matchId)
      : undefined;
    const packId =
      aggregate?.contentPackId ??
      (envelope?.command.type === 'create_match' ? envelope.command.payload.contentPackId : undefined) ??
      storedMatch?.contentPackId;

    if (!packId) {
      if (storedMatch) {
        throw new TransportRuntimeError(
          'MATCH_METADATA_INCOMPLETE',
          `Online match "${storedMatch.matchId}" is missing its content pack metadata. Ask the host to recreate the match or check the online matches table before joining again.`
        );
      }

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

  private async throwForMissingAggregateState(matchId: string): Promise<never> {
    const storedMatch = await this.tryLoadMatchRecord(matchId);

    if (!storedMatch) {
      throw new TransportRuntimeError('MATCH_NOT_FOUND', `No match with id "${matchId}" is available.`);
    }

    if (!storedMatch.contentPackId) {
      throw new TransportRuntimeError(
        'MATCH_METADATA_INCOMPLETE',
        `Online match "${matchId}" is missing its content pack metadata. Ask the host to recreate the match or check the online matches table before joining again.`
      );
    }

    throw new TransportRuntimeError(
      'MATCH_STATE_UNAVAILABLE',
      `Online match "${matchId}" exists and uses content pack "${storedMatch.contentPackId}", but its event or snapshot state is not available yet. Wait a moment and try joining again.`
    );
  }

  private async tryLoadMatchRecord(matchId: string) {
    try {
      const record = await this.repositories.matches.getByMatchId(matchId);
      if (record?.joinCode) {
        this.joinCodesByMatchId.set(matchId, record.joinCode);
      }
      return record;
    } catch {
      return undefined;
    }
  }

  private async getOrCreateJoinCode(matchId: string): Promise<string> {
    const cached = this.joinCodesByMatchId.get(matchId);
    if (cached) {
      return cached;
    }

    try {
      const stored = await this.repositories.matches.getByMatchId(matchId);
      if (stored?.joinCode) {
        this.joinCodesByMatchId.set(matchId, stored.joinCode);
        return stored.joinCode;
      }
    } catch {
      // If the match row is unavailable, continue with an in-memory join code.
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = makeJoinCode();

      try {
        const existing = await this.repositories.matches.getByJoinCode(candidate);
        if (existing?.matchId && existing.matchId !== matchId) {
          continue;
        }
      } catch {
        // If lookup fails, keep the generated code as a best-effort fallback.
      }

      this.joinCodesByMatchId.set(matchId, candidate);
      return candidate;
    }

    const fallback = makeJoinCode();
    this.joinCodesByMatchId.set(matchId, fallback);
    return fallback;
  }

  private async tryLoadProjectionRecord(
    matchId: string,
    recipient: SnapshotRequest['recipient']
  ): Promise<ProjectionRecord | undefined> {
    try {
      return await this.repositories.projections.getLatest({
        matchId,
        projectionScope: recipient.scope,
        recipientId: recipient.recipientId
      });
    } catch {
      return undefined;
    }
  }

  private async persistDerivedStateBestEffort(
    aggregate: MatchAggregate,
    contentPack: ContentPack,
    snapshot: MatchRuntimeSnapshot
  ): Promise<void> {
    const joinCode = await this.getOrCreateJoinCode(aggregate.matchId);

    await Promise.allSettled([
      this.repositories.matches.save({
        ...toMatchRecord(aggregate),
        joinCode
      }),
      this.repositories.snapshots.save(snapshot)
    ]);

    const projectionRecords = buildProjectionRecords(aggregate, contentPack, this.mode);
    await this.tryPersistProjectionRecords(projectionRecords);

    try {
      await this.realtimeFanout.publish(
        projectionRecords.map((record) =>
          toFanoutNotice(
            record,
            buildProjectionChannelName(record.matchId, record.recipientId)
          )
        )
      );
    } catch {
      // Fanout is a delivery cache; snapshot requests can still rebuild authoritative projections.
    }
  }

  private async tryPersistProjectionRecords(records: ProjectionRecord[]): Promise<void> {
    try {
      await this.repositories.projections.saveMany(records);
    } catch {
      // Projection rows are a cache of the aggregate. If this write fails, snapshot requests can rebuild them.
    }
  }
}
