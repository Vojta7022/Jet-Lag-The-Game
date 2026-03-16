import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

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
  EvidenceCapturePanel,
  useLocalMediaAttachments,
  type LocalEvidenceContextDescriptor
} from '../features/evidence/index.ts';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
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
      title={liveGameplayState ? 'Team Chat' : 'Chat'}
      eyebrow={liveGameplayState ? 'Live Game' : 'Support'}
      subtitle="Stay with your team conversation, switch channels quickly, and attach evidence when the current role allows it."
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
        <Panel
          title={liveGameplayState ? 'Stay In Sync' : 'Conversation'}
          subtitle={
            liveGameplayState
              ? 'Use chat as a supporting live screen, then jump back to the map when you are ready.'
              : 'Everything here follows the current projection scope and private-team visibility rules.'
          }
          tone="soft"
        >
          <FactList
            items={[
              { label: 'Role', value: viewerRole },
              { label: 'Visible Channels', value: channelViewModels.length },
              { label: 'Selected Channel', value: selectedChannel?.channel.displayName ?? 'None' }
            ]}
          />
          {liveGameplayState ? (
            <AppButton label="Back To Live Map" onPress={() => router.push('/map')} tone="secondary" />
          ) : null}
          {liveGameplayState && canOpenMatchControls ? (
            <AppButton label="Open Match Controls" onPress={() => router.push('/status')} tone="ghost" />
          ) : null}
        </Panel>
      ) : null}

      <Panel
        title="Channels"
        subtitle="Pick where you want to read and send messages."
      >
        {channelViewModels.length === 0 ? (
          <Text style={styles.copy}>
            No chat channels are visible in the current projection scope right now. A different reconnect scope may expose more channels.
          </Text>
        ) : (
          <ChatChannelList
            channels={channelViewModels}
            selectedChannelId={selectedChannelId}
            onSelect={setSelectedChannelId}
          />
        )}
      </Panel>

      <Panel
        title={selectedChannel ? selectedChannel.channel.displayName : 'Messages'}
        subtitle={selectedChannel ? 'Newest visible messages and evidence for this channel.' : 'Choose a channel to load the conversation.'}
        tone={selectedChannel ? 'accent' : 'default'}
      >
        <FactList
          items={[
            { label: 'Channel Scope', value: selectedChannel?.channel ? formatChannelScope(selectedChannel.channel) : 'Unavailable' },
            { label: 'Visible Messages', value: selectedChannelSummary },
            { label: 'Recorded Evidence', value: selectedChannelAttachmentSummary }
          ]}
        />
        <ChatMessageList
          channel={selectedChannel}
          currentPlayerId={activeMatch?.recipient.playerId}
          localPreviewByAttachmentId={localMedia.localPreviewByAttachmentId}
        />
        <AppButton
          label="Refresh Conversation"
          onPress={() => {
            void refreshActiveMatch();
          }}
          tone="secondary"
          disabled={!activeMatch || state.loadState === 'loading'}
        />
      </Panel>

      <Panel
        title="Write A Message"
        subtitle="Send a quick update, an image, or both without leaving the live flow."
      >
          <ChatComposer
            channel={selectedChannel}
            draft={draft}
            disabled={!activeMatch || state.loadState === 'loading'}
            canAttach={canAttach}
          canSend={canSend && canSendMessage(viewerRole, selectedChannel?.channel)}
          attachmentSlot={
            chatAttachmentContext ? (
              <EvidenceCapturePanel
                context={chatAttachmentContext}
                drafts={selectedAttachments}
                visibleAttachments={[]}
                disabled={!activeMatch || state.loadState === 'loading' || !canAttach}
                busy={localMedia.isContextBusy(chatAttachmentContext.contextId)}
                feedback={localMedia.getContextFeedback(chatAttachmentContext.contextId)}
                localPreviewByAttachmentId={localMedia.localPreviewByAttachmentId}
                submitHint={attachmentSubmitHint}
                emptyVisibleText="Recorded attachments for this channel will appear here after a successful send."
                onChooseFromLibrary={() => {
                  void localMedia.chooseFromLibrary(chatAttachmentContext);
                }}
                onTakePhoto={() => {
                  void localMedia.takePhoto(chatAttachmentContext);
                }}
                onUpdateDraft={localMedia.updateDraft}
                onRemoveDraft={localMedia.removeDraft}
              />
            ) : undefined
          }
          onChange={setDraft}
          onReset={() => setDraft(createInitialChatComposerDraft())}
          onSubmit={() => {
            void handleSendMessage();
          }}
        />
      </Panel>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
