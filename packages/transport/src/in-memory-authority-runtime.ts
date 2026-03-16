import { createRandomUuid } from '../../shared-types/src/index.ts';

import type {
  AuthorityRuntime,
  AuthorityRuntimeMode,
  CatchUpRequest,
  CommandEnvelope,
  CommandGateway,
  CommandSubmissionResult,
  ContentPack,
  DomainEventEnvelope,
  LocalRuntimePersistence,
  MatchAggregate,
  MatchRuntimeSnapshot,
  ReconnectRequest,
  SnapshotRequest,
  SubscriptionRequest,
  SyncCursor,
  SyncListener,
  SyncEnvelope,
  TransportSubscription
} from '../../shared-types/src/index.ts';
import { reduceMatchAggregate } from '../../engine/src/index.ts';

import { TransportRuntimeError } from './errors.ts';
import { EngineCommandGateway } from './engine-command-gateway.ts';
import { reconcileRuntimeState } from './reconcile-runtime-state.ts';
import { buildSyncEnvelope, createMatchSnapshot } from './sync.ts';

interface RuntimeSubscriptionRecord {
  subscriptionId: string;
  request: SubscriptionRequest;
  listener: SyncListener;
  cursor?: SyncCursor;
}

export interface InMemoryAuthorityRuntimeOptions {
  mode: AuthorityRuntimeMode;
  contentPacks: ContentPack[];
  persistence: LocalRuntimePersistence;
  gateway?: CommandGateway;
}

export class InMemoryAuthorityRuntime implements AuthorityRuntime {
  readonly mode: AuthorityRuntimeMode;
  readonly gateway: CommandGateway;

  private readonly contentPacksById: Map<string, ContentPack>;
  private readonly persistence: LocalRuntimePersistence;
  private readonly aggregateCache = new Map<string, MatchAggregate>();
  private readonly subscriptionsByMatchId = new Map<string, Map<string, RuntimeSubscriptionRecord>>();

  constructor(options: InMemoryAuthorityRuntimeOptions) {
    this.mode = options.mode;
    this.gateway = options.gateway ?? new EngineCommandGateway();
    this.persistence = options.persistence;
    this.contentPacksById = new Map(options.contentPacks.map((contentPack) => [contentPack.packId, contentPack]));
  }

  async submitCommand(envelope: CommandEnvelope): Promise<CommandSubmissionResult> {
    const reconciled = await this.reconcileAggregate(envelope.matchId, envelope.occurredAt);
    const aggregate = reconciled?.aggregate;
    const contentPack = this.resolveContentPack(aggregate, envelope);
    const result = await this.gateway.submit({
      aggregate,
      contentPack,
      envelope
    });

    if (!result.accepted || !result.aggregate) {
      if (reconciled?.didChange) {
        await this.notifySubscribers(envelope.matchId);
      }

      return result;
    }

    await this.persistence.appendEvents(envelope.matchId, result.events);

    const snapshot = createMatchSnapshot(result.aggregate, this.mode);
    await this.persistence.saveSnapshot(snapshot);
    this.aggregateCache.set(envelope.matchId, result.aggregate);

    await this.notifySubscribers(envelope.matchId);

    return {
      ...result,
      snapshot
    };
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
      this.subscriptionsByMatchId.get(request.matchId) ?? new Map<string, RuntimeSubscriptionRecord>();

    const record: RuntimeSubscriptionRecord = {
      subscriptionId,
      request,
      listener,
      cursor: request.cursor
    };

    matchSubscriptions.set(subscriptionId, record);
    this.subscriptionsByMatchId.set(request.matchId, matchSubscriptions);

    if (request.deliverInitialSync !== false) {
      const syncEnvelope = await this.reconnect({
        matchId: request.matchId,
        recipient: request.recipient,
        cursor: request.cursor
      });

      record.cursor = this.cursorFromSync(syncEnvelope);
      await listener(syncEnvelope);
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
    const snapshot = await this.persistence.loadLatestSnapshot(matchId);
    const trailingEvents = await this.persistence.readEvents(matchId, {
      afterSequence: snapshot?.lastEventSequence ?? 0
    });

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
    await this.persistence.saveSnapshot(recoveredSnapshot);
    return recoveredSnapshot;
  }

  private async buildEnvelopeForRequest(
    matchId: string,
    recipient: SnapshotRequest['recipient'],
    cursor?: SyncCursor,
    forceKind?: 'snapshot' | 'delta'
  ): Promise<SyncEnvelope> {
    const aggregate = (await this.reconcileAggregate(matchId))?.aggregate;

    if (!aggregate) {
      throw new TransportRuntimeError('MATCH_NOT_FOUND', `No match with id "${matchId}" is available.`);
    }

    const contentPack = this.resolveContentPack(aggregate);
    const events = cursor
      ? await this.persistence.readEvents(matchId, {
          afterSequence: cursor.lastEventSequence ?? 0
        })
      : [];

    return buildSyncEnvelope({
      aggregate,
      contentPack,
      runtimeMode: this.mode,
      recipient,
      events,
      cursor,
      forceKind
    });
  }

  private async notifySubscribers(matchId: string): Promise<void> {
    const subscriptions = this.subscriptionsByMatchId.get(matchId);
    if (!subscriptions || subscriptions.size === 0) {
      return;
    }

    for (const record of subscriptions.values()) {
      const syncEnvelope = record.cursor
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

      record.cursor = this.cursorFromSync(syncEnvelope);
      await record.listener(syncEnvelope);
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

    const contentPack = this.resolveContentPack(aggregate);
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

    await this.persistence.appendEvents(matchId, reconciliation.events);

    const snapshot = createMatchSnapshot(reconciliation.aggregate, this.mode);
    await this.persistence.saveSnapshot(snapshot);
    this.aggregateCache.set(matchId, reconciliation.aggregate);

    return {
      aggregate: reconciliation.aggregate,
      didChange: true
    };
  }

  private resolveContentPack(
    aggregate: MatchAggregate | undefined,
    envelope?: CommandEnvelope
  ): ContentPack {
    const packId =
      aggregate?.contentPackId ??
      (envelope?.command.type === 'create_match' ? envelope.command.payload.contentPackId : undefined);

    if (!packId) {
      throw new TransportRuntimeError(
        'CONTENT_PACK_REQUIRED',
        'Transport runtime could not determine which content pack should be used.'
      );
    }

    const contentPack = this.contentPacksById.get(packId);
    if (!contentPack) {
      throw new TransportRuntimeError(
        'CONTENT_PACK_NOT_FOUND',
        `Content pack "${packId}" is not registered with the authority runtime.`
      );
    }

    return contentPack;
  }
}
