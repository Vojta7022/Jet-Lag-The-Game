# Geometry and Constraint Architecture

## Purpose

This document defines the bounded regional search model for the map and constraint engine.

The system must behave like a regional search tool, not an unbounded world map. Every match runs inside one selected playable region, and every derived geometry artifact must stay inside that region.

## Core Rule

The host selects one playable region before the match starts, such as:

- a city, for example Prague
- a larger administrative region, for example Central Bohemia

That selection becomes the hard spatial boundary for the match.

The engine must then:

- load or accept the boundary polygon for that region
- initialize the candidate hider area as the full region boundary
- clip all future geometry-based constraints to that selected region
- never treat area outside the chosen region as valid candidate space
- render remaining and eliminated areas only inside that region boundary

## Runtime Model

The runtime keeps three related spatial concepts:

- `PlayableRegionModel`: the selected boundary polygon and its metadata
- `SearchAreaModel.remainingArea`: the current candidate hider area, initialized from the region boundary
- `SearchAreaModel.eliminatedAreas` and `SearchAreaModel.constraintArtifacts`: bounded overlays derived from questions, cards, or manual referee actions

This means the search surface is always rooted in one selected region. Constraints narrow or annotate that region; they do not create a second independent search space.

## Authority Flow

1. The host selects a city, admin region, or custom region boundary.
2. The authority stores that boundary as the playable region.
3. The authority initializes the remaining candidate area to the full boundary polygon.
4. Question or card resolution produces spatial artifacts.
5. Only artifacts already clipped to the active region are allowed to narrow the candidate area directly.
6. If exact clipping is unavailable, the engine downgrades the result to approximate or metadata-only output instead of pretending to be exact.

## Constraint Clipping Contract

The current engine foundation uses a strict trust model:

- region boundary input must be polygon or multipolygon geometry
- candidate area initialization always copies the selected boundary
- a constraint may narrow the candidate area only when it provides a `preclipped` result for the active region
- if a geometry update is missing, incomplete, or tied to a different region, the engine records a metadata-only artifact and leaves the candidate area unchanged

This keeps the search area safely bounded even before full geometry operations are implemented.

## Feature Data Layer

Feature-backed questions and cards must go through a pluggable feature-data layer. The layer is intentionally provider-agnostic and should be able to support at least:

- airports
- hospitals
- zoos
- aquariums
- museums
- libraries
- parks
- amusement parks
- transit lines
- rail stations
- admin boundaries
- coastlines
- bodies of water

The feature layer must advertise capability per feature type:

- coverage level: `exact`, `approximate`, or `metadata_only`
- geometry support: `point`, `line`, `polygon`, `mixed`, or `metadata_only`
- supported region kinds: `city`, `admin_region`, or `custom`

## Graceful Degradation

Incomplete datasets are expected. The system must degrade honestly:

- `exact`: use clipped geometry artifacts
- `approximate`: use bounded approximate overlays and clearly label them
- `metadata_only`: record explanatory metadata without changing the candidate area

Examples:

- Radar may fall back to bounded approximate inclusion or exclusion zones.
- Tentacles may return a candidate feature list without exact geometry.
- Photos may require manual approval with no geometry output.
- Coastline or water checks may use region metadata when polygon coverage is incomplete.

## Hidden Information

The playable region and public constraint artifacts may be projected to seekers and public views.

The following remain authority-only:

- raw hider coordinates
- raw hider location history
- hidden calculation inputs derived from private location data
- provider debug data that could leak hidden location reasoning beyond allowed rules

## Current Foundation

The current implementation establishes:

- explicit `PlayableRegionModel` and `SearchAreaModel` contracts
- boundary-based search area initialization
- bounded spatial artifacts in constraints and projections
- a pluggable feature-layer descriptor package
- exact convex polygon clipping and exact half-plane clipping where the math is trustworthy
- approximate grid-based narrowing for radius, distance-threshold, and candidate-choice cases
- metadata-only fallback when geometry cannot be trusted yet

What is intentionally deferred:

- full general-purpose polygon boolean operations for arbitrary concave inputs
- provider-specific dataset ingestion
- geometry confidence scoring from real data sources
- transport-specific map synchronization
