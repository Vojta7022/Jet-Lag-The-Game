import { useState } from 'react';
import { View } from 'react-native';
import type { MapCanvasProps } from './MapCanvas.types.ts';
import { MapFallbackCanvas } from './MapFallbackCanvas.tsx';

export function MapCanvas(props: MapCanvasProps) {
  const [frameWidth, setFrameWidth] = useState<number>();
  return (
    <View
      style={{ width: '100%', minHeight: props.height }}
      onLayout={(event) => setFrameWidth(event.nativeEvent.layout.width)}
    >
      {frameWidth ? (
        <MapFallbackCanvas
          visibleMap={props.visibleMap}
          visibleMovementTracks={props.visibleMovementTracks}
          previewRegion={props.previewRegion}
          height={props.height}
          maxWidth={Math.min(props.maxWidth ?? frameWidth, frameWidth)}
          notice="Boundary preview · Street tiles are available in the mobile app."
        />
      ) : null}
    </View>
  );
}
