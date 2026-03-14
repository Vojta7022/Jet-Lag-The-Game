import type {
  DomainEventEnvelope,
  EventReadOptions,
  LocalRuntimePersistence,
  MatchRuntimeSnapshot
} from '../../shared-types/src/index.ts';

export class InMemoryRuntimePersistence implements LocalRuntimePersistence {
  private readonly eventsByMatchId = new Map<string, DomainEventEnvelope[]>();
  private readonly snapshotsByMatchId = new Map<string, MatchRuntimeSnapshot[]>();

  async appendEvents(matchId: string, events: DomainEventEnvelope[]): Promise<void> {
    const current = this.eventsByMatchId.get(matchId) ?? [];
    this.eventsByMatchId.set(matchId, [...current, ...events]);
  }

  async readEvents(matchId: string, options: EventReadOptions = {}): Promise<DomainEventEnvelope[]> {
    const events = this.eventsByMatchId.get(matchId) ?? [];
    const afterSequence = options.afterSequence ?? 0;
    const filtered = events.filter((event) => event.sequence > afterSequence);

    if (options.limit === undefined) {
      return filtered;
    }

    return filtered.slice(0, options.limit);
  }

  async saveSnapshot(snapshot: MatchRuntimeSnapshot): Promise<void> {
    const current = this.snapshotsByMatchId.get(snapshot.matchId) ?? [];
    this.snapshotsByMatchId.set(snapshot.matchId, [...current, snapshot]);
  }

  async loadLatestSnapshot(matchId: string): Promise<MatchRuntimeSnapshot | undefined> {
    return this.snapshotsByMatchId.get(matchId)?.at(-1);
  }
}
