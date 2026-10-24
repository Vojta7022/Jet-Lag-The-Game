# Online Multiplayer Requirements

Captured 2026-10-24 from the product owner's clarification in the Jet Lag Hide + Seek development conversation.

## Product requirements

- Each player joins from their own phone. The game is online across the whole playable city/region; one shared referee phone is not the primary mode.
- The UI and permissions follow the player's assigned role. Hiders can see seeker positions; seekers ask Investigation Book questions; hiders receive and answer them in-app.
- Answers that depend on location should be calculated by the app from relevant seeker and hider locations. Answer effects that narrow or change the playable/search area should update the seekers' map automatically.
- The hider draws the question's card reward in the app. The physical card flow should not be needed for standard play.
- Map setup should follow the supplied `taibeled/JetLagHideAndSeek` workflow: search country administrative areas, choose the area, and create/edit the playable region from its boundary.
- Additional question/investigation books and card sets should be selectable. Future game variants should reuse the engine through versioned content and typed mechanics.

## Implementation assumptions pending confirmation

- Hiders see seeker locations, while seekers never receive the hider's exact location. Seekers see their own team's locations.
- A location question uses the latest fresh, sufficiently accurate location fixes available when the authority accepts the question. A stale fix prompts a refresh rather than being silently used.
- Supabase remains the initial hosting choice; commands move to an authenticated server-side authority, with PostGIS or a dedicated worker available for spatial work that exceeds the Edge Function runtime limits. This is a proposed design, not yet approved as a written spec.

## Current project state

- The single-device referee mode and complete simulated round remain valuable fallback and regression paths. They are not sufficient evidence of the requested separate-phone online experience.
- An authenticated `game-authority` Edge Function and atomic revision commit now provide the intended online command boundary. The follow-up security migration removes broad direct table access and scopes attachment paths, but it is not yet applied or tested against a live database. A cellular multi-phone round and complete role-privacy audit are still outstanding.
- Proposed architecture and acceptance criteria are in [Online Player Game Design](../docs/superpowers/specs/2026-10-24-online-player-game-design.md), pending product-owner review.

## Sources

- Product-owner clarification, conversation dated 2026-10-24.
- [Current state and rulebook research](current-state-and-rulebook-research.md).
- [Reference map source](https://github.com/taibeled/JetLagHideAndSeek).
