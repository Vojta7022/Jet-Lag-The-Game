import type {
  VisibleMapProjection,
  VisibleMovementTrackProjection
} from '../../../../../packages/shared-types/src/index.ts';

import type { PlayableRegionCatalogEntry } from './region-types.ts';
import type { TransitStationCandidate } from './station-layer.ts';

export interface MapCanvasProps {
  visibleMap?: VisibleMapProjection;
  visibleMovementTracks?: VisibleMovementTrackProjection[];
  previewRegion?: PlayableRegionCatalogEntry;
  height?: number;
  maxWidth?: number;
  transitStations?: TransitStationCandidate[];
  selectedStation?: TransitStationCandidate;
  hidingRadiusMeters?: number;
}
