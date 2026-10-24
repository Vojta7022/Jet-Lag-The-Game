# Jet Lag Hide + Seek App: Current State and Rulebook Research

Research date: 2026-10-21; implementation update: 2026-10-23

## Project state

The repository is a substantial Expo/TypeScript monorepo, not an empty scaffold. It has a mobile client, content importer, schemas, command/event engine, state machine, geometry package, role-scoped projections, transport adapters, Supabase migrations, and a meaningful unit-test suite. The project-local README documents a map, question, cards, chat/evidence, movement, admin, lobby, and match setup flows.

Important implementation boundaries:

- **Map and game engine:** Real first-pass flows exist. The native map supports searched/bundled playable regions, bounded map overlays, candidate search areas, and seeker movement tracks. Question and card screens call engine commands.
- **Single-device referee:** A persistent referee fallback, role-reveal flow, and full scored round runtime test exist. The primary target is online, one device per player.
- **Online:** Supabase Auth, a `game-authority` Edge Function command gateway, atomic revision commits, scoped projections, polling sync, and attachment storage are implemented. A follow-up migration removes the legacy broad table/storage policies and scopes attachments by active match membership and visibility. The gateway and migration have not been deployed or validated against a live Supabase/PostgreSQL project, and a cellular multi-phone round has not been field tested.
- **Nearby:** Host/guest contracts, runtime, heartbeat, and in-memory session handling exist. There is no LAN device transport or discovery, so two phones cannot yet join through this mode.
- **Platform gaps:** Background location and production provider/backend hardening are deferred. The web map uses a bounded fallback rather than the native tile map.

The workspace currently includes 286 TypeScript/TSX source files excluding the reference clone, 27 root test files, and 24 mobile test files. These counts are inventory only; tests and app startup were not run during this research pass.

Several documents are stale against the code. `docs/phased-plan.md` still schedules foundational packages and the Expo shell as future phases, while those now exist. The `packages/domain`, `packages/engine`, and `packages/geo` READMEs still call their packages placeholders. The app README is the most useful current capability summary, but it also states that no device launch was performed in its last validation.

## Imported content and scanned books

The existing generated workbook pack contains:

- six categories: Matching, Measuring, Thermometer, Radar, Tentacles, and Photos
- 80 printed templates: 20, 20, 4, 10, 8, and 18 respectively. The workbook contained an extra “4th Admin (Borough)” Measuring row not present in the scanned booklet; the importer now excludes it from the base pack and records an informational discrepancy.
- 37 card definitions representing 125 deck cards
- 15 warning-level and 5 informational import findings, with a `draft_output` status. Four informational items record Thermometer values corrected to the printed thresholds.
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

The initial implementation chose a persisted single-device referee round to prove the existing engine and map. That slice is now implemented and covered by a full real-runtime integration test. On 2026-10-24 the product owner clarified that the intended primary game is online, with a separate phone for every player and role-specific views. Treat the referee flow as a fallback/regression path, not as completion of the product. The current code has an authenticated Edge Function command gateway and role-aware projections, but production security/deployment and cellular field play remain unverified. Radar and Thermometer resolve automatically from location samples. Matching/Measuring resolve for mapped OSM classes, including station-name-length Matching and foreign consulates, and Tentacles resolves for supported place classes; administrative-boundary Matching, unmapped classes, and Photos remain manual/assisted. The authority now also enforces printed response deadlines: late answers pause scored hiding time until answered and grant no cards. Curse of the Drained Brain is a typed card effect: the hider chooses three exact prompts from different categories, seekers see the public lock and cannot ask those prompts, other questions in the same categories remain available, and locks reset on hider rotation. Curse of the Overflowing Chalice gives the hider three optional extra-draw opportunities without increasing the keep count; eligible reward deals consume the opportunities and the state resets on hider rotation. [source: base rulebook scan p. 5; `tests/engine/endgame-questions.test.ts`; cleaned workbook Curses sheet; `tests/engine/gameplay-rules.test.ts`; `tests/engine/question-reward.test.ts`; OSM tagging, https://wiki.openstreetmap.org/wiki/Tag:office=diplomatic]

The approved online architecture and acceptance criteria are recorded in [Online Player Game Design](../docs/superpowers/specs/2026-10-24-online-player-game-design.md). Implementation includes an authenticated Edge Function command gateway, atomic event commits, membership-bound role projections, multi-phone adapter tests, hider-private location with seeker tracks, foreground GPS sharing that starts automatically during active play after permission is granted, and automatic location-backed answers for Radar, Thermometer, mapped Matching/Measuring, and supported Tentacles place classes. Production deployment/security review, background GPS, unmapped question classes, remaining card rules, and field play are still open.

Security audit finding (2026-10-24): the earlier development RLS migration grants anon and authenticated blanket access to match tables and all objects in the attachment bucket. The server-authority migration grants service-role access but does not remove those development policies. A follow-up migration now removes the blanket grants and scopes attachment objects by active match membership plus public/team/player/host identity. It is not yet applied or tested against a live PostgreSQL database; Supabase CLI and project credentials are absent from this checkout.

Administrative-region automation needs country-aware OSM boundary levels. OSM documents `admin_level` as country-specific; Nominatim reverse geocoding returns the nearest suitable indexed object and can be wrong for the queried coordinate. Do not use centroids or frequent exact-coordinate requests to public Nominatim as authoritative boundary data. [source: https://wiki.openstreetmap.org/wiki/Key:admin_level; https://nominatim.org/release-docs/latest/api/Reverse/; checked 2026-10-24]

Suggested sequence:

1. Install from the checked-in npm workspace and start the selected app target. Record actual launch/build issues and fix only blockers needed for a reproducible developer start.
2. Reconcile the scanned booklet and rulebook against the generated pack. Add explicit base ruleset, scale policy, card timing/effect requirements, and all question costs/timers/availability. Keep manual/referee adjudication where geography, photos, or real-world judgement cannot be inferred reliably.
3. Complete one match loop on the selected mode: create, assign roles, configure and apply a bounded map, hide, ask/answer a question, resolve map effects/cards/timers, enter endgame, mark the find, rotate hider, and calculate the round result.
4. Port the useful reference-map interactions into the existing map: custom/add/subtract regions, import/export/share of a scenario, hiding station zones, question overlays, and clear exact/approximate/manual result labels.
5. Run the focused test suite and device/simulator validation after feature work, then evaluate online security, background location/battery, crash recovery, and release packaging for the chosen mode.

## Decisions and next steps

The first implementation target was **single-device referee**. Home has a direct “Start Referee Game” action that selects this runtime and opens match setup. The complete round passes through the single-device runtime integration. The product's primary target was subsequently clarified as online multi-device play; the prototype gateway and role-scoped flows are implemented, but production authority and privacy review plus cellular field validation remain incomplete.

The referee's event log and latest snapshot persist with AsyncStorage, along with a resume pointer and the host profile. Startup rebuilds the authority, reconnects the host session, and returns to Home with the existing Continue action. The live map now connects the protected-reveal manager to a referee handoff panel. Tokens/checkpoints persist across restart, and recovery hides any private projection that was open when the app stopped. AsyncStorage supports Android, iOS, and web; it is unencrypted key-value storage, not a secrets store. [AsyncStorage platform support](https://github.com/react-native-async-storage/async-storage), checked 2026-10-23.

Round completion now adds scale-adjusted values from time bonus cards still in the hider's hand to final hiding time; time bonuses cannot be played, and discarded bonuses do not score. At match start, every registered participant is shuffled into a persisted hider order and the first hider is drawn randomly. The referee can start the next round within 10 minutes; each transition reshuffles and resets the deck, clears prior-round clue/map state, and carries the last found coordinates into the next round's map start marker. After every scheduled player completes a round, the final screen ranks them by final hiding time and recognizes tied winners. [Rulebook scans, pp. 3–6; `tests/engine/round-rotation.test.ts`; checked 2026-10-24.]

The full round has an integration test through the real single-device runtime: it covers randomized roles, station-centered zone, arrival/location lock, hide timer expiry, seeker endgame trigger, visual find confirmation, and scoring with a controlled clock. The standard rules and question categories have been rechecked against the two local scans. The scans remain local. The generated workbook pack has six categories, 80 printed question templates, 37 card definitions / 125 card instances, and 15 warnings plus 5 informational findings; it remains a personal-use draft until the workbook's redistribution rights and remaining card warnings are reviewed. The printed Thermometer thresholds are 1/5 km for all scales, 15 km for medium/large, and 75 km for large, with only hotter/colder answers. The importer corrects four incompatible workbook values. Keep scans and full-book transcription out of public distribution.

The web map fallback renders OpenStreetMap tiles for the visible play boundary with persistent on-map attribution. Tile selection stays bounded to the current map view and does not prefetch or support offline downloads. The implementation follows the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) for the standard tile URL, browser referrer, cache behavior, visible attribution, and no bulk/offline downloads (checked 2026-10-24). The web canvas supports drag and pinch navigation plus zoom/reset controls. Map scenarios can be saved and loaded locally and shared as compressed app deep links; shared links open standalone previews with boundary and selected hiding-zone overlays. This gives the app the map workflow it needs inside its match UI, but the reference remains a visually different Leaflet workbench with its own file import/export, editable arbitrary layers, and custom station-source editor.

The content distribution decision for this pass is personal/private use. The workbook pack stays draft; do not redistribute its full scans or book-length transcription. Review source rights and the 18 importer warnings before a public content-pack release. Generic-engine versus Jet Lag Home Game prioritization remains a broader product choice.

A physical GPS/device walkthrough remains open. On 2026-10-24, the workstation had no `simctl` or Xcode app, no `adb` or Android emulator, and no connected phone visible over USB. The app's full referee round passed via the real runtime integration test; mobile web was reviewed at a 390 px viewport. These checks do not replace native GPS validation.

## Sources

- Local scans read for this research: `~/Downloads/2026-10-04 10-19.pdf` and `~/Downloads/2026-10-04-10-56.pdf` (scanned 2026-10-04; checked 2026-10-21).
- App source and new map workflow updates: local personal project repository (checked 2026-10-24).
- Map reference source: [taibeled/JetLagHideAndSeek](https://github.com/taibeled/JetLagHideAndSeek), local inspected revision `179eb0f` (2026-08-28), MIT license.
- Official [Hide + Seek Expansion Pack Vol. 1 additional reference rules](https://rules.jetlagthegame.com/expansion/) (checked 2026-10-21).
