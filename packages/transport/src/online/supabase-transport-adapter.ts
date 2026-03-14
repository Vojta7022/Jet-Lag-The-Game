import type {
  CatchUpRequest,
  CommandEnvelope,
  CommandSubmissionResult,
  OnlineCommandRequest,
  OnlineProjectionAccessRequest,
  ProjectionFanoutNotice,
  SupabaseOnlineTransportSessionConfig,
  SyncListener,
  SyncEnvelope,
  TransportAdapter,
  TransportConnectionState,
  TransportSubscription
} from '../../../shared-types/src/index.ts';

import { TransportRuntimeError } from '../errors.ts';

import type {
  OnlineRealtimeFanoutSubscriber,
  OnlineTransportService
} from './contracts.ts';
import { buildProjectionChannelName } from './projection-targets.ts';

function toOnlineCommandRequest(envelope: CommandEnvelope): OnlineCommandRequest {
  return {
    matchId: envelope.matchId,
    commandId: envelope.commandId,
    occurredAt: envelope.occurredAt,
    idempotencyKey: envelope.idempotencyKey,
    clientSequence: envelope.clientSequence,
    command: envelope.command
  };
}

function toProjectionRequest(
  matchId: string,
  requestedScope: SupabaseOnlineTransportSessionConfig['recipient']['scope']
): OnlineProjectionAccessRequest {
  return {
    matchId,
    requestedScope
  };
}

export class SupabaseOnlineTransportAdapter implements TransportAdapter {
  private readonly service: OnlineTransportService;
  private readonly realtimeSubscriber: OnlineRealtimeFanoutSubscriber;
  private connectionState: TransportConnectionState = 'disconnected';
  private sessionConfig?: SupabaseOnlineTransportSessionConfig;

  constructor(
    service: OnlineTransportService,
    realtimeSubscriber: OnlineRealtimeFanoutSubscriber
  ) {
    this.service = service;
    this.realtimeSubscriber = realtimeSubscriber;
  }

  async connect(sessionConfig: SupabaseOnlineTransportSessionConfig): Promise<void> {
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
    return this.service.submitAuthenticatedCommand(session.authSession, toOnlineCommandRequest(commandEnvelope));
  }

  async requestSnapshot(request: { matchId: string }): Promise<SyncEnvelope> {
    const session = this.requireSession();
    return this.service.requestAuthenticatedSnapshot(
      session.authSession,
      toProjectionRequest(request.matchId, session.recipient.scope)
    );
  }

  async catchUp(request: Omit<CatchUpRequest, 'recipient'>): Promise<SyncEnvelope> {
    const session = this.requireSession();
    return this.service.catchUpAuthenticated(session.authSession, {
      matchId: request.matchId,
      requestedScope: session.recipient.scope,
      cursor: request.cursor
    });
  }

  async reconnect(request: { matchId: string; cursor?: CatchUpRequest['cursor'] }): Promise<SyncEnvelope> {
    const session = this.requireSession();
    return this.service.reconnectAuthenticated(session.authSession, {
      matchId: request.matchId,
      requestedScope: session.recipient.scope,
      cursor: request.cursor
    });
  }

  async subscribe(
    request: { matchId: string; cursor?: CatchUpRequest['cursor']; deliverInitialSync?: boolean },
    listener: SyncListener
  ): Promise<TransportSubscription> {
    const session = this.requireSession();
    let cursor = request.cursor;

    if (request.deliverInitialSync !== false) {
      const initialSync = await this.reconnect({
        matchId: request.matchId,
        cursor
      });
      cursor = {
        snapshotVersion: initialSync.snapshotVersion,
        lastEventSequence: initialSync.lastEventSequence
      };
      await listener(initialSync);
    }

    return this.realtimeSubscriber.subscribe(
      {
        matchId: request.matchId,
        recipientId: session.recipient.recipientId,
        projectionScope: session.recipient.scope,
        viewerPlayerId: session.recipient.playerId,
        viewerTeamId: session.recipient.teamId,
        channelName: buildProjectionChannelName(request.matchId, session.recipient.recipientId)
      },
      async (notice: ProjectionFanoutNotice) => {
        if ((cursor?.lastEventSequence ?? 0) >= notice.lastEventSequence) {
          return;
        }

        const syncEnvelope = await this.catchUp({
          matchId: request.matchId,
          cursor: cursor ?? {
            snapshotVersion: 0,
            lastEventSequence: 0
          }
        });

        cursor = {
          snapshotVersion: syncEnvelope.snapshotVersion,
          lastEventSequence: syncEnvelope.lastEventSequence
        };

        await listener(syncEnvelope);
      }
    );
  }

  private requireSession(): SupabaseOnlineTransportSessionConfig {
    if (this.connectionState !== 'connected' || !this.sessionConfig) {
      throw new TransportRuntimeError(
        'TRANSPORT_NOT_CONNECTED',
        'Online transport operations require an authenticated connected session.'
      );
    }

    return this.sessionConfig;
  }
}
