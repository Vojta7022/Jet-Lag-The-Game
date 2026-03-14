import type { ContentPack } from './content.ts';

export interface ImportIssue {
  sheetName: string;
  rowNumber: number;
  columnName: string;
  fieldPath: string;
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  rawValue: unknown;
  normalizedValue: unknown;
  suggestedFix: string;
  sheetCell?: string;
  blocking?: boolean;
}

export interface ImportReport {
  importJobId: string;
  schemaVersion: string;
  packVersion: string;
  importerVersion: string;
  mappingProfileId: string;
  sourceFingerprint: string;
  status: 'success' | 'warning' | 'failed' | 'draft_output';
  generatedPackId: string;
  issues: ImportIssue[];
}

export interface ContentPackImportResult {
  pack: ContentPack;
  report: ImportReport;
}
