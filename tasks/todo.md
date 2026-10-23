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
- Remaining playability gaps: hide/search countdowns can reset when commands or projections refresh because synthetic command timestamps are used; the imported draft content pack is not reconciled to the scanned booklets; protected reveal handoffs remain unconnected; web map uses a bounded SVG preview rather than street tiles. These remain separate work items.
