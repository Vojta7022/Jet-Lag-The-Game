import { randomUUID } from 'node:crypto';

import type {
  AuthorityRuntime,
  CatchUpRequest,
  CommandEnvelope,
  CommandSubmissionResult,
  ContentPack,
  MatchRuntimeSnapshot,
  NearbyGuestSession,
  NearbyGuestSyncRequest,
  NearbyHostAvailabilityStatus,
  NearbyJoinOffer,
  NearbyJoinRequest,
  ProjectionRecipient,
  ReconnectRequest,
  SnapshotRequest,
  SubscriptionRequest,
  SyncEnvelope,
  SyncListener,
  TransportSubscription
} from '../../../shared-types/src/index.ts';
import { getPlayerRole, getPlayerTeam } from '../../../domain/src/index.ts';

import { InMemoryAuthorityRuntime } from '../in-memory-authority-runtime.ts';
import { TransportRuntimeError } from '../errors.ts';

import { createHeartbeatRecord } from './heartbeat.ts';
import type {
  HostAvailabilityMonitor,
  LocalHostPersistenceAdapter,
  NearbyGuestTransportRuntime,
  NearbyJoinService
} from './contracts.ts';

function makeJoinCode(): string {
  return randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
}

function makeJoinToken(): string {
  return randomUUID();
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

export interface NearbyHostAuthorityRuntimeOptions {
  contentPacks: ContentPack[];
  persistence: LocalHostPersistenceAdapter;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  now?: () => Date;
}

export class NearbyHostAuthorityRuntime
  implements AuthorityRuntime, NearbyJoinService, NearbyGuestTransportRuntime, HostAvailabilityMonitor
{
  readonly mode = 'lan_host_authority' as const;
  readonly gateway;

  private readonly persistence: LocalHostPersistenceAdapter;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly now: () => Date;
  private readonly innerRuntime: InMemoryAuthorityRuntime;
  private readonly guestSubscriptions = new Map<string, Map<string, { cursor?: NearbyGuestSyncRequest['cursor']; listener: SyncListener }>>();

  constructor(options: NearbyHostAuthorityRuntimeOptions) {
    this.persistence = options.persistence;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5_000;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 20_000;
    this.now = options.now ?? (() => new Date());
    this.innerRuntime = new InMemoryAuthorityRuntime({
      mode: 'lan_host_authority',
      contentPacks: options.contentPacks,
      persistence: options.persistence
    });
    this.gateway = this.innerRuntime.gateway;
  }

  async submitCommand(envelope: CommandEnvelope): Promise<CommandSubmissionResult> {
    const result = await this.innerRuntime.submitCommand(envelope);
    if (result.accepted) {
      await this.notifyGuestSubscriptions(envelope.matchId);
    }

    return result;
  }

  async requestSnapshot(request: SnapshotRequest): Promise<SyncEnvelope> {
    return this.innerRuntime.requestSnapshot(request);
  }

  async catchUp(request: CatchUpRequest): Promise<SyncEnvelope> {
    return this.innerRuntime.catchUp(request);
  }

  async reconnect(request: ReconnectRequest): Promise<SyncEnvelope> {
    return this.innerRuntime.reconnect(request);
  }

  async subscribe(
    request: SubscriptionRequest,
    listener: SyncListener
  ): Promise<TransportSubscription> {
    return this.innerRuntime.subscribe(request, listener);
  }

  async recoverMatch(matchId: string): Promise<MatchRuntimeSnapshot | undefined> {
    return this.innerRuntime.recoverMatch(matchId);
  }

  async createJoinOffer(
    matchId: string,
    options: {
      hostSessionId: string;
      hostAlias: string;
      expiresInMs?: number;
    }
  ): Promise<NearbyJoinOffer> {
    const aggregate = await this.innerRuntime.recoverMatch(matchId);
    if (!aggregate) {
      throw new TransportRuntimeError('MATCH_NOT_FOUND', `Cannot create a join offer for missing match "${matchId}".`);
    }

    const issuedAt = nowIso(this.now);
    const expiresAt = new Date(this.now().getTime() + (options.expiresInMs ?? 10 * 60_000)).toISOString();
    const joinCode = makeJoinCode();
    const joinToken = makeJoinToken();
    const offer: NearbyJoinOffer = {
      offerId: `offer:${randomUUID()}`,
      matchId,
      hostSessionId: options.hostSessionId,
      hostAlias: options.hostAlias,
      joinCode,
      joinToken,
      qrPayload: {
        matchId,
        joinCode,
        joinToken,
        hostAlias: options.hostAlias,
        issuedAt,
        expiresAt
      },
      issuedAt,
      expiresAt
    };

    await this.persistence.saveJoinOffer(offer);
    return offer;
  }

  async loadJoinOffer(matchId: string): Promise<NearbyJoinOffer | undefined> {
    return this.persistence.loadJoinOffer(matchId);
  }

  async joinWithCode(request: NearbyJoinRequest): Promise<NearbyGuestSession> {
    const offer = await this.persistence.loadJoinOffer(request.matchId);
    if (!offer || offer.joinCode !== request.joinCode) {
      throw new TransportRuntimeError('INVALID_JOIN_CODE', 'The provided nearby join code is invalid.');
    }

    if (request.joinToken && request.joinToken !== offer.joinToken) {
      throw new TransportRuntimeError('INVALID_JOIN_TOKEN', 'The provided nearby QR join token is invalid.');
    }

    if (new Date(offer.expiresAt).getTime() < this.now().getTime()) {
      throw new TransportRuntimeError('JOIN_CODE_EXPIRED', 'The nearby join offer has expired.');
    }

    const joinedAt = nowIso(this.now);
    const guestSession: NearbyGuestSession = {
      guestSessionId: `guest:${randomUUID()}`,
      matchId: request.matchId,
      playerId: request.playerId,
      displayName: request.displayName,
      roleHint: 'spectator',
      projectionRecipient: {
        recipientId: request.requestedScope ?? 'public_match',
        actorId: request.playerId,
        playerId: request.playerId,
        role: 'spectator',
        scope: request.requestedScope ?? 'public_match'
      },
      joinedAt,
      lastSeenAt: joinedAt,
      sessionSecret: offer.joinToken,
      joinCode: offer.joinCode,
      connectionState: 'connected'
    };

    await this.persistence.saveGuestSession(guestSession);
    return guestSession;
  }

  async submitGuestCommand(
    guestSessionId: string,
    envelope: CommandEnvelope
  ): Promise<CommandSubmissionResult> {
    const guestSession = await this.loadGuestSession(envelope.matchId, guestSessionId);
    this.assertGuestCommandAccess(guestSession, envelope);
    const resolvedRecipient = await this.resolveGuestRecipient(guestSession, envelope.matchId);

    const boundEnvelope: CommandEnvelope = {
      ...envelope,
      actor: {
        actorId: guestSession.playerId,
        playerId: guestSession.playerId,
        role: resolvedRecipient.recipient.role ?? guestSession.roleHint
      }
    };

    const result = await this.innerRuntime.submitCommand(boundEnvelope);
    await this.refreshGuestSession(guestSession, resolvedRecipient);
    if (result.accepted) {
      await this.notifyGuestSubscriptions(envelope.matchId);
    }

    return result;
  }

  async requestGuestSnapshot(
    guestSessionId: string,
    request: Omit<SnapshotRequest, 'recipient'>
  ): Promise<SyncEnvelope> {
    const guestSession = await this.loadGuestSession(request.matchId, guestSessionId);
    const resolvedRecipient = await this.resolveGuestRecipient(guestSession, request.matchId);
    await this.refreshGuestSession(guestSession, resolvedRecipient);
    return this.innerRuntime.requestSnapshot({
      ...request,
      recipient: resolvedRecipient.recipient
    });
  }

  async catchUpGuest(
    guestSessionId: string,
    request: Omit<CatchUpRequest, 'recipient'>
  ): Promise<SyncEnvelope> {
    const guestSession = await this.loadGuestSession(request.matchId, guestSessionId);
    const resolvedRecipient = await this.resolveGuestRecipient(guestSession, request.matchId);
    await this.refreshGuestSession(guestSession, resolvedRecipient);
    return this.innerRuntime.catchUp({
      ...request,
      recipient: resolvedRecipient.recipient
    });
  }

  async reconnectGuest(
    guestSessionId: string,
    request: Omit<ReconnectRequest, 'recipient'>
  ): Promise<SyncEnvelope> {
    const guestSession = await this.loadGuestSession(request.matchId, guestSessionId);
    const resolvedRecipient = await this.resolveGuestRecipient(guestSession, request.matchId);
    await this.refreshGuestSession(guestSession, resolvedRecipient);
    return this.innerRuntime.reconnect({
      ...request,
      recipient: resolvedRecipient.recipient
    });
  }

  async subscribeGuest(
    guestSessionId: string,
    request: NearbyGuestSyncRequest & { deliverInitialSync?: boolean },
    listener: SyncListener
  ): Promise<TransportSubscription> {
    const guestSession = await this.loadGuestSession(request.matchId, guestSessionId);
    const subscriptions = this.guestSubscriptions.get(request.matchId) ?? new Map<string, { cursor?: NearbyGuestSyncRequest['cursor']; listener: SyncListener }>();
    subscriptions.set(guestSessionId, {
      cursor: request.cursor,
      listener
    });
    this.guestSubscriptions.set(request.matchId, subscriptions);

    if (request.deliverInitialSync !== false) {
      const initial = await this.reconnectGuest(guestSessionId, {
        matchId: request.matchId,
        cursor: request.cursor
      });
      subscriptions.get(guestSessionId)!.cursor = {
        snapshotVersion: initial.snapshotVersion,
        lastEventSequence: initial.lastEventSequence
      };
      await listener(initial);
    }

    return {
      subscriptionId: `guest-subscription:${guestSessionId}`,
      unsubscribe: async () => {
        const guestSubscriptions = this.guestSubscriptions.get(request.matchId);
        guestSubscriptions?.delete(guestSessionId);
        if (guestSubscriptions && guestSubscriptions.size === 0) {
          this.guestSubscriptions.delete(request.matchId);
        }
      }
    };
  }

  async emitHeartbeat(matchId: string): Promise<NearbyHeartbeatRecord> {
    const latest = await this.persistence.loadLatestHeartbeat(matchId);
    const next = createHeartbeatRecord(
      matchId,
      'host-authority',
      (latest?.sequence ?? 0) + 1,
      nowIso(this.now)
    );
    await this.persistence.saveHeartbeat(next);
    return next;
  }

  async getHostAvailability(matchId: string): Promise<NearbyHostAvailabilityStatus> {
    const latest = await this.persistence.loadLatestHeartbeat(matchId);
    if (!latest) {
      return {
        matchId,
        state: 'offline',
        heartbeatIntervalMs: this.heartbeatIntervalMs,
        timeoutMs: this.heartbeatTimeoutMs
      };
    }

    const ageMs = this.now().getTime() - new Date(latest.emittedAt).getTime();
    return {
      matchId,
      state:
        ageMs > this.heartbeatTimeoutMs
          ? 'offline'
          : ageMs > this.heartbeatIntervalMs * 2
            ? 'stale'
            : 'available',
      lastHeartbeatAt: latest.emittedAt,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      timeoutMs: this.heartbeatTimeoutMs
    };
  }

  private async loadGuestSession(matchId: string, guestSessionId: string): Promise<NearbyGuestSession> {
    const guestSession = await this.persistence.loadGuestSession(matchId, guestSessionId);
    if (!guestSession) {
      throw new TransportRuntimeError(
        'GUEST_SESSION_NOT_FOUND',
        `No nearby guest session "${guestSessionId}" exists for match "${matchId}".`
      );
    }

    return guestSession;
  }

  private assertGuestCommandAccess(guestSession: NearbyGuestSession, envelope: CommandEnvelope): void {
    if (guestSession.matchId !== envelope.matchId) {
      throw new TransportRuntimeError('MATCH_MISMATCH', 'Guest session does not belong to the requested match.');
    }

    if (envelope.command.type === 'join_match' && envelope.command.payload.playerId !== guestSession.playerId) {
      throw new TransportRuntimeError(
        'AUTH_PLAYER_MISMATCH',
        'Nearby guest sessions may only join using their own reserved player identity.'
      );
    }

    if (
      envelope.command.type !== 'join_match' &&
      envelope.actor.playerId &&
      envelope.actor.playerId !== guestSession.playerId
    ) {
      throw new TransportRuntimeError(
        'AUTH_PLAYER_MISMATCH',
        'Nearby guest commands cannot impersonate a different player.'
      );
    }
  }

  private async resolveGuestRecipient(
    guestSession: NearbyGuestSession,
    matchId: string
  ): Promise<{
    recipient: ProjectionRecipient;
    roleHint: NearbyGuestSession['roleHint'];
  }> {
    const aggregate = await this.innerRuntime.recoverMatch(matchId);
    const aggregateState = aggregate?.aggregate;
    const playerId = guestSession.playerId;
    const role = aggregateState ? getPlayerRole(aggregateState, playerId) ?? guestSession.roleHint : guestSession.roleHint;
    const teamId = aggregateState ? getPlayerTeam(aggregateState, playerId)?.teamId : undefined;
    const scope = guestSession.projectionRecipient.scope;

    if (scope === 'team_private' && !teamId) {
      throw new TransportRuntimeError('TEAM_SCOPE_REQUIRES_TEAM', 'Team-private nearby projections require a team assignment.');
    }

    return {
      roleHint: role,
      recipient: {
        recipientId:
          scope === 'team_private'
            ? `team_private:${teamId}`
            : scope === 'player_private'
              ? `player_private:${playerId}`
              : scope,
        actorId: playerId,
        playerId,
        teamId,
        role,
        scope
      }
    };
  }

  private async refreshGuestSession(
    guestSession: NearbyGuestSession,
    resolvedRecipient: {
      recipient: ProjectionRecipient;
      roleHint: NearbyGuestSession['roleHint'];
    }
  ): Promise<void> {
    await this.persistence.saveGuestSession({
      ...guestSession,
      matchId: guestSession.matchId,
      projectionRecipient: resolvedRecipient.recipient,
      roleHint: resolvedRecipient.roleHint,
      lastSeenAt: nowIso(this.now),
      connectionState: 'connected'
    });
  }

  private async notifyGuestSubscriptions(matchId: string): Promise<void> {
    const subscriptions = this.guestSubscriptions.get(matchId);
    if (!subscriptions || subscriptions.size === 0) {
      return;
    }

    for (const [guestSessionId, record] of subscriptions.entries()) {
      const envelope = record.cursor
        ? await this.catchUpGuest(guestSessionId, {
            matchId,
            cursor: record.cursor
          })
        : await this.reconnectGuest(guestSessionId, {
            matchId
          });

      record.cursor = {
        snapshotVersion: envelope.snapshotVersion,
        lastEventSequence: envelope.lastEventSequence
      };
      await record.listener(envelope);
    }
  }
}
