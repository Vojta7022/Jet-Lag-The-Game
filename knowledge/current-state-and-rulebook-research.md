# Jet Lag Hide + Seek App: Current State and Rulebook Research

Research date: 2026-10-21; implementation update: 2026-10-23

## Project state

The repository is a substantial Expo/TypeScript monorepo, not an empty scaffold. It has a mobile client, content importer, schemas, command/event engine, state machine, geometry package, role-scoped projections, transport adapters, Supabase migrations, and a meaningful unit-test suite. The project-local README documents a map, question, cards, chat/evidence, movement, admin, lobby, and match setup flows.

Important implementation boundaries:

- **Map and game engine:** Real first-pass flows exist. The native map supports searched/bundled playable regions, bounded map overlays, candidate search areas, and seeker movement tracks. Question and card screens call engine commands.
- **Single-device referee:** An adapter and reveal flow exist. Persistence and complete real-play ergonomics still need an end-to-end pass.
- **Online:** Supabase-backed persistence, snapshots, projections, polling sync, anonymous auth, and attachment storage exist. Commands still execute from the mobile client. The dev migration grants broad anon/authenticated table access, so this is a development foundation, not a trusted online game service.
- **Nearby:** Host/guest contracts, runtime, heartbeat, and in-memory session handling exist. There is no LAN device transport or discovery, so two phones cannot yet join through this mode.
- **Platform gaps:** Background location and production provider/backend hardening are deferred. The web map uses a bounded fallback rather than the native tile map.

The workspace currently includes 286 TypeScript/TSX source files excluding the reference clone, 27 root test files, and 24 mobile test files. These counts are inventory only; tests and app startup were not run during this research pass.

Several documents are stale against the code. `docs/phased-plan.md` still schedules foundational packages and the Expo shell as future phases, while those now exist. The `packages/domain`, `packages/engine`, and `packages/geo` READMEs still call their packages placeholders. The app README is the most useful current capability summary, but it also states that no device launch was performed in its last validation.

## Imported content and scanned books

The existing generated workbook pack contains:

- six categories: Matching, Measuring, Thermometer, Radar, Tentacles, and Photos
- 81 templates: 20, 21, 4, 10, 8, and 18 respectively
- 37 card definitions representing 125 deck cards
- 21 warning-level import issues and a `draft_output` status
- no ruleset definitions and no map presets in the generated pack

Warnings include incomplete power-up descriptions, manual/ambiguous templates, normalization notices, and missing ruleset/map-preset metadata. The workbook does not supply all the explanatory and timing detail present in the scanned books. The mobile card helper currently supplies generic summaries for several power-ups, so the scanned rule text should be reconciled into data and resolution policies before treating this pack as complete.

The two local scans in Downloads were identified by metadata and read with on-device OCR:

- `2026-10-04 10-19.pdf`: 34 scanned sheets containing the base rulebook (including setup, seeking, hiding, deck rules, and experimental variants).
- `2026-10-04-10-56.pdf`: 5 scanned pages of the Investigation Booklet, including all six categories, question options, card draw costs, and scale availability.

The base rulebook sets small/medium hiding zones to a 500 m radius and large zones to 1 km. A prior personal playthrough note mentioned 400 m; use the scanned rulebook for the official home-game value. Other rules that need explicit modeling include scale-based hide periods (30/60/180 minutes), question response windows (5 minutes; photo windows 10 minutes for small/medium and 20 for large), the one-open-question rule, repeated-question costs, card hand limits, pause behavior, endgame entry and stationary hiding, and the 2 m plus visual-confirmation found condition. Some decisions, such as whether a location answer can change while the hider moves, require a precise event-time policy rather than a map polygon alone.

The scanned base book includes experimental play variants. Keep those distinct from the standard ruleset. The official site also publishes Expansion Pack Vol. 1 as a separate set of reference rules, so expansions should be versioned content rather than silently mixed into the base pack.

## Reference map: taibeled/JetLagHideAndSeek

The supplied site is the GitHub Pages build of [taibeled/JetLagHideAndSeek](https://github.com/taibeled/JetLagHideAndSeek), an MIT-licensed browser map workbench. Its code was cloned to the ignored project `repos/` directory for inspection. The repository README and implementation show:

- place search and preset/custom polygon map boundaries, including add/subtract areas
- editable spatial questions for Radius, Thermometer, Matching, Measuring, and Tentacles
- a hider mode that answers based on a hidden point and renders candidate areas
- hiding-zone/station overlays, custom transit stations, station filtering, and GeoJSON overlays
- local persistence, JSON file save/load, compressed URL sharing, and custom question presets
- tutorial and map options panels

It is a map and deduction workbench, not a multiplayer game runtime: it does not provide the app's team lobby, role-scoped event sync, timers, card/deck lifecycle, chat, or match authority. It is useful as a behavior and interaction reference. Adapt its map workflow and question-result behavior to the existing native map/constraint architecture; avoid building a second separate map product or copying its browser-specific UI wholesale.

## Recommended finish strategy

Make the app runnable first, then choose one supported play mode and complete a real end-to-end round in that mode before expanding scope. The quickest credible first-play target is a persisted single-device referee flow; it exercises the current engine and map without pretending the current online or nearby authority is production-safe. If separate phones are essential from day one, choose online mode and make the server-side command/projection boundary the first major milestone. Nearby multiplayer needs actual LAN networking and should be a separate milestone.

Suggested sequence:

1. Install from the checked-in npm workspace and start the selected app target. Record actual launch/build issues and fix only blockers needed for a reproducible developer start.
2. Reconcile the scanned booklet and rulebook against the generated pack. Add explicit base ruleset, scale policy, card timing/effect requirements, and all question costs/timers/availability. Keep manual/referee adjudication where geography, photos, or real-world judgement cannot be inferred reliably.
3. Complete one match loop on the selected mode: create, assign roles, configure and apply a bounded map, hide, ask/answer a question, resolve map effects/cards/timers, enter endgame, mark the find, rotate hider, and calculate the round result.
4. Port the useful reference-map interactions into the existing map: custom/add/subtract regions, import/export/share of a scenario, hiding station zones, question overlays, and clear exact/approximate/manual result labels.
5. Run the focused test suite and device/simulator validation after feature work, then evaluate online security, background location/battery, crash recovery, and release packaging for the chosen mode.

## Decisions and next steps

The first target is now **single-device referee**. Home has a direct “Start Referee Game” action that selects this runtime and opens match setup; online create/join remain available as secondary paths. A fresh Expo web bundle succeeds with this entry path.

The mode is not yet reload-safe. The authority, reveal manager, and app-shell connection live in process memory, so closing or reloading the app loses the active session. Add durable save/resume, then walk a complete round from setup through found/round result. The content-pack distribution/licensing decision remains open; do not add the scans or a full-text transcription to the public repository until that is settled.

Remaining product decision: whether the project should stay a generic reusable rules engine or prioritize a personal Jet Lag Home Game ruleset.

## Sources

- Local scans read for this research: `~/Downloads/2026-10-04 10-19.pdf` and `~/Downloads/2026-10-04-10-56.pdf` (scanned 2026-10-04; checked 2026-10-21).
- App source: `projects/personal/PERS_Jet-Lag-The-Game` at local `master` commit `5a93af4` (2026-10-21).
- Implementation update: `projects/personal/PERS_Jet-Lag-The-Game` commit `a0a8cda` (2026-10-23).
- Map reference source: [taibeled/JetLagHideAndSeek](https://github.com/taibeled/JetLagHideAndSeek), local inspected revision `179eb0f` (2026-08-28), MIT license.
- Official [Hide + Seek Expansion Pack Vol. 1 additional reference rules](https://rules.jetlagthegame.com/expansion/) (checked 2026-10-21).
