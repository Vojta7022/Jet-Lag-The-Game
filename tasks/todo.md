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
