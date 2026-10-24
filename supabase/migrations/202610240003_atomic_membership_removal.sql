begin;

create or replace function public.revoke_membership_for_removed_player()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  removed_player_id text;
begin
  if NEW."eventEnvelope"->'event'->>'type' <> 'player_removed' then
    return NEW;
  end if;

  removed_player_id := NEW."eventEnvelope"->'event'->'payload'->>'playerId';
  if removed_player_id is not null then
    update public.match_memberships
    set "status" = 'removed'
    where "matchId" = NEW."matchId"
      and "playerId" = removed_player_id
      and "status" = 'active';
  end if;

  return NEW;
end;
$$;

drop trigger if exists "match_events_revoke_removed_player_membership" on public.match_events;
create trigger "match_events_revoke_removed_player_membership"
after insert on public.match_events
for each row execute function public.revoke_membership_for_removed_player();

revoke all on function public.revoke_membership_for_removed_player() from public, anon, authenticated;

commit;
