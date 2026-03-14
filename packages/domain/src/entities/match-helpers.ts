import type {
  CardInstanceModel,
  MatchAggregate,
  MatchRole,
  LocationSampleModel,
  ProjectionScope,
  QuestionInstanceModel,
  TeamModel,
  TimerModel
} from '../../../shared-types/src/index.ts';

export function getPlayerRole(aggregate: MatchAggregate, playerId: string | undefined): MatchRole | undefined {
  if (!playerId) {
    return undefined;
  }

  return aggregate.roleAssignments[playerId]?.role;
}

export function getPlayerTeam(aggregate: MatchAggregate, playerId: string | undefined): TeamModel | undefined {
  if (!playerId) {
    return undefined;
  }

  const teamId = aggregate.roleAssignments[playerId]?.teamId;
  return teamId ? aggregate.teams[teamId] : undefined;
}

export function getActiveQuestion(aggregate: MatchAggregate): QuestionInstanceModel | undefined {
  return aggregate.activeQuestionInstanceId
    ? aggregate.questionInstances[aggregate.activeQuestionInstanceId]
    : undefined;
}

export function getTimerByKind(aggregate: MatchAggregate, kind: TimerModel['kind']): TimerModel | undefined {
  return Object.values(aggregate.timers).find((timer) => timer.kind === kind && timer.status !== 'completed');
}

export function getCardInstance(aggregate: MatchAggregate, cardInstanceId: string): CardInstanceModel | undefined {
  return aggregate.cardInstances[cardInstanceId];
}

export function getHandCardsForHolder(
  aggregate: MatchAggregate,
  holderType: CardInstanceModel['holderType'],
  holderId: string
): CardInstanceModel[] {
  return Object.values(aggregate.cardInstances).filter(
    (card) => card.zone === 'hand' && card.holderType === holderType && card.holderId === holderId
  );
}

export function scopeCanView(scope: ProjectionScope, visibleTo: ProjectionScope[]): boolean {
  return visibleTo.includes(scope);
}

export function getPlayerLocationSamples(
  aggregate: MatchAggregate,
  playerId: string | undefined
): LocationSampleModel[] {
  if (!playerId) {
    return [];
  }

  return aggregate.locationSamples
    .filter((sample) => sample.playerId === playerId)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
}

export function getLatestPlayerLocation(
  aggregate: MatchAggregate,
  playerId: string | undefined
): LocationSampleModel | undefined {
  return getPlayerLocationSamples(aggregate, playerId).at(-1);
}
