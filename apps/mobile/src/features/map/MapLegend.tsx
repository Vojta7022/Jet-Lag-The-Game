import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../ui/theme.ts';

import type { MapOverlayModel } from './map-overlays.ts';

interface MapLegendProps {
  overlayModel: MapOverlayModel;
  compact?: boolean;
}

export function MapLegend(props: MapLegendProps) {
  return (
    <View style={[styles.legend, props.compact ? styles.legendCompact : null]}>
      {props.overlayModel.legend.map((entry) => (
        <View key={entry.label} style={[styles.row, props.compact ? styles.rowCompact : null]}>
          <View style={[styles.swatch, { backgroundColor: entry.color }]} />
          <Text style={styles.label}>{entry.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    gap: 8
  },
  legendCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  rowCompact: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 4
  },
  label: {
    color: colors.textMuted,
    fontSize: 13
  }
});
