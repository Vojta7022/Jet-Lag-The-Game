import type { CommandEnvelope, CommandValidationError } from '../contracts/commands.ts';
import type { ContentPack, ProjectionScope } from '../content.ts';
import type { MatchAggregate, MatchRole } from '../domain/match.ts';
import type { DomainEvent, DomainEventEnvelope } from '../events/domain-events.ts';
import type { MatchProjection } from '../projections/match-projection.ts';

export type AuthorityRuntimeMode = 'online_cloud' | 'lan_host_authority' | 'single_device_referee';

export type TransportConnectionState = 'disconnected' | 'connecting' | 'connected';

export type SyncEnvelopeKind = 'snapshot' | 'delta';

export type EventDeliveryDetail = 'full' | 'summary';

export interface ProjectionRecipient {
  recipientId: string;
  actorId: string;
  playerId?: string;
  teamId?: string;
  role?: MatchRole;
  scope: ProjectionScope;
}

export interface SyncCursor {
  snapshotVersion?: number;
  lastEventSequence?: number;
}

export interface MatchRuntimeSnapshot {
  snapshotId: string;
  matchId: string;
  contentPackId: ContentPack['packId'];
  runtimeMode: AuthorityRuntimeMode;
  snapshotVersion: number;
  lastEventSequence: number;
  aggregate: MatchAggregate;
  createdAt: string;
}

export interface ProjectionDelivery {
  deliveryId: string;
  matchId: string;
  runtimeMode: AuthorityRuntimeMode;
  projectionScope: ProjectionScope;
  recipient: ProjectionRecipient;
  snapshotVersion: number;
  lastEventSequence: number;
  projection: MatchProjection;
  generatedAt: string;
}

export interface TransportEventSummary {
  eventId: string;
  sequence: number;
  type: DomainEvent['type'];
  occurredAt: string;
  actorId: string;
  actorRole: MatchRole;
  visibilityScope: ProjectionScope;
}

export interface TransportEventFrame extends TransportEventSummary {
  detail: EventDeliveryDetail;
  event?: DomainEventEnvelope;
}

export interface EventStreamEnvelope {
  matchId: string;
  projectionScope: ProjectionScope;
  fromSequence: number;
  toSequence: number;
  events: TransportEventFrame[];
}

export interface SyncEnvelope {
  syncId: string;
  kind: SyncEnvelopeKind;
  matchId: string;
  runtimeMode: AuthorityRuntimeMode;
  projectionScope: ProjectionScope;
  snapshotVersion: number;
  lastEventSequence: number;
  baseSnapshotVersion?: number;
  requiresResync: boolean;
  projectionDelivery: ProjectionDelivery;
  eventStream: EventStreamEnvelope;
  generatedAt: string;
}

export interface CommandRejection {
  code: string;
  message: string;
  issues: CommandValidationError[];
}

export interface CommandSubmissionResult {
  accepted: boolean;
  matchId: string;
  commandId: string;
  aggregate?: MatchAggregate;
  aggregateRevision?: number;
  events: DomainEventEnvelope[];
  snapshot?: MatchRuntimeSnapshot;
  rejection?: CommandRejection;
}

export interface CommandGatewayContext {
  aggregate?: MatchAggregate;
  contentPack: ContentPack;
  envelope: CommandEnvelope;
}

export interface CommandGateway {
  submit(context: CommandGatewayContext): Promise<CommandSubmissionResult>;
}

export interface EventReadOptions {
  afterSequence?: number;
  limit?: number;
}

export interface LocalRuntimePersistence {
  appendEvents(matchId: string, events: DomainEventEnvelope[]): Promise<void>;
  readEvents(matchId: string, options?: EventReadOptions): Promise<DomainEventEnvelope[]>;
  saveSnapshot(snapshot: MatchRuntimeSnapshot): Promise<void>;
  loadLatestSnapshot(matchId: string): Promise<MatchRuntimeSnapshot | undefined>;
}

export interface SnapshotRequest {
  matchId: string;
  recipient: ProjectionRecipient;
}

export interface CatchUpRequest extends SnapshotRequest {
  cursor: SyncCursor;
}

export interface ReconnectRequest extends SnapshotRequest {
  cursor?: SyncCursor;
}

export interface SubscriptionRequest extends SnapshotRequest {
  cursor?: SyncCursor;
  deliverInitialSync?: boolean;
}

export interface TransportSubscription {
  subscriptionId: string;
  unsubscribe(): Promise<void>;
}

export type SyncListener = (envelope: SyncEnvelope) => void | Promise<void>;

export interface AuthorityRuntime {
  readonly mode: AuthorityRuntimeMode;
  readonly gateway: CommandGateway;

  submitCommand(envelope: CommandEnvelope): Promise<CommandSubmissionResult>;
  requestSnapshot(request: SnapshotRequest): Promise<SyncEnvelope>;
  catchUp(request: CatchUpRequest): Promise<SyncEnvelope>;
  reconnect(request: ReconnectRequest): Promise<SyncEnvelope>;
  subscribe(request: SubscriptionRequest, listener: SyncListener): Promise<TransportSubscription>;
  recoverMatch(matchId: string): Promise<MatchRuntimeSnapshot | undefined>;
}

export interface TransportSessionConfig {
  sessionId: string;
  recipient: ProjectionRecipient;
}

export interface TransportAdapter {
  connect(sessionConfig: TransportSessionConfig): Promise<void>;
  disconnect(): Promise<void>;
  submit(commandEnvelope: CommandEnvelope): Promise<CommandSubmissionResult>;
  subscribe(
    request: Omit<SubscriptionRequest, 'recipient'>,
    listener: SyncListener
  ): Promise<TransportSubscription>;
  requestSnapshot(request: Omit<SnapshotRequest, 'recipient'>): Promise<SyncEnvelope>;
  catchUp(request: Omit<CatchUpRequest, 'recipient'>): Promise<SyncEnvelope>;
  reconnect(request: Omit<ReconnectRequest, 'recipient'>): Promise<SyncEnvelope>;
  getConnectionState(): TransportConnectionState;
}
