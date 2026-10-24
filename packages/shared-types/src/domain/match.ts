import type {
  CardKind,
  ConstraintDefinition,
  ContentPack,
  FeatureClassRef,
  ProjectionScope,
  ScaleKey,
  VisibilityPolicyRef
} from '../content.ts';
import type {
  AttachmentModel,
  ChatChannelModel,
  ChatMessageModel
} from './chat.ts';

export type MatchMode = 'online' | 'local_nearby' | 'single_device_referee';

export type MatchLifecycleState =
  | 'draft'
  | 'lobby'
  | 'content_import'
  | 'role_assignment'
  | 'rules_confirmation'
  | 'map_setup'
  | 'hide_phase'
  | 'seek_phase'
  | 'endgame'
  | 'game_complete'
  | 'archived';

export type SeekPhaseSubstate =
  | 'ready'
  | 'awaiting_question_selection'
  | 'awaiting_question_answer'
  | 'applying_constraints'
  | 'awaiting_card_resolution'
  | 'cooldown';

export type MatchRole = 'host' | 'hider' | 'seeker' | 'spectator' | 'system';

export type TeamSide = 'hider' | 'seeker';

export type PlayableRegionKind = 'city' | 'admin_region' | 'custom';

export type PlayerConnectionState = 'connected' | 'disconnected';

export type LocationSourceKind = 'device' | 'manual' | 'system';

export type TimerKind = 'hide' | 'question' | 'cooldown' | 'status_effect' | 'custom';

export type TimerStatus = 'running' | 'paused' | 'completed';

export type StatusEffectState = 'active' | 'expired';

export type CardZone =
  | 'draw_pile'
  | 'hand'
  | 'discard_pile'
  | 'exile'
  | 'pending_resolution'
  | 'reward_selection';

export type CardHolderType = 'deck' | 'team' | 'player' | 'system';

export type QuestionInstanceStatus =
  | 'awaiting_selection'
  | 'awaiting_answer'
  | 'applying_constraints'
  | 'awaiting_card_resolution'
  | 'resolved'
  | 'canceled';

export type ConstraintRecordStatus = 'active' | 'inactive';

export type GeometryPrecision = 'exact' | 'approximate' | 'metadata_only';

export type SpatialArtifactKind =
  | 'playable_boundary'
  | 'candidate_remaining'
  | 'candidate_eliminated'
  | 'constraint_overlay';

export interface GeoJsonGeometryModel {
  type: string;
  coordinates?: unknown;
  geometries?: GeoJsonGeometryModel[];
  properties?: Record<string, unknown>;
}

export interface PlayerModel {
  playerId: string;
  displayName: string;
  connectionState: PlayerConnectionState;
  joinedAt: string;
}

export interface TeamModel {
  teamId: string;
  side: TeamSide;
  name: string;
  memberPlayerIds: string[];
  sharedHand: boolean;
}

export interface RoleAssignmentModel {
  playerId: string;
  role: MatchRole;
  teamId?: string;
  confirmedAt?: string;
}

export interface TimerModel {
  timerId: string;
  kind: TimerKind;
  status: TimerStatus;
  durationSeconds: number;
  remainingSeconds: number;
  startedAt: string;
  pausedAt?: string;
  ownerRef?: string;
}

export interface StatusEffectModel {
  statusEffectId: string;
  sourceType: 'card' | 'question' | 'system';
  sourceId: string;
  effectType: string;
  appliesToTeamId?: string;
  appliesToPlayerId?: string;
  state: StatusEffectState;
  visibilityPolicy: VisibilityPolicyRef;
  createdAt: string;
  expiresAt?: string;
}

export interface CardInstanceModel {
  cardInstanceId: string;
  cardDefinitionId: string;
  holderType: CardHolderType;
  holderId: string;
  zone: CardZone;
  drawOrder?: number;
  visibilityPolicy: VisibilityPolicyRef;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionInstanceModel {
  questionInstanceId: string;
  templateId: string;
  categoryId: string;
  askedByPlayerId: string;
  targetTeamId?: string;
  status: QuestionInstanceStatus;
  answer?: Record<string, unknown>;
  askedAt: string;
  resolvedAt?: string;
  cardRewardStatus?: 'pending' | 'complete';
  automaticResolution?: AutomaticQuestionResolutionModel;
}

export interface AutomaticQuestionResolutionModel {
  resolverVersion: string;
  method: string;
  sourceSampleIds: string[];
  sourceRecordedAt: string[];
  sourceAccuracyMeters: number[];
  thresholdMeters?: number;
}

export interface QuestionCardRewardSetModel {
  setIndex: number;
  cardInstanceIds: string[];
  pickCount: number;
}

export interface PendingQuestionCardRewardModel {
  questionInstanceId: string;
  templateId: string;
  categoryId: string;
  deckId: string;
  holderType: CardHolderType;
  holderId: string;
  sets: QuestionCardRewardSetModel[];
  dealtAt: string;
}

export interface ConstraintExplanationModel {
  summary: string;
  detail?: string;
  reasoningSteps: string[];
}

export interface ContradictionReportModel {
  contradictionId: string;
  reason: string;
  conflictingConstraintRecordIds: string[];
  detectedAt: string;
}

export interface SpatialArtifactModel {
  artifactId: string;
  kind: SpatialArtifactKind;
  regionId: string;
  geometry?: GeoJsonGeometryModel;
  precision: GeometryPrecision;
  confidenceScore: number;
  clippedToRegion: boolean;
  featureCoverage: GeometryPrecision;
  explanation?: string;
  featureClassRefs?: FeatureClassRef[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ConstraintRecordModel {
  constraintRecordId: string;
  constraintId: ConstraintDefinition['constraintId'];
  status: ConstraintRecordStatus;
  sourceQuestionInstanceId?: string;
  sourceCardInstanceId?: string;
  resolutionMode: GeometryPrecision;
  confidenceScore: number;
  artifacts: SpatialArtifactModel[];
  explanation: ConstraintExplanationModel;
  beforeRemainingArtifactId?: string;
  afterRemainingArtifactId?: string;
  contradiction?: ContradictionReportModel;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ConstraintHistoryEntryModel {
  historyEntryId: string;
  constraintRecordId: string;
  beforeRemainingArtifactId?: string;
  afterRemainingArtifactId?: string;
  eliminatedArtifactIds: string[];
  createdAt: string;
  summary: string;
  contradiction?: ContradictionReportModel;
}

export interface LocationSampleModel {
  sampleId: string;
  playerId: string;
  role: MatchRole;
  teamId?: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  source: LocationSourceKind;
  onTransit?: boolean;
  recordedAt: string;
}

export interface FinalHidingSpotModel {
  latitude: number;
  longitude: number;
  publiclyAccessible: true;
  within3mOfMarkedPath: true;
  selectedAt: string;
  selectedByPlayerId: string;
}

export interface EndgameStateModel {
  startedAt: string;
  finalHidingSpot: FinalHidingSpotModel;
  triggeredByPlayerId: string;
}

export interface RoundResultModel {
  hiderTeamId: string;
  hiderPlayerId?: string;
  foundByPlayerId: string;
  foundAt: string;
  /** Real elapsed hiding time, with pauses removed and before held time bonuses. */
  survivalSeconds: number;
  /** Scale-adjusted value of time bonus cards still in the hider's hand at capture. */
  timeBonusSeconds?: number;
  /** Survival time plus the time bonus cards retained at capture. */
  finalHidingTimeSeconds?: number;
  /** Publicly revealed at capture; it becomes the next round's starting point. */
  finalHidingSpot?: {
    latitude: number;
    longitude: number;
  };
}

export interface RoundStartLocationModel {
  latitude: number;
  longitude: number;
}

export interface HiddenStateModel {
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
  finalHidingSpot?: FinalHidingSpotModel;
  endgame?: EndgameStateModel;
}

export interface PlayableRegionModel {
  regionId: string;
  displayName: string;
  regionKind: PlayableRegionKind;
  boundaryGeometry: GeoJsonGeometryModel;
  boundaryArtifact: SpatialArtifactModel;
  featureDatasetRefs: string[];
  configuredAt: string;
}

export interface SearchAreaModel {
  regionId: string;
  initializedAt: string;
  lastUpdatedAt: string;
  remainingArea: SpatialArtifactModel;
  eliminatedAreas: SpatialArtifactModel[];
  constraintArtifacts: SpatialArtifactModel[];
  history: ConstraintHistoryEntryModel[];
  contradiction?: ContradictionReportModel;
}

export interface PauseOverlayState {
  reason: string;
  pausedAt: string;
  pausedByPlayerId?: string;
  pausedByRole: MatchRole;
  resumeLifecycleState: MatchLifecycleState;
  resumeSeekPhaseSubstate?: SeekPhaseSubstate;
}

export interface CardResolutionWindow {
  sourceCardInstanceId: string;
  openedAt: string;
  openedByPlayerId: string;
  resolutionKind?: 'manual_only' | 'discard_then_draw' | 'time_bonus';
  discardRequirement?: {
    requiredCards?: number;
    requiredKind?: CardKind;
    discardWholeHand?: boolean;
  };
  drawCountOnResolve?: number;
  timeBonusMinutes?: number;
  sourceDeckId?: string;
  holderType?: CardHolderType;
  holderId?: string;
  openingHandCardInstanceIds?: string[];
}

export interface MatchAggregate {
  matchId: string;
  mode: MatchMode;
  lifecycleState: MatchLifecycleState;
  seekPhaseSubstate?: SeekPhaseSubstate;
  revision: number;
  createdAt: string;
  updatedAt: string;
  contentPackId: ContentPack['packId'];
  selectedRulesetId?: string;
  selectedScale?: ScaleKey;
  createdByPlayerId: string;
  players: Record<string, PlayerModel>;
  teams: Record<string, TeamModel>;
  roleAssignments: Record<string, RoleAssignmentModel>;
  timers: Record<string, TimerModel>;
  statusEffects: Record<string, StatusEffectModel>;
  cardInstances: Record<string, CardInstanceModel>;
  questionInstances: Record<string, QuestionInstanceModel>;
  constraints: Record<string, ConstraintRecordModel>;
  chatChannels: Record<string, ChatChannelModel>;
  chatMessages: Record<string, ChatMessageModel>;
  attachments: Record<string, AttachmentModel>;
  locationSamples: LocationSampleModel[];
  eventLog: EventLogEntry[];
  hiddenState: HiddenStateModel;
  activeQuestionInstanceId?: string;
  activeCardResolution?: CardResolutionWindow;
  pendingQuestionReward?: PendingQuestionCardRewardModel;
  mapRegion?: PlayableRegionModel;
  searchArea?: SearchAreaModel;
  paused?: PauseOverlayState;
  roundResults?: RoundResultModel[];
  roundStartLocation?: RoundStartLocationModel;
  hiderRotationOrder?: string[];
}

export interface EventLogEntry {
  eventId: string;
  sequence: number;
  type: string;
  occurredAt: string;
  actorId: string;
  actorRole: MatchRole;
  visibilityScope: ProjectionScope;
}
