import type {
  AuthorityRuntime,
  CatchUpRequest,
  CommandEnvelope,
  CommandSubmissionResult,
  ContentPack,
  MatchRuntimeSnapshot,
  ProjectionRecipient,
  ReconnectRequest,
  SingleDeviceRevealRequest,
  SingleDeviceRevealResult,
  SingleDeviceRevealToken,
  SnapshotRequest,
  SubscriptionRequest,
  SyncEnvelope,
  SyncListener,
  TransportSubscription
} from '../../../shared-types/src/index.ts';

import { InMemoryAuthorityRuntime } from '../in-memory-authority-runtime.ts';
import { InMemoryRuntimePersistence } from '../in-memory-persistence.ts';

import type { ProtectedRevealFlowController } from './contracts.ts';
import { SingleDeviceRevealFlowManager } from './reveal-flow.ts';

function viewerToRecipient(request: SingleDeviceRevealRequest): ProjectionRecipient {
  return {
    recipientId: `${request.viewer.scope}:${request.viewer.viewerPlayerId ?? request.viewer.viewerTeamId ?? 'referee'}`,
    actorId: 'single-device-referee',
    playerId: request.viewer.viewerPlayerId,
    teamId: request.viewer.viewerTeamId,
    role: request.viewer.viewerRole,
    scope: request.viewer.scope
  };
}

export interface SingleDeviceRefereeRuntimeOptions {
  contentPacks: ContentPack[];
  persistence?: InMemoryRuntimePersistence;
  now?: () => Date;
}

export class SingleDeviceRefereeRuntime implements AuthorityRuntime, ProtectedRevealFlowController {
  readonly mode = 'single_device_referee' as const;
  readonly gateway;

  private readonly innerRuntime: InMemoryAuthorityRuntime;
  private readonly revealFlow: SingleDeviceRevealFlowManager;

  constructor(options: SingleDeviceRefereeRuntimeOptions) {
    this.innerRuntime = new InMemoryAuthorityRuntime({
      mode: 'single_device_referee',
      contentPacks: options.contentPacks,
      persistence: options.persistence ?? new InMemoryRuntimePersistence()
    });
    this.revealFlow = new SingleDeviceRevealFlowManager(options.now);
    this.gateway = this.innerRuntime.gateway;
  }

  async submitCommand(envelope: CommandEnvelope): Promise<CommandSubmissionResult> {
    return this.innerRuntime.submitCommand(envelope);
  }

  async requestSnapshot(request: SnapshotRequest): Promise<SyncEnvelope> {
    return this.innerRuntime.requestSnapshot(request);
  }

  async catchUp(request: CatchUpRequest): Promise<SyncEnvelope> {
    return this.innerRuntime.catchUp(request);
  }

  async reconnect(request: ReconnectRequest): Promise<SyncEnvelope> {
    return this.innerRuntime.reconnect(request);
  }

  async subscribe(
    request: SubscriptionRequest,
    listener: SyncListener
  ): Promise<TransportSubscription> {
    return this.innerRuntime.subscribe(request, listener);
  }

  async recoverMatch(matchId: string): Promise<MatchRuntimeSnapshot | undefined> {
    return this.innerRuntime.recoverMatch(matchId);
  }

  async armReveal(request: SingleDeviceRevealRequest): Promise<SingleDeviceRevealToken> {
    return this.revealFlow.armReveal(request);
  }

  async openReveal(tokenId: string): Promise<SingleDeviceRevealResult> {
    const token = await this.revealFlow.getRevealToken(tokenId);
    const syncEnvelope = await this.innerRuntime.requestSnapshot({
      matchId: token.matchId,
      recipient: viewerToRecipient({
        matchId: token.matchId,
        viewer: token.viewer,
        reason: token.reason,
        requiresPassback: token.requiresPassback
      })
    });

    return this.revealFlow.openReveal(tokenId, syncEnvelope.projectionDelivery.projection);
  }

  async hideReveal(tokenId: string): Promise<SingleDeviceRevealToken> {
    return this.revealFlow.hideReveal(tokenId);
  }

  async listRevealTokens(matchId: string): Promise<SingleDeviceRevealToken[]> {
    return this.revealFlow.listRevealTokens(matchId);
  }
}
