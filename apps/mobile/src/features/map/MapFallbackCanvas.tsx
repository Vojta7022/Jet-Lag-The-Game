import { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import type {
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
import type { PlayableRegionCatalogEntry } from './region-types.ts';

interface MapFallbackCanvasProps {
  visibleMap?: VisibleMapProjection;
  visibleMovementTracks?: VisibleMovementTrackProjection[];
  previewRegion?: PlayableRegionCatalogEntry;
  height?: number;
  maxWidth?: number;
  notice?: string;
}

export function MapFallbackCanvas(props: MapFallbackCanvasProps) {
  const dimensions = useWindowDimensions();
  const availableWidth = Math.max(260, dimensions.width - 32);
  const width = props.maxWidth ? Math.min(availableWidth, props.maxWidth) : availableWidth;
  const height = props.height ?? Math.round(width * 0.78);
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
  const bounds = useMemo(
    () => mergeBounds(overlayModel.overlays.map((overlay) => getGeometryBounds(overlay.geometry ?? referenceGeometry))),
    [overlayModel.overlays, referenceGeometry]
  );

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
    <View style={[styles.frame, { width, height }]}>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} fill="#f8fafc" />
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
      </Svg>
      {props.notice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{props.notice}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
