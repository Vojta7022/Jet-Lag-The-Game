import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { importContentPack } from '../../packages/content-import/src/importer.ts';
import { getCardDiscardRequirement } from '../../packages/domain/src/index.ts';

const workbookPath = fileURLToPath(new URL('../../Jet Lag The Game - cleaned for import.xlsx', import.meta.url));
const legacyWorkbookPath = fileURLToPath(new URL('../../Jet Lag The Game.xlsx', import.meta.url));

test('the workbook importer creates a normalized draft content pack', () => {
  const result = importContentPack({
    inputPath: workbookPath
  });

  assert.equal(result.pack.packId, 'jet-lag-the-game-seed');
  assert.equal(result.pack.status, 'draft');
  assert.equal(result.pack.rulesets.length, 1);
  assert.equal(result.pack.rulesets[0]?.rulesetId, 'jet-lag-home-game-base');
  assert.deepEqual(result.pack.rulesets[0]?.phasePolicies.hidePhaseDurationSecondsByScale, {
    small: 30 * 60,
    medium: 60 * 60,
    large: 180 * 60
  });
  assert.deepEqual(result.pack.rulesets[0]?.locationPolicies.hidingZoneRadiusMetersByScale, {
    small: 500,
    medium: 500,
    large: 1000
  });
  assert.equal(result.pack.rulesets[0]?.questionPolicies.answerWindowSeconds, 5 * 60);
  assert.equal(result.pack.rulesets[0]?.questionPolicies.photoAnswerWindowSecondsByScale?.large, 20 * 60);
  assert.equal(result.pack.mapPresets.length, 1);
  assert.equal(result.pack.mapPresets[0]?.mapPresetId, 'jet-lag-host-selected-city');
  assert.equal(result.pack.mapPresets[0]?.geometry.kind, 'host_selected_administrative_boundary');
  assert.equal(result.pack.mapPresets[0]?.locationPrecisionPolicy.hiderCoordinatesHiddenFromSeekers, true);
  assert.equal(result.pack.mapPresets[0]?.locationPrecisionPolicy.seekerLocationsSharedWithHiders, true);
  assert.equal(result.pack.cards.length, 37);
  assert.equal(result.pack.questionCategories.length, 6);
  assert.equal(result.pack.questionTemplates.length, 80);
  assert.equal(result.pack.questionTemplates.some((template) => template.templateId === 'measuring-4th-admin-borough'), false);
  assert.equal(result.pack.questionTemplates.some((template) => template.templateId === 'matching-4th-admin-borough'), true);
  const transitLineQuestion = result.pack.questionTemplates.find((template) => template.templateId === 'matching-transit-line');
  assert.ok(transitLineQuestion);
  assert.match(String(transitLineQuestion.parameters?.rulebookGuidanceText), /riding moving transit/i);
  assert.match(String(transitLineQuestion.parameters?.rulebookGuidanceText), /would stop at the hider.?s station/i);
  const firstAdminQuestion = result.pack.questionTemplates.find((template) => template.templateId === 'matching-1st-admin-state');
  assert.match(String(firstAdminQuestion?.parameters?.rulebookGuidanceText), /biggest formal administrative division/i);
  const thirdAdminQuestion = result.pack.questionTemplates.find((template) => template.templateId === 'matching-3rd-admin-municipality-city-town');
  assert.match(String(thirdAdminQuestion?.parameters?.rulebookGuidanceText), /if municipal borders are ambiguous, seekers should clarify/i);
  const highSpeedLineQuestion = result.pack.questionTemplates.find((template) => template.templateId === 'measuring-a-high-speed-train-line');
  assert.match(String(highSpeedLineQuestion?.parameters?.rulebookGuidanceText), /250 km\/h/i);
  const waterQuestion = result.pack.questionTemplates.find((template) => template.templateId === 'measuring-a-body-of-water');
  assert.match(String(waterQuestion?.parameters?.rulebookGuidanceText), /named body of water.*pools do not count/i);
  const coastlineQuestion = result.pack.questionTemplates.find((template) => template.templateId === 'measuring-a-coastline');
  assert.match(String(coastlineQuestion?.parameters?.rulebookGuidanceText), /2 km wide/i);
  const borderQuestion = result.pack.questionTemplates.find((template) => template.templateId === 'measuring-an-international-border');
  assert.match(String(borderQuestion?.parameters?.rulebookGuidanceText), /enclaves count/i);
  const seaLevelQuestion = result.pack.questionTemplates.find((template) => template.templateId === 'measuring-sea-level');
  assert.match(String(seaLevelQuestion?.parameters?.rulebookGuidanceText), /altitude.*phone.*compass/i);
  assert.match(String(waterQuestion?.parameters?.rulebookGuidanceText), /null.*earns the card reward/i);
  const measuringTemplates = result.pack.questionTemplates.filter((template) => template.categoryId === 'measuring');
  assert.deepEqual(result.pack.questionCategories.find((category) => category.categoryId === 'measuring')?.defaultAnswerSchema.allowedValues,
    ['closer', 'further']);
  assert.ok(measuringTemplates.every((template) =>
    JSON.stringify(template.answerSchema.allowedValues) === JSON.stringify(['closer', 'further'])
  ));
  assert.equal(result.report.issues.some((issue) => issue.code === 'QUESTION_NOT_IN_PRINTED_BOOK'), true);
  assert.equal(result.pack.constraints.length, 9);
  assert.equal(result.pack.decks.length, 1);

  const amusementPark = result.pack.questionTemplates.find(
    (template) => template.templateId === 'matching-amusement-park'
  );
  assert.ok(amusementPark);
  assert.equal(amusementPark.sourceProvenance[0]?.rawValue, 'Amusment Park');
  assert.equal(amusementPark.promptOverrides?.promptTemplate, 'Is your nearest _____ the same as my nearest _____?');

  const photosTree = result.pack.questionTemplates.find(
    (template) => template.templateId === 'photos-a-tree'
  );
  assert.ok(photosTree);
  assert.equal(photosTree.parameters?.workbookRequirementsText, 'Must include the entire tree');
  const photoTemplates = result.pack.questionTemplates.filter((template) => template.categoryId === 'photos');
  assert.ok(photoTemplates.length > 0);
  assert.ok(photoTemplates.every((template) => typeof template.parameters?.rulebookGuidanceText === 'string'));
  assert.ok(photoTemplates.every((template) => template.sourceProvenance.some((source) =>
    source.sourceFileName === 'Scanned base rulebook, printed pp. 32–35'
  )));
  assert.match(String(photosTree.parameters?.rulebookGuidanceText), /normal aspect ratio/i);
  assert.match(String(photosTree.parameters?.rulebookGuidanceText), /entire tree/i);
  const traceStreets = result.pack.questionTemplates.find((template) => template.templateId === 'photos-1-2-mile-of-streets-traced');
  assert.match(String(traceStreets?.parameters?.rulebookGuidanceText), /1 km/i);
  assert.match(String(traceStreets?.parameters?.rulebookGuidanceText), /five turns/i);
  assert.match(String(traceStreets?.parameters?.rulebookGuidanceText), /doubling back/i);
  const parkPhoto = result.pack.questionTemplates.find((template) => template.templateId === 'photos-park');
  assert.match(String(parkPhoto?.parameters?.rulebookGuidanceText), /2 m from any obstruction/i);
  assert.match(String(parkPhoto?.requirements?.find((requirement) => requirement.requirementType === 'manual_approval')?.description), /scanned photo specification/i);
  const mountainPhoto = result.pack.questionTemplates.find((template) => template.templateId === 'photos-tallest-mountain-visible-from-station');
  assert.match(String(mountainPhoto?.parameters?.rulebookGuidanceText), /at most 3× zoom/i);

  const randomize = result.pack.cards.find((card) => card.cardDefinitionId === 'power-up-randomize');
  assert.ok(randomize);
  assert.equal(randomize.name, 'Randomize');
  assert.equal(randomize.automationLevel, 'authoritative');
  assert.equal(randomize.effects[0]?.effectType, 'randomize_question');

  const veto = result.pack.cards.find((card) => card.cardDefinitionId === 'power-up-veto');
  assert.ok(veto);
  assert.equal(veto.automationLevel, 'authoritative');
  assert.equal(veto.effects[0]?.effectType, 'veto_question');

  const duplicate = result.pack.cards.find((card) => card.cardDefinitionId === 'power-up-duplicate');
  assert.ok(duplicate);
  assert.equal(duplicate.automationLevel, 'assisted');
  assert.equal(duplicate.effects[0]?.effectType, 'duplicate_card');
  assert.equal(duplicate.effects[0]?.automationLevel, 'assisted');
  assert.deepEqual(duplicate.effects[0]?.payload, { preservesOriginal: true, copiesHeldTimeBonusAtCapture: true });
  assert.match(duplicate.description, /exact copy of any other card currently in your hand/i);
  assert.match(duplicate.description, /remains in your hand at the end of the round/i);

  const move = result.pack.cards.find((card) => card.cardDefinitionId === 'power-up-move');
  assert.ok(move);
  assert.equal(move.automationLevel, 'assisted');
  assert.equal(move.effects[0]?.effectType, 'move_power_up');
  assert.equal(move.effects[0]?.automationLevel, 'assisted');
  assert.deepEqual(move.effects[0]?.payload, { durationMinutesByScale: { small: 10, medium: 20, large: 60 } });
  assert.deepEqual(move.timingWindow?.allowedPhases, ['hide_phase', 'seek_phase']);
  assert.match(move.description, /hiding timer pauses/i);
  assert.match(move.description, /seekers must stay where they are and refrain from asking questions/i);
  assert.match(move.description, /immediately discard your entire hand/i);
  assert.match(move.description, /cannot be played during the end game/i);
  assert.equal(result.report.issues.some((issue) => issue.code === 'MOVE_DURATION_NOT_IN_SCAN'), false);
  assert.ok(move.sourceProvenance.some((source) => source.sourceFileName === 'https://jetlag.naenae.cat/'));

  const handExpansion = result.pack.cards.find((card) => card.cardDefinitionId === 'power-up-draw-1-expand-1');
  assert.ok(handExpansion);
  assert.equal(handExpansion.automationLevel, 'authoritative');
  assert.equal(handExpansion.effects[0]?.effectType, 'draw_and_expand_hand');
  assert.deepEqual(handExpansion.effects[0]?.payload, { drawCount: 1, handSizeIncrease: 1 });

  const discardDrawTwo = result.pack.cards.find((card) => card.cardDefinitionId === 'power-up-discard-1-draw-2');
  assert.ok(discardDrawTwo);
  assert.equal(discardDrawTwo.automationLevel, 'authoritative');
  assert.equal(discardDrawTwo.effects[0]?.effectType, 'discard_then_draw');
  assert.deepEqual(discardDrawTwo.effects[0]?.payload, { discardCount: 1, drawCount: 2 });
  assert.match(discardDrawTwo.description, /discard 1 card from your hand, then draw and keep 2 replacement cards/i);

  const discardDrawThree = result.pack.cards.find((card) => card.cardDefinitionId === 'power-up-discard-2-draw-3');
  assert.ok(discardDrawThree);
  assert.equal(discardDrawThree.automationLevel, 'authoritative');
  assert.equal(discardDrawThree.effects[0]?.effectType, 'discard_then_draw');

  const drainedBrain = result.pack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-the-drained-brain');
  assert.ok(drainedBrain);
  assert.equal(drainedBrain.automationLevel, 'authoritative');
  assert.equal(drainedBrain.effects[0]?.effectType, 'disable_question_templates');
  assert.deepEqual(drainedBrain.effects[0]?.payload, { questionCount: 3, requireDistinctCategories: true, duration: 'hider_run' });
  assert.equal(drainedBrain.requirements?.requiresManualApproval, false);
  const overflowingChalice = result.pack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-the-overflowing-chalice');
  assert.ok(overflowingChalice);
  assert.equal(overflowingChalice.automationLevel, 'authoritative');
  assert.equal(overflowingChalice.effects[0]?.effectType, 'extra_question_reward_draws');
  assert.deepEqual(overflowingChalice.effects[0]?.payload, { questionCount: 3, extraDrawCount: 1, duration: 'next_question_rewards' });
  assert.equal(overflowingChalice.requirements?.requiresManualApproval, false);
  const spottyMemory = result.pack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-spotty-memory');
  assert.ok(spottyMemory);
  assert.equal(spottyMemory.automationLevel, 'authoritative');
  assert.equal(spottyMemory.effects[0]?.effectType, 'random_question_category_lock');
  assert.deepEqual(spottyMemory.effects[0]?.payload, { duration: 'hider_run', rerollAfterQuestion: true });
  assert.equal(spottyMemory.requirements?.requiresManualApproval, false);
  const hiddenHangman = result.pack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-the-hidden-hangman');
  assert.ok(hiddenHangman);
  assert.equal(hiddenHangman.automationLevel, 'assisted');
  assert.equal(hiddenHangman.effects[0]?.effectType, 'hangman_challenge');
  assert.deepEqual(hiddenHangman.effects[0]?.payload, { wordLength: 5, secretScope: 'hider_player' });
  assert.deepEqual(discardDrawThree.effects[0]?.payload, { discardCount: 2, drawCount: 3 });
  assert.match(discardDrawThree.description, /discard 2 cards from your hand, then draw and keep 3 replacement cards/i);

  const thermometers = result.pack.questionTemplates
    .filter((template) => template.categoryId === 'thermometer')
    .map((template) => ({
      id: template.templateId,
      meters: (template.parameters?.minimumDistance as { meters?: number } | undefined)?.meters,
      scales: template.scaleSet.appliesTo
    }));
  assert.deepEqual(thermometers, [
    { id: 'thermometer-1000', meters: 1000, scales: ['small', 'medium', 'large'] },
    { id: 'thermometer-5000', meters: 5000, scales: ['small', 'medium', 'large'] },
    { id: 'thermometer-15000', meters: 15000, scales: ['medium', 'large'] },
    { id: 'thermometer-75000', meters: 75000, scales: ['large'] }
  ]);
  assert.deepEqual(result.pack.questionCategories.find((category) => category.categoryId === 'thermometer')?.defaultAnswerSchema.allowedValues,
    ['hotter', 'colder']);

  const firstCurse = result.pack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-the-zoologist');
  assert.ok(firstCurse);
  assert.equal(firstCurse.castingCost?.[0]?.description, 'A photo of an animal');
  const curses = result.pack.cards.filter((card) => card.kind === 'curse');
  assert.equal(curses.length, 24);
  assert.ok(curses.every((card) => typeof card.rulebookGuidanceText === 'string'));
  assert.ok(curses.every((card) => card.sourceProvenance.some((source) =>
    source.sourceFileName.startsWith('Scanned base rulebook, printed p.')
  )));
  const bridgeTroll = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-bridge-troll');
  assert.match(String(bridgeTroll?.rulebookGuidanceText), /elevated structure.*pedestrians, cars, or other vehicles/i);
  assert.equal(bridgeTroll?.automationLevel, 'assisted');
  assert.equal(bridgeTroll?.effects[0]?.effectType, 'bridge_troll_challenge');
  const uTurn = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-u-turn');
  assert.match(String(uTurn?.rulebookGuidanceText), /ignore skipped stops/i);
  const urbanExplorer = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-urban-explorer');
  assert.match(String(urbanExplorer?.rulebookGuidanceText), /questions already asked.*still need an answer/i);
  assert.equal(urbanExplorer?.automationLevel, 'assisted');
  assert.equal(urbanExplorer?.effects[0]?.effectType, 'seeker_off_transit_challenge');
  const waterWeight = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-water-weight');
  assert.equal(waterWeight?.automationLevel, 'assisted');
  assert.equal(waterWeight?.effects[0]?.effectType, 'water_weight_challenge');
  assert.deepEqual(waterWeight?.effects[0]?.payload, {
    requiredLitersPerSeeker: 2,
    abandonRadiusMeters: 3,
    minutesByScale: { small: 30, medium: 30, large: 60 }
  });
  assert.equal(waterWeight?.requirements?.requiresManualApproval, false);
  const endlessTumble = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-endless-tumble');
  assert.equal(endlessTumble?.automationLevel, 'assisted');
  assert.equal(endlessTumble?.effects[0]?.effectType, 'endless_tumble_challenge');
  assert.deepEqual(endlessTumble?.effects[0]?.payload, {
    minimumDistanceMeters: 30,
    successfulDieResults: [5, 6],
    minutesByScale: { small: 10, medium: 20, large: 30 }
  });
  assert.equal(endlessTumble?.requirements?.requiresManualApproval, false);
  const lemonPhylactery = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-lemon-phylactery');
  assert.equal(lemonPhylactery?.automationLevel, 'assisted');
  assert.equal(lemonPhylactery?.effects[0]?.effectType, 'lemon_phylactery_challenge');
  assert.deepEqual(lemonPhylactery?.effects[0]?.payload, {
    minutesByScale: { small: 30, medium: 45, large: 60 },
    requiredAttestations: 'all_seekers'
  });
  assert.equal(lemonPhylactery?.requirements?.requiresManualApproval, false);
  const gamblersFeet = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-gamblers-feet');
  assert.equal(gamblersFeet?.automationLevel, 'assisted');
  assert.equal(gamblersFeet?.effects[0]?.effectType, 'gamblers_feet_challenge');
  assert.deepEqual(gamblersFeet?.effects[0]?.payload, {
    minutesByScale: { small: 20, medium: 40, large: 60 },
    dicePerSeeker: true
  });
  assert.equal(gamblersFeet?.requirements?.requiresManualApproval, false);
  const eggPartner = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-egg-partner');
  assert.equal(eggPartner?.automationLevel, 'assisted');
  assert.equal(eggPartner?.effects[0]?.effectType, 'egg_partner_challenge');
  assert.deepEqual(eggPartner?.effects[0]?.payload, {
    minutesByScale: { small: 30, medium: 45, large: 60 },
    acquireBeforeQuestion: true
  });
  assert.equal(eggPartner?.requirements?.requiresManualApproval, false);
  assert.equal(getCardDiscardRequirement(eggPartner!).requiredCards, 2);
  const jammedDoor = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-jammed-door');
  assert.equal(jammedDoor?.automationLevel, 'assisted');
  assert.equal(jammedDoor?.effects[0]?.effectType, 'jammed_door_challenge');
  assert.deepEqual(jammedDoor?.effects[0]?.payload, {
    minutesByScale: { small: 30, medium: 60, large: 180 },
    retryCooldownMinutesByScale: { small: 5, medium: 10, large: 15 },
    minimumTotal: 7,
    requiresVisibleDoorway: true
  });
  assert.equal(jammedDoor?.requirements?.requiresManualApproval, false);
  assert.equal(getCardDiscardRequirement(jammedDoor!).requiredCards, 2);

  const hiderDeck = result.pack.decks.find((deck) => deck.deckId === 'hider-main');
  assert.ok(hiderDeck);
  assert.equal(hiderDeck.entries.find((entry) => entry.cardDefinitionId === 'power-up-randomize')?.weight, 0.04);
});

test('the legacy workbook mapping also excludes the unprinted Measuring target', () => {
  const result = importContentPack({ inputPath: legacyWorkbookPath });
  assert.equal(result.pack.questionTemplates.length, 80);
  const curses = result.pack.cards.filter((card) => card.kind === 'curse');
  assert.equal(curses.length, 24);
  assert.ok(curses.every((card) => typeof card.rulebookGuidanceText === 'string'));
  const bridgeTroll = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-bridge-troll');
  assert.equal(bridgeTroll?.automationLevel, 'assisted');
  assert.equal(bridgeTroll?.effects[0]?.effectType, 'bridge_troll_challenge');
  const urbanExplorer = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-urban-explorer');
  assert.equal(urbanExplorer?.automationLevel, 'assisted');
  assert.equal(urbanExplorer?.effects[0]?.effectType, 'seeker_off_transit_challenge');
  const waterWeight = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-water-weight');
  assert.equal(waterWeight?.automationLevel, 'assisted');
  assert.equal(waterWeight?.effects[0]?.effectType, 'water_weight_challenge');
  const endlessTumble = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-endless-tumble');
  assert.equal(endlessTumble?.effects[0]?.effectType, 'endless_tumble_challenge');
  const lemonPhylactery = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-lemon-phylactery');
  assert.equal(lemonPhylactery?.automationLevel, 'assisted');
  assert.equal(lemonPhylactery?.effects[0]?.effectType, 'lemon_phylactery_challenge');
  const gamblersFeet = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-gamblers-feet');
  assert.equal(gamblersFeet?.automationLevel, 'assisted');
  assert.equal(gamblersFeet?.effects[0]?.effectType, 'gamblers_feet_challenge');
  const eggPartner = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-egg-partner');
  assert.equal(eggPartner?.automationLevel, 'assisted');
  assert.equal(eggPartner?.effects[0]?.effectType, 'egg_partner_challenge');
  assert.deepEqual(eggPartner?.effects[0]?.payload, {
    minutesByScale: { small: 30, medium: 45, large: 60 },
    acquireBeforeQuestion: true
  });
  assert.equal(getCardDiscardRequirement(eggPartner!).requiredCards, 2);
  const jammedDoor = curses.find((card) => card.cardDefinitionId === 'curse-curse-of-the-jammed-door');
  assert.equal(jammedDoor?.automationLevel, 'assisted');
  assert.equal(jammedDoor?.effects[0]?.effectType, 'jammed_door_challenge');
  assert.deepEqual(jammedDoor?.effects[0]?.payload, {
    minutesByScale: { small: 30, medium: 60, large: 180 },
    retryCooldownMinutesByScale: { small: 5, medium: 10, large: 15 },
    minimumTotal: 7,
    requiresVisibleDoorway: true
  });
  assert.equal(getCardDiscardRequirement(jammedDoor!).requiredCards, 2);
  const photoTemplates = result.pack.questionTemplates.filter((template) => template.categoryId === 'photos');
  assert.equal(photoTemplates.length, 18);
  assert.ok(photoTemplates.every((template) => typeof template.parameters?.rulebookGuidanceText === 'string'));
  const tracedStreets = photoTemplates.find((template) => template.templateId === 'photos-1-2-mile-of-streets-traced');
  assert.match(String(tracedStreets?.parameters?.rulebookGuidanceText), /1 km/);
  assert.equal(result.pack.questionTemplates.some((template) => template.templateId === 'measuring-4th-admin-borough'), false);
  assert.equal(result.pack.questionTemplates.some((template) => template.templateId === 'matching-4th-admin-borough'), true);
});
