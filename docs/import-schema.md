# Import Schema

## Purpose

This document defines the canonical import model for content packs, with `Jet Lag The Game - cleaned for import.xlsx` as the preferred workbook source. The importer must normalize workbook content into versioned JSON that is safe for long-term reuse, testing, and later content-pack authoring. Legacy workbook variants can still be supported behind the mapping profile.

The canonical source of truth is JSON Schema Draft 2020-12. TypeScript and runtime validators should be generated or mirrored from these contracts later, but they are not the source of truth for Phase 0.

## Import Design Principles

- Preserve raw workbook provenance, but normalize canonical IDs and display names.
- Keep the engine generic. Workbook-specific quirks live in a mapping profile, not in the engine.
- Represent freeform content with structured fields where possible and raw text where automation is not yet reliable.
- Reject invalid published packs, but allow draft import reports with warnings.
- Treat import output as immutable once published.

## Workbook Inventory

The cleaned workbook currently contains these sheets:

| Sheet | Observed Structure | Canonical Mapping | Notes |
| --- | --- | --- | --- |
| `Curses` | tabular rows with `name`, `description`, `casting_cost` | curse `CardDefinition`s plus casting-cost text | exact workbook wording should be preserved in card UI |
| `Matching` | tabular rows with `subject`, `cost`, `time`, `question` | one `QuestionCategoryDefinition` plus one `QuestionTemplateDefinition` per row | subject-driven yes/no wording |
| `Measuring` | tabular rows with `target`, `cost`, `time`, `question` | one category plus templates | target-driven comparative distance questions |
| `Thermometer` | tabular rows with `distance`, `availability`, `cost`, `time`, `question`, `notes` | one category plus templates | uses seeker movement history and workbook availability text |
| `Radar` | tabular rows with `distance`, `cost`, `time`, `question`, `notes` | one category plus templates | threshold-distance questions, including ambiguous rows that may still map to draft/manual templates |
| `Tentacles` | tabular rows with `place`, `distance`, `availability`, `cost`, `time`, `question` | one category plus templates | nearest-candidate questions with imported place and availability text |
| `Photos` | tabular rows with `subject`, `requirements`, `availability`, `cost`, `time`, `question` | one category plus templates | photo prompts with imported requirements and timing |
| `Hider Deck` | tabular rows with `category`, `card`, `quantity`, `odds` | one `DeckDefinition`, several `CardDefinition`s, and `DeckEntry`s | time bonuses, power-ups, blanks, and curse odds all originate here |

Legacy workbook layouts can still be supported in the mapping profile, but the cleaned workbook above is the preferred import source.

## Workbook-Specific Normalization

The canonical pack should normalize obvious spelling or labeling issues while keeping raw workbook text in provenance metadata and import warnings.

Examples from the provided workbook:

| Raw Workbook Text | Canonical Display Text | Canonical Slug |
| --- | --- | --- |
| `Amusment Park` | `Amusement Park` | `amusement-park` |
| `Museam` / `Museams` | `Museum` / `Museums` | `museum` / `museums` |
| `Forign Conssulate` | `Foreign Consulate` | `foreign-consulate` |
| `Movie Theateres` | `Movie Theaters` | `movie-theaters` |
| `Hopsitals` | `Hospitals` | `hospitals` |
| `travled` | `traveled` | not used as an ID, but corrected for prompt display if desired |
| `Requirments` | `Requirements` | not used as an ID |
| Photos sheet title cell `Radar` | `Photos` | `photos` |

Normalization rules:

- IDs use lowercase kebab-case and are generated from normalized display text.
- Raw source text is preserved in `sourceProvenance.rawLabel`.
- Every normalization correction produces at least a warning-level import report entry.

## Canonical Output Shape

The importer produces one `ContentPack` JSON document plus an `ImportReport`.

### `ContentPack`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | `string` | yes | JSON Schema contract version, semver-style |
| `packId` | `string` | yes | stable slug such as `transit-hide-and-seek-core` |
| `packVersion` | `string` | yes | semantic version of the pack content |
| `title` | `string` | yes | human-readable pack title |
| `summary` | `string` | no | short description |
| `status` | enum | yes | `draft`, `published`, `archived` |
| `sourceFingerprint` | `string` | yes | hash of the imported source artifact |
| `importerVersion` | `string` | yes | importer build/version that produced the pack |
| `mappingProfileId` | `string` | yes | workbook-specific mapping profile |
| `provenance` | `object` | yes | source file, sheets, import timestamp, normalization decisions |
| `rulesets` | `RulesetDefinition[]` | yes | at least one ruleset |
| `decks` | `DeckDefinition[]` | yes | one or more deck definitions |
| `cards` | `CardDefinition[]` | yes | all reusable card definitions |
| `questionCategories` | `QuestionCategoryDefinition[]` | yes | six categories for the first workbook |
| `questionTemplates` | `QuestionTemplateDefinition[]` | yes | one template per askable prompt variant |
| `mapPresets` | `MapPresetDefinition[]` | yes | may contain placeholders only if intentionally draft |
| `constraints` | `ConstraintDefinition[]` | yes | canonical constraint contracts referenced by questions/cards |
| `featureTaxonomy` | `object[]` | no | optional normalized feature classes used by questions |
| `compatibility` | `object` | yes | supported transport modes, engine minimum version, and scale support |

### Shared Schema Fragments

These fragments are reused across the canonical schema set.

| Fragment | Purpose |
| --- | --- |
| `SourceProvenance` | workbook sheet name, row number, raw label, raw value, source cell references |
| `ScaleSet` | normalized scale applicability using `small`, `medium`, `large` |
| `TimerPolicyRef` | duration, pause behavior, extension policy, and escalation policy |
| `VisibilityPolicyRef` | allowed scopes such as `authority`, `host_admin`, `team_private`, `player_private`, `public_match` |
| `FeatureClassRef` | normalized feature taxonomy key, optional provider fallback tags |
| `DistanceValue` | numeric meters plus optional raw miles/kilometers text |
| `TimeValue` | numeric seconds plus optional raw text |
| `TextBlock` | canonical display text with optional raw/original value |
| `RequirementDefinition` | structured requirement plus raw fallback text |

## JSON Schema Designs

The following sections define the canonical entity contracts that later JSON Schema files should implement.

### `DeckDefinition`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `deckId` | `string` | yes | stable identifier |
| `packId` | `string` | yes | owning content pack |
| `name` | `string` | yes | display name |
| `ownerScope` | enum | yes | `hider_team`, `seeker_team`, `hider_player`, `seeker_player`, `shared_public`, `host_only` |
| `drawPolicy` | `object` | yes | shuffle rules, reshuffle rules, initial draw rules |
| `visibilityPolicy` | `VisibilityPolicyRef` | yes | who can inspect the deck and zones |
| `entries` | `DeckEntry[]` | yes | composition of the deck |
| `summary` | `object` | no | optional deck composition summary for import traceability |
| `sourceProvenance` | `SourceProvenance[]` | yes | references to workbook rows |

`DeckEntry` shape:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `cardDefinitionId` | `string` | yes | references `CardDefinition.cardDefinitionId` |
| `quantity` | `integer` | yes | must be greater than zero |
| `weight` | `number` | no | optional draw weighting for future packs |
| `notes` | `string` | no | importer comments |
| `sourceProvenance` | `SourceProvenance[]` | yes | row-level traceability |

### `CardDefinition`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `cardDefinitionId` | `string` | yes | stable identifier |
| `packId` | `string` | yes | owning content pack |
| `deckId` | `string` | yes | source deck |
| `kind` | enum | yes | `time_bonus`, `power_up`, `curse`, `blank`, `custom` |
| `subtype` | `string` | no | more specific classifier |
| `name` | `string` | yes | canonical display name |
| `shortName` | `string` | no | compact label for UI |
| `description` | `string` | yes | player-facing text |
| `automationLevel` | enum | yes | `manual`, `assisted`, `authoritative` |
| `timingWindow` | `object` | no | which phases or triggers allow play |
| `castingCost` | `RequirementDefinition[]` | no | especially important for curses |
| `preconditions` | `RequirementDefinition[]` | no | extra play constraints |
| `effects` | `CardEffectDefinition[]` | yes | structured effects with raw fallback text |
| `rewardsOrPenalties` | `CardEffectDefinition[]` | no | conditional bonus or penalty outcomes |
| `requirements` | `object` | no | `requiresPhotoUpload`, `requiresDiceRoll`, `requiresLocationSelection`, `requiresManualApproval` |
| `durationPolicy` | `TimerPolicyRef` | no | used for timed curses or persistent effects |
| `visibilityPolicy` | `VisibilityPolicyRef` | yes | private/public handling |
| `tags` | `string[]` | no | filter and analytics tags |
| `sourceProvenance` | `SourceProvenance[]` | yes | workbook traceability |

### `QuestionCategoryDefinition`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `categoryId` | `string` | yes | stable identifier |
| `packId` | `string` | yes | owning content pack |
| `name` | `string` | yes | canonical display name |
| `resolverKind` | enum | yes | `nearest_feature_match`, `comparative_distance`, `hotter_colder`, `threshold_distance`, `nearest_candidate`, `photo_challenge`, `custom` |
| `promptTemplate` | `string` | yes | default category prompt |
| `drawRule` | `object` | yes | for example `drawCount` and `pickCount` |
| `defaultTimerPolicy` | `TimerPolicyRef` | yes | category-level time limit |
| `defaultAnswerSchema` | `object` | yes | structured answer contract |
| `visibilityPolicy` | `VisibilityPolicyRef` | yes | who sees question selection, answer, and evidence |
| `scaleSet` | `ScaleSet` | yes | supported game scales |
| `defaultConstraintRefs` | `string[]` | no | canonical constraints usually emitted by this category |
| `notes` | `string` | no | authoring notes |
| `sourceProvenance` | `SourceProvenance[]` | yes | workbook traceability |

### `QuestionTemplateDefinition`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `templateId` | `string` | yes | stable identifier |
| `packId` | `string` | yes | owning content pack |
| `categoryId` | `string` | yes | parent category |
| `name` | `string` | yes | display name of the prompt variant |
| `promptOverrides` | `object` | no | prompt pieces that override category defaults |
| `featureClassRefs` | `FeatureClassRef[]` | no | used by Matching, Measuring, Tentacles |
| `parameters` | `object` | no | distance, subject, or choice configuration |
| `answerSchema` | `object` | yes | question-specific answer contract |
| `resolverConfig` | `object` | yes | details needed by the resolver kind |
| `constraintRefs` | `string[]` | yes | emitted or potentially emitted constraint types |
| `requirements` | `RequirementDefinition[]` | no | photo requirements, approval requirements, etc. |
| `scaleSet` | `ScaleSet` | yes | supported scales for this template |
| `visibilityPolicy` | `VisibilityPolicyRef` | yes | answer/evidence visibility |
| `sourceProvenance` | `SourceProvenance[]` | yes | workbook traceability |

### `RulesetDefinition`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `rulesetId` | `string` | yes | stable identifier |
| `packId` | `string` | yes | owning content pack |
| `name` | `string` | yes | display name |
| `description` | `string` | no | player-facing summary |
| `supportedModes` | enum array | yes | `online`, `local_nearby`, `single_device_referee` |
| `scaleDefinitions` | `object[]` | yes | defines `small`, `medium`, `large` semantics |
| `phasePolicies` | `object` | yes | hide duration, endgame triggers, pause semantics |
| `questionPolicies` | `object` | yes | cooldowns, category availability, draw/pick behavior |
| `cardPolicies` | `object` | yes | hand ownership, stacking, discard, blank-card behavior |
| `locationPolicies` | `object` | yes | update cadence, precision, hidden-location policy |
| `chatPolicies` | `object` | yes | channel scopes and moderation rules |
| `visibilityPolicies` | `object` | yes | default role/team/public exposure |
| `winConditions` | `object[]` | yes | normal and endgame endings |
| `transportNotes` | `object` | no | known local or online limitations |
| `sourceProvenance` | `SourceProvenance[]` | yes | workbook or manual authoring traceability |

### `MapPresetDefinition`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `mapPresetId` | `string` | yes | stable identifier |
| `packId` | `string` | yes | owning content pack |
| `name` | `string` | yes | display name |
| `description` | `string` | no | human-readable summary |
| `geometry` | `object` | yes | polygon, circle, or bounding box definition |
| `forbiddenRegions` | `object[]` | no | optional disallowed areas |
| `featureDatasetRefs` | `string[]` | yes | named datasets or bundles |
| `layerPolicies` | `object` | yes | visible overlays and provider constraints |
| `locationPrecisionPolicy` | `object` | yes | rounding, retention, and disclosure rules |
| `travelPolicies` | `object` | no | transit-only or special route rules |
| `sourceProvenance` | `SourceProvenance[]` | yes | how the preset was authored/imported |

### `ConstraintDefinition`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `constraintId` | `string` | yes | stable identifier |
| `packId` | `string` | yes | owning content pack |
| `name` | `string` | yes | display name |
| `kind` | enum | yes | `inside_polygon`, `outside_polygon`, `within_distance`, `beyond_distance`, `nearest_feature_match`, `comparative_distance`, `hotter_colder`, `same_admin_region`, `nearest_candidate`, `metadata_only`, `photo_evidence`, `custom` |
| `inputSchema` | `object` | yes | data expected from question/card resolution |
| `outputArtifactKinds` | enum array | yes | `geometry`, `metadata`, `explanation`, `manual_review` |
| `confidencePolicy` | `object` | yes | exact, approximate, or manual-only handling |
| `explanationTemplate` | `string` | yes | human-readable audit output |
| `visibilityPolicy` | `VisibilityPolicyRef` | yes | who sees the derived result |
| `sourceProvenance` | `SourceProvenance[]` | yes | where the definition came from |

## Hider Deck Modeling

The `Hider Deck` sheet is a deck summary, not a full normalized card list. The importer should expand it as follows:

### Deck

- Create one `DeckDefinition` with:
  - `deckId: "hider-main"`
  - `ownerScope: "hider_team"`
  - `name: "Hider Main Deck"`
- Preserve the workbook summary rows in `DeckDefinition.summary`.

### Time Bonus Cards

Each color row becomes one `CardDefinition` with `kind: "time_bonus"` and a scale-aware effect payload.

Example design:

```json
{
  "cardDefinitionId": "time-bonus-red",
  "kind": "time_bonus",
  "name": "Time Bonus Red",
  "effects": [
    {
      "effectType": "add_time_bonus",
      "minutesByScale": {
        "small": 2,
        "medium": 3,
        "large": 5
      }
    }
  ]
}
```

Deck entries:

- `time-bonus-red` quantity `25`
- `time-bonus-orange` quantity `15`
- `time-bonus-yellow` quantity `10`
- `time-bonus-green` quantity `3`
- `time-bonus-blue` quantity `2`

### Power-Up Cards

Each power-up row becomes one generic `CardDefinition` with `kind: "power_up"`.

Initial power-up cards:

- `randomize`
- `veto`
- `duplicate`
- `move`
- `discard-1-draw-2`
- `discard-2-draw-3`
- `draw-1-expand-1`

These should use structured effect payloads where semantics are known, and `automationLevel: "assisted"` if they still need host confirmation.

### Curse Cards

The summary row `Curses = 24` does not define the curse content. Instead:

- import all 24 curse cards from the `💀Curses` sheet
- create one deck entry per curse card with `quantity: 1`
- reconcile the count against the summary row total of `24`

### Blank Cards

Create a synthetic blank-card definition:

```json
{
  "cardDefinitionId": "blank-card",
  "kind": "blank",
  "name": "Blank Card",
  "description": "No effect.",
  "automationLevel": "authoritative",
  "effects": []
}
```

Then add one deck entry with `quantity: 25`.

## Curse Modeling

Curse cards should use a generic challenge/effect model rather than hardcoded card-specific logic.

Recommended structure:

| Field | Meaning |
| --- | --- |
| `castingCost` | what must be true or spent to cast the curse |
| `preconditions` | situational gates such as distance or mode restrictions |
| `effects` | the burden or rules change applied to the target |
| `rewardsOrPenalties` | bonus time or extra consequences if the target fails |
| `resolutionMode` | `manual`, `assisted`, or `authoritative` |

Examples from the workbook:

- photo-based burden with manual verification
- dice-gated restriction
- category disable effect
- persistent movement constraint
- timed question lock
- item-carrying obligation

Because workbook curse text is freeform, the importer should support partial structuring:

- structured fields for obvious common concepts
- raw full text preserved for all curses
- `automationLevel` downgraded to `manual` or `assisted` when full authoritative resolution is not yet safe

## Question Category Modeling

Each workbook question sheet becomes one `QuestionCategoryDefinition` and multiple `QuestionTemplateDefinition`s.

| Category | Resolver Kind | Typical Answer Schema | Constraint Output |
| --- | --- | --- | --- |
| `matching` | `nearest_feature_match` | boolean or yes/no | exact or approximate nearest-feature equivalence |
| `measuring` | `comparative_distance` | enum such as `closer`, `further`, optional `same` | comparative distance narrowing |
| `thermometer` | `hotter_colder` | enum `hotter`, `colder`, optional `same` | distance trend constraint from seeker movement history |
| `radar` | `threshold_distance` | boolean | within/outside radius geometry |
| `tentacles` | `nearest_candidate` | selected candidate feature | ranking/nearest-candidate narrowing |
| `photos` | `photo_challenge` | attachment plus approval outcome | usually metadata-only, no direct geometry unless explicitly supported |

### Matching

Category defaults from workbook:

- draw rule: `Draw 3, Pick 1`
- time limit: `5 Minutes`
- prompt: `Is your nearest _____ the same as my nearest _____?`

Mapping rule:

- each body row becomes a question template with a normalized `featureClassRef`
- answer schema defaults to `yes_no`
- constraint definitions referenced:
  - `nearest-feature-match`
  - `same-admin-region` for admin rows when geometry is metadata-based

### Measuring

Category defaults:

- draw rule: `Draw 3, Pick 1`
- time limit: `5 Minutes`
- prompt: `Compared to me, are you closer to or further from _____?`

Mapping rule:

- each row becomes a template keyed by a normalized feature class
- answer schema defaults to comparative enum
- resolver uses hidden hider coordinates and current seeker coordinates

### Thermometer

Category defaults:

- draw rule: `Draw 2, Pick 1`
- time limit: `5 Minutes`
- prompt: `I just traveled (at least) [Distance]. Am I hotter or colder?`

Mapping rule:

- scale-gate rows such as `All Games`, `Medium & Large`, and `Large Only` apply to subsequent distance rows until another gate row appears
- each distance row becomes a template with a normalized `DistanceValue`
- resolver requires at least one historical seeker location before the question

### Radar

Category defaults:

- draw rule: `Draw 2, Pick 1`
- time limit: `5 Minutes`
- prompt: `Are you within [Distance] of me?`

Mapping rule:

- each distance row becomes one template
- normal distance rows map to numeric meters
- the workbook row `Choose` is ambiguous; for v1 it should import as a draft template with:
  - `parameters.distanceMode = "manual-choice"`
  - warning-level import notice
  - publish blocked until a ruleset or editor provides a bounded choice policy

### Tentacles

Category defaults:

- draw rule: `Draw 4, Pick 2`
- time limit: `5 Minutes`
- prompt: `Of all the [Places] within [Distance] of me, which are you closest to?`

Mapping rule:

- scale-gate rows determine applicability
- each place+distance row becomes one template
- resolver identifies candidate features within the radius around the hider, then compares the chosen answer against hider proximity
- when feature data is incomplete, the result may downgrade to metadata-only or manual review

### Photos

Category defaults:

- draw rule: `Draw 1`
- time limit: `10 Minutes` for small/medium, `20 Minutes` for large
- prompt: `Send a photo of [subject].`

Mapping rule:

- scale-gate rows determine applicability
- each row becomes a template with:
  - `parameters.subject`
  - `requirements` from the workbook notes column
  - `answerSchema` requiring at least one attachment
- photo templates default to `manual` or `assisted` verification

## Proposed Mapping from Each Sheet

| Sheet | Canonical Outputs |
| --- | --- |
| `Form Responses 1` | `ContentPack.provenance.unmappedSheets[]` entry only |
| `Hider Deck` | one `DeckDefinition`, five time bonus `CardDefinition`s, seven power-up `CardDefinition`s, one blank `CardDefinition`, `DeckEntry`s for all of the above, and a deck-summary provenance block |
| `💀Curses` | 24 curse `CardDefinition`s plus 24 `DeckEntry`s attached to `hider-main` |
| `1. Matching` | category `matching` plus template per listed feature class |
| `2. Measuring` | category `measuring` plus template per listed feature class |
| `3. Thermometer` | category `thermometer` plus template per distance row with normalized scale gates |
| `4. Radar` | category `radar` plus template per distance row, including a flagged draft template for `Choose` |
| `5. Tentacles` | category `tentacles` plus template per place/radius combination |
| `6. Photos` | category `photos` plus template per subject/requirements row |

## Validation Rules

The importer must validate both schema correctness and workbook-specific intent.

### Structural Validation

- every required top-level content array exists
- all IDs are unique within their entity type
- all references resolve:
  - deck entries to cards
  - templates to categories
  - templates and cards to constraints or rulesets when referenced
- every published pack has at least one ruleset and one map preset

### Workbook-Specific Validation

- normalized IDs remain unique after typo cleanup
- distance tokens parse into numeric meters
- time tokens parse into numeric seconds or minutes
- scale-gate labels normalize to one of:
  - `small`, `medium`, `large`
  - `medium`, `large`
  - `large`
- every curse body row is followed by a `Casting Cost` row
- curse count in the deck summary matches the number of imported curse definitions
- deck total is reconciled against entry quantities
- formulas in the workbook are treated as informational, not authoritative
- category header blocks must include draw rule, time rule, and prompt text
- feature-class rows must resolve to a normalized taxonomy key or remain draft with warning

### Publication Rules

The pack may remain `draft` with warnings, but it must not be `published` if any of these remain unresolved:

- fatal parse error
- missing required reference
- unresolved duplicate normalized ID
- unbounded ambiguous template such as `Radar -> Choose`
- deck count mismatch
- broken curse row pairing

## Row-Level Import Reporting

Every import generates a structured `ImportReport`.

### Required Report Fields

| Field | Type | Notes |
| --- | --- | --- |
| `importJobId` | `string` | stable job ID |
| `schemaVersion` | `string` | schema contract version used |
| `packVersion` | `string` | content pack version assigned |
| `importerVersion` | `string` | importer build/version |
| `mappingProfileId` | `string` | workbook mapping profile |
| `sourceFingerprint` | `string` | input hash |
| `status` | enum | `success`, `warning`, `failed`, `draft_output` |
| `generatedPackId` | `string` | output pack reference |
| `issues` | `ImportIssue[]` | errors, warnings, and informational notices |

### `ImportIssue`

Each row-level issue must include:

| Field | Required | Notes |
| --- | --- | --- |
| `sheetName` | yes | original workbook sheet name |
| `rowNumber` | yes | 1-based row number |
| `columnName` | yes | workbook column label or inferred logical column |
| `fieldPath` | yes | canonical output path such as `questionTemplates[radar-choose].parameters.distanceMode` |
| `severity` | yes | `info`, `warning`, `error` |
| `code` | yes | stable machine-readable code |
| `message` | yes | human-readable explanation |
| `rawValue` | yes | original workbook value |
| `normalizedValue` | yes | importer-transformed value or `null` |
| `suggestedFix` | yes | actionable next step for the author or reviewer |

Recommended optional fields:

- `sheetCell`
- `sourceRange`
- `relatedIssueIds`
- `blocking`
- `rawLabel`

### Suggested Error Codes

- `UNKNOWN_SHEET`
- `UNSUPPORTED_SCALE_GATE`
- `DISTANCE_PARSE_FAILED`
- `TIME_PARSE_FAILED`
- `DUPLICATE_NORMALIZED_ID`
- `CURSE_COST_ROW_MISSING`
- `DECK_TOTAL_MISMATCH`
- `UNRESOLVED_FEATURE_CLASS`
- `AMBIGUOUS_MANUAL_TEMPLATE`
- `NORMALIZATION_CORRECTION_APPLIED`

## Versioning Strategy

### Schema Versioning

- `schemaVersion` follows semantic versioning.
- Major change: backward-incompatible schema changes.
- Minor change: backward-compatible field additions or enum expansions.
- Patch change: clarifications or non-structural fixes.

### Pack Versioning

- `packVersion` is independent of `schemaVersion`.
- Content-only edits bump `packVersion`.
- Re-importing the same workbook with normalization improvements but no gameplay meaning change should still bump `packVersion`.
- Published pack versions are immutable.

### Importer Versioning

- `importerVersion` tracks the importer code path used to produce the pack.
- It is required for debugging drift between imports from the same workbook.

### Mapping Profile Versioning

- `mappingProfileId` identifies the workbook-specific extraction logic.
- Example: `xlsx.jetlag.v1`
- A future revised workbook can receive a new mapping profile without changing the engine.

### Source Fingerprint

- `sourceFingerprint` should be a content hash of the source workbook bytes.
- This allows deterministic comparison across import jobs and supports duplicate-detection workflows.

## Canonical Constraint Set for the First Workbook

The first content pack should define at least these reusable constraint definitions:

- `nearest-feature-match`
- `same-admin-region`
- `comparative-distance`
- `hotter-colder`
- `within-radius`
- `outside-radius`
- `nearest-candidate-feature`
- `photo-evidence`
- `manual-review-only`

Not every question must resolve to exact geometry. The contract should allow:

- exact geometry output
- approximate geometry output
- metadata-only narrowing
- no geometry, manual review only

## Review Scenarios

The importer design should be reviewed against these concrete scenarios:

1. Clean workbook import creates a draft pack with no blocking issues other than intentionally unresolved map presets.
2. Unknown workbook sheet is ignored with a warning and recorded in provenance.
3. Deck total mismatch blocks publication.
4. Malformed distance or time token raises a row-level error with the raw cell value.
5. Two different raw labels normalize to the same slug and trigger `DUPLICATE_NORMALIZED_ID`.
6. A curse without a paired casting-cost row raises `CURSE_COST_ROW_MISSING`.
7. A scale gate that does not map to `small`, `medium`, `large`, `medium+large`, or `large` raises `UNSUPPORTED_SCALE_GATE`.
8. A feature-class row that cannot be mapped to the normalized taxonomy remains draft-only and raises `UNRESOLVED_FEATURE_CLASS`.
