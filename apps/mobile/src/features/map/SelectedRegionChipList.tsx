import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../ui/theme.ts';

import type { PlayableRegionCatalogEntry } from './region-types.ts';

interface SelectedRegionChipListProps {
  regions: PlayableRegionCatalogEntry[];
  onRemove: (regionId: string) => void;
  onClearAll: () => void;
}

export function SelectedRegionChipList(props: SelectedRegionChipListProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>
          {props.regions.length === 1 ? '1 selected region' : `${props.regions.length} selected regions`}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={props.onClearAll}
          style={({ pressed }) => [
            styles.clearButton,
            pressed ? styles.pressedButton : null
          ]}
        >
          <Text style={styles.clearButtonLabel}>Clear All</Text>
        </Pressable>
      </View>

      <View style={styles.chipWrap}>
        {props.regions.map((region) => (
          <View key={region.regionId} style={styles.chip}>
            <View style={styles.textBlock}>
              <Text style={styles.title}>{region.displayName}</Text>
              <Text style={styles.meta}>
                {region.sourceLabel}
                {region.countryLabel ? ` · ${region.countryLabel}` : ''}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => props.onRemove(region.regionId)}
              style={({ pressed }) => [
                styles.removeButton,
                pressed ? styles.pressedButton : null
              ]}
            >
              <Text style={styles.removeButtonLabel}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  headerLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  clearButton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  clearButtonLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  chipWrap: {
    gap: 10
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  textBlock: {
    flex: 1,
    gap: 4
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  },
  removeButton: {
    backgroundColor: colors.dangerMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  removeButtonLabel: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700'
  },
  pressedButton: {
    opacity: 0.8
  }
});
