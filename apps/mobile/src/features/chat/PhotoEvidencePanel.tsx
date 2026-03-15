import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { EvidenceContextViewModel } from '../evidence/index.ts';

import { AppButton } from '../../ui/AppButton.tsx';
import { Field } from '../../ui/Field.tsx';
import { colors } from '../../ui/theme.ts';
import { summarizeVisiblePhotoEvidence } from './chat-state.ts';

interface PhotoEvidencePanelProps {
  contexts: EvidenceContextViewModel[];
  disabled?: boolean;
  onCreatePlaceholder: (context: EvidenceContextViewModel, label: string, note: string) => void;
}

export function PhotoEvidencePanel(props: PhotoEvidencePanelProps) {
  const [drafts, setDrafts] = useState<Record<string, { label: string; note: string }>>({});

  if (props.contexts.length === 0) {
    return (
      <Text style={styles.empty}>
        No active photo-style question or card evidence requirement is visible in this scope right now.
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      {props.contexts.map((context) => {
        const draft = drafts[context.contextId] ?? { label: '', note: '' };
        return (
          <View key={context.contextId} style={styles.card}>
            <Text style={styles.title}>{context.title}</Text>
            <Text style={styles.copy}>{context.detail}</Text>
            <Text style={styles.meta}>Visible placeholders: {summarizeVisiblePhotoEvidence(context.attachments)}</Text>
            <Field
              label="Placeholder Label"
              value={draft.label}
              onChangeText={(label) =>
                setDrafts((current) => ({
                  ...current,
                  [context.contextId]: {
                    ...(current[context.contextId] ?? { label: '', note: '' }),
                    label
                  }
                }))
              }
              placeholder="Photo evidence placeholder"
              autoCapitalize="sentences"
            />
            <Field
              label="Manual Note"
              value={draft.note}
              onChangeText={(note) =>
                setDrafts((current) => ({
                  ...current,
                  [context.contextId]: {
                    ...(current[context.contextId] ?? { label: '', note: '' }),
                    note
                  }
                }))
              }
              placeholder="Describe what still needs to be captured or reviewed"
              autoCapitalize="sentences"
            />
            <AppButton
              label="Add Evidence Placeholder"
              onPress={() => props.onCreatePlaceholder(context, draft.label, draft.note)}
              disabled={props.disabled || (draft.label.trim().length === 0 && draft.note.trim().length === 0)}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12
  },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  },
  meta: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600'
  },
  empty: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
