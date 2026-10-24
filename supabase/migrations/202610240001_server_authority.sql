begin;

create table if not exists public.match_memberships (
  "matchId" text not null references public.matches("matchId") on delete cascade,
  "authUserId" uuid not null references auth.users(id) on delete cascade,
  "playerId" text not null,
  "joinedAt" timestamptz not null,
  "status" text not null check ("status" in ('active', 'removed')),
  primary key ("matchId", "authUserId")
);

create unique index if not exists "match_memberships_active_player_key"
  on public.match_memberships ("matchId", "playerId")
  where "status" = 'active';

create index if not exists "match_memberships_authUserId_idx"
  on public.match_memberships ("authUserId", "status");

create table if not exists public.match_command_idempotency (
  "matchId" text not null references public.matches("matchId") on delete cascade,
  "idempotencyKey" text not null,
  "commandId" text not null,
  "committedRevision" bigint not null,
  "commandResult" jsonb not null,
  "createdAt" timestamptz not null,
  primary key ("matchId", "idempotencyKey"),
  unique ("matchId", "commandId")
);

alter table public.match_memberships enable row level security;
alter table public.match_command_idempotency enable row level security;

revoke all on public.match_memberships from public, anon, authenticated;
revoke all on public.match_command_idempotency from public, anon, authenticated;
grant select, insert, update, delete on public.match_memberships to service_role;
grant select, insert, update, delete on public.match_command_idempotency to service_role;

create or replace function public.commit_match_revision(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  requested_match_id text := p_payload->>'matchId';
  requested_expected_revision bigint;
  current_revision bigint;
  next_revision bigint;
  existing_command public.match_command_idempotency%rowtype;
  event_row jsonb;
  expected_sequence bigint;
  result_json jsonb;
begin
  if requested_match_id is null or p_payload->>'idempotencyKey' is null or p_payload->>'commandId' is null then
    raise exception using errcode = '22023', message = 'matchId, commandId, and idempotencyKey are required';
  end if;

  requested_expected_revision := nullif(p_payload->>'expectedRevision', '')::bigint;
  perform pg_advisory_xact_lock(hashtextextended(requested_match_id, 0));

  select * into existing_command
  from public.match_command_idempotency
  where "matchId" = requested_match_id
    and "idempotencyKey" = p_payload->>'idempotencyKey';

  if found then
    if existing_command."commandId" <> p_payload->>'commandId' then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSE';
    end if;
    return jsonb_build_object(
      'status', 'duplicate',
      'committedRevision', existing_command."committedRevision",
      'result', existing_command."commandResult"
    );
  end if;

  select "revision" into current_revision
  from public.matches
  where "matchId" = requested_match_id
  for update;

  if requested_expected_revision is distinct from current_revision then
    return jsonb_build_object('status', 'revision_conflict', 'currentRevision', current_revision);
  end if;

  next_revision := (p_payload->'match'->>'revision')::bigint;
  if next_revision is null
    or next_revision <= coalesce(current_revision, 0)
    or p_payload->'snapshot'->>'matchId' <> requested_match_id
    or (p_payload->'snapshot'->>'snapshotVersion')::bigint <> next_revision
    or (p_payload->'snapshot'->>'lastEventSequence')::bigint <> next_revision
    or (p_payload->'result'->>'accepted')::boolean is distinct from true
    or p_payload->'result'->>'commandId' <> p_payload->>'commandId'
    or (p_payload->'result'->>'aggregateRevision')::bigint <> next_revision then
    raise exception using errcode = '22023', message = 'INVALID_ATOMIC_COMMIT';
  end if;

  expected_sequence := coalesce(current_revision, 0) + 1;
  for event_row in select value from jsonb_array_elements(p_payload->'events') loop
    if event_row->>'matchId' <> requested_match_id
      or (event_row->>'sequence')::bigint <> expected_sequence then
      raise exception using errcode = '22023', message = 'INVALID_EVENT_SEQUENCE';
    end if;
    expected_sequence := expected_sequence + 1;
  end loop;

  if expected_sequence - 1 <> next_revision then
    raise exception using errcode = '22023', message = 'INVALID_EVENT_SEQUENCE';
  end if;

  insert into public.matches (
    "matchId", "joinCode", "mode", "lifecycleState", "revision", "contentPackId",
    "createdByPlayerId", "selectedRulesetId", "selectedScale", "createdAt", "updatedAt"
  ) values (
    requested_match_id,
    p_payload->'match'->>'joinCode',
    p_payload->'match'->>'mode',
    p_payload->'match'->>'lifecycleState',
    next_revision,
    p_payload->'match'->>'contentPackId',
    p_payload->'match'->>'createdByPlayerId',
    p_payload->'match'->>'selectedRulesetId',
    p_payload->'match'->>'selectedScale',
    (p_payload->'match'->>'createdAt')::timestamptz,
    (p_payload->'match'->>'updatedAt')::timestamptz
  )
  on conflict ("matchId") do update set
    "joinCode" = excluded."joinCode",
    "mode" = excluded."mode",
    "lifecycleState" = excluded."lifecycleState",
    "revision" = excluded."revision",
    "contentPackId" = excluded."contentPackId",
    "createdByPlayerId" = excluded."createdByPlayerId",
    "selectedRulesetId" = excluded."selectedRulesetId",
    "selectedScale" = excluded."selectedScale",
    "updatedAt" = excluded."updatedAt";

  insert into public.match_events ("eventId", "matchId", "sequence", "eventEnvelope", "storedAt")
  select rows.value->>'eventId', rows.value->>'matchId', (rows.value->>'sequence')::bigint,
    rows.value, (rows.value->>'occurredAt')::timestamptz
  from jsonb_array_elements(p_payload->'events') as rows(value);

  insert into public.match_snapshots (
    "snapshotId", "matchId", "contentPackId", "runtimeMode", "snapshotVersion",
    "lastEventSequence", "aggregate", "createdAt"
  ) values (
    p_payload->'snapshot'->>'snapshotId',
    requested_match_id,
    p_payload->'snapshot'->>'contentPackId',
    p_payload->'snapshot'->>'runtimeMode',
    next_revision,
    next_revision,
    p_payload->'snapshot'->'aggregate',
    (p_payload->'snapshot'->>'createdAt')::timestamptz
  );

  insert into public.match_projections (
    "matchId", "projectionScope", "recipientId", "projectionRecordId", "viewerPlayerId",
    "viewerTeamId", "snapshotVersion", "lastEventSequence", "projection", "generatedAt"
  )
  select rows."matchId", rows."projectionScope", rows."recipientId", rows."projectionRecordId",
    rows."viewerPlayerId", rows."viewerTeamId", rows."snapshotVersion", rows."lastEventSequence",
    rows."projection", rows."generatedAt"
  from jsonb_to_recordset(p_payload->'projections') as rows(
    "matchId" text, "projectionScope" text, "recipientId" text, "projectionRecordId" text,
    "viewerPlayerId" text, "viewerTeamId" text, "snapshotVersion" bigint,
    "lastEventSequence" bigint, "projection" jsonb, "generatedAt" timestamptz
  )
  on conflict ("matchId", "projectionScope", "recipientId") do update set
    "projectionRecordId" = excluded."projectionRecordId",
    "viewerPlayerId" = excluded."viewerPlayerId",
    "viewerTeamId" = excluded."viewerTeamId",
    "snapshotVersion" = excluded."snapshotVersion",
    "lastEventSequence" = excluded."lastEventSequence",
    "projection" = excluded."projection",
    "generatedAt" = excluded."generatedAt";

  result_json := jsonb_build_object(
    'accepted', true,
    'matchId', requested_match_id,
    'commandId', p_payload->>'commandId',
    'aggregateRevision', next_revision,
    'events', '[]'::jsonb
  );
  insert into public.match_command_idempotency (
    "matchId", "idempotencyKey", "commandId", "committedRevision", "commandResult", "createdAt"
  ) values (
    requested_match_id,
    p_payload->>'idempotencyKey',
    p_payload->>'commandId',
    next_revision,
    result_json,
    now()
  );

  return jsonb_build_object('status', 'committed', 'committedRevision', next_revision, 'result', result_json);
end;
$$;

revoke all on function public.commit_match_revision(jsonb) from public, anon, authenticated;
grant execute on function public.commit_match_revision(jsonb) to service_role;

commit;
