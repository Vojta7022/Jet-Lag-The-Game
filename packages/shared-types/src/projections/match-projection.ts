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
  SeekPhaseSubstate,
  TeamSide
} from '../domain/match.ts';
import type { ProjectionScope } from '../content.ts';

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
  askedByPlayerId: string;
  targetTeamId?: string;
  answer?: Record<string, unknown>;
  askedAt?: string;
  resolvedAt?: string;
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
  }>;
  activeCardResolution?: {
    sourceCardInstanceId: string;
  };
  visibleEventLog: EventLogEntry[];
  hiddenState?: {
    hiderLocation?: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      lockedAt: string;
      lockedByPlayerId: string;
    };
  };
}
