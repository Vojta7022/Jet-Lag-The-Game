# Online Authority Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make separate online player phones submit commands to one authenticated, server-side authority with durable, race-safe game state and membership-bound role projections.

**Architecture:** Deploy the existing TypeScript engine behind a Supabase Edge Function. Resolve the caller from the Supabase user JWT and a server-owned match-membership table, then validate commands with the shared engine. Persist an accepted revision and its events atomically in Postgres; publish only projection-change notices and have each client fetch its own authorized projection. Keep in-memory and single-device runtimes for tests and fallback play.

**Tech Stack:** Expo/React Native, TypeScript, existing transport/domain/engine packages, Supabase Auth, Edge Functions (Deno), Postgres, Supabase Realtime, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-24-online-player-game-design.md`

## Global Constraints

- Every participant uses their own phone; online cloud play is the primary mode.
- Hiders see current seeker locations; seekers never receive the hider's exact or raw coordinates.
- Client-submitted actor IDs, roles, teams, and answer results are untrusted.
- Service-role secrets never appear in the mobile bundle.
- Only authenticated, server-authorized commands may mutate authoritative match state.
- Command retries are idempotent; concurrent stale revisions are rejected without partial state writes.
- Realtime sends change notices only; private projections are fetched through authorized server access.
- Keep scanned standard rules, role-scoped projections, and the single-device referee fallback intact.
- Do not bundle full scans or book-length transcription in public content.

## Review Focus

- Caller changes `playerId` or `role` in the request body: the server derives identity and role from Auth plus membership and rejects impersonation.
- Two players submit at the same match revision: exactly one command commits; the loser receives a conflict and can resync; event sequence has no duplicate or gap.
- A retry repeats the same idempotency key: return the original result without drawing twice or appending duplicate events.
- A join code is guessed for a private match: only a valid code joins, and the new member receives only their own projection.
- A user requests another player's private projection: server denies it even when the user knows the match ID, player ID, or projection key.

---

## File Map

- `supabase/functions/game-authority/index.ts` — authenticated HTTP boundary for create/join/command/snapshot/reconnect operations.
- `supabase/functions/game-authority/runtime.ts` — construct the shared engine runtime from server credentials and the configured default content pack.
- `supabase/migrations/202610240001_server_authority.sql` — user-to-player match membership, command idempotency, atomic revision commit RPC, and restricted client policies.
- `packages/shared-types/src/transport/online.ts` — request/response contracts for authenticated membership and authority responses.
- `packages/transport/src/online/edge-function-service.ts` — mobile `OnlineTransportService` implementation over the authenticated Edge Function.
- `packages/transport/src/online/supabase-transport-adapter.ts` — keep the transport-facing adapter while removing the client-runtime service path for configured cloud play.
- `apps/mobile/src/runtime/mobile-runtime-orchestrator.ts` — use remote service for configured online sessions and retain mock mode when no backend is configured.
- `apps/mobile/src/runtime/supabase-mobile-session.ts` — provide current bearer token and Auth user ID without deriving authorization from the display profile.
- `apps/mobile/src/screens/LobbyScreen.tsx` — show server-backed roster and allow host removal before start; show participant leave/reconnect state.
- `packages/shared-types/src/contracts/commands.ts`, `packages/domain/src/permissions/role-permissions.ts`, `packages/engine/src/commands/validate-command.ts`, `packages/engine/src/commands/execute-command.ts`, and `packages/engine/src/state-machine/guards.ts` — add the pregame removal command and corresponding event handling.
- `supabase/tests/server_authority.sql` — pgTAP checks for direct client-write denial, RPC grants, revision conflicts, and idempotent commits.
- `tests/transport/online-edge-function.test.ts` — gateway auth, membership, privacy, and request validation.
- `tests/transport/online-atomic-commit.test.ts` — revision conflicts and idempotent retry behavior.
- `tests/transport/supabase-http.test.ts` — mobile invocation headers and error decoding.
- `tests/engine/` — host-only pregame member removal and match-state invariants if that command is added.
- `apps/mobile/tests/lobby-membership.test.ts` — roster actions and non-host restrictions.
- `docs/supabase-online-setup.md` — deployment, migration, and verification steps for secure online mode.

## Interfaces

- `GameAuthorityRequest`: discriminated operation `create_match | join_match | command | snapshot | catch_up`, plus only the fields required by that operation. Identity comes from the verified JWT, never the request body.
- `GameAuthorityResponse`: accepted `CommandSubmissionResult`, a scoped `SyncEnvelope`, or a typed error with `code`, `message`, and optional `currentRevision`.
- `MembershipRecord`: `{ matchId, authUserId, playerId, joinedAt, status }`; role and team are derived from authoritative match state, not copied as authorization truth.
- `public.commit_match_revision(p_payload jsonb) returns jsonb`: service-role-only database transaction. Its payload contains the match ID, expected revision, event envelopes, snapshot, match record, projection rows, command idempotency key, and a client-safe command result. It returns `committed`, `duplicate`, or `revision_conflict` and writes all state for a committed command atomically.
- `EdgeFunctionOnlineService implements OnlineTransportService`: receives `OnlineAuthSession` locally only to obtain the bearer token; it sends no trusted player/role claims to the server.

## Task 1: Add identity-bound match membership and atomic commit storage

**Files:**
- Create: `supabase/migrations/202610240001_server_authority.sql`; preserve already-applied migration history.
- Modify: `packages/shared-types/src/transport/online.ts`.
- Modify: `packages/transport/src/online/contracts.ts` and `supabase-repositories.ts`.
- Test: `tests/transport/online-atomic-commit.test.ts`, `tests/transport/supabase-http.test.ts`, and a local PostgreSQL migration smoke check. Policy assertions are tracked under Task 5.

**Interfaces:**
- Consumes: existing `MatchAggregate`, event envelopes, `SnapshotRecord`, `ProjectionRecord`, match revision, and Supabase Auth user ID.
- Produces: a server-only membership repository plus a transactional commit API with stale-revision and idempotency outcomes.

- [x] **Step 1: Write failing storage tests** for a first commit, a second commit using the updated revision, a stale concurrent revision, a repeated idempotency key, and ensuring idempotent results omit the aggregate and event payloads.
- [x] **Step 2: Run `npm run test:transport`** and confirm the new cases fail because the current repositories append events and save snapshots/projections separately.
- [x] **Step 3: Add membership/idempotency tables and `public.commit_match_revision(p_payload jsonb)`**. The function locks the match row, compares expected revision, checks the idempotency key, appends contiguous events, and stores snapshot/match/projections atomically.

```sql
perform pg_advisory_xact_lock(hashtextextended(p_payload->>'matchId', 0));

select "revision" into current_revision
from public.matches
where "matchId" = p_payload->>'matchId'
for update;

if coalesce(current_revision, -1) <> (p_payload->>'expectedRevision')::bigint then
  return jsonb_build_object('status', 'revision_conflict', 'currentRevision', current_revision);
end if;

-- In the same transaction: return a prior idempotency result if present;
-- otherwise insert event rows, update match metadata, insert the snapshot,
-- upsert the scoped projections, and store the command result.
```

- [x] **Step 4: Add typed repository methods** for membership lookup/binding and transactional commit; membership removal remains a domain command in Task 4.
- [x] **Step 5: Make the new tests pass**, then run all transport tests and `git diff --check`.
- [x] **Step 6: Commit** the migration, repository, contracts, and tests as `feat: add atomic online match commits`.

## Task 2: Move online command and projection authority to an Edge Function

**Files:**
- Create: `supabase/functions/game-authority/index.ts`.
- Create: `supabase/functions/game-authority/runtime.ts`.
- Modify: `packages/transport/src/online/authority-runtime.ts` only to use the atomic commit capability without changing domain rules.
- Modify: `packages/transport/src/online/auth.ts` to bind user identity through server membership records.
- Test: `tests/transport/online-edge-function.test.ts` and `tests/transport/online-runtime.test.ts`.

**Interfaces:**
- Consumes: Task 1 membership and atomic-commit services, existing `EngineCommandGateway`, `buildSyncEnvelope`, and the standard content pack.
- Produces: one user-JWT-protected endpoint that handles create, join, command submission, snapshot, and catch-up; it derives actor/player/role/team from verified server state.

- [x] **Step 1: Add failing handler tests** for missing/invalid JWT, a valid host creating a room, a second Auth user joining by code, non-member snapshot denial, and role impersonation denial.
- [x] **Step 2: Run the focused Edge Function test** and confirm failures identify the absent handler/auth binding.
- [x] **Step 3: Implement request parsing and Auth verification**. Reject unknown operations, malformed JSON, oversized requests, unsupported commands, and missing match membership with typed responses.

```ts
const authorization = request.headers.get('authorization');
if (!authorization?.startsWith('Bearer ')) return jsonError(401, 'AUTH_REQUIRED');

const user = await authClient.auth.getUser(authorization.slice('Bearer '.length));
if (user.error || !user.data.user) return jsonError(401, 'AUTH_INVALID');
```

- [x] **Step 4: Implement server runtime construction** with server-only credentials, versioned bundled content, the shared engine gateway, user membership binding, and atomic persistence from Task 1.

The `join_match` branch validates the join code, dispatches the existing engine command, then associates the verified Auth user with the resulting player ID in the same authority operation. A user already bound to another player in the same match receives `PLAYER_ALREADY_JOINED`.
- [x] **Step 5: Add a function-level test** proving an accepted command produces a projection from the server aggregate and a denied command writes no events.
- [x] **Step 6: Run focused tests, `deno check supabase/functions/game-authority/index.ts`, and `git diff --check`; commit as `feat: add authenticated online game authority`.

## Task 3: Route configured mobile online sessions through the server

**Files:**
- Create: `packages/transport/src/online/edge-function-service.ts`.
- Modify: `packages/transport/src/online/supabase-transport-adapter.ts`.
- Modify: `apps/mobile/src/runtime/mobile-runtime-orchestrator.ts` and `apps/mobile/src/runtime/supabase-mobile-session.ts`.
- Use: the configured Supabase project URL to form `/functions/v1/game-authority`; do not add a duplicate URL setting.
- Test: `tests/transport/supabase-http.test.ts`, `tests/transport/online-edge-function.test.ts`, and `apps/mobile/tests/online-session.test.ts`.

**Interfaces:**
- Consumes: the existing `TransportAdapter`/`OnlineTransportService`, Auth access token, Supabase project URL, and Task 2 operation contract.
- Produces: mobile online commands/snapshots/catch-up/reconnect through the authenticated Edge Function; no client-side `OnlineAuthorityRuntime` for configured cloud matches.

- [ ] **Step 1: Write failing service tests** checking `Authorization: Bearer <user JWT>`, anon/publishable API key placement, operation payloads, typed authorization errors, and stale-revision conflict decoding.
- [ ] **Step 2: Run the focused transport tests** and confirm no Edge Function service implementation exists.
- [ ] **Step 3: Implement the fetch-based service** with timeout, JSON validation, retry only for safe snapshot/catch-up reads, and no automatic retry for non-idempotent writes without the original idempotency key.

```ts
const response = await fetch(`${projectUrl}/functions/v1/game-authority`, {
  method: 'POST',
  headers: {
    apikey: publishableKey,
    Authorization: `Bearer ${session.accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(request)
});
```

- [ ] **Step 4: Inject the remote service for configured online mode** while preserving in-memory online mocks for tests and local development without backend credentials.
- [ ] **Step 5: Add an adapter integration test** that creates on one client, joins on a distinct Auth identity, sends commands from both, and verifies each receives only its scoped projection.
- [ ] **Step 6: Run `npm run test:transport`, `npm run mobile:typecheck`, and `git diff --check`; commit as `feat: route online play through server authority`.

## Task 4: Complete server-backed lobby membership controls

**Files:**
- Modify: `packages/shared-types/src/contracts/commands.ts`, `packages/domain/src/permissions/role-permissions.ts`, `packages/engine/src/commands/validate-command.ts`, `packages/engine/src/commands/execute-command.ts`, and `packages/engine/src/state-machine/guards.ts`.
- Modify: `apps/mobile/src/screens/LobbyScreen.tsx` and its lobby view-model helpers.
- Test: `tests/engine/` and `apps/mobile/tests/lobby-membership.test.ts`.

**Interfaces:**
- Consumes: authenticated membership rows and server-projected lobby roster from Tasks 1–3.
- Produces: host-only pregame remove-player action; participant leave action before start; reconnect path that restores the same player identity; every action is a server-validated command.

- [ ] **Step 1: Inspect existing lobby command tests** and add failing cases for host removal, non-host removal denial, post-start removal denial, member self-leave before start, and stale membership rejection.
- [ ] **Step 2: Run the focused tests** and record which cases current command/event model lacks.
- [ ] **Step 3: Add the smallest domain command/event** needed to remove a player and clean team/role membership atomically; reject removal after match start and removal of the host while the match is active.

```ts
{
  type: 'remove_match_player',
  payload: { playerId: string }
}
```

- [ ] **Step 4: Add lobby controls** with a confirmation step for removal, visible join status, and reconnect messaging; disable mutation controls for non-host players.
- [ ] **Step 5: Test lobby behavior through the online adapter** and run related engine/mobile tests; commit as `feat: add online lobby membership controls`.

## Task 5: Lock down deployment and verification for the authority foundation

**Files:**
- Create: `supabase/migrations/202610240002_online_authority_policies.sql`; preserve the already-applied development migration.
- Modify: `docs/supabase-online-setup.md`.
- Test: `supabase/tests/server_authority.sql`, full transport tests, and mobile typecheck.

**Interfaces:**
- Consumes: the deployed function and Task 1 database schema.
- Produces: secure setup instructions, client grants limited to function/RLS-authorized projections, and a repeatable two-client online integration checklist.

- [ ] **Step 1: Add pgTAP checks** proving anon cannot mutate matches/events/snapshots/projections, authenticated clients cannot directly mutate authoritative tables, and only `service_role` can invoke the commit RPC.
- [ ] **Step 2: Add restrictive policies and function/RPC grants**; preserve local test fixtures and document how an existing development project applies the new migration.

```sql
revoke insert, update, delete on public.matches,
  public.match_events, public.match_snapshots, public.match_projections
from anon, authenticated;

revoke all on function public.commit_match_revision(jsonb) from public, anon, authenticated;
grant execute on function public.commit_match_revision(jsonb) to service_role;
```

- [ ] **Step 3: Update setup documentation** with Edge Function secrets, Auth provider, migration order, local invocation, and a two-distinct-user verification sequence.
- [ ] **Step 4: Run `env PATH="$PWD/.venv/bin:$PATH" npm test`, `npm run mobile:typecheck`, `deno check supabase/functions/game-authority/index.ts`, and `supabase test db`; if Supabase CLI/database credentials are unavailable, report the database-policy tests as authored but unexecuted. Run `git diff --check`; commit as `chore: secure online authority deployment`.

## Follow-up plans required before the full online game is called complete

These are not removed from the goal; they follow the server-authority foundation and remain tracked in `tasks/todo.md`:

1. **Role-aware live location:** hider client publishing, hider-to-seeker map projections, seeker team tracks, background permission handling, freshness/accuracy constraints, and location privacy tests.
2. **Automatic location questions:** freeze authoritative samples at question acceptance, resolve each supported Investigation Book template from versioned resolver data, record provenance, draw exact rewards, and publish bounded map geometry.
3. **Standard card parity:** reconcile scanned base-game card text, make each effect automatic or explicit in-app assisted resolution, and keep experimental/expansion sets separate.
4. **Administrative map regions and content packs:** searchable country/region/municipality boundaries, add/subtract composition, scenario import/export, content-pack selection and validation.
5. **Physical field test:** complete a real cellular round on separate hider/seeker phones, including backgrounded apps, GPS freshness, reconnects, answer/map/card flow, endgame, score, and next-round handoff.

