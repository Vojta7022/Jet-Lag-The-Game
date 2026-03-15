import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Marker,
  Polygon,
  Polyline
} from 'react-native-maps';

import { colors } from '../../ui/theme.ts';

import {
  geometryToMapPoints,
  geometryToMapPolygons,
  geometryToMapPolylines
} from './map-geometry.ts';
import type { MapOverlayDescriptor } from './map-overlays.ts';

interface MapOverlayRendererProps {
  overlays: MapOverlayDescriptor[];
}

export function MapOverlayRenderer(props: MapOverlayRendererProps) {
  return (
    <>
      {props.overlays.map((overlay) => {
        const polygons = geometryToMapPolygons(overlay.geometry);
        const polylines = geometryToMapPolylines(overlay.geometry);
        const points = geometryToMapPoints(overlay.geometry);

        if (polygons.length > 0) {
          return polygons.map((polygon, index) => (
            <Fragment key={`${overlay.overlayId}:polygon:${index}`}>
              <Polygon
                coordinates={polygon.coordinates}
                holes={polygon.holes.length > 0 ? polygon.holes : undefined}
                fillColor={overlay.fill}
                strokeColor={overlay.stroke}
                strokeWidth={overlay.strokeWidth}
              />
              {overlay.dashed ? (
                <Polyline
                  coordinates={[...polygon.coordinates, polygon.coordinates[0]!]}
                  lineDashPattern={[10, 8]}
                  strokeColor={overlay.stroke}
                  strokeWidth={overlay.strokeWidth}
                />
              ) : null}
            </Fragment>
          ));
        }

        if (polylines.length > 0) {
          return polylines.map((line, index) => (
            <Polyline
              key={`${overlay.overlayId}:line:${index}`}
              coordinates={line}
              lineDashPattern={overlay.dashed ? [10, 8] : undefined}
              strokeColor={overlay.stroke}
              strokeWidth={overlay.strokeWidth}
            />
          ));
        }

        return points.map((point, index) => (
          <Marker
            key={`${overlay.overlayId}:point:${index}`}
            coordinate={point}
            tracksViewChanges={false}
          >
            <View
              style={[
                styles.point,
                {
                  backgroundColor: overlay.fill,
                  borderColor: overlay.stroke,
                  width: (overlay.pointRadius ?? 4.5) * 2.8,
                  height: (overlay.pointRadius ?? 4.5) * 2.8,
                  borderRadius: (overlay.pointRadius ?? 4.5) * 1.4
                }
              ]}
            />
          </Marker>
        ));
      })}
    </>
  );
}

const styles = StyleSheet.create({
  point: {
    borderWidth: 2,
    shadowColor: colors.text,
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.18,
    shadowRadius: 4
  }
});
