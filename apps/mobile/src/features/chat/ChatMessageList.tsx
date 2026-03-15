import { StyleSheet, Text, View } from 'react-native';

import type { ChatChannelViewModel } from './chat-state.ts';

import { colors } from '../../ui/theme.ts';
import { formatAttachmentStatus } from './chat-state.ts';

interface ChatMessageListProps {
  channel: ChatChannelViewModel | undefined;
}

export function ChatMessageList(props: ChatMessageListProps) {
  if (!props.channel) {
    return <Text style={styles.empty}>No channel selected.</Text>;
  }

  if (props.channel.messages.length === 0 && props.channel.unattachedPlaceholders.length === 0) {
    return <Text style={styles.empty}>No visible messages or placeholder attachments in this channel yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {props.channel.messages.map((entry) => (
        <View key={entry.message.messageId} style={styles.message}>
          <View style={styles.messageHeader}>
            <Text style={styles.sender}>
              {entry.message.senderDisplayName} • {entry.message.senderRole}
            </Text>
            <Text style={styles.timestamp}>{entry.message.sentAt}</Text>
          </View>
          {entry.message.body ? <Text style={styles.body}>{entry.message.body}</Text> : null}
          {entry.attachments.length > 0 ? (
            <View style={styles.attachmentList}>
              {entry.attachments.map((attachment) => (
                <View key={attachment.attachmentId} style={styles.attachment}>
                  <Text style={styles.attachmentLabel}>{attachment.label}</Text>
                  <Text style={styles.attachmentMeta}>
                    {formatAttachmentStatus(attachment.status)} • {attachment.attachmentId}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}

      {props.channel.unattachedPlaceholders.length > 0 ? (
        <View style={styles.placeholderBlock}>
          <Text style={styles.placeholderTitle}>Channel Placeholders Not Yet Linked To A Message</Text>
          {props.channel.unattachedPlaceholders.map((attachment) => (
            <View key={attachment.attachmentId} style={styles.attachment}>
              <Text style={styles.attachmentLabel}>{attachment.label}</Text>
              <Text style={styles.attachmentMeta}>
                {formatAttachmentStatus(attachment.status)} • {attachment.attachmentId}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12
  },
  empty: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  message: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  messageHeader: {
    gap: 4
  },
  sender: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 11
  },
  body: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20
  },
  attachmentList: {
    gap: 8
  },
  attachment: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 3,
    padding: 10
  },
  attachmentLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600'
  },
  attachmentMeta: {
    color: colors.textMuted,
    fontSize: 11
  },
  placeholderBlock: {
    gap: 8
  },
  placeholderTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  }
});
