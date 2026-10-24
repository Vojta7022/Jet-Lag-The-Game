begin;

alter table public.matches
  add column if not exists "contentPackVersion" text;

alter table public.match_snapshots
  add column if not exists "contentPackVersion" text;

alter table public.content_pack_references
  drop constraint if exists content_pack_references_pkey;

alter table public.content_pack_references
  add constraint content_pack_references_pkey primary key ("packId", "packVersion");

create or replace function public.pin_snapshot_content_pack_version()
returns trigger
language plpgsql
as $$
begin
  new."contentPackVersion" := coalesce(
    new."contentPackVersion",
    new."aggregate"->>'contentPackVersion'
  );
  return new;
end;
$$;

create or replace function public.sync_match_content_pack_version()
returns trigger
language plpgsql
as $$
begin
  if new."contentPackVersion" is not null then
    update public.matches
    set "contentPackVersion" = new."contentPackVersion"
    where "matchId" = new."matchId";
  end if;
  return new;
end;
$$;

drop trigger if exists "match_snapshots_pin_content_pack_version" on public.match_snapshots;
create trigger "match_snapshots_pin_content_pack_version"
before insert or update of "aggregate" on public.match_snapshots
for each row execute function public.pin_snapshot_content_pack_version();

drop trigger if exists "match_snapshots_sync_content_pack_version" on public.match_snapshots;
create trigger "match_snapshots_sync_content_pack_version"
after insert or update of "aggregate" on public.match_snapshots
for each row execute function public.sync_match_content_pack_version();

update public.match_snapshots
set "contentPackVersion" = "aggregate"->>'contentPackVersion'
where "contentPackVersion" is null
  and "aggregate"->>'contentPackVersion' is not null;

update public.matches as matches
set "contentPackVersion" = (
  select snapshot."contentPackVersion"
  from public.match_snapshots as snapshot
  where snapshot."matchId" = matches."matchId"
    and snapshot."contentPackVersion" is not null
  order by snapshot."snapshotVersion" desc
  limit 1
)
where matches."contentPackVersion" is null
  and exists (
    select 1
    from public.match_snapshots as snapshot
    where snapshot."matchId" = matches."matchId"
      and snapshot."contentPackVersion" is not null
  );

commit;
