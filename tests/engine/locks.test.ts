import assert from 'node:assert/strict';
import test from 'node:test';

import { EngineCommandError, executeCommand } from '../../packages/engine/src/index.ts';
import { loadEngineTestContentPack, makeEnvelope, moveCardToTeamHand, setupMatchToSeekReady } from './helpers.ts';

test('question flow and card resolution windows lock correctly', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'begin_question_prompt', payload: {} },
      40
    ),
    contentPack
  ).aggregate;

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      {
        type: 'ask_question',
        payload: {
          questionInstanceId: 'question-lock',
          templateId: 'matching-commercial-airport',
          targetTeamId: 'team-hider'
        }
      },
      41
    ),
    contentPack
  ).aggregate;

  assert.throws(
    () =>
      executeCommand(
        aggregate,
        makeEnvelope(
          aggregate.matchId,
          { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
          {
            type: 'ask_question',
            payload: {
              questionInstanceId: 'question-locked-2',
              templateId: 'matching-commercial-airport',
              targetTeamId: 'team-hider'
            }
          },
          42
        ),
        contentPack
      ),
    (error: unknown) => {
      assert.ok(error instanceof EngineCommandError);
      assert.equal(error.issues[0]?.code, 'INVALID_STATE');
      return true;
    }
  );

  aggregate = setupMatchToSeekReady(contentPack);
  const firstCardId = moveCardToTeamHand(aggregate, 'curse-', 'team-hider');
  const secondCardId = moveCardToTeamHand(aggregate, 'power-up-', 'team-hider');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'play_card',
        payload: {
          cardInstanceId: firstCardId
        }
      },
      43
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_card_resolution');
  assert.equal(aggregate.activeCardResolution?.sourceCardInstanceId, firstCardId);

  assert.throws(
    () =>
      executeCommand(
        aggregate,
        makeEnvelope(
          aggregate.matchId,
          { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
          {
            type: 'play_card',
            payload: {
              cardInstanceId: secondCardId
            }
          },
          44
        ),
        contentPack
      ),
    (error: unknown) => {
      assert.ok(error instanceof EngineCommandError);
      assert.equal(error.issues[0]?.code, 'CARD_RESOLUTION_LOCKED');
      return true;
    }
  );

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'resolve_card_window',
        payload: {
          sourceCardInstanceId: firstCardId
        }
      },
      45
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.seekPhaseSubstate, 'cooldown');
  assert.equal(aggregate.activeCardResolution, undefined);
});
