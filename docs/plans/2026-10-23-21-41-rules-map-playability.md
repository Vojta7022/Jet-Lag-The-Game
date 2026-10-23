# Rules-faithful game and map workflows

**Goal:** Make the referee mode enforce the scanned Hide + Seek rules and use the supplied map workbench for transit-station hiding-zone planning.

**Architecture:** Keep the existing command/event engine authoritative. Supply a versioned Home Game base ruleset in the mobile content pack, make rulebook question availability separate from hider card rewards, and add station/hiding-zone overlays to the existing map canvas. Preserve manual referee adjudication for real-world judgments and use exact-versus-approximate labels for automated geography.

**Sources:** Local scans `~/Downloads/2026-10-04 10-19.pdf` and `~/Downloads/2026-10-04-10-56.pdf`; reference clone `repos/JetLagHideAndSeek` at the MIT-licensed [taibeled/JetLagHideAndSeek](https://github.com/taibeled/JetLagHideAndSeek) source.

## Constraints and review cases

- Do not copy the complete copyrighted rulebook text into the public app; encode mechanics and concise player guidance, keeping the local scans as source material.
- Small/medium/large behavior must use the correct scale values; missing scale or missing station data must fail visibly, not silently pick an arbitrary zone.
- Questions are available from the printed book by scale. “Draw N, Pick M” applies to card rewards; repeated questions multiply the reward and repeat each draw/pick as a separate set.
- The next question can be asked after the previous answer is resolved. No unprinted cooldown may block play.
- Live countdowns must survive new projections and pause/resume without restarting or losing elapsed time.
- Endgame begins only when seekers are inside the hider's zone and off transit; found requires both visual identification and distance within 2 m.
- Map overlays must respect region bounds and work on native and web surfaces; source/provider failure must retain attribution and show a useful state.

## Tasks

### 1. Correct investigation-book question availability

- Add failing domain and engine tests proving all scale-allowed questions remain available, a question can be repeated, and repeated use records the correct reward multiplier.
- Remove the pseudo-random question-deal behavior from `packages/domain/src/rules/question-selection.ts` and its mobile wrapper. Keep question card costs in `category.drawRule` solely as hider rewards.
- Update `QuestionCenterScreen.tsx` and `question-rule-model.ts` to show the full category list, response time, hider reward, and repeat multiplier. Keep the active-question single-flight lock.
- Run focused question tests and the complete test suite.

### 2. Enforce the standard scale rules

- Add tests for 30/60/180-minute hide periods, the 5-minute standard response window, photo response windows of 10 minutes for small/medium and 20 minutes for large, and zero post-answer cooldown.
- Replace `buildMobileShellRuleset` fallback values in `apps/mobile/src/runtime/augment-content-pack.ts` with a versioned Home Game ruleset: hiding-zone radius (500/500/1000 m), path proximity (3 m), found distance (2 m plus sighting), scale timers, card hand limit (6), and question timing/cost behavior.
- Teach `packages/engine/src/helpers/content-pack.ts` to read scale-based rules and explicit zero values; have `execute-command.ts` transition directly to ready after resolution when the selected ruleset has no cooldown.
- Preserve nonzero cooldown behavior for custom test packs/rulesets.

### 3. Make timer state durable and honest

- [x] Add failing tests showing a timer's remaining time does not jump back after a command or projection refresh, pause stores the actual remainder, and resume continues from that remainder.
- Replace synthetic mobile command timestamps with an injectable runtime clock defaulting to UTC now; test through a fixed clock.
- Extend visible timer projections with the authoritative start/duration or deadline data needed to compute remaining time from the original timer anchor. Reconcile running timers before pause and card time adjustments.
- [x] Validate with question/hide timers, persistence reload, and pause/resume tests.

### 4. Add rule-aware transit station and zone mapping

- [x] Inspect the reference Overpass station query and station filtering/zone construction; reuse the pattern through the existing map provider boundary.
- [x] Add pure tests for filtering station points to the playable region and constructing 500 m / 1 km geodesic circles around a selected station.
- [x] Render eligible station markers and a selected hiding-zone circle on both `MapCanvas.web.tsx` and `.native.tsx`; provide a local selection workbench.
- Persist and lock the selected hiding zone through authoritative match commands/projections, and enforce its boundaries in the rules engine.
- Keep station overlays separate from the search-area constraint history and provide honest loading, empty, provider-error, and attribution states.

### 5. Port essential map workbench workflow and complete a round

- Add scenario JSON import/export and compact share links using the app's existing boundary, station, scale, and question overlay data; reject malformed/out-of-bound geometry.
- Walk setup → hide → question/answer/reward → deductions → endgame → found → round result and rotation on a local referee match.
- Add engine and UI tests for the exercised transitions; update `tasks/todo.md`, knowledge notes, and the mobile README with verified behavior and remaining manual adjudications.

## Acceptance

- Printed base rules, scale availability, timers, and question reward/repeat behavior match the scanned sources.
- The app can establish and display a playable station-centered hiding zone on both web and native map surfaces.
- A local referee round reaches the found/result state with clocks and map state surviving a refresh/restart.
- `npm run mobile:typecheck` and `env PATH="$PWD/.venv/bin:$PATH" npm test` pass.
