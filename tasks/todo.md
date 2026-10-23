# Jet Lag The Game — Current Task

## Research: assess current app and recommend completion plan

- [x] Inspect repository, current implementation, docs, and test inventory.
- [x] Identify the two October 4 scans and OCR them locally.
- [x] Inspect the supplied map site and its MIT-licensed source repository.
- [x] Compare imported content with the booklet and base rules.
- [x] Record current-state findings and staged completion plan.
- [x] Choose the first target play mode: single-device referee.
- [ ] Decide the content-pack distribution approach.
- [x] Make referee mode a first-class Home-screen start path and clarify its setup instructions.
- [x] Add durable event/snapshot storage and automatic referee-session reattachment after app restart.
- [ ] Connect protected reveal handoffs to the mobile UI and persist their state across restart.
- [ ] Complete a full round walkthrough and close remaining rules/content gaps.

## UI: make the player experience feel like a game

- [x] Audit the current shared layout, reusable controls, navigation, and player-facing screens.
- [x] Research game UI references and document a product-specific visual direction.
- [x] Owner approves the Transit Field Kit direction and implementation.
- [x] Record the visual system and concise implementation plan.
- [x] Redesign Home, lobby, and live-map navigation/action hierarchy while preserving game behavior.
- [x] Extend the visual system to question, card, chat, and supporting screens.
- [x] Review the result at phone and desktop widths and exercise the key single-device referee path.

## Review

- The project has a broad functional foundation; its phased plan and some package READMEs are out of date.
- The first material gap is a tested, reliable end-to-end play path. Nearby mode has no LAN transport; online mode has no trusted server-side command gateway.
- The generated workbook pack has 81 question templates and 125 card instances, but remains draft output with 21 warnings, no ruleset, and no map preset.
- Exact scan files remain in Downloads. They were not copied into or committed to the public project repository.
- The initial research pass did not run the app or test suite; later web-bundle and typecheck checks were run during implementation.
- Implementation direction: single-device referee is the first playable target because its authority, map, and gameplay flows already exist in-process.
- Home now starts referee setup directly; online create/join remain available as secondary paths.
- Referee event logs and latest snapshots now use persistent AsyncStorage, and the app stores a resume pointer/profile and reconnects to the recovered host session at startup. Home then offers the existing Continue action.
- Protected reveal handoffs are still not connected to app UI; that manager remains process-local. A full round walkthrough and rules/content reconciliation remain open.
- The current UI's repeated admin-style header/panel/banner hierarchy and the proposed game-first direction are documented in `knowledge/game-ui-redesign-research.md`.
- The Transit Field Kit is now implemented: warm timetable paper, route-ink navy, signal yellow and orange, compact station navigation, illustrated Home, named team spaces, larger bounded map, and redesigned clue/card/chat surfaces. Browser screenshots are in `deliverables/ui-preview/`.
- Browser review at 1440px desktop and 390px/320px phone widths found no horizontal overflow. A local referee game was resumed, a crew member added, the Prague boundary selected, the match started, and a six-card hand drawn. The roster and city returned after a browser reconnect.
- Web `accessible={false}` SVG props caused the reported React warning; decorative game SVGs now use `aria-hidden={true}`. Measured map width also prevents the map surface from extending beyond its card.
- Existing full suite passes 159/159 after decoupling the orchestrator's default in-memory persistence from native AsyncStorage and explicitly injecting AsyncStorage in the app provider. TypeScript typecheck passes.
- Remaining playability gaps at the time of the UI review: imported draft content reconciliation, protected reveal handoffs, and street tiles for the web map. Timer authority was fixed in a later slice; endgame and remaining rules work is tracked below.

## Active: rules-faithful game and reference-map workflows

- [x] OCR the scanned base rulebook and Investigation Book locally; inspect the reference map implementation.
- [x] Replace the incorrect randomized question draw with the printed investigation-book question list and repeat-cost rules.
- [x] Make the default referee ruleset use official scale timers and location rules; remove the invented answer cooldown.
- [x] Fix timer authority and pause/resume accounting so synced projections cannot reset a live clock.
- [x] Add an OpenStreetMap transit-station layer and scale-correct hiding-zone analysis/selection to map setup and live play.
- [x] Persist the selected station-centered hiding zone in authoritative match state, keep it private from seekers, and validate the full zone inside the playable boundary.
- [x] Require the hider to select a zone and confirm arrival at its station; advance into seek phase after the hide timer expires and both are confirmed.
- [x] Enforce hider location updates within the selected zone during seek phase and freeze movement in endgame.
- [x] Start endgame when seekers report an in-zone, off-transit position; record the fixed hiding spot, visual-plus-2m found confirmation, and survival time.
- [x] Add rule-faithful capture scoring: held time-bonus cards add their scale value to final hiding time; discarded cards do not count and time bonuses cannot be played.
- [x] Keep player team membership consistent when the referee reassigns someone between sides, as required for hider rotation.
- [ ] Complete multi-round rotation: select the next hider, reshuffle/deal the deck, allow up to 10 minutes of preparation, and start the next round from the previous spot.
- [x] Allow Investigation Book questions during endgame, preserve the endgame lifecycle through resolution, and support impossible photo challenges from the fixed spot.
- [ ] Port the map workbench's useful save/load/share and overlay workflows into the existing match/map architecture.
- [ ] Walk and test a full local referee round through endgame, found, and round scoring; reconcile any remaining scan discrepancies.

### Findings for this pass

- The Investigation Book's “Draw N, Pick M” is the hider's card reward after an answer. A prior build incorrectly used those numbers to deal a random subset of available questions; the current flow shows all scale-allowed printed questions and repeats their reward separately.
- A prior app-injected ruleset used a 120-second hide phase and 45-second post-answer cooldown. These were replaced with the scanned 30/60/180-minute hide periods by scale and no extra answer cooldown.
- The scan sets hiding-zone radii to 500 m for small/medium and 1 km for large, endgame when seekers enter the zone and disembark transit, and found when they have both spotted the hider and come within 2 m.
- The reference app can find/plot eligible stations, visualize each station's hiding-zone circle, customize station sources, and save/load/share a map scenario. This app now searches/selects stations and persists the chosen round zone; reusable scenario save/load/share remains open.
- Station search uses bounded Overpass requests, filters returned candidates back against the selected polygon (including polygon holes), and renders selectable station markers with a geodesic 500 m/1 km preview. The chosen station is persisted in authoritative round state.
- The hider can set the round's station-centered zone during hide phase. The engine derives its 500 m/1 km radius from the selected ruleset, checks sampled interior/circumference points so the full circle fits in the map, persists it in match events, and projects it only to the hider and referee. Engine station identity still comes from the client-selected OSM result.
- The hider now marks a final pin during seek phase and explicitly attests that it is publicly accessible and within 3 m of a marked path. An off-transit seeker location report inside the zone starts endgame and freezes that pin. The pin is not sent in the public endgame event or seeker projection. Found requires a seeker/referee confirmation, visual identification, and coordinates within 2 m; the match records a survival-time result and displays it on the live map. Mobile actions capture a one-time GPS fix only after the player taps; continuous sharing is not used for the hider.
- Endgame currently completes a scored round. Captured-round score now includes real survival time plus scale-adjusted time bonuses still held; next-hider rotation, deck reset, and the 10-minute preparation flow remain open. The OSM-selected station itself is not independently verified by the engine.
- Running timers now carry original start/duration anchors into visible projections; injected mobile commands use the real wall clock; pause records current remaining time and resume shifts the anchor to preserve it. Timer and rules flows have focused passing coverage.
- Full verification now passes: `env PATH="$PWD/.venv/bin:$PATH" pnpm test` (184 tests), `pnpm mobile:typecheck`, and `git diff --check`. The project virtual environment provides the importer dependency `openpyxl`.

### Review — 2026-10-24

- Endgame trigger, private fixed final spot, found confirmation, survival-time scoring, and mobile field controls are implemented and covered by engine tests.
- Seeker projection privacy was checked after endgame starts; final coordinates remain hidden, while the hider and referee retain the pin.
- Endgame clue prompts, hider answers, map resolution, and card draws remain in endgame. The “impossible photo” answer only bypasses evidence requirements for photo challenges during endgame.
- Engine and mobile map-flow coverage verifies that endgame questions resolve without returning to seeking and the hider can draw the printed reward after an impossible photo answer.
- Time bonuses now match the base rulebook: they cannot be played, and only cards still in the hider's hand at capture add their scale-specific value to final hiding time. The scorecard shows this final total while preserving actual survival time and bonus time as separate result fields.
- Role reassignment now removes the player from their former team membership before adding the new assignment; a regression test exposed the previous duplicate-team membership.
- Multi-round rotation remains open; no full UI round walkthrough has been performed yet.
