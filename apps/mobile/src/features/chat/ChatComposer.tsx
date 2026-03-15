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
  onChange: (draft: ChatComposerDraft) => void;
  onSubmit: () => void;
  onReset: () => void;
}

export function ChatComposer(props: ChatComposerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {props.channel ? `Send To ${props.channel.channel.displayName}` : 'Select A Channel'}
      </Text>
      <Field
        label="Message"
        value={props.draft.body}
        onChangeText={(body) => props.onChange({ ...props.draft, body })}
        placeholder="Share an update, reminder, or evidence note"
        autoCapitalize="sentences"
      />
      {props.canAttach ? (
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
            placeholder="Manual placeholder only until real upload/storage exists"
            autoCapitalize="sentences"
          />
          <Text style={styles.copy}>
            Attachment placeholders are real runtime records, but they do not claim successful media upload or storage in this phase.
          </Text>
        </>
      ) : (
        <Text style={styles.copy}>
          This role or scope can send chat text here, but attachment placeholders are not available.
        </Text>
      )}
      <View style={styles.actions}>
        <AppButton label="Clear Draft" onPress={props.onReset} tone="secondary" disabled={props.disabled} />
        <AppButton label="Send Message" onPress={props.onSubmit} disabled={props.disabled || !props.canSend} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  },
  actions: {
    gap: 8
  }
});
