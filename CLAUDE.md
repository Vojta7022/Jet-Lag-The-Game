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
- The printed investigation booklet has six categories and 80 base-game question prompts with scale-specific availability. The workbook's extra 4th Admin (Borough) Measuring row is excluded from the generated base pack and reported as an informational source discrepancy; the 4th Admin Matching prompt remains. [source: local scan `~/Downloads/2026-10-04-10-56.pdf`; `packages/content-import/src/mapping-profiles/jet-lag-workbook.ts`, checked 2026-10-24]
- The current app has real first-pass map, question, card, chat/evidence, movement, and match-engine flows, but its nearby adapter has no LAN transport and its online client has no trusted server-side command gateway. [source: repository inspection, 2026-10-21]
- The single-device referee is implemented as a fallback and has a direct Home entry point; its complete round is covered by a real-runtime integration test. On 2026-10-24 the product owner clarified that the intended primary game is online with one phone per player, so the referee mode is not a substitute for the required multiplayer authority. [source: `apps/mobile/tests/single-device-round-flow.test.ts`; product-owner clarification, 2026-10-24]
- Player-facing screens now use the approved Transit Field Kit: paper/ink/signal colors, route-stop navigation, an illustrated launch screen, named Hider/Seeker spaces, and focused clue/card/chat surfaces. [source: `knowledge/game-ui-redesign-research.md`, validated 2026-10-23]
- Host authority comes from host-admin scope, not the player's assigned Hider/Seeker role; UI gating should preserve referee controls when the host also plays a team member. [source: `apps/mobile/tests/player-flow.test.ts`, 2026-10-23]
- A player's role assignment must be reflected by exactly one team membership. The reducer removes the player from their old team's member list before adding the new assignment, which is required for round rotation. [source: `tests/engine/gameplay-rules.test.ts`, checked 2026-10-24]
- Match start records a randomized order for the remaining seeker players; the initial hider is still selected in role setup. Round start events persist the next hider, shuffled deck, reset round state, and the previous found coordinates for map continuity. [source: `tests/engine/round-rotation.test.ts`, checked 2026-10-24]
- Time bonus cards cannot be played in the base rules. Their scale-adjusted values count toward final hiding time only while still held when the hider is found; discarded bonuses do not count. The score keeps elapsed survival and bonus value separate. [source: local scan `~/Downloads/2026-10-04 10-19.pdf`, pp. 5–6; `tests/engine/hiding-zone.test.ts`, checked 2026-10-24]
- If a hider misses a question's response deadline, scored hiding time pauses at the exact deadline and resumes when the answer arrives; a late answer earns no cards. The deadline is 5 minutes for ordinary questions, and 10/20 minutes for Photo questions by scale. [source: local scan `~/Downloads/2026-10-04 10-19.pdf`, p. 5; `tests/engine/endgame-questions.test.ts`, checked 2026-10-24]
- The “Draw 1, Expand 1” power-up draws one card and permanently raises the hider team's hand limit for the rest of that round; the effect can be stacked. The authority applies it immediately without disrupting an open answer window, projects the limit only to hiders/referee, and resets it when the next round starts. [source: local scan `~/Downloads/2026-10-04 10-19.pdf`, p. 46; `tests/engine/cards.test.ts`, checked 2026-10-24]
- Veto ends the current response without an answer or card reward but counts toward repeat cost; Randomize cancels the original and starts a same-category unasked replacement, leaving the original eligible at its former cost. A randomized null answer is allowed, resolves without map geometry, and still counts for the hider reward. Both effects are typed authoritative pack data and use public question lifecycle events. [source: local scan `~/Downloads/2026-10-04 10-19.pdf`, p. 46; `tests/engine/cards.test.ts`, 2026-10-24]
- Discard 1 Draw 2 and Discard 2 Draw 3 import as typed authoritative effects; the engine enforces the printed discard count before dealing replacements. [source: local scan `~/Downloads/2026-10-04 10-19.pdf`, p. 46; `tests/engine/gameplay-rules.test.ts`, checked 2026-10-24]
- Each Duplicate still in the hider's hand at capture copies the largest time bonus still held, adding that value again to final hiding time. In-round, hiders select another card; typed supported power-up effects resolve through the authority, while manual challenges display the copied card privately. [source: local scan `~/Downloads/2026-10-04 10-19.pdf`, pp. 25–26; `tests/engine/cards.test.ts` and `tests/engine/hiding-zone.test.ts`, checked 2026-10-24]
- The Investigation Book prints Thermometer thresholds of 1 km and 5 km for all scales, 15 km for medium/large, and 75 km for large; valid answers are only hotter/colder. Workbook conversions (805 m, 4.8 km, 16 km, 80 km) and its `same` answer are corrected in the base pack. The authority needs fresh fixes, proven minimum travel, and a confident change in distance; it uses the same frozen seeker endpoints to answer and clip the map. [source: Investigation Book scan p. 3, base rulebook scan p. 17; `tests/engine/automatic-question-answer.test.ts`, 2026-10-24]
- The foreign-consulate Matching and Measuring subject maps to OSM features tagged `office=diplomatic` and `diplomatic=consulate`; embassies and liaison offices must remain separate classes. [source: OpenStreetMap Wiki, https://wiki.openstreetmap.org/wiki/Tag:office=diplomatic; `tests/geo/openstreetmap-feature-provider.test.ts`, 2026-10-24]
- Measuring has only two valid answers, closer and further; `same` was an importer/schema mismatch and is now rejected by the standard pack and engine validation. [source: base rulebook scan pp. 22–23; `tests/engine/gameplay-rules.test.ts` and `tests/importer/importer.test.ts`, checked 2026-10-24]
- Printed investigation questions remain available by scale; “Draw N, Pick M” is the hider's answer reward and repeated questions repeat that reward set. The selected hiding zone is persisted privately; hider arrival is required before seeking, and location updates are bounded to the zone during seeking. Endgame trigger, fixed spot/found, scoring, and multi-round rotation are implemented. The approved primary product is online with one phone per player. Hiders publish private GPS fixes and see seeker tracks; seekers never receive hider coordinates. Radar, Thermometer, and Tentacles (for supported OSM feature classes) now answer automatically from fresh seeker/hider fixes and apply map deductions from the same feature snapshot; Matching and Measuring, including station-name-length, are automatic for supported OSM classes. Administrative-boundary Matching, metro-line Tentacles, Photos, background GPS, production authority deployment/security review, and physical-device field validation remain open. [source: rulebook scan pp. 36–37; `tests/engine/automatic-question-answer.test.ts`; `tests/engine/location.test.ts`; product-owner clarification, 2026-10-24]
- See [current-state-and-rulebook-research.md](knowledge/current-state-and-rulebook-research.md) for the full assessment and staged completion plan.
