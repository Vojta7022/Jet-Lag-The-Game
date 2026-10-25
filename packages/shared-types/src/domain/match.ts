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
export type BridgeAvailability = 'unknown' | 'present' | 'none';

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
  | 'vetoed'
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

export type MapStationSource = 'osm' | 'custom' | 'both';

export interface CustomMapOverlayModel {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  geometry: GeoJsonGeometryModel;
}

export interface CustomMapStationModel {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
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
  chosenDistanceMeters?: number;
  confirmedMovingTransit?: boolean;
  status: QuestionInstanceStatus;
  answer?: Record<string, unknown>;
  askedAt: string;
  lateResponseStartedAt?: string;
  lateResponseEndedAt?: string;
  resolvedAt?: string;
  cardRewardStatus?: 'pending' | 'complete';
  automaticResolution?: AutomaticQuestionResolutionModel;
  randomizedFromQuestionInstanceId?: string;
  randomizedNullAnswerAllowed?: boolean;
}

export interface AutomaticQuestionResolutionModel {
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
  bonusDrawCount?: number;
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
  altitudeMeters?: number;
  altitudeAccuracyMeters?: number;
  altitudeReference?: 'wgs84_ellipsoid' | 'mean_sea_level';
  source: LocationSourceKind;
  onTransit?: boolean;
  recordedAt: string;
}

export interface QuestionFeatureRecordModel {
  featureId: string;
  featureClassId: string;
  label: string;
  latitude: number;
  longitude: number;
  geometrySupport: 'point' | 'line' | 'polygon' | 'mixed' | 'metadata_only';
  coverage: 'exact' | 'approximate' | 'metadata_only';
  geometry?: GeoJsonGeometryModel;
  properties?: Record<string, unknown>;
}

export interface QuestionFeatureDatasetModel {
  source: 'OpenStreetMap' | 'Open-Meteo / Copernicus DEM GLO-90';
  sourceUrl: string;
  sourceVersion: string;
  retrievedAt: string;
  coverage: 'exact' | 'approximate' | 'metadata_only';
  features: QuestionFeatureRecordModel[];
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
  /** Time bonuses from held cards and completed curse penalties at capture. */
  timeBonusSeconds?: number;
  /** Printed time bonus awarded by a curse challenge. */
  curseBonusSeconds?: number;
  /** Survival time plus all printed time bonuses at capture. */
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
  customOverlays?: CustomMapOverlayModel[];
  stationSource?: MapStationSource;
  customStations?: CustomMapStationModel[];
  bridgeAvailability?: BridgeAvailability;
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
  copiedCardInstanceId?: string;
  openedAt: string;
  openedByPlayerId: string;
  resolutionKind?: 'manual_only' | 'move' | 'discard_then_draw' | 'time_bonus' | 'disable_question_templates' | 'random_question_category_lock' | 'extra_question_reward_draws' | 'hangman_challenge' | 'bridge_troll_challenge' | 'seeker_off_transit_challenge' | 'water_weight_challenge' | 'endless_tumble_challenge' | 'lemon_phylactery_challenge' | 'gamblers_feet_challenge';
  hangman?: {
    status: 'awaiting_word' | 'playing' | 'solved' | 'ended';
    secretWord?: string;
    secretOwnerPlayerId?: string;
    revealedWord?: string;
    guessedLetters: string[];
    incorrectLetters: string[];
  };
  moveOriginStationId?: string;
  moveOriginStationName?: string;
  moveDurationSeconds?: number;
  discardRequirement?: {
    requiredCards?: number;
    requiredKind?: CardKind;
    discardWholeHand?: boolean;
  };
  drawCountOnResolve?: number;
  timeBonusMinutes?: number;
  endlessTumbleMinimumDistanceMeters?: number;
  endlessTumbleSuccessfulDieResults?: number[];
  gamblersFeetDurationMinutes?: number;
  questionTemplateCount?: number;
  requireDistinctQuestionCategories?: boolean;
  rerollAfterQuestion?: boolean;
  questionRewardCount?: number;
  extraQuestionRewardDrawCount?: number;
  sourceDeckId?: string;
  holderType?: CardHolderType;
  holderId?: string;
  openingHandCardInstanceIds?: string[];
}

export interface BridgeTrollChallengeModel {
  sourceCardInstanceId: string;
  activatedAt: string;
  attestedAtByPlayerId: Record<string, string>;
}

export interface SeekerOffTransitRestrictionModel {
  sourceCardInstanceId: string;
  activatedAt: string;
  statusByPlayerId: Record<string, { onTransitOrAtStation: boolean; updatedAt: string }>;
}

export interface WaterWeightChallengeModel {
  sourceCardInstanceId: string;
  activatedAt: string;
  hiderBonusMinutes: number;
  liquidAcquiredAt?: string;
  liquidAcquiredByPlayerId?: string;
  lastLossReportedAt?: string;
  bonusAwardedAt?: string;
}

export interface EndlessTumbleChallengeModel {
  sourceCardInstanceId: string;
  activatedAt: string;
  hiderBonusMinutes: number;
  minimumDistanceMeters: number;
  successfulDieResults: number[];
  successfulRollAt?: string;
  reportedAttempts: number;
}

export interface LemonPhylacteryChallengeModel {
  sourceCardInstanceId: string;
  activatedAt: string;
  hiderBonusMinutes: number;
  statusByPlayerId: Record<string, { touching: boolean; updatedAt: string }>;
}

export interface GamblersFeetChallengeModel {
  sourceCardInstanceId: string;
  activatedAt: string;
  expiresAt: string;
  durationMinutes: number;
  statusByPlayerId: Record<string, { stepsRemaining: number; unaccountedSteps: number; lastDieRoll?: number; updatedAt: string }>;
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
  contentPackVersion: ContentPack['packVersion'];
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
  bridgeTrollChallenge?: BridgeTrollChallengeModel;
  seekerOffTransitRestriction?: SeekerOffTransitRestrictionModel;
  waterWeightChallenge?: WaterWeightChallengeModel;
  endlessTumbleChallenge?: EndlessTumbleChallengeModel;
  lemonPhylacteryChallenge?: LemonPhylacteryChallengeModel;
  gamblersFeetChallenge?: GamblersFeetChallengeModel;
  awardedCurseBonusMinutes?: number;
  hiderHandLimitBonus?: number;
  disabledQuestionTemplateIds?: string[];
  disabledQuestionCategoryId?: string;
  disabledQuestionCategorySourceCardInstanceId?: string;
  questionRewardDrawBonus?: {
    opportunitiesRemaining: number;
    extraDrawCount: number;
  };
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
  resolutionKind?: CardResolutionWindow['resolutionKind'];
  sourceCardInstanceId?: string;
}
