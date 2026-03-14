import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CONTENT_SCHEMA_VERSION } from '../../content-schema/src/index.ts';
import type {
  ContentPack,
  ImportIssue,
  ImportReport
} from '../../shared-types/src/index.ts';

import { csvSourceParser } from './csv/read-csv-source.ts';
import { jsonPackParser } from './json/read-json-pack.ts';
import {
  JET_LAG_MAPPING_PROFILE_ID,
  looksLikeJetLagWorkbook,
  mapJetLagWorkbookToContentPack
} from './mapping-profiles/jet-lag-workbook.ts';
import type {
  ImportCommandOptions,
  ImportPipelineResult,
  ImportSourceFormat,
  ParsedImportSource
} from './types.ts';
import { validateContentPack } from './validation.ts';
import { pythonWorkbookParser } from './xlsx/python-workbook-parser.ts';

const IMPORTER_VERSION = '0.1.0';

function detectFormat(inputPath: string): ImportSourceFormat {
  const extension = path.extname(inputPath).toLowerCase();

  switch (extension) {
    case '.xlsx':
      return 'xlsx';
    case '.csv':
      return 'csv';
    case '.json':
      return 'json';
    default:
      throw new Error(`Unsupported input format: ${extension}`);
  }
}

function parseImportSource(inputPath: string, format: ImportSourceFormat): ParsedImportSource {
  switch (format) {
    case 'xlsx':
      return {
        format,
        document: pythonWorkbookParser.parse(inputPath)
      };
    case 'csv':
      return {
        format,
        document: csvSourceParser.parse(inputPath)
      };
    case 'json':
      return {
        format,
        document: jsonPackParser.parse(inputPath)
      };
    default:
      throw new Error(`No parser registered for format: ${format satisfies never}`);
  }
}

function computeSourceFingerprint(inputPath: string): string {
  const buffer = readFileSync(path.resolve(inputPath));
  return createHash('sha256').update(buffer).digest('hex');
}

function buildReport(
  pack: ContentPack,
  sourceFingerprint: string,
  issues: ImportIssue[]
): ImportReport {
  const hasErrors = issues.some((issue) => issue.severity === 'error');
  const hasWarnings = issues.some((issue) => issue.severity === 'warning');

  return {
    importJobId: randomUUID(),
    schemaVersion: CONTENT_SCHEMA_VERSION,
    packVersion: pack.packVersion,
    importerVersion: IMPORTER_VERSION,
    mappingProfileId: pack.mappingProfileId,
    sourceFingerprint,
    status: hasErrors ? 'failed' : hasWarnings || pack.status === 'draft' ? 'draft_output' : 'success',
    generatedPackId: pack.packId,
    issues
  };
}

function writeJsonIfRequested(outputPath: string | undefined, payload: unknown): string | undefined {
  if (!outputPath) {
    return undefined;
  }

  const resolvedPath = path.resolve(outputPath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return resolvedPath;
}

export function importContentPack(options: ImportCommandOptions): ImportPipelineResult {
  const format = options.format ?? detectFormat(options.inputPath);
  const parsedSource = parseImportSource(options.inputPath, format);
  const sourceFingerprint = computeSourceFingerprint(options.inputPath);

  let pack: ContentPack;
  let issues: ImportIssue[] = [];

  if (parsedSource.format === 'xlsx') {
    if (!looksLikeJetLagWorkbook(parsedSource.document)) {
      throw new Error('No registered XLSX mapping profile matched the workbook structure.');
    }

    const mapped = mapJetLagWorkbookToContentPack(parsedSource.document);
    pack = mapped.pack;
    issues = mapped.issues;
    pack.schemaVersion = CONTENT_SCHEMA_VERSION;
    pack.importerVersion = IMPORTER_VERSION;
    pack.sourceFingerprint = sourceFingerprint;
  } else if (parsedSource.format === 'json') {
    pack = parsedSource.document.pack;
    pack.schemaVersion = pack.schemaVersion || CONTENT_SCHEMA_VERSION;
    pack.importerVersion = pack.importerVersion || IMPORTER_VERSION;
    pack.sourceFingerprint = pack.sourceFingerprint || sourceFingerprint;
  } else {
    throw new Error('CSV content-pack mapping profiles are not implemented yet.');
  }

  const validationIssues = validateContentPack(pack);
  issues = [...issues, ...validationIssues];

  if (!issues.some((issue) => issue.severity === 'error')) {
    pack.status = 'draft';
  }

  const report = buildReport(pack, sourceFingerprint, issues);
  const outputPath = writeJsonIfRequested(options.outputPath, pack);
  const reportPath = writeJsonIfRequested(options.reportPath, report);

  return {
    pack,
    report,
    outputPath,
    reportPath
  };
}
