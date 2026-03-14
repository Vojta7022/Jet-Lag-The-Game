import type { ImportIssue, ImportIssueSeverity } from '../../shared-types/src/index.ts';

interface CreateIssueInput {
  sheetName: string;
  rowNumber: number;
  columnName: string;
  fieldPath: string;
  severity: ImportIssueSeverity;
  code: string;
  message: string;
  rawValue: unknown;
  normalizedValue: unknown;
  suggestedFix: string;
  sheetCell?: string;
  blocking?: boolean;
}

export function createIssue(input: CreateIssueInput): ImportIssue {
  return {
    sheetName: input.sheetName,
    rowNumber: input.rowNumber,
    columnName: input.columnName,
    fieldPath: input.fieldPath,
    severity: input.severity,
    code: input.code,
    message: input.message,
    rawValue: input.rawValue,
    normalizedValue: input.normalizedValue,
    suggestedFix: input.suggestedFix,
    sheetCell: input.sheetCell,
    blocking: input.blocking
  };
}
