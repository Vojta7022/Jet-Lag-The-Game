import type {
  CommandSubmissionResult,
  OnlineAuthSession,
  OnlineCatchUpAccessRequest,
  OnlineCommandRequest,
  OnlineProjectionAccessRequest,
  OnlineReconnectAccessRequest,
  SyncEnvelope
} from '../../../shared-types/src/index.ts';
import type { OnlineTransportService } from './contracts.ts';
import { TransportRuntimeError } from '../errors.ts';

export interface EdgeFunctionOnlineServiceOptions {
  projectUrl: string;
  anonKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwForHttpError(status: number, payload: unknown): never {
  const record = isRecord(payload) ? payload : {};
  const code = typeof record.code === 'string' ? record.code : `HTTP_${status}`;
  const message = typeof record.error === 'string' ? record.error : `Online game request failed with HTTP ${status}.`;
  const currentRevision = typeof record.currentRevision === 'number' || record.currentRevision === null
    ? record.currentRevision as number | null
    : undefined;
  throw new TransportRuntimeError(code, message, { currentRevision });
}

export class EdgeFunctionOnlineService implements OnlineTransportService {
  private readonly endpoint: string;
  private readonly anonKey: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: EdgeFunctionOnlineServiceOptions) {
    this.endpoint = `${options.projectUrl.replace(/\/+$/, '')}/functions/v1/game-authority`;
    this.anonKey = options.anonKey;
    this.fetcher = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async submitAuthenticatedCommand(
    session: OnlineAuthSession,
    request: OnlineCommandRequest
  ): Promise<CommandSubmissionResult> {
    let payload: JsonRecord;
    if (request.command.type === 'create_match') {
      payload = {
        operation: 'create_match',
        matchId: request.matchId,
        commandId: request.commandId,
        occurredAt: request.occurredAt,
        idempotencyKey: request.idempotencyKey,
        payload: request.command.payload
      };
    } else if (request.command.type === 'join_match') {
      if (!request.joinCode) {
        throw new TransportRuntimeError('JOIN_CODE_REQUIRED', 'A join code is required to join an online match.');
      }
      payload = {
        operation: 'join_match',
        joinCode: request.joinCode,
        commandId: request.commandId,
        occurredAt: request.occurredAt,
        idempotencyKey: request.idempotencyKey,
        payload: request.command.payload
      };
    } else {
      payload = {
        operation: 'command',
        matchId: request.matchId,
        commandId: request.commandId,
        occurredAt: request.occurredAt,
        idempotencyKey: request.idempotencyKey,
        clientSequence: request.clientSequence,
        command: request.command
      };
    }

    const response = await this.invoke(session, payload, false);
    if (!isRecord(response.result) || typeof response.result.accepted !== 'boolean') {
      throw new TransportRuntimeError('EDGE_RESPONSE_INVALID', 'The online game service returned an invalid command result.');
    }
    const result = response.result as unknown as CommandSubmissionResult;
    return {
      ...result,
      matchId: typeof response.matchId === 'string' ? response.matchId : result.matchId,
      ...(typeof response.joinCode === 'string' ? { joinCode: response.joinCode } : {})
    };
  }

  async requestAuthenticatedSnapshot(
    session: OnlineAuthSession,
    request: OnlineProjectionAccessRequest
  ): Promise<SyncEnvelope> {
    const response = await this.invoke(session, {
      operation: 'snapshot', matchId: request.matchId, requestedScope: request.requestedScope
    }, true);
    return this.syncFrom(response);
  }

  async catchUpAuthenticated(
    session: OnlineAuthSession,
    request: OnlineCatchUpAccessRequest
  ): Promise<SyncEnvelope> {
    const response = await this.invoke(session, {
      operation: 'catch_up', matchId: request.matchId,
      requestedScope: request.requestedScope, cursor: request.cursor
    }, true);
    return this.syncFrom(response);
  }

  async reconnectAuthenticated(
    session: OnlineAuthSession,
    request: OnlineReconnectAccessRequest
  ): Promise<SyncEnvelope> {
    const response = await this.invoke(session, {
      operation: 'reconnect', matchId: request.matchId,
      requestedScope: request.requestedScope, cursor: request.cursor
    }, true);
    return this.syncFrom(response);
  }

  private syncFrom(response: JsonRecord): SyncEnvelope {
    if (!isRecord(response.sync) || typeof response.sync.matchId !== 'string') {
      throw new TransportRuntimeError('EDGE_RESPONSE_INVALID', 'The online game service returned an invalid sync envelope.');
    }
    return response.sync as unknown as SyncEnvelope;
  }

  private async invoke(session: OnlineAuthSession, body: JsonRecord, safeRead: boolean): Promise<JsonRecord> {
    let accessToken = session.accessToken;
    try {
      accessToken = session.accessTokenProvider ? await session.accessTokenProvider() : accessToken;
    } catch {
      throw new TransportRuntimeError('AUTH_SESSION_UNAVAILABLE', 'Could not refresh the online sign-in session. Sign in again to continue.');
    }
    if (!accessToken) {
      throw new TransportRuntimeError('AUTH_REQUIRED', 'A Supabase user access token is required for online play.');
    }

    const attempts = safeRead ? 2 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(this.endpoint, {
          method: 'POST',
          headers: {
            apikey: this.anonKey,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        const raw = await response.text();
        let payload: unknown;
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          throw new TransportRuntimeError('EDGE_RESPONSE_INVALID', 'The online game service returned malformed JSON.');
        }
        if (!response.ok) {
          if (safeRead && response.status >= 500 && attempt + 1 < attempts) continue;
          throwForHttpError(response.status, payload);
        }
        if (!isRecord(payload)) {
          throw new TransportRuntimeError('EDGE_RESPONSE_INVALID', 'The online game service returned an invalid response.');
        }
        return payload;
      } catch (error) {
        lastError = error;
        if (error instanceof TransportRuntimeError) throw error;
        if (attempt + 1 >= attempts) {
          throw new TransportRuntimeError(
            controller.signal.aborted ? 'EDGE_REQUEST_TIMEOUT' : 'EDGE_NETWORK_ERROR',
            controller.signal.aborted ? 'The online game service did not respond in time.' : 'Could not reach the online game service.'
          );
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw lastError;
  }
}
