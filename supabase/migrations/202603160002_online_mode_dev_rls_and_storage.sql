-- Dev/test RLS and storage setup for the current mobile online mode.
--
-- Important:
-- - The current Supabase REST table client uses the anon key as its database
--   bearer token. That means table access currently happens as role anon, even
--   when the mobile app also has a real authenticated session for storage.
-- - These policies are intentionally permissive so the current app can run.
--   Tighten them later when the command gateway moves server-side or the table
--   client starts using user/service tokens.

begin;

do $$
declare
  table_name text;
  anon_policy_name text;
  authenticated_policy_name text;
begin
  foreach table_name in array array[
    'matches',
    'match_events',
    'match_snapshots',
    'match_projections',
    'content_pack_references'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);

    anon_policy_name := format('dev_anon_full_access_%s', table_name);
    authenticated_policy_name := format('dev_authenticated_full_access_%s', table_name);

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = anon_policy_name
    ) then
      execute format(
        'create policy %I on public.%I for all to anon using (true) with check (true)',
        anon_policy_name,
        table_name
      );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = authenticated_policy_name
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (true) with check (true)',
        authenticated_policy_name,
        table_name
      );
    end if;
  end loop;
end
$$;

commit;

-- Required storage bucket for the current mobile evidence flow.
-- If you want a different bucket name, update both this SQL and
-- EXPO_PUBLIC_ONLINE_ATTACHMENT_BUCKET in the mobile env.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'match-attachments',
  'match-attachments',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic'
  ]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'dev_authenticated_read_match_attachments'
  ) then
    create policy "dev_authenticated_read_match_attachments"
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'match-attachments');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'dev_authenticated_insert_match_attachments'
  ) then
    create policy "dev_authenticated_insert_match_attachments"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'match-attachments');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'dev_authenticated_update_match_attachments'
  ) then
    create policy "dev_authenticated_update_match_attachments"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'match-attachments')
      with check (bucket_id = 'match-attachments');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'dev_authenticated_delete_match_attachments'
  ) then
    create policy "dev_authenticated_delete_match_attachments"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'match-attachments');
  end if;
end
$$;
