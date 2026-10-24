# Jet Lag The Game — Current Task

## Research: assess current app and recommend completion plan

- [x] Inspect repository, current implementation, docs, and test inventory.
- [x] Identify the two October 4 scans and OCR them locally.
- [x] Inspect the supplied map site and its MIT-licensed source repository.
- [x] Compare imported content with the booklet and base rules.
- [x] Record current-state findings and staged completion plan.
- [x] Choose the first implementation play mode: single-device referee (delivered as a fallback/regression path; superseded as the primary product mode by the 2026-10-24 online multiplayer requirement).
- [x] Decide the content-pack distribution approach: treat the current pack as personal/private-use content; keep the scans and full-page transcription local, and review source rights before any public content-pack release.
- [x] Make referee mode a first-class Home-screen start path and clarify its setup instructions.
- [x] Add durable event/snapshot storage and automatic referee-session reattachment after app restart.
- [x] Connect protected reveal handoffs to the mobile UI and persist their state across restart.
- [x] Verify a complete referee round through the real single-device runtime with rule-timed hide, endgame, found confirmation, and scoring.
- [ ] Run a physical-device/GPS walkthrough. No iOS simulator (`simctl`/Xcode) or Android emulator/ADB is installed, and no phone is connected; the browser and real-runtime integration paths are verified instead.

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
- The main remaining gap is a tested, reliable multi-phone end-to-end play path. An authenticated Edge Function gateway and atomic revision commit now exist with unit coverage; production deployment, authorization/privacy audit, and cellular field play still need verification. Nearby mode has no LAN transport.
- The regenerated base-game pack has six question categories and 80 printed Investigation Book question templates, 37 card definitions / 125 card instances, and 21 importer warnings. It remains draft content with no ruleset or map preset; card warnings still need adjudication.
- Exact scan files remain in Downloads. They were not copied into or committed to the public project repository.
- The initial research pass did not run the app or test suite; later web-bundle and typecheck checks were run during implementation.
- Implementation direction: single-device referee is the first playable target because its authority, map, and gameplay flows already exist in-process.
- Home now starts referee setup directly; online create/join remain available as secondary paths.
- Referee event logs and latest snapshots now use persistent AsyncStorage, and the app stores a resume pointer/profile and reconnects to the recovered host session at startup. Home then offers the existing Continue action.
- At the initial UI review, protected reveal handoffs were not connected to app UI and their manager was process-local. The referee handoff panel is now part of live map play, and token/checkpoint state survives restarts. A controlled full-round runtime walkthrough passes.
- The current UI's repeated admin-style header/panel/banner hierarchy and the proposed game-first direction are documented in `knowledge/game-ui-redesign-research.md`.
- The Transit Field Kit is now implemented: warm timetable paper, route-ink navy, signal yellow and orange, compact station navigation, illustrated Home, named team spaces, larger bounded map, and redesigned clue/card/chat surfaces. Browser screenshots are in `deliverables/ui-preview/`.
- Browser review at 1440px desktop and 390px/320px phone widths found no horizontal overflow. A local referee game was resumed, a crew member added, the Prague boundary selected, the match started, and a six-card hand drawn. The roster and city returned after a browser reconnect.
- Web `accessible={false}` SVG props caused the reported React warning; decorative game SVGs now use `aria-hidden={true}`. Measured map width also prevents the map surface from extending beyond its card.
- At the start of the online multiplayer phase the full suite passes 237/237 with the project `.venv` on `PATH`; mobile TypeScript typecheck passes.
- The scan-confirmed standard round flow is implemented. Imported workbook card text remains draft and may need manual adjudication; it is kept for personal/private play until distribution rights and importer warnings are reviewed.
- Reconciled the workbook's extra “4th Admin (Borough)” Measuring row against the scanned Investigation Book: it is not listed there, so the base-game importer now excludes it and reports the source discrepancy. The 4th Admin Matching prompt remains. The regenerated pack has 80 templates and the full importer report records 21 warnings plus one informational exclusion.

## Active: online multiplayer for one phone per player

- [x] Capture the product requirements for role-specific devices, hider-visible seeker locations, automatic location-based answers, in-app card rewards, searchable administrative regions, and future versioned content packs.
- [x] Draft and push the approved server-authoritative design and acceptance criteria in `docs/superpowers/specs/2026-10-24-online-player-game-design.md`.
- [x] Product owner approves the written design and implementation choices (2026-10-24).
- [x] Write the phased implementation plan.
- [x] Build and test the authenticated Edge Function gateway, atomic revision commits, separate authenticated phone adapters, and reconnect bindings in the prototype authority.
- [x] Give each hider/seeker device location publishing; hiders receive live seeker tracks while seeker projections exclude hider coordinates.
- [x] Automatically resolve Radar from fresh seeker and hider GPS fixes, apply the bounded map deduction, and record fix provenance in the same authority command.
- [ ] Deploy and security-audit the online authority; verify it on real devices over cellular data.
- [ ] Add automatic/assisted resolvers for the remaining Investigation Book categories and verify each answer/map effect against the scanned rules.
- [ ] Reconcile and implement all standard card effects, including the remaining physical or manually adjudicated effects.
- [ ] Add foreground/background location behavior with clear freshness and permission status on both platforms.
- [ ] Add content-pack selection/validation for the standard game and a versioned extension path for future variants.
- [ ] Run a full mobile field round on multiple phones with native GPS and cellular connectivity.

## Active: rules-faithful game and reference-map workflows

- [x] OCR the scanned base rulebook and Investigation Book locally; inspect the reference map implementation.
- [x] Reconcile the workbook question inventory to the 80 prompts printed in the Investigation Book; report workbook-only rows and keep the printed 4th Admin Matching option.
- [x] Replace the incorrect randomized question draw with the printed investigation-book question list and repeat-cost rules.
- [x] Make the default referee ruleset use official scale timers and location rules; remove the invented answer cooldown.
- [x] Fix timer authority and pause/resume accounting so synced projections cannot reset a live clock.
- [x] Add an OpenStreetMap transit-station layer and scale-correct hiding-zone analysis/selection to map setup and live play.
- [x] Add street context to the web map fallback with bounded visible-tile loading and on-map attribution.
- [x] Persist the selected station-centered hiding zone in authoritative match state, keep it private from seekers, and validate the full zone inside the playable boundary.
- [x] Require the hider to select a zone and confirm arrival at its station; advance into seek phase after the hide timer expires and both are confirmed.
- [x] Enforce hider location updates within the selected zone during seek phase and freeze movement in endgame.
- [x] Start endgame when seekers report an in-zone, off-transit position; record the fixed hiding spot, visual-plus-2m found confirmation, and survival time.
- [x] Add rule-faithful capture scoring: held time-bonus cards add their scale value to final hiding time; discarded cards do not count and time bonuses cannot be played.
- [x] Keep player team membership consistent when the referee reassigns someone between sides, as required for hider rotation.
- [x] Add a multi-round handoff: randomize the remaining hider order at match start, enforce it between rounds, reshuffle the deck, allow up to 10 minutes to prepare, and start from the previous found spot.
- [x] Randomly choose the first hider before play and show final match standings after everyone completes a round.
- [x] Allow Investigation Book questions during endgame, preserve the endgame lifecycle through resolution, and support impossible photo challenges from the fixed spot.
- [x] Port the useful map scenario workflows into the match/map architecture: save and reload named local scenarios, share compressed deep links, open standalone scenario previews, restore region geometry and hiding-zone overlays, and pan/zoom/reset the web map.
- [x] Add a full single-device referee runtime walkthrough through hiding-zone selection, automatic timer expiry, endgame, found, and score.
- [x] Extend the scored single-device round walkthrough through a printed location question, authority-computed answer, and applied map deduction.
- [x] Add the question's exact draw/pick card reward to the engine, hider card screen, and scored single-device round.
- [ ] Walk the same path on a physical phone with GPS. The runtime integration covers the full round and the mobile web screen was rendered at 390 px; native GPS still needs an attached device or simulator.

### Findings for this pass

- The Investigation Book's “Draw N, Pick M” is the hider's card reward after an answer. A prior build incorrectly used those numbers to deal a random subset of available questions; the current flow shows all scale-allowed printed questions and repeats their reward separately.
- A prior app-injected ruleset used a 120-second hide phase and 45-second post-answer cooldown. These were replaced with the scanned 30/60/180-minute hide periods by scale and no extra answer cooldown.
- The scan sets hiding-zone radii to 500 m for small/medium and 1 km for large, endgame when seekers enter the zone and disembark transit, and found when they have both spotted the hider and come within 2 m.
- The reference app exposes Save File, Load File, Share, Tutorial, and Options alongside editable map layers and hiding-zone controls. This app now saves/loads named map scenarios in local storage, shares deflate-compressed app links, opens shared previews without a match, and restores play-area and station-radius overlays. The map canvas supports drag, pinch zoom, plus/minus zoom, and reset; native maps retain native pan/zoom. File-picker JSON import/export, custom station-source editing, and editable arbitrary map layers are not part of this implementation slice.
- Station search uses bounded Overpass requests, filters returned candidates back against the selected polygon (including polygon holes), and renders selectable station markers with a geodesic 500 m/1 km preview. The chosen station is persisted in authoritative round state.
- The hider can set the round's station-centered zone during hide phase. The engine derives its 500 m/1 km radius from the selected ruleset, checks sampled interior/circumference points so the full circle fits in the map, persists it in match events, and projects it only to the hider and referee. Engine station identity still comes from the client-selected OSM result.
- The hider now marks a final pin during seek phase and explicitly attests that it is publicly accessible and within 3 m of a marked path. An off-transit seeker location report inside the zone starts endgame and freezes that pin. The pin is not sent in the public endgame event or seeker projection. Found requires a seeker/referee confirmation, visual identification, and coordinates within 2 m; the match records a survival-time result and displays it on the live map. Mobile actions capture a one-time GPS fix only after the player taps; continuous sharing is not used for the hider.
- Endgame completes a scored round. Captured-round score includes real survival time plus scale-adjusted time bonuses still held. All registered participants are shuffled into a persisted hider order at match start, and roles update to match the first draw. Next rounds enforce that order, reset and shuffle cards, begin at the last found spot, and must start within 10 minutes. The final screen ranks each hider by final hiding time and names tied winners. The OSM-selected station itself is not independently verified by the engine.
- Running timers now carry original start/duration anchors into visible projections; injected mobile commands use the real wall clock; pause records current remaining time and resume shifts the anchor to preserve it. Timer and rules flows have focused passing coverage.
- Full verification now passes: `npm test` (237 tests), `npm run mobile:typecheck`, and `git diff --check`. The project virtual environment provides the importer dependency `openpyxl`.

### Review — 2026-10-24

- Endgame trigger, private fixed final spot, found confirmation, survival-time scoring, and mobile field controls are implemented and covered by engine tests.
- Seeker projection privacy was checked after endgame starts; final coordinates remain hidden, while the hider and referee retain the pin.
- Endgame clue prompts, hider answers, map resolution, and card draws remain in endgame. The “impossible photo” answer only bypasses evidence requirements for photo challenges during endgame.
- Engine and mobile map-flow coverage verifies that endgame questions resolve without returning to seeking and the hider can draw the printed reward after an impossible photo answer.
- Time bonuses now match the base rulebook: they cannot be played, and only cards still in the hider's hand at capture add their scale-specific value to final hiding time. The scorecard shows this final total while preserving actual survival time and bonus time as separate result fields.
- Role reassignment now removes the player from their former team membership before adding the new assignment; a regression test exposed the previous duplicate-team membership.
- Starting a match stores the shuffled remaining hider order and the first shuffled deck order in the authority event. Each round transition validates the predetermined next hider, preserves cumulative results, clears round-only clues and map constraints, resets/shuffles every card to its deck, and exposes the previous found spot on the map.
- The host can start the next round from the score screen, up to 10 minutes after capture. The chosen player becomes hider and the former hider joins seekers. The opening hider is now drawn randomly from all registered participants; each completed round records its hider for a final ranked leaderboard, including ties.
- The final score screen was covered by the round integration flow. Standard rule values and behaviors were checked against both scans; workbook card descriptions remain draft/reference material and require human adjudication where they do not map to an automated action.
- Single-device referee play now includes a private team handoff panel on the live map. The host arms a role-scoped reveal, the player explicitly opens it after receiving the device, and the view can be hidden on passback. Reveal tokens/checkpoints persist with local runtime storage; process recovery closes any previously open private projection before another player can take over. The underlying AsyncStorage store remains unencrypted.
- A resolved Radar question now uses fresh device fixes from the asking seeker and active hider, records the answer and source-fix provenance, then applies the answer's map deduction in the same authoritative command. Missing, stale, low-accuracy, or threshold-ambiguous fixes block resolution and request refreshed GPS. Hiders see the answer and current seeker tracks; seeker projections still omit hider movement.
- The real-runtime single-device referee test now runs a printed Radar question resolved from device fixes, the map deduction, and the printed Draw 2 Pick 1 reward before endgame. Scoring is checked against elapsed time from match start through found, with the rule-timed hide phase as a minimum.
- Resolved Investigation Book questions now deal the printed number of cards into a private hider selection pool; repeated questions create separate draw/pick sets. Hiders choose the printed number from each set, unchosen cards go to discard, the six-card hand limit is enforced, and another question stays locked until the reward is completed. Radar Draw 2 Pick 1 is covered through the scored single-device round; seeker projections do not expose the private pool.
- The web map fallback draws a bounded set of OSM tiles with attribution and now pans/zooms on touch with visible zoom/reset controls. It does not prefetch or offer offline tile downloads.
- Visual comparison against the live reference confirms the app map shares the city-boundary, station-zone, and street-map concepts but is not visually identical: the reference is a Leaflet map workbench with editable layers and question controls; this app embeds a game-first map in its match workflow.
