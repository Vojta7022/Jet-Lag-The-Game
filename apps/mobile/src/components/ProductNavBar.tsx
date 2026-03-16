import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { colors } from '../ui/theme.ts';
import { buildProductNavItems } from './product-nav-model.ts';

import type { ProductNavKey } from './product-nav-model.ts';

interface ProductNavBarProps {
  current: ProductNavKey;
}

export function ProductNavBar(props: ProductNavBarProps) {
  const { state } = useAppShell();
  const activeMatch = state.activeMatch;
  const role = activeMatch?.playerRole ?? activeMatch?.recipient.role ?? 'spectator';
  const navItems = buildProductNavItems({
    hasActiveMatch: Boolean(activeMatch),
    role,
    lifecycleState: activeMatch?.projection.lifecycleState,
    visibleCardCount: activeMatch?.projection.visibleCards.length ?? 0,
    visibleMovementTrackCount: activeMatch?.projection.visibleMovementTracks.length ?? 0,
    canAccessAdmin: role === 'host' || activeMatch?.recipient.scope === 'host_admin'
  });
  const primaryItems = navItems.filter((item) => item.group === 'primary');
  const secondaryItems = navItems.filter((item) => item.group === 'secondary');

  const renderItem = (item: (typeof navItems)[number]) => {
    const isActive = item.key === props.current;
    return (
      <Pressable
        key={item.key}
        accessibilityRole="button"
        onPress={() => {
          if (!isActive) {
            router.push(item.href as Parameters<typeof router.push>[0]);
          }
        }}
        style={({ pressed }) => [
          styles.item,
          isActive ? styles.itemActive : null,
          pressed && !isActive ? styles.itemPressed : null
        ]}
      >
        <Text style={[styles.itemLabel, isActive ? styles.itemLabelActive : null]}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Match</Text>
      <View style={styles.list}>
        {primaryItems.map(renderItem)}
      </View>
      {secondaryItems.length > 0 ? (
        <View style={styles.secondaryGroup}>
          <Text style={styles.secondaryLabel}>Host Tools</Text>
          <View style={styles.list}>
            {secondaryItems.map(renderItem)}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase'
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  secondaryGroup: {
    gap: 8
  },
  secondaryLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase'
  },
  item: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  itemActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  itemPressed: {
    opacity: 0.85
  },
  itemLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600'
  },
  itemLabelActive: {
    color: colors.accent
  }
});
