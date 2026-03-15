import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../ui/theme.ts';

import type { MapOverlayModel } from './map-overlays.ts';

export function MapLegend(props: { overlayModel: MapOverlayModel }) {
  return (
    <View style={styles.legend}>
      {props.overlayModel.legend.map((entry) => (
        <View key={entry.label} style={styles.row}>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
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
