# Jet Lag The Game

## Overview

Cross-platform mobile app and rules engine for running a configurable transit-based hide-and-seek game on iOS and Android.

## What it does

- Model game domain rules, transport, geo, and content schemas.
- Run an Expo mobile client.
- Import Jet Lag-style content.
- Provide engine, geo, transport, shared types, and test-kit packages.
- Join an online game on a personal phone with role-scoped Hider/Seeker views; the single-device referee is a fallback and regression path.
- Resolve Radar, Thermometer, mapped Matching/Measuring/Tentacles, including administrative-division Matching and border Measuring, consulates, and station-name-length Matching, from fresh location samples and authority-loaded OpenStreetMap data; unsupported classes and photo evidence retain manual handling.
- Importer and engine handle the scanned Discard 1 Draw 2 and Discard 2 Draw 3 power-ups from typed effect data, including paying the discard cost before drawing replacements.
- At capture, each Duplicate still in the hider hand copies the largest held time bonus for scoring. During play, hiders can select another card to copy; supported power-up effects resolve in the engine and manual challenges retain their copied-card instructions.
- Enforce question response deadlines; an overdue response pauses scored hiding time until answered and earns no hider card reward.
- Resolve Curse of the Drained Brain in-app: the hider selects three exact question prompts from different categories, seekers see the locks, and the engine blocks only those prompts until hider rotation.
- Resolve Curse of the Overflowing Chalice in-app: the hider can draw one extra card for each of their next three clue rewards, without increasing the number kept.
- Resolve Curse of the Hidden Hangman in-app: the hider privately sets a real five-letter word, seekers make public letter guesses with masked progress, and the hider reveals the word only after the group’s Hangman game ends; the card lock stays active until solved or ended.
- Enforce Curse of the Bridge Troll: the host confirms map bridge availability, maps without bridges exclude the card for every round, and every seeker marks their own under-bridge status before the next question. The engine blocks the question until the whole seeker team is marked.
- Enforce Curse of the Urban Explorer: each seeker reports from their own phone whether they are on transit or on/inside a station platform/building. The engine blocks every question until every seeker confirms they are clear; the restriction lasts for the hider’s run.
- Build playable map boundaries by combining searchable administrative regions and subtracting other administrative regions with polygon clipping, including cuts that cross the selected boundary or span overlapping included regions. Save scenarios locally, import/export versioned JSON files, or share compressed links. Scenarios preserve the boundary, excluded areas, bridge availability, selected station, hiding radius, custom GeoJSON layers, and custom station lists. The map workbench supports OSM/custom/both station sources, CSV/GeoJSON/KML station imports, custom station editing, and layer visibility/color/name controls. The host applies map settings through match authority, which distributes them to every player projection; the web map supports drag and pinch zoom.

## User workflows

- Import game content, run the mobile app, configure a game, and validate engine/geo behavior with tests.
- During match setup, import a validated content-pack JSON file (up to 5 MB). Imported packs are saved on that device and appear in the rules/question-set selector. Pack versions are immutable: publish changed content under a new version. Every player joining online must have the exact selected pack ID and version installed locally; pack files are not distributed by the server yet.
- Use package-level READMEs for deeper module notes.

## Stack

- pnpm/npm monorepo with TypeScript packages.
- Expo React Native mobile app.
- Domain/engine/geo/transport packages.
- Test-kit package and smoke tests.

## Project structure

- `apps/mobile/` - mobile app.
- `packages/domain/` - domain model.
- `packages/engine/` - game engine.
- `packages/geo/` - geographic helpers.
- `packages/transport/` - transport abstractions.
- `packages/content-*` - content schema/import.

## Setup

- Run `npm install` or the package manager already used by the lockfile.
- Run mobile start command from the root.

## Common commands

- `npm run import:jetlag` - import content.
- `npm run mobile:start` - start Expo.
- `npm run mobile:ios` / `npm run mobile:android` / `npm run mobile:web` - platform runs.
- `npm run test` - all tests.
- `npm run test:engine`, `test:geo`, `test:transport`, `test:mobile` - focused tests.
- `npm run mobile:typecheck` - mobile TypeScript check.

The full test suite also uses Python `openpyxl` for workbook importer tests. Create a local environment once with `python3 -m venv .venv`, then install `requirements-dev.txt` into it and run tests with `.venv/bin` at the front of `PATH`.

## Configuration and secrets

- Mobile runtime flags live in app env files. Public Expo variables are not secret, but still document names only.

## Data, storage, and integrations

- Content packages define/import game content. Runtime online mode may use configured backend/public project variables.
- Automatic regional question features use OpenStreetMap data through Overpass and currently run as prototype authority integration; live production deployment, public-service reliability, and real-device cellular field play are not yet verified.

## Troubleshooting

- If mobile fails, check Expo env flags and package install.
- If rules behave oddly, run focused engine/domain tests before editing app UI.

## Documentation maintenance

Update this README whenever functionality, setup, commands, environment variables, storage, integrations, or user workflows change. Follow the CoS project documentation standard in `../../../docs/project-documentation-standard.md` or `../../docs/project-documentation-standard.md` depending on the project depth. Never include real secret values.
