import type { ContentPack, ContentPackImportResult } from '../../shared-types/src/index.ts';

export type ImportSourceFormat = 'xlsx' | 'csv' | 'json';

export interface WorkbookRow {
  rowNumber: number;
  values: Array<string | number | boolean | null>;
}

export interface WorkbookSheet {
  name: string;
  maxRow: number;
  maxColumn: number;
  mergedRanges: string[];
  rows: WorkbookRow[];
}

export interface WorkbookDocument {
  sourceFileName: string;
  sheets: WorkbookSheet[];
}

export interface CsvDocument {
  sourceFileName: string;
  rows: string[][];
}

export interface ImportCommandOptions {
  inputPath: string;
  outputPath?: string;
  reportPath?: string;
  format?: ImportSourceFormat;
}

export interface SourceParser<TDocument> {
  format: ImportSourceFormat;
  parse(inputPath: string): TDocument;
}

export interface JsonPackDocument {
  pack: ContentPack;
}

export interface ParsedImportSource {
  format: ImportSourceFormat;
  document: WorkbookDocument | CsvDocument | JsonPackDocument;
}

export interface ImportPipelineResult extends ContentPackImportResult {
  outputPath?: string;
  reportPath?: string;
}
