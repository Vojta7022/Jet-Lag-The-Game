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

### Base Home Game Rules

- Official base Hide + Seek rules use 500 m hiding-zone radii for small and medium games, and 1 km for large games; a prior playthrough summary's 400 m value is not the base-rule value. [source: local scan `~/Downloads/2026-10-04 10-19.pdf`, checked 2026-10-21]
- The printed investigation booklet has six categories and scale-specific question availability. The generated workbook pack currently has 81 templates while the rulebook quickstart says 80 questions; reconcile the source rows before calling the pack complete. [source: local scan `~/Downloads/2026-10-04 10-56.pdf`; `samples/generated/jet-lag-the-game.content-pack.json`, checked 2026-10-21]
- The current app has real first-pass map, question, card, chat/evidence, movement, and match-engine flows, but its nearby adapter has no LAN transport and its online client has no trusted server-side command gateway. [source: repository inspection, 2026-10-21]
- Single-device referee is the chosen first playable target and has a direct Home entry point. Event logs, latest snapshots, and the active host session pointer now persist through AsyncStorage; the separate protected-reveal manager is not yet connected to the mobile UI and remains process-local. [source: implementation, 2026-10-23]
- Player-facing screens now use the approved Transit Field Kit: paper/ink/signal colors, route-stop navigation, an illustrated launch screen, named Hider/Seeker spaces, and focused clue/card/chat surfaces. [source: `knowledge/game-ui-redesign-research.md`, validated 2026-10-23]
- Host authority comes from host-admin scope, not the player's assigned Hider/Seeker role; UI gating should preserve referee controls when the host also plays a team member. [source: `apps/mobile/tests/player-flow.test.ts`, 2026-10-23]
- See [current-state-and-rulebook-research.md](knowledge/current-state-and-rulebook-research.md) for the full assessment and staged completion plan.
