import { useCallback, useMemo, useState } from 'react';

import type {
  LocalEvidenceContextDescriptor,
  LocalMediaAttachmentDraft
} from './evidence-model.ts';

import {
  createLocalMediaAttachmentDraft
} from './evidence-model.ts';
import {
  captureImageWithCamera,
  pickImageFromLibrary,
  type MediaSelectionResult
} from './media-picker.ts';

export interface EvidenceContextFeedback {
  tone: 'info' | 'warning' | 'error' | 'success';
  title: string;
  detail?: string;
}

function buildFeedbackFromSelection(result: MediaSelectionResult): EvidenceContextFeedback | undefined {
  if (result.status === 'selected') {
    return {
      tone: 'success',
      title: 'Photo ready on this device',
      detail: 'The preview stays local to this device until you record the attachment in match state.'
    };
  }

  if (result.status === 'cancelled') {
    return undefined;
  }

  return {
    tone: result.status === 'permission_denied' ? 'warning' : 'error',
    title: result.title,
    detail: result.detail
  };
}

export function useLocalMediaAttachments(createId: () => string) {
  const [drafts, setDrafts] = useState<LocalMediaAttachmentDraft[]>([]);
  const [activeContextIds, setActiveContextIds] = useState<Record<string, boolean>>({});
  const [feedbackByContext, setFeedbackByContext] = useState<Record<string, EvidenceContextFeedback | undefined>>({});

  const setContextBusy = useCallback((contextId: string, isBusy: boolean) => {
    setActiveContextIds((current) => ({
      ...current,
      [contextId]: isBusy
    }));
  }, []);

  const setFeedback = useCallback((contextId: string, feedback: EvidenceContextFeedback | undefined) => {
    setFeedbackByContext((current) => ({
      ...current,
      [contextId]: feedback
    }));
  }, []);

  const appendSelection = useCallback((context: LocalEvidenceContextDescriptor, result: MediaSelectionResult) => {
    const feedback = buildFeedbackFromSelection(result);
    setFeedback(context.contextId, feedback);

    if (result.status !== 'selected') {
      return undefined;
    }

    const draft = createLocalMediaAttachmentDraft({
      context,
      asset: result.asset,
      createId
    });

    setDrafts((current) => [...current, draft]);
    return draft;
  }, [createId, setFeedback]);

  const chooseFromLibrary = useCallback(async (context: LocalEvidenceContextDescriptor) => {
    setContextBusy(context.contextId, true);
    try {
      const result = await pickImageFromLibrary();
      return appendSelection(context, result);
    } finally {
      setContextBusy(context.contextId, false);
    }
  }, [appendSelection, setContextBusy]);

  const takePhoto = useCallback(async (context: LocalEvidenceContextDescriptor) => {
    setContextBusy(context.contextId, true);
    try {
      const result = await captureImageWithCamera();
      return appendSelection(context, result);
    } finally {
      setContextBusy(context.contextId, false);
    }
  }, [appendSelection, setContextBusy]);

  const updateDraft = useCallback((
    attachmentId: string,
    patch: Partial<Pick<LocalMediaAttachmentDraft, 'label' | 'note'>>
  ) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.attachmentId === attachmentId
          ? {
              ...draft,
              ...patch
            }
          : draft
      )
    );
  }, []);

  const removeDraft = useCallback((attachmentId: string) => {
    setDrafts((current) => current.filter((draft) => draft.attachmentId !== attachmentId));
  }, []);

  const markSubmitting = useCallback((attachmentIds: string[]) => {
    if (attachmentIds.length === 0) {
      return;
    }

    const targetIds = new Set(attachmentIds);
    setDrafts((current) =>
      current.map((draft) =>
        targetIds.has(draft.attachmentId)
          ? {
              ...draft,
              stage: 'submitting_runtime'
            }
          : draft
      )
    );
  }, []);

  const markSubmitted = useCallback((attachmentIds: string[]) => {
    if (attachmentIds.length === 0) {
      return;
    }

    const targetIds = new Set(attachmentIds);
    setDrafts((current) =>
      current.map((draft) =>
        targetIds.has(draft.attachmentId)
          ? {
              ...draft,
              stage: 'submitted_runtime'
            }
          : draft
      )
    );
  }, []);

  const resetToSelected = useCallback((attachmentIds: string[]) => {
    if (attachmentIds.length === 0) {
      return;
    }

    const targetIds = new Set(attachmentIds);
    setDrafts((current) =>
      current.map((draft) =>
        targetIds.has(draft.attachmentId)
          ? {
              ...draft,
              stage: 'selected_local'
            }
          : draft
      )
    );
  }, []);

  const getContextDrafts = useCallback((contextId: string, options?: { includeSubmitted?: boolean }) =>
    drafts.filter((draft) =>
      draft.contextId === contextId &&
      (options?.includeSubmitted ? true : draft.stage !== 'submitted_runtime')
    ), [drafts]);

  const localPreviewByAttachmentId = useMemo<Record<string, LocalMediaAttachmentDraft>>(
    () =>
      Object.fromEntries(drafts.map((draft) => [draft.attachmentId, draft])),
    [drafts]
  );

  return {
    chooseFromLibrary,
    takePhoto,
    updateDraft,
    removeDraft,
    markSubmitting,
    markSubmitted,
    resetToSelected,
    getContextDrafts,
    localPreviewByAttachmentId,
    isContextBusy: (contextId: string) => Boolean(activeContextIds[contextId]),
    getContextFeedback: (contextId: string) => feedbackByContext[contextId],
    clearContextFeedback: (contextId: string) => setFeedback(contextId, undefined)
  };
}
