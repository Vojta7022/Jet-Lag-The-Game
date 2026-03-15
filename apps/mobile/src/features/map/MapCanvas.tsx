import { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import MapView, { PROVIDER_DEFAULT } from 'react-native-maps';

import type { VisibleMapProjection, VisibleMovementTrackProjection } from '../../../../../packages/shared-types/src/index.ts';

import { colors } from '../../ui/theme.ts';

import { MapFallbackCanvas } from './MapFallbackCanvas.tsx';
import { MapOverlayRenderer } from './MapOverlayRenderer.tsx';
import { buildMapCameraRegion, collectGeometryCoordinates, getPreferredMapGeometry } from './map-geometry.ts';
import { buildMapOverlayModel } from './map-overlays.ts';
import type { SeedPlayableRegion } from './seed-regions.ts';

interface MapCanvasProps {
  visibleMap?: VisibleMapProjection;
  visibleMovementTracks?: VisibleMovementTrackProjection[];
  previewRegion?: SeedPlayableRegion;
  height?: number;
  maxWidth?: number;
}

export function MapCanvas(props: MapCanvasProps) {
  const dimensions = useWindowDimensions();
  const availableWidth = Math.max(260, dimensions.width - 32);
  const width = props.maxWidth ? Math.min(availableWidth, props.maxWidth) : availableWidth;
  const height = props.height ?? Math.round(width * 0.78);
  const mapRef = useRef<MapView | null>(null);
  const overlayModel = useMemo(
    () => buildMapOverlayModel({
      visibleMap: props.visibleMap,
      visibleMovementTracks: props.visibleMovementTracks,
      previewRegion: props.previewRegion
    }),
    [props.previewRegion, props.visibleMap, props.visibleMovementTracks]
  );
  const referenceGeometry = getPreferredMapGeometry({
    visibleMap: props.visibleMap,
    previewRegion: props.previewRegion
  });
  const initialRegion = useMemo(
    () => buildMapCameraRegion({
      visibleMap: props.visibleMap,
      previewRegion: props.previewRegion
    }),
    [props.previewRegion, props.visibleMap]
  );
  const fitCoordinates = useMemo(() => {
    const coordinates = overlayModel.overlays.flatMap((overlay) => collectGeometryCoordinates(overlay.geometry));

    if (coordinates.length > 0) {
      return coordinates;
    }

    return collectGeometryCoordinates(referenceGeometry);
  }, [overlayModel.overlays, referenceGeometry]);

  useEffect(() => {
    if (Platform.OS === 'web' || !mapRef.current || fitCoordinates.length === 0) {
      return;
    }

    const timeoutId = setTimeout(() => {
      mapRef.current?.fitToCoordinates(fitCoordinates, {
        animated: false,
        edgePadding: {
          top: 52,
          right: 52,
          bottom: 52,
          left: 52
        }
      });
    }, 30);

    return () => clearTimeout(timeoutId);
  }, [fitCoordinates]);

  if (Platform.OS === 'web') {
    return (
      <MapFallbackCanvas
        visibleMap={props.visibleMap}
        visibleMovementTracks={props.visibleMovementTracks}
        previewRegion={props.previewRegion}
        height={height}
        maxWidth={props.maxWidth}
        notice="Native map tiles are used on iOS and Android. Web keeps the bounded fallback preview in this phase."
      />
    );
  }

  if (!referenceGeometry || !initialRegion) {
    return (
      <MapFallbackCanvas
        visibleMap={props.visibleMap}
        visibleMovementTracks={props.visibleMovementTracks}
        previewRegion={props.previewRegion}
        height={height}
        maxWidth={props.maxWidth}
      />
    );
  }

  return (
    <View style={[styles.frame, { width, height }]}>
      <MapView
        ref={mapRef}
        initialRegion={initialRegion}
        mapType="standard"
        pitchEnabled={false}
        provider={PROVIDER_DEFAULT}
        rotateEnabled={false}
        scrollEnabled
        showsCompass
        showsBuildings={false}
        showsIndoors={false}
        showsTraffic={false}
        showsUserLocation={false}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
        zoomEnabled
      >
        <MapOverlayRenderer overlays={overlayModel.overlays} />
      </MapView>
      <View pointerEvents="none" style={styles.chrome}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>
            {props.visibleMap ? 'Authoritative match map' : 'Region preview'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden'
  },
  chrome: {
    left: 14,
    position: 'absolute',
    right: 14,
    top: 14
  },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(19, 33, 47, 0.78)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  chipText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  }
});
