import contentPackJson from '../../../samples/generated/jet-lag-the-game.content-pack.json' with { type: 'json' };
import type { ContentPack } from '../../../packages/shared-types/src/index.ts';
import { OnlineAuthorityRuntime } from '../../../packages/transport/src/online/authority-runtime.ts';
import type { OnlineRepositoryBundle } from '../../../packages/transport/src/online/contracts.ts';
import {
  SupabaseContentPackReferenceRepository,
  SupabaseEventRepository,
  SupabaseMatchRepository,
  SupabaseOnlineAuthorityRepository,
  SupabaseProjectionRepository,
  SupabaseSnapshotRepository
} from '../../../packages/transport/src/online/supabase-repositories.ts';
import { SupabaseRestTableClient } from '../../../packages/transport/src/online/supabase-rest-table-client.ts';
import { SupabaseProjectionPollingFanout } from '../../../packages/transport/src/online/supabase-polling-fanout.ts';
import {
  CompositeQuestionFeatureDataProvider,
  OpenStreetMapCountryBoundaryProvider,
  OpenMeteoElevationFeatureProvider,
  OpenStreetMapQuestionFeatureProvider,
  parseOpenStreetMapQuestionFeatureEndpoints
} from '../../../packages/geo/src/index.ts';
import { createGameAuthorityHandler } from './index.ts';

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required Edge Function secret: ${name}`);
  return value;
}

export function createOnlineAuthorityDependencies(env: (name: string) => string = requiredEnv) {
  const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '');
  const publicKey = env('SUPABASE_ANON_KEY');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const serverClient = new SupabaseRestTableClient({ baseUrl: supabaseUrl, anonKey: serviceRoleKey });
  const matches = new SupabaseMatchRepository(serverClient);
  const events = new SupabaseEventRepository(serverClient);
  const snapshots = new SupabaseSnapshotRepository(serverClient);
  const projections = new SupabaseProjectionRepository(serverClient);
  const contentPackReferences = new SupabaseContentPackReferenceRepository(serverClient);
  const authorityRepository = new SupabaseOnlineAuthorityRepository(serverClient);
  const repositories: OnlineRepositoryBundle = { matches, events, snapshots, projections, contentPackReferences };
  const service = new OnlineAuthorityRuntime({
    contentPacks: [contentPackJson as ContentPack],
    repositories,
    authorityRepository,
    realtimeFanout: new SupabaseProjectionPollingFanout({ projections, pollIntervalMs: 1_500 }),
    countryBoundaryDataProvider: new OpenStreetMapCountryBoundaryProvider({
      endpoint: Deno.env.get('NOMINATIM_LOOKUP_URL')
    }),
    questionFeatureDataProvider: new CompositeQuestionFeatureDataProvider([
      new OpenMeteoElevationFeatureProvider(),
      new OpenStreetMapQuestionFeatureProvider({
        endpoints: parseOpenStreetMapQuestionFeatureEndpoints(Deno.env.get('OVERPASS_API_URLS'))
      })
    ])
  });

  return {
    auth: {
      async getUser(accessToken: string) {
        const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: { apikey: publicKey, Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) return undefined;
        const body = await response.json() as { id?: unknown };
        return typeof body.id === 'string' ? { id: body.id } : undefined;
      }
    },
    memberships: {
      find: (matchId: string, authUserId: string) => authorityRepository.findMembership(matchId, authUserId),
      bind: (record: Parameters<typeof authorityRepository.bindMembership>[0]) => authorityRepository.bindMembership(record),
      removePlayer: (matchId: string, playerId: string) => authorityRepository.removeMembership(matchId, playerId)
    },
    matches: {
      async findByJoinCode(joinCode: string) {
        return (await matches.getByJoinCode(joinCode))?.matchId;
      },
      async findJoinCodeByMatchId(matchId: string) {
        return (await matches.getByMatchId(matchId))?.joinCode;
      }
    },
    service
  };
}

export function createOnlineAuthorityHandler() {
  return createGameAuthorityHandler(createOnlineAuthorityDependencies());
}
