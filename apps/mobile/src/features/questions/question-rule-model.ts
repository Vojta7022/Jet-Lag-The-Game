import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  ScaleKey,
  TimerPolicyRef
} from '../../../../../packages/shared-types/src/index.ts';

function hashText(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function sortTemplatesForRound(
  templates: QuestionTemplateDefinition[],
  round: number
): QuestionTemplateDefinition[] {
  return [...templates].sort((left, right) => {
    const leftWeight = hashText(`${round}:${left.templateId}`);
    const rightWeight = hashText(`${round}:${right.templateId}`);

    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }

    return left.templateId.localeCompare(right.templateId);
  });
}

function formatMinutes(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  return totalMinutes === 1 ? '1 minute' : `${totalMinutes} minutes`;
}

export interface QuestionSelectionRound {
  categoryId: string;
  round: number;
  availableTemplateIds: string[];
  drawnTemplateIds: string[];
  keptTemplateIds: string[];
}

export function filterTemplatesForScale(
  templates: QuestionTemplateDefinition[],
  selectedScale: ScaleKey | undefined
): QuestionTemplateDefinition[] {
  if (!selectedScale) {
    return templates;
  }

  return templates.filter((template) => template.scaleSet.appliesTo.includes(selectedScale));
}

export function resolveTimerPolicyDurationSeconds(
  timerPolicy: TimerPolicyRef,
  selectedScale: ScaleKey | undefined
): number | undefined {
  if (timerPolicy.kind === 'fixed') {
    return timerPolicy.durationSeconds;
  }

  if (!selectedScale) {
    return undefined;
  }

  return timerPolicy.durationSecondsByScale?.[selectedScale];
}

export function formatTimerPolicyLabel(
  timerPolicy: TimerPolicyRef,
  selectedScale: ScaleKey | undefined
): string {
  const directDuration = resolveTimerPolicyDurationSeconds(timerPolicy, selectedScale);
  if (directDuration !== undefined) {
    return formatMinutes(directDuration);
  }

  const byScale = timerPolicy.durationSecondsByScale ?? {};
  const smallMedium = byScale.small !== undefined && byScale.medium !== undefined && byScale.small === byScale.medium
    ? `${formatMinutes(byScale.small)} in small and medium`
    : [
        byScale.small !== undefined ? `Small ${formatMinutes(byScale.small)}` : undefined,
        byScale.medium !== undefined ? `Medium ${formatMinutes(byScale.medium)}` : undefined
      ]
        .filter((value): value is string => Boolean(value))
        .join(' · ');
  const large = byScale.large !== undefined ? `Large ${formatMinutes(byScale.large)}` : undefined;

  return [smallMedium || undefined, large]
    .filter((value): value is string => Boolean(value))
    .join(' · ') || 'Manual time limit';
}

export function formatQuestionDrawRule(category: QuestionCategoryDefinition): string {
  if (category.drawRule.rawText.trim().length > 0) {
    return category.drawRule.rawText.trim();
  }

  return `Draw ${category.drawRule.drawCount}, Pick ${category.drawRule.pickCount}`;
}

export function createQuestionSelectionRound(args: {
  category: QuestionCategoryDefinition;
  templates: QuestionTemplateDefinition[];
  selectedScale?: ScaleKey;
  previousRound?: QuestionSelectionRound;
}): QuestionSelectionRound {
  const availableTemplates = filterTemplatesForScale(args.templates, args.selectedScale);
  const nextRoundNumber = (args.previousRound?.round ?? 0) + 1;
  const drawnTemplates = sortTemplatesForRound(availableTemplates, nextRoundNumber)
    .slice(0, Math.max(1, Math.min(args.category.drawRule.drawCount, availableTemplates.length)));

  return {
    categoryId: args.category.categoryId,
    round: nextRoundNumber,
    availableTemplateIds: availableTemplates.map((template) => template.templateId),
    drawnTemplateIds: drawnTemplates.map((template) => template.templateId),
    keptTemplateIds:
      args.category.drawRule.pickCount === 1 && drawnTemplates[0]
        ? [drawnTemplates[0].templateId]
        : []
  };
}

export function toggleKeptQuestionTemplate(
  currentRound: QuestionSelectionRound,
  templateId: string,
  pickCount: number
): QuestionSelectionRound {
  const currentlyKept = currentRound.keptTemplateIds.includes(templateId);
  if (currentlyKept) {
    return {
      ...currentRound,
      keptTemplateIds: currentRound.keptTemplateIds.filter((candidate) => candidate !== templateId)
    };
  }

  const nextKept = [...currentRound.keptTemplateIds, templateId];
  return {
    ...currentRound,
    keptTemplateIds: nextKept.slice(-pickCount)
  };
}

export function canAskPreparedQuestion(
  round: QuestionSelectionRound | undefined,
  category: QuestionCategoryDefinition | undefined
): boolean {
  if (!round || !category) {
    return false;
  }

  return round.keptTemplateIds.length >= Math.max(1, category.drawRule.pickCount);
}

export function consumePreparedQuestionTemplate(
  round: QuestionSelectionRound | undefined,
  templateId: string
): QuestionSelectionRound | undefined {
  if (!round) {
    return undefined;
  }

  const keptTemplateIds = round.keptTemplateIds.filter((candidate) => candidate !== templateId);
  const drawnTemplateIds = round.drawnTemplateIds.filter((candidate) => candidate !== templateId);

  return {
    ...round,
    keptTemplateIds,
    drawnTemplateIds
  };
}
