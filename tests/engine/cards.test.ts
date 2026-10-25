import assert from 'node:assert/strict';
import test from 'node:test';

import { representativePointFromGeometry } from '../../packages/geo/src/index.ts';
import { buildCardResolutionPlan } from '../../packages/domain/src/index.ts';
import { buildMatchProjection, executeCommand } from '../../packages/engine/src/index.ts';
import {
  loadEngineTestContentPack,
  makeEnvelope,
  moveCardToTeamHand,
  recordLocationUpdate,
  setupMatchToHidePhase,
  setupMatchToSeekReady
} from './helpers.ts';

test('Endless Tumble has a typed roll challenge plan and the selected-scale hit bonus', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('endless tumble'));
  assert.ok(card);
  card.effects = [{
    effectType: 'endless_tumble_challenge',
    description: card.description,
    automationLevel: 'assisted',
    payload: { minutesByScale: { small: 10, medium: 20, large: 30 } }
  } as never];

  const plan = buildCardResolutionPlan(card, 'medium');
  assert.equal(plan.kind, 'endless_tumble_challenge');
  assert.equal(plan.timeBonusMinutes, 20);
});

test('Labyrinth has a typed puzzle challenge plan with the printed scale drawing window', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('labyrinth'));
  assert.ok(card);
  card.effects = [{
    effectType: 'labyrinth_challenge',
    description: card.description,
    automationLevel: 'assisted',
    payload: {
      drawingWindowMinutesByScale: { small: 10, medium: 20, large: 30 },
      requireHiderApproval: true,
      requirePublicMazePhoto: true
    }
  } as never];

  const plan = buildCardResolutionPlan(card, 'medium');
  assert.equal(plan.kind, 'labyrinth_challenge');
  assert.equal(plan.activeDurationMinutes, 20);
});

test('Right Turn has a typed timed route challenge plan for the selected scale', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('right turn'));
  assert.ok(card);
  card.effects = [{
    effectType: 'right_turn_challenge',
    description: card.description,
    automationLevel: 'assisted',
    payload: { minutesByScale: { small: 20, medium: 40, large: 60 }, deadEndDistanceMeters: 304 }
  } as never];

  const plan = buildCardResolutionPlan(card, 'medium');
  assert.equal(plan.kind, 'right_turn_challenge');
  assert.equal(plan.activeDurationMinutes, 40);
});

test('Right Turn starts its scale timer and records only seeker route attestations', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('right turn'));
  assert.ok(card);
  card.effects = [{
    effectType: 'right_turn_challenge', description: card.description, automationLevel: 'assisted',
    payload: { minutesByScale: { small: 20, medium: 40, large: 60 }, deadEndDistanceMeters: 304 }
  } as never];
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate.selectedScale = 'medium';
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  const spareCard = contentPack.cards.find((candidate) => candidate.kind === 'time_bonus');
  assert.ok(spareCard);
  const spareCardInstanceId = moveCardToTeamHand(aggregate, spareCard.cardDefinitionId, 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 100), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'right_turn_challenge');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'discard_card', payload: { cardInstanceId: spareCardInstanceId } }, 100.5), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 101), contentPack).aggregate;
  assert.equal(aggregate.rightTurnChallenge?.durationMinutes, 40);
  assert.equal(aggregate.rightTurnChallenge?.expiresAt, new Date(Date.parse(aggregate.rightTurnChallenge!.activatedAt) + 40 * 60_000).toISOString());
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_right_turn_route_choice', payload: { sourceCardInstanceId: cardInstanceId, choice: 'right', atStreetIntersection: true } }, 102), contentPack).aggregate;
  assert.equal(aggregate.rightTurnChallenge?.reports[0]?.playerId, 'seeker-1');
  assert.equal(aggregate.rightTurnChallenge?.reports[0]?.compliant, true);
  const hiderView = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider'
  });
  assert.equal(hiderView.rightTurnChallenge?.reports[0]?.choice, 'right');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_right_turn_route_choice', payload: { sourceCardInstanceId: cardInstanceId, choice: 'u_turn', atStreetIntersection: false, deadEndDistanceMeters: 200 } }, 103), contentPack), /304 meters/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'report_right_turn_route_choice', payload: { sourceCardInstanceId: cardInstanceId, choice: 'right', atStreetIntersection: true } }, 104), contentPack), /permission/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_right_turn_route_choice', payload: { sourceCardInstanceId: cardInstanceId, choice: 'u_turn', atStreetIntersection: false, deadEndDistanceMeters: 304 } }, 105), contentPack).aggregate;
  assert.equal(aggregate.rightTurnChallenge?.reports[1]?.compliant, true);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_right_turn_route_choice', payload: { sourceCardInstanceId: cardInstanceId, choice: 'left', atStreetIntersection: true } }, 106), contentPack).aggregate;
  assert.equal(aggregate.rightTurnChallenge?.reports[2]?.compliant, false);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_right_turn_route_choice', payload: { sourceCardInstanceId: cardInstanceId, choice: 'right', atStreetIntersection: true } }, 2_400_102), contentPack), /expired/i);
});

test('Unguided Tourist uses an assisted photo challenge plan', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('unguided tourist'));
  assert.ok(card);
  card.effects = [{
    effectType: 'unguided_tourist_challenge', description: card.description, automationLevel: 'assisted',
    payload: { maximumDistanceMeters: 152, requireSeekerOutdoors: true, requirePublicReferencePhoto: true, requireSeekerPhoto: true }
  } as never];
  const plan = buildCardResolutionPlan(card, 'small');
  assert.equal(plan.kind, 'unguided_tourist_challenge');
});

test('Unguided Tourist requires seeker outdoors confirmations and hider photo approval before travel or questions', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('unguided tourist'));
  assert.ok(card);
  card.effects = [{
    effectType: 'unguided_tourist_challenge', description: card.description, automationLevel: 'assisted',
    payload: { maximumDistanceMeters: 152, requireSeekerOutdoors: true, requirePublicReferencePhoto: true, requireSeekerPhoto: true }
  } as never];
  let aggregate = setupMatchToSeekReady(contentPack);
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 100), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'unguided_tourist_challenge');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId, unguidedTouristHiderAttachmentId: 'tourist:clue' } }, 100.5), contentPack), /hider must confirm/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId, unguidedTouristHiderAttachmentId: 'tourist:clue', unguidedTouristRulesAttested: true } }, 101), contentPack), /each seeker.*outside/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'confirm_unguided_tourist_outdoors', payload: { sourceCardInstanceId: cardInstanceId } }, 102), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'upload_attachment', payload: {
      attachmentId: 'tourist:clue', kind: 'photo_evidence', label: 'Street View clue',
      visibilityScope: 'public_match', cardInstanceId, captureMetadata: { pickerSource: 'library' }
    } }, 103), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId, unguidedTouristHiderAttachmentId: 'tourist:clue', unguidedTouristRulesAttested: true } }, 104), contentPack).aggregate;
  assert.equal(aggregate.unguidedTouristChallenge?.hiderAttachmentId, 'tourist:clue');
  assert.equal(aggregate.unguidedTouristChallenge?.hiderRulesAttested, true);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 105), contentPack), /ready/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'update_location', payload: { latitude: 1.2, longitude: 103.8, source: 'manual', onTransit: true } }, 106), contentPack), /transportation/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'set_seeker_transit_context', payload: { sourceCardInstanceId: cardInstanceId, onTransitOrAtStation: true } }, 106.5), contentPack), /transportation/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'upload_attachment', payload: {
      attachmentId: 'tourist:found-photo-1', kind: 'photo_evidence', label: 'Found location',
      visibilityScope: 'public_match', cardInstanceId, captureMetadata: { pickerSource: 'camera' }
    } }, 107), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'submit_unguided_tourist_photo', payload: { sourceCardInstanceId: cardInstanceId, attachmentId: 'tourist:found-photo-1', attestedNoInternetResearch: false } }, 108), contentPack), /internet research/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'submit_unguided_tourist_photo', payload: { sourceCardInstanceId: cardInstanceId, attachmentId: 'tourist:found-photo-1', attestedNoInternetResearch: true } }, 110), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'review_unguided_tourist_photo', payload: { sourceCardInstanceId: cardInstanceId, approved: false } }, 111), contentPack).aggregate;
  assert.equal(aggregate.unguidedTouristChallenge?.rejectedAttemptCount, 1);
  assert.ok(aggregate.unguidedTouristChallenge);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'upload_attachment', payload: {
      attachmentId: 'tourist:found-photo-2', kind: 'photo_evidence', label: 'Found location retry',
      visibilityScope: 'public_match', cardInstanceId, captureMetadata: { pickerSource: 'camera' }
    } }, 112), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'submit_unguided_tourist_photo', payload: { sourceCardInstanceId: cardInstanceId, attachmentId: 'tourist:found-photo-2', attestedNoInternetResearch: true } }, 113), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'review_unguided_tourist_photo', payload: { sourceCardInstanceId: cardInstanceId, approved: true } }, 114), contentPack).aggregate;
  assert.equal(aggregate.unguidedTouristChallenge, undefined);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 115), contentPack).aggregate;
  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_question_selection');
});

test('Bird Guide uses the printed one-shot filming limit for each scale', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('bird guide'));
  assert.ok(card);
  card.effects = [{ effectType: 'bird_guide_challenge', description: card.description, automationLevel: 'assisted',
    payload: { maximumFilmingMinutesByScale: { small: 5, medium: 10, large: 15 }, requireHiderBirdInFrameAttestation: true, requireSeekerHiderApproval: true } } as never];
  assert.equal(buildCardResolutionPlan(card, 'small').kind, 'bird_guide_challenge');
  assert.equal(buildCardResolutionPlan(card, 'small').activeDurationMinutes, 5);
  assert.equal(buildCardResolutionPlan(card, 'medium').activeDurationMinutes, 10);
  assert.equal(buildCardResolutionPlan(card, 'large').activeDurationMinutes, 15);
});

test('Bird Guide blocks questions until a seeker video matches the hider recording and is approved', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('bird guide'));
  assert.ok(card);
  card.effects = [{ effectType: 'bird_guide_challenge', description: card.description, automationLevel: 'assisted',
    payload: { maximumFilmingMinutesByScale: { small: 5, medium: 10, large: 15 }, requireHiderBirdInFrameAttestation: true, requireSeekerHiderApproval: true } } as never];
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate.selectedScale = 'small';
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 100), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'upload_attachment', payload: { attachmentId: 'bird:hider', kind: 'video_evidence', label: 'Hider bird video', visibilityScope: 'public_match', cardInstanceId, captureMetadata: { pickerSource: 'camera', durationMs: 4_000 } } }, 101), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'upload_attachment', payload: { attachmentId: 'bird:hider-second', kind: 'video_evidence', label: 'Second hider take', visibilityScope: 'public_match', cardInstanceId, captureMetadata: { pickerSource: 'camera', durationMs: 4_000 } } }, 101.5), contentPack), /only one/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId, birdGuideHiderAttachmentId: 'bird:hider', birdGuideBirdPresentAttested: false } }, 102), contentPack), /bird.*in frame/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId, birdGuideHiderAttachmentId: 'bird:hider', birdGuideBirdPresentAttested: true } }, 103), contentPack).aggregate;
  assert.equal(aggregate.birdGuideChallenge?.hiderDurationMs, 4_000);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 104), contentPack), /ready/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'upload_attachment', payload: { attachmentId: 'bird:short', kind: 'video_evidence', label: 'Short bird attempt', visibilityScope: 'public_match', cardInstanceId, captureMetadata: { pickerSource: 'camera', durationMs: 3_999 } } }, 105), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'submit_bird_guide_video', payload: { sourceCardInstanceId: cardInstanceId, attachmentId: 'bird:short' } }, 106), contentPack), /same amount of time or longer/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'upload_attachment', payload: { attachmentId: 'bird:attempt-one', kind: 'video_evidence', label: 'Bird attempt one', visibilityScope: 'public_match', cardInstanceId, captureMetadata: { pickerSource: 'camera', durationMs: 4_000 } } }, 107), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'submit_bird_guide_video', payload: { sourceCardInstanceId: cardInstanceId, attachmentId: 'bird:attempt-one' } }, 108), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'upload_attachment', payload: { attachmentId: 'bird:attempt-too-soon', kind: 'video_evidence', label: 'Premature retry', visibilityScope: 'public_match', cardInstanceId, captureMetadata: { pickerSource: 'camera', durationMs: 4_100 } } }, 108.5), contentPack), /review the current video/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'review_bird_guide_video', payload: { sourceCardInstanceId: cardInstanceId, approved: false } }, 109), contentPack).aggregate;
  assert.equal(aggregate.birdGuideChallenge?.rejectedAttemptCount, 1);
  assert.ok(aggregate.birdGuideChallenge);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'upload_attachment', payload: { attachmentId: 'bird:attempt-two', kind: 'video_evidence', label: 'Bird attempt two', visibilityScope: 'public_match', cardInstanceId, captureMetadata: { pickerSource: 'camera', durationMs: 5_000 } } }, 110), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'submit_bird_guide_video', payload: { sourceCardInstanceId: cardInstanceId, attachmentId: 'bird:attempt-two' } }, 111), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'review_bird_guide_video', payload: { sourceCardInstanceId: cardInstanceId, approved: true } }, 112), contentPack).aggregate;
  assert.equal(aggregate.birdGuideChallenge, undefined);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 113), contentPack).aggregate;
  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_question_selection');
});

test('Mediocre Travel Agent derives the printed trip requirements from the selected scale', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('mediocre travel agent'));
  assert.ok(card);
  card.effects = [{ effectType: 'mediocre_travel_agent_challenge', description: card.description, automationLevel: 'assisted',
    payload: { maximumDistanceMetersByScale: { small: 402, medium: 402, large: 805 }, stayMinutesByScale: { small: 5, medium: 5, large: 10 }, hiderBonusMinutesByScale: { small: 30, medium: 45, large: 60 }, requiredPhotoCount: 3 } } as never];
  for (const [scale, radius, stay, bonus] of [['small', 402, 5, 30], ['medium', 402, 5, 45], ['large', 805, 10, 60]] as const) {
    const plan = buildCardResolutionPlan(card, scale);
    assert.equal(plan.kind, 'mediocre_travel_agent_challenge');
    assert.equal(plan.maximumDistanceMeters, radius);
    assert.equal(plan.activeDurationMinutes, stay);
    assert.equal(plan.timeBonusMinutes, bonus);
  }
});

test('Mediocre Travel Agent tracks a shared trip, photo evidence, souvenir, and lost-souvenir bonus', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('mediocre travel agent'));
  assert.ok(card);
  card.effects = [{ effectType: 'mediocre_travel_agent_challenge', description: card.description, automationLevel: 'assisted',
    payload: { maximumDistanceMetersByScale: { small: 402, medium: 402, large: 805 }, stayMinutesByScale: { small: 5, medium: 5, large: 10 }, hiderBonusMinutesByScale: { small: 30, medium: 45, large: 60 }, requiredPhotoCount: 3 } } as never];
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate.selectedScale = 'small';
  aggregate.locationSamples = [{ sampleId: 'trip:origin', playerId: 'seeker-1', role: 'seeker', teamId: 'team-seeker', latitude: 50, longitude: 14, accuracyMeters: 8, source: 'device', onTransit: false, recordedAt: '2026-01-01T00:01:39.000Z' }];
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'play_card', payload: { cardInstanceId } }, 100), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'mediocre_travel_agent_challenge');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId, mediocreTravelAgentDestinationName: 'Old Town garden', mediocreTravelAgentLatitude: 50.001, mediocreTravelAgentLongitude: 14, mediocreTravelAgentPublicAccessAttested: true } }, 100.25), contentPack), /off transit/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'set_seeker_transit_context', payload: { sourceCardInstanceId: cardInstanceId, onTransitOrAtStation: false } }, 100.5), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId, mediocreTravelAgentDestinationName: 'Outside city', mediocreTravelAgentLatitude: 0, mediocreTravelAgentLongitude: 0, mediocreTravelAgentPublicAccessAttested: true } }, 100.75), contentPack), /inside the selected playable map region/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 101), contentPack), /publicly accessible destination/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId, mediocreTravelAgentDestinationName: 'Old Town garden', mediocreTravelAgentLatitude: 50.001, mediocreTravelAgentLongitude: 14, mediocreTravelAgentPublicAccessAttested: true } }, 102), contentPack).aggregate;
  assert.equal(aggregate.mediocreTravelAgentChallenge?.destinationName, 'Old Town garden');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'begin_question_prompt', payload: {} }, 103), contentPack), /ready/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'update_location', payload: { playerId: 'seeker-1', latitude: 50.001, longitude: 14, accuracyMeters: 8, source: 'device', onTransit: false } }, 103.5), contentPack).aggregate;

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'upload_attachment', payload: { attachmentId: 'trip:photo-1', kind: 'photo_evidence', label: 'Vacation 1', visibilityScope: 'public_match', cardInstanceId, captureMetadata: { pickerSource: 'camera' } } }, 105), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'upload_attachment', payload: { attachmentId: 'trip:photo-2', kind: 'photo_evidence', label: 'Vacation 2', visibilityScope: 'public_match', cardInstanceId, captureMetadata: { pickerSource: 'camera' } } }, 106), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'upload_attachment', payload: { attachmentId: 'trip:photo-3', kind: 'photo_evidence', label: 'Vacation 3', visibilityScope: 'public_match', cardInstanceId, captureMetadata: { pickerSource: 'camera' } } }, 107), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_mediocre_travel_souvenir', payload: { sourceCardInstanceId: cardInstanceId, status: 'acquired' } }, 108), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'set_seeker_transit_context', payload: { sourceCardInstanceId: cardInstanceId, onTransitOrAtStation: true } }, 109), contentPack).aggregate;
  assert.equal(aggregate.mediocreTravelAgentChallenge?.stayStartedAtByPlayerId['seeker-1'], undefined);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'set_seeker_transit_context', payload: { sourceCardInstanceId: cardInstanceId, onTransitOrAtStation: false } }, 110), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'complete_mediocre_travel_agent', payload: { sourceCardInstanceId: cardInstanceId } }, 109), contentPack), /stay.*5 minutes/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'update_location', payload: { playerId: 'seeker-1', latitude: 50.001, longitude: 14, accuracyMeters: 8, source: 'device', onTransit: false } }, 111), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'complete_mediocre_travel_agent', payload: { sourceCardInstanceId: cardInstanceId } }, 410), contentPack), /stay.*5 minutes/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'update_location', payload: { playerId: 'seeker-1', latitude: 50.001, longitude: 14, accuracyMeters: 8, source: 'device' } }, 412), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'complete_mediocre_travel_agent', payload: { sourceCardInstanceId: cardInstanceId } }, 413), contentPack).aggregate;
  assert.ok(aggregate.mediocreTravelAgentChallenge?.completedAt);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_mediocre_travel_souvenir', payload: { sourceCardInstanceId: cardInstanceId, status: 'lost' } }, 414), contentPack).aggregate;
  assert.equal(aggregate.awardedCurseBonusMinutes, 30);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_mediocre_travel_souvenir', payload: { sourceCardInstanceId: cardInstanceId, status: 'lost' } }, 415), contentPack), /already reported/i);
});

test('Impressionable Consumer has a typed assisted plan for its scanned 30 m advertisement rule', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('impressionable consumer'));
  assert.ok(card);
  card.effects = [{ effectType: 'impressionable_consumer_challenge', description: card.description, automationLevel: 'assisted', payload: { minimumAdvertisementDistanceMeters: 30, requireOutdoorAdvertisement: true, requireHiderReview: true } } as never];
  const plan = buildCardResolutionPlan(card, 'small');
  assert.equal(plan.kind, 'impressionable_consumer_challenge');
  assert.equal(plan.minimumAdvertisementDistanceMeters, 30);
});

test('Distant Cuisine has a typed assisted plan that compares nearest country boundaries', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('distant cuisine'));
  assert.ok(card);
  card.effects = [{ effectType: 'distant_cuisine_challenge', description: card.description, automationLevel: 'assisted', payload: { requireSingleCountryReference: true, compareNearestCountryBoundaryDistance: true, requireHiderReview: true } } as never];
  const plan = buildCardResolutionPlan(card, 'small');
  assert.equal(plan.kind, 'distant_cuisine_challenge');
});

test('Distant Cuisine blocks questions until every seeker visits an approved farther-cuisine restaurant', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('distant cuisine'));
  assert.ok(card);
  card.effects = [{ effectType: 'distant_cuisine_challenge', description: card.description, automationLevel: 'assisted', payload: {} } as never];
  let aggregate = setupMatchToSeekReady(contentPack);
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 100), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 101), contentPack).aggregate;
  assert.equal(aggregate.distantCuisineChallenge?.sourceCardInstanceId, cardInstanceId);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 102), contentPack), /ready|curse|challenge/i);

  aggregate = recordLocationUpdate(aggregate, contentPack, { playerId: 'hider-1', role: 'hider', latitude: 50.2, longitude: 14.2, accuracyMeters: 8, source: 'device', step: 103 });
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_distant_cuisine_origin', payload: {
      sourceCardInstanceId: cardInstanceId, restaurantName: 'Origin Bistro', restaurantLatitude: 50.2, restaurantLongitude: 14.2,
      cuisineCountryName: 'Japan', cuisineCountryRegionId: 'osm:relation:1', publicSingleCountryReferenceAttested: true
    } }, 104), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'submit_distant_cuisine_target', payload: {
      sourceCardInstanceId: cardInstanceId, restaurantName: 'Target Bistro', restaurantLatitude: 50.25, restaurantLongitude: 14.25,
      cuisineCountryName: 'Mexico', cuisineCountryRegionId: 'osm:relation:2', publicSingleCountryReferenceAttested: true
    } }, 105), contentPack).aggregate;
  aggregate = recordLocationUpdate(aggregate, contentPack, { playerId: 'seeker-1', role: 'seeker', latitude: 50.2, longitude: 14.2, accuracyMeters: 8, source: 'device', step: 106 });
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_distant_cuisine_distance', payload: { sourceCardInstanceId: cardInstanceId, sourceCountryDistanceMeters: 400_000, targetCountryDistanceMeters: 500_000 } }, 107), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'review_distant_cuisine_target', payload: { sourceCardInstanceId: cardInstanceId, approved: true } }, 108), contentPack).aggregate;
  aggregate = recordLocationUpdate(aggregate, contentPack, { playerId: 'seeker-1', role: 'seeker', latitude: 50.25, longitude: 14.25, accuracyMeters: 8, source: 'device', step: 109 });
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'complete_distant_cuisine_challenge', payload: { sourceCardInstanceId: cardInstanceId } }, 110), contentPack).aggregate;

  assert.ok(aggregate.distantCuisineChallenge?.completedAt);
  assert.ok(aggregate.distantCuisineChallenge?.completedAtByPlayerId['seeker-1']);
});

test('Impressionable Consumer gates questions until hider-approved advertisement, target visit, and purchase/entry attestations', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('impressionable consumer'));
  assert.ok(card);
  card.effects = [{ effectType: 'impressionable_consumer_challenge', description: card.description, automationLevel: 'assisted', payload: { minimumAdvertisementDistanceMeters: 30, requireOutdoorAdvertisement: true, requireHiderReview: true } } as never];
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate.locationSamples = [{ sampleId: 'consumer:origin', playerId: 'seeker-1', role: 'seeker', teamId: 'team-seeker', latitude: 50, longitude: 14, accuracyMeters: 8, source: 'device', recordedAt: '2026-01-01T00:00:49.000Z' }];
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'play_card', payload: { cardInstanceId } }, 50), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 51), contentPack).aggregate;
  assert.ok(aggregate.impressionableConsumerChallenge);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'begin_question_prompt', payload: {} }, 52), contentPack), /approved advertisement challenge/i);
  const target = { sourceCardInstanceId: cardInstanceId, advertisementName: 'Street poster for Cafe', advertisementLatitude: 50.001, advertisementLongitude: 14, advertisementOutdoorsAttested: true as const, targetName: 'Cafe', targetLatitude: 50.003, targetLongitude: 14, action: 'buy_product_or_service' as const, targetIsBusinessAttested: true as const };
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'submit_impressionable_consumer_target', payload: { ...target, advertisementLatitude: 50.0029, advertisementLongitude: 14 } }, 52.5), contentPack), /at least 30 m/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'submit_impressionable_consumer_target', payload: target }, 53), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'complete_impressionable_consumer_challenge', payload: { sourceCardInstanceId: cardInstanceId } }, 54), contentPack), /hider must approve/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'review_impressionable_consumer_target', payload: { sourceCardInstanceId: cardInstanceId, approved: true } }, 55), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'update_location', payload: { playerId: 'seeker-1', latitude: 50.003, longitude: 14, accuracyMeters: 9, source: 'device' } }, 56), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'complete_impressionable_consumer_challenge', payload: { sourceCardInstanceId: cardInstanceId } }, 57), contentPack).aggregate;
  assert.ok(aggregate.impressionableConsumerChallenge?.completedAt);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'begin_question_prompt', payload: {} }, 58), contentPack).aggregate;
  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_question_selection');
});

test('Labyrinth blocks questions until a seeker solution is approved by the hider', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('labyrinth'));
  assert.ok(card);
  card.effects = [{
    effectType: 'labyrinth_challenge', description: card.description, automationLevel: 'assisted',
    payload: { drawingWindowMinutesByScale: { small: 10, medium: 20, large: 30 }, requirePublicMazePhoto: true, requireHiderApproval: true }
  } as never];
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate.selectedScale = 'medium';
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 100), contentPack).aggregate;

  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'labyrinth_challenge');
  assert.equal(aggregate.activeCardResolution?.labyrinthDrawingWindowMinutes, 20);
  assert.equal(aggregate.activeCardResolution?.labyrinth?.status, 'awaiting_maze');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 101), contentPack), /ready/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'upload_attachment', payload: {
      attachmentId: 'labyrinth:maze-photo', kind: 'photo_evidence', label: 'Hand-drawn maze',
      visibilityScope: 'public_match', cardInstanceId,
      captureMetadata: { pickerSource: 'camera' }
    } }, 102), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'publish_labyrinth_maze', payload: { sourceCardInstanceId: cardInstanceId, attachmentId: 'labyrinth:maze-photo' } }, 103), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.labyrinth?.status, 'solving');
  assert.equal(aggregate.activeCardResolution?.labyrinth?.mazeAttachmentId, 'labyrinth:maze-photo');
  const seekerView = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seekers', viewerRole: 'seeker'
  });
  assert.equal(seekerView.activeCardResolution?.labyrinth?.mazeAttachmentId, 'labyrinth:maze-photo');
  assert.ok(seekerView.visibleAttachments.some((attachment) => attachment.attachmentId === 'labyrinth:maze-photo'));
  const publicView = buildMatchProjection(aggregate, contentPack, { scope: 'public_match', viewerRole: undefined });
  assert.equal(publicView.activeCardResolution, undefined);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 103.5), contentPack), /publish a maze/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'submit_labyrinth_solution', payload: { sourceCardInstanceId: cardInstanceId, solutionText: 'Start to the east, then follow the upper corridor to the exit.' } }, 104), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.labyrinth?.status, 'awaiting_hider_review');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'review_labyrinth_solution', payload: { sourceCardInstanceId: cardInstanceId, approved: true } }, 104.5), contentPack), /permission/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'review_labyrinth_solution', payload: { sourceCardInstanceId: cardInstanceId, approved: false } }, 105), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.labyrinth?.status, 'solving');
  assert.equal(aggregate.activeCardResolution?.labyrinth?.rejectedAttemptCount, 1);
  const openedAtBeforeRestart = aggregate.activeCardResolution?.openedAt;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'upload_attachment', payload: {
      attachmentId: 'labyrinth:restarted-maze-photo', kind: 'photo_evidence', label: 'Restarted hand-drawn maze',
      visibilityScope: 'public_match', cardInstanceId,
      captureMetadata: { pickerSource: 'camera' }
    } }, 105.5), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'publish_labyrinth_maze', payload: { sourceCardInstanceId: cardInstanceId, attachmentId: 'labyrinth:restarted-maze-photo' } }, 105.75), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.openedAt, openedAtBeforeRestart);
  assert.equal(aggregate.activeCardResolution?.labyrinthDrawingWindowMinutes, 20);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'submit_labyrinth_solution', payload: { sourceCardInstanceId: cardInstanceId, solutionText: 'Follow the central path to the marked exit.' } }, 106), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'review_labyrinth_solution', payload: { sourceCardInstanceId: cardInstanceId, approved: true } }, 107), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.labyrinth?.status, 'solved');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 108), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution, undefined);
  assert.equal(aggregate.cardInstances[cardInstanceId]?.zone, 'discard_pile');
});

test('Endless Tumble casting roll, 30 m seeker roll, question gate, and hit bonus follow the card rule', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('endless tumble'));
  assert.ok(card);
  card.effects = [{
    effectType: 'endless_tumble_challenge',
    description: card.description,
    automationLevel: 'assisted',
    payload: { minimumDistanceMeters: 30, successfulDieResults: [5, 6], minutesByScale: { small: 10, medium: 20, large: 30 } }
  } as never];
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate.selectedScale = 'medium';
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'endless_tumble_challenge');
  assert.equal(aggregate.activeCardResolution?.timeBonusMinutes, 20);
  assert.equal(aggregate.activeCardResolution?.endlessTumbleMinimumDistanceMeters, 30);
  assert.deepEqual(aggregate.activeCardResolution?.endlessTumbleSuccessfulDieResults, [5, 6]);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_endless_tumble_cast', payload: { sourceCardInstanceId: cardInstanceId, dieRoll: 2 } }, 71), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution, undefined);
  assert.equal(aggregate.endlessTumbleChallenge?.hiderBonusMinutes, 20);
  const waterWeight = contentPack.cards.find((candidate) => candidate.effects.some((effect) => effect.effectType === 'water_weight_challenge'));
  assert.ok(waterWeight);
  const secondBlockingCurseId = moveCardToTeamHand(aggregate, waterWeight.cardDefinitionId, 'team-hider');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: secondBlockingCurseId } }, 72), contentPack),
  /wait until the active question- or transit-blocking curse is cleared/i);

  const reportRoll = (dieRoll: number | null, distanceMeters: number, unaided: boolean, landsCleanly: boolean, hitPerson: boolean, at: number) => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_endless_tumble_roll', payload: { sourceCardInstanceId: cardInstanceId, dieRoll, distanceMeters, unaided, landsCleanly, hitPerson } }, at), contentPack);
  aggregate = reportRoll(6, 29.9, true, true, false, 73).aggregate;
  assert.equal(aggregate.endlessTumbleChallenge?.successfulRollAt, undefined);
  aggregate = reportRoll(null, 30, true, false, false, 74).aggregate;
  assert.equal(aggregate.endlessTumbleChallenge?.successfulRollAt, undefined);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 75), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:endless-tumble-blocked', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider'
    } }, 76), contentPack), /must report a clean, unaided roll of 5 or 6/i);
  aggregate = reportRoll(5, 30, true, false, true, 77).aggregate;
  assert.equal(aggregate.endlessTumbleChallenge?.successfulRollAt, undefined);
  assert.equal(aggregate.awardedCurseBonusMinutes, 20);
  aggregate = reportRoll(5, 30, true, true, false, 78).aggregate;
  assert.ok(aggregate.endlessTumbleChallenge?.successfulRollAt);
  assert.equal(aggregate.awardedCurseBonusMinutes, 20);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:endless-tumble', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider'
    } }, 79), contentPack).aggregate;
  assert.equal(aggregate.endlessTumbleChallenge, undefined);
  assert.equal(aggregate.awardedCurseBonusMinutes, 20);
});

test('Endless Tumble has no effect when the hider casting roll is 5 or 6', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('endless tumble'));
  assert.ok(card);
  card.effects = [{ ...card.effects[0]!, effectType: 'endless_tumble_challenge', automationLevel: 'assisted' }];
  const aggregate = setupMatchToSeekReady(contentPack);
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  const played = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 80), contentPack).aggregate;
  const resolved = executeCommand(played, makeEnvelope(played.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_endless_tumble_cast', payload: { sourceCardInstanceId: cardInstanceId, dieRoll: 6 } }, 81), contentPack);
  assert.equal(resolved.aggregate.endlessTumbleChallenge, undefined);
  assert.equal(resolved.aggregate.cardInstances[cardInstanceId]?.zone, 'discard_pile');
  assert.equal(resolved.events[0]?.event.type, 'endless_tumble_cast_resolved');
  assert.equal(resolved.events[0]?.event.payload.effectActivated, false);
});

test('Move lets only the hider relocate, select a new zone, and confirm arrival', () => {
  const contentPack = loadEngineTestContentPack();
  contentPack.rulesets[0]!.locationPolicies = {
    requireStationCenteredZone: true,
    endgameRequiresOffTransit: true
  };
  let aggregate = setupMatchToHidePhase(contentPack);
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  const oldStation = { latitude: point![1], longitude: point![0] };
  const newStation = { latitude: 50.2, longitude: 14.25 };

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_hiding_zone', payload: { stationId: 'node/old', stationName: 'Old Station', ...oldStation } } as never,
    30), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'lock_hider_location', payload: oldStation },
    31), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'end_hide_phase', payload: {} },
    32), contentPack).aggregate;
  const moveCardId = moveCardToTeamHand(aggregate, 'power-up-move', 'team-hider');
  const spareCardId = moveCardToTeamHand(aggregate, 'power-up-veto', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: moveCardId } },
    33), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'move');
  assert.equal(aggregate.activeCardResolution?.moveDurationSeconds, 10 * 60);
  assert.equal(aggregate.activeCardResolution?.moveOriginStationName, 'Old Station');
  assert.equal(aggregate.hiddenState.hiderLocation, undefined);
  assert.equal(aggregate.cardInstances[spareCardId]?.zone, 'discard_pile');
  const seekerMoveView = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });
  assert.equal(seekerMoveView.activeCardResolution?.moveOriginStationName, 'Old Station');
  assert.equal(seekerMoveView.hiddenState, undefined);

  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'update_location', payload: { latitude: 50.21, longitude: 14.25, source: 'manual' } },
    34), contentPack), /only the hider can move during a Move card/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'update_location', payload: { ...newStation, source: 'manual' } },
    35), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_hiding_zone', payload: { stationId: 'node/new', stationName: 'New Station', ...newStation } } as never,
    36), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'lock_hider_location', payload: newStation },
    37), contentPack).aggregate;

  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: moveCardId } },
    632), contentPack), /Move timer has not expired/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: moveCardId } },
    633), contentPack).aggregate;

  assert.equal(aggregate.hiddenState.hidingZone?.stationId, 'node/new');
  assert.equal(aggregate.hiddenState.hiderLocation?.latitude, newStation.latitude);
  assert.equal(aggregate.seekPhaseSubstate, 'ready');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_final_hiding_spot', payload: {
      latitude: newStation.latitude,
      longitude: newStation.longitude,
      publiclyAccessible: true,
      within3mOfMarkedPath: true
    } },
    634), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'update_location', payload: {
      latitude: newStation.latitude,
      longitude: newStation.longitude,
      source: 'manual',
      onTransit: false
    } },
    638), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'confirm_hider_found', payload: {
      latitude: newStation.latitude,
      longitude: newStation.longitude,
      visuallyIdentified: true
    } },
    643), contentPack).aggregate;
  assert.equal(aggregate.roundResults?.at(-1)?.survivalSeconds, 33);
});

test('Bridge Troll blocks the next question until each seeker confirms they are under a bridge', () => {
  const contentPack = loadEngineTestContentPack();
  const bridgeTroll = contentPack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-the-bridge-troll');
  assert.ok(bridgeTroll);
  bridgeTroll.castingCost = [];
  bridgeTroll.effects = bridgeTroll.effects.map((effect) => ({
    ...effect,
    effectType: 'bridge_troll_challenge',
    automationLevel: 'assisted'
  }));
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate.players['seeker-2'] = {
    playerId: 'seeker-2', displayName: 'Second Seeker', connectionState: 'connected', joinedAt: aggregate.createdAt
  };
  aggregate.roleAssignments['seeker-2'] = { playerId: 'seeker-2', role: 'seeker', teamId: 'team-seeker' };
  aggregate.teams['team-seeker']!.memberPlayerIds.push('seeker-2');
  const cardInstanceId = moveCardToTeamHand(aggregate, bridgeTroll.cardDefinitionId, 'team-hider');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'bridge_troll_challenge');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 71), contentPack).aggregate;
  assert.equal(aggregate.bridgeTrollChallenge?.sourceCardInstanceId, cardInstanceId);
  assert.deepEqual(aggregate.bridgeTrollChallenge?.attestedAtByPlayerId, {});
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_bridge_troll_position', payload: { sourceCardInstanceId: cardInstanceId, underBridge: true } } as never, 72), contentPack), /does not have permission/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'set_bridge_troll_position', payload: { sourceCardInstanceId: cardInstanceId, underBridge: 'yes' } } as never, 72), contentPack), /choose whether you are currently under the bridge/i);
  for (const role of ['hider', 'seeker'] as const) {
    const teamId = role === 'hider' ? 'team-hider' : 'team-seeker';
    const view = buildMatchProjection(aggregate, contentPack, {
      scope: 'team_private',
      viewerPlayerId: `${role}-1`,
      viewerTeamId: teamId,
      viewerRole: role
    });
    assert.equal(view.bridgeTrollChallenge?.sourceCardInstanceId, cardInstanceId);
  }

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 72), contentPack).aggregate;
  const askQuestion = (occurredAt: number) => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:bridge-troll',
      templateId: 'matching-commercial-airport',
      targetTeamId: 'team-hider'
    } }, occurredAt), contentPack);
  assert.throws(() => askQuestion(73), /every seeker must confirm they are under a bridge/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'set_bridge_troll_position', payload: { sourceCardInstanceId: cardInstanceId, underBridge: true } } as never, 74), contentPack).aggregate;
  assert.deepEqual(aggregate.bridgeTrollChallenge?.attestedAtByPlayerId, { 'seeker-1': '2026-01-01T00:01:14.000Z' });
  assert.throws(() => askQuestion(75), /every seeker must confirm they are under a bridge/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-2', playerId: 'seeker-2', role: 'seeker' },
    { type: 'set_bridge_troll_position', payload: { sourceCardInstanceId: cardInstanceId, underBridge: true } } as never, 76), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'set_bridge_troll_position', payload: { sourceCardInstanceId: cardInstanceId, underBridge: false } } as never, 77), contentPack).aggregate;
  assert.throws(() => askQuestion(78), /every seeker must confirm they are under a bridge/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'set_bridge_troll_position', payload: { sourceCardInstanceId: cardInstanceId, underBridge: true } } as never, 79), contentPack).aggregate;
  const result = askQuestion(80);
  assert.equal(result.aggregate.questionInstances['question:bridge-troll']?.status, 'awaiting_answer');
  assert.equal(result.aggregate.bridgeTrollChallenge, undefined);
});

test('Urban Explorer blocks questions until every seeker confirms they are off transit and out of train stations', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((item) => item.cardDefinitionId === 'curse-curse-of-the-urban-explorer');
  assert.ok(card);
  card.castingCost = [];
  card.effects = card.effects.map((effect) => ({
    ...effect,
    effectType: 'seeker_off_transit_challenge',
    automationLevel: 'assisted'
  }));
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate.players['seeker-2'] = {
    playerId: 'seeker-2', displayName: 'Second Seeker', connectionState: 'connected', joinedAt: aggregate.createdAt
  };
  aggregate.roleAssignments['seeker-2'] = { playerId: 'seeker-2', role: 'seeker', teamId: 'team-seeker' };
  aggregate.teams['team-seeker']!.memberPlayerIds.push('seeker-2');
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'seeker_off_transit_challenge');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 71), contentPack).aggregate;
  assert.equal(aggregate.seekerOffTransitRestriction?.sourceCardInstanceId, cardInstanceId);

  const askQuestion = (step: number) => {
    const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'begin_question_prompt', payload: {} }, step), contentPack).aggregate;
    return executeCommand(prompted, makeEnvelope(aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'ask_question', payload: {
        questionInstanceId: `question:urban-explorer:${step}`,
        templateId: 'matching-commercial-airport',
        targetTeamId: 'team-hider'
      } }, step + 1), contentPack).aggregate;
  };

  assert.throws(() => askQuestion(72), /each seeker must confirm they are off transit and outside a train station/i);
  const setStatus = (playerId: string, onTransitOrAtStation: boolean, step: number) => executeCommand(aggregate,
    makeEnvelope(aggregate.matchId,
      { actorId: playerId, playerId, role: 'seeker' },
      { type: 'set_seeker_transit_context', payload: { sourceCardInstanceId: cardInstanceId, onTransitOrAtStation } } as never,
      step), contentPack);
  aggregate = setStatus('seeker-1', false, 74).aggregate;
  assert.throws(() => askQuestion(75), /each seeker must confirm they are off transit and outside a train station/i);
  aggregate = setStatus('seeker-2', true, 77).aggregate;
  assert.throws(() => askQuestion(78), /seekers cannot ask while anyone is on transit or at a train station/i);
  aggregate = setStatus('seeker-2', false, 80).aggregate;

  const hiderProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider'
  });
  assert.equal(hiderProjection.seekerOffTransitRestriction?.statusByPlayerId['seeker-1']?.onTransitOrAtStation, false);
  assert.equal(hiderProjection.seekerOffTransitRestriction?.statusByPlayerId['seeker-2']?.onTransitOrAtStation, false);
  assert.equal(askQuestion(82).lifecycleState, 'seek_phase');
});

test('U-Turn blocks questions until every seeker disembarks at the confirmed next station', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((item) => item.cardDefinitionId === 'curse-curse-of-the-u-turn');
  assert.ok(card);
  card.effects = [{ effectType: 'u_turn_challenge', description: card.description, automationLevel: 'assisted', payload: {
    alternateTransitWindowMinutesByScale: { small: 30, medium: 30, large: 60 }
  } } as never];
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate.players['seeker-2'] = {
    playerId: 'seeker-2', displayName: 'Second Seeker', connectionState: 'connected', joinedAt: aggregate.createdAt
  };
  aggregate.roleAssignments['seeker-2'] = { playerId: 'seeker-2', role: 'seeker', teamId: 'team-seeker' };
  aggregate.teams['team-seeker']!.memberPlayerIds.push('seeker-2');
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  assert.equal(buildCardResolutionPlan(card, 'small').kind, 'u_turn_challenge');
  assert.equal((buildCardResolutionPlan(card, 'small') as { activeDurationMinutes?: number }).activeDurationMinutes, 30);
  assert.equal((buildCardResolutionPlan(card, 'large') as { activeDurationMinutes?: number }).activeDurationMinutes, 60);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId, uTurnNextStationName: 'Central Station' } } as never, 70.5), contentPack), /confirm the seekers are moving farther/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId, uTurnNextStationName: 'Central Station', uTurnPreconditionsConfirmed: true } } as never, 71), contentPack).aggregate;
  assert.equal(aggregate.uTurnChallenge?.nextStationName, 'Central Station');
  assert.equal(aggregate.uTurnChallenge?.alternateTransitWindowMinutes, 30);

  const ask = (step: number) => {
    const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'begin_question_prompt', payload: {} }, step), contentPack).aggregate;
    return executeCommand(prompted, makeEnvelope(prompted.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'ask_question', payload: {
        questionInstanceId: `question:u-turn:${step}`, templateId: 'matching-commercial-airport', targetTeamId: 'team-hider'
      } }, step + 1), contentPack);
  };
  assert.throws(() => ask(72), /each seeker must confirm disembarking at central station/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'report_u_turn_disembarkation', payload: { sourceCardInstanceId: cardInstanceId, stationName: 'Central Station' } }, 73), contentPack), /does not have permission/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'report_u_turn_disembarkation', payload: { sourceCardInstanceId: cardInstanceId, stationName: 'Central Station', targetPlayerId: 'seeker-2' } }, 73.5), contentPack).aggregate;
  assert.ok(aggregate.uTurnChallenge?.disembarkedAtByPlayerId['seeker-2']);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_u_turn_disembarkation', payload: { sourceCardInstanceId: cardInstanceId, stationName: 'Wrong Station' } } as never, 74), contentPack), /confirm that you disembarked at central station/i);
  assert.throws(() => ask(75), /each seeker must confirm disembarking at central station/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_u_turn_disembarkation', payload: { sourceCardInstanceId: cardInstanceId, stationName: 'Central Station' } }, 76), contentPack).aggregate;
  assert.equal(aggregate.uTurnChallenge, undefined);
  assert.equal(ask(77).aggregate.activeQuestionInstanceId, `question:u-turn:77`);
});

test('Ransom Note requires a hider-approved five-word cut-out question and consumes it once', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((item) => item.cardDefinitionId === 'curse-curse-of-the-ransom-note');
  assert.ok(card);
  card.effects = [{ effectType: 'ransom_note_challenge', description: card.description, automationLevel: 'assisted' } as never];
  let aggregate = setupMatchToSeekReady(contentPack);
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  assert.equal(buildCardResolutionPlan(card, 'small').kind, 'ransom_note_challenge');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 70.5), contentPack), /spell RANSOM NOTE with printed cutouts/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId, ransomNoteCastingCostConfirmed: true } } as never, 71), contentPack).aggregate;
  assert.equal(aggregate.ransomNoteChallenge?.sourceCardInstanceId, cardInstanceId);

  const ask = (step: number, ransomNoteText?: string) => {
    const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'begin_question_prompt', payload: {} }, step), contentPack).aggregate;
    return executeCommand(prompted, makeEnvelope(prompted.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'ask_question', payload: {
        questionInstanceId: `question:ransom:${step}`, templateId: 'matching-commercial-airport', targetTeamId: 'team-hider', ransomNoteText
      } } as never, step + 1), contentPack);
  };
  assert.throws(() => ask(72), /hider must approve the cut-out question/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_ransom_note_question', payload: { sourceCardInstanceId: cardInstanceId, noteText: 'Four words only', printedCutoutsConfirmed: true } } as never, 73), contentPack), /at least five words/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'report_ransom_note_question', payload: { sourceCardInstanceId: cardInstanceId, noteText: 'Where is the nearest airport now', printedCutoutsConfirmed: true } } as never, 73.5), contentPack), /does not have permission/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_ransom_note_question', payload: { sourceCardInstanceId: cardInstanceId, noteText: 'Where is the nearest airport now', printedCutoutsConfirmed: true } } as never, 74), contentPack).aggregate;
  assert.throws(() => ask(75, 'Where is the nearest airport now'), /hider must approve the cut-out question/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'decide_ransom_note_question', payload: { sourceCardInstanceId: cardInstanceId, accepted: false } } as never, 76), contentPack).aggregate;
  assert.equal(aggregate.ransomNoteChallenge?.candidate, undefined);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_ransom_note_question', payload: { sourceCardInstanceId: cardInstanceId, noteText: 'Please tell us which country this is', printedCutoutsConfirmed: true } } as never, 77), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'decide_ransom_note_question', payload: { sourceCardInstanceId: cardInstanceId, accepted: true } } as never, 78), contentPack).aggregate;
  assert.throws(() => ask(79, 'Please tell us which country this was'), /approved ransom note wording must match/i);
  const asked = ask(80, 'Please tell us which country this is').aggregate;
  assert.equal(asked.questionInstances['question:ransom:80']?.ransomNoteText, 'Please tell us which country this is');
  assert.equal(asked.ransomNoteChallenge, undefined);
});

test('Cairn makes seekers rebuild a five-second-stable tower to the hider height', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((item) => item.cardDefinitionId === 'curse-curse-of-the-cairn');
  assert.ok(card);
  card.effects = [{ effectType: 'cairn_challenge', description: card.description, automationLevel: 'assisted' } as never];
  let aggregate = setupMatchToSeekReady(contentPack);
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  assert.equal(buildCardResolutionPlan(card, 'small').kind, 'cairn_challenge');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId, cairnTargetHeight: 0 } } as never, 71), contentPack), /at least one rock/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId, cairnTargetHeight: 2, cairnTargetConfirmed: true } } as never, 72), contentPack).aggregate;
  assert.equal(aggregate.cairnChallenge?.targetHeight, 2);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, {
    type: 'begin_cairn_rock_placement', payload: { sourceCardInstanceId: cardInstanceId }
  }, 72.25), contentPack), /does not have permission/i);
  const blockedPrompt = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'begin_question_prompt', payload: {} }, 72.5), contentPack).aggregate;
  assert.throws(() => executeCommand(blockedPrompt, makeEnvelope(blockedPrompt.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
    type: 'ask_question', payload: { questionInstanceId: 'question:cairn:blocked', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider' }
  }, 73), contentPack), /build a tower with 2 rocks/i);

  const seeker = { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' as const };
  const run = (type: 'begin_cairn_rock_placement' | 'confirm_cairn_rock_stable' | 'report_cairn_tower_fallen', step: number) =>
    executeCommand(aggregate, makeEnvelope(aggregate.matchId, seeker,
      { type, payload: { sourceCardInstanceId: cardInstanceId } } as never, step), contentPack);
  aggregate = run('begin_cairn_rock_placement', 73).aggregate;
  assert.throws(() => run('confirm_cairn_rock_stable', 77), /must stand for at least five seconds/i);
  aggregate = run('report_cairn_tower_fallen', 78).aggregate;
  assert.equal(aggregate.cairnChallenge?.seekerStableHeight, 0);
  assert.equal(aggregate.cairnChallenge?.attempts, 1);
  aggregate = run('begin_cairn_rock_placement', 80).aggregate;
  aggregate = run('confirm_cairn_rock_stable', 85).aggregate;
  assert.equal(aggregate.cairnChallenge?.seekerStableHeight, 1);
  aggregate = run('begin_cairn_rock_placement', 86).aggregate;
  aggregate = run('confirm_cairn_rock_stable', 91).aggregate;
  assert.ok(aggregate.cairnChallenge?.completedAt);
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId, seeker, { type: 'begin_question_prompt', payload: {} }, 92), contentPack).aggregate;
  const asked = executeCommand(prompted, makeEnvelope(prompted.matchId, seeker, {
    type: 'ask_question', payload: { questionInstanceId: 'question:cairn:complete', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider' }
  }, 93), contentPack);
  assert.equal(asked.aggregate.activeQuestionInstanceId, 'question:cairn:complete');
});

test('Water Weight opens an assisted supply challenge with its printed scale-specific bonus', () => {
  const contentPack = loadEngineTestContentPack();
  const waterWeight = contentPack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-water-weight');
  assert.ok(waterWeight);
  waterWeight.castingCost = [];
  waterWeight.effects = waterWeight.effects.map((effect) => ({
    ...effect,
    effectType: 'water_weight_challenge',
    automationLevel: 'assisted',
    payload: { minutesByScale: { small: 30, medium: 30, large: 60 } }
  }));
  const aggregate = setupMatchToSeekReady(contentPack, 'small');
  const cardInstanceId = moveCardToTeamHand(aggregate, waterWeight.cardDefinitionId, 'team-hider');

  const played = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;

  assert.equal(played.activeCardResolution?.resolutionKind, 'water_weight_challenge');
  assert.equal(played.activeCardResolution?.timeBonusMinutes, 30);
});

test('Lemon Phylactery gates questions per seeker and awards the scale bonus when contact is lost', () => {
  const contentPack = loadEngineTestContentPack();
  const lemon = contentPack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-the-lemon-phylactery');
  assert.ok(lemon);
  lemon.castingCost = [];
  lemon.effects = [{ ...lemon.effects[0]!, effectType: 'lemon_phylactery_challenge', automationLevel: 'assisted', payload: { minutesByScale: { small: 30, medium: 45, large: 60 } } }];
  let aggregate = setupMatchToSeekReady(contentPack, 'large');
  const cardInstanceId = moveCardToTeamHand(aggregate, lemon.cardDefinitionId, 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 71), contentPack).aggregate;
  assert.equal(aggregate.lemonPhylacteryChallenge?.hiderBonusMinutes, 60);
  aggregate.teams['team-seeker']!.memberPlayerIds.push('seeker-2');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'begin_question_prompt', payload: {} }, 72), contentPack).aggregate;
  const ask = () => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'ask_question', payload: { questionInstanceId: 'question:lemon', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider' } }, 73), contentPack);
  assert.throws(ask, /each seeker must attach a lemon/i);

  const setContact = (playerId: string, touching: boolean, at: number) => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: playerId, playerId, role: 'seeker' }, { type: 'set_lemon_phylactery_contact', payload: { sourceCardInstanceId: cardInstanceId, touching } }, at), contentPack);
  aggregate = setContact('seeker-1', true, 74).aggregate;
  assert.throws(ask, /each seeker must attach a lemon/i);
  aggregate = setContact('seeker-2', true, 75).aggregate;
  assert.equal(ask().aggregate.seekPhaseSubstate, 'awaiting_question_answer');
  aggregate = setContact('seeker-1', false, 76).aggregate;
  assert.equal(aggregate.awardedCurseBonusMinutes, 60);
  assert.throws(ask, /each seeker must attach a lemon/i);
  aggregate = setContact('seeker-1', true, 77).aggregate;
  assert.equal(ask().aggregate.seekPhaseSubstate, 'awaiting_question_answer');
});

test('Egg Partner gates questions until the egg is acquired and awards its scale bonus once when a team member is lost', () => {
  const contentPack = loadEngineTestContentPack();
  const eggPartner = contentPack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-the-egg-partner');
  assert.ok(eggPartner);
  eggPartner.castingCost = [];
  eggPartner.effects = [{ ...eggPartner.effects[0]!, effectType: 'egg_partner_challenge', automationLevel: 'assisted', payload: { minutesByScale: { small: 30, medium: 45, large: 60 } } } as never];
  let aggregate = setupMatchToSeekReady(contentPack, 'medium');
  const cardInstanceId = moveCardToTeamHand(aggregate, eggPartner.cardDefinitionId, 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'egg_partner_challenge');
  assert.equal(aggregate.activeCardResolution?.timeBonusMinutes, 45);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 71), contentPack).aggregate;
  assert.equal(aggregate.eggPartnerChallenge?.hiderBonusMinutes, 45);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'begin_question_prompt', payload: {} }, 72), contentPack).aggregate;
  const ask = () => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'ask_question', payload: { questionInstanceId: 'question:egg-partner', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider' } }, 73), contentPack);
  assert.throws(ask, /acquire a real egg/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'report_egg_partner_member_lost', payload: { sourceCardInstanceId: cardInstanceId, memberId: 'egg-partner:egg', lossKind: 'cracked' } } as never, 73), contentPack), /acquire the egg before reporting/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'confirm_egg_partner_acquired', payload: { sourceCardInstanceId: cardInstanceId } } as never, 74), contentPack).aggregate;
  assert.equal(ask().aggregate.seekPhaseSubstate, 'awaiting_question_answer');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'report_egg_partner_member_lost', payload: { sourceCardInstanceId: cardInstanceId, memberId: 'egg-partner:egg', lossKind: 'cracked' } } as never, 75), contentPack).aggregate;
  assert.equal(aggregate.awardedCurseBonusMinutes, 45);
  assert.equal(aggregate.eggPartnerChallenge?.statusByMemberId['egg-partner:egg']?.lossKind, 'cracked');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'report_egg_partner_member_lost', payload: { sourceCardInstanceId: cardInstanceId, memberId: 'egg-partner:egg', lossKind: 'abandoned' } } as never, 76), contentPack), /already reported lost/i);
  assert.equal(aggregate.awardedCurseBonusMinutes, 45);
});

test('Egg Partner cannot be played during endgame', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.cardDefinitionId === 'curse-curse-of-the-egg-partner');
  assert.ok(card);
  card.effects = [{ ...card.effects[0]!, effectType: 'egg_partner_challenge', automationLevel: 'assisted' } as never];
  const aggregate = setupMatchToSeekReady(contentPack, 'small');
  aggregate.lifecycleState = 'endgame';
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack), /cannot be played during the endgame/i);
});

test('Jammed Door enforces the scale timer, visible doorway rolls, and shared retry cooldowns', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.cardDefinitionId === 'curse-curse-of-the-jammed-door');
  assert.ok(card);
  card.castingCost = [];
  card.effects = [{ ...card.effects[0]!, effectType: 'jammed_door_challenge', automationLevel: 'assisted', payload: {
    minutesByScale: { small: 30, medium: 60, large: 180 },
    retryCooldownMinutesByScale: { small: 5, medium: 10, large: 15 },
    minimumTotal: 7
  } } as never];
  const plan = buildCardResolutionPlan(card, 'medium');
  assert.equal(plan.kind, 'jammed_door_challenge');
  assert.equal(plan.activeDurationMinutes, 60);
  assert.equal(plan.doorwayRetryCooldownMinutes, 10);

  let aggregate = setupMatchToSeekReady(contentPack, 'medium');
  aggregate.teams['team-seeker']!.memberPlayerIds.push('seeker-2');
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 71), contentPack).aggregate;
  assert.equal(aggregate.jammedDoorChallenge?.expiresAt, '2026-01-01T01:01:11.000Z');

  const attempt = (playerId: string, doorwayId: string, dieOne: number, dieTwo: number, at: number, visible = true) => executeCommand(
    aggregate,
    makeEnvelope(aggregate.matchId, { actorId: playerId, playerId, role: 'seeker' }, { type: 'report_jammed_door_roll', payload: { sourceCardInstanceId: cardInstanceId, doorwayId, doorwayLabel: doorwayId, dieOne, dieTwo, doorwayVisible: visible } } as never, at),
    contentPack
  );
  assert.throws(() => attempt('seeker-1', 'east-station-door', 3, 4, 72, false), /doorway is visible/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'report_jammed_door_roll', payload: { sourceCardInstanceId: cardInstanceId, doorwayId: 'east-station-door', doorwayLabel: 'East station door', dieOne: 0, dieTwo: 4, doorwayVisible: true } } as never, 72), contentPack), /dice must show a whole number/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'report_jammed_door_roll', payload: { sourceCardInstanceId: cardInstanceId, doorwayId: 'east-station-door', doorwayLabel: 'East station door', dieOne: 4, dieTwo: 4, doorwayVisible: true, targetPlayerId: 'seeker-2' } } as never, 72), contentPack), /reports their own doorway roll/i);
  aggregate = attempt('seeker-1', 'east-station-door', 2, 2, 72).aggregate;
  assert.equal(aggregate.jammedDoorChallenge?.statusByDoorwayId['east-station-door']?.retryAt, '2026-01-01T00:11:12.000Z');
  assert.throws(() => attempt('seeker-2', 'east-station-door', 4, 3, 73), /doorway cannot be retried yet/i);
  aggregate = attempt('seeker-2', 'west-station-door', 3, 4, 74).aggregate;
  assert.equal(aggregate.jammedDoorChallenge?.statusByDoorwayId['west-station-door']?.passedAt, '2026-01-01T00:01:14.000Z');
  assert.equal(aggregate.jammedDoorChallenge?.statusByDoorwayId['west-station-door']?.retryAt, undefined);
  assert.throws(() => attempt('seeker-1', 'east-station-door', 1, 5, 3671), /curse timer has expired/i);
});

test('Gambler’s Feet creates a timed, typed step-challenge plan from its selected scale', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.cardDefinitionId === 'curse-curse-of-the-gamblers-feet');
  assert.ok(card);
  card.effects = [{ ...card.effects[0]!, effectType: 'gamblers_feet_challenge', automationLevel: 'assisted', payload: { minutesByScale: { small: 20, medium: 40, large: 60 } } } as never];
  const plan = buildCardResolutionPlan(card, 'medium');
  assert.equal(plan.kind, 'gamblers_feet_challenge');
  assert.equal(plan.activeDurationMinutes, 40);
});

test('Gambler’s Feet activates on an odd cast and tracks each seeker’s step allowance and accidental-step debt', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.cardDefinitionId === 'curse-curse-of-the-gamblers-feet');
  assert.ok(card);
  card.castingCost = [];
  card.effects = [{ ...card.effects[0]!, effectType: 'gamblers_feet_challenge', automationLevel: 'assisted', payload: { minutesByScale: { small: 20, medium: 40, large: 60 } } } as never];
  let aggregate = setupMatchToSeekReady(contentPack, 'medium');
  aggregate.teams['team-seeker']!.memberPlayerIds.push('seeker-2');
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'resolve_gamblers_feet_cast', payload: { sourceCardInstanceId: cardInstanceId, dieRoll: 3 } }, 71), contentPack).aggregate;
  assert.equal(aggregate.gamblersFeetChallenge?.durationMinutes, 40);
  assert.equal(aggregate.gamblersFeetChallenge?.expiresAt, '2026-01-01T00:41:11.000Z');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'roll_gamblers_feet_die', payload: { sourceCardInstanceId: cardInstanceId, dieRoll: 3 } }, 72), contentPack).aggregate;
  assert.equal(aggregate.gamblersFeetChallenge?.statusByPlayerId['seeker-2'], undefined);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'roll_gamblers_feet_die', payload: { sourceCardInstanceId: cardInstanceId, dieRoll: 3, targetPlayerId: 'seeker-2' } }, 72), contentPack), /each seeker reports their own die rolls/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'report_gamblers_feet_steps', payload: { sourceCardInstanceId: cardInstanceId, stepsTaken: 2 } }, 73), contentPack).aggregate;
  assert.equal(aggregate.gamblersFeetChallenge?.statusByPlayerId['seeker-1']?.stepsRemaining, 1);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'report_gamblers_feet_steps', payload: { sourceCardInstanceId: cardInstanceId, stepsTaken: 3 } }, 74), contentPack), /mark an accidental overstep or safety exception/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'report_gamblers_feet_steps', payload: { sourceCardInstanceId: cardInstanceId, stepsTaken: 3, overstep: 'accidental' } }, 74), contentPack).aggregate;
  assert.equal(aggregate.gamblersFeetChallenge?.statusByPlayerId['seeker-1']?.unaccountedSteps, 2);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'report_gamblers_feet_steps', payload: { sourceCardInstanceId: cardInstanceId, stepsTaken: 1 } }, 75), contentPack), /roll again to account for the 2 unaccounted steps/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'roll_gamblers_feet_die', payload: { sourceCardInstanceId: cardInstanceId, dieRoll: 1 } }, 76), contentPack).aggregate;
  assert.equal(aggregate.gamblersFeetChallenge?.statusByPlayerId['seeker-1']?.unaccountedSteps, 1);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'roll_gamblers_feet_die', payload: { sourceCardInstanceId: cardInstanceId, dieRoll: 2 } }, 77), contentPack).aggregate;
  assert.equal(aggregate.gamblersFeetChallenge?.statusByPlayerId['seeker-1']?.stepsRemaining, 1);
  assert.equal(aggregate.gamblersFeetChallenge?.statusByPlayerId['seeker-1']?.unaccountedSteps, 0);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, { type: 'roll_gamblers_feet_die', payload: { sourceCardInstanceId: cardInstanceId, dieRoll: 1 } }, 2471), contentPack), /timer has expired/i);
});

test('Gambler’s Feet has no effect when its casting die is even', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.cardDefinitionId === 'curse-curse-of-the-gamblers-feet');
  assert.ok(card);
  card.effects = [{ ...card.effects[0]!, effectType: 'gamblers_feet_challenge', automationLevel: 'assisted', payload: { minutesByScale: { small: 20, medium: 40, large: 60 } } } as never];
  const aggregate = setupMatchToSeekReady(contentPack, 'medium');
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  const opened = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'play_card', payload: { cardInstanceId } }, 80), contentPack).aggregate;
  const resolved = executeCommand(opened, makeEnvelope(opened.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'resolve_gamblers_feet_cast', payload: { sourceCardInstanceId: cardInstanceId, dieRoll: 4 } }, 81), contentPack);
  assert.equal(resolved.aggregate.gamblersFeetChallenge, undefined);
  assert.equal(resolved.aggregate.activeCardResolution, undefined);
  assert.equal(resolved.events[0]?.event.type, 'gamblers_feet_cast_resolved');
  assert.equal(resolved.events[0]?.event.payload.effectActivated, false);
});

test('Gambler’s Feet can be cast and resolved during endgame', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.cardDefinitionId === 'curse-curse-of-the-gamblers-feet');
  assert.ok(card);
  card.castingCost = [];
  card.effects = [{ ...card.effects[0]!, effectType: 'gamblers_feet_challenge', automationLevel: 'assisted', payload: { minutesByScale: { small: 20, medium: 40, large: 60 } } } as never];
  const aggregate = setupMatchToSeekReady(contentPack, 'medium');
  aggregate.lifecycleState = 'endgame';
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  const opened = executeCommand(aggregate, makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'play_card', payload: { cardInstanceId } }, 90), contentPack).aggregate;
  assert.equal(opened.activeCardResolution?.resolutionKind, 'gamblers_feet_challenge');
  const resolved = executeCommand(opened, makeEnvelope(opened.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, { type: 'resolve_gamblers_feet_cast', payload: { sourceCardInstanceId: cardInstanceId, dieRoll: 3 } }, 91), contentPack).aggregate;
  assert.ok(resolved.gamblersFeetChallenge);
  assert.equal(resolved.lifecycleState, 'endgame');
});

test('Water Weight blocks questions until acquisition and awards its scale bonus on the first loss report', () => {
  const contentPack = loadEngineTestContentPack();
  const waterWeight = contentPack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-water-weight');
  assert.ok(waterWeight);
  waterWeight.castingCost = [];
  waterWeight.effects = waterWeight.effects.map((effect) => ({
    ...effect,
    effectType: 'water_weight_challenge',
    automationLevel: 'assisted',
    payload: { requiredLitersPerSeeker: 2, abandonRadiusMeters: 3, minutesByScale: { small: 30, medium: 30, large: 60 } }
  }));
  let aggregate = setupMatchToSeekReady(contentPack, 'large');
  const cardInstanceId = moveCardToTeamHand(aggregate, waterWeight.cardDefinitionId, 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 71), contentPack).aggregate;

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 72), contentPack).aggregate;
  const ask = () => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:water-weight',
      templateId: 'matching-commercial-airport',
      targetTeamId: 'team-hider'
    } }, 73), contentPack);
  assert.throws(ask, /acquired the required new liquid/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'confirm_water_weight_liquid_acquired', payload: { sourceCardInstanceId: cardInstanceId } } as never, 73), contentPack), /does not have permission/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'confirm_water_weight_liquid_acquired', payload: { sourceCardInstanceId: cardInstanceId } } as never, 74), contentPack).aggregate;
  assert.equal(aggregate.waterWeightChallenge?.liquidAcquiredAt, '2026-01-01T00:01:14.000Z');
  assert.equal(ask().aggregate.seekPhaseSubstate, 'awaiting_question_answer');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_water_weight_liquid_lost', payload: { sourceCardInstanceId: cardInstanceId } } as never, 75), contentPack).aggregate;
  assert.equal(aggregate.waterWeightChallenge?.liquidAcquiredAt, undefined);
  assert.equal(aggregate.waterWeightChallenge?.bonusAwardedAt, '2026-01-01T00:01:15.000Z');
  assert.equal(aggregate.waterWeightChallenge?.hiderBonusMinutes, 60);
  assert.equal(aggregate.awardedCurseBonusMinutes, 60);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'confirm_water_weight_liquid_acquired', payload: { sourceCardInstanceId: cardInstanceId } } as never, 76), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_water_weight_liquid_lost', payload: { sourceCardInstanceId: cardInstanceId } } as never, 77), contentPack).aggregate;
  assert.equal(aggregate.awardedCurseBonusMinutes, 60);
  assert.throws(() => executeCommand({
    ...aggregate,
    seekPhaseSubstate: 'awaiting_question_selection',
    activeQuestionInstanceId: undefined
  }, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:water-weight-after-loss',
      templateId: 'matching-commercial-airport',
      targetTeamId: 'team-hider'
    } }, 78), contentPack), /acquired the required new liquid/i);
  const hiderView = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider'
  });
  assert.equal(hiderView.waterWeightChallenge?.bonusAwardedAt, '2026-01-01T00:01:15.000Z');
});

test('Hidden Hangman tracks a private five-letter word and public seeker guesses until solved', () => {
  const contentPack = loadEngineTestContentPack();
  const hangmanDefinition = contentPack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-the-hidden-hangman');
  assert.ok(hangmanDefinition);
  hangmanDefinition.castingCost = [];
  let aggregate = setupMatchToSeekReady(contentPack);
  const cardId = moveCardToTeamHand(aggregate, 'curse-curse-of-the-hidden-hangman', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: cardId } }, 70), contentPack).aggregate;

  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'hangman_challenge');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardId } }, 71), contentPack), /set the five-letter word/i);

  const setWord = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_hangman_word', payload: { sourceCardInstanceId: cardId, word: 'train' } } as never, 72), contentPack);
  assert.equal(setWord.events[0]?.visibilityScope, 'player_private');
  aggregate = setWord.aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardId } }, 73), contentPack), /finish the Hangman challenge/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'update_location', payload: { latitude: 50.1, longitude: 14.1, source: 'manual' } }, 74), contentPack), /location updates are only allowed in active movement states/i);
  const hiderView = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider'
  });
  const seekerView = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });
  assert.equal(hiderView.activeCardResolution?.hangman?.secretWord, 'TRAIN');
  assert.equal(seekerView.activeCardResolution?.hangman?.secretWord, undefined);
  assert.equal(seekerView.activeCardResolution?.hangman?.maskedWord, '_____');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'guess_hangman_letter', payload: { sourceCardInstanceId: cardId, letter: 'z' } } as never, 73), contentPack).aggregate;
  const seekerAfterMiss = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });
  assert.deepEqual(seekerAfterMiss.activeCardResolution?.hangman?.incorrectLetters, ['Z']);
  assert.equal(seekerAfterMiss.activeCardResolution?.hangman?.maskedWord, '_____');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'guess_hangman_letter', payload: { sourceCardInstanceId: cardId, letter: 'r' } } as never, 74), contentPack).aggregate;
  assert.deepEqual(aggregate.activeCardResolution?.hangman?.guessedLetters, ['Z', 'R']);
  assert.equal(buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  }).activeCardResolution?.hangman?.maskedWord, '_R___');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'guess_hangman_letter', payload: { sourceCardInstanceId: cardId, letter: 'R' } } as never, 75), contentPack), /already been guessed/i);

  for (const [step, letter] of ['t', 'a', 'i', 'n'].entries()) {
    aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'guess_hangman_letter', payload: { sourceCardInstanceId: cardId, letter } } as never, 76 + step), contentPack).aggregate;
  }
  assert.equal(aggregate.activeCardResolution?.hangman?.status, 'solved');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardId } }, 80), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution, undefined);
});

test('Hidden Hangman hider ends the group-played challenge and reveals its word to seekers', () => {
  const contentPack = loadEngineTestContentPack();
  const hangmanDefinition = contentPack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-the-hidden-hangman');
  assert.ok(hangmanDefinition);
  hangmanDefinition.castingCost = [];
  let aggregate = setupMatchToSeekReady(contentPack);
  const cardId = moveCardToTeamHand(aggregate, 'curse-curse-of-the-hidden-hangman', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: cardId } }, 90), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_hangman_word', payload: { sourceCardInstanceId: cardId, word: 'train' } } as never, 91), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'end_hangman_challenge', payload: { sourceCardInstanceId: cardId } } as never, 92), contentPack), /does not have permission/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'end_hangman_challenge', payload: { sourceCardInstanceId: cardId } } as never, 93), contentPack).aggregate;

  const seekerView = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });
  assert.equal(seekerView.activeCardResolution?.hangman?.status, 'ended');
  assert.equal(seekerView.activeCardResolution?.hangman?.revealedWord, 'TRAIN');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardId } }, 94), contentPack), /does not have permission/i);
});

test('Move pauses and resumes the hide-phase timer without consuming its remaining time', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToHidePhase(contentPack);
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  const oldStation = { latitude: point![1], longitude: point![0] };
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_hiding_zone', payload: { stationId: 'node/old', stationName: 'Old Station', ...oldStation } } as never,
    20), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'lock_hider_location', payload: oldStation },
    21), contentPack).aggregate;
  const moveCardId = moveCardToTeamHand(aggregate, 'power-up-move', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: moveCardId } },
    30), contentPack).aggregate;
  const pausedTimer = Object.values(aggregate.timers).find((timer) => timer.kind === 'hide');
  assert.equal(pausedTimer?.status, 'paused');
  assert.equal(pausedTimer?.remainingSeconds, 100);

  const newStation = { latitude: 50.2, longitude: 14.25 };
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'update_location', payload: { ...newStation, source: 'manual' } },
    50), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_hiding_zone', payload: { stationId: 'node/new', stationName: 'New Station', ...newStation } } as never,
    51), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'lock_hider_location', payload: newStation },
    52), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'end_hide_phase', payload: {} },
    55), contentPack), /Move card must finish/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: moveCardId } },
    630), contentPack).aggregate;

  const resumedTimer = Object.values(aggregate.timers).find((timer) => timer.kind === 'hide');
  assert.equal(resumedTimer?.status, 'running');
  assert.equal(resumedTimer?.remainingSeconds, 100);
  assert.equal(resumedTimer?.startedAt, new Date(Date.UTC(2026, 0, 1, 0, 10, 10)).toISOString());
});

test('discard_card moves an accessible hand card into the discard pile', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const cardInstanceId = moveCardToTeamHand(aggregate, 'curse-curse-of-the-zoologist', 'team-hider');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'discard_card',
        payload: {
          cardInstanceId
        }
      },
      40
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.cardInstances[cardInstanceId]?.zone, 'discard_pile');
  assert.equal(aggregate.cardInstances[cardInstanceId]?.holderType, 'team');
  assert.equal(aggregate.cardInstances[cardInstanceId]?.holderId, 'team-hider');
});

test('Move cannot be played after the endgame has started', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToSeekReady(contentPack);
  const moveCardInstanceId = moveCardToTeamHand(aggregate, 'power-up-move', 'team-hider');
  aggregate.lifecycleState = 'endgame';
  aggregate.seekPhaseSubstate = 'ready';

  assert.throws(() => executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      { type: 'play_card', payload: { cardInstanceId: moveCardInstanceId } },
      39
    ),
    contentPack
  ), /cannot be played during the endgame/i);
});

test('Move requires an original station to reveal before it starts', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToSeekReady(contentPack);
  const moveCardInstanceId = moveCardToTeamHand(aggregate, 'power-up-move', 'team-hider');

  assert.throws(() => executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: moveCardInstanceId } },
    39
  ), contentPack), /original hiding station/i);
});

test('player_private projections can still see the viewer team shared hand without leaking other teams', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToSeekReady(contentPack);
  const hiderCardInstanceId = moveCardToTeamHand(aggregate, 'power-up-veto', 'team-hider');
  const seekerCardInstanceId = moveCardToTeamHand(aggregate, 'power-up-move', 'team-seeker');

  const hiderProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private',
    viewerPlayerId: 'hider-1',
    viewerTeamId: 'team-hider',
    viewerRole: 'hider'
  });
  const seekerProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private',
    viewerPlayerId: 'seeker-1',
    viewerTeamId: 'team-seeker',
    viewerRole: 'seeker'
  });

  assert.equal(
    hiderProjection.visibleCards.some((card) => card.cardInstanceId === hiderCardInstanceId),
    true
  );
  assert.equal(
    hiderProjection.visibleCards.some((card) => card.cardInstanceId === seekerCardInstanceId),
    false
  );
  assert.equal(
    seekerProjection.visibleCards.some((card) => card.cardInstanceId === seekerCardInstanceId),
    true
  );
  assert.equal(
    seekerProjection.visibleCards.some((card) => card.cardInstanceId === hiderCardInstanceId),
    false
  );
});

test('resolved manual cards stay visible in the discard pile for the owning team after the card window closes', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const cardInstanceId = moveCardToTeamHand(aggregate, 'curse-curse-of-the-cairn', 'team-hider');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'play_card',
        payload: {
          cardInstanceId
        }
      },
      50
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_card_resolution');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'resolve_card_window',
        payload: {
          sourceCardInstanceId: cardInstanceId,
          cairnTargetHeight: 1,
          cairnTargetConfirmed: true
        }
      },
      51
    ),
    contentPack
  ).aggregate;

  const hiderProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private',
    viewerPlayerId: 'hider-1',
    viewerTeamId: 'team-hider',
    viewerRole: 'hider'
  });

  assert.equal(aggregate.cardInstances[cardInstanceId]?.zone, 'discard_pile');
  assert.equal(
    hiderProjection.visibleCards.some(
      (card) => card.cardInstanceId === cardInstanceId && card.zone === 'discard_pile'
    ),
    true
  );
});

test('Draw 1 Expand 1 draws a card and permanently raises the hider hand limit for this round', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const sourceCardInstanceId = moveCardToTeamHand(aggregate, 'power-up-draw-1-expand-1', 'team-hider');
  const drawPileBefore = Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'deck' && card.holderId === 'hider-main' && card.zone === 'draw_pile'
  ).length;
  aggregate = executeCommand(
    aggregate,
    makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, {
      type: 'play_card', payload: { cardInstanceId: sourceCardInstanceId }
    }, 80),
    contentPack
  ).aggregate;

  assert.equal(aggregate.activeCardResolution, undefined);

  const hiderHand = Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'team' && card.holderId === 'team-hider' && card.zone === 'hand'
  );
  const hiderProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider'
  });
  const seekerProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });

  assert.equal(aggregate.hiderHandLimitBonus, 1);
  assert.equal(hiderProjection.hiderHandLimit, 7);
  assert.equal(seekerProjection.hiderHandLimit, undefined);
  assert.equal(hiderHand.length, 1);
  assert.equal(Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'deck' && card.holderId === 'hider-main' && card.zone === 'draw_pile'
  ).length, drawPileBefore - 1);
  assert.equal(aggregate.cardInstances[sourceCardInstanceId]?.zone, 'discard_pile');

  for (let index = 0; index < 6; index += 1) {
    aggregate = executeCommand(
      aggregate,
      makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, {
        type: 'draw_card', payload: { deckId: 'hider-main' }
      }, 81 + index),
      contentPack
    ).aggregate;
  }
  assert.equal(Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'team' && card.holderId === 'team-hider' && card.zone === 'hand'
  ).length, 7);
  assert.throws(() => executeCommand(
    aggregate,
    makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, {
      type: 'draw_card', payload: { deckId: 'hider-main' }
    }, 89),
    contentPack
  ), /target size of 7/);
});

test('Draw 1 Expand 1 can be played during a live answer window without interrupting it', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const sourceCardInstanceId = moveCardToTeamHand(aggregate, 'power-up-draw-1-expand-1', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 91), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:live-for-card', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider'
    } }, 92), contentPack).aggregate;

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: sourceCardInstanceId } }, 93), contentPack).aggregate;

  assert.equal(aggregate.activeQuestionInstanceId, 'question:live-for-card');
  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_question_answer');
  assert.equal(aggregate.hiderHandLimitBonus, 1);
  assert.equal(aggregate.cardInstances[sourceCardInstanceId]?.zone, 'discard_pile');
});

test('Duplicate copies a held power-up effect and leaves the original card in hand', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const duplicateCardId = moveCardToTeamHand(aggregate, 'power-up-duplicate', 'team-hider');
  const originalCardId = moveCardToTeamHand(aggregate, 'power-up-draw-1-expand-1', 'team-hider');
  const drawPileBefore = Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'deck' && card.holderId === 'hider-main' && card.zone === 'draw_pile'
  ).length;

  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: duplicateCardId } }, 79), contentPack), /choose a card in your hand to copy/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    {
      type: 'play_card',
      payload: { cardInstanceId: duplicateCardId, duplicateTargetCardInstanceId: originalCardId }
    }, 80), contentPack).aggregate;

  const hiderHand = Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'team' && card.holderId === 'team-hider' && card.zone === 'hand'
  );
  assert.equal(aggregate.cardInstances[duplicateCardId]?.zone, 'discard_pile');
  assert.equal(aggregate.cardInstances[originalCardId]?.zone, 'hand');
  assert.equal(hiderHand.length, 2);
  assert.equal(aggregate.hiderHandLimitBonus, 1);
  assert.equal(Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'deck' && card.holderId === 'hider-main' && card.zone === 'draw_pile'
  ).length, drawPileBefore - 1);
});

test('Duplicate identifies a copied manual effect in its private resolution window', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const duplicateCardId = moveCardToTeamHand(aggregate, 'power-up-duplicate', 'team-hider');
  const originalCardId = moveCardToTeamHand(aggregate, 'curse-curse-of-the-cairn', 'team-hider');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    {
      type: 'play_card',
      payload: { cardInstanceId: duplicateCardId, duplicateTargetCardInstanceId: originalCardId }
    }, 81), contentPack).aggregate;

  assert.equal(aggregate.cardInstances[duplicateCardId]?.zone, 'pending_resolution');
  assert.equal(aggregate.cardInstances[originalCardId]?.zone, 'hand');
  assert.equal(aggregate.activeCardResolution?.copiedCardInstanceId, originalCardId);
  const hiderProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider'
  });
  const seekerProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });
  assert.equal(hiderProjection.activeCardResolution?.copiedCardInstanceId, originalCardId);
  assert.equal(seekerProjection.activeCardResolution?.copiedCardInstanceId, undefined);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: duplicateCardId, cairnTargetHeight: 1, cairnTargetConfirmed: true } }, 82), contentPack).aggregate;
  assert.equal(aggregate.cardInstances[duplicateCardId]?.zone, 'discard_pile');
  assert.equal(aggregate.cardInstances[originalCardId]?.zone, 'hand');
});

test('Veto ends the active question without an answer or card reward and counts as asked', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const vetoCardId = moveCardToTeamHand(aggregate, 'power-up-veto', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 101), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:vetoed', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider'
    } }, 102), contentPack).aggregate;

  const result = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: vetoCardId } }, 103), contentPack);
  aggregate = result.aggregate;

  assert.equal(aggregate.questionInstances['question:vetoed']?.status, 'vetoed');
  assert.equal(aggregate.questionInstances['question:vetoed']?.answer, undefined);
  assert.equal(aggregate.activeQuestionInstanceId, undefined);
  assert.equal(aggregate.seekPhaseSubstate, 'ready');
  assert.equal(aggregate.cardInstances[vetoCardId]?.zone, 'discard_pile');
  assert.equal(aggregate.pendingQuestionReward, undefined);
  assert.equal(result.events.some((event) => event.event.type === 'question_vetoed'), true);
});

test('Randomize cancels the active question and asks a different available question from the same category', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const randomizeCardId = moveCardToTeamHand(aggregate, 'power-up-randomize', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 111), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:rerolled', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider'
    } }, 112), contentPack).aggregate;

  const originalRandom = Math.random;
  Math.random = () => 0;
  let result;
  try {
    result = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      { type: 'play_card', payload: { cardInstanceId: randomizeCardId } }, 113), contentPack);
  } finally {
    Math.random = originalRandom;
  }
  aggregate = result!.aggregate;

  const replacement = aggregate.activeQuestionInstanceId
    ? aggregate.questionInstances[aggregate.activeQuestionInstanceId]
    : undefined;
  assert.equal(aggregate.questionInstances['question:rerolled']?.status, 'canceled');
  assert.ok(replacement);
  assert.equal(replacement.categoryId, 'matching');
  assert.notEqual(replacement.templateId, 'matching-commercial-airport');
  assert.equal(replacement.status, 'awaiting_answer');
  assert.equal(aggregate.cardInstances[randomizeCardId]?.zone, 'discard_pile');
  assert.equal(result!.events.some((event) => event.event.type === 'question_randomized'), true);

  const nullAnswer = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'answer_question', payload: {
      questionInstanceId: replacement.questionInstanceId,
      answer: { value: null }
    } }, 114), contentPack);
  aggregate = nullAnswer.aggregate;
  assert.equal(aggregate.questionInstances[replacement.questionInstanceId]?.status, 'resolved');
  assert.equal(aggregate.activeQuestionInstanceId, undefined);
  assert.equal(aggregate.constraints[`${replacement.questionInstanceId}:null-answer`], undefined);
});

test('Curse of the Zoologist opens a typed evidence challenge plan', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('zoologist'));
  assert.ok(card);
  card.effects = [{
    effectType: 'zoologist_challenge',
    description: card.description,
    automationLevel: 'assisted'
  } as never];

  assert.equal(buildCardResolutionPlan(card, 'medium').kind, 'zoologist_challenge');
});

test('Zoologist blocks questions until every seeker links their own public photo', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('zoologist'));
  assert.ok(card);
  card.effects = [{ effectType: 'zoologist_challenge', description: card.description, automationLevel: 'assisted' } as never];
  const aggregate = setupMatchToSeekReady(contentPack);
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');
  let state = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;

  const upload = (playerId: string, role: 'hider' | 'seeker', attachmentId: string, at: number) => executeCommand(state, makeEnvelope(state.matchId,
    { actorId: playerId, playerId, role },
    { type: 'upload_attachment', payload: {
      attachmentId,
      kind: 'photo_evidence',
      label: 'Wild animal photo',
      visibilityScope: 'public_match',
      cardInstanceId,
      captureMetadata: { pickerSource: 'camera' }
    } }, at), contentPack).aggregate;

  state = upload('hider-1', 'hider', 'zoo:hider-photo', 71);
  state = upload('seeker-1', 'seeker', 'zoo:old-seeker-photo', 72);
  assert.throws(() => executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 72), contentPack), /take a new photo with the camera/i);
  state = executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: {
      sourceCardInstanceId: cardInstanceId,
      zoologistCategory: 'bird',
      zoologistHiderAttachmentId: 'zoo:hider-photo'
    } }, 73), contentPack).aggregate;
  assert.equal(state.zoologistChallenge?.category, 'bird');
  assert.throws(() => executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_zoologist_evidence', payload: { sourceCardInstanceId: cardInstanceId, attachmentId: 'zoo:old-seeker-photo' } }, 73.5), contentPack), /take a new photo after the challenge starts/i);

  state = executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 74), contentPack).aggregate;
  assert.throws(() => executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:zoologist-blocked', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider'
    } }, 75), contentPack), /every seeker must submit a photo/i);

  const seekerIds = state.zoologistChallenge!.requiredSeekerPlayerIds;
  for (const [index, playerId] of seekerIds.entries()) {
    state = upload(playerId, 'seeker', `zoo:seeker-photo-${index}`, 76 + index * 2);
    state = executeCommand(state, makeEnvelope(state.matchId,
      { actorId: playerId, playerId, role: 'seeker' },
      { type: 'report_zoologist_evidence', payload: { sourceCardInstanceId: cardInstanceId, attachmentId: `zoo:seeker-photo-${index}` } }, 77 + index * 2), contentPack).aggregate;
  }
  assert.equal(state.zoologistChallenge, undefined);
});

test('Curse of the Luxury Car opens a typed MSRP photo-comparison plan', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('luxury car'));
  assert.ok(card);
  card.effects = [{ effectType: 'luxury_car_challenge', description: card.description, automationLevel: 'assisted' } as never];

  assert.equal(buildCardResolutionPlan(card, 'medium').kind, 'luxury_car_challenge');
});

test('Luxury Car requires a fresh higher-MSRP seeker photo and hider approval before questions resume', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((candidate) => candidate.name.toLowerCase().includes('luxury car'));
  assert.ok(card);
  card.effects = [{ effectType: 'luxury_car_challenge', description: card.description, automationLevel: 'assisted' } as never];
  let state = setupMatchToSeekReady(contentPack);
  const cardInstanceId = moveCardToTeamHand(state, card.cardDefinitionId, 'team-hider');
  state = executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;

  const upload = (playerId: string, role: 'hider' | 'seeker', attachmentId: string, at: number) => executeCommand(state, makeEnvelope(state.matchId,
    { actorId: playerId, playerId, role },
    { type: 'upload_attachment', payload: {
      attachmentId,
      kind: 'photo_evidence',
      label: 'Car photo',
      visibilityScope: 'public_match',
      cardInstanceId,
      captureMetadata: { pickerSource: 'camera' }
    } }, at), contentPack).aggregate;

  state = upload('hider-1', 'hider', 'luxury:hider-car', 71);
  state = upload('seeker-1', 'seeker', 'luxury:stale-seeker-car', 71.5);
  state = executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: {
      sourceCardInstanceId: cardInstanceId,
      luxuryCarHiderAttachmentId: 'luxury:hider-car',
      luxuryCarDescription: '2020 Model X',
      luxuryCarProductionYear: 2020,
      luxuryCarMsrpCents: 8000000,
      luxuryCarCurrencyCode: 'USD'
    } }, 72), contentPack).aggregate;
  assert.equal(state.luxuryCarChallenge?.hiderMsrpCents, 8000000);
  assert.throws(() => executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_luxury_car_candidate', payload: {
      sourceCardInstanceId: cardInstanceId,
      attachmentId: 'luxury:stale-seeker-car',
      carDescription: '2022 Sedan',
      productionYear: 2022,
      msrpCents: 9000000
    } }, 72.5), contentPack), /take and record a new public camera photo after the challenge starts/i);

  state = executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 73), contentPack).aggregate;
  state = upload('seeker-1', 'seeker', 'luxury:seeker-car', 74);
  assert.throws(() => executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_luxury_car_candidate', payload: {
      sourceCardInstanceId: cardInstanceId,
      attachmentId: 'luxury:seeker-car',
      carDescription: '2022 Sedan',
      productionYear: 2022,
      msrpCents: 7999999
    } }, 75), contentPack), /production-year MSRP higher than USD 80000.00/i);
  state = executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_luxury_car_candidate', payload: {
      sourceCardInstanceId: cardInstanceId,
      attachmentId: 'luxury:seeker-car',
      carDescription: '2022 Sedan',
      productionYear: 2022,
      msrpCents: 9000000
    } }, 76), contentPack).aggregate;
  assert.throws(() => executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:luxury-blocked', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider'
    } }, 77), contentPack), /hider must accept/i);
  state = executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'decide_luxury_car_candidate', payload: { sourceCardInstanceId: cardInstanceId, accepted: false } }, 78), contentPack).aggregate;
  assert.equal(state.luxuryCarChallenge?.candidate, undefined);
  assert.throws(() => executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_luxury_car_candidate', payload: {
      sourceCardInstanceId: cardInstanceId,
      attachmentId: 'luxury:seeker-car',
      carDescription: '2022 Sedan',
      productionYear: 2022,
      msrpCents: 9000000
    } }, 78.5), contentPack), /take a different car photo after the hider rejects an attempt/i);

  state = upload('seeker-1', 'seeker', 'luxury:seeker-car-2', 79);
  state = executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'report_luxury_car_candidate', payload: {
      sourceCardInstanceId: cardInstanceId,
      attachmentId: 'luxury:seeker-car-2',
      carDescription: '2023 Coupe',
      productionYear: 2023,
      msrpCents: 9200000
    } }, 80), contentPack).aggregate;
  state = executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'decide_luxury_car_candidate', payload: { sourceCardInstanceId: cardInstanceId, accepted: true } }, 81), contentPack).aggregate;
  assert.equal(state.luxuryCarChallenge, undefined);
  state = executeCommand(state, makeEnvelope(state.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:luxury-unlocked', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider'
    } }, 82), contentPack).aggregate;
  assert.equal(state.activeQuestionInstanceId, 'question:luxury-unlocked');
});
