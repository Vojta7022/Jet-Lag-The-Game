import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { ContentPack } from '../../../packages/shared-types/src/index.ts';

import { mobileAppEnvironment } from '../src/config/env.ts';
import { ensureMobileShellContentPack } from '../src/runtime/augment-content-pack.ts';
import { MobileRuntimeOrchestrator } from '../src/runtime/mobile-runtime-orchestrator.ts';
import {
  buildChatChannelViewModels,
  buildChatSubmitCommands,
  buildEvidenceContexts,
  buildEvidencePlaceholderCommand,
  createInitialChatComposerDraft,
  pickDefaultChatChannelId
} from '../src/features/chat/chat-state.ts';
import { buildQuestionFlowBootstrapCommands } from '../src/features/questions/question-flow-bootstrap.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

function loadContentPack(): ContentPack {
  return ensureMobileShellContentPack(JSON.parse(readFileSync(generatedPackPath, 'utf8')) as ContentPack);
}

test('mobile chat helpers wire public and team chat plus photo evidence placeholders through the real runtime', async () => {
  const contentPack = loadContentPack();
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack,
    environment: mobileAppEnvironment
  });
  const hostProfile = {
    displayName: 'Host',
    playerId: 'host-chat-1',
    authUserId: 'auth-host-chat-1'
  };

  const created = await orchestrator.createMatch(hostProfile, {
    runtimeKind: 'in_memory',
    matchId: 'mobile-chat-flow',
    initialScale: 'small',
    matchMode: 'single_device_referee'
  });

  const initialChannels = buildChatChannelViewModels(created.initialSync.projectionDelivery.projection);
  const defaultChannelId = pickDefaultChatChannelId(created.initialSync.projectionDelivery.projection, initialChannels);
  assert.equal(defaultChannelId, 'channel:lobby');

  const publicCommands = buildChatSubmitCommands({
    role: 'host',
    channel: initialChannels.find((entry) => entry.channel.channelId === 'channel:global')?.channel,
    draft: {
      ...createInitialChatComposerDraft(),
      body: 'Public host note',
      attachmentLabel: 'Station photo placeholder',
      attachmentNote: 'No upload yet'
    },
    createId: (() => {
      let sequence = 0;
      return () => `chat-public-${++sequence}`;
    })()
  });
  assert.equal(publicCommands.length, 2);

  const afterPublicChat = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    publicCommands
  );

  const publicChannels = buildChatChannelViewModels(afterPublicChat.projectionDelivery.projection);
  const publicGlobal = publicChannels.find((entry) => entry.channel.channelId === 'channel:global');
  assert.ok(publicGlobal);
  assert.equal(publicGlobal?.messages.length, 1);
  assert.equal(publicGlobal?.messages[0]?.attachments.length, 1);

  const teamCommands = buildChatSubmitCommands({
    role: 'host',
    channel: publicChannels.find((entry) => entry.channel.channelId === 'channel:team:team-hider')?.channel,
    draft: {
      ...createInitialChatComposerDraft(),
      body: 'Private host note for hiders'
    },
    createId: (() => {
      let sequence = 0;
      return () => `chat-team-${++sequence}`;
    })()
  });

  const afterTeamChat = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    teamCommands
  );

  const prepared = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    buildQuestionFlowBootstrapCommands(afterTeamChat.projectionDelivery.projection)
  );

  const askedPhotoQuestion = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    [
      {
        type: 'begin_question_prompt',
        payload: {}
      },
      {
        type: 'ask_question',
        payload: {
          questionInstanceId: 'question:mobile-photo-1',
          templateId: 'photos-a-tree',
          targetTeamId: 'team-hider'
        }
      }
    ]
  );

  const evidenceContexts = buildEvidenceContexts(
    contentPack,
    askedPhotoQuestion.projectionDelivery.projection,
    'host'
  );
  assert.equal(evidenceContexts.length >= 1, true);
  assert.equal(evidenceContexts[0]?.kind, 'question');

  const evidenceCommand = buildEvidencePlaceholderCommand({
    context: evidenceContexts[0]!,
    label: 'Tree evidence placeholder',
    note: 'Manual-only until upload exists',
    createId: () => 'evidence-1'
  });
  assert.ok(evidenceCommand);

  const afterEvidence = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    [evidenceCommand!]
  );

  assert.equal(
    afterEvidence.projectionDelivery.projection.visibleAttachments.some(
      (attachment) => attachment.linkedQuestionInstanceId === 'question:mobile-photo-1'
    ),
    true
  );
  assert.equal(
    buildChatChannelViewModels(afterEvidence.projectionDelivery.projection).some(
      (entry) => entry.channel.channelId === 'channel:team:team-hider'
    ),
    true
  );

  await orchestrator.disconnect(created.connection);
});
