import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

import type { SeedPlayableRegion } from './seed-regions.ts';

interface RegionSelectionListProps {
  regions: SeedPlayableRegion[];
  selectedRegionId?: string;
  onSelect: (regionId: string) => void;
}

export function RegionSelectionList(props: RegionSelectionListProps) {
  return (
    <View style={styles.list}>
      {props.regions.map((region) => {
        const selected = props.selectedRegionId === region.regionId;
        return (
          <View key={region.regionId} style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>{region.displayName}</Text>
              <Text style={styles.kind}>{region.regionKind}</Text>
            </View>
            <Text style={styles.summary}>{region.summary}</Text>
            <Text style={styles.datasets}>
              Datasets: {region.featureDatasetRefs.join(', ')}
            </Text>
            <AppButton
              label={selected ? 'Selected' : 'Preview Region'}
              onPress={() => props.onSelect(region.regionId)}
              disabled={selected}
              tone={selected ? 'secondary' : 'primary'}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12
  },
  card: {
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  kind: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase'
  },
  summary: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  datasets: {
    color: colors.textMuted,
    fontSize: 12
  }
});
