import type {
  RoundStartLocationModel,
  VisibleMapProjection,
  VisibleMovementTrackProjection
} from '../../../../../packages/shared-types/src/index.ts';

import type { PlayableRegionCatalogEntry } from './region-types.ts';
import type { TransitStationCandidate } from './station-layer.ts';
import type { MapScenarioCustomOverlay } from './map-scenarios.ts';

export interface MapCanvasProps {
  visibleMap?: VisibleMapProjection;
  visibleMovementTracks?: VisibleMovementTrackProjection[];
  roundStartLocation?: RoundStartLocationModel;
  previewRegion?: PlayableRegionCatalogEntry;
  height?: number;
  maxWidth?: number;
  transitStations?: TransitStationCandidate[];
  selectedStation?: TransitStationCandidate;
  hidingRadiusMeters?: number;
  customOverlays?: MapScenarioCustomOverlay[];
}
