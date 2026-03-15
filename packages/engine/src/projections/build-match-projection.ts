import type {
  AttachmentModel,
  ChatChannelModel,
  ContentPack,
  MatchAggregate,
  MatchProjection,
  ProjectionViewer,
  SpatialArtifactModel,
  VisibleAttachmentProjection
} from '../../../shared-types/src/index.ts';

import {
  getPlayerRole,
  getPlayerTeam,
  scopeCanView
} from '../../../domain/src/index.ts';

function canViewRoles(viewer: ProjectionViewer): boolean {
  return viewer.scope === 'authority' || viewer.scope === 'host_admin' || viewer.scope === 'team_private' || viewer.scope === 'player_private';
}

function canViewerAccessVisibility(
  viewer: ProjectionViewer,
  visibilityScope: ChatChannelModel['visibilityScope'],
  options?: {
    teamId?: string;
    playerId?: string;
  }
): boolean {
  if (viewer.scope === 'authority' || viewer.scope === 'host_admin') {
    return true;
  }

  if (visibilityScope === 'public_match' || visibilityScope === 'event_feed_public') {
    return viewer.scope === 'public_match' || viewer.scope === 'team_private' || viewer.scope === 'player_private';
  }

  if (visibilityScope === 'team_private') {
    return Boolean(
      (viewer.scope === 'team_private' || viewer.scope === 'player_private') &&
      options?.teamId &&
      viewer.viewerTeamId === options.teamId
    );
  }

  if (visibilityScope === 'player_private') {
    return Boolean(viewer.scope === 'player_private' && options?.playerId === viewer.viewerPlayerId);
  }

  return false;
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
    if (card.holderType === 'player') {
      return card.holderId === viewer.viewerPlayerId;
    }

    return card.holderType === 'team' && card.holderId === viewer.viewerTeamId;
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

function canViewMovementSample(aggregate: MatchAggregate, viewer: ProjectionViewer, sample: MatchAggregate['locationSamples'][number]): boolean {
  if (sample.role === 'hider' || sample.role === 'system') {
    return false;
  }

  if (viewer.scope === 'authority' || viewer.scope === 'host_admin') {
    return true;
  }

  const viewerRole = viewer.viewerPlayerId
    ? getPlayerRole(aggregate, viewer.viewerPlayerId) ?? viewer.viewerRole
    : viewer.viewerRole;
  const viewerTeamId = viewer.viewerTeamId ?? getPlayerTeam(aggregate, viewer.viewerPlayerId)?.teamId;

  if (viewerRole !== 'seeker') {
    return false;
  }

  if (viewer.scope === 'player_private') {
    return sample.playerId === viewer.viewerPlayerId || sample.teamId === viewerTeamId;
  }

  if (viewer.scope === 'team_private') {
    return sample.teamId === viewerTeamId;
  }

  return false;
}

function sanitizeQuestionAnswer(
  viewer: ProjectionViewer,
  answer: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!answer) {
    return undefined;
  }

  if (viewer.scope === 'public_match' || viewer.scope === 'event_feed_public') {
    const { attachmentIds: _attachmentIds, ...rest } = answer;
    return rest;
  }

  return answer;
}

function canViewChatChannel(viewer: ProjectionViewer, channel: ChatChannelModel): boolean {
  return canViewerAccessVisibility(viewer, channel.visibilityScope, {
    teamId: channel.teamId
  });
}

function canViewAttachment(viewer: ProjectionViewer, attachment: AttachmentModel): boolean {
  return canViewerAccessVisibility(viewer, attachment.visibilityScope, {
    teamId: attachment.ownerTeamId,
    playerId: attachment.ownerPlayerId
  });
}

function buildVisibleAttachmentStorage(
  attachment: AttachmentModel
): VisibleAttachmentProjection['storage'] | undefined {
  const metadata = attachment.captureMetadata ?? {};
  const storageState = typeof metadata.storageState === 'string' ? metadata.storageState : undefined;
  const provider = typeof metadata.storageProvider === 'string' ? metadata.storageProvider : undefined;
  const bucket = typeof metadata.storageBucket === 'string' ? metadata.storageBucket : undefined;
  const objectPath = typeof metadata.storageObjectPath === 'string' ? metadata.storageObjectPath : undefined;
  const previewObjectPath =
    typeof metadata.storagePreviewObjectPath === 'string' ? metadata.storagePreviewObjectPath : undefined;
  const uploadedAt = typeof metadata.storageUploadedAt === 'string' ? metadata.storageUploadedAt : undefined;
  const byteSize =
    typeof metadata.storageByteSize === 'number'
      ? metadata.storageByteSize
      : typeof metadata.fileSizeBytes === 'number'
        ? metadata.fileSizeBytes
        : undefined;

  if (!storageState && !provider && !bucket && !objectPath && !previewObjectPath) {
    return undefined;
  }

  return {
    provider: provider ?? 'unknown',
    storageState: storageState ?? 'metadata_record_only',
    bucket,
    objectPath,
    previewObjectPath,
    uploadedAt,
    byteSize,
    requiresAuthenticatedAccess: Boolean(objectPath || previewObjectPath)
  };
}

function canViewEventLogEntry(
  viewer: ProjectionViewer,
  entry: MatchAggregate['eventLog'][number]
): boolean {
  if (viewer.scope === 'authority' || viewer.scope === 'host_admin') {
    return true;
  }

  return entry.visibilityScope === 'public_match' || entry.visibilityScope === 'event_feed_public';
}

function toVisibleArtifact(artifact: SpatialArtifactModel) {
  return {
    artifactId: artifact.artifactId,
    kind: artifact.kind,
    regionId: artifact.regionId,
    geometry: artifact.geometry,
    precision: artifact.precision,
    confidenceScore: artifact.confidenceScore,
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

  const movementTrackMap = new Map<string, MatchProjection['visibleMovementTracks'][number]>();
  for (const sample of aggregate.locationSamples
    .filter((candidate) => canViewMovementSample(aggregate, viewer, candidate))
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))) {
    const existing = movementTrackMap.get(sample.playerId);
    const displayName = aggregate.players[sample.playerId]?.displayName ?? sample.playerId;
    const projectedSample = {
      sampleId: sample.sampleId,
      playerId: sample.playerId,
      displayName,
      role: sample.role,
      teamId: sample.teamId,
      latitude: sample.latitude,
      longitude: sample.longitude,
      accuracyMeters: sample.accuracyMeters,
      source: sample.source,
      recordedAt: sample.recordedAt
    };

    if (!existing) {
      movementTrackMap.set(sample.playerId, {
        playerId: sample.playerId,
        displayName,
        role: sample.role,
        teamId: sample.teamId,
        sampleCount: 1,
        latestSample: projectedSample,
        samples: [projectedSample]
      });
      continue;
    }

    existing.samples.push(projectedSample);
    existing.sampleCount += 1;
    existing.latestSample = projectedSample;
  }

  const visibleMovementTracks = [...movementTrackMap.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );

  const visibleChatChannels = Object.values(aggregate.chatChannels)
    .filter((channel) => canViewChatChannel(viewer, channel))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .map((channel) => ({
      channelId: channel.channelId,
      kind: channel.kind,
      displayName: channel.displayName,
      visibilityScope: channel.visibilityScope,
      teamId: channel.teamId
    }));

  const visibleAttachments = Object.values(aggregate.attachments)
    .filter((attachment) => canViewAttachment(viewer, attachment))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((attachment) => ({
      attachmentId: attachment.attachmentId,
      kind: attachment.kind,
      status: attachment.status,
      label: attachment.label,
      mimeType: attachment.mimeType,
      visibilityScope: attachment.visibilityScope,
      ownerPlayerId: attachment.ownerPlayerId,
      ownerTeamId: attachment.ownerTeamId,
      channelId: attachment.channelId,
      linkedQuestionInstanceId: attachment.linkedQuestionInstanceId,
      linkedCardInstanceId: attachment.linkedCardInstanceId,
      linkedMessageId: attachment.linkedMessageId,
      note: attachment.note,
      storage: buildVisibleAttachmentStorage(attachment),
      createdAt: attachment.createdAt
    }));
  const visibleAttachmentIds = new Set(visibleAttachments.map((attachment) => attachment.attachmentId));
  const visibleChannelIds = new Set(visibleChatChannels.map((channel) => channel.channelId));

  const visibleChatMessages = Object.values(aggregate.chatMessages)
    .filter((message) =>
      visibleChannelIds.has(message.channelId) &&
      canViewerAccessVisibility(viewer, message.visibilityScope, {
        teamId: message.teamId,
        playerId: message.senderPlayerId
      })
    )
    .sort((left, right) => left.sentAt.localeCompare(right.sentAt))
    .map((message) => ({
      messageId: message.messageId,
      channelId: message.channelId,
      senderPlayerId: message.senderPlayerId,
      senderDisplayName: message.senderDisplayName,
      senderRole: message.senderRole,
      body: message.body,
      attachmentIds: message.attachmentIds.filter((attachmentId) => visibleAttachmentIds.has(attachmentId)),
      visibilityScope: message.visibilityScope,
      teamId: message.teamId,
      sentAt: message.sentAt
    }));

  const visibleQuestions = Object.values(aggregate.questionInstances).map((question) => ({
    questionInstanceId: question.questionInstanceId,
    templateId: question.templateId,
    categoryId: question.categoryId,
    status: question.status,
    askedByPlayerId: question.askedByPlayerId,
    targetTeamId: question.targetTeamId,
    answer: canViewQuestionAnswer(aggregate, viewer)
      ? sanitizeQuestionAnswer(viewer, question.answer)
      : undefined,
    askedAt: question.askedAt,
    resolvedAt: question.resolvedAt
  }));

  const visibleConstraints = Object.values(aggregate.constraints).map((constraint) => ({
    constraintRecordId: constraint.constraintRecordId,
    constraintId: constraint.constraintId,
    sourceQuestionInstanceId: constraint.sourceQuestionInstanceId,
    status: constraint.status,
    resolutionMode: constraint.resolutionMode,
    confidenceScore: constraint.confidenceScore,
    explanation: constraint.explanation,
    beforeRemainingArtifactId: constraint.beforeRemainingArtifactId,
    afterRemainingArtifactId: constraint.afterRemainingArtifactId,
    contradiction: constraint.contradiction,
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
          ),
          contradiction: aggregate.searchArea.contradiction,
          history: aggregate.searchArea.history.map((entry) => ({
            historyEntryId: entry.historyEntryId,
            constraintRecordId: entry.constraintRecordId,
            summary: entry.summary,
            beforeRemainingArtifactId: entry.beforeRemainingArtifactId,
            afterRemainingArtifactId: entry.afterRemainingArtifactId,
            contradiction: entry.contradiction
          }))
        }
      : undefined;

  const visibleTimers = Object.values(aggregate.timers).map((timer) => ({
    timerId: timer.timerId,
    kind: timer.kind,
    status: timer.status,
    remainingSeconds: timer.remainingSeconds
  }));

  const visibleEventLog = aggregate.eventLog
    .filter((entry) => canViewEventLogEntry(viewer, entry))
    .sort((left, right) => right.sequence - left.sequence);

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
    visibleMovementTracks,
    visibleChatChannels,
    visibleChatMessages,
    visibleAttachments,
    visibleCards,
    visibleQuestions,
    visibleConstraints,
    visibleMap,
    visibleTimers,
    activeCardResolution,
    visibleEventLog,
    hiddenState
  };
}
