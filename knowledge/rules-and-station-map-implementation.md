# Rules and Station Map Implementation

Checked 2026-10-23 against the local October 4 rulebook scans and the supplied `taibeled/JetLagHideAndSeek` source.

## Confirmed rules implemented

- Investigation questions are selectable whenever their printed scale permits. “Draw N, Pick M” is the hider's reward after answering; it does not randomly deal the seekers' question choices. Repeating a question remains allowed and repeats the card draw/pick as a separate reward set.
- Standard hiding periods are 30/60/180 minutes by small/medium/large scale. The hider's answer window is five minutes, with photo answer windows of ten minutes for small/medium and twenty minutes for large. The base rules do not add a cooldown after a resolved answer.
- Hiding-zone radius is 500 m for small/medium and 1 km for large. The zone is centered on a selected transit station; the hider stays within the zone after the hide timer. Final hiding spots must be within 3 m of a marked path. Found requires visual identification and distance within 2 m.

## Map implementation state

- The mobile app can query candidate train, tram, and rail stations from Overpass using the selected region bounds. Results are filtered to the actual selected polygon, including holes, then deduplicated by OSM element ID.
- The map workbench can select a result and preview its geodesic scale-correct radius on web SVG and native map overlays. Requests are on demand, and the UI attributes station data to OpenStreetMap contributors.
- Current station selection is only screen-local. It is not saved into a match, and the engine does not yet enforce the hider's 500 m/1 km boundary or enforce entering endgame when seekers are in-zone and off transit.

## Sources

- Local base rulebook scan: `~/Downloads/2026-10-04 10-19.pdf` (locally OCR'd into ignored `temp/rules/base-rulebook-ocr.txt`).
- Local Investigation Book scan: `~/Downloads/2026-10-04-10-56.pdf` (locally OCR'd into ignored `temp/rules/investigation-book-ocr.txt`).
- [Reference map application source](https://github.com/taibeled/JetLagHideAndSeek), inspected locally in `repos/JetLagHideAndSeek`.
