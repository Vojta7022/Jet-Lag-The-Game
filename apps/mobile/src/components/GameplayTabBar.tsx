import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { GameIcon } from '../ui/GameIcon.tsx';
import { colors } from '../ui/theme.ts';
import {
  buildGameplayTabItems,
  type GameplayTabKey
} from './gameplay-nav-model.ts';

export function GameplayTabBar({ current }: { current: GameplayTabKey }) {
  const { state } = useAppShell();
  const match = state.activeMatch;
  const items = buildGameplayTabItems(
    {
      role:
        match?.recipient.scope === 'host_admin'
          ? 'host'
          : (match?.playerRole ?? match?.recipient.role ?? 'spectator'),
      visibleCardCount: match?.projection.visibleCards.length ?? 0
    },
    current
  );
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Game tools"
      style={styles.container}
    >
      {items.map((item) => {
        const active = item.key === current;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => {
              if (!active)
                router.push(item.href as Parameters<typeof router.push>[0]);
            }}
            style={({ pressed }) => [
              styles.item,
              active && styles.active,
              pressed && styles.pressed
            ]}
          >
            <GameIcon
              name={item.key}
              color={active ? colors.signal : '#C4D8D7'}
              size={23}
            />
            <Text style={[styles.label, active && styles.labelActive]}>
              {item.label}
            </Text>
            <View style={[styles.stop, active && styles.stopActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 4,
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center'
  },
  item: {
    flex: 1,
    minHeight: 66,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10
  },
  active: { backgroundColor: '#24465A' },
  pressed: { opacity: 0.75 },
  label: { color: '#C4D8D7', fontSize: 10, fontWeight: '700' },
  labelActive: { color: colors.signal },
  stop: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent'
  },
  stopActive: { backgroundColor: colors.signal }
});
