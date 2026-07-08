# PERS_Jet-Lag-The-Game

Cross-platform mobile app and rules engine for running a configurable transit-based hide-and-seek game on iOS and Android.

## Metadata
- **Category:** personal
- **Status:** active
- **Type:** code
- **Created:** 2026-04-10

## Purpose

Cross-platform mobile app and rules engine for running a configurable transit-based hide-and-seek game on iOS and Android.

## Inputs Processing

On session start:
1. Scan `inputs/` for files not listed in `inputs/.processed.md` when the project has an `inputs/` directory.
2. For each new file: extract content, create `knowledge/<filename-slug>.md`.
3. Log in `inputs/.processed.md` with timestamp.
4. Update `knowledge/README.md` navigation map.

If processing fails for any file, log as `(failed: reason)` and continue.

## Documentation Maintenance

Keep `README.md` current with user-visible functionality, setup, commands, configuration, storage, integrations, and troubleshooting. Never document real secret values.

## Domain Learnings

<!-- Append durable findings here as they are discovered. -->
