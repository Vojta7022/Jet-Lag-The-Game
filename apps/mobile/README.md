# Mobile App Shell

This Expo workspace now contains the first mobile shell for the project.

Included in this phase:

- Expo + React Native + TypeScript scaffold
- Expo Router screen structure
- provider stack for runtime selection, transport/runtime wiring, and shared shell state
- basic session entry flow
- create-match and join-match flows
- real native map screen with provider-backed searchable region selection and bounded overlays
- first-pass question center wired to `begin_question_prompt`, `ask_question`, `answer_question`, and host-side `apply_constraint`
- first-pass cards screen wired to `draw_card`, `play_card`, `discard_card`, and `resolve_card_window`
- first-pass chat screen with public/team channel switching, scoped message lists, and honest placeholder attachment flows
- first-pass movement screen with foreground location permission state, `update_location` wiring, and seeker breadcrumb overlays
- lobby, dashboard placeholder, and status screens
- developer runtime switcher for:
  - in-memory runtime
  - online adapter foundation
  - nearby host-authoritative foundation
  - single-device referee foundation
- lightweight smoke tests for app-shell state and runtime orchestration

Still intentionally deferred:

- visual polish
- real Supabase backend wiring
- real LAN discovery and device transport
- production-tuned background location behavior

## Run the App

From the repository root:

```bash
npm install
npm run mobile:test:smoke
npm run mobile:start
```

Platform shortcuts:

```bash
npm run mobile:ios
npm run mobile:android
npm run mobile:web
```

Optional validation before the first launch:

```bash
npm run mobile:typecheck
```

## Run Mobile Smoke Tests

```bash
npm run test:mobile
```

The mobile shell README and root workspace scripts assume npm workspaces for now. `pnpm-workspace.yaml` is present for future tooling, but this first runnable pass is documented against npm.

## Environment Variables

The app has safe defaults for all current runtime-mode switches, so a `.env` file is optional.

If you want to override them, start from:

```bash
apps/mobile/.env.example
```

Currently supported `EXPO_PUBLIC_*` variables include:

- `EXPO_PUBLIC_DEFAULT_RUNTIME_MODE`
- `EXPO_PUBLIC_ENABLE_IN_MEMORY_MODE`
- `EXPO_PUBLIC_ENABLE_ONLINE_MODE`
- `EXPO_PUBLIC_ENABLE_NEARBY_MODE`
- `EXPO_PUBLIC_ENABLE_SINGLE_DEVICE_MODE`
- `EXPO_PUBLIC_ENABLE_DEVELOPER_TOOLS`
- `EXPO_PUBLIC_DEFAULT_MATCH_PREFIX`
- `EXPO_PUBLIC_NEARBY_JOIN_TTL_SECONDS`
- `EXPO_PUBLIC_ONLINE_PROJECT_URL`
- `EXPO_PUBLIC_REGION_PROVIDER_BASE_URL`
- `EXPO_PUBLIC_REGION_PROVIDER_LABEL`
- `EXPO_PUBLIC_REGION_PROVIDER_ATTRIBUTION_URL`
- `EXPO_PUBLIC_REGION_PROVIDER_USAGE_MODE`
- `EXPO_PUBLIC_REGION_PROVIDER_CONTACT_EMAIL`
- `EXPO_PUBLIC_REGION_PROVIDER_THROTTLE_MS`
- `EXPO_PUBLIC_REGION_PROVIDER_CACHE_TTL_SECONDS`
- `EXPO_PUBLIC_REGION_PROVIDER_TIMEOUT_MS`

## Startup Notes

- This stabilization pass did not include a real Expo device or simulator launch from this workspace because no `node_modules` were present during validation.
- The startup-risk fixes in this pass focused on config correctness, workspace scripts, Expo Router/Babel setup, Metro monorepo loading, and dependency declarations that are commonly needed for Expo web/native shell startup.
- If Expo reports native dependency drift after install, run `npx expo install --fix` from `apps/mobile` and then retry the workspace commands above.

## Current Map Phase

The mobile shell now includes a player-facing map screen that:

- previews seeded playable regions
- searches cities and larger administrative regions through an OSM-compatible boundary provider abstraction
- bootstraps a host match into `map_setup` through real engine commands
- applies `create_map_region`
- renders real native map tiles on iOS and Android
- renders the selected boundary and current bounded candidate region on geographic coordinates
- renders eliminated areas, constraint layers, and visible seeker breadcrumbs on the same bounded surface when the current scope allows them

The first seed regions are:

- Prague
- Central Bohemia
- Vienna

What is still placeholder in this phase:

- direct mobile use of the public OSM/Nominatim endpoint is suitable for local or low-volume development only
- a production deployment should move the region provider behind a backend or proxy that can enforce attribution, caching, and rate limiting cleanly
- web keeps the bounded fallback preview instead of the native tile surface
- map styling is intentionally functional rather than polished

Current provider behavior:

- the app first queries an OSM-compatible Nominatim search source for real place candidates and polygon boundaries
- provider results are cached in memory, deduplicated while requests are in flight, and spaced out with a minimum delay between request starts
- the map search UI shows source attribution and whether the live provider or bundled fallback is active
- the HTTP request execution layer is isolated from the screen and provider mapping code so a backend or proxy can replace direct client traffic later without changing the map screen API
- bundled seed regions are only used when the provider is unavailable, not as the default path

Provider deployment guidance:

- local or low-volume development can use the public Nominatim base URL directly
- production should point `EXPO_PUBLIC_REGION_PROVIDER_BASE_URL` at a backend or proxy that applies attribution, caching, and rate limiting server-side
- the current mobile provider abstraction is designed so this swap does not require a new search UI or a new bounded-region apply flow

## Current Question Phase

The mobile shell now includes a dedicated question center that:

- lists imported question categories and templates from the real content pack
- lets seeker or host-admin views ask questions through the engine runtime
- lets hider or host-admin views submit answers
- lets host-admin apply the canonical constraint for the answered question
- shows honest result modes: `exact`, `approximate`, or `metadata-only`
- refreshes the authoritative bounded map state after constraint application

Photo questions stay manual in this phase. The shell records placeholder attachment ids and notes, but it does not pretend to upload media or generate geometry.

## Current Cards Phase

The mobile shell now includes a dedicated cards screen that:

- shows visible hands and piles for the current projection scope
- reads card definitions from the imported content pack
- lets permitted roles draw, play, discard, and close card windows through the real runtime
- labels cards honestly as `authoritative`, `assisted`, or `manual`
- keeps private hands hidden outside the current role and scope

The current seed pack only includes a hider deck, so seeker views will usually show no accessible deck content yet.

## Current Chat And Evidence Phase

The mobile shell now includes a dedicated chat screen that:

- renders lobby, global, and team-private channels from the real scoped projection
- lets permitted roles send messages through `send_chat_message`
- records attachment placeholders through `upload_attachment` without pretending media storage already exists
- surfaces active photo-question and card evidence contexts when the current projection shows them
- keeps public, team-private, and hidden attachment visibility aligned with the runtime projection scope

## Current Movement Phase

The mobile shell now includes a dedicated movement screen that:

- checks and requests foreground location permission honestly
- exposes `manual`, `balanced`, and `frequent` update modes
- sends real `update_location` commands for one-shot or continuous foreground sharing
- renders visible movement breadcrumbs and latest visible positions on the bounded map surface
- keeps hidden hider coordinates out of movement overlays and public scopes

This is still a first-pass foreground flow. It is not yet hardened for background execution, battery tuning, or production GPS smoothing.
