import type { MatchRole } from '../domain/match.ts';

import type {
  MatchRuntimeSnapshot,
  ProjectionRecipient,
  SyncCursor,
  TransportSessionConfig
} from './contracts.ts';

export interface NearbyQrJoinPayload {
  matchId: string;
  joinCode: string;
  joinToken: string;
  hostAlias: string;
  issuedAt: string;
  expiresAt: string;
}

export interface NearbyJoinOffer {
  offerId: string;
  matchId: string;
  hostSessionId: string;
  hostAlias: string;
  joinCode: string;
  joinToken: string;
  qrPayload: NearbyQrJoinPayload;
  issuedAt: string;
  expiresAt: string;
}

export interface NearbyJoinRequest {
  matchId: string;
  joinCode: string;
  joinToken?: string;
  playerId: string;
  displayName: string;
  requestedScope?: ProjectionRecipient['scope'];
}

export interface NearbyGuestSession {
  guestSessionId: string;
  matchId: string;
  playerId: string;
  displayName: string;
  roleHint: MatchRole;
  projectionRecipient: ProjectionRecipient;
  joinedAt: string;
  lastSeenAt: string;
  sessionSecret: string;
  joinCode: string;
  connectionState: 'connected' | 'disconnected';
}

export interface NearbyHeartbeatRecord {
  heartbeatId: string;
  matchId: string;
  hostSessionId: string;
  sequence: number;
  emittedAt: string;
}

export interface NearbyHostAvailabilityStatus {
  matchId: string;
  state: 'available' | 'stale' | 'offline';
  lastHeartbeatAt?: string;
  heartbeatIntervalMs: number;
  timeoutMs: number;
}

export interface NearbyGuestSyncRequest {
  guestSessionId: string;
  matchId: string;
  cursor?: SyncCursor;
}

export interface NearbyGuestTransportSessionConfig extends TransportSessionConfig {
  guestSession: NearbyGuestSession;
}

export interface DurableLocalHostState {
  snapshots: MatchRuntimeSnapshot[];
  events: unknown[];
  joinOffers: NearbyJoinOffer[];
  guestSessions: NearbyGuestSession[];
  heartbeats: NearbyHeartbeatRecord[];
}
