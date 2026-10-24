import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Image as SvgImage, Path, Rect } from 'react-native-svg';

import type {
  RoundStartLocationModel,
  VisibleMapProjection,
  VisibleMovementTrackProjection
} from '../../../../../packages/shared-types/src/index.ts';

import { colors } from '../../ui/theme.ts';

import {
  geometryToSvgPath,
  geometryToSvgPolygonPaths,
  getGeometryBounds,
  getPreferredMapGeometry,
  mergeBounds,
  projectGeometryPoints
} from './map-geometry.ts';
import { buildMapOverlayModel } from './map-overlays.ts';
import { buildOsmTileLayout } from './map-tiles.ts';
import type { PlayableRegionCatalogEntry } from './region-types.ts';
import { panMapViewport, zoomMapViewport, type MapViewportTransform } from './map-canvas-gesture.ts';

interface MapFallbackCanvasProps {
  visibleMap?: VisibleMapProjection;
  visibleMovementTracks?: VisibleMovementTrackProjection[];
  roundStartLocation?: RoundStartLocationModel;
  previewRegion?: PlayableRegionCatalogEntry;
  height?: number;
  maxWidth?: number;
  notice?: string;
  transitStations?: import('./station-layer.ts').TransitStationCandidate[];
  selectedStation?: import('./station-layer.ts').TransitStationCandidate;
  hidingRadiusMeters?: number;
}

export function MapFallbackCanvas(props: MapFallbackCanvasProps) {
  const [viewport, setViewport] = useState<MapViewportTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const touchesRef = useRef<Array<{ pageX: number; pageY: number }>>([]);
  const gestureStyle = { touchAction: 'none' } as unknown as ViewStyle;
  const dimensions = useWindowDimensions();
  const availableWidth = Math.max(260, dimensions.width - 32);
  const width = props.maxWidth ? Math.min(availableWidth, props.maxWidth) : availableWidth;
  const height = props.height ?? Math.round(width * 0.78);
  const overlayModel = useMemo(
    () => buildMapOverlayModel({
      visibleMap: props.visibleMap,
      visibleMovementTracks: props.visibleMovementTracks,
      roundStartLocation: props.roundStartLocation,
      previewRegion: props.previewRegion,
      transitStations: props.transitStations,
      selectedStation: props.selectedStation,
      hidingRadiusMeters: props.hidingRadiusMeters
    }),
    [props.hidingRadiusMeters, props.previewRegion, props.roundStartLocation, props.selectedStation, props.transitStations, props.visibleMap, props.visibleMovementTracks]
  );
  const referenceGeometry = getPreferredMapGeometry({
    visibleMap: props.visibleMap,
    previewRegion: props.previewRegion
  });
  const bounds = useMemo(
    () => mergeBounds(overlayModel.overlays.map((overlay) => getGeometryBounds(overlay.geometry ?? referenceGeometry))),
    [overlayModel.overlays, referenceGeometry]
  );
  const tileViewport = { width, height, padding: 18 };
  const tileLayout = useMemo(
    () => buildOsmTileLayout(bounds ?? {
      minLongitude: 0,
      maxLongitude: 0,
      minLatitude: 0,
      maxLatitude: 0
    }, tileViewport),
    [bounds, height, width]
  );
  const boundaryPaths = useMemo(
    () => geometryToSvgPolygonPaths(referenceGeometry, bounds, tileViewport),
    [bounds, height, referenceGeometry, width]
  );

  useEffect(() => {
    setViewport({ scale: 1, offsetX: 0, offsetY: 0 });
  }, [referenceGeometry]);

  const readTouches = (event: { nativeEvent: { touches?: ArrayLike<{ pageX: number; pageY: number }> } }) =>
    Array.from(event.nativeEvent.touches ?? [], (touch) => ({ pageX: touch.pageX, pageY: touch.pageY }));

  const handleTouchStart = (event: { nativeEvent: { touches?: ArrayLike<{ pageX: number; pageY: number }> } }) => {
    touchesRef.current = readTouches(event);
  };

  const handleTouchMove = (event: { nativeEvent: { touches?: ArrayLike<{ pageX: number; pageY: number }> } }) => {
    const nextTouches = readTouches(event);
    const previousTouches = touchesRef.current;
    if (nextTouches.length === 1 && previousTouches.length === 1) {
      setViewport((current) => panMapViewport(
        current,
        nextTouches[0]!.pageX - previousTouches[0]!.pageX,
        nextTouches[0]!.pageY - previousTouches[0]!.pageY
      ));
    } else if (nextTouches.length >= 2 && previousTouches.length >= 2) {
      const distance = (points: typeof nextTouches) => Math.hypot(
        points[0]!.pageX - points[1]!.pageX,
        points[0]!.pageY - points[1]!.pageY
      );
      const previousDistance = distance(previousTouches);
      const nextDistance = distance(nextTouches);
      if (previousDistance > 0) {
        setViewport((current) => zoomMapViewport(current, nextDistance / previousDistance, width / 2, height / 2, width, height));
      }
    }
    touchesRef.current = nextTouches;
  };

  if (!referenceGeometry || !bounds) {
    return (
      <View style={[styles.frame, { width, height }]}>
        <Text style={styles.emptyTitle}>Map preview unavailable</Text>
        <Text style={styles.emptyCopy}>
          Search for a region or apply a selected boundary to the current match to render the bounded search surface.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.frame, { width, height }, gestureStyle]}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={(event) => { touchesRef.current = readTouches(event); }}
      onTouchCancel={() => { touchesRef.current = []; }}
    >
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} fill={colors.surface} />
        <G transform={`translate(${viewport.offsetX} ${viewport.offsetY}) translate(${width / 2} ${height / 2}) scale(${viewport.scale}) translate(${-width / 2} ${-height / 2})`}>
        {boundaryPaths.length > 0 ? (
          <Defs>
            <ClipPath id="osm-map-boundary">
              <Path d={boundaryPaths.join(' ')} fillRule="evenodd" />
            </ClipPath>
          </Defs>
        ) : null}
        {boundaryPaths.length > 0 ? (
          <G clipPath="url(#osm-map-boundary)">
            {tileLayout.tiles.map((tile) => (
              <SvgImage
                key={`${tile.zoom}/${tile.xTile}/${tile.yTile}`}
                href={tile.url}
                x={tile.x}
                y={tile.y}
                width={tile.width}
                height={tile.height}
                preserveAspectRatio="none"
              />
            ))}
          </G>
        ) : null}
        {overlayModel.overlays.map((overlay) => {
          if (overlay.renderMode === 'point') {
            const points = projectGeometryPoints(overlay.geometry, bounds, {
              width,
              height,
              padding: 18
            });

            return points.map((point, index) => (
              <Circle
                key={`${overlay.overlayId}:${index}`}
                cx={point.x}
                cy={point.y}
                fill={overlay.fill}
                opacity={overlay.opacity}
                r={overlay.pointRadius ?? 4}
                stroke={overlay.stroke}
                strokeWidth={overlay.strokeWidth}
              />
            ));
          }

          const polygonPaths = geometryToSvgPolygonPaths(overlay.geometry, bounds, {
            width,
            height,
            padding: 18
          });
          const linePath = overlay.renderMode === 'line'
            ? geometryToSvgPath(overlay.geometry, bounds, {
              width,
              height,
              padding: 18
            })
            : '';

          if (polygonPaths.length === 0 && !linePath) {
            return null;
          }

          return (
            <G key={overlay.overlayId}>
              {polygonPaths.map((polygonPath, index) => (
                <Path
                  key={`${overlay.overlayId}:polygon:${index}`}
                  d={polygonPath}
                  fill={overlay.fill}
                  opacity={overlay.opacity}
                  stroke={overlay.stroke}
                  strokeDasharray={overlay.dashed ? '8 6' : undefined}
                  strokeWidth={overlay.strokeWidth}
                />
              ))}
              {linePath ? (
                <Path
                  d={linePath}
                  fill="none"
                  opacity={overlay.opacity}
                  stroke={overlay.stroke}
                  strokeDasharray={overlay.dashed ? '8 6' : undefined}
                  strokeWidth={overlay.strokeWidth}
                />
              ) : null}
            </G>
          );
        })}
        </G>
      </Svg>
      <View style={styles.zoomControls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => setViewport((current) => zoomMapViewport(current, 0.8, width / 2, height / 2, width, height))} style={styles.zoomButton}>
          <Text style={styles.zoomLabel}>−</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Reset map view" onPress={() => setViewport({ scale: 1, offsetX: 0, offsetY: 0 })} style={styles.zoomButton}>
          <Text style={styles.zoomLabel}>⌖</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => setViewport((current) => zoomMapViewport(current, 1.25, width / 2, height / 2, width, height))} style={styles.zoomButton}>
          <Text style={styles.zoomLabel}>+</Text>
        </Pressable>
      </View>
      {props.notice || tileLayout.tiles.length > 0 ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{props.notice ?? tileLayout.attribution}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  zoomControls: {
    position: 'absolute',
    right: 10,
    top: 10,
    flexDirection: 'column',
    gap: 5
  },
  zoomButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised
  },
  zoomLabel: { color: colors.text, fontSize: 20, fontWeight: '800' },
  frame: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  },
  emptyCopy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 18,
    textAlign: 'center'
  },
  notice: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(19, 33, 47, 0.78)',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  noticeText: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 16
  }
});
