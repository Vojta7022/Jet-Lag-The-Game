# Transit Hide and Seek Mobile

A cross-platform mobile app for running a configurable transit-based hide-and-seek game on iOS and Android.

## Goal

This project aims to build a complete multiplayer game runner so players can run the full game using only the app, including:

- room/lobby creation
- role assignment
- map setup and search boundaries
- question categories and answer-driven constraints
- card decks, hands, and effects
- timers and cooldowns
- dice rolls
- live seeker location sharing
- hidden hider location handling
- chat and image sharing
- online multiplayer
- local nearby multiplayer
- single-device referee fallback

## Product direction

This app is intentionally generic and configurable.

It is **not** a hardcoded clone of any one season or branded implementation.
Game content such as cards, question categories, and rulesets should be import-driven.

## Source of truth

Main project specification:
- `docs/product-spec.md`

Project rules and engineering instructions:
- `AGENTS.md`

## Content input

The first real content pack now comes from the cleaned workbook seed:
- `Jet Lag The Game - cleaned for import.xlsx`

This workbook should be imported into canonical JSON content definitions rather than hardcoded directly into the app.

## Planned architecture

Planned major areas:
- mobile app: Expo + React Native + TypeScript
- online backend: Supabase
- local mode: host-authoritative nearby multiplayer
- core engine: config-driven rules, cards, questions, constraints, and match state machine
- geospatial layer: bounded regional search, geometry clipping, and feature-based constraint engine

## Initial implementation priorities

1. architecture and schema
2. workbook import pipeline
3. core game engine and state machine
4. map and constraint engine
5. card engine
6. online and local multiplayer
7. UI polish, testing, and production hardening

## Repository status

Current stage:
- schema/types foundation
- workbook importer
- core domain engine and state machine foundation
- bounded geometry and constraint-engine foundation

Expected early deliverables:
- `docs/architecture.md`
- `docs/state-machine.md`
- `docs/import-schema.md`
- `docs/risks.md`

## Importer

The initial shared schema/types foundation and workbook importer are now in place.

Run the workbook importer:

```bash
npm run import:jetlag
```

This reads `Jet Lag The Game - cleaned for import.xlsx` and writes:

- `samples/generated/jet-lag-the-game.content-pack.json`
- `samples/generated/jet-lag-the-game.import-report.json`

Run the importer test suite:

```bash
npm test
```

Run only the geo and constraint tests:

```bash
npm run test:geo
```

The current importer outputs a draft content pack with provenance metadata, normalization warnings, and row-level import reporting. Rulesets and map presets are intentionally still draft-time follow-up work.

## Mobile Shell

The Expo mobile shell lives in [apps/mobile/README.md](/Users/vojtechponrt/Documents/Jet%20Lag%20The%20Game/apps/mobile/README.md).

For the first local run from the repository root, use the npm workspace commands:

```bash
npm install
npm run mobile:test:smoke
npm run mobile:start
```

Additional helpers:

```bash
npm run mobile:typecheck
npm run mobile:ios
npm run mobile:android
npm run mobile:web
```

To enable the real Supabase-backed online path instead of the in-memory fallback, copy [apps/mobile/.env.example](/Users/vojtechponrt/Documents/Jet%20Lag%20The%20Game/apps/mobile/.env.example) and set:

- `EXPO_PUBLIC_ONLINE_PROJECT_URL`
- `EXPO_PUBLIC_ONLINE_ANON_KEY`
- `EXPO_PUBLIC_ONLINE_ATTACHMENT_BUCKET`

Without those env vars, the app keeps using the honest mocked online fallback.

The current workspace metadata also includes `pnpm-workspace.yaml`, but the checked-in scripts and README steps are currently written around npm workspaces for the first runnable mobile pass.

## Notes

- All code, comments, docs, and UI text should be in English.
- Hidden information must be handled securely.
- Core game logic should be authoritative and testable.
- Content should be versioned and importable.
