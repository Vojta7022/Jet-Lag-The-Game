import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  VisibleConstraintProjection,
  VisibleMapProjection,
  VisibleQuestionProjection
} from '../../../../../packages/shared-types/src/index.ts';

import { formatResolutionMode, summarizeAnswer } from './question-catalog.ts';

export type ResolutionTone = 'success' | 'warning' | 'info';

export interface QuestionMapEffectModel {
  questionLabel: string;
  categoryLabel: string;
  answerSummary: string;
  resolutionModeLabel: string;
  resolutionTone: ResolutionTone;
  resolutionDetail: string;
  mapEffectModeLabel: string;
  mapEffectTone: ResolutionTone;
  mapEffectTitle: string;
  mapEffectDetail: string;
  confidenceLabel: string;
  candidatePrecisionLabel: string;
  boundedLabel: string;
  artifactCountLabel: string;
  historySummary?: string;
  contradictionSummary?: string;
  reasoningSteps: string[];
  geometryEffect: 'pending' | 'map_updated' | 'overlay_only' | 'metadata_only';
}

interface BuildQuestionMapEffectModelArgs {
  question?: VisibleQuestionProjection;
  template?: QuestionTemplateDefinition;
  category?: QuestionCategoryDefinition;
  constraint?: VisibleConstraintProjection;
  visibleMap?: VisibleMapProjection;
}

function buildResolutionTone(
  mode: VisibleConstraintProjection['resolutionMode'] | undefined
): ResolutionTone {
  if (mode === 'exact') {
    return 'success';
  }

  if (mode === 'approximate') {
    return 'warning';
  }

  return 'info';
}

function describeResolutionMode(
  mode: VisibleConstraintProjection['resolutionMode'] | undefined
): string {
  if (mode === 'exact') {
    return 'Uses exact geometry clipped to the playable region boundary.';
  }

  if (mode === 'approximate') {
    return 'Uses approximate geometry or incomplete feature coverage. Treat the map shape as directional rather than exact.';
  }

  if (mode === 'metadata_only') {
    return 'Records evidence or metadata honestly without pretending to change geometry.';
  }

  return 'Waiting for authoritative constraint application.';
}

function findHistorySummary(
  visibleMap: VisibleMapProjection | undefined,
  constraintRecordId: string | undefined
) {
  if (!visibleMap || !constraintRecordId) {
    return undefined;
  }

  return visibleMap.history.find((entry) => entry.constraintRecordId === constraintRecordId);
}

function buildMapEffectDetails(
  constraint: VisibleConstraintProjection | undefined,
  visibleMap: VisibleMapProjection | undefined
): Pick<
  QuestionMapEffectModel,
  'mapEffectModeLabel' | 'mapEffectTone' | 'mapEffectTitle' | 'mapEffectDetail' | 'historySummary' | 'geometryEffect'
> {
  if (!constraint) {
    return {
      mapEffectModeLabel: 'Pending',
      mapEffectTone: 'info',
      mapEffectTitle: 'Waiting for map update',
      mapEffectDetail: 'The answer is recorded, but the authoritative constraint has not been applied yet.',
      geometryEffect: 'pending'
    };
  }

  const matchingHistory = findHistorySummary(visibleMap, constraint.constraintRecordId);
  const hasVisibleGeometryArtifacts = constraint.artifacts.some((artifact) => Boolean(artifact.geometry));
  const candidateChanged = Boolean(
    matchingHistory ||
      (constraint.beforeRemainingArtifactId &&
        constraint.afterRemainingArtifactId &&
        constraint.beforeRemainingArtifactId !== constraint.afterRemainingArtifactId)
  );

  if (constraint.resolutionMode === 'metadata_only') {
    return {
      mapEffectModeLabel: 'Recorded only',
      mapEffectTone: 'info',
      mapEffectTitle: 'Recorded without geometry',
      mapEffectDetail:
        matchingHistory?.summary ??
        'This result stays as evidence or metadata only, so the bounded candidate area does not pretend to change.',
      historySummary: matchingHistory?.summary,
      geometryEffect: 'metadata_only'
    };
  }

  if (candidateChanged) {
    return {
      mapEffectModeLabel: 'Map changed',
      mapEffectTone: 'success',
      mapEffectTitle: 'Search area updated',
      mapEffectDetail:
        matchingHistory?.summary ??
        'The bounded candidate area was recalculated inside the playable region.',
      historySummary: matchingHistory?.summary,
      geometryEffect: 'map_updated'
    };
  }

  if (hasVisibleGeometryArtifacts) {
    return {
      mapEffectModeLabel: 'Overlay only',
      mapEffectTone: 'warning',
      mapEffectTitle: 'Overlay added to the map',
      mapEffectDetail:
        'The result adds bounded map overlays, but the current projection does not show a direct remaining-area change.',
      historySummary: matchingHistory?.summary,
      geometryEffect: 'overlay_only'
    };
  }

  return {
    mapEffectModeLabel: 'Recorded only',
    mapEffectTone: 'info',
    mapEffectTitle: 'Result recorded',
    mapEffectDetail:
      matchingHistory?.summary ??
      'The authoritative runtime recorded the result, but no geometry change is visible in the current scope.',
    historySummary: matchingHistory?.summary,
    geometryEffect: 'metadata_only'
  };
}

export function buildQuestionMapEffectModel(
  args: BuildQuestionMapEffectModelArgs
): QuestionMapEffectModel | undefined {
  if (!args.question) {
    return undefined;
  }

  const constraint = args.constraint;
  const mapEffect = buildMapEffectDetails(constraint, args.visibleMap);
  const clippedArtifactCount = constraint?.artifacts.filter((artifact) => artifact.clippedToRegion).length ?? 0;

  return {
    questionLabel: args.template?.name ?? args.question.templateId,
    categoryLabel: args.category?.name ?? args.question.categoryId,
    answerSummary: summarizeAnswer(args.question.answer),
    resolutionModeLabel: formatResolutionMode(constraint?.resolutionMode),
    resolutionTone: buildResolutionTone(constraint?.resolutionMode),
    resolutionDetail: describeResolutionMode(constraint?.resolutionMode),
    mapEffectModeLabel: mapEffect.mapEffectModeLabel,
    mapEffectTone: mapEffect.mapEffectTone,
    mapEffectTitle: mapEffect.mapEffectTitle,
    mapEffectDetail: mapEffect.mapEffectDetail,
    confidenceLabel: constraint ? `${Math.round(constraint.confidenceScore * 100)}%` : 'Pending',
    candidatePrecisionLabel: args.visibleMap?.remainingArea?.precision ?? 'none',
    boundedLabel: constraint
      ? `${clippedArtifactCount}/${constraint.artifacts.length} artifacts clipped to the playable region`
      : 'Waiting for bounded result',
    artifactCountLabel: constraint
      ? `${constraint.artifacts.length} visible artifact${constraint.artifacts.length === 1 ? '' : 's'}`
      : 'No artifacts yet',
    historySummary: mapEffect.historySummary,
    contradictionSummary: constraint?.contradiction?.reason,
    reasoningSteps: constraint?.explanation.reasoningSteps ?? [],
    geometryEffect: mapEffect.geometryEffect
  };
}
