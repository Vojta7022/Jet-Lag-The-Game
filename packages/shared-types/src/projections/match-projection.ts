import type {
  ConstraintExplanationModel,
  ContradictionReportModel,
  CustomMapOverlayModel,
  CustomMapStationModel,
  DistantCuisineChallengeModel,
  EventLogEntry,
  GeometryPrecision,
  GeoJsonGeometryModel,
  MatchLifecycleState,
  MatchRole,
  MapStationSource,
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
  chosenDistanceMeters?: number;
  confirmedMovingTransit?: boolean;
  ransomNoteText?: string;
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
  configuredAt: string;
  featureDatasetRefs: string[];
  customOverlays?: CustomMapOverlayModel[];
  stationSource?: MapStationSource;
  customStations?: CustomMapStationModel[];
  bridgeAvailability?: 'unknown' | 'present' | 'none';
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
  contentPackVersion: string;
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
    openedAt?: string;
    resolutionKind?: 'manual_only' | 'move' | 'discard_then_draw' | 'draw_and_expand_hand' | 'veto_question' | 'randomize_question' | 'time_bonus' | 'disable_question_templates' | 'random_question_category_lock' | 'extra_question_reward_draws' | 'hangman_challenge' | 'labyrinth_challenge' | 'right_turn_challenge' | 'unguided_tourist_challenge' | 'bird_guide_challenge' | 'mediocre_travel_agent_challenge' | 'impressionable_consumer_challenge' | 'distant_cuisine_challenge' | 'bridge_troll_challenge' | 'seeker_off_transit_challenge' | 'u_turn_challenge' | 'ransom_note_challenge' | 'cairn_challenge' | 'water_weight_challenge' | 'endless_tumble_challenge' | 'lemon_phylactery_challenge' | 'gamblers_feet_challenge' | 'egg_partner_challenge' | 'jammed_door_challenge' | 'zoologist_challenge' | 'luxury_car_challenge';
    hangman?: {
      status: 'awaiting_word' | 'playing' | 'solved' | 'ended';
      secretWord?: string;
      revealedWord?: string;
      maskedWord: string;
      guessedLetters: string[];
      incorrectLetters: string[];
    };
    labyrinth?: {
      status: 'awaiting_maze' | 'solving' | 'awaiting_hider_review' | 'solved';
      drawingWindowMinutes?: number;
      mazeAttachmentId?: string;
      solutionText?: string;
      solutionSubmittedByPlayerId?: string;
      solutionSubmittedAt?: string;
      rejectedAttemptCount: number;
    };
    labyrinthDrawingWindowMinutes?: number;
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
    rightTurnDurationMinutes?: number;
    rightTurnDeadEndDistanceMeters?: number;
    unguidedTouristOutdoorsConfirmedByPlayerIds?: string[];
    birdGuideMaximumDurationMinutes?: number;
    mediocreTravelAgentMaximumDistanceMeters?: number;
    mediocreTravelAgentStayMinutes?: number;
    mediocreTravelAgentHiderBonusMinutes?: number;
    mediocreTravelAgentRequiredPhotoCount?: number;
    mediocreTravelAgentTransitStatusByPlayerId?: Record<string, { onTransitOrAtStation: boolean; updatedAt: string }>;
    impressionableConsumerMinimumAdDistanceMeters?: number;
    uTurnAlternateTransitWindowMinutes?: number;
    jammedDoorRetryCooldownMinutes?: number;
    jammedDoorMinimumTotal?: number;
    jammedDoorDurationMinutes?: number;
    questionTemplateCount?: number;
    requireDistinctQuestionCategories?: boolean;
    rerollAfterQuestion?: boolean;
    questionRewardCount?: number;
    extraQuestionRewardDrawCount?: number;
  };
  bridgeTrollChallenge?: {
    sourceCardInstanceId: string;
    activatedAt: string;
    attestedAtByPlayerId: Record<string, string>;
  };
  seekerOffTransitRestriction?: {
    sourceCardInstanceId: string;
    activatedAt: string;
    statusByPlayerId: Record<string, { onTransitOrAtStation: boolean; updatedAt: string }>;
  };
  uTurnChallenge?: {
    sourceCardInstanceId: string;
    nextStationName: string;
    alternateTransitWindowMinutes: number;
    activatedAt: string;
    requiredSeekerPlayerIds: string[];
    disembarkedAtByPlayerId: Record<string, string>;
  };
  ransomNoteChallenge?: {
    sourceCardInstanceId: string;
    activatedAt: string;
    candidate?: { noteText: string; submittedByPlayerId: string; submittedAt: string };
    acceptedNoteText?: string;
  };
  cairnChallenge?: {
    sourceCardInstanceId: string;
    targetHeight: number;
    activatedAt: string;
    seekerStableHeight: number;
    attempts: number;
    pendingRockStartedAt?: string;
    completedAt?: string;
  };
  waterWeightChallenge?: {
    sourceCardInstanceId: string;
    activatedAt: string;
    hiderBonusMinutes: number;
    liquidAcquiredAt?: string;
    liquidAcquiredByPlayerId?: string;
    lastLossReportedAt?: string;
    bonusAwardedAt?: string;
  };
  endlessTumbleChallenge?: {
    sourceCardInstanceId: string;
    activatedAt: string;
    hiderBonusMinutes: number;
    minimumDistanceMeters: number;
    successfulDieResults: number[];
    successfulRollAt?: string;
    reportedAttempts: number;
  };
  lemonPhylacteryChallenge?: {
    sourceCardInstanceId: string;
    activatedAt: string;
    hiderBonusMinutes: number;
    statusByPlayerId: Record<string, { touching: boolean; updatedAt: string }>;
  };
  gamblersFeetChallenge?: {
    sourceCardInstanceId: string;
    activatedAt: string;
    expiresAt: string;
    durationMinutes: number;
    statusByPlayerId: Record<string, { stepsRemaining: number; unaccountedSteps: number; lastDieRoll?: number; updatedAt: string }>;
  };
  rightTurnChallenge?: {
    sourceCardInstanceId: string;
    activatedAt: string;
    expiresAt: string;
    durationMinutes: number;
    deadEndDistanceMeters: number;
    reports: Array<{
      playerId: string;
      choice: 'right' | 'straight' | 'left' | 'u_turn' | 'no_intersection';
      atStreetIntersection: boolean;
      deadEndDistanceMeters?: number;
      compliant: boolean;
      reportedAt: string;
    }>;
  };
  unguidedTouristChallenge?: {
    sourceCardInstanceId: string;
    hiderAttachmentId: string;
    hiderRulesAttested: boolean;
    activatedAt: string;
    requiredSeekerPlayerIds: string[];
    candidate?: { attachmentId: string; submittedByPlayerId: string; attestedNoInternetResearch: boolean; submittedAt: string };
    rejectedAttemptCount: number;
  };
  birdGuideChallenge?: {
    sourceCardInstanceId: string;
    hiderAttachmentId: string;
    hiderBirdInFrameAttested: boolean;
    hiderDurationMs: number;
    maximumDurationMs: number;
    activatedAt: string;
    candidate?: { attachmentId: string; submittedByPlayerId: string; durationMs: number; submittedAt: string };
    rejectedAttemptCount: number;
  };
  mediocreTravelAgentChallenge?: {
    sourceCardInstanceId: string;
    destinationName: string;
    destinationLatitude: number;
    destinationLongitude: number;
    arrivalRadiusMeters: number;
    maximumDistanceMeters: number;
    stayMinutes: number;
    hiderBonusMinutes: number;
    requiredPhotoCount: number;
    requiredSeekerPlayerIds: string[];
    startedAt: string;
    stayStartedAtByPlayerId: Record<string, string>;
    transitStatusByPlayerId: Record<string, { onTransitOrAtStation: boolean; updatedAt: string }>;
    souvenirAcquiredAt?: string;
    souvenirReportedByPlayerId?: string;
    souvenirLostAt?: string;
    souvenirLostReportedByPlayerId?: string;
    bonusAwardedAt?: string;
    completedAt?: string;
  };
  impressionableConsumerChallenge?: {
    sourceCardInstanceId: string;
    minimumAdvertisementDistanceMeters: number;
    requiredSeekerPlayerIds: string[];
    startedAt: string;
    target?: {
      advertisementName: string;
      advertisementLatitude: number;
      advertisementLongitude: number;
      targetName: string;
      targetLatitude: number;
      targetLongitude: number;
      action: 'enter_location' | 'buy_product_or_service';
      submittedByPlayerId: string;
      submittedAt: string;
      reviewedAt?: string;
      reviewApproved?: boolean;
      rejectedAttemptCount: number;
    };
    completedAtByPlayerId: Record<string, string>;
    completedAt?: string;
  };
  distantCuisineChallenge?: DistantCuisineChallengeModel;
  eggPartnerChallenge?: {
    sourceCardInstanceId: string;
    activatedAt: string;
    hiderBonusMinutes: number;
    eggAcquiredAt?: string;
    statusByMemberId: Record<string, { lossKind?: 'abandoned' | 'cracked'; updatedAt: string }>;
    bonusAwardedAt?: string;
  };
  jammedDoorChallenge?: {
    sourceCardInstanceId: string;
    activatedAt: string;
    expiresAt: string;
    durationMinutes: number;
    retryCooldownMinutes: number;
    minimumTotal: number;
    statusByDoorwayId: Record<string, { doorwayLabel: string; lastAttemptAt: string; lastReportedByPlayerId: string; dieOne: number; dieTwo: number; total: number; passedAt?: string; retryAt?: string }>;
  };
  zoologistChallenge?: {
    sourceCardInstanceId: string;
    category: import('../domain/match.ts').ZoologistAnimalCategory;
    hiderAttachmentId: string;
    requiredSeekerPlayerIds: string[];
    attachmentIdBySeekerPlayerId: Record<string, string>;
    activatedAt: string;
  };
  luxuryCarChallenge?: {
    sourceCardInstanceId: string;
    hiderAttachmentId: string;
    hiderCarDescription: string;
    hiderProductionYear: number;
    hiderMsrpCents: number;
    currencyCode: string;
    activatedAt: string;
    usedAttachmentIds: string[];
    candidate?: {
      attachmentId: string;
      submittedByPlayerId: string;
      carDescription: string;
      productionYear: number;
      msrpCents: number;
      submittedAt: string;
    };
  };
  awardedCurseBonusMinutes?: number;
  disabledQuestionTemplateIds?: string[];
  disabledQuestionCategoryId?: string;
  questionRewardDrawBonus?: {
    opportunitiesRemaining: number;
    extraDrawCount: number;
  };
  hiderHandLimit?: number;
  pendingQuestionReward?: {
    questionInstanceId: string;
    templateId: string;
    categoryId: string;
    drawCount: number;
    bonusDrawCount?: number;
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
