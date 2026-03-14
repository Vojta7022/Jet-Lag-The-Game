import type {
  CatchUpRequest,
  CommandEnvelope,
  CommandSubmissionResult,
  NearbyGuestTransportSessionConfig,
  SyncListener,
  SyncEnvelope,
  TransportAdapter,
  TransportConnectionState,
  TransportSubscription
} from '../../../shared-types/src/index.ts';

import { TransportRuntimeError } from '../errors.ts';

import type { NearbyGuestTransportRuntime } from './contracts.ts';

export class NearbyGuestTransportAdapter implements TransportAdapter {
  private readonly runtime: NearbyGuestTransportRuntime;
  private connectionState: TransportConnectionState = 'disconnected';
  private sessionConfig?: NearbyGuestTransportSessionConfig;

  constructor(runtime: NearbyGuestTransportRuntime) {
    this.runtime = runtime;
  }

  async connect(sessionConfig: NearbyGuestTransportSessionConfig): Promise<void> {
    this.sessionConfig = sessionConfig;
    this.connectionState = 'connected';
  }

  async disconnect(): Promise<void> {
    this.sessionConfig = undefined;
    this.connectionState = 'disconnected';
  }

  getConnectionState(): TransportConnectionState {
    return this.connectionState;
  }

  async submit(commandEnvelope: CommandEnvelope): Promise<CommandSubmissionResult> {
    const session = this.requireSession();
    return this.runtime.submitGuestCommand(session.guestSession.guestSessionId, commandEnvelope);
  }

  async requestSnapshot(request: { matchId: string }): Promise<SyncEnvelope> {
    const session = this.requireSession();
    return this.runtime.requestGuestSnapshot(session.guestSession.guestSessionId, request);
  }

  async catchUp(request: Omit<CatchUpRequest, 'recipient'>): Promise<SyncEnvelope> {
    const session = this.requireSession();
    return this.runtime.catchUpGuest(session.guestSession.guestSessionId, request);
  }

  async reconnect(request: { matchId: string; cursor?: CatchUpRequest['cursor'] }): Promise<SyncEnvelope> {
    const session = this.requireSession();
    return this.runtime.reconnectGuest(session.guestSession.guestSessionId, request);
  }

  async subscribe(
    request: { matchId: string; cursor?: CatchUpRequest['cursor']; deliverInitialSync?: boolean },
    listener: SyncListener
  ): Promise<TransportSubscription> {
    const session = this.requireSession();
    return this.runtime.subscribeGuest(
      session.guestSession.guestSessionId,
      {
        matchId: request.matchId,
        cursor: request.cursor,
        deliverInitialSync: request.deliverInitialSync
      },
      listener
    );
  }

  private requireSession(): NearbyGuestTransportSessionConfig {
    if (this.connectionState !== 'connected' || !this.sessionConfig) {
      throw new TransportRuntimeError(
        'TRANSPORT_NOT_CONNECTED',
        'Nearby guest transport requires an active connected guest session.'
      );
    }

    return this.sessionConfig;
  }
}
