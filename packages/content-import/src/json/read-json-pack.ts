import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { JsonPackDocument, SourceParser } from '../types.ts';

export const jsonPackParser: SourceParser<JsonPackDocument> = {
  format: 'json',
  parse(inputPath: string): JsonPackDocument {
    const raw = readFileSync(path.resolve(inputPath), 'utf8');
    return {
      pack: JSON.parse(raw)
    };
  }
};
