import type { TransportSubscription } from '../../../shared-types/src/index.ts';

import type {
  OnlineRealtimeFanout,
  ProjectionFanoutListener,
  ProjectionRepository
} from './contracts.ts';

export interface SupabaseProjectionPollingFanoutOptions {
  projections: ProjectionRepository;
  pollIntervalMs?: number;
}

interface PollingListenerRecord {
  request: Parameters<OnlineRealtimeFanout['subscribe']>[0];
  listener: ProjectionFanoutListener;
  latestSnapshotVersion: number;
  latestEventSequence: number;
  timerId: ReturnType<typeof setInterval>;
}

export class SupabaseProjectionPollingFanout implements OnlineRealtimeFanout {
  private readonly projections: ProjectionRepository;
  private readonly pollIntervalMs: number;
  private readonly listeners = new Map<string, PollingListenerRecord>();

  constructor(options: SupabaseProjectionPollingFanoutOptions) {
    this.projections = options.projections;
    this.pollIntervalMs = options.pollIntervalMs ?? 1500;
  }

  async publish(notices: Parameters<OnlineRealtimeFanout['publish']>[0]): Promise<void> {
    for (const notice of notices) {
      for (const record of this.listeners.values()) {
        if (
          record.request.channelName !== notice.channelName ||
          record.request.recipientId !== notice.recipientId
        ) {
          continue;
        }

        record.latestSnapshotVersion = notice.snapshotVersion;
        record.latestEventSequence = notice.lastEventSequence;
        await record.listener(notice);
      }
    }
  }

  async subscribe(
    request: Parameters<OnlineRealtimeFanout['subscribe']>[0],
    listener: ProjectionFanoutListener
  ): Promise<TransportSubscription> {
    const subscriptionId = `supabase-poll:${request.channelName}:${request.recipientId}:${this.listeners.size + 1}`;
    const record: PollingListenerRecord = {
      request,
      listener,
      latestSnapshotVersion: 0,
      latestEventSequence: 0,
      timerId: setInterval(() => {
        void this.pollRecord(subscriptionId);
      }, this.pollIntervalMs)
    };

    this.listeners.set(subscriptionId, record);
    void this.pollRecord(subscriptionId);

    return {
      subscriptionId,
      unsubscribe: async () => {
        const existing = this.listeners.get(subscriptionId);
        if (!existing) {
          return;
        }

        clearInterval(existing.timerId);
        this.listeners.delete(subscriptionId);
      }
    };
  }

  private async pollRecord(subscriptionId: string): Promise<void> {
    const record = this.listeners.get(subscriptionId);
    if (!record) {
      return;
    }

    const latest = await this.projections.getLatest({
      matchId: record.request.matchId,
      projectionScope: record.request.projectionScope,
      recipientId: record.request.recipientId
    });

    if (!latest) {
      return;
    }

    if (latest.snapshotVersion <= record.latestSnapshotVersion) {
      return;
    }

    record.latestSnapshotVersion = latest.snapshotVersion;
    record.latestEventSequence = latest.lastEventSequence;

    await record.listener({
      fanoutId: `projection:${latest.projectionRecordId}`,
      channelName: record.request.channelName,
      matchId: latest.matchId,
      recipientId: latest.recipientId,
      projectionScope: latest.projectionScope,
      viewerPlayerId: latest.viewerPlayerId,
      viewerTeamId: latest.viewerTeamId,
      snapshotVersion: latest.snapshotVersion,
      lastEventSequence: latest.lastEventSequence,
      generatedAt: latest.generatedAt
    });
  }
}
