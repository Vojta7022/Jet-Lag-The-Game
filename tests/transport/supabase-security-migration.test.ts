import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(new URL('../../supabase/migrations/202610240004_secure_online_access.sql', import.meta.url));

test('online security migration removes development-wide table grants and scopes attachment access by match role', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /dev_anon_full_access_/);
  assert.match(sql, /dev_authenticated_full_access_/);
  assert.match(sql, /revoke all on table public\.%I from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.%I to service_role/i);
  assert.match(sql, /create or replace function private\.can_access_match_attachment/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /createdByPlayerId/i);
  assert.match(sql, /Supabase owns the Storage schema and keeps RLS enabled on storage\.objects/i);
  assert.doesNotMatch(sql, /alter table storage\.objects/i);
  assert.doesNotMatch(sql, /revoke all on table storage\.objects/i);
  assert.match(sql, /team_private/i);
  assert.match(sql, /player_private/i);
  assert.match(sql, /create policy .*match_attachments/i);
});
