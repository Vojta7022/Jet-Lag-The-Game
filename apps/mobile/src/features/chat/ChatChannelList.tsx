import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ChatChannelViewModel } from './chat-state.ts';

import { colors } from '../../ui/theme.ts';
import { formatChannelScope } from './chat-state.ts';

interface ChatChannelListProps {
  channels: ChatChannelViewModel[];
  selectedChannelId?: string;
  onSelect: (channelId: string) => void;
}

export function ChatChannelList(props: ChatChannelListProps) {
  return (
    <View style={styles.list}>
      {props.channels.map((entry) => (
        <Pressable
          key={entry.channel.channelId}
          accessibilityRole="button"
          onPress={() => props.onSelect(entry.channel.channelId)}
          style={[
            styles.item,
            entry.channel.channelId === props.selectedChannelId ? styles.itemSelected : null
          ]}
        >
          <Text style={styles.name}>{entry.channel.displayName}</Text>
          <Text style={styles.meta}>
            {formatChannelScope(entry.channel)} • {entry.messages.length} message{entry.messages.length === 1 ? '' : 's'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8
  },
  item: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  itemSelected: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  name: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12
  }
});
