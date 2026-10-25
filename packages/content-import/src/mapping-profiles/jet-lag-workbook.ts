import type {
  CardDefinition,
  ConstraintDefinition,
  ContentPack,
  DeckDefinition,
  FeatureTaxonomyEntry,
  ImportIssue,
  MapPresetDefinition,
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  RequirementDefinition,
  RulesetDefinition,
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

const LEGACY_EXPECTED_SHEETS = [
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

const CLEANED_EXPECTED_SHEETS = [
  'Hider Deck',
  'Curses',
  'Matching',
  'Measuring',
  'Thermometer',
  'Radar',
  'Tentacles',
  'Photos'
];

function buildBaseRuleset(packId: string): RulesetDefinition {
  return {
    rulesetId: 'jet-lag-home-game-base',
    packId,
    name: 'Home Game — Base Rules',
    description: 'Base Hide + Seek rules encoded from the scanned rulebook and Investigation Book.',
    supportedModes: ['online', 'local_nearby', 'single_device_referee'],
    scaleDefinitions: [
      { scale: 'small', label: 'Small' },
      { scale: 'medium', label: 'Medium' },
      { scale: 'large', label: 'Large' }
    ],
    phasePolicies: {
      hidePhaseDurationSecondsByScale: { small: 30 * 60, medium: 60 * 60, large: 180 * 60 },
      nextHiderPreparationSeconds: 10 * 60
    },
    questionPolicies: {
      cooldownSeconds: 0,
      answerWindowSeconds: 5 * 60,
      photoAnswerWindowSecondsByScale: { small: 10 * 60, medium: 10 * 60, large: 20 * 60 },
      allowQuestionRepeats: true,
      repeatRewardGroupsAreSeparate: true
    },
    cardPolicies: {
      stackManualResolutionWindows: false,
      maximumHandSize: 6
    },
    locationPolicies: {
      requireStationCenteredZone: true,
      hiderMustConfirmArrivalAtZoneStation: true,
      hidingZoneRadiusMetersByScale: { small: 500, medium: 500, large: 1000 },
      finalHidingSpotPathProximityMeters: 3,
      foundDistanceMeters: 2,
      foundRequiresVisualConfirmation: true,
      endgameRequiresOffTransit: true
    },
    chatPolicies: {},
    visibilityPolicies: {},
    winConditions: [],
    sourceProvenance: [
      {
        sourceType: 'generated',
        sourceFileName: '2026-10-04 10-19.pdf',
        notes: 'Base rulebook scan; hide periods and round rules from pp. 5–6, hiding zone and endgame rules from pp. 16–18.'
      },
      {
        sourceType: 'generated',
        sourceFileName: '2026-10-04-10-56.pdf',
        notes: 'Investigation Book scan; question response windows and scale-specific Photo timing.'
      }
    ]
  };
}

function buildBaseMapPreset(packId: string): MapPresetDefinition {
  return {
    mapPresetId: 'jet-lag-host-selected-city',
    packId,
    name: 'Host-selected play area',
    description: 'The host searches and composes an administrative boundary before play.',
    geometry: {
      kind: 'host_selected_administrative_boundary',
      allowedRegionKinds: ['city', 'admin_region', 'custom']
    },
    featureDatasetRefs: ['osm-admin-boundaries', 'osm-transit-stations', 'osm-question-features'],
    layerPolicies: {
      showPlayableBoundary: true,
      showTransitStations: true,
      showQuestionConstraints: true
    },
    locationPrecisionPolicy: {
      automaticAnswersRequireFreshSamples: true,
      hiderCoordinatesHiddenFromSeekers: true,
      seekerLocationsSharedWithHiders: true
    },
    sourceProvenance: [
      {
        sourceType: 'generated',
        sourceFileName: 'apps/mobile/src/features/map/osm-region-provider.ts',
        notes: 'Host-selected boundary geometry follows the approved searchable-region setup workflow.'
      }
    ]
  };
}

const SHEET_ALIASES = {
  hiderDeck: ['Hider Deck'],
  curses: ['Curses', '💀Curses'],
  matching: ['Matching', '1. Matching'],
  measuring: ['Measuring', '2. Measuring'],
  thermometer: ['Thermometer', '3. Thermometer'],
  radar: ['Radar', '4. Radar'],
  tentacles: ['Tentacles', '5. Tentacles'],
  photos: ['Photos', '6. Photos']
} as const;

const PUBLIC_VISIBILITY: VisibilityPolicyRef = {
  visibleTo: ['authority', 'host_admin', 'public_match']
};

const HIDER_DECK_VISIBILITY: VisibilityPolicyRef = {
  visibleTo: ['authority', 'host_admin', 'team_private']
};

// The workbook includes this extra Measuring target, but the scanned base
// Investigation Book lists only international, 1st-division, and 2nd-division
// borders. Keep it out of the standard pack and report the source discrepancy.
const NON_BASE_BOOK_MEASURING_TARGETS = new Set(['4th-admin-borough']);

function reportExcludedMeasuringTarget(args: {
  normalizedSlug: string;
  displayText: string;
  rawLabel: string;
  sheetName: string;
  rowNumber: number;
  columnName: string;
  issues: ImportIssue[];
}): boolean {
  if (!NON_BASE_BOOK_MEASURING_TARGETS.has(args.normalizedSlug)) {
    return false;
  }

  args.issues.push(createIssue({
    sheetName: args.sheetName,
    rowNumber: args.rowNumber,
    columnName: args.columnName,
    fieldPath: 'questionTemplates',
    severity: 'info',
    code: 'QUESTION_NOT_IN_PRINTED_BOOK',
    message: `${args.displayText} appears in the workbook but not in the scanned Investigation Book's Measuring list, so it was excluded from the base-game pack.`,
    rawValue: args.rawLabel,
    normalizedValue: null,
    suggestedFix: 'Keep this question only in a separate variant pack if it is intentionally part of that variant.'
  }));
  return true;
}

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

function getSheetByAliases(document: WorkbookDocument, aliases: readonly string[]): WorkbookSheet {
  const sheet = document.sheets.find((candidate) => aliases.includes(candidate.name));

  if (!sheet) {
    throw new Error(`Missing expected sheet: ${aliases.join(' or ')}`);
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
      inputSchema: { answerType: 'enum', values: ['closer', 'further'] },
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

function normalizeHeader(value: string | number | boolean | null): string {
  if (value === null || value === undefined) {
    return '';
  }

  return collapseLineBreaks(String(value)).toLowerCase();
}

function buildHeaderIndex(sheet: WorkbookSheet): Map<string, number> {
  const headerRow = sheet.rows.find((row) => rowHasValues(row));
  const entries = (headerRow?.values ?? []).map((value, index) => [normalizeHeader(value), index] as const);

  return new Map(entries.filter(([header]) => header.length > 0));
}

function sheetHasHeaders(sheet: WorkbookSheet, headers: string[]): boolean {
  const index = buildHeaderIndex(sheet);
  return headers.every((header) => index.has(normalizeHeader(header)));
}

function tableCellText(
  row: WorkbookRow,
  headerIndex: Map<string, number>,
  header: string
): string | null {
  const index = headerIndex.get(normalizeHeader(header));
  return index === undefined ? null : cellText(row, index);
}

function tableCellNumber(
  row: WorkbookRow,
  headerIndex: Map<string, number>,
  header: string
): number | null {
  const index = headerIndex.get(normalizeHeader(header));
  const value = index === undefined ? null : cellValue(row, index);
  return typeof value === 'number' ? value : null;
}

function dataRowsAfterHeader(sheet: WorkbookSheet): WorkbookRow[] {
  const headerRow = sheet.rows.find((row) => rowHasValues(row));

  if (!headerRow) {
    return [];
  }

  return sheet.rows.filter((row) => row.rowNumber > headerRow.rowNumber && rowHasValues(row));
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

function workbookQuestionParameters(args: {
  question?: string | null;
  cost?: string | null;
  time?: string | null;
  availability?: string | null;
  requirements?: string | null;
  values?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...(args.values ?? {}),
    ...(args.question ? { workbookQuestionText: applyWorkbookCorrections(args.question) } : {}),
    ...(args.cost ? { workbookCostText: collapseLineBreaks(args.cost) } : {}),
    ...(args.time ? { workbookTimeText: collapseLineBreaks(args.time) } : {}),
    ...(args.availability ? { workbookAvailabilityText: collapseLineBreaks(args.availability) } : {}),
    ...(args.requirements ? { workbookRequirementsText: applyWorkbookCorrections(args.requirements) } : {})
  };
}

function buildTimeBonusCards(
  sourceFileName: string,
  packId: string,
  deckId: string,
  sheet: WorkbookSheet,
  issues: ImportIssue[]
): { cards: CardDefinition[]; entries: DeckDefinition['entries'] } {
  if (sheetHasHeaders(sheet, ['category', 'card', 'quantity', 'odds'])) {
    const headerIndex = buildHeaderIndex(sheet);
    const cards: CardDefinition[] = [];
    const entries: DeckDefinition['entries'] = [];

    for (const row of dataRowsAfterHeader(sheet)) {
      const categoryLabel = tableCellText(row, headerIndex, 'category');
      const label = tableCellText(row, headerIndex, 'card');
      const quantityValue = tableCellNumber(row, headerIndex, 'quantity');
      const oddsValue = tableCellNumber(row, headerIndex, 'odds');

      if (!label || typeof quantityValue !== 'number' || categoryLabel !== 'Time Bonus') {
        continue;
      }

      const colorRaw = label.replace(/\s+\d.*$/, '').trim() || label;
      const minutesByScale = parseScaleMinutes(label);

      if (!minutesByScale) {
        issues.push(
          createIssue({
            sheetName: sheet.name,
            rowNumber: row.rowNumber,
            columnName: 'card',
            fieldPath: 'cards[].effects[].payload.minutesByScale',
            severity: 'error',
            code: 'TIME_BONUS_PARSE_FAILED',
            message: 'Could not parse the scale-specific time bonus values.',
            rawValue: label,
            normalizedValue: null,
            suggestedFix: 'Keep the card text in the format `Color Xm, Ym, Zm`.',
            sheetCell: `B${row.rowNumber}`,
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
        'card',
        colorRaw,
        normalizedColor.displayText,
        `cards[time-bonus-${normalizedColor.slug}].shortName`
      );

      const cardDefinitionId = `time-bonus-${normalizedColor.slug}`;
      const minutesDescription = `Adds ${minutesByScale.small}/${minutesByScale.medium}/${minutesByScale.large} minutes in small/medium/large games.`;

      cards.push({
        cardDefinitionId,
        packId,
        deckId,
        kind: 'time_bonus',
        name: applyWorkbookCorrections(label),
        shortName: normalizedColor.displayText,
        description: minutesDescription,
        automationLevel: 'authoritative',
        effects: [
          {
            effectType: 'add_time_bonus',
            description: minutesDescription,
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
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'card', label, categoryLabel),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'odds', oddsValue, label)
        ]
      });

      entries.push({
        cardDefinitionId,
        quantity: quantityValue,
        weight: oddsValue ?? undefined,
        notes: oddsValue !== null ? `Workbook odds: ${oddsValue}` : undefined,
        sourceProvenance: [
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'quantity', quantityValue, label),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'odds', oddsValue, label)
        ]
      });
    }

    return { cards, entries };
  }

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
  const ruleForPowerUp = (label: string): {
    description: string;
    automationLevel: CardDefinition['automationLevel'];
    effect: CardDefinition['effects'][number];
    timingWindow?: CardDefinition['timingWindow'];
  } | undefined => {
    const normalized = normalizeLabel(label).displayText.toLowerCase();
    if (normalized === 'move') {
      const description = 'When played, establish a new hiding zone within 10 minutes in a Small game, 20 minutes in a Medium game, or 60 minutes in a Large game. Choose a new transit station as the center and use only valid transit. While you move, your hiding timer pauses and seekers must stay where they are and refrain from asking questions. When the move timer ends, play resumes and your hiding timer continues. Immediately discard your entire hand and tell the seekers your original transit station. Move cannot be played during the end game.';
      return {
        description,
        automationLevel: 'assisted',
        effect: {
          effectType: 'move_power_up',
          description,
          automationLevel: 'assisted',
          rawText: label,
          payload: { durationMinutesByScale: { small: 10, medium: 20, large: 60 } }
        },
        timingWindow: { allowedPhases: ['hide_phase', 'seek_phase'] }
      };
    }
    if (normalized === 'veto') {
      const description = 'Cancel the current question instead of answering. The question still counts as asked, but no card reward is drawn.';
      return { description, automationLevel: 'authoritative', effect: {
        effectType: 'veto_question', description, automationLevel: 'authoritative', rawText: label
      } };
    }
    if (normalized === 'randomize') {
      const description = 'Replace the current question with a random unasked question from the same category.';
      return { description, automationLevel: 'authoritative', effect: {
        effectType: 'randomize_question', description, automationLevel: 'authoritative', rawText: label
      } };
    }
    if (normalized === 'duplicate') {
      const description = 'Play as an exact copy of any other card currently in your hand, including curses, power-ups, and time bonuses; the original card stays in your hand and can be played later. If Duplicate remains in your hand at the end of the round, it copies a time bonus you still hold and doubles that bonus.';
      return {
        description,
        automationLevel: 'assisted',
        effect: {
          effectType: 'duplicate_card',
          description,
          automationLevel: 'assisted',
          rawText: label,
          payload: { preservesOriginal: true, copiesHeldTimeBonusAtCapture: true }
        }
      };
    }
    if (normalized === 'discard 1 draw 2' || normalized === 'discard 2 draw 3') {
      const discardCount = normalized === 'discard 1 draw 2' ? 1 : 2;
      const drawCount = discardCount + 1;
      const description = `Discard ${discardCount} card${discardCount === 1 ? '' : 's'} from your hand, then draw and keep ${drawCount} replacement cards.`;
      return {
        description,
        automationLevel: 'authoritative',
        effect: {
          effectType: 'discard_then_draw',
          description,
          automationLevel: 'authoritative',
          rawText: label,
          payload: { discardCount, drawCount }
        }
      };
    }
    if (normalized !== 'draw 1 expand 1') return undefined;
    const description = 'Draw and keep one card, then permanently increase your maximum hand size by one for this round.';
    return {
      description,
      automationLevel: 'authoritative',
      effect: {
        effectType: 'draw_and_expand_hand',
        description,
        automationLevel: 'authoritative',
        rawText: label,
        payload: { drawCount: 1, handSizeIncrease: 1 }
      }
    };
  };

  if (sheetHasHeaders(sheet, ['category', 'card', 'quantity', 'odds'])) {
    const headerIndex = buildHeaderIndex(sheet);
    const cards: CardDefinition[] = [];
    const entries: DeckDefinition['entries'] = [];

    for (const row of dataRowsAfterHeader(sheet)) {
      const categoryLabel = tableCellText(row, headerIndex, 'category');
      const label = tableCellText(row, headerIndex, 'card');
      const quantityValue = tableCellNumber(row, headerIndex, 'quantity');
      const oddsValue = tableCellNumber(row, headerIndex, 'odds');

      if (!label || typeof quantityValue !== 'number' || categoryLabel !== 'Power Ups') {
        continue;
      }

      const normalized = normalizeLabel(label);
      buildNormalizationIssue(
        issues,
        sourceFileName,
        sheet.name,
        row.rowNumber,
        'card',
        label,
        normalized.displayText,
        `cards[power-up-${normalized.slug}].name`
      );

      const cardDefinitionId = `power-up-${normalized.slug}`;
      const rule = ruleForPowerUp(label);
      const description = rule?.description ?? 'Effect text is not fully defined in the workbook. Resolve this power-up honestly using the active match rules.';

      cards.push({
        cardDefinitionId,
        packId,
        deckId,
        kind: 'power_up',
        name: normalized.displayText,
        shortName: normalized.displayText,
        description,
        automationLevel: rule?.automationLevel ?? 'manual',
        timingWindow: rule?.timingWindow,
        effects: [rule?.effect ?? {
          effectType: 'manual_power_up',
          description,
          automationLevel: 'manual',
          rawText: label
        }],
        visibilityPolicy: HIDER_DECK_VISIBILITY,
        tags: ['power-up'],
        sourceProvenance: [
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'card', label, categoryLabel),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'odds', oddsValue, label),
          ...(normalized.displayText.toLowerCase() === 'move'
            ? [
              generatedProvenance('Scanned base rulebook, page 26', 'Move procedure reconciled from the scan.'),
              generatedProvenance('https://jetlag.naenae.cat/', 'Move card transcription lists 10/20/60-minute durations for Small/Medium/Large; used to complete the timer values omitted from the scanned rulebook and source workbook.')
            ]
            : [])
        ]
      });

      entries.push({
        cardDefinitionId,
        quantity: quantityValue,
        weight: oddsValue ?? undefined,
        notes: oddsValue !== null ? `Workbook odds: ${oddsValue}` : undefined,
        sourceProvenance: [
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'quantity', quantityValue, label),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'odds', oddsValue, label)
        ]
      });

      if (!rule) issues.push(
        createIssue({
          sheetName: sheet.name,
          rowNumber: row.rowNumber,
          columnName: 'card',
          fieldPath: `cards[${cardDefinitionId}].description`,
          severity: 'warning',
          code: 'POWER_UP_EFFECT_UNSPECIFIED',
          message: 'The workbook provides a power-up name but no detailed effect text.',
          rawValue: label,
          normalizedValue: description,
          suggestedFix: 'Keep the imported card name and add authored effect details later if fuller automation is needed.',
          sheetCell: `B${row.rowNumber}`
        })
      );
    }

    return { cards, entries };
  }

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
    const rule = ruleForPowerUp(label);
    const description = rule?.description ?? 'Effect text is not defined in the workbook. Resolve using the active ruleset or a content editor.';

    cards.push({
      cardDefinitionId,
      packId,
      deckId,
      kind: 'power_up',
      name: normalized.displayText,
      shortName: normalized.displayText,
      description,
      automationLevel: rule?.automationLevel ?? 'manual',
      timingWindow: rule?.timingWindow,
      effects: [rule?.effect ?? {
        effectType: 'manual_power_up',
        description,
        automationLevel: 'manual',
        rawText: label
      }],
      visibilityPolicy: HIDER_DECK_VISIBILITY,
      tags: ['power-up'],
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'C', label, label),
        ...(normalized.displayText.toLowerCase() === 'move'
          ? [
            generatedProvenance('Scanned base rulebook, page 26', 'Move procedure reconciled from the scan.'),
            generatedProvenance('https://jetlag.naenae.cat/', 'Move card transcription lists 10/20/60-minute durations for Small/Medium/Large; used to complete the timer values omitted from the scanned rulebook and source workbook.')
          ]
          : [])
      ]
    });

    entries.push({
      cardDefinitionId,
      quantity: quantityValue,
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'D', quantityValue, label)
      ]
    });

    if (!rule) issues.push(
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
  if (sheetHasHeaders(sheet, ['category', 'card', 'quantity', 'odds'])) {
    const headerIndex = buildHeaderIndex(sheet);
    const blankRow = dataRowsAfterHeader(sheet).find((row) => tableCellText(row, headerIndex, 'category') === 'Blanks');
    const quantityValue = blankRow ? tableCellNumber(blankRow, headerIndex, 'quantity') : 0;
    const oddsValue = blankRow ? tableCellNumber(blankRow, headerIndex, 'odds') : null;
    const label = blankRow ? tableCellText(blankRow, headerIndex, 'card') : 'Blank';
    const quantity = typeof quantityValue === 'number' ? quantityValue : 0;

    return {
      card: {
        cardDefinitionId: 'blank-card',
        packId,
        deckId,
        kind: 'blank',
        name: applyWorkbookCorrections(label ?? 'Blank'),
        shortName: applyWorkbookCorrections(label ?? 'Blank'),
        description: 'No special effect.',
        automationLevel: 'authoritative',
        effects: [],
        visibilityPolicy: HIDER_DECK_VISIBILITY,
        tags: ['blank'],
        sourceProvenance: [
          sourceProvenance(sourceFileName, sheet.name, blankRow?.rowNumber ?? 1, 'card', label ?? 'Blank', 'Blanks')
        ]
      },
      entry: {
        cardDefinitionId: 'blank-card',
        quantity,
        weight: oddsValue ?? undefined,
        notes: oddsValue !== null ? `Workbook odds: ${oddsValue}` : undefined,
        sourceProvenance: [
          sourceProvenance(sourceFileName, sheet.name, blankRow?.rowNumber ?? 1, 'quantity', quantityValue, label ?? 'Blank'),
          sourceProvenance(sourceFileName, sheet.name, blankRow?.rowNumber ?? 1, 'odds', oddsValue, label ?? 'Blank')
        ]
      }
    };
  }

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

const CURSE_RULEBOOK_GUIDANCE: Record<string, { text: string; printedPage: number }> = {
  'curse-of-the-zoologist': {
    text: '“Wild” means not kept in human captivity, including farms and sanctuaries. “Bug” includes insects, arachnids, millipedes, centipedes, and animals commonly called bugs; crustaceans do not count. The image must show enough of the animal to identify its category. If classification is disputed, use Wikipedia.',
    printedPage: 50
  },
  'curse-of-the-unguided-tourist': {
    text: 'The pictured human-built structure cannot be part of a road, including a curb or sidewalk. Remove this card from decks in places with very limited Street View coverage.',
    printedPage: 53
  },
  'curse-of-the-endless-tumble': {
    text: 'Measure the 30 m roll parallel to the ground. The die must travel using only the initial throw and gravity, without assistance. If it hits someone, award the hider’s scale bonus immediately.',
    printedPage: 56
  },
  'curse-of-the-hidden-hangman': {
    text: 'The hider’s five-letter word must be a real dictionary word in the language the group is playing in.',
    printedPage: 56
  },
  'curse-of-the-overflowing-chalice': {
    text: 'The bonus is one additional card drawn, not kept, for each of the next three question rewards. The category-specific draw and keep counts otherwise remain in effect.',
    printedPage: 56
  },
  'curse-of-the-mediocre-travel-agent': {
    text: '“Publicly accessible” follows the hiding-spot rule. The destination may be an area rather than a point. The souvenir may be any physical object and need not stay with the seekers throughout the trip, but it must be with them when they are caught.',
    printedPage: 53
  },
  'curse-of-the-luxury-car': {
    text: 'The submitted photo must show enough of the car to identify it, and seekers must agree that it is the claimed car. Compare MSRP for the production year, ignoring paid upgrades and modifications. If model or year is uncertain, both sides agree which one to use.',
    printedPage: 48
  },
  'curse-of-the-u-turn': {
    text: 'Use the next station that the seekers’ current route will actually stop at; ignore skipped stops. If the route or stop is uncertain, ask the seekers and tell them which station you believe is next so they can confirm. A route that eventually moves toward the hider may still qualify when its next station is farther away.',
    printedPage: 55
  },
  'curse-of-the-bridge-troll': {
    text: 'A bridge is an elevated structure intended for pedestrians, cars, or other vehicles to cross as a path, road, or railway. When the next question is asked, every seeker must have some part of their body under the bridge. Remove this card if the playable map has no bridges.',
    printedPage: 50
  },
  'curse-of-water-weight': {
    text: 'Liquid already being carried when the curse is played does not count. It may be split between any number of containers and passed between seekers. Seekers may set it down while stationary or on transit; it is abandoned when it is no longer within 3 m of any seeker. Award the hider’s bonus immediately when that happens. A qualifying body of water need not be natural, but cannot be a pool and must be large enough to appear on the map.',
    printedPage: 51
  },
  'curse-of-the-endless-tumble': {
    text: 'Measure the 30 m die roll parallel to the ground. It must travel using only the initial throw and gravity, without assistance. A lost die or a die that does not land cleanly on one side cannot count. If it hits someone, award the hider’s scale bonus immediately.',
    printedPage: 56
  },
  'curse-of-the-jammed-door': {
    text: 'Roll only once the doorway is visible. Doors leading to another part of the same building do not need a check. If it is reasonably unclear whether something is a separate building, require the roll. When the curse expires, any doorway cooldown ends too.',
    printedPage: 52
  },
  'curse-of-the-cairn': {
    text: 'The rocks must be found in nature rather than purchased. After both teams build, each team disperses its rocks.',
    printedPage: 54
  },
  'curse-of-the-urban-explorer': {
    text: 'Questions already asked while seekers were on transit still need an answer. During the curse, seekers cannot ask from a platform or from a building associated with the transit station.',
    printedPage: 56
  },
  'curse-of-the-impressionable-consumer': {
    text: 'An advertisement is an object or display mainly intended to raise awareness of a product, service, or business. If it advertises a specific service, seekers must buy and receive that service; if it advertises a place, they must enter it. Public places such as parks do not count as private businesses. Remove this card if the group does not want possible spending.',
    printedPage: 54
  },
  'curse-of-the-egg-partner': {
    text: 'The egg must be real; a visible crack, however small, counts as killing it. Treat the egg as a seeker for other curses that apply to every seeker. Remove this card if the group objects to buying an egg or to the animal-welfare implications.',
    printedPage: 50
  },
  'curse-of-the-distant-cuisine': {
    text: 'The restaurant must explicitly name one country, or a region within one country, in its name or other public-facing material. A broad label such as “Asian” does not qualify. Measure country distance from the seeker’s exact location to the nearest point in that country.',
    printedPage: 55
  },
  'curse-of-the-right-turn': {
    text: 'This applies only at intersections of roads intended for cars, including their pedestrian sidewalks. It has no effect indoors or where there are no streets.',
    printedPage: 57
  },
  'curse-of-the-labyrinth': {
    text: 'A solvable maze has an unbroken route from start to finish. The timer starts when drawing the first line, not while gathering materials. The hider may restart the drawing but not the timer, and may not consult the internet or other materials while designing it.',
    printedPage: 56
  },
  'curse-of-the-bird-guide': {
    text: 'The bird must be in frame when recording starts. Any recognizable part of it counts as in frame. Seekers have unlimited attempts to record their matching video.',
    printedPage: 53
  },
  'curse-of-the-mediocre-travel-agent': {
    text: 'The printed mile limits are canonical: 0.25 miles for Small and Medium and 0.50 miles for Large (approximately 402 m, 402 m, and 805 m). The destination may be an area rather than a point. Public accessibility follows the hiding-spot rule. The souvenir may be any physical object and need not stay with the seekers throughout the trip, but it must be with them when they are caught.',
    printedPage: 53
  },
  'curse-of-spotty-memory': {
    text: 'Assign die numbers to question categories before the first roll. In small games, reroll a six because only five categories are available.',
    printedPage: 52
  },
  'curse-of-the-lemon-phylactery': {
    text: 'Each lemon must be real and remain in constant contact with the seeker’s skin or clothes; any attachment method is allowed. Tell the hider immediately when one stops touching a seeker and award the scale bonus. This curse cannot be played during endgame.',
    printedPage: 55
  },
  'curse-of-the-drained-brain': {
    text: 'This may be played and paid for between a question and its answer, but cannot remove the question already asked, even before it is answered. A question removed by this curse stays unavailable even at increased repeat cost.',
    printedPage: 50
  },
  'curse-of-the-ransom-note': {
    text: 'Do not begin paying the casting cost if the curse could not otherwise be played; once paid, cast it immediately. Seekers cannot produce the printed material themselves. The note must communicate the question without clarification, but additional question context may be supplied normally rather than cut from print.',
    printedPage: 52
  },
  'curse-of-the-gamblers-feet': {
    text: 'Use a six-sided die. With multiple seekers, each may roll separately or one roll may set the steps for everyone. If seekers accidentally take extra steps, stop and roll retroactively to account for them. Extra steps are allowed only when needed for safety.',
    printedPage: 55
  }
};

function curseRulebookGuidance(cardSlug: string): { text: string; source: string } | undefined {
  const guidance = CURSE_RULEBOOK_GUIDANCE[cardSlug];
  if (!guidance) return undefined;
  return {
    text: guidance.text,
    source: `Scanned base rulebook, printed p. ${guidance.printedPage}`
  };
}

function buildCurseCards(
  sourceFileName: string,
  packId: string,
  deckId: string,
  sheet: WorkbookSheet,
  issues: ImportIssue[],
  deckSheet?: WorkbookSheet
): { cards: CardDefinition[]; entries: DeckDefinition['entries'] } {
  if (sheetHasHeaders(sheet, ['name', 'description', 'casting_cost'])) {
    const headerIndex = buildHeaderIndex(sheet);
    const deckHeaderIndex = deckSheet ? buildHeaderIndex(deckSheet) : undefined;
    const curseDeckRow = deckSheet
      ? dataRowsAfterHeader(deckSheet).find((row) => tableCellText(row, deckHeaderIndex!, 'category') === 'Curses')
      : undefined;
    const categoryOdds = curseDeckRow ? tableCellNumber(curseDeckRow, deckHeaderIndex!, 'odds') : null;
    const curseRows = dataRowsAfterHeader(sheet);
    const perCardWeight = categoryOdds !== null && curseRows.length > 0
      ? Number((categoryOdds / curseRows.length).toFixed(6))
      : undefined;
    const cards: CardDefinition[] = [];
    const entries: DeckDefinition['entries'] = [];

    for (const row of curseRows) {
      const nameRaw = tableCellText(row, headerIndex, 'name');
      const descriptionRaw = tableCellText(row, headerIndex, 'description');
      const costRaw = tableCellText(row, headerIndex, 'casting_cost');

      if (!nameRaw || !descriptionRaw) {
        continue;
      }

      const normalizedName = normalizeLabel(nameRaw);
      const locksQuestionTemplates = normalizedName.slug === 'curse-of-the-drained-brain';
      const grantsExtraQuestionRewardDraws = normalizedName.slug === 'curse-of-the-overflowing-chalice';
      const randomizesQuestionCategory = normalizedName.slug === 'curse-of-spotty-memory';
      const startsHangmanChallenge = normalizedName.slug === 'curse-of-the-hidden-hangman';
      const startsLabyrinthChallenge = normalizedName.slug === 'curse-of-the-labyrinth';
      const startsRightTurnChallenge = normalizedName.slug === 'curse-of-the-right-turn';
      const startsUnguidedTouristChallenge = normalizedName.slug === 'curse-of-the-unguided-tourist';
      const startsBirdGuideChallenge = normalizedName.slug === 'curse-of-the-bird-guide';
      const startsMediocreTravelAgentChallenge = normalizedName.slug === 'curse-of-the-mediocre-travel-agent';
      const startsBridgeTrollChallenge = normalizedName.slug === 'curse-of-the-bridge-troll';
      const startsSeekerOffTransitChallenge = normalizedName.slug === 'curse-of-the-urban-explorer';
      const startsUTurnChallenge = normalizedName.slug === 'curse-of-the-u-turn';
      const startsRansomNoteChallenge = normalizedName.slug === 'curse-of-the-ransom-note';
      const startsCairnChallenge = normalizedName.slug === 'curse-of-the-cairn';
      const startsWaterWeightChallenge = normalizedName.slug === 'curse-of-water-weight';
      const startsEndlessTumbleChallenge = normalizedName.slug === 'curse-of-the-endless-tumble';
      const startsLemonPhylacteryChallenge = normalizedName.slug === 'curse-of-the-lemon-phylactery';
      const startsGamblersFeetChallenge = normalizedName.slug === 'curse-of-the-gamblers-feet';
      const startsEggPartnerChallenge = normalizedName.slug === 'curse-of-the-egg-partner';
      const startsJammedDoorChallenge = normalizedName.slug === 'curse-of-the-jammed-door';
      const startsZoologistChallenge = normalizedName.slug === 'curse-of-the-zoologist';
      const startsLuxuryCarChallenge = normalizedName.slug === 'curse-of-the-luxury-car';
      const rulebookGuidance = curseRulebookGuidance(normalizedName.slug);
      buildNormalizationIssue(
        issues,
        sourceFileName,
        sheet.name,
        row.rowNumber,
        'name',
        nameRaw,
        normalizedName.displayText,
        `cards[curse-${normalizedName.slug}].name`
      );

      const cardDefinitionId = `curse-${normalizedName.slug}`;

      cards.push({
        cardDefinitionId,
        packId,
        deckId,
        kind: 'curse',
        subtype: 'challenge',
        name: normalizedName.displayText,
        shortName: normalizedName.displayText,
        description: applyWorkbookCorrections(descriptionRaw),
        ...(rulebookGuidance ? { rulebookGuidanceText: rulebookGuidance.text } : {}),
        automationLevel: locksQuestionTemplates || grantsExtraQuestionRewardDraws || randomizesQuestionCategory ? 'authoritative' : startsHangmanChallenge || startsLabyrinthChallenge || startsRightTurnChallenge || startsUnguidedTouristChallenge || startsBirdGuideChallenge || startsMediocreTravelAgentChallenge || startsBridgeTrollChallenge || startsSeekerOffTransitChallenge || startsUTurnChallenge || startsRansomNoteChallenge || startsCairnChallenge || startsWaterWeightChallenge || startsEndlessTumbleChallenge || startsLemonPhylacteryChallenge || startsGamblersFeetChallenge || startsEggPartnerChallenge || startsJammedDoorChallenge || startsZoologistChallenge || startsLuxuryCarChallenge ? 'assisted' : 'manual',
        castingCost: costRaw ? [createGeneratedRequirement(applyWorkbookCorrections(costRaw), costRaw)] : [],
        effects: [
          {
            effectType: startsBridgeTrollChallenge
              ? 'bridge_troll_challenge'
              : startsSeekerOffTransitChallenge
              ? 'seeker_off_transit_challenge'
              : startsUTurnChallenge
              ? 'u_turn_challenge'
              : startsRansomNoteChallenge
              ? 'ransom_note_challenge'
              : startsCairnChallenge
              ? 'cairn_challenge'
              : startsWaterWeightChallenge
              ? 'water_weight_challenge'
              : startsEndlessTumbleChallenge
              ? 'endless_tumble_challenge'
              : startsLemonPhylacteryChallenge
              ? 'lemon_phylactery_challenge'
              : startsGamblersFeetChallenge
              ? 'gamblers_feet_challenge'
              : startsEggPartnerChallenge
              ? 'egg_partner_challenge'
              : startsJammedDoorChallenge
              ? 'jammed_door_challenge'
              : startsZoologistChallenge
              ? 'zoologist_challenge'
              : startsLuxuryCarChallenge
              ? 'luxury_car_challenge'
              : startsLabyrinthChallenge
              ? 'labyrinth_challenge'
              : startsRightTurnChallenge
              ? 'right_turn_challenge'
              : startsUnguidedTouristChallenge
              ? 'unguided_tourist_challenge'
              : startsMediocreTravelAgentChallenge
              ? 'mediocre_travel_agent_challenge'
              : startsBirdGuideChallenge
              ? 'bird_guide_challenge'
              : startsHangmanChallenge
              ? 'hangman_challenge'
              : locksQuestionTemplates
              ? 'disable_question_templates'
              : grantsExtraQuestionRewardDraws ? 'extra_question_reward_draws'
                : randomizesQuestionCategory ? 'random_question_category_lock' : 'curse_challenge',
            description: applyWorkbookCorrections(descriptionRaw),
            automationLevel: locksQuestionTemplates || grantsExtraQuestionRewardDraws || randomizesQuestionCategory ? 'authoritative' : startsHangmanChallenge || startsLabyrinthChallenge || startsRightTurnChallenge || startsUnguidedTouristChallenge || startsBirdGuideChallenge || startsMediocreTravelAgentChallenge || startsBridgeTrollChallenge || startsSeekerOffTransitChallenge || startsUTurnChallenge || startsRansomNoteChallenge || startsCairnChallenge || startsWaterWeightChallenge || startsEndlessTumbleChallenge || startsLemonPhylacteryChallenge || startsGamblersFeetChallenge || startsEggPartnerChallenge || startsJammedDoorChallenge || startsZoologistChallenge || startsLuxuryCarChallenge ? 'assisted' : 'manual',
            rawText: descriptionRaw,
            payload: {
              ...(startsUnguidedTouristChallenge
                ? { maximumDistanceMeters: 152, requireSeekerOutdoors: true, requirePublicReferencePhoto: true, requireSeekerPhoto: true, requireNoInternetResearchAttestation: true }
                : startsMediocreTravelAgentChallenge
                ? { maximumDistanceMetersByScale: { small: 402, medium: 402, large: 805 }, stayMinutesByScale: { small: 5, medium: 5, large: 10 }, hiderBonusMinutesByScale: { small: 30, medium: 45, large: 60 }, requiredPhotoCount: 3, arrivalRadiusMeters: 50 }
                : startsBirdGuideChallenge
                ? { maximumFilmingMinutesByScale: { small: 5, medium: 10, large: 15 }, requireHiderBirdInFrameAttestation: true, requireSeekerHiderApproval: true }
                : startsCairnChallenge
                ? { minimumStableSecondsPerRock: 5, hiderAttestedTarget: true }
                : startsRightTurnChallenge
                ? { minutesByScale: { small: 20, medium: 40, large: 60 }, deadEndDistanceMeters: 304, reportsArePlayerAttestations: true }
                : startsSeekerOffTransitChallenge
                ? { requiredAttestations: 'all_seekers_off_transit_and_station', duration: 'hider_run' }
                : startsUTurnChallenge
                ? { alternateTransitWindowMinutesByScale: { small: 30, medium: 30, large: 60 }, requiredAttestations: 'all_seekers_disembark_at_next_station' }
                : startsRansomNoteChallenge
                ? { minimumWords: 5, requireHiderApproval: true, requirePrintedCutouts: true }
                : startsBridgeTrollChallenge
                ? { requiredAttestations: 'all_seekers' }
                : startsWaterWeightChallenge
                ? { requiredLitersPerSeeker: 2, abandonRadiusMeters: 3, minutesByScale: { small: 30, medium: 30, large: 60 } }
                : startsEndlessTumbleChallenge
                ? { minimumDistanceMeters: 30, successfulDieResults: [5, 6], minutesByScale: { small: 10, medium: 20, large: 30 } }
                : startsLemonPhylacteryChallenge
                ? { minutesByScale: { small: 30, medium: 45, large: 60 }, requiredAttestations: 'all_seekers' }
                : startsGamblersFeetChallenge
                ? { minutesByScale: { small: 20, medium: 40, large: 60 }, dicePerSeeker: true }
                : startsEggPartnerChallenge
                ? { minutesByScale: { small: 30, medium: 45, large: 60 }, acquireBeforeQuestion: true }
                : startsJammedDoorChallenge
                ? { minutesByScale: { small: 30, medium: 60, large: 180 }, retryCooldownMinutesByScale: { small: 5, medium: 10, large: 15 }, minimumTotal: 7, requiresVisibleDoorway: true }
                : startsHangmanChallenge
                ? { wordLength: 5, secretScope: 'hider_player' }
                : startsLabyrinthChallenge
                ? { drawingWindowMinutesByScale: { small: 10, medium: 20, large: 30 }, requireHiderApproval: true, requirePublicMazePhoto: true, mayRestartDrawingWithoutRestartingTimer: true }
                : startsRightTurnChallenge
                ? { minutesByScale: { small: 20, medium: 40, large: 60 }, deadEndDistanceMeters: 304, reportsArePlayerAttestations: true }
                : locksQuestionTemplates
                ? { questionCount: 3, requireDistinctCategories: true, duration: 'hider_run' }
                : grantsExtraQuestionRewardDraws
                  ? { questionCount: 3, extraDrawCount: 1, duration: 'next_question_rewards' }
                  : randomizesQuestionCategory
                    ? { duration: 'hider_run', rerollAfterQuestion: true }
                    : { workbookName: normalizedName.displayText })
            }
          }
        ],
        rewardsOrPenalties: [],
        requirements: {
          requiresManualApproval: !locksQuestionTemplates && !grantsExtraQuestionRewardDraws && !randomizesQuestionCategory && !startsHangmanChallenge && !startsLabyrinthChallenge && !startsRightTurnChallenge && !startsBridgeTrollChallenge && !startsSeekerOffTransitChallenge && !startsUTurnChallenge && !startsRansomNoteChallenge && !startsCairnChallenge && !startsWaterWeightChallenge && !startsEndlessTumbleChallenge && !startsLemonPhylacteryChallenge && !startsGamblersFeetChallenge && !startsEggPartnerChallenge && !startsJammedDoorChallenge && !startsZoologistChallenge && !startsLuxuryCarChallenge && !startsMediocreTravelAgentChallenge,
          requiresPhotoUpload: startsMediocreTravelAgentChallenge || startsLabyrinthChallenge || startsUnguidedTouristChallenge || startsZoologistChallenge || startsLuxuryCarChallenge,
          requiresVideoUpload: startsBirdGuideChallenge
        },
        visibilityPolicy: HIDER_DECK_VISIBILITY,
        tags: locksQuestionTemplates || grantsExtraQuestionRewardDraws || randomizesQuestionCategory ? ['curse', 'authoritative-effect'] : startsHangmanChallenge || startsLabyrinthChallenge || startsRightTurnChallenge || startsUnguidedTouristChallenge || startsBirdGuideChallenge || startsMediocreTravelAgentChallenge || startsBridgeTrollChallenge || startsSeekerOffTransitChallenge || startsUTurnChallenge || startsRansomNoteChallenge || startsCairnChallenge || startsWaterWeightChallenge || startsEndlessTumbleChallenge || startsLemonPhylacteryChallenge || startsGamblersFeetChallenge || startsEggPartnerChallenge || startsJammedDoorChallenge || startsZoologistChallenge || startsLuxuryCarChallenge ? ['curse', 'assisted-effect'] : ['curse', 'manual-resolution'],
        sourceProvenance: [
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'name', nameRaw, nameRaw),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'description', descriptionRaw, nameRaw),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'casting_cost', costRaw ?? null, nameRaw),
          ...(rulebookGuidance ? [generatedProvenance(rulebookGuidance.source, 'Curse handling clarification paraphrased from the scanned base rulebook.')] : [])
        ]
      });

      entries.push({
        cardDefinitionId,
        quantity: 1,
        weight: perCardWeight,
        notes: categoryOdds !== null ? `Workbook category odds: ${categoryOdds}` : undefined,
        sourceProvenance: [
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'name', nameRaw, nameRaw),
          ...(curseDeckRow
            ? [sourceProvenance(
                sourceFileName,
                deckSheet!.name,
                curseDeckRow.rowNumber,
                'odds',
                categoryOdds,
                'Curses'
              )]
            : [])
        ]
      });
    }

    return { cards, entries };
  }

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
    const locksQuestionTemplates = normalizedName.slug === 'curse-of-the-drained-brain';
    const grantsExtraQuestionRewardDraws = normalizedName.slug === 'curse-of-the-overflowing-chalice';
    const randomizesQuestionCategory = normalizedName.slug === 'curse-of-spotty-memory';
    const startsHangmanChallenge = normalizedName.slug === 'curse-of-the-hidden-hangman';
    const startsLabyrinthChallenge = normalizedName.slug === 'curse-of-the-labyrinth';
    const startsRightTurnChallenge = normalizedName.slug === 'curse-of-the-right-turn';
    const startsUnguidedTouristChallenge = normalizedName.slug === 'curse-of-the-unguided-tourist';
    const startsBirdGuideChallenge = normalizedName.slug === 'curse-of-the-bird-guide';
    const startsMediocreTravelAgentChallenge = normalizedName.slug === 'curse-of-the-mediocre-travel-agent';
    const startsBridgeTrollChallenge = normalizedName.slug === 'curse-of-the-bridge-troll';
    const startsSeekerOffTransitChallenge = normalizedName.slug === 'curse-of-the-urban-explorer';
    const startsUTurnChallenge = normalizedName.slug === 'curse-of-the-u-turn';
    const startsRansomNoteChallenge = normalizedName.slug === 'curse-of-the-ransom-note';
    const startsCairnChallenge = normalizedName.slug === 'curse-of-the-cairn';
    const startsWaterWeightChallenge = normalizedName.slug === 'curse-of-water-weight';
    const startsEndlessTumbleChallenge = normalizedName.slug === 'curse-of-the-endless-tumble';
    const startsLemonPhylacteryChallenge = normalizedName.slug === 'curse-of-the-lemon-phylactery';
    const startsGamblersFeetChallenge = normalizedName.slug === 'curse-of-the-gamblers-feet';
    const startsEggPartnerChallenge = normalizedName.slug === 'curse-of-the-egg-partner';
    const startsJammedDoorChallenge = normalizedName.slug === 'curse-of-the-jammed-door';
    const startsZoologistChallenge = normalizedName.slug === 'curse-of-the-zoologist';
    const startsLuxuryCarChallenge = normalizedName.slug === 'curse-of-the-luxury-car';
    const rulebookGuidance = curseRulebookGuidance(normalizedName.slug);
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
      ...(rulebookGuidance ? { rulebookGuidanceText: rulebookGuidance.text } : {}),
      automationLevel: locksQuestionTemplates || grantsExtraQuestionRewardDraws || randomizesQuestionCategory ? 'authoritative' : startsHangmanChallenge || startsLabyrinthChallenge || startsRightTurnChallenge || startsUnguidedTouristChallenge || startsBirdGuideChallenge || startsMediocreTravelAgentChallenge || startsBridgeTrollChallenge || startsSeekerOffTransitChallenge || startsUTurnChallenge || startsRansomNoteChallenge || startsCairnChallenge || startsWaterWeightChallenge || startsEndlessTumbleChallenge || startsLemonPhylacteryChallenge || startsGamblersFeetChallenge || startsEggPartnerChallenge || startsJammedDoorChallenge || startsZoologistChallenge || startsLuxuryCarChallenge ? 'assisted' : 'manual',
      castingCost: costRaw ? [createGeneratedRequirement(applyWorkbookCorrections(costRaw), costRaw)] : [],
      effects: [
        {
          effectType: startsBridgeTrollChallenge
            ? 'bridge_troll_challenge'
            : startsSeekerOffTransitChallenge
            ? 'seeker_off_transit_challenge'
            : startsUTurnChallenge
            ? 'u_turn_challenge'
            : startsRansomNoteChallenge
            ? 'ransom_note_challenge'
            : startsCairnChallenge
            ? 'cairn_challenge'
            : startsWaterWeightChallenge
            ? 'water_weight_challenge'
            : startsEndlessTumbleChallenge
            ? 'endless_tumble_challenge'
            : startsLemonPhylacteryChallenge
            ? 'lemon_phylactery_challenge'
            : startsGamblersFeetChallenge
            ? 'gamblers_feet_challenge'
            : startsEggPartnerChallenge
            ? 'egg_partner_challenge'
            : startsJammedDoorChallenge
            ? 'jammed_door_challenge'
            : startsZoologistChallenge
            ? 'zoologist_challenge'
            : startsLuxuryCarChallenge
            ? 'luxury_car_challenge'
            : startsLabyrinthChallenge
            ? 'labyrinth_challenge'
              : startsRightTurnChallenge
              ? 'right_turn_challenge'
            : startsUnguidedTouristChallenge
            ? 'unguided_tourist_challenge'
            : startsBirdGuideChallenge
            ? 'bird_guide_challenge'
            : startsMediocreTravelAgentChallenge
            ? 'mediocre_travel_agent_challenge'
            : startsHangmanChallenge
            ? 'hangman_challenge'
            : locksQuestionTemplates
            ? 'disable_question_templates'
            : grantsExtraQuestionRewardDraws ? 'extra_question_reward_draws'
              : randomizesQuestionCategory ? 'random_question_category_lock' : 'curse_challenge',
          description: applyWorkbookCorrections(descriptionRaw),
          automationLevel: locksQuestionTemplates || grantsExtraQuestionRewardDraws || randomizesQuestionCategory ? 'authoritative' : startsHangmanChallenge || startsLabyrinthChallenge || startsRightTurnChallenge || startsUnguidedTouristChallenge || startsBirdGuideChallenge || startsMediocreTravelAgentChallenge || startsBridgeTrollChallenge || startsSeekerOffTransitChallenge || startsUTurnChallenge || startsRansomNoteChallenge || startsCairnChallenge || startsWaterWeightChallenge || startsEndlessTumbleChallenge || startsLemonPhylacteryChallenge || startsGamblersFeetChallenge || startsEggPartnerChallenge || startsJammedDoorChallenge || startsZoologistChallenge || startsLuxuryCarChallenge ? 'assisted' : 'manual',
          rawText: descriptionRaw,
          payload: {
            ...(startsUnguidedTouristChallenge
              ? { maximumDistanceMeters: 152, requireSeekerOutdoors: true, requirePublicReferencePhoto: true, requireSeekerPhoto: true, requireNoInternetResearchAttestation: true }
              : startsMediocreTravelAgentChallenge
              ? { maximumDistanceMetersByScale: { small: 402, medium: 402, large: 805 }, stayMinutesByScale: { small: 5, medium: 5, large: 10 }, hiderBonusMinutesByScale: { small: 30, medium: 45, large: 60 }, requiredPhotoCount: 3, arrivalRadiusMeters: 50 }
              : startsBirdGuideChallenge
              ? { maximumFilmingMinutesByScale: { small: 5, medium: 10, large: 15 }, requireHiderBirdInFrameAttestation: true, requireSeekerHiderApproval: true }
              : startsCairnChallenge
              ? { minimumStableSecondsPerRock: 5, hiderAttestedTarget: true }
              : startsRightTurnChallenge
              ? { minutesByScale: { small: 20, medium: 40, large: 60 }, deadEndDistanceMeters: 304, reportsArePlayerAttestations: true }
              : startsSeekerOffTransitChallenge
              ? { requiredAttestations: 'all_seekers_off_transit_and_station', duration: 'hider_run' }
              : startsUTurnChallenge
              ? { alternateTransitWindowMinutesByScale: { small: 30, medium: 30, large: 60 }, requiredAttestations: 'all_seekers_disembark_at_next_station' }
              : startsRansomNoteChallenge
                ? { minimumWords: 5, requireHiderApproval: true, requirePrintedCutouts: true }
              : startsBridgeTrollChallenge
              ? { requiredAttestations: 'all_seekers' }
              : startsWaterWeightChallenge
              ? { requiredLitersPerSeeker: 2, abandonRadiusMeters: 3, minutesByScale: { small: 30, medium: 30, large: 60 } }
              : startsEndlessTumbleChallenge
              ? { minimumDistanceMeters: 30, successfulDieResults: [5, 6], minutesByScale: { small: 10, medium: 20, large: 30 } }
              : startsLemonPhylacteryChallenge
              ? { minutesByScale: { small: 30, medium: 45, large: 60 }, requiredAttestations: 'all_seekers' }
              : startsGamblersFeetChallenge
              ? { minutesByScale: { small: 20, medium: 40, large: 60 }, dicePerSeeker: true }
              : startsEggPartnerChallenge
              ? { minutesByScale: { small: 30, medium: 45, large: 60 }, acquireBeforeQuestion: true }
              : startsJammedDoorChallenge
              ? { minutesByScale: { small: 30, medium: 60, large: 180 }, retryCooldownMinutesByScale: { small: 5, medium: 10, large: 15 }, minimumTotal: 7, requiresVisibleDoorway: true }
              : startsHangmanChallenge
              ? { wordLength: 5, secretScope: 'hider_player' }
              : startsLabyrinthChallenge
              ? { drawingWindowMinutesByScale: { small: 10, medium: 20, large: 30 }, requireHiderApproval: true, requirePublicMazePhoto: true, mayRestartDrawingWithoutRestartingTimer: true }
              : locksQuestionTemplates
              ? { questionCount: 3, requireDistinctCategories: true, duration: 'hider_run' }
              : grantsExtraQuestionRewardDraws
                ? { questionCount: 3, extraDrawCount: 1, duration: 'next_question_rewards' }
                : randomizesQuestionCategory
                  ? { duration: 'hider_run', rerollAfterQuestion: true }
                  : { order: collapseLineBreaks(orderRaw) })
          }
        }
      ],
      rewardsOrPenalties: [],
      requirements: {
          requiresManualApproval: !locksQuestionTemplates && !grantsExtraQuestionRewardDraws && !randomizesQuestionCategory && !startsHangmanChallenge && !startsLabyrinthChallenge && !startsRightTurnChallenge && !startsUnguidedTouristChallenge && !startsBridgeTrollChallenge && !startsSeekerOffTransitChallenge && !startsUTurnChallenge && !startsRansomNoteChallenge && !startsCairnChallenge && !startsWaterWeightChallenge && !startsEndlessTumbleChallenge && !startsLemonPhylacteryChallenge && !startsGamblersFeetChallenge && !startsEggPartnerChallenge && !startsJammedDoorChallenge && !startsZoologistChallenge && !startsLuxuryCarChallenge && !startsMediocreTravelAgentChallenge,
          requiresPhotoUpload: startsMediocreTravelAgentChallenge || startsLabyrinthChallenge || startsUnguidedTouristChallenge || startsZoologistChallenge || startsLuxuryCarChallenge,
          requiresVideoUpload: startsBirdGuideChallenge
      },
      visibilityPolicy: HIDER_DECK_VISIBILITY,
        tags: locksQuestionTemplates || grantsExtraQuestionRewardDraws || randomizesQuestionCategory ? ['curse', 'authoritative-effect'] : startsHangmanChallenge || startsLabyrinthChallenge || startsRightTurnChallenge || startsUnguidedTouristChallenge || startsBirdGuideChallenge || startsMediocreTravelAgentChallenge || startsBridgeTrollChallenge || startsSeekerOffTransitChallenge || startsUTurnChallenge || startsRansomNoteChallenge || startsCairnChallenge || startsWaterWeightChallenge || startsEndlessTumbleChallenge || startsLemonPhylacteryChallenge || startsGamblersFeetChallenge || startsEggPartnerChallenge || startsJammedDoorChallenge || startsZoologistChallenge || startsLuxuryCarChallenge ? ['curse', 'assisted-effect'] : ['curse', 'manual-resolution'],
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, curseRow.rowNumber, 'B', nameRaw, orderRaw),
        sourceProvenance(sourceFileName, sheet.name, curseRow.rowNumber, 'C', descriptionRaw, nameRaw),
        sourceProvenance(sourceFileName, sheet.name, costRow.rowNumber, 'C', costRaw ?? null, 'Casting Cost'),
        ...(rulebookGuidance ? [generatedProvenance(rulebookGuidance.source, 'Curse handling clarification paraphrased from the scanned base rulebook.')] : [])
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
      reshuffleDiscardIntoDraw: false,
      initialDrawCount: 6
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

const MATCHING_RULEBOOK_GUIDANCE: Record<string, { text: string; source: string }> = {
  landmass: {
    text: 'Treat a landmass as one connected area of land not broken by a waterway. If the hider’s landmass is wholly surrounded by the seekers’ landmass, answer Yes. Seekers should clarify ambiguous geography before asking.',
    source: 'Scanned base rulebook, printed p. 20'
  },
  'transit-line': {
    text: 'Ask only while the seekers are riding moving transit. Answer Yes only if that service would stop at the hider’s station; passing through without stopping counts as No. Sharing the service’s stop list helps the hider verify the answer.',
    source: 'Scanned base rulebook, printed p. 18'
  },
  'stations-name-length': {
    text: 'Count characters in the station name shown by the agreed mapping app. Spaces and hyphens count, and the word “station” counts if the app includes it.',
    source: 'Scanned base rulebook, printed p. 19'
  },
  'street-or-path': {
    text: 'A street or path segment ends when its name changes. If it is unnamed, treat each intersection as a start or end.',
    source: 'Scanned base rulebook, printed p. 19'
  },
  '1st-admin-state': {
    text: 'Use the country’s biggest formal administrative division, such as a US state, Swiss canton, or Japanese prefecture.',
    source: 'Scanned base rulebook, printed p. 18'
  },
  '2nd-admin-county': {
    text: 'Use the next, more detailed administrative level, such as a US county, Swiss district, or Japanese subprefecture.',
    source: 'Scanned base rulebook, printed p. 18'
  },
  '3rd-admin-municipality-city-town': {
    text: 'Use the next administrative level down (municipality in the US, Switzerland, and Japan). If municipal borders are ambiguous, seekers should clarify which boundary they mean before asking.',
    source: 'Scanned base rulebook, printed p. 18'
  },
  '4th-admin-borough': {
    text: 'A fourth administrative level does not exist everywhere. Examples include New York boroughs, Zurich districts, and Tokyo special wards; agree on the applicable local division before asking.',
    source: 'Scanned base rulebook, printed p. 18'
  }
};

function matchingRulebookGuidance(featureClassId: string): { text: string; source: string } | undefined {
  return MATCHING_RULEBOOK_GUIDANCE[featureClassId];
}

function buildMatchingTemplates(
  sourceFileName: string,
  packId: string,
  sheet: WorkbookSheet,
  taxonomyById: Map<string, FeatureTaxonomyEntry>,
  issues: ImportIssue[]
): { category: QuestionCategoryDefinition; templates: QuestionTemplateDefinition[] } {
  if (sheetHasHeaders(sheet, ['subject', 'cost', 'time', 'question'])) {
    const headerIndex = buildHeaderIndex(sheet);
    const rows = dataRowsAfterHeader(sheet);
    const firstRow = rows[0];
    const category = buildCategory(
      sourceFileName,
      packId,
      sheet,
      'matching',
      'nearest_feature_match',
      'Matching',
      tableCellText(firstRow!, headerIndex, 'cost') ?? 'Draw 3, Pick 1',
      tableCellText(firstRow!, headerIndex, 'time') ?? '5 Minutes',
      tableCellText(firstRow!, headerIndex, 'question') ?? 'Is your nearest _____ the same as my nearest _____?',
      allScales(),
      {
        kind: 'boolean',
        allowedValues: ['yes', 'no']
      },
      ['nearest-feature-match']
    );

    const templates: QuestionTemplateDefinition[] = [];

    for (const row of rows) {
      const rawLabel = tableCellText(row, headerIndex, 'subject');
      const questionRaw = tableCellText(row, headerIndex, 'question');
      const costRaw = tableCellText(row, headerIndex, 'cost');
      const timeRaw = tableCellText(row, headerIndex, 'time');

      if (!rawLabel) {
        continue;
      }

      const normalized = normalizeLabel(rawLabel);
      const featureClassId = registerFeatureTaxonomy(taxonomyById, rawLabel, sourceFileName, sheet.name, row.rowNumber);
      buildNormalizationIssue(
        issues,
        sourceFileName,
        sheet.name,
        row.rowNumber,
        'subject',
        rawLabel,
        normalized.displayText,
        `questionTemplates[matching-${normalized.slug}].name`
      );

      const constraintRefs = featureClassId.includes('admin')
        ? ['same-admin-region']
        : ['nearest-feature-match'];
      const rulebookGuidance = matchingRulebookGuidance(featureClassId);

      templates.push({
        templateId: `matching-${normalized.slug}`,
        packId,
        categoryId: category.categoryId,
        name: normalized.displayText,
        promptOverrides: questionRaw ? { promptTemplate: applyWorkbookCorrections(questionRaw) } : undefined,
        featureClassRefs: [
          {
            featureClassId,
            label: normalized.displayText,
            rawLabel
          }
        ],
        parameters: workbookQuestionParameters({
          question: questionRaw,
          cost: costRaw,
          time: timeRaw,
          values: {
            subjectLabel: normalized.displayText,
            ...(rulebookGuidance ? { rulebookGuidanceText: rulebookGuidance.text } : {})
          }
        }),
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
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'subject', rawLabel, rawLabel),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'question', questionRaw, rawLabel),
          ...(rulebookGuidance ? [generatedProvenance(rulebookGuidance.source, 'Question clarification paraphrased from the scanned base rulebook.')] : [])
        ]
      });
    }

    return { category, templates };
  }

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
    const rulebookGuidance = matchingRulebookGuidance(featureClassId);

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
        subjectLabel: normalized.displayText,
        ...(rulebookGuidance ? { rulebookGuidanceText: rulebookGuidance.text } : {})
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
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'A', rawLabel, rawLabel),
        ...(rulebookGuidance ? [generatedProvenance(rulebookGuidance.source, 'Question clarification paraphrased from the scanned base rulebook.')] : [])
      ]
    });
  }

  return { category, templates };
}

const MEASURING_RULEBOOK_GUIDANCE: Record<string, string> = {
  'a-commercial-airport': 'If commercial status is unclear, count an airport if Google Flights shows flights to or from it.',
  'a-high-speed-train-line': 'Use the locally applicable definition. If there is none, use the EU guide: at least 250 km/h on purpose-built high-speed lines or about 200 km/h on specially upgraded existing lines.',
  'a-rail-station': 'Light and heavy rail both count; metros and subways count too.',
  'an-international-border': 'Enclaves count.',
  'a-1st-admin-border-state': 'This is a border between the country’s biggest formal administrative divisions, such as US states, Swiss cantons, or Japanese prefectures.',
  'a-2nd-admin-border-county': 'This is a border between the next administrative level down, such as US counties, Swiss districts, or Japanese subprefectures.',
  'sea-level': 'This means a player’s altitude. A phone compass can estimate it, but it may be inaccurate.',
  'a-body-of-water': 'Count a named body of water shown in the agreed map app; pools do not count.',
  'a-coastline': 'Count land meeting the ocean or a great lake, or a body of water that flows to either through a waterway at least 2 km wide. Coastlines can be ambiguous, so agree on edge cases.',
  'a-mountain': 'Use what the agreed map app classifies as a mountain, and measure to its map icon.',
  'a-park': 'Use the agreed map app’s park category and measure to the map icon, even when that puts you far from a large park’s center. Clarify unusual cases before asking.',
  'amusement-park': 'Use the agreed map app’s amusement-park category and measure to its map icon.',
  zoo: 'Use the agreed map app’s zoo category and measure to its map icon.',
  aquarium: 'Use the agreed map app’s aquarium category and measure to its map icon.',
  'golf-course': 'Only outdoor golf courses count; miniature golf and driving ranges do not. Measure to the map icon.',
  museum: 'Use the agreed map app’s museum category and measure to its map icon.',
  'movie-theatre': 'Use the agreed map app’s movie-theater category and measure to its map icon.',
  hospital: 'Use the agreed map app’s hospital category and measure to its map icon.',
  library: 'Use the agreed map app’s library category and measure to its map icon.',
  'foreign-consulate': 'Use the agreed map app’s foreign-consulate category, exclude honorary consulates, and measure to the map icon.'
};

function measuringRulebookGuidance(featureClassId: string): { text: string; source: string } {
  const featureGuidance = MEASURING_RULEBOOK_GUIDANCE[featureClassId];
  const answerRule = 'Answer “closer” or “further” by comparing both players’ distance to the same target. If no target exists inside the playable map boundary, answer null; it still counts as answered and earns the card reward.';
  return {
    text: [answerRule, featureGuidance].filter(Boolean).join(' '),
    source: 'Scanned base rulebook, printed pp. 22–26'
  };
}

function buildMeasuringTemplates(
  sourceFileName: string,
  packId: string,
  sheet: WorkbookSheet,
  taxonomyById: Map<string, FeatureTaxonomyEntry>,
  issues: ImportIssue[]
): { category: QuestionCategoryDefinition; templates: QuestionTemplateDefinition[] } {
  if (sheetHasHeaders(sheet, ['target', 'cost', 'time', 'question'])) {
    const headerIndex = buildHeaderIndex(sheet);
    const rows = dataRowsAfterHeader(sheet);
    const firstRow = rows[0];
    const category = buildCategory(
      sourceFileName,
      packId,
      sheet,
      'measuring',
      'comparative_distance',
      'Measuring',
      tableCellText(firstRow!, headerIndex, 'cost') ?? 'Draw 3, Pick 1',
      tableCellText(firstRow!, headerIndex, 'time') ?? '5 Minutes',
      tableCellText(firstRow!, headerIndex, 'question') ?? 'Compared to me, are you closer to or further from _____?',
      allScales(),
      {
        kind: 'enum',
        allowedValues: ['closer', 'further']
      },
      ['comparative-distance']
    );

    const templates: QuestionTemplateDefinition[] = [];

    for (const row of rows) {
      const rawLabel = tableCellText(row, headerIndex, 'target');
      const questionRaw = tableCellText(row, headerIndex, 'question');
      const costRaw = tableCellText(row, headerIndex, 'cost');
      const timeRaw = tableCellText(row, headerIndex, 'time');

      if (!rawLabel) {
        continue;
      }

      const normalized = normalizeLabel(rawLabel);
      if (reportExcludedMeasuringTarget({
        normalizedSlug: normalized.slug,
        displayText: normalized.displayText,
        rawLabel,
        sheetName: sheet.name,
        rowNumber: row.rowNumber,
        columnName: 'target',
        issues
      })) {
        continue;
      }

      const featureClassId = registerFeatureTaxonomy(taxonomyById, rawLabel, sourceFileName, sheet.name, row.rowNumber);
      const rulebookGuidance = measuringRulebookGuidance(featureClassId);
      buildNormalizationIssue(
        issues,
        sourceFileName,
        sheet.name,
        row.rowNumber,
        'target',
        rawLabel,
        normalized.displayText,
        `questionTemplates[measuring-${normalized.slug}].name`
      );

      templates.push({
        templateId: `measuring-${normalized.slug}`,
        packId,
        categoryId: category.categoryId,
        name: normalized.displayText,
        promptOverrides: questionRaw ? { promptTemplate: applyWorkbookCorrections(questionRaw) } : undefined,
        featureClassRefs: [
          {
            featureClassId,
            label: normalized.displayText,
            rawLabel
          }
        ],
        parameters: workbookQuestionParameters({
          question: questionRaw,
          cost: costRaw,
          time: timeRaw,
          values: {
            targetLabel: normalized.displayText,
            rulebookGuidanceText: rulebookGuidance.text
          }
        }),
        answerSchema: {
          kind: 'enum',
          allowedValues: ['closer', 'further']
        },
        resolverConfig: {
          comparisonTarget: featureClassId
        },
        constraintRefs: ['comparative-distance'],
        scaleSet: allScales(),
        visibilityPolicy: PUBLIC_VISIBILITY,
        sourceProvenance: [
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'target', rawLabel, rawLabel),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'question', questionRaw, rawLabel),
          generatedProvenance(rulebookGuidance.source, 'Measuring procedure and target definitions paraphrased from the scanned base rulebook.')
        ]
      });
    }

    return { category, templates };
  }

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
      allowedValues: ['closer', 'further']
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
    if (reportExcludedMeasuringTarget({
      normalizedSlug: normalized.slug,
      displayText: normalized.displayText,
      rawLabel,
      sheetName: sheet.name,
      rowNumber: row.rowNumber,
      columnName: 'A',
      issues
    })) {
      continue;
    }

    const featureClassId = registerFeatureTaxonomy(taxonomyById, rawLabel, sourceFileName, sheet.name, row.rowNumber);
    const rulebookGuidance = measuringRulebookGuidance(featureClassId);
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
        subjectLabel: normalized.displayText,
        rulebookGuidanceText: rulebookGuidance.text
      },
      answerSchema: {
        kind: 'enum',
        allowedValues: ['closer', 'further']
      },
      resolverConfig: {
        comparisonTarget: featureClassId
      },
      constraintRefs: ['comparative-distance'],
      scaleSet: allScales(),
      visibilityPolicy: PUBLIC_VISIBILITY,
      sourceProvenance: [
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'A', rawLabel, rawLabel),
        generatedProvenance(rulebookGuidance.source, 'Measuring procedure and target definitions paraphrased from the scanned base rulebook.')
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
  const printedDistances = [
    { meters: 1_000, label: '1 km' },
    { meters: 5_000, label: '5 km' },
    { meters: 15_000, label: '15 km' },
    { meters: 75_000, label: '75 km' }
  ];
  const reconcilePrintedDistance = (distance: NonNullable<ReturnType<typeof parseDistanceValue>>, rawText: string, rowNumber: number, columnName: string, templateIndex: number) => {
    const printed = printedDistances[templateIndex];
    if (!printed || distance.meters === printed.meters) return { distance, label: collapseLineBreaks(rawText) };
    issues.push(createIssue({
      sheetName: sheet.name,
      rowNumber,
      columnName,
      fieldPath: 'questionTemplates[].parameters.minimumDistance',
      severity: 'info',
      code: 'THERMOMETER_DISTANCE_RECONCILED_TO_BOOK',
      message: `The workbook lists ${distance.metricText ?? distance.rawText}, but the scanned Investigation Book lists ${printed.label}; the base-game question uses the printed distance.`,
      rawValue: rawText,
      normalizedValue: printed.label,
      suggestedFix: 'Keep the scanned Investigation Book distance in the base-game pack; preserve the workbook value only in source provenance.',
      sheetCell: `${columnName}${rowNumber}`
    }));
    return {
      distance: { ...distance, meters: printed.meters, rawText: printed.label, metricText: printed.label },
      label: printed.label
    };
  };

  if (sheetHasHeaders(sheet, ['distance', 'availability', 'cost', 'time', 'question'])) {
    const headerIndex = buildHeaderIndex(sheet);
    const rows = dataRowsAfterHeader(sheet);
    const firstRow = rows[0];
    const category = buildCategory(
      sourceFileName,
      packId,
      sheet,
      'thermometer',
      'hotter_colder',
      'Thermometer',
      tableCellText(firstRow!, headerIndex, 'cost') ?? 'Draw 2, Pick 1',
      tableCellText(firstRow!, headerIndex, 'time') ?? '5 Minutes',
      tableCellText(firstRow!, headerIndex, 'question') ?? 'I just traveled (at least) [Distance]. Am I hotter or colder?',
      allScales(),
      {
        kind: 'enum',
        allowedValues: ['hotter', 'colder']
      },
      ['hotter-colder']
    );

    const templates: QuestionTemplateDefinition[] = [];

    for (const row of rows) {
      const rawDistance = tableCellText(row, headerIndex, 'distance');
      const availabilityRaw = tableCellText(row, headerIndex, 'availability');
      const costRaw = tableCellText(row, headerIndex, 'cost');
      const timeRaw = tableCellText(row, headerIndex, 'time');
      const questionRaw = tableCellText(row, headerIndex, 'question');

      if (!rawDistance) {
        continue;
      }

      const distance = parseDistanceValue(rawDistance);
      if (!distance) {
        issues.push(
          createIssue({
            sheetName: sheet.name,
            rowNumber: row.rowNumber,
            columnName: 'distance',
            fieldPath: 'questionTemplates[].parameters.minimumDistance',
            severity: 'error',
            code: 'DISTANCE_PARSE_FAILED',
            message: 'Could not parse the thermometer distance value.',
            rawValue: rawDistance,
            normalizedValue: null,
            suggestedFix: 'Use a distance value with miles and metric text.',
            sheetCell: `A${row.rowNumber}`,
            blocking: true
          })
        );
        continue;
      }

      const reconciled = reconcilePrintedDistance(distance, rawDistance, row.rowNumber, 'distance', templates.length);
      const scaleSet = availabilityRaw ? normalizeScaleGate(availabilityRaw) ?? allScales(availabilityRaw) : allScales();

      templates.push({
        templateId: `thermometer-${Math.round(reconciled.distance.meters)}`,
        packId,
        categoryId: category.categoryId,
        name: reconciled.label,
        promptOverrides: questionRaw ? { promptTemplate: applyWorkbookCorrections(questionRaw) } : undefined,
        parameters: workbookQuestionParameters({
          question: questionRaw,
          cost: costRaw,
          time: timeRaw,
          availability: availabilityRaw,
          values: {
            minimumDistance: reconciled.distance
          }
        }),
        answerSchema: {
          kind: 'enum',
          allowedValues: ['hotter', 'colder']
        },
        resolverConfig: {
          requiresSeekerMovementHistory: true
        },
        constraintRefs: ['hotter-colder'],
        scaleSet,
        visibilityPolicy: PUBLIC_VISIBILITY,
        sourceProvenance: [
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'distance', rawDistance, rawDistance),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'availability', availabilityRaw, rawDistance),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'question', questionRaw, rawDistance)
        ]
      });
    }

    return { category, templates };
  }

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
      allowedValues: ['hotter', 'colder']
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

    const reconciled = reconcilePrintedDistance(distance, rawValue, row.rowNumber, 'A', templates.length);
    templates.push({
      templateId: `thermometer-${Math.round(reconciled.distance.meters)}`,
      packId,
      categoryId: category.categoryId,
      name: reconciled.label,
      parameters: {
        minimumDistance: reconciled.distance
      },
      answerSchema: {
        kind: 'enum',
        allowedValues: ['hotter', 'colder']
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
  if (sheetHasHeaders(sheet, ['distance', 'cost', 'time', 'question'])) {
    const headerIndex = buildHeaderIndex(sheet);
    const rows = dataRowsAfterHeader(sheet);
    const firstRow = rows[0];
    const category = buildCategory(
      sourceFileName,
      packId,
      sheet,
      'radar',
      'threshold_distance',
      'Radar',
      tableCellText(firstRow!, headerIndex, 'cost') ?? 'Draw 2, Pick 1',
      tableCellText(firstRow!, headerIndex, 'time') ?? '5 Minutes',
      tableCellText(firstRow!, headerIndex, 'question') ?? 'Are you within [Distance] of me?',
      allScales(),
      {
        kind: 'boolean',
        allowedValues: ['yes', 'no']
      },
      ['within-radius', 'outside-radius']
    );

    const templates: QuestionTemplateDefinition[] = [];

    for (const row of rows) {
      const rawDistance = tableCellText(row, headerIndex, 'distance');
      const costRaw = tableCellText(row, headerIndex, 'cost');
      const timeRaw = tableCellText(row, headerIndex, 'time');
      const questionRaw = tableCellText(row, headerIndex, 'question');

      if (!rawDistance) {
        continue;
      }

      if (collapseLineBreaks(rawDistance).toLowerCase() === 'choose') {
        templates.push({
          templateId: 'radar-choose',
          packId,
          categoryId: category.categoryId,
          name: 'Choose Distance',
          promptOverrides: questionRaw ? { promptTemplate: applyWorkbookCorrections(questionRaw) } : undefined,
          parameters: workbookQuestionParameters({
            question: questionRaw,
            cost: costRaw,
            time: timeRaw,
            values: {
              distanceMode: 'player_choice'
            }
          }),
          answerSchema: {
            kind: 'boolean',
            allowedValues: ['yes', 'no']
          },
          resolverConfig: {},
          constraintRefs: ['within-radius', 'outside-radius'],
          scaleSet: allScales(),
          visibilityPolicy: PUBLIC_VISIBILITY,
          sourceProvenance: [
            sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'distance', rawDistance, rawDistance)
          ]
        });

        continue;
      }

      const distance = parseDistanceValue(rawDistance);
      if (!distance) {
        issues.push(
          createIssue({
            sheetName: sheet.name,
            rowNumber: row.rowNumber,
            columnName: 'distance',
            fieldPath: 'questionTemplates[].parameters.distanceThreshold',
            severity: 'error',
            code: 'DISTANCE_PARSE_FAILED',
            message: 'Could not parse the radar distance value.',
            rawValue: rawDistance,
            normalizedValue: null,
            suggestedFix: 'Use a distance value with miles and metric text.',
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
        name: collapseLineBreaks(rawDistance),
        promptOverrides: questionRaw ? { promptTemplate: applyWorkbookCorrections(questionRaw) } : undefined,
        parameters: workbookQuestionParameters({
          question: questionRaw,
          cost: costRaw,
          time: timeRaw,
          values: {
            distanceThreshold: distance
          }
        }),
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
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'distance', rawDistance, rawDistance),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'question', questionRaw, rawDistance)
        ]
      });
    }

    return { category, templates };
  }

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
          distanceMode: 'player_choice'
        },
        answerSchema: {
          kind: 'boolean',
          allowedValues: ['yes', 'no']
        },
        resolverConfig: {},
        constraintRefs: ['within-radius', 'outside-radius'],
        scaleSet: allScales(),
        visibilityPolicy: PUBLIC_VISIBILITY,
        sourceProvenance: [
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'A', rawValue, rawValue)
        ]
      });

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
  if (sheetHasHeaders(sheet, ['place', 'distance', 'availability', 'cost', 'time', 'question'])) {
    const headerIndex = buildHeaderIndex(sheet);
    const rows = dataRowsAfterHeader(sheet);
    const firstRow = rows[0];
    const category: QuestionCategoryDefinition = {
      categoryId: 'tentacles',
      packId,
      name: 'Tentacles',
      resolverKind: 'nearest_candidate',
      promptTemplate: applyWorkbookCorrections(
        tableCellText(firstRow!, headerIndex, 'question') ?? 'Of all the [Places] within [Distance] of me, which are you closest to?'
      ),
      drawRule: parseDrawRule(tableCellText(firstRow!, headerIndex, 'cost') ?? 'Draw 4, Pick 2') ?? {
        drawCount: 4,
        pickCount: 2,
        rawText: 'Draw 4, Pick 2'
      },
      defaultTimerPolicy: {
        kind: 'fixed',
        durationSeconds: (parseFixedMinutes(tableCellText(firstRow!, headerIndex, 'time') ?? '5 Minutes') as TimeValue).seconds,
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
        sourceProvenance(sourceFileName, sheet.name, 1, 'place', 'Tentacles', 'Tentacles')
      ]
    };

    const templates: QuestionTemplateDefinition[] = [];

    for (const row of rows) {
      const rawPlace = tableCellText(row, headerIndex, 'place');
      const rawDistance = tableCellText(row, headerIndex, 'distance');
      const availabilityRaw = tableCellText(row, headerIndex, 'availability');
      const costRaw = tableCellText(row, headerIndex, 'cost');
      const timeRaw = tableCellText(row, headerIndex, 'time');
      const questionRaw = tableCellText(row, headerIndex, 'question');

      if (!rawPlace || !rawDistance) {
        continue;
      }

      const normalizedPlace = normalizeLabel(rawPlace);
      const distance = parseDistanceValue(rawDistance);

      if (!distance) {
        issues.push(
          createIssue({
            sheetName: sheet.name,
            rowNumber: row.rowNumber,
            columnName: 'distance',
            fieldPath: 'questionTemplates[].parameters.distanceThreshold',
            severity: 'error',
            code: 'DISTANCE_PARSE_FAILED',
            message: 'Could not parse the Tentacles distance value.',
            rawValue: rawDistance,
            normalizedValue: null,
            suggestedFix: 'Use a distance value with miles and metric text.',
            sheetCell: `B${row.rowNumber}`,
            blocking: true
          })
        );
        continue;
      }

      const scaleSet = availabilityRaw ? normalizeScaleGate(availabilityRaw) ?? allScales(availabilityRaw) : allScales();
      const featureClassId = registerFeatureTaxonomy(taxonomyById, rawPlace, sourceFileName, sheet.name, row.rowNumber);
      buildNormalizationIssue(
        issues,
        sourceFileName,
        sheet.name,
        row.rowNumber,
        'place',
        rawPlace,
        normalizedPlace.displayText,
        `questionTemplates[tentacles-${normalizedPlace.slug}-${Math.round(distance.meters)}].name`
      );

      templates.push({
        templateId: `tentacles-${normalizedPlace.slug}-${Math.round(distance.meters)}`,
        packId,
        categoryId: category.categoryId,
        name: `${normalizedPlace.displayText} within ${Math.round(distance.meters)}m`,
        promptOverrides: questionRaw ? { promptTemplate: applyWorkbookCorrections(questionRaw) } : undefined,
        featureClassRefs: [
          {
            featureClassId,
            label: normalizedPlace.displayText,
            rawLabel: rawPlace
          }
        ],
        parameters: workbookQuestionParameters({
          question: questionRaw,
          cost: costRaw,
          time: timeRaw,
          availability: availabilityRaw,
          values: {
            placeLabel: normalizedPlace.displayText,
            distanceThreshold: distance
          }
        }),
        answerSchema: {
          kind: 'feature_choice'
        },
        resolverConfig: {
          candidateSource: 'nearby_features'
        },
        constraintRefs: ['nearest-candidate-feature'],
        scaleSet,
        visibilityPolicy: PUBLIC_VISIBILITY,
        sourceProvenance: [
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'place', rawPlace, rawPlace),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'distance', rawDistance, rawPlace),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'availability', availabilityRaw, rawPlace)
        ]
      });
    }

    return { category, templates };
  }

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

const PHOTO_COMMON_RULEBOOK_GUIDANCE = 'Submit a photo that follows the full specifications below. If the requested subject does not exist in the hiding zone, the hider may answer “I cannot answer” and still draw a card. Send photos in the phone’s normal aspect ratio. Do not use Google Street View to judge photos or verify stations remotely.';

const PHOTO_RULEBOOK_SPECIFICATIONS: Record<string, string> = {
  'photos-a-tree': 'Include the entire tree.',
  'photos-the-sky': 'Place the phone on the ground and shoot straight up using the default lens with no zoom.',
  'photos-you': 'Use selfie mode. Hold the phone perpendicular to the ground, with your arm fully extended; use the default lens with no zoom.',
  'photos-widest-street': 'Include both sides of the street; the background is not required.',
  'photos-tallest-structure-in-your-sightline': 'Choose the tallest structure from the hider’s current perspective and sightline, not the objectively tallest one. Include the top and both sides, with the top in the upper third of the frame.',
  'photos-any-building-visible-from-station': 'Stand directly outside a transit-station entrance (choose an entrance if there are several). Include the building’s roof and both sides, with its top in the upper third of the frame.',
  'photos-tallest-building-visible-from-station': 'Choose the tallest building from the hider’s perspective and sightline, not the objectively tallest one. Stand directly outside a transit-station entrance (choose an entrance if there are several), and include the roof and both sides with the top in the upper third. The station itself does not count unless a separate tall building with a non-transit purpose sits above it, such as the MetLife building above Grand Central.',
  'photos-trace-nearest-street-path': 'Trace the nearest street or path from intersection to intersection, and make sure it appears in the mapping app. You may screenshot the map and black out everything else with the phone’s drawing tools, or trace the map onto paper placed over the phone.',
  'photos-two-buildings': 'Photograph two buildings, including the bottom of each and up to four stories.',
  'photos-restaurant-interior': 'Stand outside and take the photo through the restaurant window. Do not zoom.',
  'photos-train-platform': 'Show a 2 m × 2 m area with three distinct elements. The elements should let someone at that place confidently identify this location and distinguish it from elsewhere.',
  'photos-park': 'Do not zoom. Hold the phone perpendicular to the ground and stand at least 2 m from any obstruction.',
  'photos-grocery-store-aisle': 'Do not zoom. Stand at the end of the aisle and shoot straight down it.',
  'photos-place-of-worship': 'Show a 2 m × 2 m area with three distinct elements. The elements should let someone at that place confidently identify this location and distinguish it from elsewhere.',
  'photos-1-2-mile-of-streets-traced': 'Trace 1 km of streets continuously, including five turns, without doubling back. Orient the trace north–south and use streets shown in the mapping app.',
  'photos-tallest-mountain-visible-from-station': 'Choose the tallest mountain from the hider’s current perspective and sightline. Use at most 3× zoom and place the mountain top in the upper third of the frame.',
  'photos-biggest-body-of-water-in-your-zone': 'Use at most 3× zoom. Include either both sides of the body of water or the horizon.',
  'photos-five-buildings': 'Photograph five buildings, including the bottom of each and up to four stories.'
};

function photoRulebookGuidance(templateId: string): { text: string; source: string } | undefined {
  const specification = PHOTO_RULEBOOK_SPECIFICATIONS[templateId];
  if (!specification) return undefined;
  return {
    text: `${PHOTO_COMMON_RULEBOOK_GUIDANCE} ${specification}`,
    source: 'Scanned base rulebook, printed pp. 32–35'
  };
}

function buildPhotosTemplates(
  sourceFileName: string,
  packId: string,
  sheet: WorkbookSheet,
  issues: ImportIssue[]
): { category: QuestionCategoryDefinition; templates: QuestionTemplateDefinition[] } {
  if (sheetHasHeaders(sheet, ['subject', 'requirements', 'availability', 'cost', 'time', 'question'])) {
    const headerIndex = buildHeaderIndex(sheet);
    const rows = dataRowsAfterHeader(sheet);
    const firstRow = rows[0];
    const timerByScale = parseScaleAwareMinutes(tableCellText(firstRow!, headerIndex, 'time') ?? 'S/M: 10 Minutes L: 20 Minutes');

    if (!timerByScale) {
      throw new Error('Unable to parse Photos timer policy.');
    }

    const category: QuestionCategoryDefinition = {
      categoryId: 'photos',
      packId,
      name: 'Photos',
      resolverKind: 'photo_challenge',
      promptTemplate: applyWorkbookCorrections(tableCellText(firstRow!, headerIndex, 'question') ?? 'Send a photo of [subject].'),
      drawRule: parseDrawRule(tableCellText(firstRow!, headerIndex, 'cost') ?? 'Draw 1') ?? {
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
        sourceProvenance(sourceFileName, sheet.name, 1, 'subject', 'Photos', 'Photos')
      ]
    };

    const templates: QuestionTemplateDefinition[] = [];

    for (const row of rows) {
      const rawSubject = tableCellText(row, headerIndex, 'subject');
      const rawRequirements = tableCellText(row, headerIndex, 'requirements');
      const availabilityRaw = tableCellText(row, headerIndex, 'availability');
      const costRaw = tableCellText(row, headerIndex, 'cost');
      const timeRaw = tableCellText(row, headerIndex, 'time');
      const questionRaw = tableCellText(row, headerIndex, 'question');

      if (!rawSubject) {
        continue;
      }

      const normalizedSubject = normalizeLabel(rawSubject);
      const rulebookGuidance = photoRulebookGuidance(`photos-${normalizedSubject.slug}`);
      buildNormalizationIssue(
        issues,
        sourceFileName,
        sheet.name,
        row.rowNumber,
        'subject',
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
          description: rulebookGuidance
            ? 'Follow the scanned photo specification shown above; a referee confirms whether the photo meets it.'
            : applyWorkbookCorrections(rawRequirements ?? 'Manual review required.'),
          rawText: rawRequirements
        }
      ];

      const scaleSet = availabilityRaw ? normalizeScaleGate(availabilityRaw) ?? allScales(availabilityRaw) : allScales();

      templates.push({
        templateId: `photos-${normalizedSubject.slug}`,
        packId,
        categoryId: category.categoryId,
        name: normalizedSubject.displayText,
        promptOverrides: questionRaw ? { promptTemplate: applyWorkbookCorrections(questionRaw) } : undefined,
        parameters: {
          ...workbookQuestionParameters({
            question: questionRaw,
            cost: costRaw,
            time: timeRaw,
            availability: availabilityRaw,
            requirements: rawRequirements,
            values: {
              subject: normalizedSubject.displayText
            }
          }),
          ...(rulebookGuidance ? { rulebookGuidanceText: rulebookGuidance.text } : {})
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
        scaleSet,
        visibilityPolicy: PHOTO_VISIBILITY,
        sourceProvenance: [
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'subject', rawSubject, rawSubject),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'requirements', rawRequirements, rawSubject),
          sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'availability', availabilityRaw, rawSubject),
          ...(rulebookGuidance ? [generatedProvenance(rulebookGuidance.source, 'Photo challenge specifications paraphrased from the scanned base rulebook.')] : [])
        ]
      });
    }

    return { category, templates };
  }

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
    const rulebookGuidance = photoRulebookGuidance(`photos-${normalizedSubject.slug}`);
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
        description: rulebookGuidance
          ? 'Follow the scanned photo specification shown above; a referee confirms whether the photo meets it.'
          : applyWorkbookCorrections(rawRequirements ?? 'Manual review required.'),
        rawText: rawRequirements
      }
    ];

    templates.push({
      templateId: `photos-${normalizedSubject.slug}`,
      packId,
      categoryId: category.categoryId,
      name: normalizedSubject.displayText,
      parameters: {
        subject: normalizedSubject.displayText,
        ...(rulebookGuidance ? { rulebookGuidanceText: rulebookGuidance.text } : {})
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
        sourceProvenance(sourceFileName, sheet.name, row.rowNumber, 'B', rawRequirements, rawSubject),
        ...(rulebookGuidance ? [generatedProvenance(rulebookGuidance.source, 'Photo challenge specifications paraphrased from the scanned base rulebook.')] : [])
      ]
    });
  }

  return { category, templates };
}

export function looksLikeJetLagWorkbook(document: WorkbookDocument): boolean {
  const sheetNames = new Set(document.sheets.map((sheet) => sheet.name));
  const matchesCleaned = CLEANED_EXPECTED_SHEETS.every((sheetName) => sheetNames.has(sheetName));
  const matchesLegacy = LEGACY_EXPECTED_SHEETS.every((sheetName) => sheetNames.has(sheetName));

  return matchesCleaned || matchesLegacy;
}

export function mapJetLagWorkbookToContentPack(
  document: WorkbookDocument
): { pack: ContentPack; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const sourceFileName = document.sourceFileName;
  const packId = 'jet-lag-the-game-seed';

  const deckSheet = getSheetByAliases(document, SHEET_ALIASES.hiderDeck);
  const cursesSheet = getSheetByAliases(document, SHEET_ALIASES.curses);
  const matchingSheet = getSheetByAliases(document, SHEET_ALIASES.matching);
  const measuringSheet = getSheetByAliases(document, SHEET_ALIASES.measuring);
  const thermometerSheet = getSheetByAliases(document, SHEET_ALIASES.thermometer);
  const radarSheet = getSheetByAliases(document, SHEET_ALIASES.radar);
  const tentaclesSheet = getSheetByAliases(document, SHEET_ALIASES.tentacles);
  const photosSheet = getSheetByAliases(document, SHEET_ALIASES.photos);

  const featureTaxonomy = new Map<string, FeatureTaxonomyEntry>();

  const timeBonus = buildTimeBonusCards(sourceFileName, packId, 'hider-main', deckSheet, issues);
  const powerUps = buildPowerUpCards(sourceFileName, packId, 'hider-main', deckSheet, issues);
  const blankCard = buildBlankCard(sourceFileName, packId, 'hider-main', deckSheet);
  const curses = buildCurseCards(sourceFileName, packId, 'hider-main', cursesSheet, issues, deckSheet);

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
    .filter((sheetName) =>
      ![...LEGACY_EXPECTED_SHEETS, ...CLEANED_EXPECTED_SHEETS].includes(sheetName) ||
      sheetName === 'Form Responses 1'
    );

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
    rulesets: [buildBaseRuleset(packId)],
    decks: [deck],
    cards,
    questionCategories,
    questionTemplates,
    mapPresets: [buildBaseMapPreset(packId)],
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
