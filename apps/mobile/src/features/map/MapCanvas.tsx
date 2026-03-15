import { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { VisibleMapProjection, VisibleMovementTrackProjection } from '../../../../../packages/shared-types/src/index.ts';

import { colors } from '../../ui/theme.ts';

import { geometryToSvgPath, getGeometryBounds, getPreferredMapGeometry, mergeBounds, projectGeometryPoints } from './map-geometry.ts';
import { buildMapOverlayModel } from './map-overlays.ts';
import type { SeedPlayableRegion } from './seed-regions.ts';

interface MapCanvasProps {
  visibleMap?: VisibleMapProjection;
  visibleMovementTracks?: VisibleMovementTrackProjection[];
  previewRegion?: SeedPlayableRegion;
}

export function MapCanvas(props: MapCanvasProps) {
  const dimensions = useWindowDimensions();
  const width = Math.max(260, Math.min(dimensions.width - 32, 480));
  const height = Math.round(width * 0.78);
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
          Select a seeded region or apply a region to the current match to render the bounded search surface.
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

          const path = geometryToSvgPath(overlay.geometry, bounds, {
            width,
            height,
            padding: 18
          });

          if (!path) {
            return null;
          }

          return (
            <Path
              key={overlay.overlayId}
              d={path}
              fill={overlay.renderMode === 'line' ? 'none' : overlay.fill}
              fillRule="evenodd"
              opacity={overlay.opacity}
              stroke={overlay.stroke}
              strokeDasharray={overlay.dashed ? '8 6' : undefined}
              strokeWidth={overlay.strokeWidth}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12
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
    textAlign: 'center'
  }
});
