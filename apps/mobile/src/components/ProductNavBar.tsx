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
    scope: activeMatch?.recipient.scope,
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
      <Text style={styles.label}>
        {activeMatch?.projection.lifecycleState &&
        activeMatch.projection.lifecycleState !== 'hide_phase' &&
        activeMatch.projection.lifecycleState !== 'seek_phase' &&
        activeMatch.projection.lifecycleState !== 'endgame' &&
        activeMatch.projection.lifecycleState !== 'game_complete'
          ? 'Pregame'
          : 'Live'}
      </Text>
      <View style={styles.list}>
        {primaryItems.map(renderItem)}
      </View>
      {secondaryItems.length > 0 ? (
        <View style={styles.secondaryGroup}>
          <Text style={styles.secondaryLabel}>Host Only</Text>
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
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
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
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  item: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  itemActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  itemPressed: {
    opacity: 0.85
  },
  itemLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  itemLabelActive: {
    color: colors.inkInverse
  }
});
