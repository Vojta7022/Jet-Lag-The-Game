import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  DomainEventEnvelope,
  EventReadOptions,
  LocalRuntimePersistence,
  MatchRuntimeSnapshot
} from '../../../../packages/shared-types/src/index.ts';

import type { SessionProfileDraft } from './types.ts';

const STORAGE_PREFIX = 'jet-lag-game:v1';
const ACTIVE_SESSION_KEY = `${STORAGE_PREFIX}:active-session`;

export interface SavedSingleDeviceSession {
  version: 1;
  runtimeKind: 'single_device_referee';
  matchId: string;
  profile: SessionProfileDraft;
}

function eventsKey(matchId: string) {
  return `${STORAGE_PREFIX}:match:${matchId}:events`;
}

function snapshotKey(matchId: string) {
  return `${STORAGE_PREFIX}:match:${matchId}:snapshot`;
}

function parseStoredJson<T>(value: string | null, key: string): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Saved game data for "${key}" is unreadable. Start a new game.`);
  }
}

export class AsyncStorageRuntimePersistence implements LocalRuntimePersistence {
  private readonly pendingWrites = new Map<string, Promise<void>>();

  async appendEvents(matchId: string, events: DomainEventEnvelope[]): Promise<void> {
    const key = eventsKey(matchId);
    await this.enqueueWrite(key, async () => {
      const current = parseStoredJson<DomainEventEnvelope[]>(await AsyncStorage.getItem(key), key) ?? [];
      const eventsById = new Map(current.map((event) => [event.eventId, event]));
      for (const event of events) {
        eventsById.set(event.eventId, event);
      }
      const next = [...eventsById.values()].sort((left, right) => left.sequence - right.sequence);
      await AsyncStorage.setItem(key, JSON.stringify(next));
    });
  }

  async readEvents(matchId: string, options: EventReadOptions = {}): Promise<DomainEventEnvelope[]> {
    const key = eventsKey(matchId);
    await this.waitForWrite(key);
    const events = parseStoredJson<DomainEventEnvelope[]>(await AsyncStorage.getItem(key), key) ?? [];
    const afterSequence = options.afterSequence ?? 0;
    const filtered = events.filter((event) => event.sequence > afterSequence);
    return options.limit === undefined ? filtered : filtered.slice(0, options.limit);
  }

  async saveSnapshot(snapshot: MatchRuntimeSnapshot): Promise<void> {
    const key = snapshotKey(snapshot.matchId);
    await this.enqueueWrite(key, async () => {
      const current = parseStoredJson<MatchRuntimeSnapshot>(await AsyncStorage.getItem(key), key);
      if (!current || snapshot.lastEventSequence >= current.lastEventSequence) {
        await AsyncStorage.setItem(key, JSON.stringify(snapshot));
      }
    });
  }

  async loadLatestSnapshot(matchId: string): Promise<MatchRuntimeSnapshot | undefined> {
    const key = snapshotKey(matchId);
    await this.waitForWrite(key);
    return parseStoredJson<MatchRuntimeSnapshot>(await AsyncStorage.getItem(key), key);
  }

  private async enqueueWrite(key: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.pendingWrites.get(key) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    this.pendingWrites.set(key, next.then(() => undefined, () => undefined));
    await next;
  }

  private async waitForWrite(key: string): Promise<void> {
    await this.pendingWrites.get(key);
  }
}

export async function saveActiveSingleDeviceSession(session: SavedSingleDeviceSession): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
}

export async function loadActiveSingleDeviceSession(): Promise<SavedSingleDeviceSession | undefined> {
  const value = parseStoredJson<SavedSingleDeviceSession>(
    await AsyncStorage.getItem(ACTIVE_SESSION_KEY),
    ACTIVE_SESSION_KEY
  );
  if (
    value?.version !== 1 ||
    value.runtimeKind !== 'single_device_referee' ||
    typeof value.matchId !== 'string' ||
    typeof value.profile?.playerId !== 'string' ||
    typeof value.profile?.displayName !== 'string'
  ) {
    return undefined;
  }

  return value;
}

export async function clearActiveSingleDeviceSession(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
}
