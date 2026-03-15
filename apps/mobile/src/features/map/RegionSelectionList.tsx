import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../ui/theme.ts';

import type { PlayableRegionCatalogEntry } from './region-types.ts';

interface RegionSelectionListProps {
  regions: PlayableRegionCatalogEntry[];
  selectedRegionId?: string;
  onSelect: (regionId: string) => void;
}

export function RegionSelectionList(props: RegionSelectionListProps) {
  return (
    <View style={styles.list}>
      {props.regions.map((region) => {
        const selected = props.selectedRegionId === region.regionId;
        return (
          <Pressable
            key={region.regionId}
            accessibilityRole="button"
            onPress={() => props.onSelect(region.regionId)}
            style={({ pressed }) => [
              styles.card,
              selected ? styles.selectedCard : null,
              pressed ? styles.pressedCard : null
            ]}
          >
            <View style={styles.header}>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>{region.displayName}</Text>
                <Text style={styles.kind}>{region.regionKind}</Text>
              </View>
              <View style={[styles.badge, selected ? styles.selectedBadge : null]}>
                <Text style={[styles.badgeLabel, selected ? styles.selectedBadgeLabel : null]}>
                  {selected ? 'Selected' : 'Preview'}
                </Text>
              </View>
            </View>
            <Text style={styles.summary}>{region.summary}</Text>
            {region.countryLabel ? (
              <Text style={styles.meta}>
                {region.regionKind === 'city' ? 'Country' : 'Coverage'}: {region.countryLabel}
                {region.parentRegionLabel && region.parentRegionLabel !== region.displayName
                  ? ` · ${region.parentRegionLabel}`
                  : ''}
              </Text>
            ) : null}
            {region.providerMetadata ? (
              <Text style={styles.meta}>
                Candidate: {region.providerMetadata.resultClass ?? 'place'} / {region.providerMetadata.resultType ?? 'boundary'}
                {region.providerMetadata.osmType && region.providerMetadata.osmId
                  ? ` · ${region.providerMetadata.osmType} ${region.providerMetadata.osmId}`
                  : ''}
              </Text>
            ) : null}
            <Text style={styles.datasets}>
              Source: {region.sourceLabel}
            </Text>
          </Pressable>
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
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  selectedCard: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted
  },
  pressedCard: {
    opacity: 0.9
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  titleBlock: {
    flex: 1,
    gap: 4
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
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  selectedBadge: {
    backgroundColor: colors.accent
  },
  badgeLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  selectedBadgeLabel: {
    color: '#ffffff'
  },
  summary: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  datasets: {
    color: colors.textMuted,
    fontSize: 12
  },
  meta: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600'
  }
});
