import assert from 'node:assert/strict';
import test from 'node:test';

import { buildQuestionSelectionState } from '../../packages/domain/src/index.ts';
import { loadEngineTestContentPack } from './helpers.ts';

test('investigation book exposes every question allowed at the selected scale', () => {
  const contentPack = loadEngineTestContentPack();
  const category = contentPack.questionCategories.find((entry) => entry.categoryId === 'matching');
  assert.ok(category);

  const expectedTemplateIds = contentPack.questionTemplates
    .filter((template) => template.categoryId === category!.categoryId)
    .filter((template) => template.scaleSet.appliesTo.includes('small'))
    .map((template) => template.templateId)
    .sort();
  const selection = buildQuestionSelectionState({
    contentPack,
    category: category!,
    selectedScale: 'small',
    askedQuestions: []
  });

  assert.deepEqual([...selection.availableTemplateIds].sort(), expectedTemplateIds);
});

test('repeated investigation questions remain available and multiply their hider reward', () => {
  const contentPack = loadEngineTestContentPack();
  const category = contentPack.questionCategories.find((entry) => entry.categoryId === 'matching');
  assert.ok(category);
  const questionTemplate = contentPack.questionTemplates.find(
    (template) => template.categoryId === category!.categoryId && template.scaleSet.appliesTo.includes('small')
  );
  assert.ok(questionTemplate);

  const selection = buildQuestionSelectionState({
    contentPack,
    category: category!,
    selectedScale: 'small',
    askedQuestions: [
      {
        templateId: questionTemplate!.templateId,
        categoryId: category!.categoryId,
        status: 'resolved'
      },
      {
        templateId: questionTemplate!.templateId,
        categoryId: category!.categoryId,
        status: 'resolved'
      }
    ]
  });

  assert.equal(selection.availableTemplateIds.includes(questionTemplate!.templateId), true);
  assert.equal(selection.rewardMultiplierByTemplate[questionTemplate!.templateId], 3);
});

test('vetoed questions count toward repeat costs while randomized questions do not', () => {
  const contentPack = loadEngineTestContentPack();
  const category = contentPack.questionCategories.find((entry) => entry.categoryId === 'matching');
  assert.ok(category);
  const template = contentPack.questionTemplates.find((entry) => entry.categoryId === category!.categoryId);
  assert.ok(template);

  const selection = buildQuestionSelectionState({
    contentPack,
    category: category!,
    selectedScale: 'small',
    askedQuestions: [
      { templateId: template!.templateId, categoryId: category!.categoryId, status: 'vetoed' },
      { templateId: template!.templateId, categoryId: category!.categoryId, status: 'canceled' }
    ]
  });

  assert.equal(selection.rewardMultiplierByTemplate[template!.templateId], 2);
  assert.equal(selection.askedCountByTemplate[template!.templateId], 1);
});
