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
  assert.ok(issueCodes.has('AMBIGUOUS_MANUAL_TEMPLATE'));
  assert.ok(issueCodes.has('MISSING_RULESET'));
  assert.ok(issueCodes.has('MISSING_MAP_PRESET'));
  assert.ok(issueCodes.has('POWER_UP_EFFECT_UNSPECIFIED'));
  assert.ok(issueCodes.has('NORMALIZATION_CORRECTION_APPLIED'));

  const validationIssues = validateContentPack(result.pack);
  assert.ok(validationIssues.some((issue) => issue.code === 'MISSING_RULESET'));
  assert.ok(validationIssues.some((issue) => issue.code === 'MISSING_MAP_PRESET'));
});
