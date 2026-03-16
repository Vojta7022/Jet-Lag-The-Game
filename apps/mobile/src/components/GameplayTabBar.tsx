import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { colors } from '../ui/theme.ts';
import { buildGameplayTabItems } from './gameplay-nav-model.ts';

import type { GameplayTabKey } from './gameplay-nav-model.ts';

interface GameplayTabBarProps {
  current: GameplayTabKey;
}

export function GameplayTabBar(props: GameplayTabBarProps) {
  const { state } = useAppShell();
  const activeMatch = state.activeMatch;
  const role = activeMatch?.playerRole ?? activeMatch?.recipient.role ?? 'spectator';
  const items = buildGameplayTabItems({
    role,
    visibleCardCount: activeMatch?.projection.visibleCards.length ?? 0
  }, props.current);

  return (
    <View style={styles.container}>
      {items.map((item) => {
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
              item.key === 'map' ? styles.itemMap : null,
              isActive ? styles.itemActive : null,
              pressed && !isActive ? styles.itemPressed : null
            ]}
          >
            <Text style={[styles.label, isActive ? styles.labelActive : null]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    minHeight: 50,
    paddingHorizontal: 8
  },
  itemMap: {
    flex: 1.2
  },
  itemActive: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong
  },
  itemPressed: {
    opacity: 0.86
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800'
  },
  labelActive: {
    color: colors.accentStrong
  }
});
