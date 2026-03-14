import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { CsvDocument, SourceParser } from '../types.ts';

export const csvSourceParser: SourceParser<CsvDocument> = {
  format: 'csv',
  parse(inputPath: string): CsvDocument {
    const raw = readFileSync(path.resolve(inputPath), 'utf8');
    const rows = raw
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => line.split(',').map((cell) => cell.trim()));

    return {
      sourceFileName: path.basename(inputPath),
      rows
    };
  }
};
