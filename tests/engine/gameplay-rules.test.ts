import assert from 'node:assert/strict';
import test from 'node:test';

import { buildQuestionSelectionState } from '../../packages/domain/src/index.ts';
import { executeCommand } from '../../packages/engine/src/index.ts';
import {
  loadEngineTestContentPack,
  makeEnvelope,
  moveCardToTeamHand,
  setupMatchToHidePhase,
  setupMatchToSeekReady
} from './helpers.ts';

test('ask_question accepts any in-scale investigation-book template and starts a response timer', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'begin_question_prompt', payload: {} },
      20
    ),
    contentPack
  ).aggregate;

  const category = contentPack.questionCategories.find((entry) => entry.categoryId === 'matching');
  assert.ok(category);

  const selection = buildQuestionSelectionState({
    contentPack,
    category: category!,
    selectedScale: aggregate.selectedScale,
    askedQuestions: Object.values(aggregate.questionInstances)
  });
  const printedBookTemplate = contentPack.questionTemplates.find(
    (template) => template.templateId === 'matching-commercial-airport'
  );
  assert.ok(printedBookTemplate);
  assert.equal(selection.availableTemplateIds.includes(printedBookTemplate!.templateId), true);

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      {
        type: 'ask_question',
        payload: {
          questionInstanceId: 'question:valid-matching',
          templateId: printedBookTemplate!.templateId,
          targetTeamId: 'team-hider'
        }
      },
      22
    ),
    contentPack
  ).aggregate;

  const questionTimer = Object.values(aggregate.timers).find(
    (timer) => timer.kind === 'question' && timer.ownerRef === 'question:valid-matching'
  );

  assert.ok(questionTimer);
  assert.equal(questionTimer?.durationSeconds, 300);
  assert.equal(questionTimer?.remainingSeconds, 300);
});

test('a resolved investigation question can be repeated after the next question window opens', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const templateId = 'matching-commercial-airport';
  const matchingCategory = contentPack.questionCategories.find((entry) => entry.categoryId === 'matching');
  assert.ok(matchingCategory);

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'begin_question_prompt', payload: {} }, 60),
    contentPack
  ).aggregate;
  aggregate = executeCommand(
    aggregate,
    makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:repeat-one', templateId, targetTeamId: 'team-hider' }
    }, 61),
    contentPack
  ).aggregate;
  aggregate = executeCommand(
    aggregate,
    makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, {
      type: 'answer_question',
      payload: { questionInstanceId: 'question:repeat-one', answer: { value: 'yes' } }
    }, 62),
    contentPack
  ).aggregate;
  aggregate = executeCommand(
    aggregate,
    makeEnvelope(aggregate.matchId, { actorId: 'host-1', playerId: 'host-1', role: 'host' }, {
      type: 'apply_constraint',
      payload: { questionInstanceId: 'question:repeat-one', constraintId: 'nearest-feature-match', metadata: { answer: 'yes' } }
    }, 63),
    contentPack
  ).aggregate;
  aggregate = executeCommand(
    aggregate,
    makeEnvelope(aggregate.matchId, { actorId: 'host-1', playerId: 'host-1', role: 'host' }, { type: 'complete_cooldown', payload: {} }, 64),
    contentPack
  ).aggregate;
  aggregate = executeCommand(
    aggregate,
    makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'begin_question_prompt', payload: {} }, 65),
    contentPack
  ).aggregate;

  const repeatState = buildQuestionSelectionState({
    contentPack,
    category: matchingCategory!,
    selectedScale: aggregate.selectedScale,
    askedQuestions: Object.values(aggregate.questionInstances)
  });

  assert.equal(repeatState.availableTemplateIds.includes(templateId), true);
  assert.equal(repeatState.rewardMultiplierByTemplate[templateId], 2);
  assert.doesNotThrow(() => executeCommand(
    aggregate,
    makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:repeat-two', templateId, targetTeamId: 'team-hider' }
    }, 66),
    contentPack
  ));
});

test('photo answers require recorded attachments before the hider can answer', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'begin_question_prompt', payload: {} },
      30
    ),
    contentPack
  ).aggregate;

  const photosCategory = contentPack.questionCategories.find((entry) => entry.categoryId === 'photos');
  assert.ok(photosCategory);
  const selection = buildQuestionSelectionState({
    contentPack,
    category: photosCategory!,
    selectedScale: aggregate.selectedScale,
    askedQuestions: Object.values(aggregate.questionInstances)
  });

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      {
        type: 'ask_question',
        payload: {
          questionInstanceId: 'question:photo-proof',
          templateId: selection.availableTemplateIds[0]!,
          targetTeamId: 'team-hider'
        }
      },
      31
    ),
    contentPack
  ).aggregate;

  assert.throws(
    () =>
      executeCommand(
        aggregate,
        makeEnvelope(
          aggregate.matchId,
          { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
          {
            type: 'answer_question',
            payload: {
              questionInstanceId: 'question:photo-proof',
              answer: {
                attachmentIds: []
              }
            }
          },
          32
        ),
        contentPack
      ),
    /requires at least 1 attachment/i
  );
});

test('the hider deck draw flow now enforces the target hand size of 6 cards', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);

  for (let step = 40; step < 46; step += 1) {
    aggregate = executeCommand(
      aggregate,
      makeEnvelope(
        aggregate.matchId,
        { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
        {
          type: 'draw_card',
          payload: {
            deckId: 'hider-main'
          }
        },
        step
      ),
      contentPack
    ).aggregate;
  }

  assert.equal(
    Object.values(aggregate.cardInstances).filter(
      (card) => card.zone === 'hand' && card.holderType === 'team' && card.holderId === 'team-hider'
    ).length,
    6
  );

  assert.throws(
    () =>
      executeCommand(
        aggregate,
        makeEnvelope(
          aggregate.matchId,
          { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
          {
            type: 'draw_card',
            payload: {
              deckId: 'hider-main'
            }
          },
          46
        ),
        contentPack
      ),
    /target size of 6 cards/i
  );
});

test('discard-then-draw power-ups require discard payment and then draw replacements on resolve', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const sourceCardId = moveCardToTeamHand(aggregate, 'power-up-discard-1-draw-2', 'team-hider');
  const spareCardId = moveCardToTeamHand(aggregate, 'power-up-randomize', 'team-hider');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'play_card',
        payload: {
          cardInstanceId: sourceCardId
        }
      },
      50
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_card_resolution');
  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'discard_then_draw');
  assert.equal(aggregate.activeCardResolution?.drawCountOnResolve, 2);

  assert.throws(
    () =>
      executeCommand(
        aggregate,
        makeEnvelope(
          aggregate.matchId,
          { actorId: 'host-1', playerId: 'host-1', role: 'host' },
          {
            type: 'resolve_card_window',
            payload: {
              sourceCardInstanceId: sourceCardId
            }
          },
          51
        ),
        contentPack
      ),
    /discard cost is fully paid/i
  );

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'discard_card',
        payload: {
          cardInstanceId: spareCardId
        }
      },
      52
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
          sourceCardInstanceId: sourceCardId
        }
      },
      53
    ),
    contentPack
  ).aggregate;

  const hiderHandCount = Object.values(aggregate.cardInstances).filter(
    (card) => card.zone === 'hand' && card.holderType === 'team' && card.holderId === 'team-hider'
  ).length;

  assert.equal(aggregate.activeCardResolution, undefined);
  assert.equal(aggregate.cardInstances[sourceCardId]?.zone, 'discard_pile');
  assert.equal(aggregate.cardInstances[spareCardId]?.zone, 'discard_pile');
  assert.equal(hiderHandCount, 2);
});

test('time bonus cards now apply their scale-based bonus directly to the hide timer', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToHidePhase(contentPack);
  const timeBonusCardId = moveCardToTeamHand(aggregate, 'time-bonus-red', 'team-hider');
  const hideTimerBefore = Object.values(aggregate.timers).find((timer) => timer.kind === 'hide');

  assert.ok(hideTimerBefore);

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'play_card',
        payload: {
          cardInstanceId: timeBonusCardId
        }
      },
      60
    ),
    contentPack
  ).aggregate;

  const hideTimerAfter = Object.values(aggregate.timers).find((timer) => timer.kind === 'hide');

  assert.equal(aggregate.cardInstances[timeBonusCardId]?.zone, 'discard_pile');
  assert.equal(hideTimerAfter?.durationSeconds, hideTimerBefore!.durationSeconds + 120);
  assert.equal(hideTimerAfter?.remainingSeconds, hideTimerBefore!.remainingSeconds + 120);
});

test('curses with discard-a-power-up casting costs are blocked until that payment is available', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const curseCardId = moveCardToTeamHand(aggregate, 'curse-curse-of-the-lemon-phylactery', 'team-hider');

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
              cardInstanceId: curseCardId
            }
          },
          70
        ),
        contentPack
      ),
    /power up discard payment/i
  );

  const powerUpCardId = moveCardToTeamHand(aggregate, 'power-up-veto', 'team-hider');
  void powerUpCardId;

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'play_card',
        payload: {
          cardInstanceId: curseCardId
        }
      },
      71
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.activeCardResolution?.discardRequirement?.requiredKind, 'power_up');
});
