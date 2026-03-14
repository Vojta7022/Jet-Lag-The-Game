import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { importContentPack } from '../../packages/content-import/src/importer.ts';

const workbookPath = fileURLToPath(new URL('../../Jet Lag The Game.xlsx', import.meta.url));

test('the workbook importer creates a normalized draft content pack', () => {
  const result = importContentPack({
    inputPath: workbookPath
  });

  assert.equal(result.pack.packId, 'jet-lag-the-game-seed');
  assert.equal(result.pack.status, 'draft');
  assert.equal(result.pack.cards.length, 37);
  assert.equal(result.pack.questionCategories.length, 6);
  assert.equal(result.pack.questionTemplates.length, 81);
  assert.equal(result.pack.constraints.length, 9);
  assert.equal(result.pack.decks.length, 1);

  const amusementPark = result.pack.questionTemplates.find(
    (template) => template.templateId === 'matching-amusement-park'
  );
  assert.ok(amusementPark);
  assert.equal(amusementPark.sourceProvenance[0]?.rawValue, 'Amusment Park');

  const radarChoose = result.pack.questionTemplates.find(
    (template) => template.templateId === 'radar-choose'
  );
  assert.ok(radarChoose);
  assert.equal(radarChoose.parameters?.distanceMode, 'manual-choice');
});
