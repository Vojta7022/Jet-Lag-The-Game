import type {
  CommandSubmissionResult,
  ContentPack,
  DomainCommand,
  MatchMembershipRecord,
  OnlineAuthSession,
  OnlineCommandRequest,
  ProjectionScope,
  SyncCursor
} from '../../../packages/shared-types/src/index.ts';
import type { OnlineTransportService } from '../../../packages/transport/src/online/contracts.ts';
import { createOnlineAuthorityHandler } from './runtime.ts';

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_CONTENT_PACK_REQUEST_BYTES = 6 * 1024 * 1024;
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info'
};
const CLIENT_IDENTITY_FIELDS = [
  'actor', 'actorId', 'playerId', 'role', 'teamId', 'authUserId',
  'authSessionId', 'defaultPlayerId', 'memberships', 'serviceRole', 'allowedScopes'
];

export interface GameAuthorityDependencies {
  auth: { getUser(accessToken: string): Promise<{ id: string } | undefined> };
  memberships: {
    find(matchId: string, authUserId: string): Promise<MatchMembershipRecord | undefined>;
    bind(record: MatchMembershipRecord): Promise<void>;
    removePlayer(matchId: string, playerId: string): Promise<void>;
  };
  matches: {
    findByJoinCode(joinCode: string): Promise<string | undefined>;
    findJoinCodeByMatchId?(matchId: string): Promise<string | undefined>;
  };
  service: OnlineTransportService;
  now?: () => string;
}

type JsonObject = Record<string, unknown>;

function json(status: number, payload: JsonObject): Response {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function errorResponse(error: unknown): Response {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'AUTHORITY_ERROR';
  const status = code === 'PLAYER_ALREADY_JOINED' || code === 'PLAYER_ID_ALREADY_BOUND' || code === 'IDEMPOTENCY_KEY_REUSE' || code === 'MATCH_REVISION_CONFLICT' || code === 'CONTENT_PACK_VERSION_IMMUTABLE' ? 409
    : code === 'MATCH_MEMBERSHIP_REQUIRED' || code === 'MEMBERSHIP_REMOVED' || code === 'PROJECTION_SCOPE_FORBIDDEN' ? 403
      : code === 'MATCH_NOT_FOUND' ? 404
        : code === 'QUESTION_FEATURE_DATA_UNAVAILABLE' ? 503
        : code === 'REQUEST_TOO_LARGE' || code === 'CONTENT_PACK_TOO_LARGE' ? 413
          : code.startsWith('REQUEST_') || code.startsWith('CONTENT_PACK_INVALID') || code === 'CONTENT_PACK_INCOMPATIBLE' || code === 'JSON_INVALID' || code === 'IDENTITY_CLAIMS_NOT_ALLOWED' || code === 'OPERATION_UNSUPPORTED' ? 400
            : 500;
  const knownRequestError = status < 500 || code === 'MATCH_REVISION_CONFLICT' || code === 'QUESTION_FEATURE_DATA_UNAVAILABLE';
  const message = knownRequestError && error instanceof Error ? error.message : 'The game service could not complete this request.';
  const currentRevision = typeof error === 'object' && error && 'currentRevision' in error
    ? (error as { currentRevision?: number | null }).currentRevision
    : undefined;
  return json(status, { error: message, code, ...(currentRevision !== undefined ? { currentRevision } : {}) });
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasIdentityClaims(request: JsonObject): boolean {
  return CLIENT_IDENTITY_FIELDS.some((field) => field in request);
}

function assertAllowedKeys(request: JsonObject, allowed: string[]): void {
  const unknown = Object.keys(request).find((key) => !allowed.includes(key));
  if (unknown) {
    throw Object.assign(new Error(`Unsupported request field "${unknown}".`), { code: 'REQUEST_INVALID' });
  }
}

function requiredString(value: unknown, field: string, maxLength = 160): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength) {
    throw Object.assign(new Error(`"${field}" must be a non-empty string no longer than ${maxLength} characters.`), { code: 'REQUEST_INVALID' });
  }
  return value;
}

function projectionScope(value: unknown): ProjectionScope | undefined {
  if (value === undefined) return undefined;
  const scopes: ProjectionScope[] = ['authority', 'host_admin', 'team_private', 'player_private', 'public_match', 'event_feed_public'];
  if (typeof value !== 'string' || !scopes.includes(value as ProjectionScope)) {
    throw Object.assign(new Error('"requestedScope" is not a supported projection scope.'), { code: 'REQUEST_INVALID' });
  }
  return value as ProjectionScope;
}

function syncCursor(value: unknown): SyncCursor {
  if (!isRecord(value)
    || typeof value.snapshotVersion !== 'number'
    || typeof value.lastEventSequence !== 'number'
    || value.snapshotVersion < 0
    || value.lastEventSequence < 0) {
    throw Object.assign(new Error('"cursor" must contain non-negative snapshotVersion and lastEventSequence values.'), { code: 'REQUEST_INVALID' });
  }
  return { snapshotVersion: value.snapshotVersion, lastEventSequence: value.lastEventSequence };
}

function asDomainCommand(value: unknown): DomainCommand {
  if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.payload)) {
    throw Object.assign(new Error('A command type and payload are required.'), { code: 'REQUEST_INVALID' });
  }
  if (value.type === 'create_match' || value.type === 'join_match') {
    throw Object.assign(new Error('Use the dedicated create_match or join_match operation.'), { code: 'REQUEST_INVALID' });
  }
  return value as unknown as DomainCommand;
}

function makeSession(authUserId: string, matchId: string, membership?: MatchMembershipRecord, defaultPlayerId?: string): OnlineAuthSession {
  return {
    authProvider: 'supabase',
    authSessionId: authUserId,
    authUserId,
    defaultPlayerId: membership?.status === 'active' ? membership.playerId : defaultPlayerId,
    memberships: membership?.status === 'active'
      ? [{ matchId, playerId: membership.playerId }]
      : []
  };
}

function membershipRecord(matchId: string, authUserId: string, playerId: string, joinedAt: string): MatchMembershipRecord {
  return { matchId, authUserId, playerId, joinedAt, status: 'active' };
}

async function readBody(request: Request): Promise<JsonObject> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_CONTENT_PACK_REQUEST_BYTES) {
    throw Object.assign(new Error('Request body exceeds the 6 MB limit.'), { code: 'REQUEST_TOO_LARGE' });
  }
  const raw = await request.text();
  const bodyBytes = new TextEncoder().encode(raw).byteLength;
  if (bodyBytes > MAX_CONTENT_PACK_REQUEST_BYTES) {
    throw Object.assign(new Error('Request body exceeds the 6 MB limit.'), { code: 'REQUEST_TOO_LARGE' });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { code: 'JSON_INVALID' });
  }
  if (!isRecord(body)) {
    throw Object.assign(new Error('Request body must be a JSON object.'), { code: 'REQUEST_INVALID' });
  }
  const operationLimit = body.operation === 'publish_content_pack' ? MAX_CONTENT_PACK_REQUEST_BYTES : MAX_REQUEST_BYTES;
  if (bodyBytes > operationLimit) {
    throw Object.assign(new Error(`Request body exceeds the ${operationLimit / 1024} KB limit for this operation.`), { code: 'REQUEST_TOO_LARGE' });
  }
  if (hasIdentityClaims(body)) {
    throw Object.assign(new Error('Identity and role are derived from the authenticated session.'), { code: 'IDENTITY_CLAIMS_NOT_ALLOWED' });
  }
  return body;
}

export function createGameAuthorityHandler(dependencies: GameAuthorityDependencies): (request: Request) => Promise<Response> {
  const now = dependencies.now ?? (() => new Date().toISOString());

  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
    if (request.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED', error: 'Use POST.' });

    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ') || authorization.length <= 7) {
      return json(401, { code: 'AUTH_REQUIRED', error: 'A Supabase user access token is required.' });
    }

    let user: { id: string } | undefined;
    try {
      user = await dependencies.auth.getUser(authorization.slice(7));
    } catch {
      return json(401, { code: 'AUTH_INVALID', error: 'The Supabase access token is invalid or expired.' });
    }
    if (!user?.id) return json(401, { code: 'AUTH_INVALID', error: 'The Supabase access token is invalid or expired.' });

    try {
      const body = await readBody(request);
      const operation = requiredString(body.operation, 'operation', 32);
      if (operation === 'publish_content_pack') {
        assertAllowedKeys(body, ['operation', 'contentPack']);
        if (!isRecord(body.contentPack)) {
          throw Object.assign(new Error('A contentPack object is required.'), { code: 'REQUEST_INVALID' });
        }
        await dependencies.service.publishContentPack(makeSession(user.id, '', undefined), body.contentPack as unknown as ContentPack);
        return json(200, { published: true });
      }
      if (operation === 'create_match') {
        assertAllowedKeys(body, ['operation', 'matchId', 'commandId', 'occurredAt', 'idempotencyKey', 'payload']);
        const payload = isRecord(body.payload) ? body.payload : undefined;
        if (!payload) throw Object.assign(new Error('Match setup payload is required.'), { code: 'REQUEST_INVALID' });
        const playerId = requiredString(payload.hostPlayerId, 'payload.hostPlayerId');
        const matchId = requiredString(body.matchId, 'matchId');
        const command: DomainCommand = { type: 'create_match', payload: payload as Extract<DomainCommand, { type: 'create_match' }>['payload'] };
        const onlineRequest: OnlineCommandRequest = {
          matchId,
          commandId: requiredString(body.commandId, 'commandId'),
          occurredAt: now(),
          idempotencyKey: body.idempotencyKey === undefined ? undefined : requiredString(body.idempotencyKey, 'idempotencyKey'),
          command
        };
        const session = makeSession(user.id, matchId, undefined, playerId);
        const result = await dependencies.service.submitAuthenticatedCommand(session, onlineRequest);
        if (result.accepted) await dependencies.memberships.bind(membershipRecord(matchId, user.id, playerId, now()));
        const joinCode = result.accepted ? await dependencies.matches.findJoinCodeByMatchId?.(matchId) : undefined;
        return json(200, { matchId, joinCode, result });
      }

      if (operation === 'join_match') {
        assertAllowedKeys(body, ['operation', 'joinCode', 'commandId', 'occurredAt', 'idempotencyKey', 'payload']);
        const joinCode = requiredString(body.joinCode, 'joinCode', 16).toUpperCase();
        const matchId = await dependencies.matches.findByJoinCode(joinCode);
        if (!matchId) throw Object.assign(new Error('No match uses that join code.'), { code: 'MATCH_NOT_FOUND' });
        const payload = isRecord(body.payload) ? body.payload : undefined;
        if (!payload) throw Object.assign(new Error('Player details are required.'), { code: 'REQUEST_INVALID' });
        const playerId = requiredString(payload.playerId, 'payload.playerId');
        const existing = await dependencies.memberships.find(matchId, user.id);
        if (existing?.status === 'removed') {
          throw Object.assign(new Error('This match membership has been removed.'), { code: 'MEMBERSHIP_REMOVED' });
        }
        if (existing?.status === 'active') {
          if (existing.playerId !== playerId) {
            throw Object.assign(new Error('This authenticated user is already bound to a different player in the match.'), { code: 'PLAYER_ALREADY_JOINED' });
          }
          return json(200, {
            matchId,
            result: { accepted: true, matchId, commandId: requiredString(body.commandId, 'commandId'), events: [] }
          });
        }
        const session = makeSession(user.id, matchId, existing, existing ? undefined : playerId);
        const onlineRequest: OnlineCommandRequest = {
          matchId,
          commandId: requiredString(body.commandId, 'commandId'),
          occurredAt: now(),
          idempotencyKey: body.idempotencyKey === undefined ? undefined : requiredString(body.idempotencyKey, 'idempotencyKey'),
          command: { type: 'join_match', payload: payload as Extract<DomainCommand, { type: 'join_match' }>['payload'] }
        };
        const result = await dependencies.service.submitAuthenticatedCommand(session, onlineRequest);
        if (result.accepted) await dependencies.memberships.bind(membershipRecord(matchId, user.id, playerId, now()));
        return json(200, { matchId, result });
      }

      const matchId = requiredString(body.matchId, 'matchId');
      const membership = await dependencies.memberships.find(matchId, user.id);
      if (!membership || membership.status !== 'active') {
        throw Object.assign(new Error('Join this match before requesting its data.'), { code: 'MATCH_MEMBERSHIP_REQUIRED' });
      }
      const session = makeSession(user.id, matchId, membership);

      if (operation === 'get_content_pack') {
        assertAllowedKeys(body, ['operation', 'matchId']);
        return json(200, { contentPack: await dependencies.service.getMatchContentPack(session, matchId) });
      }

      if (operation === 'command') {
        assertAllowedKeys(body, ['operation', 'matchId', 'commandId', 'occurredAt', 'idempotencyKey', 'clientSequence', 'command']);
        const onlineRequest: OnlineCommandRequest = {
          matchId,
          commandId: requiredString(body.commandId, 'commandId'),
          occurredAt: now(),
          idempotencyKey: body.idempotencyKey === undefined ? undefined : requiredString(body.idempotencyKey, 'idempotencyKey'),
          clientSequence: typeof body.clientSequence === 'number' ? body.clientSequence : undefined,
          command: asDomainCommand(body.command)
        };
        const result = await dependencies.service.submitAuthenticatedCommand(session, onlineRequest);
        if (result.accepted && onlineRequest.command.type === 'remove_match_player') {
          await dependencies.memberships.removePlayer(matchId, onlineRequest.command.payload.playerId);
        } else if (result.accepted && onlineRequest.command.type === 'leave_match') {
          await dependencies.memberships.removePlayer(matchId, membership.playerId);
        }
        return json(200, { result });
      }

      if (operation === 'snapshot') {
        assertAllowedKeys(body, ['operation', 'matchId', 'requestedScope']);
        const requestedScope = projectionScope(body.requestedScope);
        return json(200, { sync: await dependencies.service.requestAuthenticatedSnapshot(session, { matchId, requestedScope }) });
      }
      if (operation === 'catch_up') {
        assertAllowedKeys(body, ['operation', 'matchId', 'requestedScope', 'cursor']);
        return json(200, { sync: await dependencies.service.catchUpAuthenticated(session, { matchId, requestedScope: projectionScope(body.requestedScope), cursor: syncCursor(body.cursor) }) });
      }
      if (operation === 'reconnect') {
        assertAllowedKeys(body, ['operation', 'matchId', 'requestedScope', 'cursor']);
        return json(200, { sync: await dependencies.service.reconnectAuthenticated(session, { matchId, requestedScope: projectionScope(body.requestedScope), cursor: body.cursor === undefined ? undefined : syncCursor(body.cursor) }) });
      }
      throw Object.assign(new Error(`Unsupported operation "${operation}".`), { code: 'OPERATION_UNSUPPORTED' });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

if (import.meta.main) {
  Deno.serve(createOnlineAuthorityHandler());
}
