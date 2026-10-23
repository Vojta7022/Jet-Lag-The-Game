import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  ScaleKey,
  TimerPolicyRef
} from '../../../../../packages/shared-types/src/index.ts';

function formatMinutes(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  return totalMinutes === 1 ? '1 minute' : `${totalMinutes} minutes`;
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

export function formatHiderCardReward(
  category: QuestionCategoryDefinition,
  multiplier = 1
): string {
  const oneRewardSet = category.drawRule.rawText.trim() ||
    `Draw ${category.drawRule.drawCount}, Pick ${category.drawRule.pickCount}`;

  if (multiplier <= 1) {
    return oneRewardSet;
  }

  return `${multiplier} separate sets of ${oneRewardSet}`;
}
