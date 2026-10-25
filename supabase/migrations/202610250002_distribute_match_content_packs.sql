begin;

alter table public.content_pack_references
  add column if not exists "contentPack" jsonb;

commit;
