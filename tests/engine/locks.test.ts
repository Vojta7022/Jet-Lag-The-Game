import assert from 'node:assert/strict';
import test from 'node:test';

import { EngineCommandError, executeCommand } from '../../packages/engine/src/index.ts';
import {
  getCurrentQuestionTemplate,
  loadEngineTestContentPack,
  makeEnvelope,
  moveCardToTeamHand,
  setupMatchToSeekReady
} from './helpers.ts';

test('question flow and card resolution windows lock correctly', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const matchingTemplate = getCurrentQuestionTemplate(
    aggregate,
    contentPack,
    'matching',
    'matching-commercial-airport'
  );

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
          templateId: matchingTemplate.templateId,
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
              templateId: matchingTemplate.templateId,
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
  aggregate.locationSamples = [{ sampleId: 'lock:seeker-origin', playerId: 'seeker-1', role: 'seeker', teamId: 'team-seeker', latitude: 50, longitude: 14, accuracyMeters: 8, source: 'device', onTransit: false, recordedAt: '2026-01-01T00:00:42.000Z' }];
  const firstCardId = moveCardToTeamHand(aggregate, 'curse-curse-of-the-mediocre-travel-agent', 'team-hider');
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
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'set_seeker_transit_context', payload: { sourceCardInstanceId: firstCardId, onTransitOrAtStation: false } },
      44.5
    ),
    contentPack
  ).aggregate;

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'resolve_card_window',
        payload: {
          sourceCardInstanceId: firstCardId,
          mediocreTravelAgentDestinationName: 'Nearby public garden',
          mediocreTravelAgentLatitude: 50.001,
          mediocreTravelAgentLongitude: 14,
          mediocreTravelAgentPublicAccessAttested: true
        }
      },
      45
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.seekPhaseSubstate, 'ready');
  assert.equal(aggregate.activeCardResolution, undefined);
});
