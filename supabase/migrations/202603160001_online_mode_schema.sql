-- Required schema for the current Supabase-backed online mode.
--
-- Important:
-- - Column names intentionally use quoted camelCase because the current
--   PostgREST client sends and filters on those exact field names.
-- - match_events intentionally does not foreign-key matchId to matches because
--   the current online runtime appends events before it upserts the match row
--   during create_match.

begin;

create table if not exists public.matches (
  "matchId" text primary key,
  "mode" text not null,
  "lifecycleState" text not null,
  "revision" bigint not null check ("revision" >= 0),
  "contentPackId" text not null,
  "createdByPlayerId" text not null,
  "selectedRulesetId" text,
  "selectedScale" text,
  "createdAt" timestamptz not null,
  "updatedAt" timestamptz not null
);

create table if not exists public.match_events (
  "eventId" text primary key,
  "matchId" text not null,
  "sequence" bigint not null check ("sequence" >= 0),
  "eventEnvelope" jsonb not null,
  "storedAt" timestamptz not null
);

create table if not exists public.match_snapshots (
  "snapshotId" text primary key,
  "matchId" text not null,
  "contentPackId" text not null,
  "runtimeMode" text not null,
  "snapshotVersion" bigint not null check ("snapshotVersion" >= 0),
  "lastEventSequence" bigint not null check ("lastEventSequence" >= 0),
  "aggregate" jsonb not null,
  "createdAt" timestamptz not null
);

create table if not exists public.match_projections (
  "matchId" text not null,
  "projectionScope" text not null,
  "recipientId" text not null,
  "projectionRecordId" text not null,
  "viewerPlayerId" text,
  "viewerTeamId" text,
  "snapshotVersion" bigint not null check ("snapshotVersion" >= 0),
  "lastEventSequence" bigint not null check ("lastEventSequence" >= 0),
  "projection" jsonb not null,
  "generatedAt" timestamptz not null,
  primary key ("matchId", "projectionScope", "recipientId")
);

create table if not exists public.content_pack_references (
  "packId" text primary key,
  "packVersion" text not null,
  "title" text not null,
  "status" text not null,
  "sourceFingerprint" text not null,
  "compatibilityModes" jsonb not null,
  "registeredAt" timestamptz not null
);

commit;

-- Recommended indexes for the current repository access patterns.

create unique index if not exists "match_events_matchId_sequence_key"
  on public.match_events ("matchId", "sequence");

create index if not exists "match_events_matchId_idx"
  on public.match_events ("matchId");

create index if not exists "match_snapshots_matchId_snapshotVersion_idx"
  on public.match_snapshots ("matchId", "snapshotVersion" desc);

create index if not exists "match_snapshots_matchId_idx"
  on public.match_snapshots ("matchId");

create unique index if not exists "match_projections_projectionRecordId_key"
  on public.match_projections ("projectionRecordId");

create index if not exists "match_projections_matchId_snapshotVersion_idx"
  on public.match_projections ("matchId", "snapshotVersion" desc);

create index if not exists "matches_updatedAt_idx"
  on public.matches ("updatedAt" desc);
