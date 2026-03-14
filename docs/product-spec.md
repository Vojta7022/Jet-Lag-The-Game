Build a production-ready cross-platform mobile app for Android and iOS that fully runs a configurable, transit-based multiplayer hide-and-seek game inspired by social deduction / map deduction / pursuit games, but using generic branding and user-imported game content.

This app must be complete enough that players can run the entire game using only the app:
- no paper cards
- no external dice
- no external timers
- no external chat app
- no separate map tools
- no manual bookkeeping

The app must support:
1. online cloud multiplayer
2. local nearby multiplayer without internet
3. a single-device referee fallback mode for testing / emergency play

The app must be generic and reusable. Do NOT hardcode one season, one board, or one official branded ruleset. Build a configurable engine.

==================================================
0. MAIN PRODUCT INTENT
==================================================

The app is a real-time multiplayer game runner for a transit hide-and-seek game.

There are two sides:
- Hider team
- Seeker team

The engine must support:
- role-based hidden information
- map-based search space narrowing
- question categories
- answer-driven constraints
- card decks, hands, draw/discard/exile piles
- curses / buffs / timed effects / instant effects
- dice rolls
- location sharing
- chat with image uploads
- timers and cooldowns
- rulesets and expansions
- content import from spreadsheet / JSON
- resumable matches

The app must feel like a polished multiplayer strategy utility and not a prototype.

==================================================
1. TECHNICAL STRATEGY
==================================================

Use a clean architecture with strong domain boundaries.

Preferred stack:

Mobile:
- React Native
- Expo
- TypeScript
- Expo Router
- TanStack Query
- Zustand or Redux Toolkit
- React Hook Form
- Zod
- react-native-maps behind an abstraction layer
- Turf.js or equivalent geometry library
- Expo camera / image picker / notifications / location modules
- local SQLite storage for offline/local mode

Backend / online mode:
- Supabase Auth
- Supabase Postgres
- Supabase Realtime
- Supabase Storage
- Edge Functions or equivalent server-side actions for authoritative game logic

Local nearby mode:
- host-authoritative local game transport
- one device acts as local authority / referee host
- other devices on same Wi-Fi / hotspot can join by room code / QR code
- state persists on host device in local database
- if local peer connectivity is unavailable or unreliable, app must still support a single-device referee fallback

Testing / quality:
- strict TypeScript
- ESLint
- Prettier
- unit tests for engine logic
- integration tests for multiplayer actions
- end-to-end smoke tests for critical flows

==================================================
2. NON-NEGOTIABLE ENGINEERING RULES
==================================================

1. Build a generic engine, not a one-off app.
2. Sensitive game logic must be authoritative:
   - hidden info visibility
   - card draws
   - dice results
   - timers
   - role permissions
   - hider coordinates
   - map constraint resolution
   - state transitions
3. All game content must be importable/config-driven:
   - cards
   - question categories
   - question templates
   - rule presets
   - map presets
   - deck composition
4. Hidden information must never leak through client-side state or permissive queries.
5. The match must be resumable after disconnect / app close / reconnect.
6. All source code, UI text, variable names, comments, docs, and seeds must be in English.
7. Avoid copyrighted branding and official art/assets. Use generic neutral naming and imported user-owned content.

==================================================
3. PRIMARY GAME MODES
==================================================

Implement these modes:

A. Online Cloud Mode
- primary full-feature mode
- all players on separate devices
- cloud-backed state
- realtime sync
- push notifications
- image upload
- live location updates

B. Local Nearby Mode
- no internet required
- one device is local host authority
- other devices join on same local network / hotspot
- host stores authoritative state locally
- supports local chat, timers, card play, question flow, and map logic
- image transfer and location sharing should work locally if possible

C. Single-Device Referee Mode
- fallback mode when multi-device local networking fails
- one device can run the game for all players
- hidden-info screens use protected reveal flows and handoff confirmation
- useful for testing, travel, or debugging

Design the architecture so transport/storage can be swapped:
- cloud transport adapter
- local host adapter
- single-device adapter

==================================================
4. ROLE MODEL
==================================================

Support at least:

- Host / Referee / Admin
- Hider
- Seeker team
- Optional Spectator / Observer

Host abilities:
- create and configure match
- import or choose content packs
- assign roles
- start / pause / resume / end match
- inspect state
- fix game state if needed
- export logs

Hider abilities:
- private dashboard
- answer questions
- draw/use cards if rules allow
- submit proof photos when required
- share authoritative hidden coordinates to the engine
- see only permitted info

Seeker abilities:
- shared team map
- share live locations
- ask questions
- see candidate search regions and eliminated regions
- manage team cards if ruleset says shared hand
- coordinate in team chat

==================================================
5. GAME STATE MACHINE
==================================================

Create an explicit server/engine state machine, for example:

- draft
- lobby
- content_import
- role_assignment
- rules_confirmation
- map_setup
- hide_phase
- active_seek_phase
- awaiting_question_selection
- awaiting_question_answer
- applying_constraints
- awaiting_card_resolution
- cooldown_phase
- endgame
- game_complete
- paused
- archived

Only validated engine commands may transition the match.

==================================================
6. CORE FEATURE SET
==================================================

6.1 Authentication and Profiles
- email / magic link or equivalent
- profile with display name and avatar
- remembered identity across matches
- guest mode allowed for local mode

6.2 Lobby / Room System
- create private room
- invite via code / QR
- ready states
- role assignment
- reconnect support
- transport-aware room creation (online vs local)

6.3 Rulesets
Rulesets must be fully data-driven.

Ruleset config must include:
- game size / scale
- hide duration
- question cooldowns
- category availability
- draw behavior
- card timing windows
- endgame behavior
- photo evidence requirements
- whether seekers share one hand or have individual hands
- whether hider has hidden hand / public hand / no hand
- location update frequency
- map precision policies
- local mode limitations if any

6.4 Map System
Must support:
- configurable map provider abstraction
- region selection by host
- polygon draw
- circle draw
- bounding box draw
- saved map presets
- visible playable zone
- forbidden zones
- transit-related overlays
- live seeker markers
- optional breadcrumbs
- hidden hider marker only for host/debug tools
- search-space overlays:
  - current candidate region
  - eliminated region
  - clue regions
  - constraint layers
  - temporary effect overlays

6.5 Geometry / Constraint Engine
This is a major system.

Build a typed geometry engine that can:
- intersect candidate regions
- subtract excluded regions
- union candidate regions
- track contradictions
- keep constraint history
- explain each change in human-readable form

Support constraint types such as:
- inside polygon
- outside polygon
- inside radius from point
- outside radius from point
- north/south/east/west of point or line
- nearest-feature relationships
- distance comparisons
- within same admin region / region type
- closest-to among candidates
- hotter/colder after movement
- within a threshold
- beyond a threshold
- answer-derived metadata constraints
- non-geometric informational constraints when geometry is not exact

The engine must support both:
- exact geometric constraints
- soft/metadata constraints that cannot be fully rendered spatially

Store:
- raw answer
- interpreted constraint
- geometry artifact
- confidence / exactness flag
- human explanation
- affected previous region
- resulting region

6.6 Question System
Build a generic question system with:
- categories
- question templates
- draw/pick rules
- cooldowns
- answer schemas
- visibility rules
- geometry or metadata effects
- logs
- per-category history

Each question definition should support:
- id
- category_id
- title
- prompt_template
- prompt_parameters
- answer_type
- answer_schema
- draw_rule
- cooldown_seconds
- visibility_scope
- geometry_effect_template
- metadata_effect_template
- notes
- enabled

6.7 Card System
Build a flexible generic card engine.

Support:
- multiple decks
- imports
- expansions
- draw pile
- discard pile
- exile / removed pile
- hands
- hidden/public card visibility
- team-owned vs player-owned cards
- instant effects
- reaction cards
- timed effects
- persistent effects
- curses
- powerups
- time bonus cards
- blank cards / no-op cards
- cards that require photos
- cards that require dice
- cards that require selecting targets
- cards that require selecting a map feature or location
- cards with rule prerequisites
- stacking and cancellation rules
- event log entries for every action

Each card definition should support:
- id
- deck_id
- type
- subtype
- name
- short_name
- description
- effect_type
- effect_payload
- target_type
- timing_window
- duration_type
- duration_value
- requires_confirmation
- requires_photo_upload
- requires_dice_roll
- requires_location_selection
- usage_limit
- visibility
- discard_behavior
- tags
- enabled

6.8 Inventory / Hand Management
- per-player or per-team hand UI
- draw
- play
- discard
- inspect
- history
- playability validation with reason
- admin grant/remove controls

6.9 Chat and Media
- lobby chat
- team chat
- optional global chat
- photo upload
- image preview
- timestamps
- system messages
- event feed
- moderation / delete own / host delete

6.10 Live Location Sharing
- seekers share live or periodic location
- location update frequency configurable
- battery-aware mode
- denied-permission handling
- reconnect handling
- host/admin controls
- hidden hider coordinates stored authoritatively and never exposed to unauthorized clients
- engine uses hider coordinates for server-side calculations such as:
  - distance checks
  - comparison questions
  - nearest-feature comparisons
  - radar-style checks
  - thermometer/hotter-colder logic
  - map constraint generation

6.11 Timers and Cooldowns
- hide timer
- action timers
- question cooldowns
- card cooldowns
- persistent effect durations
- pause/resume
- reconciliation after reconnect or app backgrounding

6.12 Dice / Randomness
- authoritative dice service
- d6 at minimum
- extensible to other dice sizes
- result log
- animation on client
- cards and rules can depend on dice

6.13 Media / Evidence
- attach photo to answer / card / curse / event
- private vs public visibility
- optional time/location metadata
- approval workflows if rules require

6.14 Notifications
- new chat
- game start
- your action available
- card played against you
- cooldown expired
- question answered
- local host connection lost
- game paused/resumed
- endgame / result

6.15 Admin / Referee Tools
- inspect hidden state
- reveal hidden info
- rewind last action
- fix timer
- reassign roles
- grant/remove cards
- override a constraint
- resolve contradictions
- export full match log
- force sync / rebuild state from event log

==================================================
7. IMPORT SYSTEM
==================================================

Create a robust import pipeline for spreadsheet and JSON content.

Deliver:
- canonical JSON schema
- import validator
- import preview
- row-level error reporting
- publish/unpublish content pack
- versioning
- migration support for future schema changes

Support imports from:
- XLSX
- CSV
- JSON

Never hardcode exact spreadsheet headers globally. Instead:
- create a column-mapping layer
- allow per-import mapping profiles
- support import presets

==================================================
8. VERY IMPORTANT: USE THE PROVIDED XLSX AS THE FIRST CONTENT PACK
==================================================

A workbook has been provided and must be treated as the first real content pack.

Its sheets include:
- Hider Deck
- 💀Curses
- 1. Matching
- 2. Measuring
- 3. Thermometer
- 4. Radar
- 5. Tentacles
- 6. Photos

Build an importer that can ingest this workbook directly.

==================================================
9. CONTENT DISCOVERED FROM THE PROVIDED WORKBOOK
==================================================

The workbook implies a generic hide-and-seek rules content pack with:

A. Hider Deck composition
- Time Bonus cards
- Power Ups
- Curses
- Blanks

The current workbook appears to define:
- 55 time bonus cards
- 21 power up cards
- 24 curse cards
- 25 blank cards

Time Bonus card variants currently listed:
- Red: 2m, 3m, 5m
- Orange: 4m, 6m, 10m
- Yellow: 6m, 9m, 15m
- Green: 8m, 12m, 20m
- Blue: 12m, 18m, 30m

Power Up variants currently listed:
- Randomize
- Veto
- Duplicate
- Move
- Discard 1 Draw 2
- Discard 2 Draw 3
- Draw 1 Expand 1

B. Curse cards
The workbook currently contains 24 curses, each with:
- number
- name
- main effect text
- casting cost text

Examples include effects involving:
- photo/evidence requirements
- location tasks
- travel restrictions
- question locks
- dice-based movement restrictions
- category disabling
- item-carrying penalties
- right-turn movement rules
- custom puzzle/maze challenges
- comparative object-finding challenges

Do NOT hardcode these 24 as the only possible curse model.
Instead, create a generic “challenge/effect card” framework that can represent them.

C. Question categories
The workbook contains at least these six categories:
- Matching
- Measuring
- Thermometer
- Radar
- Tentacles
- Photos

These must be represented as generic configurable category types, not one-off screens.

==================================================
10. REQUIRED MODELING OF THE PROVIDED QUESTION CATEGORIES
==================================================

Implement the current workbook categories as the first content pack.

10.1 Matching
Prompt pattern:
- “Is your nearest _____ the same as my nearest _____?”

The workbook includes examples such as:
- Commercial Airport
- Transit Line
- Station Name Length
- Street or Path
- 1st Admin
- 2nd Admin
- 3rd Admin
- 4th Admin
- Mountain
- Landmass
- Park
- Amusement Park
- Zoo
- Aquarium
- Golf Course
- Museum
- Movie Theatre
- Hospital
- Library
- Foreign Consulate

Model this as:
- nearest-feature comparison
- possibly exact map feature matching
- possibly metadata/admin-region matching
- yes/no answer type
- may produce exact or partial constraints depending on feature data quality

10.2 Measuring
Prompt pattern:
- “Compared to me, are you closer to or further from _____?”

Examples include:
- Commercial Airport
- High Speed Train Line
- Rail Station
- International Border
- 1st Admin Border
- 2nd Admin Border
- 4th Admin
- Sea Level
- Body of Water
- Coastline
- Mountain
- Park
- Amusement Park
- Zoo
- Aquarium
- Golf Course
- Museum
- Movie Theatre
- Hospital
- Library
- Foreign Consulate

Model this as:
- comparative distance question
- answer types like closer / further / same-ish if rules allow
- server calculates using hider and seeker coordinates plus map/feature datasets

10.3 Thermometer
Prompt pattern:
- “I just traveled (at least) [Distance]. Am I hotter or colder?”

Workbook distances currently include:
- 0.5 mi / 805 m
- 3 mi / 4.8 km
- 10 mi / 16 km
- 50 mi / 80 km

Model this as:
- movement comparison question
- requires historical seeker position(s)
- compares whether a seeker move reduced or increased distance to hider
- should support thresholds by game size/ruleset

10.4 Radar
Prompt pattern:
- “Are you within [Distance] of me?”

Workbook distances currently include:
- 0.25 mi / 402 m
- 0.50 mi / 805 m
- 1 mi / 1.6 km
- 3 mi / 4.8 km
- 5 mi / 8 km
- 10 mi / 16 km
- 25 mi / 40 km
- 50 mi / 80.5 km
- 100 mi / 160.9 km
- Choose

Model this as:
- threshold distance check
- yes/no answer
- generates radius inclusion/exclusion constraints

10.5 Tentacles
Prompt pattern:
- “Of all the [Places] within [Distance] of me, which are you closest to?”

Workbook examples include place classes such as:
- Museums
- Libraries
- Movie Theaters
- Hospitals
- Metro Lines
- Zoos
- Aquariums
- Amusement Parks

Model this as:
- “closest among local candidates” question
- the engine must identify all qualifying features within radius from hider
- answer points to one candidate feature
- generate ranking/nearest-feature constraints

10.6 Photos
Prompt pattern:
- “Send a photo of [subject].”

Workbook examples include subjects such as:
- A Tree
- The Sky
- You
- Widest Street
- Tallest structure in sightline
- Building visible from station
- Tallest building visible from station
- Trace nearest street/path
- Two Buildings
- Restaurant Interior
- Train Platform
- Park
- Grocery Store Aisle
- Place of Worship
- 1/2 mile of streets traced
- Tallest mountain visible from station
- Biggest body of water in your zone
- Five buildings

Each photo prompt also has requirement text.

Model this as:
- photo challenge question type
- answer requires image upload
- optional manual approval by opponent or host
- optional metadata checks
- timers vary by scale / difficulty

==================================================
11. DATASET / MAP FEATURE REQUIREMENTS
==================================================

Because many question types depend on geography and nearby features, build a pluggable geospatial data layer.

The app should support:
- OpenStreetMap-derived feature datasets
- admin boundary datasets
- coastline/water/park/mountain/transport data
- feature normalization
- map feature indexing
- nearest-feature lookups
- comparative distance calculations
- category-specific feature taxonomies

Build adapters so question definitions can reference normalized feature classes rather than raw provider-specific tags.

==================================================
12. SUGGESTED DATA MODEL
==================================================

Create a practical normalized schema with entities such as:

- users
- profiles
- matches
- match_players
- teams
- roles
- rulesets
- ruleset_versions
- content_packs
- content_pack_versions
- decks
- deck_entries
- cards
- card_instances
- question_categories
- question_templates
- question_instances
- map_presets
- map_regions
- constraints
- constraint_history
- feature_taxonomies
- feature_cache
- hands
- piles
- status_effects
- timers
- chat_channels
- chat_messages
- attachments
- dice_rolls
- event_log
- state_snapshots
- imports
- import_mappings
- import_errors
- local_sessions
- device_peers

Store:
- append-only event history
- current derived state
- enough snapshots to rebuild quickly

==================================================
13. AUTHORITATIVE COMMANDS
==================================================

Implement explicit command handlers like:

- create_match
- join_match
- assign_role
- import_content_pack
- publish_content_pack
- set_ruleset
- create_map_region
- start_match
- start_hide_phase
- end_hide_phase
- ask_question
- answer_question
- apply_constraint
- draw_card
- play_card
- discard_card
- roll_dice
- send_chat_message
- upload_attachment
- update_location
- pause_match
- resume_match
- end_match
- rewind_last_action
- rebuild_state_from_log

Each command must:
- validate actor permissions
- validate state transition legality
- write event log
- update derived state
- broadcast updates

==================================================
14. UI / UX REQUIREMENTS
==================================================

Required screens:
- onboarding / sign in
- home / matches
- create match
- join by code / QR
- lobby
- role assignment
- content pack manager
- import preview and validator
- ruleset selection
- map setup
- hide phase dashboard
- hider dashboard
- seeker dashboard
- live map
- question center
- hand / piles
- chat
- event feed
- timers / cooldowns
- admin tools
- results screen
- settings

UX rules:
- role-specific dashboards
- very clear hidden vs public information separation
- prominent timers
- clear action buttons
- action-disabled reasons
- sync/connectivity banners
- battery/location helper UI
- explain map changes after every answer
- polished visual hierarchy
- mobile-first usability

==================================================
15. FAIRNESS / PRIVACY / SECURITY
==================================================

Implement:
- row-level access rules
- secure hidden-info reads
- role-aware queries
- signed media URLs
- location permission awareness
- audit logs for admin actions
- authoritative hidden coordinate calculations
- anti-cheat protections

Never expose hider coordinates to unauthorized clients.
Only expose:
- derived answers
- allowed constraints
- allowed map overlays
- allowed status effects

==================================================
16. LOCAL MODE DESIGN REQUIREMENTS
==================================================

For local nearby mode, define “local” as:

- one phone acts as host authority
- other nearby devices join over same Wi-Fi network or personal hotspot
- no internet dependency
- local event log and local database on host
- QR-based room join
- LAN discovery if possible
- if multi-device local connection fails, allow a single-device referee fallback

This local mode should still support:
- cards
- timers
- question flow
- map constraints
- chat
- photo evidence
- seeker location updates if permitted locally

Architect transport and persistence so online and local share the same domain engine.

==================================================
17. DELIVERABLES
==================================================

Deliver:

1. Full mobile app codebase
2. Clean repo structure
3. Schema and migrations
4. Cloud and local transport layers
5. Authoritative engine modules
6. Import pipeline
7. Sample canonical JSON created from the provided workbook
8. Seeds for the first content pack
9. Docs for adding future content packs
10. Tests
11. README
12. ENV example
13. Architecture docs
14. ASSUMPTIONS.md
15. Admin guide
16. Local mode guide

==================================================
18. PHASED EXECUTION PLAN
==================================================

Work in phases.

Phase 1
- scaffold repo
- auth
- navigation
- room creation
- base schema
- event log foundation

Phase 2
- role model
- state machine
- online transport
- local transport abstraction
- local host session architecture

Phase 3
- map setup
- geometry engine
- feature layer abstraction
- seeker live location
- hidden hider coordinate handling

Phase 4
- question engine
- category templates
- answer validation
- constraint generation
- explanation UI

Phase 5
- card engine
- deck/hand/pile flows
- time bonus / powerup / curse / blank modeling
- dice service
- status effects

Phase 6
- chat
- images
- notifications
- reconnect/resume
- admin tools

Phase 7
- workbook importer
- content pack versioning
- canonical JSON export
- first content pack import from provided XLSX

Phase 8
- local nearby multiplayer polish
- single-device referee fallback
- tests
- documentation
- production hardening

At the end of each phase:
- summarize what was built
- list remaining gaps
- run lint/tests
- fix major issues before moving on

==================================================
19. FIRST REQUIRED OUTPUT FROM YOU
==================================================

Before writing the rest of the implementation, first output:

1. proposed repository structure
2. domain model
3. state machine
4. schema design
5. canonical JSON schemas for:
   - content pack
   - deck
   - card
   - question category
   - question template
   - ruleset
   - map preset
   - constraint
6. XLSX import mapping plan for the provided workbook
7. online vs local architecture plan
8. risk list and mitigation plan
9. first files to create

Then begin implementation phase by phase.

==================================================
20. IMPORTANT PRODUCT QUALITY BAR
==================================================

Make this a maintainable serious app:
- no giant unstructured files
- no fragile hardcoding
- no fake placeholder logic for core systems
- no TODO-heavy stubs for engine-critical features
- keep modules typed and testable
- optimize for future extensibility

Now begin.