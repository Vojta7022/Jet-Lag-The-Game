import type {
  ContentPackReferenceRecord,
  DomainEventEnvelope,
  MatchRecord,
  ProjectionRecord,
  SnapshotRecord
} from '../../../shared-types/src/index.ts';

import type {
  ContentPackReferenceRepository,
  EventRepository,
  MatchRepository,
  ProjectionLookupQuery,
  ProjectionRepository,
  SnapshotRepository,
  SupabaseTableClient
} from './contracts.ts';

const MATCHES_TABLE = 'matches';
const EVENTS_TABLE = 'match_events';
const SNAPSHOTS_TABLE = 'match_snapshots';
const PROJECTIONS_TABLE = 'match_projections';
const CONTENT_PACK_REFS_TABLE = 'content_pack_references';

export class SupabaseMatchRepository implements MatchRepository {
  private readonly client: SupabaseTableClient;

  constructor(client: SupabaseTableClient) {
    this.client = client;
  }

  async save(record: MatchRecord): Promise<void> {
    await this.client.upsert(MATCHES_TABLE, record as unknown as Record<string, unknown>, ['matchId']);
  }

  async getByMatchId(matchId: string): Promise<MatchRecord | undefined> {
    return this.client.selectOne<MatchRecord>(MATCHES_TABLE, { matchId });
  }
}

export class SupabaseEventRepository implements EventRepository {
  private readonly client: SupabaseTableClient;

  constructor(client: SupabaseTableClient) {
    this.client = client;
  }

  async append(matchId: string, events: DomainEventEnvelope[]): Promise<void> {
    await this.client.insert(
      EVENTS_TABLE,
      events.map((eventEnvelope) => ({
        matchId,
        eventId: eventEnvelope.eventId,
        sequence: eventEnvelope.sequence,
        eventEnvelope,
        storedAt: eventEnvelope.occurredAt
      }))
    );
  }

  async listAfterSequence(matchId: string, sequence: number): Promise<DomainEventEnvelope[]> {
    const rows = await this.client.selectMany<{
      matchId: string;
      sequence: number;
      eventEnvelope: DomainEventEnvelope;
    }>(EVENTS_TABLE, { matchId });

    return rows
      .filter((row) => row.sequence > sequence)
      .sort((left, right) => left.sequence - right.sequence)
      .map((row) => row.eventEnvelope);
  }
}

export class SupabaseSnapshotRepository implements SnapshotRepository {
  private readonly client: SupabaseTableClient;

  constructor(client: SupabaseTableClient) {
    this.client = client;
  }

  async save(snapshot: SnapshotRecord): Promise<void> {
    await this.client.insert(SNAPSHOTS_TABLE, [snapshot]);
  }

  async getLatest(matchId: string): Promise<SnapshotRecord | undefined> {
    const rows = await this.client.selectMany<SnapshotRecord>(SNAPSHOTS_TABLE, { matchId });
    return rows.sort((left, right) => right.snapshotVersion - left.snapshotVersion)[0];
  }
}

export class SupabaseProjectionRepository implements ProjectionRepository {
  private readonly client: SupabaseTableClient;

  constructor(client: SupabaseTableClient) {
    this.client = client;
  }

  async saveMany(records: ProjectionRecord[]): Promise<void> {
    for (const record of records) {
      await this.client.upsert(PROJECTIONS_TABLE, record as unknown as Record<string, unknown>, [
        'matchId',
        'projectionScope',
        'recipientId'
      ]);
    }
  }

  async getLatest(query: ProjectionLookupQuery): Promise<ProjectionRecord | undefined> {
    return this.client.selectOne<ProjectionRecord>(PROJECTIONS_TABLE, {
      matchId: query.matchId,
      projectionScope: query.projectionScope,
      recipientId: query.recipientId
    });
  }
}

export class SupabaseContentPackReferenceRepository implements ContentPackReferenceRepository {
  private readonly client: SupabaseTableClient;

  constructor(client: SupabaseTableClient) {
    this.client = client;
  }

  async save(record: ContentPackReferenceRecord): Promise<void> {
    await this.client.upsert(
      CONTENT_PACK_REFS_TABLE,
      record as unknown as Record<string, unknown>,
      ['packId']
    );
  }

  async getByPackId(packId: string): Promise<ContentPackReferenceRecord | undefined> {
    return this.client.selectOne<ContentPackReferenceRecord>(CONTENT_PACK_REFS_TABLE, { packId });
  }
}
