import type {
  VisibleMapProjection,
  VisibleMovementTrackProjection
} from '../../../../../packages/shared-types/src/index.ts';

import type { SeedPlayableRegion } from './seed-regions.ts';

export interface MapCanvasProps {
  visibleMap?: VisibleMapProjection;
  visibleMovementTracks?: VisibleMovementTrackProjection[];
  previewRegion?: SeedPlayableRegion;
  height?: number;
  maxWidth?: number;
}
