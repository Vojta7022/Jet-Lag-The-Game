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

function formatCandidatePrecisionLabel(precision: string | undefined): string {
  if (precision === 'exact') {
    return 'Exact visible boundary';
  }

  if (precision === 'approximate') {
    return 'Approximate visible boundary';
  }

  if (precision === 'metadata_only') {
    return 'Evidence only';
  }

  return 'Not visible yet';
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
    return 'The runtime produced a directly clipped geometry result inside the playable region boundary.';
  }

  if (mode === 'approximate') {
    return 'The runtime narrowed the map using approximate geometry or incomplete feature coverage. Treat the shape as directional rather than exact.';
  }

  if (mode === 'metadata_only') {
    return 'The runtime recorded evidence or metadata honestly without pretending to change geometry.';
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
      mapEffectTitle: 'Waiting for map outcome',
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
      mapEffectModeLabel: 'Map unchanged',
      mapEffectTone: 'info',
      mapEffectTitle: 'Map stayed the same',
      mapEffectDetail:
        matchingHistory?.summary ??
        'This result stayed as evidence or metadata only, so the bounded candidate area did not pretend to change.',
      historySummary: matchingHistory?.summary,
      geometryEffect: 'metadata_only'
    };
  }

  if (candidateChanged) {
    return {
      mapEffectModeLabel: 'Map changed',
      mapEffectTone: 'success',
      mapEffectTitle: 'Search area changed',
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
      mapEffectTitle: 'Map overlay added',
      mapEffectDetail:
        'The result added bounded map overlays, but the visible remaining search area did not clearly shrink in this scope.',
      historySummary: matchingHistory?.summary,
      geometryEffect: 'overlay_only'
    };
  }

  return {
    mapEffectModeLabel: 'Map unchanged',
    mapEffectTone: 'info',
    mapEffectTitle: 'Map did not visibly change',
    mapEffectDetail:
      matchingHistory?.summary ??
      'The authoritative runtime recorded the result, but no trustworthy geometry change is visible in the current scope.',
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
    questionLabel: args.template?.name ?? 'Selected question',
    categoryLabel: args.category?.name ?? 'Question category',
    answerSummary: summarizeAnswer(args.question.answer),
    resolutionModeLabel: formatResolutionMode(constraint?.resolutionMode),
    resolutionTone: buildResolutionTone(constraint?.resolutionMode),
    resolutionDetail: describeResolutionMode(constraint?.resolutionMode),
    mapEffectModeLabel: mapEffect.mapEffectModeLabel,
    mapEffectTone: mapEffect.mapEffectTone,
    mapEffectTitle: mapEffect.mapEffectTitle,
    mapEffectDetail: mapEffect.mapEffectDetail,
    confidenceLabel: constraint ? `${Math.round(constraint.confidenceScore * 100)}%` : 'Pending',
    candidatePrecisionLabel: formatCandidatePrecisionLabel(args.visibleMap?.remainingArea?.precision),
    boundedLabel: constraint
      ? `${clippedArtifactCount} of ${constraint.artifacts.length} visible map layer${constraint.artifacts.length === 1 ? '' : 's'} stayed inside the playable region`
      : 'Waiting for the bounded map result',
    artifactCountLabel: constraint
      ? `${constraint.artifacts.length} visible map layer${constraint.artifacts.length === 1 ? '' : 's'}`
      : 'No visible map layers yet',
    historySummary: mapEffect.historySummary,
    contradictionSummary: constraint?.contradiction?.reason,
    reasoningSteps: constraint?.explanation.reasoningSteps ?? [],
    geometryEffect: mapEffect.geometryEffect
  };
}
