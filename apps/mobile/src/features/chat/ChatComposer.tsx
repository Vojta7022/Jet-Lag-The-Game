import type { ReactNode } from 'react';

import { StyleSheet, Text, View } from 'react-native';

import type { ChatComposerDraft, ChatChannelViewModel } from './chat-state.ts';

import { AppButton } from '../../ui/AppButton.tsx';
import { Field } from '../../ui/Field.tsx';
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
        <Text style={styles.title}>
          {props.channel ? props.channel.channel.displayName : 'Select a channel'}
        </Text>
        <Text style={styles.subtitle}>
          {props.channel ? 'Write a message, attach an image, or send both if this channel allows it.' : 'Choose a channel before sending a message.'}
        </Text>
      </View>
      <Field
        label="Message"
        value={props.draft.body}
        onChangeText={(body) => props.onChange({ ...props.draft, body })}
        placeholder="Optional when sending only an image"
        autoCapitalize="sentences"
        multiline
        numberOfLines={4}
      />
      {props.canAttach ? (
        <>
          {props.attachmentSlot ?? (
            <>
              <Field
                label="Image Placeholder Label"
                value={props.draft.attachmentLabel}
                onChangeText={(attachmentLabel) => props.onChange({ ...props.draft, attachmentLabel })}
                placeholder="Station platform photo"
                autoCapitalize="sentences"
              />
              <Field
                label="Placeholder Note"
                value={props.draft.attachmentNote}
                onChangeText={(attachmentNote) => props.onChange({ ...props.draft, attachmentNote })}
                placeholder="Describe what still needs review"
                autoCapitalize="sentences"
              />
              <Text style={styles.copy}>
                Attachment records are real match-state entries, but they still do not promise completed media storage on every device in this phase.
              </Text>
            </>
          )}
        </>
      ) : (
        <Text style={styles.copy}>
          This view can still send chat text, but media attachments are not available in the current role or scope.
        </Text>
      )}
      <View style={styles.actions}>
        <AppButton label="Clear" onPress={props.onReset} tone="secondary" disabled={props.disabled} />
        <AppButton label="Send" onPress={props.onSubmit} disabled={props.disabled || !props.canSend} />
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
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800'
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  copy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end'
  }
});
