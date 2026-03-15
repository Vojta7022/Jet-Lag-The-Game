import { StyleSheet, Text, View } from 'react-native';

import type { VisibleAttachmentProjection } from '../../../../../packages/shared-types/src/index.ts';

import type {
  LocalEvidenceContextDescriptor,
  LocalMediaAttachmentDraft
} from './evidence-model.ts';
import type { EvidenceContextFeedback } from './use-local-media-attachments.ts';

import { LocalMediaDraftList } from './LocalMediaDraftList.tsx';
import { VisibleAttachmentList } from './VisibleAttachmentList.tsx';

import { AppButton } from '../../ui/AppButton.tsx';
import { StateBanner } from '../../ui/StateBanner.tsx';
import { colors } from '../../ui/theme.ts';

interface EvidenceCapturePanelProps {
  context: LocalEvidenceContextDescriptor;
  drafts: LocalMediaAttachmentDraft[];
  visibleAttachments: VisibleAttachmentProjection[];
  disabled?: boolean;
  busy?: boolean;
  feedback?: EvidenceContextFeedback;
  localPreviewByAttachmentId?: Record<string, LocalMediaAttachmentDraft>;
  submitLabel?: string;
  submitDisabled?: boolean;
  submitHint?: string;
  emptyVisibleText?: string;
  onChooseFromLibrary: () => void;
  onTakePhoto: () => void;
  onUpdateDraft: (
    attachmentId: string,
    patch: Partial<Pick<LocalMediaAttachmentDraft, 'label' | 'note'>>
  ) => void;
  onRemoveDraft: (attachmentId: string) => void;
  onSubmitSelected?: () => void;
}

export function EvidenceCapturePanel(props: EvidenceCapturePanelProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{props.context.title}</Text>
      <Text style={styles.copy}>{props.context.detail}</Text>

      {props.feedback ? (
        <StateBanner
          tone={props.feedback.tone}
          title={props.feedback.title}
          detail={props.feedback.detail}
        />
      ) : null}

      <View style={styles.actions}>
        <AppButton
          label={props.busy ? 'Opening Library...' : 'Choose Photo'}
          onPress={props.onChooseFromLibrary}
          disabled={props.disabled || props.busy}
          tone="secondary"
        />
        <AppButton
          label={props.busy ? 'Opening Camera...' : 'Take Photo'}
          onPress={props.onTakePhoto}
          disabled={props.disabled || props.busy}
          tone="secondary"
        />
      </View>

      <LocalMediaDraftList
        drafts={props.drafts}
        disabled={props.disabled}
        onUpdateDraft={props.onUpdateDraft}
        onRemoveDraft={props.onRemoveDraft}
      />

      {props.onSubmitSelected ? (
        <AppButton
          label={props.submitLabel ?? 'Record Attachment Metadata'}
          onPress={props.onSubmitSelected}
          disabled={props.submitDisabled || props.disabled}
        />
      ) : null}

      {props.submitHint ? <Text style={styles.copy}>{props.submitHint}</Text> : null}
      <Text style={styles.helper}>
        If photo picking is unavailable in this build, the app will show a setup message instead of pretending the upload worked.
      </Text>

      <View style={styles.visibleBlock}>
        <Text style={styles.visibleTitle}>Visible Recorded Attachments</Text>
        <VisibleAttachmentList
          attachments={props.visibleAttachments}
          emptyText={props.emptyVisibleText ?? 'No visible recorded attachments for this flow yet.'}
          localPreviewByAttachmentId={props.localPreviewByAttachmentId}
        />
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
    fontSize: 14,
    fontWeight: '700'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  },
  helper: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16
  },
  actions: {
    gap: 8
  },
  visibleBlock: {
    gap: 8
  },
  visibleTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700'
  }
});
