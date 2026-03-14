import type {
  AuthorityRuntime,
  CatchUpRequest,
  CommandEnvelope,
  CommandSubmissionResult,
  ReconnectRequest,
  SnapshotRequest,
  SubscriptionRequest,
  SyncListener,
  SyncEnvelope,
  TransportAdapter,
  TransportConnectionState,
  TransportSessionConfig,
  TransportSubscription
} from '../../shared-types/src/index.ts';

import { TransportRuntimeError } from './errors.ts';

export class InMemoryTransportAdapter implements TransportAdapter {
  private connectionState: TransportConnectionState = 'disconnected';
  private sessionConfig?: TransportSessionConfig;
  private readonly runtime: AuthorityRuntime;

  constructor(runtime: AuthorityRuntime) {
    this.runtime = runtime;
  }

  async connect(sessionConfig: TransportSessionConfig): Promise<void> {
    this.sessionConfig = sessionConfig;
    this.connectionState = 'connected';
  }

  async disconnect(): Promise<void> {
    this.connectionState = 'disconnected';
    this.sessionConfig = undefined;
  }

  getConnectionState(): TransportConnectionState {
    return this.connectionState;
  }

  async submit(commandEnvelope: CommandEnvelope): Promise<CommandSubmissionResult> {
    this.assertConnected();
    return this.runtime.submitCommand(commandEnvelope);
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

  async reconnect(request: Omit<ReconnectRequest, 'recipient'>): Promise<SyncEnvelope> {
    this.assertConnected();
    return this.runtime.reconnect({
      ...request,
      recipient: this.sessionConfig!.recipient
    });
  }

  private assertConnected(): void {
    if (this.connectionState !== 'connected' || !this.sessionConfig) {
      throw new TransportRuntimeError(
        'TRANSPORT_NOT_CONNECTED',
        'Transport operations require an active connected session.'
      );
    }
  }
}
