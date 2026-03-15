import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchProjection, executeCommand } from '../../packages/engine/src/index.ts';
import { loadEngineTestContentPack, makeEnvelope, setupMatchToSeekReady } from './helpers.ts';

test('chat projections keep public, team-private, and evidence placeholders correctly scoped', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'send_chat_message',
        payload: {
          messageId: 'message:public',
          channelId: 'channel:global',
          body: 'Public update from host'
        }
      },
      60
    ),
    contentPack
  ).aggregate;

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'send_chat_message',
        payload: {
          messageId: 'message:hider-team',
          channelId: 'channel:team:team-hider',
          body: 'Private note for the hider team'
        }
      },
      61
    ),
    contentPack
  ).aggregate;

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'begin_question_prompt',
        payload: {}
      },
      62
    ),
    contentPack
  ).aggregate;

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'ask_question',
        payload: {
          questionInstanceId: 'question:photo-1',
          templateId: 'photos-a-tree',
          targetTeamId: 'team-hider'
        }
      },
      63
    ),
    contentPack
  ).aggregate;

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'upload_attachment',
        payload: {
          attachmentId: 'attachment:photo-1',
          kind: 'photo_evidence',
          label: 'Tree photo placeholder',
          note: 'Manual evidence only',
          visibilityScope: 'team_private',
          questionInstanceId: 'question:photo-1',
          captureMetadata: {
            source: 'tests'
          }
        }
      },
      64
    ),
    contentPack
  ).aggregate;

  const hostProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'host_admin',
    viewerPlayerId: 'host-1',
    viewerRole: 'host'
  });
  const publicProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'public_match'
  });
  const hiderTeamProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private',
    viewerPlayerId: 'hider-1',
    viewerTeamId: 'team-hider',
    viewerRole: 'hider'
  });
  const seekerTeamProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private',
    viewerPlayerId: 'seeker-1',
    viewerTeamId: 'team-seeker',
    viewerRole: 'seeker'
  });

  assert.equal(hostProjection.visibleChatChannels.length >= 4, true);
  assert.equal(hostProjection.visibleChatMessages.length, 2);
  assert.equal(hostProjection.visibleAttachments.length, 1);
  assert.equal(hostProjection.visibleAttachments[0]?.linkedQuestionInstanceId, 'question:photo-1');

  assert.equal(
    publicProjection.visibleChatChannels.some((channel) => channel.channelId === 'channel:team:team-hider'),
    false
  );
  assert.equal(
    publicProjection.visibleChatMessages.some((message) => message.messageId === 'message:hider-team'),
    false
  );
  assert.equal(publicProjection.visibleAttachments.length, 0);

  assert.equal(
    hiderTeamProjection.visibleChatChannels.some((channel) => channel.channelId === 'channel:team:team-hider'),
    true
  );
  assert.equal(
    hiderTeamProjection.visibleChatMessages.some((message) => message.messageId === 'message:hider-team'),
    true
  );
  assert.equal(hiderTeamProjection.visibleAttachments.length, 1);

  assert.equal(
    seekerTeamProjection.visibleChatMessages.some((message) => message.messageId === 'message:public'),
    true
  );
  assert.equal(
    seekerTeamProjection.visibleChatMessages.some((message) => message.messageId === 'message:hider-team'),
    false
  );
  assert.equal(seekerTeamProjection.visibleAttachments.length, 0);
});
