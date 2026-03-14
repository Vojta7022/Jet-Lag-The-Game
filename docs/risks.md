# Risks

## Purpose

This document tracks the major product and technical risks for the generic transit hide-and-seek platform. It is intentionally serious: several of these risks can invalidate whole features if ignored early.

Likelihood and impact use three levels:

- `Low`
- `Medium`
- `High`

## Risk Register

| Risk | Likelihood | Impact | Trigger Signals | Mitigation | Fallback |
| --- | --- | --- | --- | --- | --- |
| Map and geometry complexity outgrows the initial engine design | High | High | contradictory regions, slow spatial queries, hard-to-explain results, rule exceptions piling up | keep a typed constraint engine, separate exact vs approximate constraints, version feature datasets, store human-readable explanations with every derived constraint, test geometry operations with fixtures | degrade specific question templates to metadata-only or manual review and disable unsupported map presets until coverage improves |
| Feature dataset quality is inconsistent across locations | High | High | missing landmarks, wrong admin boundaries, duplicate features, poor transit coverage, impossible question resolution | use normalized feature taxonomy, dataset bundle versioning, preset-level data coverage checks, per-template capability flags, manual override tools | mark templates unavailable for a map preset, fall back to non-spatial clues, or require host/referee adjudication |
| Hidden-information leakage through projections, logs, or queries | Medium | High | seeker client sees unexpected coordinates, private hand data appears in logs, Realtime payloads include sensitive fields, attachment metadata reveals too much | enforce scope-first projection building, keep raw hidden data authority-only, use RLS for online mode, add projection redaction tests, split private metadata from public payloads | invalidate leaked sessions, pause the match, regenerate scoped snapshots, and require admin resume after verification |
| Offline/local networking is unreliable in real travel conditions | High | High | devices cannot discover host, hotspot blocks traffic, frequent disconnects, attachment uploads stall, host app backgrounds | start with host-authoritative LAN design, use QR join, keep local snapshots, add heartbeats and reconnect flows, keep single-device referee mode ready as an escape hatch | move the match to single-device referee mode or continue only on the host device with manual handoff |
| Online and local transports diverge in behavior | Medium | High | commands accepted in one mode but rejected in another, timers differ by mode, projections display different state, bugs only reproduce on one transport | keep one engine and one command/event contract, run shared integration scenarios against all adapters, avoid mode-specific rules logic | freeze release of the weaker mode, disable unsupported features there, and restore parity before adding new gameplay features |
| Card and rules extensibility becomes fragile | Medium | High | new cards require code changes across UI and engine, rulesets cannot express exceptions, curse handling turns into if/else sprawl | use data-driven definitions, separate `automationLevel` from card semantics, keep manual and assisted resolution modes, add extension points for effect types and resolver types | ship new content as manual/referee-assisted only until the engine gains the required structure |
| Workbook import remains ambiguous or brittle | High | Medium | parse failures from merged rows, typos create duplicate IDs, ambiguous rows such as `Choose`, author intent cannot be inferred safely | use explicit mapping profiles, preserve raw provenance, block publish on fatal ambiguity, surface row-level reports, normalize text while preserving raw values | keep the imported pack in `draft`, require manual review/editing, and document unsupported source patterns |
| Mobile battery, location permissions, and background limits reduce playability | High | High | rapid battery drain, missing location samples, OS throttling, permissions denied, host device overheating | make location cadence ruleset-configurable, support reduced-power updates, warn hosts about battery/thermal state, separate precise hidden logic from displayed seeker breadcrumbs | fall back to lower-frequency updates, manual location confirmation, or ruleset variants tuned for lighter tracking |
| Anti-cheat and trust concerns undermine fairness | Medium | High | spoofed GPS, staged photos, hidden coordination outside the app, host abuse in local mode, suspicious command timing | keep authoritative logs, store evidence metadata where allowed, record admin overrides, surface anomaly markers, separate public and audit exports, make host trust assumptions explicit in local/referee modes | mark the match as unverified, require referee confirmation for disputed actions, or disable competitive/ranked interpretation entirely |

## Risk Notes by Area

### Map and Geometry

The platform must admit that not every question can yield a precise polygon. The risk is not only correctness but also usability: a precise but opaque geometry result is still a bad product outcome if players cannot understand why the map changed.

### Dataset Quality

Question categories such as Matching, Measuring, and Tentacles depend on normalized feature data. This means the app has a hidden dependency on geospatial data quality that is separate from the mobile product itself.

### Hidden Information

This is the most sensitive architecture risk. A single projection leak can invalidate the product's trust model. Protection cannot depend on "the client will ignore that field."

### Local Reliability

Nearby mode is desirable for play, but it is also the least predictable runtime environment. Platform restrictions, hotspot behavior, and app backgrounding all matter more than clean lab tests suggest.

### Rules Extensibility

The workbook already contains freeform curse text that does not fit a single rigid automation model. The engine must leave room for partial structure without pretending everything is safely automatable from day one.

## Cross-Cutting Mitigations

The architecture should treat these as standing controls, not optional polish:

- contract tests for projection redaction
- replay tests from event logs and snapshots
- map-feature capability checks per preset and question template
- import jobs that can produce draft output with explicit blocking issues
- a documented referee/manual fallback path for every high-risk automated system

## Review Gates

These risks should be revisited at the end of the early implementation phases:

- after Phase 2 importer work: workbook ambiguity and schema drift
- after Phase 4 engine work: hidden-info, rules extensibility, and geometry complexity
- after Phase 6 transport work: local reliability and transport divergence
- before UI-heavy work: battery/location impact and anti-cheat posture
