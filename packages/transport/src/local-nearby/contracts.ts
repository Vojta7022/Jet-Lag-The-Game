import type {
  CatchUpRequest,
  CommandEnvelope,
  CommandSubmissionResult,
  LocalRuntimePersistence,
  NearbyGuestSession,
  NearbyHeartbeatRecord,
  NearbyHostAvailabilityStatus,
  NearbyJoinOffer,
  NearbyJoinRequest,
  NearbyGuestSyncRequest,
  ReconnectRequest,
  SnapshotRequest,
  SyncEnvelope,
  TransportSubscription
} from '../../../shared-types/src/index.ts';
import type { DurableLocalHostState } from '../../../shared-types/src/index.ts';

export interface LocalHostPersistenceAdapter extends LocalRuntimePersistence {
  saveJoinOffer(offer: NearbyJoinOffer): Promise<void>;
  loadJoinOffer(matchId: string): Promise<NearbyJoinOffer | undefined>;
  saveGuestSession(session: NearbyGuestSession): Promise<void>;
  loadGuestSession(matchId: string, guestSessionId: string): Promise<NearbyGuestSession | undefined>;
  listGuestSessions(matchId: string): Promise<NearbyGuestSession[]>;
  saveHeartbeat(record: NearbyHeartbeatRecord): Promise<void>;
  loadLatestHeartbeat(matchId: string): Promise<NearbyHeartbeatRecord | undefined>;
  exportDurableState(): Promise<DurableLocalHostState>;
  importDurableState(state: DurableLocalHostState): Promise<void>;
}

export interface HostAvailabilityMonitor {
  emitHeartbeat(matchId: string): Promise<NearbyHeartbeatRecord>;
  getHostAvailability(matchId: string): Promise<NearbyHostAvailabilityStatus>;
}

export interface NearbyJoinService {
  createJoinOffer(
    matchId: string,
    options: {
      hostSessionId: string;
      hostAlias: string;
      expiresInMs?: number;
    }
  ): Promise<NearbyJoinOffer>;
  loadJoinOffer(matchId: string): Promise<NearbyJoinOffer | undefined>;
  joinWithCode(request: NearbyJoinRequest): Promise<NearbyGuestSession>;
}

export interface NearbyTransportService {
  submitGuestCommand(
    guestSessionId: string,
    envelope: CommandEnvelope
  ): Promise<CommandSubmissionResult>;
  requestGuestSnapshot(
    guestSessionId: string,
    request: Omit<SnapshotRequest, 'recipient'>
  ): Promise<SyncEnvelope>;
  catchUpGuest(
    guestSessionId: string,
    request: Omit<CatchUpRequest, 'recipient'>
  ): Promise<SyncEnvelope>;
  reconnectGuest(
    guestSessionId: string,
    request: Omit<ReconnectRequest, 'recipient'>
  ): Promise<SyncEnvelope>;
}

export interface NearbyGuestTransportRuntime extends NearbyTransportService {
  subscribeGuest(
    guestSessionId: string,
    request: Omit<NearbyGuestSyncRequest, 'guestSessionId'> & { deliverInitialSync?: boolean },
    listener: (envelope: SyncEnvelope) => void | Promise<void>
  ): Promise<TransportSubscription>;
}
