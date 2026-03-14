import type {
  CardDefinition,
  ConstraintDefinition,
  ContentPack,
  DeckDefinition,
  FeatureTaxonomyEntry,
  ImportIssue,
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  RequirementDefinition,
  ScaleSet,
  SourceProvenance,
  TimeValue,
  VisibilityPolicyRef
} from '../../../shared-types/src/index.ts';

import {
  applyWorkbookCorrections,
  normalizeLabel,
  normalizeScaleGate,
  parseDistanceValue,
  parseDrawRule,
  parseFixedMinutes,
  parseScaleAwareMinutes,
  parseScaleMinutes,
  unique
} from '../normalization.ts';
import { createIssue } from '../issues.ts';
import type { WorkbookDocument, WorkbookRow, WorkbookSheet } from '../types.ts';

export const JET_LAG_MAPPING_PROFILE_ID = 'xlsx.jetlag.v1';

const EXPECTED_SHEETS = [
  'Form Responses 1',
  'Hider Deck',
  '💀Curses',
  '1. Matching',
  '2. Measuring',
  '3. Thermometer',
  '4. Radar',
  '5. Tentacles',
  '6. Photos'
];

const PUBLIC_VISIBILITY: VisibilityPolicyRef = {
  visibleTo: ['authority', 'host_admin', 'public_match']
};

const HIDER_DECK_VISIBILITY: VisibilityPolicyRef = {
  visibleTo: ['authority', 'host_admin', 'team_private']
};

const PHOTO_VISIBILITY: VisibilityPolicyRef = {
  visibleTo: ['authority', 'host_admin', 'team_private', 'player_private']
};

function getSheet(document: WorkbookDocument, name: string): WorkbookSheet {
  const sheet = document.sheets.find((candidate) => candidate.name === name);

  if (!sheet) {
    throw new Error(`Missing expected sheet: ${name}`);
  }

  return sheet;
}

function rowHasValues(row: WorkbookRow): boolean {
  return row.values.some((value) => value !== null && String(value).trim().length > 0);
}

function cellValue(row: WorkbookRow, index: number): string | number | boolean | null {
  return row.values[index] ?? null;
}

function cellText(row: WorkbookRow, index: number): string | null {
  const value = cellValue(row, index);
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function sourceProvenance(
  sourceFileName: string,
  sheetName: string,
  rowNumber: number,
  columnName: string,
  rawValue: string | number | boolean | null,
  rawLabel?: string,
  notes?: string
): SourceProvenance {
  return {
    sourceType: 'xlsx',
    sourceFileName,
    sheetName,
    rowNumber,
    columnName,
    rawLabel,
    rawValue,
    notes
  };
}

function generatedProvenance(sourceFileName: string, notes: string): SourceProvenance {
  return {
    sourceType: 'generated',
    sourceFileName,
    notes
  };
}

function allScales(rawLabel = 'All Games'): ScaleSet {
  return {
    appliesTo: ['small', 'medium', 'large'],
    rawLabel
  };
}

function buildConstraintDefinitions(packId: string, sourceFileName: string): ConstraintDefinition[] {
  const generated = [generatedProvenance(sourceFileName, 'Generated from workbook mapping profile.')];

  const visibilityPolicy = PUBLIC_VISIBILITY;

  return [
    {
      constraintId: 'nearest-feature-match',
      packId,
      name: 'Nearest Feature Match',
      kind: 'nearest_feature_match',
      inputSchema: { answerType: 'boolean' },
      outputArtifactKinds: ['geometry', 'metadata', 'explanation'],
      confidencePolicy: { mode: 'exact_or_approximate' },
      explanationTemplate: 'Nearest-feature comparison applied.',
      visibilityPolicy,
      sourceProvenance: generated
    },
    {
      constraintId: 'same-admin-region',
      packId,
      name: 'Same Administrative Region',
      kind: 'same_admin_region',
      inputSchema: { answerType: 'boolean' },
      outputArtifactKinds: ['metadata', 'explanation'],
      confidencePolicy: { mode: 'metadata_only' },
      explanationTemplate: 'Administrative region comparison applied.',
      visibilityPolicy,
      sourceProvenance: generated
    },
    {
      constraintId: 'comparative-distance',
      packId,
      name: 'Comparative Distance',
      kind: 'comparative_distance',
      inputSchema: { answerType: 'enum', values: ['closer', 'further', 'same'] },
      outputArtifactKinds: ['geometry', 'metadata', 'explanation'],
      confidencePolicy: { mode: 'exact_or_approximate' },
      explanationTemplate: 'Comparative distance constraint applied.',
      visibilityPolicy,
      sourceProvenance: generated
    },
    {
      constraintId: 'hotter-colder',
      packId,
      name: 'Hotter or Colder',
      kind: 'hotter_colder',
      inputSchema: { answerType: 'enum', values: ['hotter', 'colder', 'same'] },
      outputArtifactKinds: ['geometry', 'metadata', 'explanation'],
      confidencePolicy: { mode: 'exact_or_approximate' },
      explanationTemplate: 'Hotter/colder movement constraint applied.',
      visibilityPolicy,
      sourceProvenance: generated
    },
    {
      constraintId: 'within-radius',
      packId,
      name: 'Within Radius',
      kind: 'within_distance',
      inputSchema: { answerType: 'boolean' },
      outputArtifactKinds: ['geometry', 'explanation'],
      confidencePolicy: { mode: 'exact' },
      explanationTemplate: 'Within-radius constraint applied.',
      visibilityPolicy,
      sourceProvenance: generated
    },
    {
      constraintId: 'outside-radius',
      packId,
      name: 'Outside Radius',
      kind: 'beyond_distance',
      inputSchema: { answerType: 'boolean' },
      outputArtifactKinds: ['geometry', 'explanation'],
      confidencePolicy: { mode: 'exact' },
      explanationTemplate: 'Outside-radius constraint applied.',
      visibilityPolicy,
      sourceProvenance: generated
    },
    {
      constraintId: 'nearest-candidate-feature',
      packId,
      name: 'Nearest Candidate Feature',
      kind: 'nearest_candidate',
      inputSchema: { answerType: 'feature_choice' },
      outputArtifactKinds: ['geometry', 'metadata', 'explanation'],
      confidencePolicy: { mode: 'exact_or_approximate' },
      explanationTemplate: 'Nearest-candidate feature constraint applied.',
      visibilityPolicy,
      sourceProvenance: generated
    },
    {
      constraintId: 'photo-evidence',
      packId,
      name: 'Photo Evidence',
      kind: 'photo_evidence',
      inputSchema: { answerType: 'attachment' },
      outputArtifactKinds: ['metadata', 'manual_review', 'explanation'],
      confidencePolicy: { mode: 'manual' },
      explanationTemplate: 'Photo evidence captured for manual review.',
      visibilityPolicy,
      sourceProvenance: generated
    },
    {
      constraintId: 'manual-review-only',
      packId,
      name: 'Manual Review Only',
      kind: 'metadata_only',
      inputSchema: { answerType: 'manual' },
      outputArtifactKinds: ['manual_review', 'explanation'],
      confidencePolicy: { mode: 'manual' },
      explanationTemplate: 'Manual review is required.',
      visibilityPolicy,
      sourceProvenance: generated
    }
  ];
}

function registerFeatureTaxonomy(
  taxonomyById: Map<string, FeatureTaxonomyEntry>,
  rawLabel: string,
  sourceFileName: string,
  sheetName: string,
  rowNumber: number
): string {
  const normalized = normalizeLabel(rawLabel);
  const featureClassId = normalized.slug;

  const existing = taxonomyById.get(featureClassId);

  if (!existing) {
    taxonomyById.set(featureClassId, {
      featureClassId,
      label: normalized.displayText,
      aliases: normalized.corrected ? unique([collapseLineBreaks(rawLabel)]) : undefined,
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheetName, rowNumber, 'A', rawLabel, rawLabel)
      ]
    });
  } else if (normalized.corrected) {
    existing.aliases = unique([...(existing.aliases ?? []), collapseLineBreaks(rawLabel)]);
  }

  return featureClassId;
}

function collapseLineBreaks(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function buildNormalizationIssue(
  issues: ImportIssue[],
  sourceFileName: string,
  sheetName: string,
  rowNumber: number,
  columnName: string,
  rawValue: string,
  normalizedValue: string,
  fieldPath: string
): void {
  if (collapseLineBreaks(rawValue) === normalizedValue) {
    return;
  }

  issues.push(
    createIssue({
      sheetName,
      rowNumber,
      columnName,
      fieldPath,
      severity: 'warning',
      code: 'NORMALIZATION_CORRECTION_APPLIED',
      message: 'Workbook text was normalized into a canonical label.',
      rawValue,
      normalizedValue,
      suggestedFix: 'Review the canonical label and keep the raw text in provenance metadata.',
      sheetCell: `${columnName}${rowNumber}`
    })
  );
}

function createGeneratedRequirement(description: string, rawText?: string | null): RequirementDefinition {
  return {
    requirementType: 'raw_text',
    description,
    rawText: rawText ?? null
  };
}

function buildTimeBonusCards(
  sourceFileName: string,
  packId: string,
  deckId: string,
  sheet: WorkbookSheet,
  issues: ImportIssue[]
): { cards: CardDefinition[]; entries: DeckDefinition['entries'] } {
  const cards: CardDefinition[] = [];
  const entries: DeckDefinition['entries'] = [];

  for (const row of sheet.rows) {
    if (row.rowNumber < 2 || row.rowNumber > 6) {
      continue;
    }

    const label = cellText(row, 2);
    const quantityValue = cellValue(row, 3);

    if (!label || typeof quantityValue !== 'number') {
      continue;
    }

    const [colorRaw] = label.split('\n');
    const minutesByScale = parseScaleMinutes(label);

    if (!minutesByScale) {
      issues.push(
        createIssue({
          sheetName: sheet.name,
          rowNumber: row.rowNumber,
          columnName: 'C',
          fieldPath: 'cards[].effects[].payload.minutesByScale',
          severity: 'error',
          code: 'TIME_BONUS_PARSE_FAILED',
          message: 'Could not parse the scale-specific time bonus values.',
          rawValue: label,
          normalizedValue: null,
          suggestedFix: 'Keep the second line in the format `Xm, Ym, Zm`.',
          sheetCell: `C${row.rowNumber}`,
          blocking: true
        })
      );
      continue;
    }

    const normalizedColor = normalizeLabel(colorRaw);
    buildNormalizationIssue(
      issues,
      sourceFileName,
      sheet.name,
      row.rowNumber,
      'C',
      colorRaw,
      normalizedColor.displayText,
      `cards[time-bonus-${normalizedColor.slug}].name`
    );

    const cardDefinitionId = `time-bonus-${normalizedColor.slug}`;

    cards.push({
      cardDefinitionId,
      packId,
      deckId,
      kind: 'time_bonus',
      name: `Time Bonus ${normalizedColor.displayText}`,
      shortName: normalizedColor.displayText,
      description: 'Adds a scale-specific time bonus to the hider team.',
      automationLevel: 'authoritative',
      effects: [
        {
          effectType: 'add_time_bonus',
          description: 'Adds bonus time based on game scale.',
          automationLevel: 'authoritative',
          rawText: label,
          payload: {
            minutesByScale
          }
        }
      ],
      visibilityPolicy: HIDER_DECK_VISIBILITY,
      tags: ['time-bonus'],
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'C', label, colorRaw)
      ]
    });

    entries.push({
      cardDefinitionId,
      quantity: quantityValue,
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'D', quantityValue, label)
      ]
    });
  }

  return { cards, entries };
}

function buildPowerUpCards(
  sourceFileName: string,
  packId: string,
  deckId: string,
  sheet: WorkbookSheet,
  issues: ImportIssue[]
): { cards: CardDefinition[]; entries: DeckDefinition['entries'] } {
  const cards: CardDefinition[] = [];
  const entries: DeckDefinition['entries'] = [];

  for (const row of sheet.rows) {
    if (row.rowNumber < 8 || row.rowNumber > 14) {
      continue;
    }

    const label = cellText(row, 2);
    const quantityValue = cellValue(row, 3);

    if (!label || typeof quantityValue !== 'number') {
      continue;
    }

    const normalized = normalizeLabel(label);
    buildNormalizationIssue(
      issues,
      sourceFileName,
      sheet.name,
      row.rowNumber,
      'C',
      label,
      normalized.displayText,
      `cards[power-up-${normalized.slug}].name`
    );

    const cardDefinitionId = `power-up-${normalized.slug}`;
    const description = 'Effect text is not defined in the workbook. Resolve using the active ruleset or a content editor.';

    cards.push({
      cardDefinitionId,
      packId,
      deckId,
      kind: 'power_up',
      name: normalized.displayText,
      shortName: normalized.displayText,
      description,
      automationLevel: 'manual',
      effects: [
        {
          effectType: 'manual_power_up',
          description,
          automationLevel: 'manual',
          rawText: label
        }
      ],
      visibilityPolicy: HIDER_DECK_VISIBILITY,
      tags: ['power-up'],
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'C', label, label)
      ]
    });

    entries.push({
      cardDefinitionId,
      quantity: quantityValue,
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'D', quantityValue, label)
      ]
    });

    issues.push(
      createIssue({
        sheetName: sheet.name,
        rowNumber: row.rowNumber,
        columnName: 'C',
        fieldPath: `cards[${cardDefinitionId}].description`,
        severity: 'warning',
        code: 'POWER_UP_EFFECT_UNSPECIFIED',
        message: 'The workbook provides a power-up name but no effect text.',
        rawValue: label,
        normalizedValue: description,
        suggestedFix: 'Add a ruleset or editor-authored effect definition before publishing.',
        sheetCell: `C${row.rowNumber}`
      })
    );
  }

  return { cards, entries };
}

function buildBlankCard(
  sourceFileName: string,
  packId: string,
  deckId: string,
  sheet: WorkbookSheet
): { card: CardDefinition; entry: DeckDefinition['entries'][number] } {
  const blankRow = sheet.rows.find((row) => row.rowNumber === 19);
  const quantityValue = blankRow ? cellValue(blankRow, 3) : 0;
  const quantity = typeof quantityValue === 'number' ? quantityValue : 0;

  return {
    card: {
      cardDefinitionId: 'blank-card',
      packId,
      deckId,
      kind: 'blank',
      name: 'Blank Card',
      description: 'No effect.',
      automationLevel: 'authoritative',
      effects: [],
      visibilityPolicy: HIDER_DECK_VISIBILITY,
      tags: ['blank'],
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, 19, 'B', 'Blanks', 'Blanks')
      ]
    },
    entry: {
      cardDefinitionId: 'blank-card',
      quantity,
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, 19, 'D', quantityValue, 'Blanks')
      ]
    }
  };
}

function buildCurseCards(
  sourceFileName: string,
  packId: string,
  deckId: string,
  sheet: WorkbookSheet,
  issues: ImportIssue[]
): { cards: CardDefinition[]; entries: DeckDefinition['entries'] } {
  const cards: CardDefinition[] = [];
  const entries: DeckDefinition['entries'] = [];
  const rows = sheet.rows.filter((row) => rowHasValues(row) && row.rowNumber >= 2);

  for (let index = 0; index < rows.length; index += 2) {
    const curseRow = rows[index];
    const costRow = rows[index + 1];

    const orderRaw = cellText(curseRow, 0) ?? `#${index / 2 + 1}`;
    const nameRaw = cellText(curseRow, 1);
    const descriptionRaw = cellText(curseRow, 2);

    if (!nameRaw || !descriptionRaw) {
      continue;
    }

    if (!costRow || collapseLineBreaks(cellText(costRow, 1) ?? '') !== 'Casting Cost') {
      issues.push(
        createIssue({
          sheetName: sheet.name,
          rowNumber: curseRow.rowNumber,
          columnName: 'B',
          fieldPath: `cards[curse-${index / 2 + 1}].castingCost`,
          severity: 'error',
          code: 'CURSE_COST_ROW_MISSING',
          message: 'Every curse row must be followed by a casting-cost row.',
          rawValue: nameRaw,
          normalizedValue: null,
          suggestedFix: 'Add a `Casting Cost` row immediately after the curse definition.',
          sheetCell: `B${curseRow.rowNumber}`,
          blocking: true
        })
      );
      continue;
    }

    const normalizedName = normalizeLabel(nameRaw);
    buildNormalizationIssue(
      issues,
      sourceFileName,
      sheet.name,
      curseRow.rowNumber,
      'B',
      nameRaw,
      normalizedName.displayText,
      `cards[curse-${normalizedName.slug}].name`
    );

    const cardDefinitionId = `curse-${normalizedName.slug}`;
    const costRaw = cellText(costRow, 2);

    cards.push({
      cardDefinitionId,
      packId,
      deckId,
      kind: 'curse',
      subtype: 'challenge',
      name: normalizedName.displayText,
      shortName: normalizedName.displayText,
      description: applyWorkbookCorrections(descriptionRaw),
      automationLevel: 'manual',
      castingCost: costRaw ? [createGeneratedRequirement(applyWorkbookCorrections(costRaw), costRaw)] : [],
      effects: [
        {
          effectType: 'curse_challenge',
          description: applyWorkbookCorrections(descriptionRaw),
          automationLevel: 'manual',
          rawText: descriptionRaw,
          payload: {
            order: collapseLineBreaks(orderRaw)
          }
        }
      ],
      rewardsOrPenalties: [],
      requirements: {
        requiresManualApproval: true
      },
      visibilityPolicy: HIDER_DECK_VISIBILITY,
      tags: ['curse', 'manual-resolution'],
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, curseRow.rowNumber, 'B', nameRaw, orderRaw),
        sourceProvenance(sourceFileName, sheet.name, curseRow.rowNumber, 'C', descriptionRaw, nameRaw),
        sourceProvenance(sourceFileName, sheet.name, costRow.rowNumber, 'C', costRaw ?? null, 'Casting Cost')
      ]
    });

    entries.push({
      cardDefinitionId,
      quantity: 1,
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, curseRow.rowNumber, 'A', orderRaw, nameRaw)
      ]
    });
  }

  return { cards, entries };
}

function buildDeckDefinition(
  sourceFileName: string,
  packId: string,
  deckSheet: WorkbookSheet,
  cards: CardDefinition[],
  entries: DeckDefinition['entries']
): DeckDefinition {
  const timeBonusCount = entries
    .filter((entry) => entry.cardDefinitionId.startsWith('time-bonus-'))
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const powerUpCount = entries
    .filter((entry) => entry.cardDefinitionId.startsWith('power-up-'))
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const curseCount = entries
    .filter((entry) => entry.cardDefinitionId.startsWith('curse-'))
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const blankCount = entries
    .filter((entry) => entry.cardDefinitionId === 'blank-card')
    .reduce((sum, entry) => sum + entry.quantity, 0);

  return {
    deckId: 'hider-main',
    packId,
    name: 'Hider Main Deck',
    ownerScope: 'hider_team',
    drawPolicy: {
      shuffleOnCreate: true,
      reshuffleDiscardIntoDraw: false
    },
    visibilityPolicy: HIDER_DECK_VISIBILITY,
    entries,
    summary: {
      expectedTimeBonusCount: timeBonusCount,
      expectedPowerUpCount: powerUpCount,
      expectedCurseCount: curseCount,
      expectedBlankCount: blankCount,
      expectedTotalCards: entries.reduce((sum, entry) => sum + entry.quantity, 0),
      cardDefinitionCount: cards.length
    },
    sourceProvenance: deckSheet.rows
      .filter((row) => rowHasValues(row))
      .map((row) =>
        sourceProvenance(sourceFileName, deckSheet.name, row.rowNumber, 'row', collapseLineBreaks(JSON.stringify(row.values)))
      )
  };
}

function buildCategory(
  sourceFileName: string,
  packId: string,
  sheet: WorkbookSheet,
  categoryId: string,
  resolverKind: QuestionCategoryDefinition['resolverKind'],
  rawName: string,
  rawDrawRule: string,
  rawTimer: string,
  promptTemplate: string,
  scaleSet: ScaleSet,
  defaultAnswerSchema: Record<string, unknown>,
  defaultConstraintRefs: string[]
): QuestionCategoryDefinition {
  const drawRule = parseDrawRule(rawDrawRule);
  const timer = parseFixedMinutes(rawTimer);

  if (!drawRule || !timer) {
    throw new Error(`Unable to parse category header for ${sheet.name}`);
  }

  return {
    categoryId,
    packId,
    name: rawName,
    resolverKind,
    promptTemplate: applyWorkbookCorrections(promptTemplate),
    drawRule,
    defaultTimerPolicy: {
      kind: 'fixed',
      durationSeconds: timer.seconds,
      pauseBehavior: 'freeze',
      extensionPolicy: 'manual_only'
    },
    defaultAnswerSchema,
    visibilityPolicy: PUBLIC_VISIBILITY,
    scaleSet,
    defaultConstraintRefs,
    sourceProvenance: [
      sourceProvenance(sourceFileName, sheet.name, 1, 'A', rawName, rawName),
      sourceProvenance(sourceFileName, sheet.name, 2, 'B', rawDrawRule, 'Cost'),
      sourceProvenance(sourceFileName, sheet.name, 3, 'B', rawTimer, 'Time'),
      sourceProvenance(sourceFileName, sheet.name, 4, 'B', promptTemplate, 'Question')
    ]
  };
}

function buildMatchingTemplates(
  sourceFileName: string,
  packId: string,
  sheet: WorkbookSheet,
  taxonomyById: Map<string, FeatureTaxonomyEntry>,
  issues: ImportIssue[]
): { category: QuestionCategoryDefinition; templates: QuestionTemplateDefinition[] } {
  const category = buildCategory(
    sourceFileName,
    packId,
    sheet,
    'matching',
    'nearest_feature_match',
    'Matching',
    cellText(sheet.rows[1], 1) ?? 'Draw 3, Pick 1',
    cellText(sheet.rows[2], 1) ?? '5 Minutes',
    cellText(sheet.rows[3], 1) ?? 'Is your nearest _____ the same as my nearest _____?',
    allScales(),
    {
      kind: 'boolean',
      allowedValues: ['yes', 'no']
    },
    ['nearest-feature-match']
  );

  const templates: QuestionTemplateDefinition[] = [];

  for (const row of sheet.rows) {
    const rawLabel = cellText(row, 0);
    if (!rawLabel || row.rowNumber < 6) {
      continue;
    }

    const normalized = normalizeLabel(rawLabel);
    const featureClassId = registerFeatureTaxonomy(taxonomyById, rawLabel, sourceFileName, sheet.name, row.rowNumber);
    buildNormalizationIssue(
      issues,
      sourceFileName,
      sheet.name,
      row.rowNumber,
      'A',
      rawLabel,
      normalized.displayText,
      `questionTemplates[matching-${normalized.slug}].name`
    );

    const constraintRefs = featureClassId.includes('admin')
      ? ['same-admin-region']
      : ['nearest-feature-match'];

    templates.push({
      templateId: `matching-${normalized.slug}`,
      packId,
      categoryId: category.categoryId,
      name: normalized.displayText,
      featureClassRefs: [
        {
          featureClassId,
          label: normalized.displayText,
          rawLabel
        }
      ],
      parameters: {
        subjectLabel: normalized.displayText
      },
      answerSchema: {
        kind: 'boolean',
        allowedValues: ['yes', 'no']
      },
      resolverConfig: {
        compareMode: featureClassId.includes('admin') ? 'metadata' : 'nearest_feature'
      },
      constraintRefs,
      scaleSet: allScales(),
      visibilityPolicy: PUBLIC_VISIBILITY,
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'A', rawLabel, rawLabel)
      ]
    });
  }

  return { category, templates };
}

function buildMeasuringTemplates(
  sourceFileName: string,
  packId: string,
  sheet: WorkbookSheet,
  taxonomyById: Map<string, FeatureTaxonomyEntry>,
  issues: ImportIssue[]
): { category: QuestionCategoryDefinition; templates: QuestionTemplateDefinition[] } {
  const category = buildCategory(
    sourceFileName,
    packId,
    sheet,
    'measuring',
    'comparative_distance',
    'Measuring',
    cellText(sheet.rows[1], 1) ?? 'Draw 3, Pick 1',
    cellText(sheet.rows[2], 1) ?? '5 Minutes',
    cellText(sheet.rows[3], 1) ?? 'Compared to me, are you closer to or further from _____?',
    allScales(),
    {
      kind: 'enum',
      allowedValues: ['closer', 'further', 'same']
    },
    ['comparative-distance']
  );

  const templates: QuestionTemplateDefinition[] = [];

  for (const row of sheet.rows) {
    const rawLabel = cellText(row, 0);
    if (!rawLabel || row.rowNumber < 6) {
      continue;
    }

    const normalized = normalizeLabel(rawLabel);
    const featureClassId = registerFeatureTaxonomy(taxonomyById, rawLabel, sourceFileName, sheet.name, row.rowNumber);
    buildNormalizationIssue(
      issues,
      sourceFileName,
      sheet.name,
      row.rowNumber,
      'A',
      rawLabel,
      normalized.displayText,
      `questionTemplates[measuring-${normalized.slug}].name`
    );

    templates.push({
      templateId: `measuring-${normalized.slug}`,
      packId,
      categoryId: category.categoryId,
      name: normalized.displayText,
      featureClassRefs: [
        {
          featureClassId,
          label: normalized.displayText,
          rawLabel
        }
      ],
      parameters: {
        subjectLabel: normalized.displayText
      },
      answerSchema: {
        kind: 'enum',
        allowedValues: ['closer', 'further', 'same']
      },
      resolverConfig: {
        comparisonTarget: featureClassId
      },
      constraintRefs: ['comparative-distance'],
      scaleSet: allScales(),
      visibilityPolicy: PUBLIC_VISIBILITY,
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'A', rawLabel, rawLabel)
      ]
    });
  }

  return { category, templates };
}

function buildThermometerTemplates(
  sourceFileName: string,
  packId: string,
  sheet: WorkbookSheet,
  issues: ImportIssue[]
): { category: QuestionCategoryDefinition; templates: QuestionTemplateDefinition[] } {
  const category = buildCategory(
    sourceFileName,
    packId,
    sheet,
    'thermometer',
    'hotter_colder',
    'Thermometer',
    cellText(sheet.rows[1], 1) ?? 'Draw 2, Pick 1',
    cellText(sheet.rows[2], 1) ?? '5 Minutes',
    cellText(sheet.rows[3], 1) ?? 'I just traveled (at least) [Distance]. Am I hotter or colder?',
    allScales(),
    {
      kind: 'enum',
      allowedValues: ['hotter', 'colder', 'same']
    },
    ['hotter-colder']
  );

  let currentScaleSet = allScales();
  const templates: QuestionTemplateDefinition[] = [];

  for (const row of sheet.rows) {
    const rawValue = cellText(row, 0);
    if (!rawValue || row.rowNumber < 7) {
      continue;
    }

    const scaleGate = normalizeScaleGate(rawValue);
    if (scaleGate) {
      currentScaleSet = scaleGate;
      continue;
    }

    const distance = parseDistanceValue(rawValue);
    if (!distance) {
      issues.push(
        createIssue({
          sheetName: sheet.name,
          rowNumber: row.rowNumber,
          columnName: 'A',
          fieldPath: 'questionTemplates[].parameters.minimumDistance',
          severity: 'error',
          code: 'DISTANCE_PARSE_FAILED',
          message: 'Could not parse the thermometer distance value.',
          rawValue,
          normalizedValue: null,
          suggestedFix: 'Use a distance row with miles and/or metric values.',
          sheetCell: `A${row.rowNumber}`,
          blocking: true
        })
      );
      continue;
    }

    templates.push({
      templateId: `thermometer-${Math.round(distance.meters)}`,
      packId,
      categoryId: category.categoryId,
      name: collapseLineBreaks(rawValue),
      parameters: {
        minimumDistance: distance
      },
      answerSchema: {
        kind: 'enum',
        allowedValues: ['hotter', 'colder', 'same']
      },
      resolverConfig: {
        requiresSeekerMovementHistory: true
      },
      constraintRefs: ['hotter-colder'],
      scaleSet: currentScaleSet,
      visibilityPolicy: PUBLIC_VISIBILITY,
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'A', rawValue, rawValue)
      ]
    });
  }

  return { category, templates };
}

function buildRadarTemplates(
  sourceFileName: string,
  packId: string,
  sheet: WorkbookSheet,
  issues: ImportIssue[]
): { category: QuestionCategoryDefinition; templates: QuestionTemplateDefinition[] } {
  const category = buildCategory(
    sourceFileName,
    packId,
    sheet,
    'radar',
    'threshold_distance',
    'Radar',
    cellText(sheet.rows[1], 1) ?? 'Draw 2, Pick 1',
    cellText(sheet.rows[2], 1) ?? '5 Minutes',
    cellText(sheet.rows[3], 1) ?? 'Are you within [Distance] of me?',
    allScales(),
    {
      kind: 'boolean',
      allowedValues: ['yes', 'no']
    },
    ['within-radius', 'outside-radius']
  );

  const templates: QuestionTemplateDefinition[] = [];

  for (const row of sheet.rows) {
    const rawValue = cellText(row, 0);
    if (!rawValue || row.rowNumber < 7) {
      continue;
    }

    if (collapseLineBreaks(rawValue).toLowerCase() === 'choose') {
      templates.push({
        templateId: 'radar-choose',
        packId,
        categoryId: category.categoryId,
        name: 'Choose Distance',
        parameters: {
          distanceMode: 'manual-choice'
        },
        answerSchema: {
          kind: 'boolean',
          allowedValues: ['yes', 'no']
        },
        resolverConfig: {
          requiresRulesetDefinedChoiceBounds: true
        },
        constraintRefs: ['within-radius', 'outside-radius'],
        scaleSet: allScales(),
        visibilityPolicy: PUBLIC_VISIBILITY,
        sourceProvenance: [
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'A', rawValue, rawValue)
        ]
      });

      issues.push(
        createIssue({
          sheetName: sheet.name,
          rowNumber: row.rowNumber,
          columnName: 'A',
          fieldPath: 'questionTemplates[radar-choose].parameters.distanceMode',
          severity: 'warning',
          code: 'AMBIGUOUS_MANUAL_TEMPLATE',
          message: 'The workbook includes a `Choose` radar row without bounded choice rules.',
          rawValue,
          normalizedValue: 'manual-choice',
          suggestedFix: 'Provide a ruleset or editor-authored bounded distance policy before publishing.',
          sheetCell: `A${row.rowNumber}`,
          blocking: true
        })
      );

      continue;
    }

    const distance = parseDistanceValue(rawValue);
    if (!distance) {
      issues.push(
        createIssue({
          sheetName: sheet.name,
          rowNumber: row.rowNumber,
          columnName: 'A',
          fieldPath: 'questionTemplates[].parameters.distanceThreshold',
          severity: 'error',
          code: 'DISTANCE_PARSE_FAILED',
          message: 'Could not parse the radar distance value.',
          rawValue,
          normalizedValue: null,
          suggestedFix: 'Use a distance row with miles and/or metric values.',
          sheetCell: `A${row.rowNumber}`,
          blocking: true
        })
      );
      continue;
    }

    templates.push({
      templateId: `radar-${Math.round(distance.meters)}`,
      packId,
      categoryId: category.categoryId,
      name: collapseLineBreaks(rawValue),
      parameters: {
        distanceThreshold: distance
      },
      answerSchema: {
        kind: 'boolean',
        allowedValues: ['yes', 'no']
      },
      resolverConfig: {
        thresholdMeters: distance.meters
      },
      constraintRefs: ['within-radius', 'outside-radius'],
      scaleSet: allScales(),
      visibilityPolicy: PUBLIC_VISIBILITY,
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'A', rawValue, rawValue)
      ]
    });
  }

  return { category, templates };
}

function buildTentaclesTemplates(
  sourceFileName: string,
  packId: string,
  sheet: WorkbookSheet,
  taxonomyById: Map<string, FeatureTaxonomyEntry>,
  issues: ImportIssue[]
): { category: QuestionCategoryDefinition; templates: QuestionTemplateDefinition[] } {
  const category = {
    categoryId: 'tentacles',
    packId,
    name: 'Tentacles',
    resolverKind: 'nearest_candidate' as const,
    promptTemplate: applyWorkbookCorrections(cellText(sheet.rows[3], 2) ?? 'Of all the [Places] within [Distance] of me, which are you closest to?'),
    drawRule: parseDrawRule(cellText(sheet.rows[1], 2) ?? 'Draw 4, Pick 2') ?? {
      drawCount: 4,
      pickCount: 2,
      rawText: 'Draw 4, Pick 2'
    },
    defaultTimerPolicy: {
      kind: 'fixed',
      durationSeconds: (parseFixedMinutes(cellText(sheet.rows[2], 2) ?? '5 Minutes') as TimeValue).seconds,
      pauseBehavior: 'freeze',
      extensionPolicy: 'manual_only'
    },
    defaultAnswerSchema: {
      kind: 'feature_choice'
    },
    visibilityPolicy: PUBLIC_VISIBILITY,
    scaleSet: allScales(),
    defaultConstraintRefs: ['nearest-candidate-feature'],
    sourceProvenance: [
      sourceProvenance(sourceFileName, sheet.name, 1, 'A', 'Tentacles', 'Tentacles'),
      sourceProvenance(sourceFileName, sheet.name, 2, 'C', cellText(sheet.rows[1], 2), 'Cost'),
      sourceProvenance(sourceFileName, sheet.name, 3, 'C', cellText(sheet.rows[2], 2), 'Time'),
      sourceProvenance(sourceFileName, sheet.name, 4, 'C', cellText(sheet.rows[3], 2), 'Question')
    ]
  } satisfies QuestionCategoryDefinition;

  let currentScaleSet = allScales();
  const templates: QuestionTemplateDefinition[] = [];

  for (const row of sheet.rows) {
    const rawPlace = cellText(row, 0);
    const rawDistance = cellText(row, 1);
    if (!rawPlace || row.rowNumber < 7) {
      continue;
    }

    const scaleGate = normalizeScaleGate(rawPlace);
    if (scaleGate) {
      currentScaleSet = scaleGate;
      continue;
    }

    if (!rawDistance) {
      continue;
    }

    const normalizedPlace = normalizeLabel(rawPlace);
    const distance = parseDistanceValue(rawDistance);

    if (!distance) {
      issues.push(
        createIssue({
          sheetName: sheet.name,
          rowNumber: row.rowNumber,
          columnName: 'B',
          fieldPath: 'questionTemplates[].parameters.distanceThreshold',
          severity: 'error',
          code: 'DISTANCE_PARSE_FAILED',
          message: 'Could not parse the Tentacles distance value.',
          rawValue: rawDistance,
          normalizedValue: null,
          suggestedFix: 'Use a distance value with miles and/or metric text.',
          sheetCell: `B${row.rowNumber}`,
          blocking: true
        })
      );
      continue;
    }

    const featureClassId = registerFeatureTaxonomy(taxonomyById, rawPlace, sourceFileName, sheet.name, row.rowNumber);
    buildNormalizationIssue(
      issues,
      sourceFileName,
      sheet.name,
      row.rowNumber,
      'A',
      rawPlace,
      normalizedPlace.displayText,
      `questionTemplates[tentacles-${normalizedPlace.slug}-${Math.round(distance.meters)}].name`
    );

    templates.push({
      templateId: `tentacles-${normalizedPlace.slug}-${Math.round(distance.meters)}`,
      packId,
      categoryId: category.categoryId,
      name: `${normalizedPlace.displayText} within ${Math.round(distance.meters)}m`,
      featureClassRefs: [
        {
          featureClassId,
          label: normalizedPlace.displayText,
          rawLabel: rawPlace
        }
      ],
      parameters: {
        placeLabel: normalizedPlace.displayText,
        distanceThreshold: distance
      },
      answerSchema: {
        kind: 'feature_choice'
      },
      resolverConfig: {
        candidateSource: 'nearby_features'
      },
      constraintRefs: ['nearest-candidate-feature'],
      scaleSet: currentScaleSet,
      visibilityPolicy: PUBLIC_VISIBILITY,
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'A', rawPlace, rawPlace),
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'B', rawDistance, rawPlace)
      ]
    });
  }

  return { category, templates };
}

function buildPhotosTemplates(
  sourceFileName: string,
  packId: string,
  sheet: WorkbookSheet,
  issues: ImportIssue[]
): { category: QuestionCategoryDefinition; templates: QuestionTemplateDefinition[] } {
  const timerByScale = parseScaleAwareMinutes(cellText(sheet.rows[2], 1) ?? 'S/M: 10 Minutes L: 20 Minutes');

  if (!timerByScale) {
    throw new Error('Unable to parse Photos timer policy.');
  }

  const titleCell = cellText(sheet.rows[0], 0);
  if (titleCell && collapseLineBreaks(titleCell) !== 'Photos') {
    issues.push(
      createIssue({
        sheetName: sheet.name,
        rowNumber: 1,
        columnName: 'A',
        fieldPath: 'questionCategories[photos].name',
        severity: 'warning',
        code: 'SHEET_TITLE_MISMATCH',
        message: 'The Photos sheet title cell does not match the sheet purpose.',
        rawValue: titleCell,
        normalizedValue: 'Photos',
        suggestedFix: 'Keep the canonical category name as `Photos` and preserve the raw title in provenance.',
        sheetCell: 'A1'
      })
    );
  }

  const category: QuestionCategoryDefinition = {
    categoryId: 'photos',
    packId,
    name: 'Photos',
    resolverKind: 'photo_challenge',
    promptTemplate: applyWorkbookCorrections(cellText(sheet.rows[3], 1) ?? 'Send a photo of [subject].'),
    drawRule: parseDrawRule(cellText(sheet.rows[1], 1) ?? 'Draw 1') ?? {
      drawCount: 1,
      pickCount: 1,
      rawText: 'Draw 1'
    },
    defaultTimerPolicy: {
      kind: 'by_scale',
      durationSecondsByScale: timerByScale,
      pauseBehavior: 'freeze',
      extensionPolicy: 'manual_only'
    },
    defaultAnswerSchema: {
      kind: 'attachment',
      minAttachments: 1
    },
    visibilityPolicy: PHOTO_VISIBILITY,
    scaleSet: allScales(),
    defaultConstraintRefs: ['photo-evidence', 'manual-review-only'],
    sourceProvenance: [
      sourceProvenance(sourceFileName, sheet.name, 1, 'A', titleCell, titleCell),
      sourceProvenance(sourceFileName, sheet.name, 2, 'B', cellText(sheet.rows[1], 1), 'Cost'),
      sourceProvenance(sourceFileName, sheet.name, 3, 'B', cellText(sheet.rows[2], 1), 'Time'),
      sourceProvenance(sourceFileName, sheet.name, 4, 'B', cellText(sheet.rows[3], 1), 'Question')
    ]
  };

  let currentScaleSet = allScales();
  const templates: QuestionTemplateDefinition[] = [];

  for (const row of sheet.rows) {
    const rawSubject = cellText(row, 0);
    if (!rawSubject || row.rowNumber < 7) {
      continue;
    }

    const scaleGate = normalizeScaleGate(rawSubject);
    if (scaleGate) {
      currentScaleSet = scaleGate;
      continue;
    }

    const rawRequirements = cellText(row, 1);
    const normalizedSubject = normalizeLabel(rawSubject);
    buildNormalizationIssue(
      issues,
      sourceFileName,
      sheet.name,
      row.rowNumber,
      'A',
      rawSubject,
      normalizedSubject.displayText,
      `questionTemplates[photos-${normalizedSubject.slug}].name`
    );

    const requirements: RequirementDefinition[] = [
      {
        requirementType: 'photo',
        description: 'Provide at least one photo attachment.',
        rawText: rawRequirements
      },
      {
        requirementType: 'manual_approval',
        description: applyWorkbookCorrections(rawRequirements ?? 'Manual review required.'),
        rawText: rawRequirements
      }
    ];

    templates.push({
      templateId: `photos-${normalizedSubject.slug}`,
      packId,
      categoryId: category.categoryId,
      name: normalizedSubject.displayText,
      parameters: {
        subject: normalizedSubject.displayText
      },
      answerSchema: {
        kind: 'attachment',
        minAttachments: 1
      },
      resolverConfig: {
        requiresManualApproval: true
      },
      constraintRefs: ['photo-evidence', 'manual-review-only'],
      requirements,
      scaleSet: currentScaleSet,
      visibilityPolicy: PHOTO_VISIBILITY,
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'A', rawSubject, rawSubject),
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'B', rawRequirements, rawSubject)
      ]
    });
  }

  return { category, templates };
}

export function looksLikeJetLagWorkbook(document: WorkbookDocument): boolean {
  return EXPECTED_SHEETS.every((sheetName) => document.sheets.some((sheet) => sheet.name === sheetName));
}

export function mapJetLagWorkbookToContentPack(
  document: WorkbookDocument
): { pack: ContentPack; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const sourceFileName = document.sourceFileName;
  const packId = 'jet-lag-the-game-seed';

  const deckSheet = getSheet(document, 'Hider Deck');
  const cursesSheet = getSheet(document, '💀Curses');
  const matchingSheet = getSheet(document, '1. Matching');
  const measuringSheet = getSheet(document, '2. Measuring');
  const thermometerSheet = getSheet(document, '3. Thermometer');
  const radarSheet = getSheet(document, '4. Radar');
  const tentaclesSheet = getSheet(document, '5. Tentacles');
  const photosSheet = getSheet(document, '6. Photos');

  const featureTaxonomy = new Map<string, FeatureTaxonomyEntry>();

  const timeBonus = buildTimeBonusCards(sourceFileName, packId, 'hider-main', deckSheet, issues);
  const powerUps = buildPowerUpCards(sourceFileName, packId, 'hider-main', deckSheet, issues);
  const blankCard = buildBlankCard(sourceFileName, packId, 'hider-main', deckSheet);
  const curses = buildCurseCards(sourceFileName, packId, 'hider-main', cursesSheet, issues);

  const cards = [
    ...timeBonus.cards,
    ...powerUps.cards,
    ...curses.cards,
    blankCard.card
  ];

  const deckEntries = [
    ...timeBonus.entries,
    ...powerUps.entries,
    ...curses.entries,
    blankCard.entry
  ];

  const deck = buildDeckDefinition(sourceFileName, packId, deckSheet, cards, deckEntries);

  const matching = buildMatchingTemplates(sourceFileName, packId, matchingSheet, featureTaxonomy, issues);
  const measuring = buildMeasuringTemplates(sourceFileName, packId, measuringSheet, featureTaxonomy, issues);
  const thermometer = buildThermometerTemplates(sourceFileName, packId, thermometerSheet, issues);
  const radar = buildRadarTemplates(sourceFileName, packId, radarSheet, issues);
  const tentacles = buildTentaclesTemplates(sourceFileName, packId, tentaclesSheet, featureTaxonomy, issues);
  const photos = buildPhotosTemplates(sourceFileName, packId, photosSheet, issues);

  const questionCategories = [
    matching.category,
    measuring.category,
    thermometer.category,
    radar.category,
    tentacles.category,
    photos.category
  ];

  const questionTemplates = [
    ...matching.templates,
    ...measuring.templates,
    ...thermometer.templates,
    ...radar.templates,
    ...tentacles.templates,
    ...photos.templates
  ];

  const unmappedSheets = document.sheets
    .map((sheet) => sheet.name)
    .filter((sheetName) => !EXPECTED_SHEETS.includes(sheetName) || sheetName === 'Form Responses 1');

  if (unmappedSheets.includes('Form Responses 1')) {
    issues.push(
      createIssue({
        sheetName: 'Form Responses 1',
        rowNumber: 1,
        columnName: 'A',
        fieldPath: 'provenance.unmappedSheets',
        severity: 'info',
        code: 'UNKNOWN_SHEET',
        message: 'The workbook contains a non-content sheet that is preserved only in provenance.',
        rawValue: 'Form Responses 1',
        normalizedValue: 'provenance.unmappedSheets',
        suggestedFix: 'No action required unless a future mapping profile uses this sheet.',
        sheetCell: 'A1'
      })
    );
  }

  const pack: ContentPack = {
    schemaVersion: '1.0.0',
    packId,
    packVersion: '0.1.0',
    title: 'Jet Lag The Game Workbook Import',
    summary: 'Draft canonical content pack imported from the provided workbook seed.',
    status: 'draft',
    sourceFingerprint: '',
    importerVersion: '',
    mappingProfileId: JET_LAG_MAPPING_PROFILE_ID,
    provenance: {
      sourceType: 'xlsx',
      sourceFileName,
      importedAt: new Date().toISOString(),
      sourceSheets: document.sheets.map((sheet) => sheet.name),
      unmappedSheets,
      normalizationWarnings: []
    },
    rulesets: [],
    decks: [deck],
    cards,
    questionCategories,
    questionTemplates,
    mapPresets: [],
    constraints: buildConstraintDefinitions(packId, sourceFileName),
    featureTaxonomy: [...featureTaxonomy.values()].sort((left, right) =>
      left.featureClassId.localeCompare(right.featureClassId)
    ),
    compatibility: {
      supportedModes: ['online', 'local_nearby', 'single_device_referee'],
      supportsDraftPlaceholders: true,
      requiresFeatureDatasets: true
    }
  };

  pack.provenance.normalizationWarnings = issues
    .filter((issue) => issue.code === 'NORMALIZATION_CORRECTION_APPLIED')
    .map((issue) => issue.message);

  return { pack, issues };
}
