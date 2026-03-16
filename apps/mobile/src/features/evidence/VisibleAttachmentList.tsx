import { Image, StyleSheet, Text, View } from 'react-native';

import type { VisibleAttachmentProjection } from '../../../../../packages/shared-types/src/index.ts';

import type { LocalMediaAttachmentDraft } from './evidence-model.ts';

import {
  describeVisibleAttachmentDetail,
  describeVisibleAttachmentStatus,
  formatAttachmentVisibilityScope
} from './evidence-model.ts';

import { useAppShell } from '../../providers/AppShellProvider.tsx';
import { colors } from '../../ui/theme.ts';

interface VisibleAttachmentListProps {
  attachments: VisibleAttachmentProjection[];
  emptyText: string;
  localPreviewByAttachmentId?: Record<string, LocalMediaAttachmentDraft>;
}

export function VisibleAttachmentList(props: VisibleAttachmentListProps) {
  const { getAttachmentMediaSource } = useAppShell();

  if (props.attachments.length === 0) {
    return <Text style={styles.empty}>{props.emptyText}</Text>;
  }

  return (
    <View style={styles.list}>
      {props.attachments.map((attachment) => {
        const localPreview = props.localPreviewByAttachmentId?.[attachment.attachmentId];
        const remotePreview = getAttachmentMediaSource(attachment);
        return (
          <View key={attachment.attachmentId} style={styles.card}>
            {localPreview?.uri || remotePreview?.uri ? (
              <Image
                source={localPreview?.uri ? { uri: localPreview.uri } : { uri: remotePreview!.uri, headers: remotePreview?.headers }}
                style={styles.preview}
                resizeMode="cover"
              />
            ) : null}
            <Text style={styles.label}>{attachment.label}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaChip}>{describeVisibleAttachmentStatus(attachment)}</Text>
              <Text style={styles.metaChip}>{formatAttachmentVisibilityScope(attachment.visibilityScope)}</Text>
            </View>
            <Text style={styles.copy}>{describeVisibleAttachmentDetail(attachment)}</Text>
            {attachment.note ? <Text style={styles.note}>Note: {attachment.note}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10
  },
  empty: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  preview: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 160,
    width: '100%'
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  metaChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  copy: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18
  },
  note: {
    color: colors.text,
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18
  }
});
