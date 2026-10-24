# Jet Lag The Game

## Overview

Cross-platform mobile app and rules engine for running a configurable transit-based hide-and-seek game on iOS and Android.

## What it does

- Model game domain rules, transport, geo, and content schemas.
- Run an Expo mobile client.
- Import Jet Lag-style content.
- Provide engine, geo, transport, shared types, and test-kit packages.
- Play locally as a referee through a game-first UI for Home, lobby, map, clues, cards, and team radio.
- Plan maps with OpenStreetMap street context, transit-station hiding zones, saved local scenarios, and compressed share links; the web map supports drag and pinch zoom.

## User workflows

- Import game content, run the mobile app, configure a game, and validate engine/geo behavior with tests.
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

## Troubleshooting

- If mobile fails, check Expo env flags and package install.
- If rules behave oddly, run focused engine/domain tests before editing app UI.

## Documentation maintenance

Update this README whenever functionality, setup, commands, environment variables, storage, integrations, or user workflows change. Follow the CoS project documentation standard in `../../../docs/project-documentation-standard.md` or `../../docs/project-documentation-standard.md` depending on the project depth. Never include real secret values.
