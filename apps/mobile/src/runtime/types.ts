import type {
  AuthorityRuntimeMode,
  MatchMode,
  MatchProjection,
  MatchRole,
  NearbyGuestSession,
  NearbyJoinOffer,
  OnlineAuthSession,
  ProjectionRecipient,
  ProjectionScope,
  SyncEnvelope,
  TransportAdapter,
  TransportConnectionState,
  TransportSubscription
} from '../../../../packages/shared-types/src/index.ts';

import type { MobileRuntimeKind } from '../config/env.ts';

export interface SessionProfileDraft {
  displayName: string;
  playerId: string;
  authUserId?: string;
}

export interface CreateMatchInput {
  runtimeKind: MobileRuntimeKind;
  matchId: string;
  initialScale: 'small' | 'medium' | 'large';
  matchMode?: MatchMode;
}

export interface JoinMatchInput {
  runtimeKind: MobileRuntimeKind;
  matchId?: string;
  joinCode?: string;
  joinToken?: string;
  requestedScope?: ProjectionScope;
}

export interface RuntimeConnection {
  runtimeKind: MobileRuntimeKind;
  runtimeMode: AuthorityRuntimeMode;
  matchId: string;
  joinCode?: string;
  matchMode: MatchMode;
  transport: TransportAdapter;
  transportFlavor: 'in_memory' | 'online' | 'nearby_guest' | 'single_device';
  recipient: ProjectionRecipient;
  authSession?: OnlineAuthSession;
  guestSession?: NearbyGuestSession;
  joinOffer?: NearbyJoinOffer;
}

export interface ConnectedMatchResult {
  connection: RuntimeConnection;
  initialSync: SyncEnvelope;
  resolvedSessionProfile?: SessionProfileDraft;
}

export interface ConnectionSnapshotSummary {
  runtimeKind: MobileRuntimeKind;
  runtimeMode: AuthorityRuntimeMode;
  matchId: string;
  joinCode?: string;
  matchMode: MatchMode;
  transportFlavor: RuntimeConnection['transportFlavor'];
  connectionState: TransportConnectionState;
  recipient: ProjectionRecipient;
  lifecycleState: MatchProjection['lifecycleState'];
  seekPhaseSubstate?: MatchProjection['seekPhaseSubstate'];
  selectedScale?: MatchProjection['selectedScale'];
  playerRole?: MatchRole;
  snapshotVersion: number;
  lastEventSequence: number;
  joinOffer?: NearbyJoinOffer;
  onlineStatus?: {
    projectUrl?: string;
    persistenceMode: 'mock_in_memory' | 'supabase_rest';
    attachmentStorageMode:
      | 'durable_supabase_storage'
      | 'storage_requires_auth_session'
      | 'metadata_only_fallback'
      | 'storage_not_configured';
    attachmentBucket?: string;
  };
}

export interface RuntimeBinding {
  connection: RuntimeConnection;
  subscription?: TransportSubscription;
}
