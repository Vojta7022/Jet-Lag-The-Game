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
          roundStartLocation={props.roundStartLocation}
          previewRegion={props.previewRegion}
          transitStations={props.transitStations}
          selectedStation={props.selectedStation}
          hidingRadiusMeters={props.hidingRadiusMeters}
          height={props.height}
          maxWidth={Math.min(props.maxWidth ?? frameWidth, frameWidth)}
          notice="© OpenStreetMap contributors · Street tiles load for the visible map."
        />
      ) : null}
    </View>
  );
}
