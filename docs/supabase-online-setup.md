# Supabase Online Setup

Online play uses Supabase Auth, an authenticated `game-authority` Edge Function, private match tables, and the `match-attachments` Storage bucket. Mobile clients submit commands through the function; the function validates the signed-in player's match membership and commits state with the server-only service-role key.

The current mobile flow signs each phone in anonymously, then binds that authenticated user to the player's match membership. The local Supabase config enables anonymous sign-ins; enable the same Auth setting in the hosted project's Auth configuration before field play. Anonymous accounts are device/session identities, so account recovery and identity linking are not implemented yet.

## Runtime configuration

Set these values in `apps/mobile/.env`:

- `EXPO_PUBLIC_ONLINE_PROJECT_URL`
- `EXPO_PUBLIC_ONLINE_ANON_KEY`
- `EXPO_PUBLIC_ONLINE_ATTACHMENT_BUCKET=match-attachments`

These are public client values. Never put the Supabase service-role key in the mobile app, an `EXPO_PUBLIC_*` variable, source control, or a shared client `.env` file. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as secrets for the `game-authority` Edge Function only.

The project currently depends on these tables: `matches`, `match_events`, `match_snapshots`, `match_projections`, `content_pack_references`, `match_memberships`, and `match_command_idempotency`. Storage uses one private bucket named `match-attachments`.

## Apply migrations

For a new project, apply every migration in order, including the security follow-up last:

1. `supabase/migrations/202603160001_online_mode_schema.sql`
2. `supabase/migrations/202603160002_online_mode_dev_rls_and_storage.sql`
3. `supabase/migrations/202603160003_online_match_join_codes.sql`
4. `supabase/migrations/202610240001_server_authority.sql`
5. `supabase/migrations/202610240003_atomic_membership_removal.sql`
6. `supabase/migrations/202610240004_secure_online_access.sql`
7. `supabase/migrations/202610250001_pin_match_content_pack_version.sql`

The second migration is retained for migration history and creates the bucket, but it temporarily installs permissive development policies. The final migration removes those grants and policies. Do not stop after migration 2 or expose that intermediate state to players.

The final migration adds scoped policies to `storage.objects` without changing its ownership, grants, or RLS flag. Supabase manages that table under `supabase_storage_admin`; app migrations must not alter those ownership-controlled properties.

## Local online smoke check

With Docker running, start the local Supabase stack using `npx --yes supabase@latest start`. In a second terminal run `npx --yes supabase@latest functions serve game-authority`, then run `npm run online:smoke`. The smoke check creates disposable anonymous users, a match, and test evidence in the local database. It exercises host/seeker join, scoped projections, outsider denial, Storage privacy, membership revocation, and direct-table denial. Use only a disposable local project; it does not contact or validate a hosted project.

For a project that already has game data or uploaded attachments, inspect and back up its schema and bucket before applying migration 004. It replaces legacy attachment access policies and only permits the current scoped object paths. Existing objects stored under the older `matches/{matchId}/{visibilityScope}/{attachmentId}.{ext}` layout will not match the new player/team-specific policy; migrate those objects and their metadata before relying on them.

## Deploy the authority function

Deploy `supabase/functions/game-authority/index.ts` as the `game-authority` Edge Function. The checked-in `supabase/config.toml` keeps JWT verification enabled for this function; do not deploy it with `--no-verify-jwt`. Configure the three server secrets listed above. The service-role key belongs only in the function's secret store. Confirm that a signed-in player can create/join a match and that a player outside the match cannot read or issue commands for it.

The client uses the anon key for Supabase Auth and authenticated Storage requests. Match commands and scoped projection reads go through the Edge Function; mobile clients must not use direct PostgREST access for authoritative match tables. The Edge Function currently uses polling for projection refresh, not a push channel.

## Storage visibility and paths

Evidence uploads are stored beneath a match and visibility scope:

```text
matches/{matchId}/public_match/{attachmentId}.{ext}
matches/{matchId}/team_private/{teamId}/{attachmentId}.{ext}
matches/{matchId}/player_private/{playerId}/{attachmentId}.{ext}
matches/{matchId}/host_admin/{playerId}/{attachmentId}.{ext}
```

The authenticated Storage policies check active membership and the viewer's scope against the latest match snapshot. `public_match` is available to active members; team and player paths are restricted to the assigned team or player; `host_admin` is restricted to the match creator. Do not construct custom paths outside these shapes.

## Troubleshooting and deployment checks

- `Could not find the table public.match_snapshots in the schema cache`: confirm migrations 1–6 completed and refresh the Supabase API schema cache.
- `401` from `game-authority`: confirm Anonymous Auth is enabled for the current development login flow, the client URL/key are correct, and the function requires/receives a valid JWT.
- `403` for a valid user: confirm that user has an active `match_memberships` row for the match and that the player is not removed.
- Storage upload/read denied: confirm the player is an active match member and the object path uses their permitted visibility scope.

The local migrations, Auth, Edge Function, membership checks, and Storage policies have been exercised against a disposable Supabase stack with separate anonymous sessions. This does not validate a hosted deployment. Before relying on online play, deploy the Edge Function and migrations to a configured hosted project, then complete a cellular multi-phone round.
