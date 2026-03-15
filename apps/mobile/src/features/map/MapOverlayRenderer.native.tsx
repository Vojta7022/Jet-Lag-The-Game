import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Marker,
  Polygon,
  Polyline
} from 'react-native-maps';

import { colors } from '../../ui/theme.ts';

import {
  geometryToMapBoundaryPolylines,
  geometryToMapPoints,
  geometryToMapPolygons,
  geometryToMapPolylines
} from './map-geometry.ts';
import type { MapOverlayRendererProps } from './MapOverlayRenderer.types.ts';

export function MapOverlayRenderer(props: MapOverlayRendererProps) {
  return (
    <>
      {props.overlays.map((overlay) => {
        const polygons = geometryToMapPolygons(overlay.geometry);
        const polylines = geometryToMapPolylines(overlay.geometry);
        const strokePolylines = geometryToMapBoundaryPolylines(overlay.strokeGeometry);
        const points = geometryToMapPoints(overlay.geometry);

        if (polygons.length > 0) {
          return (
            <Fragment key={`${overlay.overlayId}:polygon-group`}>
              {polygons.map((polygon, index) => (
                <Polygon
                  key={`${overlay.overlayId}:fill:${index}`}
                  coordinates={polygon.coordinates}
                  holes={polygon.holes.length > 0 ? polygon.holes : undefined}
                  fillColor={overlay.fill}
                  strokeColor={overlay.suppressStroke || overlay.strokeGeometry ? 'rgba(0,0,0,0)' : overlay.stroke}
                  strokeWidth={overlay.suppressStroke || overlay.strokeGeometry ? 0 : overlay.strokeWidth}
                />
              ))}
              {(overlay.strokeGeometry ? strokePolylines : []).map((line, index) => (
                <Polyline
                  key={`${overlay.overlayId}:stroke:${index}`}
                  coordinates={line}
                  lineDashPattern={overlay.dashed ? [10, 8] : undefined}
                  strokeColor={overlay.stroke}
                  strokeWidth={overlay.strokeWidth}
                />
              ))}
              {!overlay.strokeGeometry && overlay.dashed ? polygons.map((polygon, index) => (
                <Polyline
                  key={`${overlay.overlayId}:dash:${index}`}
                  coordinates={[...polygon.coordinates, polygon.coordinates[0]!]}
                  lineDashPattern={[10, 8]}
                  strokeColor={overlay.stroke}
                  strokeWidth={overlay.strokeWidth}
                />
              )) : null}
            </Fragment>
          );
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
