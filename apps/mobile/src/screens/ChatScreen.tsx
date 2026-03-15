import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { createUuid } from '../runtime/create-uuid.ts';
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
  const { state, refreshActiveMatch, submitCommands } = useAppShell();
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  const viewerRole = resolveChatViewerRole(activeMatch?.playerRole, activeMatch?.recipient.scope);
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
  const selectedChannelSummary = selectedChannel
    ? `${selectedChannel.messages.length} visible message${selectedChannel.messages.length === 1 ? '' : 's'}`
    : 'Choose a channel to start chatting';
  const selectedChannelAttachmentSummary = selectedChannel
    ? `${selectedChannel.unattachedPlaceholders.length} recorded attachment${selectedChannel.unattachedPlaceholders.length === 1 ? '' : 's'} waiting for a visible message`
    : 'No channel selected';

  const handleSendMessage = async () => {
    const attachmentIds = selectedAttachments.map((attachment) => attachment.attachmentId);
    const commands = buildChatSubmitCommands({
      role: viewerRole,
      channel: selectedChannel?.channel,
      draft,
      createId: createUuid,
      selectedAttachments
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
      subtitle="Read the live conversation, switch between public and team channels, and attach evidence when the current role allows it."
      topSlot={<ProductNavBar current="chat" />}
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

      <Panel
        title="Conversation"
        subtitle="Everything on this screen respects the live projection scope, including private channels and attachment visibility."
      >
        <FactList
          items={[
            { label: 'Role', value: viewerRole },
            { label: 'Current Scope', value: activeMatch?.recipient.scope ?? 'None' },
            {
              label: 'Match Stage',
              value: projection?.seekPhaseSubstate
                ? `${projection.lifecycleState} / ${projection.seekPhaseSubstate}`
                : projection?.lifecycleState ?? 'Unavailable'
            },
            { label: 'Visible Channels', value: channelViewModels.length },
            { label: 'Selected Channel', value: selectedChannel?.channel.displayName ?? 'None' }
          ]}
        />
        <Text style={styles.copy}>
          Public and team-private visibility comes from the authoritative projection. This screen never guesses around hidden-info rules.
        </Text>
      </Panel>

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
        title="Write a Message"
        subtitle="Send text first, then add evidence naturally when this channel and role allow it."
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
                submitHint="Selected media stays on this device until you send the message. Sending records attachment metadata in the match, but cross-device binary storage is still partial in this phase."
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
