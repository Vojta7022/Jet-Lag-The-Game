import type {
  CatchUpRequest,
  CommandEnvelope,
  CommandSubmissionResult,
  SingleDeviceRevealRequest,
  SingleDeviceRevealResult,
  SnapshotRequest,
  SubscriptionRequest,
  SyncListener,
  SyncEnvelope,
  TransportAdapter,
  TransportConnectionState,
  TransportSessionConfig,
  TransportSubscription
} from '../../../shared-types/src/index.ts';

import { TransportRuntimeError } from '../errors.ts';

import { SingleDeviceRefereeRuntime } from './runtime.ts';

export class SingleDeviceRefereeTransportAdapter implements TransportAdapter {
  private readonly runtime: SingleDeviceRefereeRuntime;
  private connectionState: TransportConnectionState = 'disconnected';
  private sessionConfig?: TransportSessionConfig;

  constructor(runtime: SingleDeviceRefereeRuntime) {
    this.runtime = runtime;
  }

  async connect(sessionConfig: TransportSessionConfig): Promise<void> {
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
    this.assertConnected();
    return this.runtime.submitCommand(commandEnvelope);
  }

  async requestSnapshot(request: Omit<SnapshotRequest, 'recipient'>): Promise<SyncEnvelope> {
    this.assertConnected();
    return this.runtime.requestSnapshot({
      ...request,
      recipient: this.sessionConfig!.recipient
    });
  }

  async catchUp(request: Omit<CatchUpRequest, 'recipient'>): Promise<SyncEnvelope> {
    this.assertConnected();
    return this.runtime.catchUp({
      ...request,
      recipient: this.sessionConfig!.recipient
    });
  }

  async reconnect(request: { matchId: string; cursor?: CatchUpRequest['cursor'] }): Promise<SyncEnvelope> {
    this.assertConnected();
    return this.runtime.reconnect({
      ...request,
      recipient: this.sessionConfig!.recipient
    });
  }

  async subscribe(
    request: Omit<SubscriptionRequest, 'recipient'>,
    listener: SyncListener
  ): Promise<TransportSubscription> {
    this.assertConnected();
    return this.runtime.subscribe({
      ...request,
      recipient: this.sessionConfig!.recipient
    }, listener);
  }

  async armReveal(request: SingleDeviceRevealRequest): Promise<string> {
    this.assertConnected();
    const token = await this.runtime.armReveal(request);
    return token.tokenId;
  }

  async openReveal(tokenId: string): Promise<SingleDeviceRevealResult> {
    this.assertConnected();
    return this.runtime.openReveal(tokenId);
  }

  async hideReveal(tokenId: string): Promise<void> {
    this.assertConnected();
    await this.runtime.hideReveal(tokenId);
  }

  private assertConnected(): void {
    if (this.connectionState !== 'connected' || !this.sessionConfig) {
      throw new TransportRuntimeError(
        'TRANSPORT_NOT_CONNECTED',
        'Single-device referee transport requires an active session.'
      );
    }
  }
}
