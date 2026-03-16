import type { ReactNode } from 'react';

import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { ChatComposerDraft, ChatChannelViewModel } from './chat-state.ts';

import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

interface ChatComposerProps {
  channel: ChatChannelViewModel | undefined;
  draft: ChatComposerDraft;
  disabled?: boolean;
  canAttach?: boolean;
  canSend?: boolean;
  attachmentSlot?: ReactNode;
  onChange: (draft: ChatComposerDraft) => void;
  onSubmit: () => void;
  onReset: () => void;
}

export function ChatComposer(props: ChatComposerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            {props.channel ? props.channel.channel.displayName : 'Select a channel'}
          </Text>
          <Text style={styles.subtitle}>
            {props.channel
              ? 'Write a message, drop in a photo, or send both.'
              : 'Choose a channel before you send anything.'}
          </Text>
        </View>
      </View>

      <View style={styles.inputCard}>
        <TextInput
          autoCapitalize="sentences"
          editable={!props.disabled}
          multiline
          numberOfLines={4}
          onChangeText={(body) => props.onChange({ ...props.draft, body })}
          placeholder="Message"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          textAlignVertical="top"
          value={props.draft.body}
        />
      </View>

      {props.canAttach ? props.attachmentSlot ?? null : (
        <Text style={styles.helper}>
          Media attachments are not available in this role or scope.
        </Text>
      )}

      <View style={styles.actions}>
        <View style={styles.actionCell}>
          <AppButton label="Clear" onPress={props.onReset} tone="secondary" disabled={props.disabled} />
        </View>
        <View style={styles.actionCell}>
          <AppButton label="Send" onPress={props.onSubmit} disabled={props.disabled || !props.canSend} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12
  },
  header: {
    gap: 5
  },
  headerText: {
    gap: 4
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800'
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  inputCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    padding: 4
  },
  input: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 112,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  helper: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  actionCell: {
    flexBasis: '48%',
    flexGrow: 1
  }
});
