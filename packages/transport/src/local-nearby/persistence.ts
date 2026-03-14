import type {
  DomainEventEnvelope,
  DurableLocalHostState,
  EventReadOptions,
  MatchRuntimeSnapshot,
  NearbyGuestSession,
  NearbyHeartbeatRecord,
  NearbyJoinOffer
} from '../../../shared-types/src/index.ts';

import type { LocalHostPersistenceAdapter } from './contracts.ts';

export class InMemoryDurableLocalHostPersistence implements LocalHostPersistenceAdapter {
  private eventsByMatchId = new Map<string, DomainEventEnvelope[]>();
  private snapshotsByMatchId = new Map<string, MatchRuntimeSnapshot[]>();
  private joinOffersByMatchId = new Map<string, NearbyJoinOffer>();
  private guestSessionsByMatchId = new Map<string, Map<string, NearbyGuestSession>>();
  private heartbeatsByMatchId = new Map<string, NearbyHeartbeatRecord[]>();

  async appendEvents(matchId: string, events: DomainEventEnvelope[]): Promise<void> {
    const current = this.eventsByMatchId.get(matchId) ?? [];
    this.eventsByMatchId.set(matchId, [...current, ...events]);
  }

  async readEvents(matchId: string, options: EventReadOptions = {}): Promise<DomainEventEnvelope[]> {
    const current = this.eventsByMatchId.get(matchId) ?? [];
    const afterSequence = options.afterSequence ?? 0;
    const filtered = current.filter((event) => event.sequence > afterSequence);

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

  async saveJoinOffer(offer: NearbyJoinOffer): Promise<void> {
    this.joinOffersByMatchId.set(offer.matchId, offer);
  }

  async loadJoinOffer(matchId: string): Promise<NearbyJoinOffer | undefined> {
    return this.joinOffersByMatchId.get(matchId);
  }

  async saveGuestSession(session: NearbyGuestSession): Promise<void> {
    const sessions = this.guestSessionsByMatchId.get(session.matchId) ?? new Map<string, NearbyGuestSession>();
    sessions.set(session.guestSessionId, session);
    this.guestSessionsByMatchId.set(session.matchId, sessions);
  }

  async loadGuestSession(matchId: string, guestSessionId: string): Promise<NearbyGuestSession | undefined> {
    return this.guestSessionsByMatchId.get(matchId)?.get(guestSessionId);
  }

  async listGuestSessions(matchId: string): Promise<NearbyGuestSession[]> {
    return [...(this.guestSessionsByMatchId.get(matchId)?.values() ?? [])];
  }

  async saveHeartbeat(record: NearbyHeartbeatRecord): Promise<void> {
    const current = this.heartbeatsByMatchId.get(record.matchId) ?? [];
    this.heartbeatsByMatchId.set(record.matchId, [...current, record]);
  }

  async loadLatestHeartbeat(matchId: string): Promise<NearbyHeartbeatRecord | undefined> {
    return this.heartbeatsByMatchId.get(matchId)?.at(-1);
  }

  async exportDurableState(): Promise<DurableLocalHostState> {
    return JSON.parse(JSON.stringify({
      snapshots: [...this.snapshotsByMatchId.values()].flat(),
      events: [...this.eventsByMatchId.values()].flat(),
      joinOffers: [...this.joinOffersByMatchId.values()],
      guestSessions: [...this.guestSessionsByMatchId.values()].flatMap((sessions) => [...sessions.values()]),
      heartbeats: [...this.heartbeatsByMatchId.values()].flat()
    }));
  }

  async importDurableState(state: DurableLocalHostState): Promise<void> {
    this.eventsByMatchId = new Map<string, DomainEventEnvelope[]>();
    this.snapshotsByMatchId = new Map<string, MatchRuntimeSnapshot[]>();
    this.joinOffersByMatchId = new Map<string, NearbyJoinOffer>();
    this.guestSessionsByMatchId = new Map<string, Map<string, NearbyGuestSession>>();
    this.heartbeatsByMatchId = new Map<string, NearbyHeartbeatRecord[]>();

    for (const event of state.events as DomainEventEnvelope[]) {
      const current = this.eventsByMatchId.get(event.matchId) ?? [];
      this.eventsByMatchId.set(event.matchId, [...current, event]);
    }

    for (const snapshot of state.snapshots) {
      const current = this.snapshotsByMatchId.get(snapshot.matchId) ?? [];
      this.snapshotsByMatchId.set(snapshot.matchId, [...current, snapshot]);
    }

    for (const offer of state.joinOffers) {
      this.joinOffersByMatchId.set(offer.matchId, offer);
    }

    for (const session of state.guestSessions) {
      const sessions = this.guestSessionsByMatchId.get(session.matchId) ?? new Map<string, NearbyGuestSession>();
      sessions.set(session.guestSessionId, session);
      this.guestSessionsByMatchId.set(session.matchId, sessions);
    }

    for (const heartbeat of state.heartbeats) {
      const current = this.heartbeatsByMatchId.get(heartbeat.matchId) ?? [];
      this.heartbeatsByMatchId.set(heartbeat.matchId, [...current, heartbeat]);
    }
  }
}
