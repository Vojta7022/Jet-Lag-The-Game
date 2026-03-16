import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { pythonWorkbookParser } from '../../packages/content-import/src/xlsx/python-workbook-parser.ts';

const workbookPath = fileURLToPath(new URL('../../Jet Lag The Game - cleaned for import.xlsx', import.meta.url));

test('python workbook parser reads the expected workbook sheets', () => {
  const workbook = pythonWorkbookParser.parse(workbookPath);

  assert.equal(workbook.sourceFileName, 'Jet Lag The Game - cleaned for import.xlsx');
  assert.deepEqual(
    workbook.sheets.map((sheet) => sheet.name),
    [
      'Curses',
      'Matching',
      'Measuring',
      'Thermometer',
      'Radar',
      'Tentacles',
      'Photos',
      'Hider Deck'
    ]
  );

  const hiderDeck = workbook.sheets.find((sheet) => sheet.name === 'Hider Deck');
  assert.ok(hiderDeck);
  assert.equal(hiderDeck.maxRow, 15);
  assert.equal(hiderDeck.rows[1]?.values[1], 'Red 2m, 3m, 5m');
});
