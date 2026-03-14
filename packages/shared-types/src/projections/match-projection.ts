import type {
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

export interface VisibleQuestionProjection {
  questionInstanceId: string;
  templateId: string;
  categoryId: string;
  status: QuestionInstanceStatus;
  askedByPlayerId: string;
  targetTeamId?: string;
  answer?: Record<string, unknown>;
}

export interface VisibleConstraintProjection {
  constraintRecordId: string;
  constraintId: string;
  status: string;
  resolutionMode: GeometryPrecision;
  artifacts: VisibleSpatialArtifactProjection[];
  metadata: Record<string, unknown>;
}

export interface VisibleSpatialArtifactProjection {
  artifactId: string;
  kind: string;
  regionId: string;
  geometry?: GeoJsonGeometryModel;
  precision: GeometryPrecision;
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
