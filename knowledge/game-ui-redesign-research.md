# Game UI Redesign Research

Research date: 2026-10-23

## Current UI diagnosis

The mobile shell repeats a rounded title card, stacked `Panel` sections, explanatory status banners, and text-only pill navigation. This is coherent product UI, but the same administrative hierarchy appears on Home, lobby, and gameplay surfaces. Existing game-specific assets and motifs are underused: the map canvas, transit routes, station markers, team roles, investigation clues, timers, and card draws.

## Design references

- Unity's [effective UI and game design guide](https://unity.com/blog/games/how-to-immerse-your-players-through-effective-ui-and-game-design) argues that interface style should fit the game's identity, communicate only what supports the current player decision, and use established game conventions. Its references include the searchable Game UI Database and Interface in Game.
- Figma Config's [game UI prototyping talk](https://www.youtube.com/watch?v=ifrI17KwSPs) by Epic UX designer Aashrey Sharma covers focus-based navigation, visible selection, and clear paths through game menus. Preserve those interaction cues even in a touch-first layout.
- [Interface In Game](https://interfaceingame.com/screenshots/) is a useful visual library for observing game maps, menus, overlays, and transitions. Treat screenshots as references; do not reuse their art.
- Unity Learn's [Working with UI](https://learn.unity.com/tutorial/working-with-ui-in-unity) demonstrates designing a menu to stay proportionate across screen sizes. The implementation details are Unity-specific, but the responsive-layout principle transfers to this Expo app.

## Recommended direction: Transit Field Kit

Make the game feel like a live travel competition played from a marked-up city map. Use warm timetable paper, deep route-ink navy, station teal, signal yellow for the current action, and signal orange for seeker pressure. Keep role and status meanings explicit in words and shapes as well as color. Use a restrained display serif for large game moments, the platform sans for instructions, and monospaced labels for station codes and clocks; check actual font availability before implementation.

The signature motif is a transit route that doubles as game progress: stations can mark setup, hiding, seeking, and endgame, while the active stop anchors navigation and status. Use ticket-like match summaries and team badges as occasional game objects rather than turning every surface into a card.

## First visual slice

1. Home becomes a game launch/resume screen, with one strong Start or Continue action and profile/developer controls moved out of the main play hierarchy.
2. Lobby presents Hider and Seekers as distinct team spaces; join code and readiness feel like a game briefing.
3. Live map stays the focal surface. Replace generic page chrome with a compact role/phase/clock strip, a route-style bottom navigation, and one role-appropriate action dock.
4. Keep the existing command, role-gating, map, question, and timer behavior intact while changing presentation. Apply the visual system to secondary screens after the first slice is approved and reviewed.

## Implementation review

The owner approved the direction on 2026-10-23, and the UI has been implemented across Home, lobby, map, clue, card, and chat screens. Desktop and phone screenshots are in `deliverables/ui-preview/`.

The implementation uses a restrained paper/ink/signal palette, serif game headlines, monospace clock labels, route-stop navigation, and original SVG map artwork. On web, decorative React Native SVGs must use `aria-hidden={true}`; passing `accessible={false}` through to an SVG DOM node produces a React console warning. The responsive web map measures its parent card width instead of assuming viewport width, which prevents clipping inside the page gutters.

Validation on 2026-10-23: TypeScript typecheck passed; full suite passed 159/159; browser review covered 1440px desktop and 390px/320px phone widths. A local referee game was resumed, a local crew member added, Prague selected, a match started, and six cards drawn. A real countdown-reset issue remains: synthetic command timestamps can re-anchor the visible countdown after new projections/commands. See `tasks/todo.md` for remaining game-content and runtime gaps.
