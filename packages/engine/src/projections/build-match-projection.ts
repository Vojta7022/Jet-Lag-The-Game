import type {
  ContentPack,
  MatchAggregate,
  MatchProjection,
  ProjectionViewer,
  SpatialArtifactModel
} from '../../../shared-types/src/index.ts';

import {
  getPlayerRole,
  getPlayerTeam,
  scopeCanView
} from '../../../domain/src/index.ts';

function canViewRoles(viewer: ProjectionViewer): boolean {
  return viewer.scope === 'authority' || viewer.scope === 'host_admin' || viewer.scope === 'team_private' || viewer.scope === 'player_private';
}

function canViewCard(
  aggregate: MatchAggregate,
  viewer: ProjectionViewer,
  card: MatchAggregate['cardInstances'][string]
): boolean {
  if (!scopeCanView(viewer.scope, card.visibilityPolicy.visibleTo)) {
    return false;
  }

  if (viewer.scope === 'authority' || viewer.scope === 'host_admin') {
    return true;
  }

  if (viewer.scope === 'team_private') {
    return card.holderType === 'team' && card.holderId === viewer.viewerTeamId;
  }

  if (viewer.scope === 'player_private') {
    return card.holderType === 'player' && card.holderId === viewer.viewerPlayerId;
  }

  return false;
}

function canViewQuestionAnswer(aggregate: MatchAggregate, viewer: ProjectionViewer): boolean {
  if (viewer.scope === 'authority' || viewer.scope === 'host_admin') {
    return true;
  }

  if (viewer.viewerPlayerId) {
    const role = getPlayerRole(aggregate, viewer.viewerPlayerId);
    return role === 'hider' || role === 'seeker';
  }

  return viewer.scope === 'public_match';
}

function toVisibleArtifact(artifact: SpatialArtifactModel) {
  return {
    artifactId: artifact.artifactId,
    kind: artifact.kind,
    regionId: artifact.regionId,
    geometry: artifact.geometry,
    precision: artifact.precision,
    clippedToRegion: artifact.clippedToRegion,
    featureCoverage: artifact.featureCoverage,
    explanation: artifact.explanation,
    metadata: artifact.metadata
  };
}

export function buildMatchProjection(
  aggregate: MatchAggregate,
  _contentPack: ContentPack,
  viewer: ProjectionViewer
): MatchProjection {
  const players = Object.values(aggregate.players).map((player) => {
    const assignment = aggregate.roleAssignments[player.playerId];
    return {
      playerId: player.playerId,
      displayName: player.displayName,
      connectionState: player.connectionState,
      role: canViewRoles(viewer) ? assignment?.role : undefined,
      teamId: canViewRoles(viewer) ? assignment?.teamId : undefined
    };
  });

  const teams = Object.values(aggregate.teams).map((team) => ({
    teamId: team.teamId,
    side: team.side,
    name: team.name,
    memberPlayerIds: team.memberPlayerIds
  }));

  const visibleCards = Object.values(aggregate.cardInstances)
    .filter((card) => canViewCard(aggregate, viewer, card))
    .map((card) => ({
      cardInstanceId: card.cardInstanceId,
      cardDefinitionId: card.cardDefinitionId,
      zone: card.zone,
      holderType: card.holderType,
      holderId: card.holderId
    }));

  const visibleQuestions = Object.values(aggregate.questionInstances).map((question) => ({
    questionInstanceId: question.questionInstanceId,
    templateId: question.templateId,
    categoryId: question.categoryId,
    status: question.status,
    askedByPlayerId: question.askedByPlayerId,
    targetTeamId: question.targetTeamId,
    answer: canViewQuestionAnswer(aggregate, viewer) ? question.answer : undefined
  }));

  const visibleConstraints = Object.values(aggregate.constraints).map((constraint) => ({
    constraintRecordId: constraint.constraintRecordId,
    constraintId: constraint.constraintId,
    status: constraint.status,
    resolutionMode: constraint.resolutionMode,
    artifacts: constraint.artifacts.map((artifact) => toVisibleArtifact(artifact)),
    metadata: constraint.metadata
  }));

  const visibleMap =
    aggregate.mapRegion && aggregate.searchArea
      ? {
          regionId: aggregate.mapRegion.regionId,
          displayName: aggregate.mapRegion.displayName,
          regionKind: aggregate.mapRegion.regionKind,
          featureDatasetRefs:
            viewer.scope === 'authority' || viewer.scope === 'host_admin'
              ? aggregate.mapRegion.featureDatasetRefs
              : [],
          playableBoundary: toVisibleArtifact(aggregate.mapRegion.boundaryArtifact),
          remainingArea: toVisibleArtifact(aggregate.searchArea.remainingArea),
          eliminatedAreas: aggregate.searchArea.eliminatedAreas.map((artifact) => toVisibleArtifact(artifact)),
          constraintArtifacts: aggregate.searchArea.constraintArtifacts.map((artifact) =>
            toVisibleArtifact(artifact)
          )
        }
      : undefined;

  const visibleTimers = Object.values(aggregate.timers).map((timer) => ({
    timerId: timer.timerId,
    kind: timer.kind,
    status: timer.status,
    remainingSeconds: timer.remainingSeconds
  }));

  const hiddenState =
    viewer.scope === 'authority' || viewer.scope === 'host_admin'
      ? aggregate.hiddenState
      : undefined;

  const activeCardResolution =
    viewer.scope === 'public_match' || viewer.scope === 'event_feed_public'
      ? undefined
      : aggregate.activeCardResolution
        ? {
            sourceCardInstanceId: aggregate.activeCardResolution.sourceCardInstanceId
          }
        : undefined;

  return {
    matchId: aggregate.matchId,
    contentPackId: aggregate.contentPackId,
    lifecycleState: aggregate.lifecycleState,
    seekPhaseSubstate: aggregate.seekPhaseSubstate,
    paused: aggregate.paused,
    selectedRulesetId:
      viewer.scope === 'authority' || viewer.scope === 'host_admin' ? aggregate.selectedRulesetId : undefined,
    players,
    teams,
    visibleCards,
    visibleQuestions,
    visibleConstraints,
    visibleMap,
    visibleTimers,
    activeCardResolution,
    hiddenState
  };
}
