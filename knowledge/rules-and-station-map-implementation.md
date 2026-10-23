# Rules and Station Map Implementation

Checked 2026-10-23 against the local October 4 rulebook scans and the supplied `taibeled/JetLagHideAndSeek` source.

## Confirmed rules implemented

- Investigation questions are selectable whenever their printed scale permits. “Draw N, Pick M” is the hider's reward after answering; it does not randomly deal the seekers' question choices. Repeating a question remains allowed and repeats the card draw/pick as a separate reward set.
- Standard hiding periods are 30/60/180 minutes by small/medium/large scale. The hider's answer window is five minutes, with photo answer windows of ten minutes for small/medium and twenty minutes for large. The base rules do not add a cooldown after a resolved answer.
- Hiding-zone radius is 500 m for small/medium and 1 km for large. The zone is centered on a selected transit station; the hider stays within the zone after the hide timer. Final hiding spots must be within 3 m of a marked path. Found requires visual identification and distance within 2 m.

## Map implementation state

- The mobile app can query candidate train, tram, and rail stations from Overpass using the selected region bounds. Results are filtered to the actual selected polygon, including holes, then deduplicated by OSM element ID and merged for same-name stops within 200 m.
- The map workbench can select a result and preview its geodesic scale-correct radius on web SVG and native map overlays. Requests are on demand, and the UI attributes station data to OpenStreetMap contributors.
- During the hide phase, the hider can set a station-centered zone. The command stores station ID/name/coordinates, selected time, selector, and the scale-specific radius in authoritative hidden state. The hider and referee can view it; seeker and public projections do not expose it.
- The engine checks a dense set of geodesic samples across the zone against the playable polygon and rejects a circle that crosses the outer boundary or a hole. This is sampled geometric validation, not a proof for arbitrarily narrow map features.
- Remaining rule gaps: the engine trusts the OSM station identity supplied by the hider's app; hider movement is not yet constrained to the saved circle; off-transit seeker entry does not automatically start endgame; final hiding spot and found conditions are not yet an authoritative transition.

## Sources

- Local base rulebook scan: `~/Downloads/2026-10-04 10-19.pdf` (locally OCR'd into ignored `temp/rules/base-rulebook-ocr.txt`).
- Local Investigation Book scan: `~/Downloads/2026-10-04-10-56.pdf` (locally OCR'd into ignored `temp/rules/investigation-book-ocr.txt`).
- [Reference map application source](https://github.com/taibeled/JetLagHideAndSeek), inspected locally in `repos/JetLagHideAndSeek`.
- OpenStreetMap station data attribution: [OpenStreetMap copyright and contributors](https://www.openstreetmap.org/copyright).
