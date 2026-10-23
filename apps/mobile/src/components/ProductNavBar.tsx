import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { colors, fonts } from '../ui/theme.ts';
import {
  buildProductNavItems,
  type ProductNavKey
} from './product-nav-model.ts';

export function ProductNavBar({ current }: { current: ProductNavKey }) {
  const { state } = useAppShell();
  const match = state.activeMatch;
  const role = match?.playerRole ?? match?.recipient.role ?? 'spectator';
  const items = buildProductNavItems({
    hasActiveMatch: Boolean(match),
    role,
    scope: match?.recipient.scope,
    lifecycleState: match?.projection.lifecycleState,
    visibleCardCount: match?.projection.visibleCards.length ?? 0,
    visibleMovementTrackCount:
      match?.projection.visibleMovementTracks.length ?? 0,
    canAccessAdmin: role === 'host' || match?.recipient.scope === 'host_admin'
  });
  const primary = items.filter((i) => i.group === 'primary');
  return (
    <View style={styles.container}>
      <View style={styles.route}>
        {primary.map((item, index) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected: current === item.key }}
            onPress={() => {
              if (current !== item.key)
                router.push(item.href as Parameters<typeof router.push>[0]);
            }}
            style={styles.item}
          >
            <View
              style={[
                styles.station,
                current === item.key && styles.stationActive
              ]}
            >
              <Text
                style={[
                  styles.number,
                  current === item.key && styles.numberActive
                ]}
              >
                {String(index + 1).padStart(2, '0')}
              </Text>
            </View>
            <Text
              style={[styles.label, current === item.key && styles.labelActive]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {items
        .filter((i) => i.group === 'secondary')
        .map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            onPress={() =>
              router.push(item.href as Parameters<typeof router.push>[0])
            }
            style={styles.hostButton}
          >
            <Text style={styles.hostLabel}>{item.label} ↗</Text>
          </Pressable>
        ))}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: 12 },
  route: {
    flexDirection: 'row',
    gap: 4,
    borderTopWidth: 2,
    borderTopColor: colors.border,
    paddingTop: 8
  },
  item: {
    flex: 1,
    gap: 8,
    alignItems: 'center',
    minHeight: 64,
    justifyContent: 'center'
  },
  station: {
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stationActive: { backgroundColor: colors.signal, borderColor: colors.ink },
  number: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '800'
  },
  numberActive: { color: colors.ink },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center'
  },
  labelActive: { color: colors.accentStrong },
  hostButton: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center'
  },
  hostLabel: { color: colors.textMuted, fontSize: 11 }
});
