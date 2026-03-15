import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../ui/theme.ts';

type ProductNavKey =
  | 'home'
  | 'lobby'
  | 'dashboard'
  | 'map'
  | 'questions'
  | 'cards'
  | 'chat'
  | 'movement'
  | 'admin'
  | 'status';

interface ProductNavBarProps {
  current: ProductNavKey;
}

const navItems: Array<{ key: ProductNavKey; label: string; href: string }> = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'lobby', label: 'Lobby', href: '/lobby' },
  { key: 'dashboard', label: 'Role', href: '/dashboard' },
  { key: 'map', label: 'Map', href: '/map' },
  { key: 'questions', label: 'Questions', href: '/questions' },
  { key: 'cards', label: 'Cards', href: '/cards' },
  { key: 'chat', label: 'Chat', href: '/chat' },
  { key: 'movement', label: 'Movement', href: '/movement' },
  { key: 'admin', label: 'Referee', href: '/admin' },
  { key: 'status', label: 'Status', href: '/status' }
];

export function ProductNavBar(props: ProductNavBarProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Workspace</Text>
      <View style={styles.list}>
        {navItems.map((item) => {
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
        })}
      </View>
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
