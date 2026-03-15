import type {
  ActorRef,
  AuthorityRuntime,
  ContentPack,
  DomainCommand,
  MatchMode,
  MatchProjection,
  MatchRuntimeSnapshot,
  OnlineAuthSession,
  ProjectionRecipient,
  ProjectionScope,
  SyncEnvelope,
  TransportAdapter
} from '../../../../packages/shared-types/src/index.ts';
import {
  InMemoryAuthorityRuntime,
  InMemoryDurableLocalHostPersistence,
  InMemoryRuntimePersistence as InMemoryPersistence,
  InMemorySupabaseTableClient,
  InMemoryTransportAdapter,
  MockOnlineRealtimeFanout,
  NearbyGuestTransportAdapter,
  NearbyHostAuthorityRuntime as NearbyAuthorityRuntime,
  OnlineAuthorityRuntime,
  SingleDeviceRefereeRuntime,
  SingleDeviceRefereeTransportAdapter,
  SupabaseContentPackReferenceRepository,
  SupabaseEventRepository,
  SupabaseMatchRepository,
  SupabaseOnlineTransportAdapter,
  SupabaseProjectionRepository,
  SupabaseSnapshotRepository
} from '../../../../packages/transport/src/index.ts';

import type { MobileAppEnvironment, MobileRuntimeKind } from '../config/env.ts';

import { createUuid } from './create-uuid.ts';
import type {
  ConnectedMatchResult,
  CreateMatchInput,
  JoinMatchInput,
  RuntimeConnection,
  SessionProfileDraft
} from './types.ts';

interface OnlineFoundationServices {
  runtime: OnlineAuthorityRuntime;
  realtime: MockOnlineRealtimeFanout;
}

function makeTimestamp(sequence: number): string {
  const base = Date.UTC(2026, 0, 1, 0, 0, 0);
  return new Date(base + sequence * 1000).toISOString();
}

function buildHostRecipient(profile: SessionProfileDraft): ProjectionRecipient {
  return {
    recipientId: `host_admin:${profile.playerId}`,
    actorId: profile.playerId,
    playerId: profile.playerId,
    role: 'host',
    scope: 'host_admin'
  };
}

function buildParticipantRecipient(
  profile: SessionProfileDraft,
  scope: ProjectionScope
): ProjectionRecipient {
  return {
    recipientId:
      scope === 'player_private'
        ? `player_private:${profile.playerId}`
        : scope === 'team_private'
          ? `team_private:${profile.playerId}`
          : scope,
    actorId: profile.playerId,
    playerId: profile.playerId,
    role: 'spectator',
    scope
  };
}

function normalizeMatchMode(runtimeKind: MobileRuntimeKind, requested?: MatchMode): MatchMode {
  switch (runtimeKind) {
    case 'online_foundation':
      return 'online';
    case 'nearby_host_authority':
      return 'local_nearby';
    case 'single_device_referee':
      return 'single_device_referee';
    case 'in_memory':
    default:
      return requested ?? 'single_device_referee';
  }
}

function getPlayerRoleFromProjection(
  projection: MatchProjection,
  playerId: string | undefined,
  fallback?: ProjectionRecipient['role']
) {
  if (!playerId) {
    return fallback;
  }

  return projection.players.find((player) => player.playerId === playerId)?.role ?? fallback;
}

export class MobileRuntimeOrchestrator {
  private readonly contentPack: ContentPack;
  private readonly environment: MobileAppEnvironment;
  private readonly commandSequences = new Map<string, number>();
  private readonly inMemoryRuntimes = new Map<string, InMemoryAuthorityRuntime>();
  private readonly nearbyRuntimes = new Map<string, NearbyAuthorityRuntime>();
  private readonly singleDeviceRuntimes = new Map<string, SingleDeviceRefereeRuntime>();
  private readonly nearbyJoinCodeIndex = new Map<string, string>();
  private onlineFoundation?: OnlineFoundationServices;

  constructor(options: { contentPack: ContentPack; environment: MobileAppEnvironment }) {
    this.contentPack = options.contentPack;
    this.environment = options.environment;
  }

  async createMatch(
    profile: SessionProfileDraft,
    input: CreateMatchInput
  ): Promise<ConnectedMatchResult> {
    switch (input.runtimeKind) {
      case 'online_foundation':
        return this.createOnlineMatch(profile, input);
      case 'nearby_host_authority':
        return this.createNearbyMatch(profile, input);
      case 'single_device_referee':
        return this.createSingleDeviceMatch(profile, input);
      case 'in_memory':
      default:
        return this.createInMemoryMatch(profile, input);
    }
  }

  async joinMatch(
    profile: SessionProfileDraft,
    input: JoinMatchInput
  ): Promise<ConnectedMatchResult> {
    switch (input.runtimeKind) {
      case 'online_foundation':
        return this.joinOnlineMatch(profile, input);
      case 'nearby_host_authority':
        return this.joinNearbyMatch(profile, input);
      case 'single_device_referee':
        return this.joinSingleDeviceMatch(profile, input);
      case 'in_memory':
      default:
        return this.joinInMemoryMatch(profile, input);
    }
  }

  async refresh(connection: RuntimeConnection): Promise<SyncEnvelope> {
    return connection.transport.requestSnapshot({
      matchId: connection.matchId
    });
  }

  async recover(connection: RuntimeConnection): Promise<MatchRuntimeSnapshot | undefined> {
    return this.resolveAuthorityRuntime(connection)?.recoverMatch(connection.matchId);
  }

  async submitCommands(
    connection: RuntimeConnection,
    actor: {
      actorId: string;
      playerId?: string;
      role: ProjectionRecipient['role'];
    },
    commands: DomainCommand[]
  ): Promise<SyncEnvelope> {
    for (const command of commands) {
      const result = await connection.transport.submit(
        this.makeEnvelope(connection.matchId, {
          actorId: actor.actorId,
          playerId: actor.playerId,
          role: actor.role ?? 'spectator'
        }, command)
      );

      if (!result.accepted) {
        throw new Error(result.rejection?.message ?? `Command "${command.type}" was rejected.`);
      }
    }

    return this.refresh(connection);
  }

  async disconnect(connection: RuntimeConnection | undefined): Promise<void> {
    if (!connection) {
      return;
    }

    await connection.transport.disconnect();
  }

  summarize(connection: RuntimeConnection, syncEnvelope: SyncEnvelope) {
    const projection = syncEnvelope.projectionDelivery.projection;

    return {
      runtimeKind: connection.runtimeKind,
      runtimeMode: connection.runtimeMode,
      matchId: connection.matchId,
      matchMode: connection.matchMode,
      transportFlavor: connection.transportFlavor,
      connectionState: connection.transport.getConnectionState(),
      recipient: connection.recipient,
      lifecycleState: projection.lifecycleState,
      seekPhaseSubstate: projection.seekPhaseSubstate,
      playerRole: getPlayerRoleFromProjection(projection, connection.recipient.playerId, connection.recipient.role),
      snapshotVersion: syncEnvelope.snapshotVersion,
      lastEventSequence: syncEnvelope.lastEventSequence,
      joinOffer: connection.joinOffer
    };
  }

  private async createInMemoryMatch(
    profile: SessionProfileDraft,
    input: CreateMatchInput
  ): Promise<ConnectedMatchResult> {
    const matchMode = normalizeMatchMode(input.runtimeKind, input.matchMode);
    const runtime = this.getOrCreateInMemoryRuntime(input.matchId, matchMode);
    const transport = new InMemoryTransportAdapter(runtime);
    const recipient = buildHostRecipient(profile);

    await transport.connect({
      sessionId: `in-memory-host:${profile.playerId}`,
      recipient
    });

    await this.submitCreateMatch(transport, input.matchId, matchMode, profile, input.initialScale);
    const initialSync = await transport.requestSnapshot({ matchId: input.matchId });

    return {
      connection: {
        runtimeKind: input.runtimeKind,
        runtimeMode: runtime.mode,
        matchId: input.matchId,
        matchMode,
        transport,
        transportFlavor: 'in_memory',
        recipient
      },
      initialSync
    };
  }

  private async joinInMemoryMatch(
    profile: SessionProfileDraft,
    input: JoinMatchInput
  ): Promise<ConnectedMatchResult> {
    const matchId = input.matchId ?? `${this.environment.defaultMatchPrefix}-missing`;
    const runtime = this.inMemoryRuntimes.get(matchId);
    if (!runtime) {
      throw new Error(`No in-memory runtime is available for match "${matchId}".`);
    }

    const scope = input.requestedScope ?? 'player_private';
    const recipient = buildParticipantRecipient(profile, scope);
    const transport = new InMemoryTransportAdapter(runtime);
    await transport.connect({
      sessionId: `in-memory-player:${profile.playerId}`,
      recipient
    });

    await this.submitJoinMatch(transport, matchId, profile);
    const initialSync = await transport.requestSnapshot({ matchId });
    const projection = initialSync.projectionDelivery.projection;

    return {
      connection: {
        runtimeKind: input.runtimeKind,
        runtimeMode: runtime.mode,
        matchId,
        matchMode:
          runtime.mode === 'online_cloud'
            ? 'online'
            : runtime.mode === 'lan_host_authority'
              ? 'local_nearby'
              : 'single_device_referee',
        transport,
        transportFlavor: 'in_memory',
        recipient: {
          ...recipient,
          role: getPlayerRoleFromProjection(projection, profile.playerId, recipient.role)
        }
      },
      initialSync
    };
  }

  private async createOnlineMatch(
    profile: SessionProfileDraft,
    input: CreateMatchInput
  ): Promise<ConnectedMatchResult> {
    const { runtime, realtime } = this.getOrCreateOnlineFoundation();
    const authSession = this.buildOnlineSession(profile);
    const recipient = buildHostRecipient(profile);
    const transport = new SupabaseOnlineTransportAdapter(runtime, realtime);

    await transport.connect({
      sessionId: `online-host:${profile.playerId}`,
      recipient,
      authSession
    });

    await this.submitCreateMatch(transport, input.matchId, 'online', profile, input.initialScale);
    const initialSync = await transport.requestSnapshot({ matchId: input.matchId });

    return {
      connection: {
        runtimeKind: input.runtimeKind,
        runtimeMode: runtime.mode,
        matchId: input.matchId,
        matchMode: 'online',
        transport,
        transportFlavor: 'online',
        recipient,
        authSession
      },
      initialSync
    };
  }

  private async joinOnlineMatch(
    profile: SessionProfileDraft,
    input: JoinMatchInput
  ): Promise<ConnectedMatchResult> {
    const matchId = input.matchId ?? `${this.environment.defaultMatchPrefix}-missing`;
    const { runtime, realtime } = this.getOrCreateOnlineFoundation();
    const authSession = this.buildOnlineSession(profile);
    const recipient = buildParticipantRecipient(profile, input.requestedScope ?? 'player_private');
    const transport = new SupabaseOnlineTransportAdapter(runtime, realtime);

    await transport.connect({
      sessionId: `online-player:${profile.playerId}`,
      recipient,
      authSession
    });

    await this.submitJoinMatch(transport, matchId, profile);
    const initialSync = await transport.requestSnapshot({ matchId });
    const projection = initialSync.projectionDelivery.projection;

    return {
      connection: {
        runtimeKind: input.runtimeKind,
        runtimeMode: runtime.mode,
        matchId,
        matchMode: 'online',
        transport,
        transportFlavor: 'online',
        recipient: {
          ...recipient,
          role: getPlayerRoleFromProjection(projection, profile.playerId, recipient.role)
        },
        authSession
      },
      initialSync
    };
  }

  private async createNearbyMatch(
    profile: SessionProfileDraft,
    input: CreateMatchInput
  ): Promise<ConnectedMatchResult> {
    const runtime = this.getOrCreateNearbyRuntime(input.matchId);
    const recipient = buildHostRecipient(profile);
    const transport = new InMemoryTransportAdapter(runtime);

    await transport.connect({
      sessionId: `nearby-host:${profile.playerId}`,
      recipient
    });

    await this.submitCreateMatch(transport, input.matchId, 'local_nearby', profile, input.initialScale);
    const joinOffer = await runtime.createJoinOffer(input.matchId, {
      hostSessionId: `nearby-host:${profile.playerId}`,
      hostAlias: profile.displayName,
      expiresInMs: this.environment.nearbyJoinTtlSeconds * 1000
    });
    this.nearbyJoinCodeIndex.set(joinOffer.joinCode, input.matchId);

    const initialSync = await transport.requestSnapshot({ matchId: input.matchId });

    return {
      connection: {
        runtimeKind: input.runtimeKind,
        runtimeMode: runtime.mode,
        matchId: input.matchId,
        matchMode: 'local_nearby',
        transport,
        transportFlavor: 'in_memory',
        recipient,
        joinOffer
      },
      initialSync
    };
  }

  private async joinNearbyMatch(
    profile: SessionProfileDraft,
    input: JoinMatchInput
  ): Promise<ConnectedMatchResult> {
    const matchId = input.matchId ?? (input.joinCode ? this.nearbyJoinCodeIndex.get(input.joinCode) : undefined);
    if (!matchId) {
      throw new Error('Nearby guest joins require a match id or a recognized join code.');
    }

    const runtime = this.nearbyRuntimes.get(matchId);
    if (!runtime) {
      throw new Error(`No nearby host runtime is available for match "${matchId}".`);
    }

    const offer = await runtime.loadJoinOffer(matchId);
    if (!offer) {
      throw new Error(`No join offer is available for nearby match "${matchId}".`);
    }

    const guestSession = await runtime.joinWithCode({
      matchId,
      joinCode: input.joinCode ?? offer.joinCode,
      joinToken: input.joinToken ?? offer.joinToken,
      playerId: profile.playerId,
      displayName: profile.displayName,
      requestedScope: input.requestedScope ?? 'player_private'
    });
    const transport = new NearbyGuestTransportAdapter(runtime);
    await transport.connect({
      sessionId: `nearby-guest:${profile.playerId}`,
      recipient: guestSession.projectionRecipient,
      guestSession
    });

    await this.submitJoinMatch(transport, matchId, profile);
    const initialSync = await transport.requestSnapshot({ matchId });
    const projection = initialSync.projectionDelivery.projection;

    return {
      connection: {
        runtimeKind: input.runtimeKind,
        runtimeMode: runtime.mode,
        matchId,
        matchMode: 'local_nearby',
        transport,
        transportFlavor: 'nearby_guest',
        recipient: {
          ...guestSession.projectionRecipient,
          role: getPlayerRoleFromProjection(
            projection,
            profile.playerId,
            guestSession.projectionRecipient.role
          )
        },
        guestSession,
        joinOffer: offer
      },
      initialSync
    };
  }

  private async createSingleDeviceMatch(
    profile: SessionProfileDraft,
    input: CreateMatchInput
  ): Promise<ConnectedMatchResult> {
    const runtime = this.getOrCreateSingleDeviceRuntime(input.matchId);
    const recipient = buildHostRecipient(profile);
    const transport = new SingleDeviceRefereeTransportAdapter(runtime);

    await transport.connect({
      sessionId: `single-device-host:${profile.playerId}`,
      recipient
    });

    await this.submitCreateMatch(transport, input.matchId, 'single_device_referee', profile, input.initialScale);
    const initialSync = await transport.requestSnapshot({ matchId: input.matchId });

    return {
      connection: {
        runtimeKind: input.runtimeKind,
        runtimeMode: runtime.mode,
        matchId: input.matchId,
        matchMode: 'single_device_referee',
        transport,
        transportFlavor: 'single_device',
        recipient
      },
      initialSync
    };
  }

  private async joinSingleDeviceMatch(
    profile: SessionProfileDraft,
    input: JoinMatchInput
  ): Promise<ConnectedMatchResult> {
    const matchId = input.matchId ?? `${this.environment.defaultMatchPrefix}-missing`;
    const runtime = this.singleDeviceRuntimes.get(matchId);
    if (!runtime) {
      throw new Error(`No single-device runtime is available for match "${matchId}".`);
    }

    const recipient = buildParticipantRecipient(profile, input.requestedScope ?? 'player_private');
    const transport = new SingleDeviceRefereeTransportAdapter(runtime);
    await transport.connect({
      sessionId: `single-device-player:${profile.playerId}`,
      recipient
    });

    await this.submitJoinMatch(transport, matchId, profile);
    const initialSync = await transport.requestSnapshot({ matchId });
    const projection = initialSync.projectionDelivery.projection;

    return {
      connection: {
        runtimeKind: input.runtimeKind,
        runtimeMode: runtime.mode,
        matchId,
        matchMode: 'single_device_referee',
        transport,
        transportFlavor: 'single_device',
        recipient: {
          ...recipient,
          role: getPlayerRoleFromProjection(projection, profile.playerId, recipient.role)
        }
      },
      initialSync
    };
  }

  private getOrCreateInMemoryRuntime(matchId: string, matchMode: MatchMode): InMemoryAuthorityRuntime {
    const existing = this.inMemoryRuntimes.get(matchId);
    if (existing) {
      return existing;
    }

    const runtimeMode =
      matchMode === 'online'
        ? 'online_cloud'
        : matchMode === 'local_nearby'
          ? 'lan_host_authority'
          : 'single_device_referee';
    const runtime = new InMemoryAuthorityRuntime({
      mode: runtimeMode,
      contentPacks: [this.contentPack],
      persistence: new InMemoryPersistence()
    });
    this.inMemoryRuntimes.set(matchId, runtime);
    return runtime;
  }

  private getOrCreateNearbyRuntime(matchId: string): NearbyAuthorityRuntime {
    const existing = this.nearbyRuntimes.get(matchId);
    if (existing) {
      return existing;
    }

    const runtime = new NearbyAuthorityRuntime({
      contentPacks: [this.contentPack],
      persistence: new InMemoryDurableLocalHostPersistence()
    });
    this.nearbyRuntimes.set(matchId, runtime);
    return runtime;
  }

  private getOrCreateSingleDeviceRuntime(matchId: string): SingleDeviceRefereeRuntime {
    const existing = this.singleDeviceRuntimes.get(matchId);
    if (existing) {
      return existing;
    }

    const runtime = new SingleDeviceRefereeRuntime({
      contentPacks: [this.contentPack]
    });
    this.singleDeviceRuntimes.set(matchId, runtime);
    return runtime;
  }

  private getOrCreateOnlineFoundation(): OnlineFoundationServices {
    if (this.onlineFoundation) {
      return this.onlineFoundation;
    }

    const tableClient = new InMemorySupabaseTableClient();
    const realtime = new MockOnlineRealtimeFanout();
    const repositories = {
      matches: new SupabaseMatchRepository(tableClient),
      events: new SupabaseEventRepository(tableClient),
      snapshots: new SupabaseSnapshotRepository(tableClient),
      projections: new SupabaseProjectionRepository(tableClient),
      contentPackReferences: new SupabaseContentPackReferenceRepository(tableClient)
    };

    this.onlineFoundation = {
      runtime: new OnlineAuthorityRuntime({
        contentPacks: [this.contentPack],
        repositories,
        realtimeFanout: realtime
      }),
      realtime
    };

    return this.onlineFoundation;
  }

  private buildOnlineSession(profile: SessionProfileDraft): OnlineAuthSession {
    return {
      authProvider: 'supabase',
      authSessionId: `session:${profile.authUserId ?? profile.playerId}`,
      authUserId: profile.authUserId ?? profile.playerId,
      defaultPlayerId: profile.playerId,
      memberships: []
    };
  }

  private nextSequence(matchId: string, actorId: string): number {
    const key = `${matchId}:${actorId}`;
    const next = (this.commandSequences.get(key) ?? 0) + 1;
    this.commandSequences.set(key, next);
    return next;
  }

  private makeEnvelope(matchId: string, actor: ActorRef, command: DomainCommand) {
    const sequence = this.nextSequence(matchId, actor.actorId);

    return {
      matchId,
      commandId: `command:${createUuid()}`,
      actor,
      occurredAt: makeTimestamp(sequence),
      idempotencyKey: `idempotency:${matchId}:${actor.actorId}:${sequence}`,
      clientSequence: sequence,
      command
    };
  }

  private async submitCreateMatch(
    transport: TransportAdapter,
    matchId: string,
    matchMode: MatchMode,
    profile: SessionProfileDraft,
    initialScale: CreateMatchInput['initialScale']
  ) {
    const result = await transport.submit(
      this.makeEnvelope(
        matchId,
        { actorId: profile.playerId, playerId: profile.playerId, role: 'host' },
        {
          type: 'create_match',
          payload: {
            mode: matchMode,
            contentPackId: this.contentPack.packId,
            hostPlayerId: profile.playerId,
            hostDisplayName: profile.displayName,
            initialScale
          }
        }
      )
    );

    if (!result.accepted) {
      throw new Error(result.rejection?.message ?? 'Create match command was rejected.');
    }
  }

  private async submitJoinMatch(
    transport: TransportAdapter,
    matchId: string,
    profile: SessionProfileDraft
  ) {
    const result = await transport.submit(
      this.makeEnvelope(
        matchId,
        { actorId: profile.playerId, playerId: profile.playerId, role: 'spectator' },
        {
          type: 'join_match',
          payload: {
            playerId: profile.playerId,
            displayName: profile.displayName
          }
        }
      )
    );

    if (!result.accepted) {
      throw new Error(result.rejection?.message ?? 'Join match command was rejected.');
    }
  }

  private resolveAuthorityRuntime(connection: RuntimeConnection): AuthorityRuntime | undefined {
    switch (connection.runtimeKind) {
      case 'online_foundation':
        return this.onlineFoundation?.runtime;
      case 'nearby_host_authority':
        return this.nearbyRuntimes.get(connection.matchId);
      case 'single_device_referee':
        return this.singleDeviceRuntimes.get(connection.matchId);
      case 'in_memory':
      default:
        return this.inMemoryRuntimes.get(connection.matchId);
    }
  }
}
