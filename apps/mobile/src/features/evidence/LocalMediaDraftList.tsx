import { Image, StyleSheet, Text, View } from 'react-native';

import type { LocalMediaAttachmentDraft } from './evidence-model.ts';

import {
  formatAttachmentVisibilityScope,
  formatLocalMediaDraftStage
} from './evidence-model.ts';

import { AppButton } from '../../ui/AppButton.tsx';
import { Field } from '../../ui/Field.tsx';
import { colors } from '../../ui/theme.ts';

interface LocalMediaDraftListProps {
  drafts: LocalMediaAttachmentDraft[];
  disabled?: boolean;
  onUpdateDraft: (
    attachmentId: string,
    patch: Partial<Pick<LocalMediaAttachmentDraft, 'label' | 'note'>>
  ) => void;
  onRemoveDraft: (attachmentId: string) => void;
}

export function LocalMediaDraftList(props: LocalMediaDraftListProps) {
  if (props.drafts.length === 0) {
    return (
      <Text style={styles.empty}>
        No local media selected yet.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {props.drafts.map((draft) => (
        <View key={draft.attachmentId} style={styles.card}>
          <Image source={{ uri: draft.uri }} style={styles.preview} resizeMode="cover" />
          <View style={styles.content}>
            <Text style={styles.meta}>
              {formatLocalMediaDraftStage(draft.stage)} • {draft.source === 'camera' ? 'Camera' : 'Library'}
            </Text>
            <Text style={styles.meta}>
              {formatAttachmentVisibilityScope(draft.visibilityScope)}
            </Text>
            <Field
              label="Attachment Label"
              value={draft.label}
              onChangeText={(label) => props.onUpdateDraft(draft.attachmentId, { label })}
              placeholder="Describe this image"
              autoCapitalize="sentences"
            />
            <Field
              label="Attachment Note"
              value={draft.note}
              onChangeText={(note) => props.onUpdateDraft(draft.attachmentId, { note })}
              placeholder="Optional review note"
              autoCapitalize="sentences"
            />
            <Text style={styles.meta}>
              {draft.mimeType ?? 'Unknown type'}{draft.width && draft.height ? ` • ${draft.width}×${draft.height}` : ''}
            </Text>
            <AppButton
              label="Remove Selection"
              onPress={() => props.onRemoveDraft(draft.attachmentId)}
              tone="secondary"
              disabled={props.disabled || draft.stage === 'submitting_runtime'}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12
  },
  empty: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 12
  },
  preview: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 180,
    width: '100%'
  },
  content: {
    gap: 8
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  }
});
