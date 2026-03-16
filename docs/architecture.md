# Architecture

## Purpose

This document defines the Phase 0 architecture for a production-oriented, generic transit hide-and-seek mobile platform. The architecture is intentionally content-driven, authority-first, and transport-agnostic so the same game engine can power:

- online cloud multiplayer
- local nearby host-authoritative multiplayer
- single-device referee mode

The cleaned workbook `Jet Lag The Game - cleaned for import.xlsx` is the preferred seed-content source. Legacy workbook variants may still be supported by the importer, but no engine behavior is allowed to depend on workbook literals that are not first normalized into canonical content-pack JSON.

## Architectural Principles

- Build one domain engine, not three separate gameplay implementations.
- Keep content definitions outside the engine and import them through canonical schemas.
- Protect hidden information by projection scope, not by UI discipline alone.
- Treat command validation, randomness, timers, and hidden coordinates as authoritative concerns.
- Keep packages small and dependency direction explicit.
- Prefer append-only events plus derived projections for resumability and auditing.

## Proposed Repository Structure

```text
.
|-- apps/
|   `-- mobile/
|       |-- app/
|       |-- src/
|       |   |-- features/
|       |   |-- navigation/
|       |   |-- providers/
|       |   |-- services/
|       |   `-- ui/
|       |-- assets/
|       `-- tests/
|-- packages/
|   |-- shared-types/
|   |   |-- src/domain/
|   |   |-- src/events/
|   |   |-- src/contracts/
|   |   `-- src/projections/
|   |-- domain/
|   |   |-- src/entities/
|   |   |-- src/value-objects/
|   |   |-- src/permissions/
|   |   `-- src/rules/
|   |-- engine/
|   |   |-- src/commands/
|   |   |-- src/handlers/
|   |   |-- src/state-machine/
|   |   |-- src/projections/
|   |   |-- src/randomness/
|   |   `-- src/timers/
|   |-- geo/
|   |   |-- src/geometry/
|   |   |-- src/constraints/
|   |   |-- src/features/
|   |   `-- src/adapters/
|   |-- content-schema/
|   |   |-- schemas/
|   |   |-- src/normalizers/
|   |   `-- src/versioning/
|   |-- content-import/
|   |   |-- src/xlsx/
|   |   |-- src/csv/
|   |   |-- src/json/
|   |   |-- src/mapping-profiles/
|   |   `-- src/reporting/
|   |-- transport/
|   |   |-- src/contracts/
|   |   |-- src/online/
|   |   |-- src/local-nearby/
|   |   `-- src/single-device/
|   `-- test-kit/
|       |-- src/fixtures/
|       |-- src/factories/
|       `-- src/scenarios/
|-- supabase/
|   |-- migrations/
|   |-- functions/
|   |   |-- command-gateway/
|   |   |-- projection-rebuilder/
|   |   `-- attachment-hooks/
|   `-- seed/
|-- tests/
|   |-- unit/
|   |-- integration/
|   |-- contract/
|   `-- fixtures/
|       |-- workbooks/
|       `-- content-packs/
|-- docs/
|   |-- architecture.md
|   |-- geometry-constraint-architecture.md
|   |-- state-machine.md
|   |-- import-schema.md
|   |-- transport-architecture.md
|   |-- risks.md
|   `-- phased-plan.md
|-- package.json
|-- pnpm-workspace.yaml
`-- turbo.json
```

## Package Responsibilities

### `apps/mobile`

- Expo + React Native application shell only
- role-specific screens, forms, map views, chat UI, and device integrations
- no authoritative rules, hidden-info derivation, or workbook parsing logic

### `packages/shared-types`

- canonical TypeScript contracts shared across runtimes
- command envelopes, event envelopes, projection types, identifiers, enums
- no business logic beyond shape-level validation helpers

### `packages/domain`

- pure domain entities and value objects
- permission vocabulary, role semantics, rule invariants, and game terminology
- no transport or database knowledge

### `packages/engine`

- authoritative command handlers
- hierarchical state machine
- event emission, derived projections, timer reconciliation, randomness services
- shared by cloud authority, local host authority, and single-device referee runtime

### `packages/geo`

- geometry operations and feature taxonomy
- exact and approximate constraint generation
- provider adapters for normalized geographic features
- strict playable-region clipping and bounded search-area updates

### `packages/content-schema`

- canonical JSON Schema 2020-12 documents
- schema-versioned content-pack contracts
- normalization helpers for IDs, enums, scale gates, and source provenance

### `packages/content-import`

- XLSX, CSV, and JSON import pipelines
- mapping profiles, validation, row-level reporting, source fingerprinting
- no direct UI concerns

### `packages/transport`

- transport abstraction plus concrete adapters for:
  - Supabase-backed online mode
  - LAN host-authoritative nearby mode
  - single-device referee mode
- sync envelopes, reconnect policy, subscription contract, attachment transfer contract

### `packages/test-kit`

- reusable fixtures for event logs, projections, workbooks, content packs, and transport scenarios

### `supabase`

- migrations, RLS policies, storage conventions, and edge/function entrypoints
- cloud-side command ingress and projection rebuild jobs

### `tests`

- cross-package unit, integration, and contract tests
- repository-wide scenarios that should not live inside one package

## Dependency Direction

The intended dependency flow is:

```text
apps/mobile -> transport, shared-types, content-schema
transport -> engine, shared-types
engine -> domain, geo, shared-types, content-schema
content-import -> content-schema, shared-types
geo -> shared-types
domain -> shared-types
test-kit -> all runtime packages as helpers only
```

Rules:

- `apps/mobile` must never import command handlers or persistence internals directly.
- `transport` may call engine interfaces, but `engine` must not depend on transport implementations.
- `content-import` may emit canonical content JSON, but it must not reach into app code.
- `geo` stays provider-agnostic by depending on normalized feature classes rather than raw OpenStreetMap tags at call sites.

## Runtime Architecture

The platform uses one authoritative command/event loop:

1. A client emits a `CommandEnvelope`.
2. The active authority validates actor, current state, permissions, and content references.
3. The engine emits one or more `DomainEvent` records.
4. Events are appended to the event log.
5. Projections are rebuilt incrementally for each `ProjectionScope`.
6. The transport adapter distributes only the projection slices allowed for that recipient.

This model allows:

- replay and resumability
- deterministic test scenarios
- secure hidden-info boundaries
- online, nearby, and single-device execution with one rules engine

## Canonical Vocabulary

These shared interfaces are the design vocabulary across all planning documents.

| Interface | Responsibility |
| --- | --- |
| `CommandEnvelope` | Transport-neutral wrapper carrying actor identity, target match/session, command payload, idempotency key, and client sequence metadata. |
| `DomainCommand` | A validated gameplay/admin instruction such as `ask_question` or `play_card`. |
| `DomainEvent` | Immutable fact emitted by the authority and appended to the event log. |
| `MatchAggregate` | Authoritative in-memory representation rebuilt from events and used to validate commands. |
| `MatchProjection` | Redacted read model tailored to a role, team, device, or admin context. |
| `ProjectionScope` | Visibility boundary such as `authority`, `host_admin`, `team_private`, `player_private`, `public_match`, or `event_feed_public`. |
| `TransportAdapter` | Runtime adapter that submits commands, streams projections, syncs snapshots, and transfers attachments. |
| `CommandGateway` | Authority-side boundary used by transport implementations to execute commands against the engine. |
| `SyncEnvelope` | Snapshot plus event-catch-up payload used for reconnect and replication. |
| `ContentPack` | Versioned bundle of rulesets, decks, cards, categories, templates, map presets, and constraints. |
| `ImportReport` | Structured summary of warnings, errors, provenance, normalization decisions, and output artifacts for one import job. |
| `RulesetDefinition` | Data-driven game policy describing phases, cooldowns, visibility policies, and win conditions. |
| `MapPresetDefinition` | Playable region preset plus feature dataset references and map-policy settings. |
| `ConstraintDefinition` | Typed rule or answer-derived spatial/metadata narrowing instruction. |
| `CardEffectDefinition` | Generic, schema-driven card effect payload with automation level and resolution requirements. |
| `QuestionResolverDefinition` | Strategy descriptor describing how a question is answered and how it affects constraints. |
| `TimerPolicy` | Reusable timer/cooldown definition that can be applied to phases, actions, and status effects. |
| `VisibilityPolicy` | Declarative rule describing which scopes can view a field, entity, or attachment. |

## Authority and Projection Model

The authority owns:

- current `MatchAggregate`
- authoritative event log
- timer clock source and reconciliation
- authoritative randomness and dice results
- raw hidden hider coordinates
- private hands and unresolved effect payloads
- full attachment metadata including exact upload provenance

Clients receive projections only. A projection can include:

- public match state
- team-private hand information
- player-private prompts or confirmations
- redacted chat/media records
- derived spatial overlays

Derived map output must stay inside the selected playable region boundary. If a constraint cannot be clipped exactly, the authority must degrade it to approximate or metadata-only output instead of emitting an out-of-bounds area.

A projection must never include a field that would require the client to self-censor later.

## Core Domain Model

### Match and Participation

| Entity | Type | Key Fields | Notes |
| --- | --- | --- | --- |
| `Match` | Aggregate root | `matchId`, `mode`, `lifecycleState`, `activeSubstate`, `contentPackRef`, `rulesetRef`, `mapPresetRef`, `createdBy`, `revision` | One authoritative game session across any transport mode. |
| `Player` | Entity | `playerId`, `profileId`, `displayName`, `avatarRef`, `connectionState`, `deviceIds` | Represents a human participant or a local guest identity. |
| `Team` | Entity | `teamId`, `side`, `name`, `memberIds`, `sharedHandPolicy`, `chatChannelId` | Supports one hider team and one or more seeker teams if a ruleset allows it. |
| `RoleAssignment` | Entity | `assignmentId`, `playerId`, `matchId`, `role`, `teamId`, `grantedPermissions`, `confirmedAt` | Distinguishes role from team membership and allows admin overrides. |
| `LocalSession` | Entity | `localSessionId`, `matchId`, `hostDeviceId`, `networkMode`, `joinSecret`, `snapshotVersion`, `lastHeartbeatAt` | Used for nearby mode and referee recovery. |
| `DevicePeer` | Entity | `peerId`, `playerId`, `deviceName`, `transportIdentity`, `authState`, `lastSeenAt` | Tracks LAN guests or local devices joined to a session. |

### Content and Rules

| Entity | Type | Key Fields | Notes |
| --- | --- | --- | --- |
| `ContentPack` | Versioned definition | `packId`, `packVersion`, `schemaVersion`, `title`, `status`, `sourceFingerprint`, `provenance` | Canonical bundle imported from workbook/JSON. |
| `RulesetDefinition` | Definition | `rulesetId`, `packId`, `scalePolicies`, `phasePolicies`, `questionPolicies`, `cardPolicies`, `locationPolicies`, `visibilityPolicies` | Describes game behavior without code changes. |
| `DeckDefinition` | Definition | `deckId`, `packId`, `ownerScope`, `drawPolicy`, `entries`, `shufflePolicy` | Deck composition only; no runtime card ownership. |
| `DeckEntry` | Value object | `cardDefinitionId`, `quantity`, `weight`, `sourceRowRef` | Used to build draw piles from content. |
| `CardDefinition` | Definition | `cardDefinitionId`, `deckId`, `kind`, `subtype`, `name`, `effect`, `visibility`, `timingWindow`, `tags` | Generic enough for time bonus, power-up, curse, or blank cards. |
| `QuestionCategoryDefinition` | Definition | `categoryId`, `name`, `resolverKind`, `promptTemplate`, `drawRule`, `defaultTimerPolicy`, `scaleGates` | Category-level defaults shared by many question templates. |
| `QuestionTemplateDefinition` | Definition | `templateId`, `categoryId`, `promptParams`, `answerSchema`, `resolver`, `constraintOutputs`, `requirements`, `scaleGates` | Represents one askable question variant. |
| `MapPresetDefinition` | Definition | `mapPresetId`, `regionShape`, `featureDatasets`, `visibilityLayers`, `travelPolicies` | Selectable preset for a city/region or reusable board footprint. |
| `ConstraintDefinition` | Definition | `constraintId`, `kind`, `inputSchema`, `outputArtifactKinds`, `confidencePolicy`, `explanationTemplate` | Type contract for interpreted narrowing logic. |

### Runtime Gameplay

| Entity | Type | Key Fields | Notes |
| --- | --- | --- | --- |
| `CardInstance` | Entity | `cardInstanceId`, `cardDefinitionId`, `ownerType`, `ownerId`, `zone`, `visibilityScope`, `state` | Runtime copy of a card that can move through draw/discard/exile/hand zones. |
| `QuestionInstance` | Entity | `questionInstanceId`, `templateId`, `askedBy`, `targetTeamId`, `status`, `answerPayload`, `startedAt`, `resolvedAt` | Tracks one question lifecycle from selection to resolution. |
| `Timer` | Entity | `timerId`, `kind`, `policyRef`, `ownerRef`, `startedAt`, `pausedAt`, `expiresAt`, `status` | Covers hide phase, question windows, cooldowns, effect durations, and photo deadlines. |
| `StatusEffect` | Entity | `statusEffectId`, `sourceRef`, `effectKind`, `appliesTo`, `durationRef`, `visibilityScope`, `state` | Used for curses, bonuses, cooldown modifications, and temporary locks. |
| `LocationSample` | Entity | `sampleId`, `playerId`, `teamId`, `capturedAt`, `accuracyMeters`, `redactionLevel`, `geometryRef` | Raw samples stay authority-only; derived outputs vary by role. |
| `ConstraintRecord` | Entity | `constraintRecordId`, `definitionId`, `sourceQuestionId`, `sourceCardId`, `geometryArtifactRef`, `metadataArtifact`, `confidence`, `active` | Runtime application of a constraint definition. |

### Communication and Audit

| Entity | Type | Key Fields | Notes |
| --- | --- | --- | --- |
| `ChatChannel` | Entity | `channelId`, `matchId`, `scope`, `participantIds`, `status` | Supports lobby, team, admin, or public event channels. |
| `ChatMessage` | Entity | `messageId`, `channelId`, `senderId`, `body`, `attachments`, `visibilityScope`, `sentAt` | Same transport contract in online and nearby modes. |
| `Attachment` | Entity | `attachmentId`, `kind`, `storageRef`, `mimeType`, `visibilityScope`, `ownerRef`, `captureMetadata` | Metadata may be more sensitive than the media itself. |
| `EventLogEntry` | Entity | `eventId`, `matchId`, `sequence`, `eventType`, `actorRef`, `payload`, `visibilityScope`, `occurredAt` | Append-only audit stream and replay source. |
| `ProjectionSnapshot` | Entity | `snapshotId`, `matchId`, `scope`, `lastEventSequence`, `stateHash`, `serializedState` | Used for reconnect and quick rebuild. |
| `ImportJob` | Entity | `importJobId`, `sourceType`, `mappingProfileId`, `startedAt`, `completedAt`, `status`, `outputPackRef` | Tracks one workbook/JSON import execution. |
| `ImportError` | Entity | `importErrorId`, `importJobId`, `sheetName`, `rowNumber`, `columnName`, `severity`, `code`, `message` | Row-level validation and normalization reporting. |

## Ownership Boundaries

### Mobile UI owns

- navigation and presentation
- device permission flows
- local caches of projections
- user input collection and command submission

### Engine owns

- legal state transitions
- timer semantics
- draw/dice randomness
- card resolution windows
- question and constraint resolution
- projection building and redaction

### Transport owns

- authentication session binding
- delivery guarantees and reconnect
- LAN discovery or cloud subscription setup
- attachment upload/download transport

### Content system owns

- canonical schemas
- workbook normalization
- source provenance
- import reporting and versioning

## Hidden-Information Rules

These rules are architectural, not optional UI conventions:

- Raw hider coordinates are stored only in authority-only state.
- Seeker projections may include answer outcomes and derived constraint overlays, but never raw hider geometry or raw hider location history.
- Team-private hands are visible only to the owning team or host/admin scopes defined by the ruleset.
- Player-private prompts, pending confirmations, and hidden attachments must never be copied into public event payloads.
- Attachment metadata is split into:
  - public presentation metadata
  - private provenance metadata
- Event log entries carry a `visibilityScope` so replay into a public projection cannot accidentally hydrate private fields.

## Storage Model

The architecture assumes three data layers:

1. Event log
   - append-only source of truth
   - required for replay, export, audit, and recovery
2. Derived projections
   - optimized read models for role-specific views
   - rebuilt incrementally from events
3. Snapshots
   - periodic serialized aggregate or scope-specific state
   - accelerates reconnect and local-host recovery

Content packs are stored separately from match runtime data and referenced by version. A published content pack is immutable.

## Testing Boundaries

The architecture is designed so engine-critical behavior can be tested without the UI:

- `packages/domain` and `packages/engine` receive deterministic unit tests
- `packages/content-import` receives workbook fixture and validation tests
- `packages/transport` receives contract tests around reconnect and projection redaction
- `tests/integration` covers multi-step game scenarios using the same command/event interfaces planned for production

## Phase 0 Decisions

- Repository shape: workspace monorepo
- Canonical content contract source: JSON Schema 2020-12
- Nearby mode baseline: LAN host-authoritative over Wi-Fi or hotspot
- First content source: workbook import into canonical JSON
- Expo and UI scaffolding: deferred until the engine, importer, and transport contracts are stable
