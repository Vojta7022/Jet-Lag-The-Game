import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { importContentPack } from '../../packages/content-import/src/importer.ts';
import { validateContentPack } from '../../packages/content-import/src/validation.ts';

const workbookPath = fileURLToPath(new URL('../../Jet Lag The Game - cleaned for import.xlsx', import.meta.url));

test('import reporting captures workbook ambiguities and draft-only gaps', () => {
  const result = importContentPack({
    inputPath: workbookPath
  });

  assert.equal(result.report.status, 'draft_output');
  assert.equal(result.report.issues.some((issue) => issue.severity === 'error'), false);

  const issueCodes = new Set(result.report.issues.map((issue) => issue.code));
  assert.equal(issueCodes.has('AMBIGUOUS_MANUAL_TEMPLATE'), false);
  assert.equal(
    (result.pack.questionTemplates.find((template) => template.templateId === 'radar-choose')?.parameters?.distanceMode),
    'player_choice'
  );
  assert.equal(issueCodes.has('MISSING_RULESET'), false);
  assert.equal(issueCodes.has('MISSING_MAP_PRESET'), false);
  assert.equal(issueCodes.has('MOVE_DURATION_NOT_IN_SCAN'), false);
  assert.ok(issueCodes.has('NORMALIZATION_CORRECTION_APPLIED'));

  const validationIssues = validateContentPack(result.pack);
  assert.equal(validationIssues.some((issue) => issue.code === 'MISSING_RULESET'), false);
  assert.equal(validationIssues.some((issue) => issue.code === 'MISSING_MAP_PRESET'), false);
});
