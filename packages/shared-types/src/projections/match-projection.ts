import type {
  ConstraintExplanationModel,
  ContradictionReportModel,
  EventLogEntry,
  GeometryPrecision,
  GeoJsonGeometryModel,
  MatchLifecycleState,
  MatchRole,
  PauseOverlayState,
  PlayableRegionKind,
  QuestionInstanceStatus,
  RoundResultModel,
  RoundStartLocationModel,
  SeekPhaseSubstate,
  TeamSide
} from '../domain/match.ts';
import type { CardKind, ProjectionScope, ScaleKey } from '../content.ts';

export interface ProjectionViewer {
  scope: ProjectionScope;
  viewerPlayerId?: string;
  viewerTeamId?: string;
  viewerRole?: MatchRole;
}

export interface VisiblePlayerProjection {
  playerId: string;
  displayName: string;
  connectionState: string;
  role?: MatchRole;
  teamId?: string;
}

export interface VisibleTeamProjection {
  teamId: string;
  side: TeamSide;
  name: string;
  memberPlayerIds: string[];
}

export interface VisibleCardProjection {
  cardInstanceId: string;
  cardDefinitionId: string;
  zone: string;
  holderType: string;
  holderId: string;
}

export interface VisibleLocationSampleProjection {
  sampleId: string;
  playerId: string;
  displayName: string;
  role: MatchRole;
  teamId?: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  source: string;
  recordedAt: string;
}

export interface VisibleMovementTrackProjection {
  playerId: string;
  displayName: string;
  role: MatchRole;
  teamId?: string;
  sampleCount: number;
  latestSample?: VisibleLocationSampleProjection;
  samples: VisibleLocationSampleProjection[];
}

export interface VisibleChatChannelProjection {
  channelId: string;
  kind: string;
  displayName: string;
  visibilityScope: ProjectionScope;
  teamId?: string;
}

export interface VisibleAttachmentProjection {
  attachmentId: string;
  kind: string;
  status: string;
  label: string;
  mimeType?: string;
  visibilityScope: ProjectionScope;
  ownerPlayerId?: string;
  ownerTeamId?: string;
  channelId?: string;
  linkedQuestionInstanceId?: string;
  linkedCardInstanceId?: string;
  linkedMessageId?: string;
  note?: string;
  storage?: {
    provider: string;
    storageState: string;
    bucket?: string;
    objectPath?: string;
    previewObjectPath?: string;
    uploadedAt?: string;
    byteSize?: number;
    requiresAuthenticatedAccess: boolean;
  };
  createdAt: string;
}

export interface VisibleChatMessageProjection {
  messageId: string;
  channelId: string;
  senderPlayerId?: string;
  senderDisplayName: string;
  senderRole: MatchRole;
  body: string;
  attachmentIds: string[];
  visibilityScope: ProjectionScope;
  teamId?: string;
  sentAt: string;
}

export interface VisibleQuestionProjection {
  questionInstanceId: string;
  templateId: string;
  categoryId: string;
  status: QuestionInstanceStatus;
  cardRewardStatus?: 'pending' | 'complete';
  askedByPlayerId: string;
  targetTeamId?: string;
  answer?: Record<string, unknown>;
  askedAt?: string;
  lateResponseStartedAt?: string;
  lateResponseEndedAt?: string;
  resolvedAt?: string;
  automaticResolution?: {
    resolverVersion: string;
    method: string;
    sourceSampleIds: string[];
    sourceRecordedAt: string[];
    sourceAccuracyMeters: number[];
    thresholdMeters?: number;
    movementStartSampleId?: string;
    movementEndSampleId?: string;
    featureDatasetSource?: string;
    featureDatasetVersion?: string;
    featureDatasetRetrievedAt?: string;
    referenceFeatureId?: string;
  };
  randomizedFromQuestionInstanceId?: string;
  randomizedNullAnswerAllowed?: boolean;
}

export interface VisibleConstraintProjection {
  constraintRecordId: string;
  constraintId: string;
  sourceQuestionInstanceId?: string;
  status: string;
  resolutionMode: GeometryPrecision;
  confidenceScore: number;
  explanation: ConstraintExplanationModel;
  beforeRemainingArtifactId?: string;
  afterRemainingArtifactId?: string;
  contradiction?: ContradictionReportModel;
  artifacts: VisibleSpatialArtifactProjection[];
  metadata: Record<string, unknown>;
}

export interface VisibleSpatialArtifactProjection {
  artifactId: string;
  kind: string;
  regionId: string;
  geometry?: GeoJsonGeometryModel;
  precision: GeometryPrecision;
  confidenceScore: number;
  clippedToRegion: boolean;
  featureCoverage: GeometryPrecision;
  explanation?: string;
  metadata: Record<string, unknown>;
}

export interface VisibleMapProjection {
  regionId: string;
  displayName: string;
  regionKind: PlayableRegionKind;
  featureDatasetRefs: string[];
  playableBoundary: VisibleSpatialArtifactProjection;
  remainingArea?: VisibleSpatialArtifactProjection;
  eliminatedAreas: VisibleSpatialArtifactProjection[];
  constraintArtifacts: VisibleSpatialArtifactProjection[];
  contradiction?: ContradictionReportModel;
  history: Array<{
    historyEntryId: string;
    constraintRecordId: string;
    summary: string;
    beforeRemainingArtifactId?: string;
    afterRemainingArtifactId?: string;
    contradiction?: ContradictionReportModel;
  }>;
}

export interface MatchProjection {
  matchId: string;
  contentPackId: string;
  lifecycleState: MatchLifecycleState;
  seekPhaseSubstate?: SeekPhaseSubstate;
  paused?: PauseOverlayState;
  selectedScale?: ScaleKey;
  selectedRulesetId?: string;
  players: VisiblePlayerProjection[];
  teams: VisibleTeamProjection[];
  visibleMovementTracks: VisibleMovementTrackProjection[];
  visibleChatChannels: VisibleChatChannelProjection[];
  visibleChatMessages: VisibleChatMessageProjection[];
  visibleAttachments: VisibleAttachmentProjection[];
  visibleCards: VisibleCardProjection[];
  visibleQuestions: VisibleQuestionProjection[];
  visibleConstraints: VisibleConstraintProjection[];
  visibleMap?: VisibleMapProjection;
  visibleTimers: Array<{
    timerId: string;
    kind: string;
    status: string;
    remainingSeconds: number;
    durationSeconds: number;
    startedAt: string;
    pausedAt?: string;
  }>;
  activeCardResolution?: {
    sourceCardInstanceId: string;
    copiedCardInstanceId?: string;
    resolutionKind?: 'manual_only' | 'discard_then_draw' | 'time_bonus';
    discardRequirement?: {
      requiredCards?: number;
      requiredKind?: CardKind;
      discardWholeHand?: boolean;
    };
    drawCountOnResolve?: number;
    timeBonusMinutes?: number;
  };
  hiderHandLimit?: number;
  pendingQuestionReward?: {
    questionInstanceId: string;
    templateId: string;
    categoryId: string;
    drawCount: number;
    sets: Array<{ setIndex: number; cardInstanceIds: string[]; pickCount: number }>;
  };
  visibleEventLog: EventLogEntry[];
  visibleRoundResults?: RoundResultModel[];
  roundStartLocation?: RoundStartLocationModel;
  hiderRotationOrder?: string[];
  hiddenState?: {
    hiderLocationLocked?: boolean;
    hidingZone?: {
      stationId: string;
      stationName: string;
      latitude: number;
      longitude: number;
      radiusMeters: number;
      selectedAt: string;
      selectedByPlayerId: string;
    };
    hiderLocation?: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      lockedAt: string;
      lockedByPlayerId: string;
    };
    finalHidingSpot?: {
      latitude: number;
      longitude: number;
      publiclyAccessible: true;
      within3mOfMarkedPath: true;
      selectedAt: string;
      selectedByPlayerId: string;
    };
    endgame?: {
      startedAt: string;
    };
  };
}
