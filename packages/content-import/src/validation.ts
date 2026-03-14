import type { ContentPack, ImportIssue } from '../../shared-types/src/index.ts';

import { createIssue } from './issues.ts';

function findDuplicates(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

export function validateContentPack(pack: ContentPack): ImportIssue[] {
  const issues: ImportIssue[] = [];

  for (const duplicate of findDuplicates(pack.cards.map((card) => card.cardDefinitionId))) {
    issues.push(
      createIssue({
        sheetName: 'content-pack',
        rowNumber: 1,
        columnName: 'cards',
        fieldPath: 'cards',
        severity: 'error',
        code: 'DUPLICATE_NORMALIZED_ID',
        message: `Duplicate cardDefinitionId detected: ${duplicate}`,
        rawValue: duplicate,
        normalizedValue: duplicate,
        suggestedFix: 'Ensure every normalized card ID is unique.',
        blocking: true
      })
    );
  }

  for (const duplicate of findDuplicates(pack.questionTemplates.map((template) => template.templateId))) {
    issues.push(
      createIssue({
        sheetName: 'content-pack',
        rowNumber: 1,
        columnName: 'questionTemplates',
        fieldPath: 'questionTemplates',
        severity: 'error',
        code: 'DUPLICATE_NORMALIZED_ID',
        message: `Duplicate templateId detected: ${duplicate}`,
        rawValue: duplicate,
        normalizedValue: duplicate,
        suggestedFix: 'Ensure every normalized template ID is unique.',
        blocking: true
      })
    );
  }

  const cardIds = new Set(pack.cards.map((card) => card.cardDefinitionId));
  const categoryIds = new Set(pack.questionCategories.map((category) => category.categoryId));
  const constraintIds = new Set(pack.constraints.map((constraint) => constraint.constraintId));
  const featureTaxonomyIds = new Set((pack.featureTaxonomy ?? []).map((entry) => entry.featureClassId));

  for (const deck of pack.decks) {
    const computedTotal = deck.entries.reduce((sum, entry) => sum + entry.quantity, 0);
    for (const entry of deck.entries) {
      if (!cardIds.has(entry.cardDefinitionId)) {
        issues.push(
          createIssue({
            sheetName: 'content-pack',
            rowNumber: 1,
            columnName: 'decks',
            fieldPath: `decks[${deck.deckId}].entries[${entry.cardDefinitionId}]`,
            severity: 'error',
            code: 'MISSING_CARD_REFERENCE',
            message: `Deck entry references missing cardDefinitionId: ${entry.cardDefinitionId}`,
            rawValue: entry.cardDefinitionId,
            normalizedValue: null,
            suggestedFix: 'Create the missing card definition or remove the deck entry.',
            blocking: true
          })
        );
      }
    }

    const summary = deck.summary as Record<string, unknown> | undefined;
    const expectedTotal = typeof summary?.expectedTotalCards === 'number' ? summary.expectedTotalCards : undefined;
    if (expectedTotal !== undefined && expectedTotal !== computedTotal) {
      issues.push(
        createIssue({
          sheetName: 'content-pack',
          rowNumber: 1,
          columnName: 'decks',
          fieldPath: `decks[${deck.deckId}].summary.expectedTotalCards`,
          severity: 'error',
          code: 'DECK_TOTAL_MISMATCH',
          message: `Deck total mismatch for ${deck.deckId}. Expected ${expectedTotal}, got ${computedTotal}.`,
          rawValue: expectedTotal,
          normalizedValue: computedTotal,
          suggestedFix: 'Reconcile deck entry quantities with the deck summary.',
          blocking: true
        })
      );
    }
  }

  for (const template of pack.questionTemplates) {
    if (!categoryIds.has(template.categoryId)) {
      issues.push(
        createIssue({
          sheetName: 'content-pack',
          rowNumber: 1,
          columnName: 'questionTemplates',
          fieldPath: `questionTemplates[${template.templateId}].categoryId`,
          severity: 'error',
          code: 'MISSING_CATEGORY_REFERENCE',
          message: `Question template references missing categoryId: ${template.categoryId}`,
          rawValue: template.categoryId,
          normalizedValue: null,
          suggestedFix: 'Create the missing category or fix the template category reference.',
          blocking: true
        })
      );
    }

    for (const constraintRef of template.constraintRefs) {
      if (!constraintIds.has(constraintRef)) {
        issues.push(
          createIssue({
            sheetName: 'content-pack',
            rowNumber: 1,
            columnName: 'questionTemplates',
            fieldPath: `questionTemplates[${template.templateId}].constraintRefs`,
            severity: 'error',
            code: 'MISSING_CONSTRAINT_REFERENCE',
            message: `Question template references missing constraintId: ${constraintRef}`,
            rawValue: constraintRef,
            normalizedValue: null,
            suggestedFix: 'Create the missing constraint definition or update the template reference.',
            blocking: true
          })
        );
      }
    }

    for (const featureRef of template.featureClassRefs ?? []) {
      if (!featureTaxonomyIds.has(featureRef.featureClassId)) {
        issues.push(
          createIssue({
            sheetName: 'content-pack',
            rowNumber: 1,
            columnName: 'questionTemplates',
            fieldPath: `questionTemplates[${template.templateId}].featureClassRefs`,
            severity: 'warning',
            code: 'UNRESOLVED_FEATURE_CLASS',
            message: `Feature class is referenced by a template but missing from the feature taxonomy: ${featureRef.featureClassId}`,
            rawValue: featureRef.featureClassId,
            normalizedValue: null,
            suggestedFix: 'Add the feature class to the taxonomy or remove the dangling reference.'
          })
        );
      }
    }

    if ((template.parameters as Record<string, unknown> | undefined)?.distanceMode === 'manual-choice') {
      issues.push(
        createIssue({
          sheetName: 'content-pack',
          rowNumber: 1,
          columnName: 'questionTemplates',
          fieldPath: `questionTemplates[${template.templateId}].parameters.distanceMode`,
          severity: 'warning',
          code: 'AMBIGUOUS_MANUAL_TEMPLATE',
          message: 'This template still requires a bounded ruleset-defined choice before publication.',
          rawValue: 'manual-choice',
          normalizedValue: 'manual-choice',
          suggestedFix: 'Complete the distance bounds in a follow-up content edit.',
          blocking: true
        })
      );
    }
  }

  if (pack.rulesets.length === 0) {
    issues.push(
      createIssue({
        sheetName: 'content-pack',
        rowNumber: 1,
        columnName: 'rulesets',
        fieldPath: 'rulesets',
        severity: 'warning',
        code: 'MISSING_RULESET',
        message: 'The workbook does not define rulesets, so the imported pack remains draft-only.',
        rawValue: [],
        normalizedValue: [],
        suggestedFix: 'Add a ruleset definition before publishing the pack.'
      })
    );
  }

  if (pack.mapPresets.length === 0) {
    issues.push(
      createIssue({
        sheetName: 'content-pack',
        rowNumber: 1,
        columnName: 'mapPresets',
        fieldPath: 'mapPresets',
        severity: 'warning',
        code: 'MISSING_MAP_PRESET',
        message: 'The workbook does not define map presets, so the imported pack remains draft-only.',
        rawValue: [],
        normalizedValue: [],
        suggestedFix: 'Add a map preset definition before publishing the pack.'
      })
    );
  }

  return issues;
}
