begin;

alter table public.matches
  add column if not exists "joinCode" text;

commit;

create unique index if not exists "matches_joinCode_key"
  on public.matches ("joinCode")
  where "joinCode" is not null;
