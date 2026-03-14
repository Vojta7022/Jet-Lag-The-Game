# Phased Plan

## Purpose

This document defines a realistic implementation sequence for the generic transit hide-and-seek platform. It deliberately prioritizes engine and data foundations before UI-heavy work.

## Phase Ordering Principles

- Do not scaffold the Expo app until the domain contracts and authority model are stable enough to support it.
- Finish schema and importer work before building gameplay flows that depend on content.
- Build the state machine before the full engine so command legality is explicit.
- Keep transport adapters thin by stabilizing the command/event engine first.
- Add geospatial complexity only after the importer and engine contracts exist.

## Phase Summary

| Phase | Primary Outcome |
| --- | --- |
| 0 | planning docs approved |
| 1 | shared schemas, contracts, and repository foundations |
| 2 | workbook importer and import reporting |
| 3 | authoritative state machine and command model |
| 4 | domain engine, projections, timers, and engine-critical tests |
| 5 | online transport core and Supabase authority contracts |
| 6 | local nearby host runtime and single-device referee adapter |
| 7 | geospatial constraints and feature-data adapters |
| 8 | Expo shell and role-specific mobile UI |
| 9 | hardening, observability, export/archive, and security review |

## Phase 0: Planning Signoff

### Scope

- create and review:
  - `docs/architecture.md`
  - `docs/state-machine.md`
  - `docs/import-schema.md`
  - `docs/transport-architecture.md`
  - `docs/risks.md`
  - `docs/phased-plan.md`

### Exit Criteria

- shared vocabulary is agreed
- repository structure is accepted
- workbook import strategy is accepted
- hidden-info boundaries and authority model are accepted

## Phase 1: Schemas and Shared Contracts

### Goals

- establish the workspace foundations for shared packages
- define canonical JSON Schema contracts
- define shared TypeScript contract mirrors and identifier/value-object vocabulary

### Deliverables

- workspace package layout for:
  - `shared-types`
  - `domain`
  - `content-schema`
  - `content-import`
  - `engine`
  - `transport`
  - `geo`
  - `test-kit`
- JSON Schema 2020-12 files for:
  - content pack
  - deck
  - card definition
  - question category
  - question template
  - ruleset
  - map preset
  - constraint definition
- shared contracts for:
  - commands
  - events
  - projections
  - sync envelopes
  - visibility policies
  - timer policies

### Tests

- schema validation tests
- reference integrity tests for sample documents
- redaction contract tests for projection scope types

### Exit Criteria

- schemas validate sample fixtures
- contract names and enums are stable enough for importer work
- no Expo app scaffolding yet

## Phase 2: Workbook Importer and Reports

### Goals

- ingest `Jet Lag The Game.xlsx`
- normalize workbook content into canonical JSON
- produce row-level import reports and draft/publish gating

### Deliverables

- workbook mapping profile for the provided XLSX
- normalization helpers for IDs, labels, distances, times, and scale gates
- importer output for:
  - hider deck
  - curses
  - six question categories
- structured `ImportReport` with blocking and non-blocking issues
- draft content-pack fixture generated from the workbook

### Tests

- workbook fixture import test
- malformed row tests
- duplicate normalized ID tests
- deck-total reconciliation tests
- curse row-pairing tests

### Exit Criteria

- workbook imports reproducibly into canonical draft JSON
- all known workbook quirks are either normalized or reported
- publication gating works for ambiguous inputs such as `Radar -> Choose`

## Phase 3: Command Model and State Machine

### Goals

- formalize the authoritative command set
- implement the hierarchical state machine and permission checks
- make illegal transitions explicit before building broader engine behavior

### Deliverables

- command envelope types and handler registry
- lifecycle state machine with `paused` overlay support
- permission matrix by role and phase
- timer hooks for phase entry/exit
- state transition audit events

### Tests

- valid transition tests
- illegal transition rejection tests
- pause/resume preservation tests
- command ownership tests by role and state

### Exit Criteria

- every planned gameplay/admin command has a defined legal state surface
- state machine tests cover the required scenarios from the planning docs

## Phase 4: Domain Engine and Projections

### Goals

- implement the authoritative aggregate, event log, and derived projections
- handle timers, randomness, cards, questions, and runtime visibility

### Deliverables

- `MatchAggregate` rebuild logic from events
- event emission and projection builders
- runtime card instances and deck/pile operations
- question instance lifecycle
- timer reconciliation and cooldown processing
- projection redaction by scope

### Tests

- engine unit tests for command handling
- projection redaction tests
- replay and snapshot rebuild tests
- timer reconciliation tests
- engine-critical card/question flow tests

### Exit Criteria

- engine-critical logic is testable without UI
- replay from event log is deterministic
- seeker/public projections cannot expose hidden coordinates or private hands

## Phase 5: Online Transport Core

### Goals

- connect the engine to an online authority boundary using Supabase
- define storage, auth, RLS, and sync contracts for cloud play

### Deliverables

- command gateway server boundary
- authoritative event persistence contract
- role-scoped projection storage contract
- Realtime sync model
- attachment metadata and storage policy
- auth-to-player mapping model

### Tests

- contract tests for command ingress
- projection access tests by role
- reconnect tests from stale snapshot versions
- attachment visibility tests

### Exit Criteria

- online mode can be reasoned about end-to-end at the contract level
- hidden-info boundaries are enforced server-side, not only in the client

## Phase 6: Local Nearby and Single-Device Runtime

### Goals

- implement the host-authoritative nearby runtime
- add the single-device referee adapter on the same engine contracts

### Deliverables

- local host session manager
- local event/snapshot persistence
- LAN command and sync contract
- QR join/session-secret design
- referee-mode in-process adapter
- recovery guidance for host loss

### Tests

- guest reconnect tests
- host restart and snapshot-restore tests
- mode parity tests against online command/event behavior
- referee-mode hidden-info handoff tests

### Exit Criteria

- nearby mode works from one trusted host authority
- single-device mode is functional as a fallback
- transport divergence is measured and bounded

## Phase 7: Geospatial Constraint Engine

### Goals

- implement feature taxonomy, geometry operations, and constraint derivation
- support both exact and approximate narrowing

### Deliverables

- normalized feature-class adapters
- geometry primitives and artifact storage model
- question resolvers for:
  - Matching
  - Measuring
  - Thermometer
  - Radar
  - Tentacles
  - Photos
- confidence/exactness policy
- explanation generation for derived constraints

### Tests

- geometry operation tests
- resolver tests with fixture datasets
- contradiction and degradation tests
- metadata-only fallback tests for incomplete datasets

### Exit Criteria

- core question categories can resolve safely
- unsupported or low-confidence cases degrade explicitly rather than silently guessing

## Phase 8: Expo Shell and Mobile UI

### Goals

- only now introduce the mobile app shell
- build role-specific screens on top of stable domain and transport contracts

### Deliverables

- Expo app scaffold
- navigation shell and providers
- lobby, setup, and gameplay dashboards
- role-specific projections and action surfaces
- map UI, chat UI, hand/deck UI, timers, and admin tools

### Tests

- UI integration tests against mocked transport adapters
- end-to-end smoke flows for:
  - room creation
  - hide phase
  - question flow
  - card play
  - reconnect

### Exit Criteria

- mobile UI consumes stable projections rather than reimplementing game rules
- role-specific secrecy boundaries remain intact in the client

## Phase 9: Hardening and Release Readiness

### Goals

- prepare the system for production-oriented operation
- close observability, export, archive, and security gaps

### Deliverables

- event-log export and archive flows
- admin audit tooling
- metrics and structured logs
- crash and sync diagnostics
- battery/location guidance and guardrails
- security and privacy review pass

### Tests

- long-run reconnect/resume tests
- export/archive tests
- permission and RLS audit tests
- performance and battery smoke tests

### Exit Criteria

- no critical hidden-info, transport, or replay issues remain open
- release checklist is complete for the targeted mode set

## Review Gate at the End of Every Phase

Each phase should end with:

1. a brief build summary
2. remaining gaps and deferred decisions
3. lint/test execution for the phase scope
4. a go/no-go review before moving to the next phase

## Explicit Deferrals

These are intentionally not front-loaded:

- Expo scaffolding before contracts stabilize
- full UI design before engine projections exist
- advanced local peer discovery before basic LAN host-authoritative transport works
- fully authoritative automation for every curse before manual and assisted resolution paths are proven
