import type {
  CommandSubmissionResult,
  DomainEventEnvelope,
  MatchAggregate,
  ProjectionRecipient,
  ProjectionScope,
  SyncEnvelope,
  TransportSubscription
} from '../../../shared-types/src/index.ts';
import type {
  ContentPackReferenceRecord,
  MatchRecord,
  OnlineAuthSession,
  OnlineCatchUpAccessRequest,
  OnlineCommandRequest,
  OnlineProjectionAccessRequest,
  OnlineReconnectAccessRequest,
  ProjectionFanoutNotice,
  ProjectionFanoutSubscriptionRequest,
  ProjectionRecord,
  SnapshotRecord
} from '../../../shared-types/src/index.ts';

export interface ProjectionLookupQuery {
  matchId: string;
  projectionScope: ProjectionScope;
  recipientId: string;
}

export interface MatchRepository {
  save(record: MatchRecord): Promise<void>;
  getByMatchId(matchId: string): Promise<MatchRecord | undefined>;
}

export interface EventRepository {
  append(matchId: string, events: DomainEventEnvelope[]): Promise<void>;
  listAfterSequence(matchId: string, sequence: number): Promise<DomainEventEnvelope[]>;
}

export interface SnapshotRepository {
  save(snapshot: SnapshotRecord): Promise<void>;
  getLatest(matchId: string): Promise<SnapshotRecord | undefined>;
}

export interface ProjectionRepository {
  saveMany(records: ProjectionRecord[]): Promise<void>;
  getLatest(query: ProjectionLookupQuery): Promise<ProjectionRecord | undefined>;
}

export interface ContentPackReferenceRepository {
  save(record: ContentPackReferenceRecord): Promise<void>;
  getByPackId(packId: string): Promise<ContentPackReferenceRecord | undefined>;
}

export interface OnlineRepositoryBundle {
  matches: MatchRepository;
  events: EventRepository;
  snapshots: SnapshotRepository;
  projections: ProjectionRepository;
  contentPackReferences: ContentPackReferenceRepository;
}

export interface SupabaseTableFilters {
  [field: string]: string | number | boolean | undefined;
}

export interface SupabaseTableClient {
  insert(table: string, rows: unknown[]): Promise<void>;
  upsert(table: string, row: Record<string, unknown>, keyFields: string[]): Promise<void>;
  selectMany<TRecord>(table: string, filters?: SupabaseTableFilters): Promise<TRecord[]>;
  selectOne<TRecord>(table: string, filters?: SupabaseTableFilters): Promise<TRecord | undefined>;
}

export type ProjectionFanoutListener = (notice: ProjectionFanoutNotice) => void | Promise<void>;

export interface OnlineRealtimeFanoutPublisher {
  publish(notices: ProjectionFanoutNotice[]): Promise<void>;
}

export interface OnlineRealtimeFanoutSubscriber {
  subscribe(
    request: ProjectionFanoutSubscriptionRequest,
    listener: ProjectionFanoutListener
  ): Promise<TransportSubscription>;
}

export interface OnlineRealtimeFanout extends OnlineRealtimeFanoutPublisher, OnlineRealtimeFanoutSubscriber {}

export interface OnlineTransportService {
  submitAuthenticatedCommand(
    session: OnlineAuthSession,
    request: OnlineCommandRequest
  ): Promise<CommandSubmissionResult>;
  requestAuthenticatedSnapshot(
    session: OnlineAuthSession,
    request: OnlineProjectionAccessRequest
  ): Promise<SyncEnvelope>;
  catchUpAuthenticated(
    session: OnlineAuthSession,
    request: OnlineCatchUpAccessRequest
  ): Promise<SyncEnvelope>;
  reconnectAuthenticated(
    session: OnlineAuthSession,
    request: OnlineReconnectAccessRequest
  ): Promise<SyncEnvelope>;
}

export interface OnlineSessionAccessBinding {
  actorId: string;
  playerId?: string;
  teamId?: string;
  role: MatchAggregate['roleAssignments'][string]['role'];
  allowedScopes: ProjectionScope[];
}

export interface OnlineSessionBinder {
  bindCommandEnvelope(
    session: OnlineAuthSession,
    request: OnlineCommandRequest,
    aggregate?: MatchAggregate
  ): Promise<{
    recipient: ProjectionRecipient;
    envelope: {
      commandId: string;
      matchId: string;
      actor: {
        actorId: string;
        playerId?: string;
        role: MatchAggregate['roleAssignments'][string]['role'];
      };
      occurredAt: string;
      idempotencyKey?: string;
      clientSequence?: number;
      command: OnlineCommandRequest['command'];
    };
  }>;
  bindRecipient(
    session: OnlineAuthSession,
    request: OnlineProjectionAccessRequest,
    aggregate?: MatchAggregate
  ): Promise<ProjectionRecipient>;
}
