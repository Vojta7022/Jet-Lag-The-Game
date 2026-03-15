import { Image, StyleSheet, Text, View } from 'react-native';

import type { VisibleAttachmentProjection } from '../../../../../packages/shared-types/src/index.ts';

import type { LocalMediaAttachmentDraft } from './evidence-model.ts';

import {
  describeVisibleAttachmentDetail,
  describeVisibleAttachmentStatus,
  formatAttachmentVisibilityScope
} from './evidence-model.ts';

import { colors } from '../../ui/theme.ts';

interface VisibleAttachmentListProps {
  attachments: VisibleAttachmentProjection[];
  emptyText: string;
  localPreviewByAttachmentId?: Record<string, LocalMediaAttachmentDraft>;
}

export function VisibleAttachmentList(props: VisibleAttachmentListProps) {
  if (props.attachments.length === 0) {
    return <Text style={styles.empty}>{props.emptyText}</Text>;
  }

  return (
    <View style={styles.list}>
      {props.attachments.map((attachment) => {
        const localPreview = props.localPreviewByAttachmentId?.[attachment.attachmentId];
        return (
          <View key={attachment.attachmentId} style={styles.card}>
            {localPreview?.uri ? (
              <Image source={{ uri: localPreview.uri }} style={styles.preview} resizeMode="cover" />
            ) : null}
            <Text style={styles.label}>{attachment.label}</Text>
            <Text style={styles.meta}>{describeVisibleAttachmentStatus(attachment)}</Text>
            <Text style={styles.meta}>{formatAttachmentVisibilityScope(attachment.visibilityScope)}</Text>
            <Text style={styles.copy}>{describeVisibleAttachmentDetail(attachment)}</Text>
            {attachment.note ? <Text style={styles.note}>Note: {attachment.note}</Text> : null}
            <Text style={styles.meta}>{attachment.attachmentId}</Text>
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
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
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
    fontSize: 13,
    fontWeight: '700'
  },
  meta: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15
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
