import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { pythonWorkbookParser } from '../../packages/content-import/src/xlsx/python-workbook-parser.ts';

const workbookPath = fileURLToPath(new URL('../../Jet Lag The Game.xlsx', import.meta.url));

test('python workbook parser reads the expected workbook sheets', () => {
  const workbook = pythonWorkbookParser.parse(workbookPath);

  assert.equal(workbook.sourceFileName, 'Jet Lag The Game.xlsx');
  assert.deepEqual(
    workbook.sheets.map((sheet) => sheet.name),
    [
      'Form Responses 1',
      'Hider Deck',
      '💀Curses',
      '1. Matching',
      '2. Measuring',
      '3. Thermometer',
      '4. Radar',
      '5. Tentacles',
      '6. Photos'
    ]
  );

  const hiderDeck = workbook.sheets.find((sheet) => sheet.name === 'Hider Deck');
  assert.ok(hiderDeck);
  assert.equal(hiderDeck.maxRow, 20);
  assert.equal(hiderDeck.rows[1]?.values[2], 'Red\n2m, 3m, 5m');
});
