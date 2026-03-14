import type {
  ProjectionFanoutNotice,
  ProjectionFanoutSubscriptionRequest
} from '../../../shared-types/src/index.ts';

import type {
  OnlineRealtimeFanout,
  ProjectionFanoutListener
} from './contracts.ts';

export function toFanoutNotice(
  record: {
    matchId: string;
    recipientId: string;
    projectionScope: ProjectionFanoutNotice['projectionScope'];
    snapshotVersion: number;
    lastEventSequence: number;
    generatedAt: string;
  },
  channelName: string
): ProjectionFanoutNotice {
  return {
    fanoutId: `fanout:${record.matchId}:${record.recipientId}:${record.snapshotVersion}`,
    channelName,
    matchId: record.matchId,
    recipientId: record.recipientId,
    projectionScope: record.projectionScope,
    snapshotVersion: record.snapshotVersion,
    lastEventSequence: record.lastEventSequence,
    generatedAt: record.generatedAt
  };
}

export class MockOnlineRealtimeFanout implements OnlineRealtimeFanout {
  private readonly listeners = new Map<string, Map<string, ProjectionFanoutListener>>();

  async publish(notices: ProjectionFanoutNotice[]): Promise<void> {
    for (const notice of notices) {
      const channelListeners = this.listeners.get(notice.channelName);
      if (!channelListeners) {
        continue;
      }

      for (const listener of channelListeners.values()) {
        await listener(notice);
      }
    }
  }

  async subscribe(
    request: ProjectionFanoutSubscriptionRequest,
    listener: ProjectionFanoutListener
  ) {
    const channelListeners = this.listeners.get(request.channelName) ?? new Map<string, ProjectionFanoutListener>();
    channelListeners.set(request.recipientId, listener);
    this.listeners.set(request.channelName, channelListeners);

    return {
      subscriptionId: `realtime:${request.channelName}:${request.recipientId}`,
      unsubscribe: async () => {
        const listeners = this.listeners.get(request.channelName);
        listeners?.delete(request.recipientId);

        if (listeners && listeners.size === 0) {
          this.listeners.delete(request.channelName);
        }
      }
    };
  }
}
