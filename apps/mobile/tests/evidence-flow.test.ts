import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type {
  ContentPack,
  VisibleChatChannelProjection
} from '../../../packages/shared-types/src/index.ts';

import { mobileAppEnvironment } from '../src/config/env.ts';
import { ensureMobileShellContentPack } from '../src/runtime/augment-content-pack.ts';
import { MobileRuntimeOrchestrator } from '../src/runtime/mobile-runtime-orchestrator.ts';
import {
  buildAttachmentUploadCommandFromDraft,
  createLocalMediaAttachmentDraft
} from '../src/features/evidence/evidence-model.ts';
import { buildEvidenceContexts } from '../src/features/evidence/evidence-contexts.ts';
import { describeUnavailablePicker } from '../src/features/evidence/media-picker.ts';
import {
  buildChatSubmitCommands,
  createInitialChatComposerDraft
} from '../src/features/chat/chat-state.ts';
import {
  appendAttachmentIdToDraft,
  buildAnswerPayload,
  createInitialAnswerDraft,
  removeAttachmentIdFromDraft
} from '../src/features/questions/question-flow-state.ts';
import {
  buildQuestionFlowBootstrapCommands
} from '../src/features/questions/question-flow-bootstrap.ts';
import {
  findActiveQuestion,
  findQuestionTemplate
} from '../src/features/questions/question-catalog.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

function loadContentPack(): ContentPack {
  return ensureMobileShellContentPack(JSON.parse(readFileSync(generatedPackPath, 'utf8')) as ContentPack);
}

function createChannel(): VisibleChatChannelProjection {
  return {
    channelId: 'channel:global',
    kind: 'global',
    displayName: 'Global',
    visibilityScope: 'public_match'
  };
}

test('media picker unavailable guidance stays honest about local setup requirements', () => {
  const libraryUnavailable = describeUnavailablePicker('library');
  const cameraUnavailable = describeUnavailablePicker('camera');

  assert.equal(libraryUnavailable.status, 'unavailable');
  assert.match(libraryUnavailable.detail, /restart Expo/i);
  assert.match(libraryUnavailable.detail, /rebuild the native app or dev client/i);
  assert.equal(cameraUnavailable.status, 'unavailable');
  assert.match(cameraUnavailable.title, /Camera/i);
});

test('chat media selections build real attachment commands before the message send command', () => {
  const localDraft = createLocalMediaAttachmentDraft({
    context: {
      contextId: 'channel:channel:global',
      kind: 'chat',
      title: 'Attach Media',
      detail: 'Local media picker',
      visibilityScope: 'public_match',
      attachmentKind: 'image',
      channelId: 'channel:global'
    },
    asset: {
      uri: 'file:///tmp/chat-photo.jpg',
      source: 'library',
      fileName: 'chat-photo.jpg',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 800,
      fileSizeBytes: 123456
    },
    createId: () => 'picked-chat-1'
  });

  const commands = buildChatSubmitCommands({
    role: 'host',
    channel: createChannel(),
    draft: {
      ...createInitialChatComposerDraft(),
      body: 'Photo update from the station'
    },
    createId: () => 'message-chat-1',
    selectedAttachments: [localDraft]
  });

  assert.equal(commands.length, 2);
  assert.equal(commands[0]?.type, 'upload_attachment');
  assert.equal(commands[1]?.type, 'send_chat_message');
  assert.equal(commands[0]?.payload.attachmentId, localDraft.attachmentId);
  assert.equal(commands[1]?.payload.attachmentIds?.[0], localDraft.attachmentId);
  assert.equal(commands[0]?.payload.captureMetadata?.storageState, 'metadata_record_only');
});

test('question photo evidence can be recorded through the runtime and referenced in the answer payload', async () => {
  const contentPack = loadContentPack();
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack,
    environment: mobileAppEnvironment
  });
  const hostProfile = {
    displayName: 'Host',
    playerId: 'host-evidence-1',
    authUserId: 'auth-host-evidence-1'
  };

  const created = await orchestrator.createMatch(hostProfile, {
    runtimeKind: 'in_memory',
    matchId: 'mobile-question-evidence',
    initialScale: 'small',
    matchMode: 'single_device_referee'
  });

  await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    buildQuestionFlowBootstrapCommands(created.initialSync.projectionDelivery.projection)
  );

  const asked = await orchestrator.submitCommands(
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
          questionInstanceId: 'question:mobile-photo-runtime',
          templateId: 'photos-a-tree',
          targetTeamId: 'team-hider'
        }
      }
    ]
  );

  const evidenceContext = buildEvidenceContexts(
    contentPack,
    asked.projectionDelivery.projection,
    'host'
  ).find((context) => context.kind === 'question');

  assert.ok(evidenceContext);

  const localDraft = createLocalMediaAttachmentDraft({
    context: {
      contextId: evidenceContext!.contextId,
      kind: 'question',
      title: evidenceContext!.title,
      detail: evidenceContext!.detail,
      visibilityScope: evidenceContext!.suggestedVisibilityScope,
      attachmentKind: 'photo_evidence',
      questionInstanceId: evidenceContext!.questionInstanceId
    },
    asset: {
      uri: 'file:///tmp/tree.jpg',
      source: 'camera',
      fileName: 'tree.jpg',
      mimeType: 'image/jpeg',
      width: 900,
      height: 1600
    },
    createId: () => 'question-evidence-1'
  });

  const evidenceRecorded = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    [buildAttachmentUploadCommandFromDraft(localDraft)]
  );

  assert.equal(
    evidenceRecorded.projectionDelivery.projection.visibleAttachments.some(
      (attachment) => attachment.attachmentId === localDraft.attachmentId
    ),
    true
  );

  const activeQuestion = findActiveQuestion(evidenceRecorded.projectionDelivery.projection);
  const template = findQuestionTemplate(contentPack, activeQuestion?.templateId);
  assert.ok(activeQuestion);
  assert.ok(template);

  const answerDraft = appendAttachmentIdToDraft(
    createInitialAnswerDraft(template),
    localDraft.attachmentId
  );
  const removedDraft = removeAttachmentIdFromDraft(answerDraft, localDraft.attachmentId);

  assert.equal(answerDraft.attachmentIdsText, localDraft.attachmentId);
  assert.equal(removedDraft.attachmentIdsText, '');

  const answered = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    [
      {
        type: 'answer_question',
        payload: {
          questionInstanceId: activeQuestion!.questionInstanceId,
          answer: buildAnswerPayload(template!, {
            ...answerDraft,
            note: 'Tree evidence recorded from the device camera.'
          })
        }
      }
    ]
  );

  const answeredQuestion = findActiveQuestion(answered.projectionDelivery.projection);
  assert.deepEqual(answeredQuestion?.answer?.attachmentIds, [localDraft.attachmentId]);
  assert.equal(answeredQuestion?.answer?.note, 'Tree evidence recorded from the device camera.');

  await orchestrator.disconnect(created.connection);
});
