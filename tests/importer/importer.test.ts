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

  const handExpansion = result.pack.cards.find((card) => card.cardDefinitionId === 'power-up-draw-1-expand-1');
  assert.ok(handExpansion);
  assert.equal(handExpansion.automationLevel, 'authoritative');
  assert.equal(handExpansion.effects[0]?.effectType, 'draw_and_expand_hand');
  assert.deepEqual(handExpansion.effects[0]?.payload, { drawCount: 1, handSizeIncrease: 1 });

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
