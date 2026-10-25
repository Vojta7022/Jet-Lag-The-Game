import type { DomainCommand } from '../contracts/commands.ts';
import type { DomainEventEnvelope } from '../events/domain-events.ts';
import type { ContentPack, ProjectionScope, ScaleKey } from '../content.ts';
import type {
  MatchLifecycleState,
  MatchMode,
  MatchRole
} from '../domain/match.ts';
import type { MatchProjection } from '../projections/match-projection.ts';

import type { CommandSubmissionResult, MatchRuntimeSnapshot, SyncCursor, TransportSessionConfig } from './contracts.ts';

export interface OnlineMatchMembership {
  matchId: string;
  playerId?: string;
  teamId?: string;
  role?: MatchRole;
  allowedScopes?: ProjectionScope[];
}

export type MatchMembershipStatus = 'active' | 'removed';

export interface MatchMembershipRecord {
  matchId: string;
  authUserId: string;
  playerId: string;
  joinedAt: string;
  status: MatchMembershipStatus;
}

export interface OnlineCommandCommit {
  matchId: string;
  expectedRevision: number | null;
  commandId: string;
  idempotencyKey: string;
  match: MatchRecord;
  events: DomainEventEnvelope[];
  snapshot: SnapshotRecord;
  projections: ProjectionRecord[];
  result: CommandSubmissionResult;
}

export type OnlineCommandCommitResult =
  | {
      status: 'committed' | 'duplicate';
      committedRevision: number;
      result: CommandSubmissionResult;
    }
  | {
      status: 'revision_conflict';
      currentRevision: number | null;
    };

export interface OnlineAuthSession {
  authProvider: 'supabase';
  authSessionId: string;
  authUserId: string;
  defaultPlayerId?: string;
  accessToken?: string;
  accessTokenProvider?: () => Promise<string | undefined>;
  refreshToken?: string;
  expiresAt?: string;
  serviceRole?: boolean;
  memberships: OnlineMatchMembership[];
}

export interface OnlineCommandRequest {
  matchId: string;
  commandId: string;
  occurredAt: string;
  command: DomainCommand;
  idempotencyKey?: string;
  clientSequence?: number;
  joinCode?: string;
}

export interface OnlineProjectionAccessRequest {
  matchId: string;
  requestedScope?: ProjectionScope;
}

export interface OnlineCatchUpAccessRequest extends OnlineProjectionAccessRequest {
  cursor: SyncCursor;
}

export interface OnlineReconnectAccessRequest extends OnlineProjectionAccessRequest {
  cursor?: SyncCursor;
}

export interface MatchRecord {
  matchId: string;
  joinCode?: string;
  mode: MatchMode;
  lifecycleState: MatchLifecycleState;
  revision: number;
  contentPackId: ContentPack['packId'];
  contentPackVersion: ContentPack['packVersion'];
  createdByPlayerId: string;
  selectedRulesetId?: string;
  selectedScale?: ScaleKey;
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord {
  matchId: string;
  eventId: string;
  sequence: number;
  eventEnvelope: unknown;
  storedAt: string;
}

export interface SnapshotRecord extends MatchRuntimeSnapshot {}

export interface ProjectionTargetKey {
  recipientId: string;
  projectionScope: ProjectionScope;
  viewerPlayerId?: string;
  viewerTeamId?: string;
}

export interface ProjectionRecord extends ProjectionTargetKey {
  projectionRecordId: string;
  matchId: string;
  snapshotVersion: number;
  lastEventSequence: number;
  projection: MatchProjection;
  generatedAt: string;
}

export interface ContentPackReferenceRecord {
  packId: ContentPack['packId'];
  packVersion: ContentPack['packVersion'];
  title: ContentPack['title'];
  status: ContentPack['status'];
  sourceFingerprint: ContentPack['sourceFingerprint'];
  compatibilityModes: ContentPack['compatibility']['supportedModes'];
  contentPack?: ContentPack;
  registeredAt: string;
}

export interface ProjectionFanoutNotice extends ProjectionTargetKey {
  fanoutId: string;
  channelName: string;
  matchId: string;
  snapshotVersion: number;
  lastEventSequence: number;
  generatedAt: string;
}

export interface ProjectionFanoutSubscriptionRequest extends ProjectionTargetKey {
  matchId: string;
  channelName: string;
}

export interface SupabaseOnlineTransportSessionConfig extends TransportSessionConfig {
  authSession: OnlineAuthSession;
  joinCode?: string;
}
