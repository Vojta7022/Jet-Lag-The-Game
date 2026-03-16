import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { GameplayTabBar } from '../components/GameplayTabBar.tsx';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { isLiveGameplayState } from '../components/gameplay-nav-model.ts';
import { createUuid } from '../runtime/create-uuid.ts';
import { canAccessHostControls } from '../navigation/player-flow.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import {
  buildChatChannelViewModels,
  buildChatSubmitCommands,
  canSendAttachmentPlaceholders,
  canSendMessage,
  canSubmitChatDraft,
  ChatChannelList,
  ChatComposer,
  ChatMessageList,
  createInitialChatComposerDraft,
  formatChannelScope,
  pickDefaultChatChannelId,
  resolveChatViewerRole,
  type ChatComposerDraft
} from '../features/chat/index.ts';
import {
  useLocalMediaAttachments,
  type LocalEvidenceContextDescriptor
} from '../features/evidence/index.ts';
import { AppButton } from '../ui/AppButton.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

export function ChatScreen() {
  const { state, refreshActiveMatch, submitCommands, prepareAttachmentUploadCommands } = useAppShell();
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  const viewerRole = resolveChatViewerRole(activeMatch?.playerRole, activeMatch?.recipient.scope);
  const liveGameplayState = isLiveGameplayState(projection?.lifecycleState);
  const localMedia = useLocalMediaAttachments(createUuid);
  const channelViewModels = useMemo(
    () => buildChatChannelViewModels(projection),
    [projection]
  );
  const [selectedChannelId, setSelectedChannelId] = useState<string | undefined>(() =>
    pickDefaultChatChannelId(projection, channelViewModels)
  );
  const [draft, setDraft] = useState<ChatComposerDraft>(() => createInitialChatComposerDraft());

  useEffect(() => {
    const availableChannelIds = new Set(channelViewModels.map((entry) => entry.channel.channelId));
    if (!selectedChannelId || !availableChannelIds.has(selectedChannelId)) {
      setSelectedChannelId(pickDefaultChatChannelId(projection, channelViewModels));
    }
  }, [channelViewModels, projection, selectedChannelId]);

  const selectedChannel = channelViewModels.find((entry) => entry.channel.channelId === selectedChannelId);
  const chatAttachmentContext = useMemo<LocalEvidenceContextDescriptor | undefined>(
    () =>
      selectedChannel
        ? {
            contextId: `channel:${selectedChannel.channel.channelId}`,
            kind: 'chat',
            title: `Attach Media To ${selectedChannel.channel.displayName}`,
            detail: 'Choose an image from the device or camera. The preview stays local until you send the message, then the match records attachment metadata honestly.',
            visibilityScope: selectedChannel.channel.visibilityScope,
            attachmentKind: 'image',
            channelId: selectedChannel.channel.channelId
          }
        : undefined,
    [selectedChannel]
  );
  const selectedAttachments = chatAttachmentContext
    ? localMedia.getContextDrafts(chatAttachmentContext.contextId)
    : [];
  const canAttach = canSendAttachmentPlaceholders(viewerRole);
  const canSend = canSubmitChatDraft(viewerRole, selectedChannel?.channel, draft, selectedAttachments);
  const attachmentSubmitHint = activeMatch?.onlineStatus?.attachmentStorageMode === 'durable_supabase_storage'
    ? 'Selected media uploads to Supabase Storage before the match records the attachment, so other allowed online clients can load it.'
    : activeMatch?.runtimeKind === 'online_foundation'
      ? 'Selected media stays on this device until you send the message. The match records attachment metadata, but shared binary storage is not ready in this online session yet.'
      : 'Selected media stays on this device until you send the message. Sending records attachment metadata in the match, but cross-device binary storage is still partial in this phase.';
  const selectedChannelSummary = selectedChannel
    ? `${selectedChannel.messages.length} visible message${selectedChannel.messages.length === 1 ? '' : 's'}`
    : 'Choose a channel to start chatting';
  const selectedChannelAttachmentSummary = selectedChannel
    ? `${selectedChannel.unattachedPlaceholders.length} recorded attachment${selectedChannel.unattachedPlaceholders.length === 1 ? '' : 's'} waiting for a visible message`
    : 'No channel selected';
  const canOpenMatchControls = canAccessHostControls(
    activeMatch?.playerRole ?? activeMatch?.recipient.role,
    activeMatch?.recipient.scope
  );

  const handleSendMessage = async () => {
    const attachmentIds = selectedAttachments.map((attachment) => attachment.attachmentId);
    const preparedAttachmentCommands = await prepareAttachmentUploadCommands(selectedAttachments);

    const commands = buildChatSubmitCommands({
      role: viewerRole,
      channel: selectedChannel?.channel,
      draft,
      createId: createUuid,
      selectedAttachments,
      preparedAttachmentCommands
    });
    if (commands.length === 0) {
      return;
    }

    localMedia.markSubmitting(attachmentIds);
    const succeeded = await submitCommands(commands);
    if (succeeded) {
      localMedia.markSubmitted(attachmentIds);
      setDraft(createInitialChatComposerDraft());
      return;
    }

    localMedia.resetToSelected(attachmentIds);
  };

  return (
    <ScreenContainer
      title="Chat"
      eyebrow={liveGameplayState ? 'Live Game' : 'Support'}
      subtitle={liveGameplayState ? 'Conversation and media.' : 'Conversation, channels, and shared media.'}
      topSlot={liveGameplayState ? undefined : <ProductNavBar current="chat" />}
      bottomSlot={liveGameplayState ? <GameplayTabBar current="chat" /> : undefined}
    >
      {!activeMatch ? (
        <StateBanner
          tone="warning"
          title="No active match"
          detail="Create or join a match first. Chat and media evidence only work through a live runtime connection."
        />
      ) : null}

      {activeMatch && viewerRole === 'spectator' ? (
        <StateBanner
          tone="info"
          title="Spectator chat stays public"
          detail="Spectators can read and send in visible public channels, but they cannot add private or team-only evidence attachments."
        />
      ) : null}

      {activeMatch ? (
        <View style={styles.chatHeaderCard}>
          <View style={styles.chatHeaderTop}>
            <View style={styles.chatHeaderText}>
              <Text style={styles.chatHeaderEyebrow}>Conversation</Text>
              <Text style={styles.chatHeaderTitle}>
                {selectedChannel?.channel.displayName ?? 'Choose a channel'}
              </Text>
              <Text style={styles.chatHeaderCopy}>
                {selectedChannel
                  ? `${formatChannelScope(selectedChannel.channel)} · ${selectedChannel.messages.length} message${selectedChannel.messages.length === 1 ? '' : 's'}`
                  : 'Pick a visible channel to join the conversation.'}
              </Text>
            </View>
            <View style={styles.chatRoleChip}>
              <Text style={styles.chatRoleValue}>{viewerRole}</Text>
              <Text style={styles.chatRoleLabel}>Role</Text>
            </View>
          </View>
          <View style={styles.chatHeaderActions}>
            {liveGameplayState ? (
              <View style={styles.actionCell}>
                <AppButton label="Back To Live Map" onPress={() => router.push('/map')} tone="secondary" />
              </View>
            ) : null}
            {liveGameplayState && canOpenMatchControls ? (
              <View style={styles.actionCell}>
                <AppButton label="Match Controls" onPress={() => router.push('/status')} tone="ghost" />
              </View>
            ) : null}
            <View style={styles.actionCell}>
              <AppButton
                label="Refresh"
                onPress={() => {
                  void refreshActiveMatch();
                }}
                tone="secondary"
                disabled={!activeMatch || state.loadState === 'loading'}
              />
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.channelRail}>
        <Text style={styles.sectionEyebrow}>Channels</Text>
        {channelViewModels.length === 0 ? (
          <Text style={styles.copy}>
            No chat channels are visible in this scope right now.
          </Text>
        ) : (
          <ChatChannelList
            channels={channelViewModels}
            selectedChannelId={selectedChannelId}
            onSelect={setSelectedChannelId}
          />
        )}
      </View>

      <View style={styles.conversationShell}>
        <View style={styles.conversationHeader}>
          <View style={styles.conversationText}>
            <Text style={styles.conversationTitle}>
              {selectedChannel ? selectedChannel.channel.displayName : 'Messages'}
            </Text>
            <Text style={styles.conversationSubtitle}>
              {selectedChannel
                ? `${selectedChannelSummary} · ${selectedChannelAttachmentSummary}`
                : 'Choose a channel to load the conversation.'}
            </Text>
          </View>
        </View>
        <ChatMessageList
          channel={selectedChannel}
          currentPlayerId={activeMatch?.recipient.playerId}
          localPreviewByAttachmentId={localMedia.localPreviewByAttachmentId}
        />
      </View>

      <View style={styles.composerShell}>
        <ChatComposer
          channel={selectedChannel}
          draft={draft}
          disabled={!activeMatch || state.loadState === 'loading'}
          canAttach={canAttach}
          canSend={canSend && canSendMessage(viewerRole, selectedChannel?.channel)}
          attachmentSlot={
            chatAttachmentContext ? (
              <View style={styles.attachmentTray}>
                <View style={styles.attachmentActions}>
                  <View style={styles.actionCell}>
                    <AppButton
                      label={localMedia.isContextBusy(chatAttachmentContext.contextId) ? 'Opening Library...' : 'Choose Photo'}
                      onPress={() => {
                        void localMedia.chooseFromLibrary(chatAttachmentContext);
                      }}
                      disabled={!activeMatch || state.loadState === 'loading' || !canAttach || localMedia.isContextBusy(chatAttachmentContext.contextId)}
                      tone="secondary"
                    />
                  </View>
                  <View style={styles.actionCell}>
                    <AppButton
                      label={localMedia.isContextBusy(chatAttachmentContext.contextId) ? 'Opening Camera...' : 'Take Photo'}
                      onPress={() => {
                        void localMedia.takePhoto(chatAttachmentContext);
                      }}
                      disabled={!activeMatch || state.loadState === 'loading' || !canAttach || localMedia.isContextBusy(chatAttachmentContext.contextId)}
                      tone="secondary"
                    />
                  </View>
                </View>

                {localMedia.getContextFeedback(chatAttachmentContext.contextId) ? (
                  <StateBanner
                    tone={localMedia.getContextFeedback(chatAttachmentContext.contextId)!.tone}
                    title={localMedia.getContextFeedback(chatAttachmentContext.contextId)!.title}
                    detail={localMedia.getContextFeedback(chatAttachmentContext.contextId)!.detail}
                  />
                ) : null}

                {selectedAttachments.length > 0 ? (
                  <View style={styles.selectedMediaRow}>
                    {selectedAttachments.map((attachment) => (
                      <View key={attachment.attachmentId} style={styles.selectedMediaCard}>
                        <Image source={{ uri: attachment.uri }} style={styles.selectedMediaPreview} resizeMode="cover" />
                        <View style={styles.selectedMediaText}>
                          <Text style={styles.selectedMediaLabel}>{attachment.label}</Text>
                          <Text style={styles.selectedMediaMeta}>
                            {attachment.source === 'camera' ? 'Camera' : 'Library'} · {attachment.stage === 'selected_local' ? 'Ready' : attachment.stage === 'submitting_runtime' ? 'Sending' : 'Recorded'}
                          </Text>
                        </View>
                        <AppButton
                          label="Remove"
                          tone="secondary"
                          onPress={() => {
                            localMedia.removeDraft(attachment.attachmentId);
                          }}
                          disabled={state.loadState === 'loading' || attachment.stage === 'submitting_runtime'}
                        />
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.attachmentHint}>
                    Add a photo if this message needs media.
                  </Text>
                )}

                <Text style={styles.attachmentHint}>{attachmentSubmitHint}</Text>
              </View>
            ) : undefined
          }
          onChange={setDraft}
          onReset={() => setDraft(createInitialChatComposerDraft())}
          onSubmit={() => {
            void handleSendMessage();
          }}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  chatHeaderCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.05,
    shadowRadius: 22,
    elevation: 2
  },
  chatHeaderTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  chatHeaderText: {
    flex: 1,
    gap: 4
  },
  chatHeaderEyebrow: {
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  chatHeaderTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800'
  },
  chatHeaderCopy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  chatRoleChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 2,
    minWidth: 78,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  chatRoleValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800'
  },
  chatRoleLabel: {
    color: colors.textSubtle,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  chatHeaderActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  actionCell: {
    flexBasis: '48%',
    flexGrow: 1
  },
  sectionEyebrow: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  channelRail: {
    gap: 10
  },
  conversationShell: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    padding: 16
  },
  conversationHeader: {
    gap: 4
  },
  conversationText: {
    gap: 4
  },
  conversationTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800'
  },
  conversationSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  composerShell: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  attachmentTray: {
    gap: 10
  },
  attachmentActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  selectedMediaRow: {
    gap: 10
  },
  selectedMediaCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
    padding: 10
  },
  selectedMediaPreview: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    height: 180,
    width: '100%'
  },
  selectedMediaText: {
    gap: 4
  },
  selectedMediaLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  selectedMediaMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  },
  attachmentHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
