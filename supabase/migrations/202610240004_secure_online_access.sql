begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'matches',
    'match_events',
    'match_snapshots',
    'match_projections',
    'content_pack_references',
    'match_memberships',
    'match_command_idempotency'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', 'dev_anon_full_access_' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'dev_authenticated_full_access_' || table_name, table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create or replace function private.can_access_match_attachment(object_name text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
  folders text[] := storage.foldername(object_name);
  member_player_id text;
  assigned_team_id text;
  aggregate_state jsonb;
  is_match_host boolean;
begin
  if folders is null or array_length(folders, 1) < 3 or folders[1] <> 'matches' then
    return false;
  end if;

  select memberships."playerId", latest.aggregate
    into member_player_id, aggregate_state
  from public.match_memberships as memberships
  left join lateral (
    select snapshots.aggregate
    from public.match_snapshots as snapshots
    where snapshots."matchId" = memberships."matchId"
    order by snapshots."snapshotVersion" desc
    limit 1
  ) as latest on true
  where memberships."matchId" = folders[2]
    and memberships."authUserId" = auth.uid()
    and memberships.status = 'active';

  if member_player_id is null or aggregate_state is null then
    return false;
  end if;

  is_match_host := aggregate_state->>'createdByPlayerId' = member_player_id;
  assigned_team_id := aggregate_state->'roleAssignments'->member_player_id->>'teamId';

  if folders[3] = 'public_match' then
    return true;
  elsif folders[3] = 'team_private' then
    return array_length(folders, 1) = 4
      and (is_match_host or folders[4] = assigned_team_id);
  elsif folders[3] = 'player_private' then
    return array_length(folders, 1) = 4
      and (is_match_host or folders[4] = member_player_id);
  elsif folders[3] = 'host_admin' then
    return is_match_host;
  end if;

  return false;
end
$$;

revoke all on function private.can_access_match_attachment(text) from public, anon;
grant execute on function private.can_access_match_attachment(text) to authenticated, service_role;

drop policy if exists "dev_authenticated_read_match_attachments" on storage.objects;
drop policy if exists "dev_authenticated_insert_match_attachments" on storage.objects;
drop policy if exists "dev_authenticated_update_match_attachments" on storage.objects;
drop policy if exists "dev_authenticated_delete_match_attachments" on storage.objects;
drop policy if exists "match_attachments_read_by_scope" on storage.objects;
drop policy if exists "match_attachments_insert_by_scope" on storage.objects;
drop policy if exists "match_attachments_update_by_scope" on storage.objects;
drop policy if exists "match_attachments_delete_by_scope" on storage.objects;

alter table storage.objects enable row level security;
revoke all on table storage.objects from public, anon, authenticated;
grant select, insert, update, delete on table storage.objects to authenticated, service_role;

create policy "match_attachments_read_by_scope"
  on storage.objects for select to authenticated
  using (bucket_id = 'match-attachments' and private.can_access_match_attachment(name));
create policy "match_attachments_insert_by_scope"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'match-attachments' and private.can_access_match_attachment(name));
create policy "match_attachments_update_by_scope"
  on storage.objects for update to authenticated
  using (bucket_id = 'match-attachments' and private.can_access_match_attachment(name))
  with check (bucket_id = 'match-attachments' and private.can_access_match_attachment(name));
create policy "match_attachments_delete_by_scope"
  on storage.objects for delete to authenticated
  using (bucket_id = 'match-attachments' and private.can_access_match_attachment(name));

commit;
