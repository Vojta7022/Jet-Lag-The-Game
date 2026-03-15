import type { MapCanvasProps } from './MapCanvas.types.ts';
import { MapFallbackCanvas } from './MapFallbackCanvas.tsx';

export function MapCanvas(props: MapCanvasProps) {
  return (
    <MapFallbackCanvas
      visibleMap={props.visibleMap}
      visibleMovementTracks={props.visibleMovementTracks}
      previewRegion={props.previewRegion}
      height={props.height}
      maxWidth={props.maxWidth}
      notice="Native map tiles are used on iOS and Android. Web keeps the bounded fallback preview in this phase."
    />
  );
}
