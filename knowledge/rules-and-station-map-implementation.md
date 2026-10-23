# Rules and Station Map Implementation

Checked 2026-10-24 against the local October 4 rulebook scans and the supplied `taibeled/JetLagHideAndSeek` source.

## Confirmed rules implemented

- Investigation questions are selectable whenever their printed scale permits. “Draw N, Pick M” is the hider's reward after answering; it does not randomly deal the seekers' question choices. Repeating a question remains allowed and repeats the card draw/pick as a separate reward set.
- Standard hiding periods are 30/60/180 minutes by small/medium/large scale. The hider's answer window is five minutes, with photo answer windows of ten minutes for small/medium and twenty minutes for large. The base rules do not add a cooldown after a resolved answer.
- Hiding-zone radius is 500 m for small/medium and 1 km for large. The zone is centered on a selected transit station; the hider stays within the zone after the hide timer. Final hiding spots must be within 3 m of a marked path. Found requires visual identification and distance within 2 m.

## Map implementation state

- The mobile app can query candidate train, tram, and rail stations from Overpass using the selected region bounds. Results are filtered to the actual selected polygon, including holes, then deduplicated by OSM element ID and merged for same-name stops within 200 m.
- The map workbench can select a result and preview its geodesic scale-correct radius on web SVG and native map overlays. Requests are on demand, and the UI attributes station data to OpenStreetMap contributors.
- During the hide phase, the hider can set a station-centered zone. The command stores station ID/name/coordinates, selected time, selector, and the scale-specific radius in authoritative hidden state. The hider and referee can view it; seeker and public projections do not expose it.
- The engine checks a dense set of geodesic samples across the zone against the playable polygon and rejects a circle that crosses the outer boundary or a hole. This is sampled geometric validation, not a proof for arbitrarily narrow map features.
- The hider must separately confirm arrival at the selected station before the hide phase can advance. Once the hide timer reaches zero, an authoritative snapshot refresh transitions the match to seek phase; the map screen triggers this refresh when the hider and zone confirmations are present.
- After seek phase begins, authoritative hider location updates outside the stored radius are rejected; the engine also rejects hider movement updates during endgame. Ordinary question/card prep no longer fabricates a center point or skips hide phase; only explicit test/demo setup uses a clearly named demo station.
- During seek phase, the hider can mark a private final pin after attesting it is publicly accessible and within 3 m of a marked path. An in-zone seeker location update marked off transit automatically starts endgame and freezes the final pin. Endgame events and seeker projections omit the pin coordinates.
- Found confirmation requires a seeker/referee action, visual identification, and reported seeker coordinates within 2 m of the frozen pin. The round result records the hider team, finder, timestamp, and unpaused survival seconds; the live map presents a round scorecard.
- The mobile field-actions panel reads one GPS sample only when a player taps a location action. It uses the captured point to save the hider pin, report seeker transit status, or confirm a found. It does not continuously transmit the hider's location.
- During endgame, seekers can continue asking questions, the hider can answer, and the host can resolve map effects without leaving endgame. If a photo challenge cannot be completed from the frozen spot, the hider can record the book's “cannot answer” outcome; this bypass is restricted to photo challenges during endgame, and the hider can still draw the printed reward from the Deck screen.
- Remaining rule gaps: the engine trusts the OSM station identity and manual public-access/path attestations; time-bonus cards in hand are not yet added to the recorded hiding run at capture; and multi-round hider rotation/deck reset is not implemented. A complete UI round walkthrough remains to be done.

## Sources

- Local base rulebook scan: `~/Downloads/2026-10-04 10-19.pdf` (locally OCR'd into ignored `temp/rules/base-rulebook-ocr.txt`).
- Local Investigation Book scan: `~/Downloads/2026-10-04-10-56.pdf` (locally OCR'd into ignored `temp/rules/investigation-book-ocr.txt`).
- Verified the endgame trigger, location freeze, sighting plus 2 m found condition, and rotating-round language against the local base scan on 2026-10-24.
- [Reference map application source](https://github.com/taibeled/JetLagHideAndSeek), inspected locally in `repos/JetLagHideAndSeek`.
- OpenStreetMap station data attribution: [OpenStreetMap copyright and contributors](https://www.openstreetmap.org/copyright).
