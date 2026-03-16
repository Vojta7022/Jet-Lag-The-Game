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
          <Text
            style={[
              styles.name,
              entry.channel.channelId === props.selectedChannelId ? styles.nameSelected : null
            ]}
          >
            {entry.channel.displayName}
          </Text>
          <Text
            style={[
              styles.meta,
              entry.channel.channelId === props.selectedChannelId ? styles.metaSelected : null
            ]}
          >
            {formatChannelScope(entry.channel)}
          </Text>
          <Text
            style={[
              styles.count,
              entry.channel.channelId === props.selectedChannelId ? styles.countSelected : null
            ]}
          >
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
    gap: 10
  },
  item: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    minWidth: 120,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  itemSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  name: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800'
  },
  nameSelected: {
    color: colors.inkInverse
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12
  },
  metaSelected: {
    color: colors.inkInverse
  },
  count: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '700'
  },
  countSelected: {
    color: colors.inkInverse
  }
});
