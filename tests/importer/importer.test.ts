import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { importContentPack } from '../../packages/content-import/src/importer.ts';

const workbookPath = fileURLToPath(new URL('../../Jet Lag The Game - cleaned for import.xlsx', import.meta.url));
const legacyWorkbookPath = fileURLToPath(new URL('../../Jet Lag The Game.xlsx', import.meta.url));

test('the workbook importer creates a normalized draft content pack', () => {
  const result = importContentPack({
    inputPath: workbookPath
  });

  assert.equal(result.pack.packId, 'jet-lag-the-game-seed');
  assert.equal(result.pack.status, 'draft');
  assert.equal(result.pack.cards.length, 37);
  assert.equal(result.pack.questionCategories.length, 6);
  assert.equal(result.pack.questionTemplates.length, 80);
  assert.equal(result.pack.questionTemplates.some((template) => template.templateId === 'measuring-4th-admin-borough'), false);
  assert.equal(result.pack.questionTemplates.some((template) => template.templateId === 'matching-4th-admin-borough'), true);
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

  const randomize = result.pack.cards.find((card) => card.cardDefinitionId === 'power-up-randomize');
  assert.ok(randomize);
  assert.equal(randomize.name, 'Randomize');
  assert.equal(randomize.automationLevel, 'authoritative');
  assert.equal(randomize.effects[0]?.effectType, 'randomize_question');

  const veto = result.pack.cards.find((card) => card.cardDefinitionId === 'power-up-veto');
  assert.ok(veto);
  assert.equal(veto.automationLevel, 'authoritative');
  assert.equal(veto.effects[0]?.effectType, 'veto_question');

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

  const hiderDeck = result.pack.decks.find((deck) => deck.deckId === 'hider-main');
  assert.ok(hiderDeck);
  assert.equal(hiderDeck.entries.find((entry) => entry.cardDefinitionId === 'power-up-randomize')?.weight, 0.04);
});

test('the legacy workbook mapping also excludes the unprinted Measuring target', () => {
  const result = importContentPack({ inputPath: legacyWorkbookPath });
  assert.equal(result.pack.questionTemplates.length, 80);
  assert.equal(result.pack.questionTemplates.some((template) => template.templateId === 'measuring-4th-admin-borough'), false);
  assert.equal(result.pack.questionTemplates.some((template) => template.templateId === 'matching-4th-admin-borough'), true);
});
