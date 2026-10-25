import type {
  CommandEnvelope,
  ContentPack,
  MatchAggregate,
  QuestionFeatureDatasetModel
} from '../../shared-types/src/index.ts';
import type { QuestionFeatureDataProvider } from '../../geo/src/index.ts';
import { TransportRuntimeError } from './errors.ts';

export async function loadQuestionFeatureDataset(args: {
  aggregate?: MatchAggregate;
  contentPack: ContentPack;
  envelope: CommandEnvelope;
  provider?: QuestionFeatureDataProvider;
}): Promise<QuestionFeatureDatasetModel | undefined> {
  const command = args.envelope.command;
  if (!args.aggregate?.mapRegion) return undefined;
  if (command.type === 'set_hiding_zone') {
    if (args.aggregate.mode !== 'online' || !args.provider) return undefined;
    try {
      return await args.provider.load({
        featureClassIds: ['rail-station'],
        regionGeometry: args.aggregate.mapRegion.boundaryGeometry
      });
    } catch {
      throw new TransportRuntimeError(
        'TRANSIT_STATION_DATA_UNAVAILABLE',
        'The shared map feature service is temporarily unavailable. Try selecting the station again shortly.'
      );
    }
  }
  if (!args.provider) return undefined;
  if (command.type !== 'ask_question') return undefined;

  const template = args.contentPack.questionTemplates.find((candidate) =>
    candidate.templateId === command.payload.templateId);
  if (!template) return undefined;
  const category = args.contentPack.questionCategories.find((candidate) =>
    candidate.categoryId === template.categoryId);
  if (
    category?.resolverKind !== 'nearest_feature_match' &&
    category?.resolverKind !== 'comparative_distance' &&
    category?.resolverKind !== 'nearest_candidate'
  ) return undefined;
  const featureClassIds = (template.featureClassRefs ?? []).map((feature) => feature.featureClassId);
  if (featureClassIds.length === 0) return undefined;

  try {
    return await args.provider.load({
      featureClassIds,
      regionGeometry: args.aggregate.mapRegion.boundaryGeometry
    });
  } catch {
    throw new TransportRuntimeError(
      'QUESTION_FEATURE_DATA_UNAVAILABLE',
      'The shared map feature service is temporarily unavailable. Try again shortly, or choose another question.'
    );
  }
}
