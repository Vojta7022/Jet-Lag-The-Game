import type {
  ProjectionFanoutNotice,
  ProjectionFanoutSubscriptionRequest
} from '../../../shared-types/src/index.ts';

import type {
  ProjectionFanoutListener,
  SupabaseTableClient,
  SupabaseTableFilters
} from './contracts.ts';

function matchesFilters(record: Record<string, unknown>, filters: SupabaseTableFilters = {}): boolean {
  return Object.entries(filters).every(([key, value]) => {
    if (value === undefined) {
      return true;
    }

    return record[key] === value;
  });
}

export class InMemorySupabaseTableClient implements SupabaseTableClient {
  private readonly tables = new Map<string, Record<string, unknown>[]>();

  async insert(table: string, rows: unknown[]): Promise<void> {
    const current = this.tables.get(table) ?? [];
    this.tables.set(table, [...current, ...rows.map((row) => ({ ...(row as Record<string, unknown>) }))]);
  }

  async upsert(table: string, row: Record<string, unknown>, keyFields: string[]): Promise<void> {
    const current = this.tables.get(table) ?? [];
    const next = [...current];
    const existingIndex = current.findIndex((candidate) =>
      keyFields.every((field) => candidate[field] === row[field])
    );

    if (existingIndex >= 0) {
      next[existingIndex] = { ...current[existingIndex], ...row };
    } else {
      next.push({ ...row });
    }

    this.tables.set(table, next);
  }

  async selectMany<TRecord>(table: string, filters: SupabaseTableFilters = {}): Promise<TRecord[]> {
    const current = this.tables.get(table) ?? [];
    return current.filter((record) => matchesFilters(record, filters)) as TRecord[];
  }

  async selectOne<TRecord>(table: string, filters: SupabaseTableFilters = {}): Promise<TRecord | undefined> {
    const current = this.tables.get(table) ?? [];
    return current.find((record) => matchesFilters(record, filters)) as TRecord | undefined;
  }
}

export class InMemoryRealtimeFanoutBus {
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
