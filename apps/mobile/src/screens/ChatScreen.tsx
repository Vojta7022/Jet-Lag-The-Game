import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { defaultContentPack } from '../runtime/default-content-pack.ts';
import { createUuid } from '../runtime/create-uuid.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import {
  buildChatChannelViewModels,
  buildChatSubmitCommands,
  buildEvidenceContexts,
  buildEvidencePlaceholderCommand,
  canSendAttachmentPlaceholders,
  canSendMessage,
  canSubmitChatDraft,
  ChatChannelList,
  ChatComposer,
  ChatMessageList,
  createInitialChatComposerDraft,
  PhotoEvidencePanel,
  pickDefaultChatChannelId,
  resolveChatViewerRole,
  type ChatComposerDraft
} from '../features/chat/index.ts';
import { AppButton } from '../ui/AppButton.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

export function ChatScreen() {
  const { state, refreshActiveMatch, submitCommand, submitCommands } = useAppShell();
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  const viewerRole = resolveChatViewerRole(activeMatch?.playerRole, activeMatch?.recipient.scope);
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
  const evidenceContexts = useMemo(
    () => buildEvidenceContexts(defaultContentPack, projection, viewerRole),
    [projection, viewerRole]
  );
  const canAttach = canSendAttachmentPlaceholders(viewerRole);
  const canSend = canSubmitChatDraft(viewerRole, selectedChannel?.channel, draft);

  return (
    <ScreenContainer
      title="Chat"
      subtitle="First-pass chat, channel, and photo-evidence placeholder UI wired to real match commands and scoped projections."
    >
      {!activeMatch ? (
        <StateBanner
          tone="warning"
          title="No active match"
          detail="Create or join a match first. Chat and evidence placeholders only work through a live runtime connection."
        />
      ) : null}

      {activeMatch && viewerRole === 'spectator' ? (
        <StateBanner
          tone="info"
          title="Spectator messaging stays public"
          detail="Spectators can use the public lobby/global channels when visible, but they cannot create private evidence placeholders."
        />
      ) : null}

      <Panel title="Chat Runtime Status">
        <View style={styles.row}>
          <Text style={styles.label}>Viewer Role</Text>
          <Text style={styles.value}>{viewerRole}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Scope</Text>
          <Text style={styles.value}>{activeMatch?.recipient.scope ?? 'none'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Lifecycle</Text>
          <Text style={styles.value}>
            {projection?.lifecycleState}
            {projection?.seekPhaseSubstate ? ` / ${projection.seekPhaseSubstate}` : ''}
          </Text>
        </View>
        <Text style={styles.copy}>
          Public and team-private visibility comes from the authoritative projection. This screen does not guess around hidden-info rules.
        </Text>
        <AppButton
          label="Refresh Chat State"
          onPress={() => {
            void refreshActiveMatch();
          }}
          tone="secondary"
          disabled={!activeMatch || state.loadState === 'loading'}
        />
      </Panel>

      <Panel title="Channels">
        {channelViewModels.length === 0 ? (
          <Text style={styles.copy}>
            No chat channels are visible in the current projection scope. A public or private reconnect may expose different channels.
          </Text>
        ) : (
          <ChatChannelList
            channels={channelViewModels}
            selectedChannelId={selectedChannelId}
            onSelect={setSelectedChannelId}
          />
        )}
      </Panel>

      <Panel title="Messages">
        <ChatMessageList channel={selectedChannel} />
      </Panel>

      <Panel title="Message Composer">
        <ChatComposer
          channel={selectedChannel}
          draft={draft}
          disabled={!activeMatch || state.loadState === 'loading'}
          canAttach={canAttach}
          canSend={canSend && canSendMessage(viewerRole, selectedChannel?.channel)}
          onChange={setDraft}
          onReset={() => setDraft(createInitialChatComposerDraft())}
          onSubmit={() => {
            const commands = buildChatSubmitCommands({
              role: viewerRole,
              channel: selectedChannel?.channel,
              draft,
              createId: createUuid
            });
            if (commands.length === 0) {
              return;
            }

            void submitCommands(commands);
            setDraft(createInitialChatComposerDraft());
          }}
        />
      </Panel>

      <Panel title="Photo Evidence Placeholders">
        <PhotoEvidencePanel
          contexts={evidenceContexts}
          disabled={!activeMatch || state.loadState === 'loading' || !canAttach}
          onCreatePlaceholder={(context, label, note) => {
            const command = buildEvidencePlaceholderCommand({
              context,
              label,
              note,
              createId: createUuid
            });
            if (!command) {
              return;
            }

            void submitCommand(command);
          }}
        />
      </Panel>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600'
  },
  value: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
