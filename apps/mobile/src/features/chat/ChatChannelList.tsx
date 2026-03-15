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
            {formatChannelScope(entry.channel)}
          </Text>
          <Text style={styles.count}>
            {entry.messages.length} message{entry.messages.length === 1 ? '' : 's'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  item: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    minWidth: 120,
    paddingHorizontal: 14,
    paddingVertical: 10
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
  },
  count: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700'
  }
});
