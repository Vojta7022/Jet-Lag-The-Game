# Supabase Online Setup

This project's current mobile online mode expects a small fixed Supabase schema in the `public` schema plus one private Storage bucket.

## What the current code expects

Required `public` tables:

- `matches`
- `match_events`
- `match_snapshots`
- `match_projections`
- `content_pack_references`

Required Storage bucket:

- `match-attachments`

Important runtime details:

- the current PostgREST table client uses the Supabase anon key, not the mobile user's access token, for table reads and writes
- the current media upload path does use the authenticated mobile session for Storage uploads and authenticated object reads
- attachment metadata is currently stored inside match aggregate/event/projection JSON, not in a separate attachment SQL table

## Why the current error happens

If you see:

```text
Could not find the table public.match_snapshots in the schema cache
```

your Supabase project is missing the online-mode tables that the runtime expects. Running the schema migration below creates that table and the other required tables.

## Files to run

Run these files in this order:

1. [supabase/migrations/202603160001_online_mode_schema.sql](/Users/vojtechponrt/Documents/Jet%20Lag%20The%20Game/supabase/migrations/202603160001_online_mode_schema.sql)
2. [supabase/migrations/202603160002_online_mode_dev_rls_and_storage.sql](/Users/vojtechponrt/Documents/Jet%20Lag%20The%20Game/supabase/migrations/202603160002_online_mode_dev_rls_and_storage.sql)

## Step-by-step in Supabase

1. Create or open your Supabase project.
2. In `Authentication -> Providers`, enable `Anonymous` sign-ins for local/dev testing.
3. Open `SQL Editor`.
4. Run [supabase/migrations/202603160001_online_mode_schema.sql](/Users/vojtechponrt/Documents/Jet%20Lag%20The%20Game/supabase/migrations/202603160001_online_mode_schema.sql).
5. Run [supabase/migrations/202603160002_online_mode_dev_rls_and_storage.sql](/Users/vojtechponrt/Documents/Jet%20Lag%20The%20Game/supabase/migrations/202603160002_online_mode_dev_rls_and_storage.sql).
6. Confirm the following now exist:
   - `public.matches`
   - `public.match_events`
   - `public.match_snapshots`
   - `public.match_projections`
   - `public.content_pack_references`
   - storage bucket `match-attachments`
7. In `apps/mobile/.env`, set:
   - `EXPO_PUBLIC_ONLINE_PROJECT_URL`
   - `EXPO_PUBLIC_ONLINE_ANON_KEY`
   - `EXPO_PUBLIC_ONLINE_ATTACHMENT_BUCKET=match-attachments`
8. Restart Expo after changing env.

## Notes on the schema

### CamelCase column names are intentional

The current PostgREST client filters and upserts using field names like `matchId`, `projectionScope`, and `recipientId`.

Because of that, the SQL migration creates quoted camelCase column names on purpose. Do not rewrite the schema to snake_case unless you also update the runtime code.

### No foreign key from match_events to matches

`create_match` currently appends to `match_events` before the runtime upserts the `matches` row.

That means a strict foreign key from `match_events.matchId` to `matches.matchId` would break the first online command. The current migration intentionally avoids that foreign key.

### Storage path shape

The current mobile app uploads to object paths like:

```text
matches/{matchId}/{visibilityScope}/{attachmentId}.{ext}
```

The bucket is private. Remote preview URLs are authenticated and require a signed-in session.

## Dev/test RLS policy tradeoff

The dev/test migration grants very broad access on the online-mode tables to both:

- `anon`
- `authenticated`

This is necessary because the current PostgREST table client still uses the anon key for database access.

That is acceptable for local/dev testing, but it is not the final production security model.

## Future production hardening

Before treating online mode as production-ready, tighten at least these areas:

- move command submission and projection access behind a server-side gateway or Edge Function
- stop giving `anon` direct full-table write access
- move table access to user tokens or a trusted service-role/backend boundary
- replace polling-only fanout with a stronger server-side push path where appropriate
- add tighter storage policies based on path, match membership, and visibility scope
- consider signed URL brokering or preview proxies instead of raw authenticated object reads from the client
