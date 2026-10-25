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

- Bridge Troll is now a typed assisted effect from the scanned rulebook. The engine blocks the next question until each active seeker has independently marked that they are under the bridge; each player can update their status if they leave, and acceptance of the next question clears the condition. Physical presence remains a group attestation. [base rulebook scan, printed p. 50; engine/importer tests, 2026-10-25]
- The scanned setup rule is also enforced: if the selected map has no bridges, Bridge Troll stays exiled at match start and every round reset. The host explicitly confirms bridge availability; missing OSM results are never treated as proof that there are none. Unknown availability blocks starting when the installed pack contains Bridge Troll. Map scenarios preserve this declaration, and the question screen routes unresolved setup to the map. [base rulebook scan, printed p. 50; `tests/engine/map-setup.test.ts`, `tests/engine/round-rotation.test.ts`, `apps/mobile/tests/map-scenarios.test.ts`, checked 2026-10-25]

- The project has a broad functional foundation; its phased plan and some package READMEs are out of date.
- `npm run online:smoke` now runs a real local Supabase round using distinct authenticated host, hider, and seeker sessions: role setup, location privacy, automatic Radar/map deduction, in-app reward selection, found/scoring, and round rotation. The local smoke uses synthetic GPS and a host phase advance; hosted deployment, hosted authorization audit, timer/native-GPS behavior, and cellular field play remain unverified. Nearby mode has no LAN transport.
- The regenerated base-game pack has six question categories and 80 printed Investigation Book question templates, 37 card definitions / 125 card instances, one scan-attributed base ruleset, one host-selected-boundary map preset, 11 warnings, and 5 informational import findings. It remains draft content; remaining card warnings still need adjudication.
- Exact scan files remain in Downloads. They were not copied into or committed to the public project repository.
- The initial research pass did not run the app or test suite; later web-bundle and typecheck checks were run during implementation.
- The initial implementation target was single-device referee; the 2026-10-24 product clarification made one authenticated phone per player the primary product, with referee mode retained as fallback/regression coverage.
- Home now starts referee setup directly; online create/join remain available as secondary paths.
- Referee event logs and latest snapshots now use persistent AsyncStorage, and the app stores a resume pointer/profile and reconnects to the recovered host session at startup. Home then offers the existing Continue action.
- At the initial UI review, protected reveal handoffs were not connected to app UI and their manager was process-local. The referee handoff panel is now part of live map play, and token/checkpoint state survives restarts. A controlled full-round runtime walkthrough passes.
- The current UI's repeated admin-style header/panel/banner hierarchy and the proposed game-first direction are documented in `knowledge/game-ui-redesign-research.md`.
- The generated base-game pack previously lacked ruleset/map metadata and the mobile app silently injected a separate fallback ruleset. The importer now emits base timers, question windows, hiding radii, round preparation, and host-selected map policy from the scans; mobile play consumes that ruleset directly. Map-preset selection UI and remaining rule/card adjudication stay open.
- The Transit Field Kit is now implemented: warm timetable paper, route-ink navy, signal yellow and orange, compact station navigation, illustrated Home, named team spaces, larger bounded map, and redesigned clue/card/chat surfaces. Browser screenshots are in `deliverables/ui-preview/`.
- Browser review at 1440px desktop and 390px/320px phone widths found no horizontal overflow. A local referee game was resumed, a crew member added, the Prague boundary selected, the match started, and a six-card hand drawn. The roster and city returned after a browser reconnect.
- Web `accessible={false}` SVG props caused the reported React warning; decorative game SVGs now use `aria-hidden={true}`. Measured map width also prevents the map surface from extending beyond its card.
- At the start of the online multiplayer phase the full suite passes 237/237 with the project `.venv` on `PATH`; mobile TypeScript typecheck passes.
- The scan-confirmed standard round flow is implemented. Imported workbook card text remains draft and may need manual adjudication; it is kept for personal/private play until distribution rights and importer warnings are reviewed.
- Reconciled the workbook's extra “4th Admin (Borough)” Measuring row against the scanned Investigation Book: it is not listed there, so the base-game importer now excludes it and reports the source discrepancy. The 4th Admin Matching prompt remains. The regenerated pack has 80 templates; Veto and Randomize are typed effects, and four workbook Thermometer distances are corrected to the scanned values with import provenance.

### Completed implementation slice: automatic Thermometer questions

- [x] Test scanned distances, answer direction, minimum-travel enforcement, GPS uncertainty, and frozen sample provenance.
- [x] Reconcile workbook distances and answer options to the scanned Investigation Book and regenerate both base-game pack outputs.
- [x] Calculate hotter/colder from fresh, accurate hider/seeker fixes; apply the map half-plane from the exact movement endpoints used for the answer.
- [x] Verify focused/full tests, mobile typecheck, and update rule/content documentation.

### Current rules correction: Measuring answer schema

- [x] Compare the imported Measuring answer schema with the scanned base rulebook.
- [x] Remove the unsupported “same” answer from the imported category, every template, and its constraint schema.
- [x] Verify the engine rejects “same” and both workbook mappings expose only “closer”/“further”.

### Active: trusted feature data for automatic Matching/Measuring

- [x] Add a source-attributed OpenStreetMap feature query provider scoped to the selected playable region and question feature class.
- [x] Inject provider results on the authority side only; never accept feature coordinates or computed answers from a player command.
- [x] Resolve supported Matching and Measuring questions from fresh hider/seeker fixes, then apply the map constraint atomically from that same feature snapshot.
- [x] Keep unsupported categories and unavailable feature providers on an explicit manual or blocked path; never guess from seed data.
- [x] Verify provider filtering, answer precision, map geometry, role privacy, full suite, and mobile typecheck.

### Completed implementation slice: resilient OSM question lookups

- [x] Retry network errors and transient Overpass HTTP failures against a documented public fallback while keeping explicitly configured endpoints isolated.
- [x] Verify fallback order and response parsing, reject invalid queries without fan-out, and pass the full suite (387), mobile typecheck, Edge Function typecheck, and `git diff --check` (2026-10-25).
- [x] Cool down transiently failed endpoints for 60 seconds across different region lookups, then restore the normal endpoint order after recovery.
- [ ] Verify live regional feature coverage; both documented public endpoints timed out on a tiny Prague node query from this environment, so no regional coverage claim is made.

### Current implementation slice: enforce the scanned Bridge Troll curse

- [x] Add a failing engine test proving the curse blocks the next question until every active seeker attests they are under a bridge.
- [x] Record each seeker's current under-bridge status in public match state and let the player revoke it if they leave.
- [x] Activate the requirement when the hider resolves Bridge Troll and clear it only when the next question is accepted.
- [x] Add player controls and role-specific status so every seeker can attest from their own phone and the hider can see readiness.
- [x] Verify the printed p. 50 rule with focused engine/importer tests, the 392-test suite, mobile typecheck, Edge Function check, 14-step online smoke, and web bundle export. Physical bridge presence remains a player attestation because GPS cannot verify posture/structure.
- [x] Honor the other p. 50 setup rule: host-confirm map bridge availability; exclude Bridge Troll from the draw deck when no bridges exist and preserve exile at every round reset. Unknown availability blocks match start when the pack contains Bridge Troll; changing the selected boundary requires a fresh confirmation. Verify match/projection persistence, scenario round trip, initial/round-reset deck behavior, and map-screen build (2026-10-25).

### Completed implementation slice: authority-backed Matching/Measuring

- [x] Query supported OpenStreetMap feature classes inside the selected map boundary, clip representatives to the exact polygon (including holes), attach OSM attribution, and cache short-lived query results.
- [x] Resolve supported Matching/Measuring on the authority using fresh device fixes and trusted server-loaded regional features; answer and map deduction share one atomic command and snapshot provenance.
- [x] Keep client-provided feature coordinates out of the resolver; strip bulky feature data before persisting public events while preserving source/version/time and constraint geometry.
- [x] Keep unsupported question feature classes on manual answer flow and report the automatic regional path accurately in question guidance.
- [x] Verify `npm test` (254 passing), `npm run mobile:typecheck`, and `git diff --check`.

### Current implementation slice: scanned Tentacles question

- [x] Add failing authority and geometry tests for the printed seeker's reach, candidate set, automatic answer, out-of-reach null answer, and map deduction.
- [x] Load mapped candidate classes on the authority and resolve Tentacles from the seeker's feature radius plus fresh hider/seeker fixes.
- [x] Correct Tentacles map geometry to use the same seeker-anchored candidate set as the answer, clipped to the printed reach radius.
- [x] Add subway route relations as metro-line candidates; group opposite directions by network/reference and use line distance consistently for reach, answer, and map narrowing.
- [x] Keep unsupported or incomplete place data manual, update player guidance, and verify the full suite and mobile typecheck.
- [ ] Verify route coverage against a live metro region; bounded Prague attempts received HTTP 502 from Overpass, timed out at Kumi, and could not resolve the NCHC endpoint (2026-10-25).

Ruling: Tentacles candidate places are the mapped features inside the seeker's printed reach radius; the hider must also be inside that radius and answers with the nearest of those places. The scan's diagram and wording on printed pp. 36–37 show the radius centered on the seekers, and state an out-of-reach hider may say so. Using a hider-centered candidate set would answer a different question and produce a mismatched map deduction.

### Completed implementation slice: base ruleset and map preset in the versioned pack

- [x] Add scan-derived standard timers, answer windows, hand limit, hiding-zone radii, found conditions, and next-hider preparation policy to the base pack.
- [x] Add a host-selected administrative-boundary map preset with current map dataset/layer and location visibility policies.
- [x] Remove the mobile-only synthetic fallback ruleset so referee and online runtimes consume the same pack data.
- [x] Verify importer/reporting, map setup, full suite (280 tests), mobile typecheck, generated pack, and `git diff --check` (2026-10-24).

- [x] Test mapped Tentacles place classes and subway route coverage; incomplete route geometries remain manual.
- [x] Verify end-to-end through the online authority with a malicious client feature payload ignored: 260 tests pass, mobile typecheck passes, and `git diff --check` is clean (2026-10-24).

### Current implementation slice: type the scanned discard-and-draw power-ups

- [x] Add importer assertions for typed, authoritative Discard 1 Draw 2 and Discard 2 Draw 3 definitions from the scanned p. 46 rules.
- [x] Emit their discard/draw counts and scan-faithful descriptions as typed effect payloads; resolve engine behavior from typed data instead of card names.
- [x] Update mobile card payment guidance to read the typed cost, regenerate the standard content pack/report, and verify full tests and mobile typecheck.
- [x] Verify the imported Discard 2 Draw 3 effect through the engine payment and replacement draw flow. Full verification: 261 tests pass, mobile typecheck passes, `git diff --check` is clean (2026-10-24).

### Current implementation slice: Duplicate's held time-bonus rule

- [x] Import Duplicate with the scanned copy rule and keep unsupported copied challenge outcomes manual.
- [x] Apply the rulebook's end-of-round copy of a held time bonus to capture scoring and player-facing score detail.
- [x] Add importer and engine regression coverage and regenerate the pack. Full verification: 261 tests pass, mobile typecheck passes, `git diff --check` is clean (2026-10-24).

### Current implementation slice: in-round Duplicate target selection

- [x] Let a hider choose an eligible card in their hand when playing Duplicate, while preserving the original card.
- [x] Resolve supported copied power-up effects through the same authoritative engine path; keep manual challenges explicit and show the copied card in the resolution window.
- [x] Verify command validation, UI selection, effect execution, original-card preservation, and seeker projection redaction. Full verification: 263 tests pass, mobile typecheck passes, and `git diff --check` is clean (2026-10-24).

### Completed implementation slice: accurate assisted-card metadata

- [x] Mark Move and Duplicate as assisted in the imported content pack because their supported effects are enforced in the engine and guided in the mobile flow.
- [x] Add importer/UI regression coverage and regenerate the pack/report. Focused suite passes (25 tests), mobile typecheck passes, and `git diff --check` is clean (2026-10-25).

### Current implementation slice: station-name-length Matching

- [x] Load named transit stations from trusted OpenStreetMap feature data and exclude stations without an actual name from this question.
- [x] Compare normalized Unicode character counts of each player's nearest station name and apply the same nearest-name-length predicate to the map deduction.
- [x] Verify the OSM provider, direct engine resolution, online authority answer/map update, and role path. Full verification: 266 tests pass, mobile typecheck passes, and `git diff --check` is clean (2026-10-24).

### Completed implementation slice: Street or Path Matching

- [x] Query OSM highway ways with bounded line geometry and a project-identifying User-Agent; cache the selected region/class result.
- [x] Join connected same-name ways into one segment; split unnamed ways at mapped intersections and keep incomplete geometries out of automatic answers.
- [x] Use line distance for nearest-segment GPS confidence, automatic answer, and the same map deduction; describe the automatic and manual fallback behavior in player guidance.
- [x] Verify against scanned base rulebook p. 18, provider topology tests, engine answer/map test, live Prague Overpass response, full test suite (314 passing), mobile typecheck, and `git diff --check` (2026-10-25).

### Completed implementation slice: International Border Measuring

- [x] Load only OSM admin-level-2 country relations for the selected map region and derive shared border ways.
- [x] Preserve inner and outer member-way identities so enclave borders count, while keeping admin-division border logic outer-boundary-only.
- [x] Resolve closer/further from fresh locations to the same nearest mapped country border and apply the corresponding map deduction.
- [x] Show connected-only player guidance and retain manual handling when coverage is incomplete; verify scanned p. 24, enclave/provider tests, engine answer/map test, focused suite, full suite, and mobile typecheck (2026-10-25).

### Completed implementation slice: High-Speed Train Line Measuring

- [x] Recheck the Investigation Book scan: High-Speed Train Line is a standard Measuring target (scan page 2).
- [x] Load mapped `railway=rail` ways and `route=tracks` relations tagged `highspeed=yes` as bounded line geometry; keep empty/incomplete regional data manual.
- [x] Compare both fresh player fixes to the same seeker-selected segment and apply that same segment to the approximate map deduction.
- [x] Explain the OSM coverage boundary and manual fallback in player guidance; full suite (375/375), mobile typecheck, Edge Function check, and `git diff --check` pass. The bounded Paris-area Overpass lookup timed out, so live feature coverage remains unverified (2026-10-25).

### Completed implementation slice: named Body of Water Measuring

- [x] Reconcile the scanned p. 25 definition: named map water body, excluding pools.
- [x] Load named OSM water and reservoir areas, exclude pools, preserve multipolygon holes, and calculate distance to polygon boundary (zero when a player is inside the water area).
- [x] Add named river centerlines as approximate linear water features; resolve answers and map deductions against the same authority-selected water geometry.
- [x] Keep incomplete named water geometry on manual handling; disclose that river lines are approximate and update player guidance and rule/data notes.
- [x] Verify provider, polygon distance, automatic answer/map constraint, and mobile guidance tests; full suite passes (322), mobile typecheck passes, and `git diff --check` is clean. The first full-suite attempt lacked `openpyxl` in the shell environment; rerunning with `PYTHONPATH=temp/deps` passed (2026-10-25).
- [ ] Verify a bounded regional water query against live Overpass; attempted Máchovo jezero query timed out (2026-10-25), so no live coverage claim is made.

### Partial implementation slice: Coastline Measuring

- [x] Load bounded OSM `natural=coastline` ways as line geometry; use the same nearest mapped shoreline for the automatic closer/further answer and approximate map deduction.
- [x] Show the exact scanned inland-water conditions in answer guidance and keep manual referee adjudication until the map data can prove great-lake identity, direct waterway connectivity, and the continuous 2 km width rule.
- [x] Verify provider clipping, line geometry, automatic answer/map update, and role guidance with fixture tests; full suite passes (325), mobile typecheck passes, and `git diff --check` is clean (2026-10-25).
- [ ] Model and verify great-lake shorelines plus connected waterways at least 2 km wide; retain manual handling until the complete printed target can be represented.
- [ ] Verify coastline data against a live coastal region. No live Overpass query was run for this slice (2026-10-25).

### Completed implementation slice: exact Coastline answer guidance

- [x] Preserve the printed definition in player guidance: ocean, a great lake, or water flowing directly to one through a waterway never narrower than 2 km.
- [x] Keep ocean shoreline automation labeled approximate and inland cases referee-judged until lake identity, route connectivity, and continuous waterway width can be proven.
- [x] Verify the UI rule text, full suite (384/384), mobile typecheck, the scored single-device referee round, and local online multiplayer smoke (2026-10-25).

### Completed implementation slice: scan-faithful Landmass Matching

- [x] Resolve Landmass only from complete mapped island/islet polygons; point-only, incomplete, mainland, and shoreline-ambiguous cases stay manual.
- [x] Apply the scanned surrounded-landmass exception and use the same polygon set for the approximate map deduction.
- [x] Add provider, engine, and player-guidance regression coverage; regenerate the base pack with the scan-derived clarification.
- [x] Verify the full suite (379 passing), mobile typecheck, and `git diff --check` (2026-10-25).

## Active: online multiplayer for one phone per player

- [x] Make the online cloud runtime the default for new launches while keeping referee and in-memory modes explicitly selectable; verify mode parsing and mobile typecheck (2026-10-25).
- [x] Capture the product requirements for role-specific devices, hider-visible seeker locations, automatic location-based answers, in-app card rewards, searchable administrative regions, and future versioned content packs.
- [x] Draft and push the approved server-authoritative design and acceptance criteria in `docs/superpowers/specs/2026-10-24-online-player-game-design.md`.
- [x] Product owner approves the written design and implementation choices (2026-10-24).
- [x] Write the phased implementation plan.
- [x] Build and test the authenticated Edge Function gateway, atomic revision commits, separate authenticated phone adapters, and reconnect bindings in the prototype authority.
- [x] Give each hider/seeker device location publishing; hiders receive live seeker tracks while seeker projections exclude hider coordinates.
- [x] Automatically resolve Radar from fresh seeker and hider GPS fixes, apply the bounded map deduction, and record fix provenance in the same authority command.
- [x] Implement the Investigation Book's Radar `Choose` row: seekers enter a positive radius in meters; the authority freezes it, auto-resolves from fresh device fixes, applies that same map radius, and shows it to the hider. Fixed-radius prompts reject custom radii.
- [x] Reconcile `Radar -> Choose` in the generated content pack and remove its false blocking import warning. Focused verification: 23 engine/importer/mobile-flow tests pass, mobile typecheck passes, and `git diff --check` is clean (2026-10-24).
- [x] Automatically resolve Thermometer from printed minimum travel distance and fresh GPS fixes; freeze the same seeker movement endpoints for the answer and map deduction.
- [ ] Deploy and security-audit the online authority; verify it on real devices over cellular data.
- [x] Add explicit Supabase CLI project/function configuration with JWT verification enabled; validate the Edge Function runtime using `deno check` (2026-10-25).
- [x] Add a follow-up migration that removes the legacy blanket database policies and scopes storage objects to an active match membership plus their public/team/player/host scope. Static policy regression test passes; applying and executing it against a Supabase database is still pending.
- [x] Apply all seven migrations to a real local Supabase stack and inspect RLS flags, owners, policies, and grants. Fix the security migration so it leaves Supabase-owned `storage.objects` RLS/grants intact while replacing its policies; production-project execution remains pending (2026-10-25).
- [x] Extend `npm run online:smoke` through separate host/hider/seeker sessions, custom boundary setup, role assignment, seeker track visibility, hider-coordinate privacy, automatic Radar answer and map deduction, hider card draw/choice, found/scoring, and next-hider rotation. It uses synthetic GPS and host-advances hide phase; standard timer/native GPS/cellular field validation remain open (2026-10-25).
- [ ] Add automatic/assisted resolvers for the remaining Investigation Book categories and verify each answer/map effect against the scanned rules.
- [ ] Reconcile and implement all standard card effects, including the remaining physical or manually adjudicated effects.
- [x] Implement Urban Explorer as an assisted per-seeker transit/station status gate, preserve it until hider rotation, and reset it on the next round. Physical status remains player-attested. [base rulebook scan, printed p. 56; `tests/engine/cards.test.ts`, checked 2026-10-25]
- [x] Implement Curse of Water Weight as an assisted seek-team supply status: gate questions until the seekers attest they acquired the required new liquid, award the printed scale bonus the first time it is lost/abandoned, and include that award in round scoring. Preserve the scan-derived 3 m proximity rule as player-attested because separated containers do not have individually tracked positions.
- [x] Import the scan-backed Move procedure, reject its use after endgame begins, and source the missing scale durations (Small 10, Medium 20, Large 60 minutes) from the community card transcription; retain provenance in the generated pack.
- [x] Implement Move's scan-backed round flow: pause seeker actions, reveal the original station, discard the rest of the hider hand, let only the hider relocate to a different in-boundary station, require arrival before closing, and exclude the Move interval from final survival scoring.
- [x] Enforce the scale-specific Move duration as an authority-side minimum, show a live countdown, and require the hider to arrive at a different station before closing the window. The scan/workbook omit the duration values; the generated pack records the secondary transcription source.
- [x] Implement foreground and opt-in background location updates, separate permission status, native iOS/Android location configuration, match-scoped recovery of background fixes, and cleanup outside an active round. Unit, typecheck, web-bundle, and native-config checks pass; physical-device GPS validation remains open below (2026-10-24).
- [x] Add content-pack selection/validation, support multiple installed versions with the same pack ID, and pin the exact selection through the match aggregate, server record, snapshot, and player projection.
- [ ] Ship additional variant packs and validate joins when players have multiple compatible versions installed.
- [ ] Run a full mobile field round on multiple phones with native GPS and cellular connectivity.

### Current implementation slice: local content-pack selection and validation

- [x] Add an installed-pack catalog and a rules/question-set picker during match creation; record the selected pack ID and version in the match. The current production catalog bundles only the standard pack.
- [x] Resolve question/card/rules UI data from the match's exact pack ID/version in map, question, card, and private handoff screens.
- [x] Validate each installed pack once, reject invalid selections, and reject joining a match whose selected pack is not installed locally.
- [x] Preserve and enforce the exact `packVersion` across server records and match projections; register references by ID/version, reject ambiguous creates, and reject a player device missing the match's exact version.
- [x] Import validated content-pack JSON files up to 5 MB, persist them in the local library, restore them on startup, and include them in the match setup selector.
- [ ] Apply the migration to the hosted database and validate a cellular multiplayer match with multiple installed versions.
- [x] Distribute the host's immutable, versioned online content pack to each joining device; additional curated variant packs remain to be authored.

### Active implementation slice: distribute the match's pinned content pack

- [x] Publish the host's validated, immutable content-pack JSON before online match creation; the authority rejects same-ID/version content changes.
- [x] Let an authenticated player fetch only the exact content pack pinned to a match after joining; validate and persist it in the local pack catalog before rendering the match.
- [x] Verify a clean player device auto-installs a host-selected alternate version; same-ID/version mutations and non-member fetches are rejected. Full suite (399/399), mobile typecheck, Deno Edge Function check, web/iOS/Android Expo exports, and 15-step local Supabase smoke pass (2026-10-25).

### Completed implementation slice: Move authority timer

- [x] Add the community-transcribed Small/Medium/Large durations (10/20/60 minutes) to typed Move content with source provenance; remove the stale missing-duration importer warning.
- [x] Carry the selected duration through the resolution event and role-scoped projection, prevent early resolution on the authority, show a live countdown, and keep the hider arrival requirement.
- [x] Verify the early/expired boundary and hide timer pause/resume. `PYTHONPATH=temp/deps npm test` passes (288 tests), `npm run mobile:typecheck` passes, and `git diff --check` is clean (2026-10-24).

### Completed implementation slice: scanned Matching clarifications

- [x] Add the base-rulebook clarifications for Transit Line, Station Name Length, Street or Path, and first through fourth administrative divisions to their versioned question templates with page provenance.
- [x] Show rulebook guidance separately from workbook requirements in question selection and answer entry.
- [x] Verify generated pack values and source pages, focused importer/UI guidance tests, full suite (289 passing), mobile typecheck, and `git diff --check` (2026-10-24).

### Completed implementation slice: scanned Measuring definitions

- [x] Add the shared closer/further, in-boundary null-answer reward rule and all scanned target definitions (airport, high-speed rail, stations, borders, altitude, water/coastline, map-icon places/utilities) to all 20 Measuring templates with page provenance.
- [x] Reuse the question picker and answer-form rulebook guidance surfaces; verify representative definitions and full template coverage in the generated pack.
- [x] Verify the full suite (289 passing), mobile typecheck, and `git diff --check` (2026-10-24).

### Completed implementation slice: scanned Photos question instructions

- [x] Add failing importer and mobile-guidance tests for full printed photo coverage, source provenance, and suppression of conflicting workbook text.
- [x] Add scan-derived instructions for all 18 photo prompts in cleaned and legacy workbook mappings, including shared photo rules and referee review guidance.
- [x] Correct scan/workbook mismatches: 1 km street tracing, 2 m park clearance, building-story requirements, 2 m × 2 m identifying areas, and the mountain's maximum 3× zoom.
- [x] Regenerate the draft content pack; verify all 292 tests, mobile typecheck, and `git diff --check` (2026-10-24).
- [x] Make photo evidence visible to seeker and hider match projections so the seeking team can judge the submitted answer; verify both scope selection and projection redaction.

### Completed implementation slice: Photo answer evidence integrity

- [x] Reject Photo answers that reference files, non-photo attachments, evidence linked to a different question, or evidence not visible to the match.
- [x] Keep the scanned subject-absent and endgame-unanswerable paths available; require evidence for ordinary Photo answers.
- [x] Disable player-facing Photo answer submission until the current question has recorded public photo evidence and explain the requirement in the answer panel.
- [x] Verify invalid and valid engine attachment cases, UI evidence readiness, referee evidence capture/answer flow, the full suite, mobile typecheck, and `git diff --check` (2026-10-25).

### Current implementation slice: scanned curse clarifications

- [x] Add scan-derived, source-attributed handling clarifications to every curse card in both workbook mapping paths.
- [x] Show the clarification in the card detail view, separately from the workbook effect description.
- [x] Regenerate the content pack; verify all 24 curse cards include scan-derived guidance and printed-page provenance. Full suite passes (293 tests), mobile typecheck passes, and `git diff --check` is clean (2026-10-24).

### Current security slice: Supabase access lockdown

- [x] Revoke direct anon/authenticated access to match, event, snapshot, projection, content-reference, membership, and idempotency tables; preserve service-role access for the authority Edge Function.
- [x] Scope private attachment paths by team or player identity and add membership/role-checked Storage policies; public-match attachments remain available to current members.
- [x] Add regression checks for migration policy changes and protected object paths. Full suite passes 277 tests, mobile typecheck passes, and `git diff --check` is clean (2026-10-24).
- [x] Apply all migrations in order to a throwaway PostgreSQL 16 instance with minimal Supabase Auth/Storage stubs; anon table reads were denied, service-role reads passed, and attachment read/write checks allowed only the active member's public/team/player scopes (host admin retained referee access). (2026-10-25)
- [ ] Apply against hosted Supabase and verify with real Auth/Storage services; this checkout has no Supabase project configuration or deploy credentials.

### Completed implementation slice: administrative-division Matching

- [x] Load OSM administrative relation polygons for the selected playable region and assemble closed outer/inner rings from relation member ways.
- [x] Resolve first through fourth administrative Matching questions from both players' fresh device locations and the same trusted boundary snapshot used by the map deduction.
- [x] Refuse automatic answers when the needed hierarchy level is absent/ambiguous or GPS uncertainty overlaps the selected border; keep the manual path available.
- [x] Verify relation geometry assembly, ordinal selection, provider query/normalization, automatic answer, map narrowing, full tests, and mobile typecheck.
- [ ] Validate country-specific hierarchy coverage against real regions before calling all administrative questions broadly supported.

### Completed implementation slice: shared administrative-border Measuring

- [x] Preserve OSM outer member-way IDs and identify only ways shared by multiple divisions at the requested administrative level.
- [x] Keep only shared border lines intersecting the playable region; exclude outer country/state edges that have no same-level neighboring division.
- [x] Compare seeker and hider distance to the same nearest shared border with GPS uncertainty handling and apply the corresponding map constraint.
- [x] Verify line distance, relation assembly, target selection, map intersection, automatic answer/map update, full tests, and mobile typecheck.
- [ ] Validate OSM shared-way coverage and border distance behavior against real regions across countries.

### Product-owner clarification — individual phones (2026-10-24)

- Each participant uses their own phone; the online match is shared across the full group.
- Team-shared phones are not the intended multiplayer setup; a player joins and receives role-scoped state on their own authenticated app installation.
- Hiders need live seeker positions. Seekers need question controls and the automatically updated search map; hider coordinates remain private.
- Hiders answer on their own phones, draw and choose the printed card reward in-app, and supported answers should be calculated from authoritative player locations and trusted map data.
- Match setup should build playable areas from searchable administrative boundaries, following the reference map's workflow. Keep question/card/rules content versioned so other game variants can be added later.
- Open design question for the owner: should the standard match always have exactly one hider per round, rotating between all players, or should a custom pack allow multiple hiders on a team? The current base-game flow implements one rotating hider.

## Active: rules-faithful game and reference-map workflows

### Current rules slice: late question answers

- [x] Add authority-side expiration when a question's printed response timer expires.
- [x] Record the late-answer interval, subtract it from scored hider time, and withhold the card reward.
- [x] Show the hider that hiding time is paused while the overdue answer remains open.
- [x] Timestamp online commands on the game authority so phone clocks cannot backdate late answers.
- [x] Verify the printed 10-minute small-game photo deadline through online snapshot reconciliation, exact late interval score accounting, no reward, server-authoritative timestamps, and the full suite/typecheck. Full verification: 269 tests pass, mobile typecheck passes, and `git diff --check` is clean (2026-10-24).

### Completed implementation slice: automatic consulate feature data

- [x] Map the Investigation Book's foreign-consulate Matching/Measuring feature class to the documented OSM `office=diplomatic` + `diplomatic=consulate` tag pair.
- [x] Verify the provider builds a bounded region query and normalizes the result for the existing authority-side location resolver.
- [x] Run the full suite and mobile typecheck. Full verification: 270 tests pass, mobile typecheck passes, and `git diff --check` is clean (2026-10-24).

### Current implementation slice: Curse of the Drained Brain

- [x] Type its exact-question lock as authoritative card data; let the hider select exactly three prompts from different Investigation Book categories during card resolution.
- [x] Persist the locked prompt IDs in public match state, reset them on hider rotation, and reject only those exact seeker questions.
- [x] Let the hider resolve their own card window in online play while preserving host referee control; show the picker in Cards and broadcast the selected prompts.
- [x] Verify invalid selections, question blocking, per-run reset, role permissions, full tests, and mobile typecheck after correcting the earlier category-wide interpretation. Full verification: 271 tests pass, mobile typecheck passes, and `git diff --check` is clean (2026-10-24).

### Current implementation slice: Curse of the Overflowing Chalice

- [x] Import the printed effect as typed data and add an engine test for its three reward opportunities, optional extra draw, unchanged keep count, and hider-run reset.
- [x] Add a hider-facing choice when dealing a question reward; prevent using the bonus after its opportunities expire and keep the bonus private to the hider side.
- [x] Verify importer, engine, role projections, full suite, and mobile typecheck. Full verification: 272 tests pass, mobile typecheck passes, and `git diff --check` is clean (2026-10-24).

### Current implementation slice: Curse of Spotty Memory

- [x] Import its category reroll as a typed authoritative card effect and add failing tests for the initial random lock, rejection of that category, reroll after an accepted question, and round reset.
- [x] Publish the authority-selected category lock to every player and show/disable that category in the question picker.
- [x] Verify importer, role projections, full suite, and mobile typecheck. Full verification: 275 tests pass, mobile typecheck passes, and `git diff --check` is clean (2026-10-24).

### Current implementation slice: automatic foreground location sharing

- [x] Start a player's GPS watch automatically during hide, seek, and endgame once foreground permission is granted; stop sharing outside active play phases.
- [x] Keep manual single-fix mode and a clear denied/unavailable state for permission and device-service failures.
- [x] Verify the phase/role/permission policy and full test suite; 275 tests pass and mobile typecheck passes (2026-10-24).
- [x] Add opt-in background location sharing after the product owner confirmed individual-phone city play. Expo Task Manager delivers fixes while backgrounded; any locally queued fixes are scoped to the active match and recipient. Device-level behavior still requires the multi-phone field test below (2026-10-24).

### Current implementation slice: live GPS freshness on the game map

- [x] Show each player the age and freshness of their own device fix on the live map.
- [x] Show freshness counts only for movement tracks already authorized in that player's projection; use the same age threshold as automatic clue resolution.
- [x] Refresh freshness labels during live play and cover fresh/stale/unknown states; verify focused tests, full suite (283 passing), mobile typecheck, and `git diff --check` (2026-10-24).

### Current implementation slice: scanned hand-expansion power-up

- [x] Add an engine integration test for Draw 1, Expand Maximum Hand Size by 1: draw one, increase hand capacity for the rest of the round, and reset the capacity on the next round.
- [x] Implement the typed card effect in the authoritative card path and expose the current hand limit to the owning team UI.
- [x] Run focused and full verification; update card/rules notes with the scan citation.

### Current implementation slice: assisted Hidden Hangman curse

- [x] Type the scanned five-letter Hangman effect and import it as assisted; test the generated card data.
- [x] Track the hider's private word and seeker guesses in authoritative events/projections without leaking the word early.
- [x] Keep the card window open until the word is solved or the hider ends the group-played challenge, then wire the role-specific controls into card and live-map UI.
- [x] Verify engine privacy/permissions, importer, full suite, mobile typecheck, and document any rule boundary that remains group-enforced.

### Completed implementation slice: scanned Veto and Randomize power-ups

- [x] Add engine tests for question cancellation, replacement selection, null answers, and repeat-cost semantics.
- [x] Import Veto and Randomize as typed authoritative effects and regenerate the standard draft content pack.
- [x] Apply both effects through public match events so all role projections follow the same question lifecycle.
- [x] Verify focused engine behavior, full suite, mobile typecheck, and update the scan-backed rules notes.

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
- [x] Support scenario file import/export: versioned JSON import validates size, schema, geometry, and subtraction; web downloads exports while iOS/Android use the system share sheet. Preserve the existing compact-link workflow. Focused map tests (37), full suite (329), mobile typecheck, Expo web/iOS/Android exports, and `git diff --check` pass (2026-10-25).
- [x] Extend saved/shared scenarios with validated custom GeoJSON overlays, station-source selection, and a custom-station data model; render visible custom layers in the preview on web and native. Focused map-scenario tests (5), full suite (335), mobile typecheck, and `git diff --check` pass (2026-10-25).
- [x] Add workbench controls to paste/import GeoJSON layers, rename/recolor/show/hide/remove them, edit custom stations, import station CSV/GeoJSON/KML, select OSM/custom/both sources, and restrict candidates to the selected boundary. Focused workbench/scenario tests (11), full suite (341), mobile typecheck, Expo web/iOS/Android exports, and `git diff --check` pass (2026-10-25).
- [x] Put custom overlays and station-source data on the authoritative map-region command/model and project it to public, hider, and seeker views; validate imported geometry and coordinates on the authority; allow hosts to reapply settings without changing the region. Focused map/engine tests, full suite (346), typecheck, all Expo platform exports, and `git diff --check` pass (2026-10-25).
- [x] Align Expo SDK 55 dependencies to the SDK's expected versions, including Metro runtime, Expo core/router/location/linking/image picker/status bar, React Native/maps, and Babel preset. Add direct `expo-asset`, `expo-glass-effect`, and `expo-symbols` dependencies required by native entry bundles under the monorepo's Metro resolver. `expo install --check` reports all dependencies current; full suite (329), mobile typecheck, and web/iOS/Android exports pass (2026-10-25).
- [x] Add a full single-device referee runtime walkthrough through hiding-zone selection, automatic timer expiry, endgame, found, and score.
- [x] Extend the scored single-device round walkthrough through a printed location question, authority-computed answer, and applied map deduction.
- [x] Add the question's exact draw/pick card reward to the engine, hider card screen, and scored single-device round.
- [ ] Walk the same path on a physical phone with GPS. The runtime integration covers the full round and the mobile web screen was rendered at 390 px; native GPS still needs an attached device or simulator.

### Findings for this pass

- The Investigation Book's “Draw N, Pick M” is the hider's card reward after an answer. A prior build incorrectly used those numbers to deal a random subset of available questions; the current flow shows all scale-allowed printed questions and repeats their reward separately.
- A prior app-injected ruleset used a 120-second hide phase and 45-second post-answer cooldown. These were replaced with the scanned 30/60/180-minute hide periods by scale and no extra answer cooldown.
- The scan sets hiding-zone radii to 500 m for small/medium and 1 km for large, endgame when seekers enter the zone and disembark transit, and found when they have both spotted the hider and come within 2 m.
- The reference app exposes Save File, Load File, Share, Tutorial, and Options alongside editable map layers and hiding-zone controls. This app saves/loads named local scenarios, imports/exports validated JSON, shares compressed app links, and lets the host publish custom layers and station-source settings through the authoritative map-region event. [source: `MapScenarioWorkbench.tsx`, `create_map_region`, `tests/engine/map-setup.test.ts`, 2026-10-25]
- Custom overlay geometry and station coordinates are validated both when importing a scenario and again at the authority boundary. The public and both team-private player projections carry the shared map settings so each connected phone renders the same layers and station source. [source: `packages/engine/src/commands/validate-command.ts`, `build-match-projection.ts`, `tests/engine/map-setup.test.ts`, 2026-10-25]
- Expo SDK 55 dependency alignment uncovered two native-bundle omissions hidden by the earlier web-only build: `expo-asset` is imported by Expo's native entry, and the current Expo Router's Android/iOS native stacks require `expo-symbols` and `expo-glass-effect`. The old Babel preset also retained React Native's 0.83.2 preset while the SDK expects 0.83.10; updating to `babel-preset-expo` 55.0.25 resolved the iOS transform crash. SDK check, all platform exports, full tests, and mobile typecheck now pass.
- Station search uses bounded Overpass requests, filters returned candidates back against the selected polygon (including polygon holes), and renders selectable station markers with a geodesic 500 m/1 km preview. The chosen station is persisted in authoritative round state.
- The hider can set the round's station-centered zone during hide phase. The engine derives its 500 m/1 km radius from the selected ruleset, checks sampled interior/circumference points so the full circle fits in the map, persists it in match events, and projects it only to the hider and referee. Engine station identity still comes from the client-selected OSM result.
- The hider now marks a final pin during seek phase and explicitly attests that it is publicly accessible and within 3 m of a marked path. An off-transit seeker location report inside the zone starts endgame and freezes that pin. The pin is not sent in the public endgame event or seeker projection. Found requires a seeker/referee confirmation, visual identification, and coordinates within 2 m; the match records a survival-time result and displays it on the live map. Field actions capture a one-time fix when tapped; the separate live-sharing provider publishes private hider fixes, with native background sharing still open.
- Endgame completes a scored round. Captured-round score includes real survival time plus scale-adjusted time bonuses still held. All registered participants are shuffled into a persisted hider order at match start, and roles update to match the first draw. Next rounds enforce that order, reset and shuffle cards, begin at the last found spot, and must start within 10 minutes. The final screen ranks each hider by final hiding time and names tied winners. The OSM-selected station itself is not independently verified by the engine.
- Running timers now carry original start/duration anchors into visible projections; injected mobile commands use the real wall clock; pause records current remaining time and resume shifts the anchor to preserve it. Timer and rules flows have focused passing coverage.
- Full verification for the previous online/Radar slice passed: `npm test` (237 tests), `npm run mobile:typecheck`, and `git diff --check`. The project virtual environment provides the importer dependency `openpyxl`.
- The scanned Draw 1 Expand 1 power-up is now a typed, immediate engine effect: it draws one card, stacks the hand limit for the rest of the round, remains usable during an active answer window, and resets on next-round start. The 239-test full suite and mobile typecheck pass after the change.
- Veto ends the answer window without a response or card reward but counts as asked for repeat cost. Randomize cancels its original question, selects an unasked same-category question allowed at the selected scale, and starts a fresh timer; the original remains eligible at its original cost. A randomized null response resolves without map geometry and still counts for the printed hider reward. The generated base pack carries both typed effects. [rulebook scan, p. 46; `tests/engine/cards.test.ts`]
- The app labels a randomized null response as a completed no-map-change result instead of showing it as a pending map outcome. Full suite passed 243 tests; mobile typecheck and `git diff --check` pass.
- Thermometer importer and automatic resolver slice verified: `npm test` passed 246 tests before the Measuring correction; the full suite then passed 247 tests, `npm run mobile:typecheck` passed, and `git diff --check` was clean. At the time, the generated import report had 18 warning and 5 informational findings.
- The printed Thermometer thresholds are 1 km and 5 km for all scales, 15 km for medium/large, and 75 km for large; only hotter/colder are valid answers. The workbook's 805 m, 4.8 km, 16 km, 80 km values and `same` option were not faithful to the scanned Investigation Book, so the importer now uses the printed values and records four informational corrections. Automatic answers require provable travel distance and confidence-bounded direction; the map uses the same frozen seeker endpoints as the answer. [Investigation Book scan, p. 3; base rulebook scan, p. 17; `tests/engine/automatic-question-answer.test.ts`]
- The importer report at the Veto/Randomize slice contained 23 findings: 18 warnings and 5 informational items (including the 4 Thermometer corrections). Later card typing removed four more warnings.
- The base rulebook says Measuring answers are only “closer” or “further”; the app previously allowed “same”. The importer now emits only the printed choices and engine validation rejects `same`. [base rulebook scan pp. 22–23]

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
- The scanned Draw 1, Expand 1 power-up is now imported as typed authoritative data. Playing it draws one card, raises the hider limit for the remainder of the round without interrupting an active answer window, and the raised limit is enforced for later draws/rewards, visible only to hiders/referee, and reset at round rotation.
- Question response timers now trigger an authority timeout at the exact printed deadline. The hider may still submit an answer; the result updates the map, scored hiding time excludes the late interval, and no card reward is issued. Veto/Randomize are blocked after their response window. The hider sees an overdue/pause message. [base rulebook scan p. 5; `tests/engine/endgame-questions.test.ts`; `tests/transport/online-runtime.test.ts`]
- Online game commands receive their timestamps from the authority server, preventing a modified or misconfigured phone clock from backdating a late answer. [tests/transport/online-edge-function.test.ts]
- The web map fallback draws a bounded set of OSM tiles with attribution and now pans/zooms on touch with visible zoom/reset controls. It does not prefetch or offer offline tile downloads.
- Visual comparison against the live reference confirms the app map shares the city-boundary, station-zone, and street-map concepts but is not visually identical: the reference is a Leaflet map workbench with editable layers and question controls; this app embeds a game-first map in its match workflow.
- [x] Add searchable administrative-region subtraction to the map builder: contained regions become polygon holes, included/excluded choices survive draft and scenario persistence/sharing, and excluded areas are applied with boolean polygon clipping even when they cross the selected boundary or overlap included regions. Focused map-region tests (27 passing), full suite (393 passing), mobile typecheck, Expo web export, and `git diff --check` pass (2026-10-25). Hand-drawn polygon masks remain open.
- Photo questions now support the scanned ordinary-play case where the requested subject does not exist in the hiding zone: the hider may submit a null answer, resolve without a map deduction, and still take the card reward. The control is available in both Question Center and the inline live-map answer flow; non-photo questions reject it. [base rulebook scan p. 32; `tests/engine/endgame-questions.test.ts`]
- All 18 Photos prompts now show the relevant scan-derived specification in question selection and answer entry, with source pages in generated provenance; conflicting workbook requirement text is omitted from the player view. Several wrong workbook units/conditions were corrected from the printed pages. [base rulebook scan, printed pp. 32–35; `tests/importer/importer.test.ts`; `apps/mobile/tests/question-guidance.test.ts`]
- Hidden Hangman is now an assisted card with a hider-private five-letter word, public seeker guesses/misses and masked progress, role-specific inputs on Cards and Live Map, and an authority gate that blocks app movement/location updates and questions until solve or hider-confirmed game end. Hider team/player projections retain the secret; seeker projections do not receive it before completion. Full suite 332/332, mobile typecheck, and Expo web/iOS/Android exports passed. The group still applies its own Hangman loss rule and confirms actual transit boarding because the scan gives no incorrect-guess limit or onboard control. [base rulebook scan p. 56; `tests/engine/cards.test.ts`; checked 2026-10-25]

### Completed implementation slice: Curse of Water Weight

- [x] Type the scanned effect and scale bonus in both workbook mappings; regenerate the draft pack.
- [x] Start a persistent per-run challenge when the card resolves; seeker reports control new-liquid acquisition and loss, with an authority-enforced question gate and one-time bonus per challenge.
- [x] Carry curse awards into the final round score, including hider-facing and seeker-facing status in Question Center and Live Map.
- [x] Verify scan-derived importer values, acquisition/loss/question rules, scoring, full suite (395/395), mobile typecheck, Expo web/iOS/Android exports, and `git diff --check` (2026-10-25).

### Completed implementation slice: Curse of the Endless Tumble

- [x] Import the scan-derived 30 m distance, unaided die requirement, clean-landing and lost-die rule, 5/6 success result, and 10/20/30-minute scale bonus as an assisted typed card effect.
- [x] Record the hider's casting roll (5/6 cancels the curse; 1–4 activates it), gate seeker questions until a qualifying roll is reported, and immediately add the scale bonus for each reported hit.
- [x] Enforce the base rule that only one typed curse blocking questions or transit may be active at once.
- [x] Add a shared Question Center and map challenge panel with explicit die, distance, unaided, and hit attestations; keep the physical outcomes group-attested.
- [x] Verify cast cancellation/activation, the 30 m boundary, clean-landing requirement, question gate, bonus accumulation, both workbook mappings, full suite (402/402), mobile typecheck, web/iOS/Android exports, and `git diff --check` (2026-10-25).

### Completed implementation slice: crossing administrative-region subtraction

- [x] Replace the contained-hole-only subtraction path with boolean polygon union/intersection/difference over searchable administrative polygons.
- [x] Support exclusions that cross the included boundary, multiple overlapping included regions, contained holes, and no-area intersections safely.
- [x] Verify map-region selection tests (27), full suite (393), mobile typecheck, Expo web export, and `git diff --check` (2026-10-25).

### Completed implementation slice: authority verification for online hiding stations

- [x] Load transit station features from the match's playable boundary on the online authority before accepting `set_hiding_zone`.
- [x] Verify submitted station OSM identity, normalized name, and coordinates against the authority snapshot; reject missing or mismatched server data.
- [x] Include mapped tram stops and public transport stations in the trusted station lookup, consistent with the map picker.
- [x] Accept custom stations only when their ID, name, and coordinates match the host-saved map configuration; skip external map lookup for custom-only maps and picks.
- [x] Keep the single-device referee path usable with local station selection when external map data is unavailable.
- [x] Verify OSM/custom station paths and source selection; full suite and mobile typecheck pass (2026-10-25).

### Active implementation slice: enforce Transit Line's moving-transit precondition

- [x] Recheck the scanned rule: seekers must be on moving transit; the hider says yes only when the ridden service actually stops at their station, including express-pass-through no answers (base rulebook printed p. 18).
- [x] Require a seeker attestation before asking Transit Line and preserve it in the public question record/projection.
- [x] Show the scan-faithful confirmation in the player UI, including the screenshot/share-stop-list recommendation. Keep the hider's answer manual because no active-service feed verifies a complete, direction-specific stop list for every region.
- [x] Verify engine rejection/recording, question UI guidance/payload, full suite (359/359), mobile typecheck, and `git diff --check` (2026-10-25).

### Active implementation slice: preserve device altitude for Sea Level

- [x] Recheck the scan: Sea Level compares player altitude, and the book warns phone readings may be inaccurate (base rulebook printed p. 26).
- [x] Capture altitude and vertical accuracy from foreground/background device fixes and carry them in authoritative location events.
- [x] Keep altitude and its vertical datum in server-side samples without adding it to movement-track projections.
- [x] Verify device-sample normalization, event/reducer persistence, projection privacy, full suite (363/363), mobile typecheck, and `git diff --check` (2026-10-25).
- [x] Correct datum tagging by platform: Expo SDK 55's iOS bridge exposes Apple's mean-sea-level `CLLocation.altitude`, while Android and Web expose WGS84 ellipsoid height; add a regression test. Full suite (364/364), mobile typecheck, and `git diff --check` pass (2026-10-25).
- [x] Load a bounded, region-only Copernicus elevation grid in batches, so player coordinates stay local to the authority and terrain data can support both the answer and map.
- [x] Resolve closer/further only when vertical uncertainty ranges are separable; use the same grid and seeker reference for the approximate map deduction.
- [x] Show the DEM's resolution, limits, and source attribution in player-facing answer guidance; preserve manual handling when uncertainty is inadequate.
- [x] Implement a Sea Level resolver that falls back to manual answering when altitude uncertainty cannot distinguish the comparison; use the same terrain samples for approximate map deduction.
- [x] Verify provider failure and sparse-region fallback; full suite (370/370), mobile typecheck, Edge Function check, `git diff --check`, and live bounded-region smoke request pass (2026-10-25).

### Completed implementation slice: Curse of the Lemon Phylactery

- [x] Import the scanned p. 55 rule as an assisted challenge with 30/45/60-minute scale bonuses in both workbook mappings.
- [x] Track each seeker's lemon-contact attestation, block the next question until every seeker reports contact, and award the hider bonus immediately on every reported loss.
- [x] Add seeker self-report controls and a host referee control in both Question Center and the live map; preserve the challenge through the hider run and reset it on round rotation.
- [x] Reject the curse during endgame and prevent overlap with other typed question/transit blockers.
- [x] Verify full suite (403/403), mobile typecheck, content-pack regeneration, and `git diff --check` (2026-10-25). Physical contact remains player-attested.

### Completed implementation slice: Curse of the Gambler’s Feet

- [x] Import the scanned p. 55 casting rule and the printed 20/40/60-minute duration as an assisted, scale-aware card effect in both workbook mappings.
- [x] Resolve the hider’s d6 cast (even cancels; odd activates), then track each seeker’s own die allowance and reported steps for the timed effect.
- [x] Record accidental oversteps as step debt that requires additional die rolls before walking again; allow explicitly attested safety exceptions and report player step counts as physical attestations.
- [x] Add controls in the card window, Question Center, and live map; allow the unrestricted card in endgame and verify that Lemon Phylactery’s printed endgame restriction remains specific to that card.
- [x] Verify cast parity, allowance decrement, per-player isolation, overstep recovery, expiration, both workbook profiles, full suite (407 tests), mobile typecheck, and web export (2026-10-25).

### Completed implementation slice: Curse of the Egg Partner

- [x] Add failing tests for scale bonus, acquisition gate, seeker-reported abandonment/cracking, one-time scoring, and endgame prohibition.
- [x] Import this card as a typed assisted challenge from both workbook profiles and regenerate the personal draft pack.
- [x] Persist egg acquisition/loss state, block questions until acquisition, and award its printed scale bonus once.
- [x] Add seeker and referee controls on Cards, Question Center, and the live map; retain physical egg state as an attestation.
- [x] Verify the printed two-card casting cost, engine/importer paths, full suite (409/409), mobile typecheck, web export, and `git diff --check` (2026-10-25). Physical egg acquisition and member loss remain attested.

### Completed implementation slice: Curse of the Jammed Door

- [x] Add failing tests for scale timer/cooldown, visible-door attestation, 2d6 threshold, shared retry cooldown, distinct doors, authorization, and expiration.
- [x] Import the scanned card as a typed assisted effect in both workbook profiles and regenerate the base pack.
- [x] Persist doorway attempts and enforce failed-door cooldowns until the scale timer expires.
- [x] Add a role-aware reporting panel to Cards, Question Center, and the live map.
- [x] Verify the two-card casting cost, engine/importer/mobile flows, full suite (410/410), typecheck, Expo web export, and `git diff --check` (2026-10-25). Doorway visibility and dice remain player/referee attestations.

### Completed implementation slice: Curse of the Zoologist evidence challenge

- [x] Verify the imported card wording and scanned clarification (base rulebook p. 50); real-world animal identity and “wild” classification remain human judgments.
- [x] Add typed challenge state for the hider's selected category and a camera photo from every seeker.
- [x] Require public card-linked camera attachments, reject seeker evidence captured before challenge activation, and block the next question until every active seeker submits.
- [x] Add hider category/photo setup, seeker photo reporting, public evidence review, and camera-only capture guidance in the card flow.
- [x] Verify both workbook mappings, engine gates/permissions/round reset, public evidence contexts, full suite (413/413), mobile typecheck, Expo web export, and `git diff --check` (2026-10-25). Binary persistence depends on the active attachment-storage mode.

### Completed implementation slice: Curse of the Luxury Car comparison

- [x] Import the scanned assisted effect for both workbook profiles, including base rulebook p. 50 MSRP guidance.
- [x] Record the hider's photographed car and production-year MSRP, then allow a seeker to submit a new public camera photo and higher MSRP claim.
- [x] Keep questions blocked until the hider accepts the seeker's car evidence; require a different photo after rejection.
- [x] Add hider, seeker, and referee UI for photo capture, MSRP entry, comparison, and adjudication; retain public evidence context after the card window closes.
- [x] Verify evidence ownership/freshness, strict MSRP comparison, rejection/retry, authorization, round reset, both import profiles, full suite (415/415), mobile typecheck, Expo web export, and `git diff --check` (2026-10-25). Model/year and MSRP source remain team-adjudicated where uncertain.
