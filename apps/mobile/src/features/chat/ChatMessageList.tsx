import { StyleSheet, Text, View } from 'react-native';

import type { ChatChannelViewModel } from './chat-state.ts';
import type { LocalMediaAttachmentDraft } from '../evidence/index.ts';

import { colors } from '../../ui/theme.ts';
import { VisibleAttachmentList } from '../evidence/index.ts';

interface ChatMessageListProps {
  channel: ChatChannelViewModel | undefined;
  currentPlayerId?: string;
  localPreviewByAttachmentId?: Record<string, LocalMediaAttachmentDraft>;
}

export function ChatMessageList(props: ChatMessageListProps) {
  if (!props.channel) {
    return <Text style={styles.empty}>Choose a channel to open the conversation.</Text>;
  }

  if (props.channel.messages.length === 0 && props.channel.unattachedPlaceholders.length === 0) {
    return <Text style={styles.empty}>No visible messages yet. The next update sent in this channel will appear here.</Text>;
  }

  return (
    <View style={styles.list}>
      {props.channel.messages.map((entry) => (
        <View
          key={entry.message.messageId}
          style={[
            styles.messageRow,
            entry.message.senderPlayerId === props.currentPlayerId ? styles.messageRowOwn : null
          ]}
        >
          <View
            style={[
              styles.message,
              entry.message.senderPlayerId === props.currentPlayerId ? styles.messageOwn : null
            ]}
          >
            <View style={styles.messageHeader}>
              <Text
                style={[
                  styles.sender,
                  entry.message.senderPlayerId === props.currentPlayerId ? styles.senderOwn : null
                ]}
              >
                {entry.message.senderPlayerId === props.currentPlayerId ? 'You' : entry.message.senderDisplayName}
              </Text>
              <Text
                style={[
                  styles.role,
                  entry.message.senderPlayerId === props.currentPlayerId ? styles.roleOwn : null
                ]}
              >
                {entry.message.senderRole}
              </Text>
            </View>
            <Text
              style={[
                styles.timestamp,
                entry.message.senderPlayerId === props.currentPlayerId ? styles.timestampOwn : null
              ]}
            >
              {entry.message.sentAt}
            </Text>
            {entry.message.body ? (
              <Text
                style={[
                  styles.body,
                  entry.message.senderPlayerId === props.currentPlayerId ? styles.bodyOwn : null
                ]}
              >
                {entry.message.body}
              </Text>
            ) : null}
            {entry.attachments.length > 0 ? (
              <VisibleAttachmentList
                attachments={entry.attachments}
                emptyText="No visible attachments linked to this message."
                localPreviewByAttachmentId={props.localPreviewByAttachmentId}
              />
            ) : null}
          </View>
        </View>
      ))}

      {props.channel.unattachedPlaceholders.length > 0 ? (
        <View style={styles.placeholderBlock}>
          <Text style={styles.placeholderTitle}>Recorded evidence not yet linked to a visible message</Text>
          <VisibleAttachmentList
            attachments={props.channel.unattachedPlaceholders}
            emptyText="No visible unattached records in this channel."
            localPreviewByAttachmentId={props.localPreviewByAttachmentId}
          />
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
  messageRow: {
    alignItems: 'flex-start'
  },
  messageRowOwn: {
    alignItems: 'flex-end'
  },
  message: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    maxWidth: '84%',
    padding: 14,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 14,
    elevation: 1
  },
  messageOwn: {
    backgroundColor: colors.accentStrong,
    borderColor: colors.accentStrong
  },
  messageHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  sender: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800'
  },
  senderOwn: {
    color: colors.inkInverse
  },
  role: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    textTransform: 'uppercase'
  },
  roleOwn: {
    backgroundColor: 'rgba(255, 250, 242, 0.18)',
    borderColor: 'rgba(255, 250, 242, 0.28)',
    color: colors.inkInverse
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 11
  },
  timestampOwn: {
    color: colors.inkInverse
  },
  body: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22
  },
  bodyOwn: {
    color: colors.inkInverse
  },
  placeholderBlock: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  placeholderTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  }
});
