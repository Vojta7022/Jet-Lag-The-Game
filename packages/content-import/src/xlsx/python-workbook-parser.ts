import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import type { SourceParser, WorkbookDocument } from '../types.ts';

export const pythonWorkbookParser: SourceParser<WorkbookDocument> = {
  format: 'xlsx',
  parse(inputPath: string): WorkbookDocument {
    const scriptPath = new URL('./read_workbook.py', import.meta.url);
    const result = spawnSync('python3', [fileURLToPath(scriptPath), path.resolve(inputPath)], {
      encoding: 'utf8'
    });

    if (result.status !== 0) {
      throw new Error(result.stderr || 'Failed to parse workbook with python helper.');
    }

    return JSON.parse(result.stdout) as WorkbookDocument;
  }
};
