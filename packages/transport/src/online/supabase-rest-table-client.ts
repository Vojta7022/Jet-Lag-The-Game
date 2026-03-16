import { TransportRuntimeError } from '../errors.ts';

import type {
  SupabaseTableClient,
  SupabaseTableFilters
} from './contracts.ts';

function buildFilterParams(filters: SupabaseTableFilters = {}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('select', '*');

  for (const [field, value] of Object.entries(filters)) {
    if (value === undefined) {
      continue;
    }

    params.set(field, `eq.${String(value)}`);
  }

  return params;
}

export interface SupabaseRestTableClientOptions {
  baseUrl: string;
  anonKey: string;
  schema?: string;
}

export class SupabaseRestTableClient implements SupabaseTableClient {
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private readonly schema: string;

  constructor(options: SupabaseRestTableClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.anonKey = options.anonKey;
    this.schema = options.schema ?? 'public';
  }

  async insert(table: string, rows: unknown[]): Promise<void> {
    await this.request(table, {
      method: 'POST',
      body: JSON.stringify(rows),
      headers: {
        Prefer: 'return=minimal'
      }
    });
  }

  async upsert(table: string, row: Record<string, unknown>, keyFields: string[]): Promise<void> {
    const params = new URLSearchParams();
    if (keyFields.length > 0) {
      params.set('on_conflict', keyFields.join(','));
    }

    await this.request(table, {
      method: 'POST',
      query: params,
      body: JSON.stringify(row),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal'
      }
    });
  }

  async selectMany<TRecord>(table: string, filters: SupabaseTableFilters = {}): Promise<TRecord[]> {
    const response = await this.request(table, {
      method: 'GET',
      query: buildFilterParams(filters)
    });

    return (await response.json()) as TRecord[];
  }

  async selectOne<TRecord>(table: string, filters: SupabaseTableFilters = {}): Promise<TRecord | undefined> {
    const rows = await this.selectMany<TRecord>(table, filters);
    return rows[0];
  }

  private async request(
    table: string,
    options: {
      method: 'GET' | 'POST';
      query?: URLSearchParams;
      body?: string;
      headers?: Record<string, string>;
    }
  ): Promise<Response> {
    const query = options.query?.toString();
    const url = `${this.baseUrl}/rest/v1/${table}${query ? `?${query}` : ''}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: options.method,
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Profile': this.schema,
          'Content-Profile': this.schema,
          ...options.headers
        },
        body: options.body
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Network request failed.';
      throw new TransportRuntimeError(
        'SUPABASE_HTTP_NETWORK_ERROR',
        `Supabase table request could not reach "${table}". ${detail}`
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new TransportRuntimeError(
        'SUPABASE_HTTP_ERROR',
        `Supabase table request failed for "${table}" (${response.status}).${detail ? ` ${detail}` : ''}`
      );
    }

    return response;
  }
}
