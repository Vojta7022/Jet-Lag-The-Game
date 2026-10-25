import type {
  AttachmentKind,
  CustomMapOverlayModel,
  CustomMapStationModel,
  GeoJsonGeometryModel,
  MatchLifecycleState,
  MatchMode,
  MatchRole,
  MapStationSource,
  PlayableRegionKind,
  SeekPhaseSubstate
} from '../domain/index.ts';
import type { ProjectionScope } from '../content.ts';

export interface ActorRef {
  actorId: string;
  playerId?: string;
  role: MatchRole;
}

export interface CommandEnvelope<TCommand extends DomainCommand = DomainCommand> {
  commandId: string;
  matchId: string;
  actor: ActorRef;
  occurredAt: string;
  idempotencyKey?: string;
  clientSequence?: number;
  command: TCommand;
}

export type DomainCommand =
  | CreateMatchCommand
  | JoinMatchCommand
  | RemoveMatchPlayerCommand
  | LeaveMatchCommand
  | ImportContentPackCommand
  | PublishContentPackCommand
  | AssignRoleCommand
  | ConfirmRolesCommand
  | SetRulesetCommand
  | ConfirmRulesCommand
  | CreateMapRegionCommand
  | StartMatchCommand
  | StartNextRoundCommand
  | LockHiderLocationCommand
  | SetHidingZoneCommand
  | SetFinalHidingSpotCommand
  | ConfirmHiderFoundCommand
  | UpdateLocationCommand
  | EndHidePhaseCommand
  | BeginQuestionPromptCommand
  | AskQuestionCommand
  | ExpireQuestionResponseCommand
  | AnswerQuestionCommand
  | ApplyConstraintCommand
  | SendChatMessageCommand
  | UploadAttachmentCommand
  | DrawCardCommand
  | DealQuestionRewardCommand
  | ChooseQuestionRewardCommand
  | PlayCardCommand
  | DiscardCardCommand
  | ResolveCardWindowCommand
  | SetHangmanWordCommand
  | GuessHangmanLetterCommand
  | EndHangmanChallengeCommand
  | PublishLabyrinthMazeCommand
  | SubmitLabyrinthSolutionCommand
  | ReviewLabyrinthSolutionCommand
  | SetBridgeTrollPositionCommand
  | SetSeekerTransitContextCommand
  | ReportUTurnDisembarkationCommand
  | ReportRansomNoteQuestionCommand
  | DecideRansomNoteQuestionCommand
  | BeginCairnRockPlacementCommand
  | ConfirmCairnRockStableCommand
  | ReportCairnTowerFallenCommand
  | ConfirmWaterWeightLiquidAcquiredCommand
  | ReportWaterWeightLiquidLostCommand
  | ResolveEndlessTumbleCastCommand
  | ReportEndlessTumbleRollCommand
  | SetLemonPhylacteryContactCommand
  | ResolveGamblersFeetCastCommand
  | RollGamblersFeetDieCommand
  | ReportGamblersFeetStepsCommand
  | ReportRightTurnRouteChoiceCommand
  | ConfirmUnguidedTouristOutdoorsCommand
  | SubmitUnguidedTouristPhotoCommand
  | ReviewUnguidedTouristPhotoCommand
  | SubmitBirdGuideVideoCommand
  | ReviewBirdGuideVideoCommand
  | ReportMediocreTravelSouvenirCommand
  | CompleteMediocreTravelAgentCommand
  | SubmitImpressionableConsumerTargetCommand
  | ReviewImpressionableConsumerTargetCommand
  | CompleteImpressionableConsumerChallengeCommand
  | SetDistantCuisineOriginCommand
  | SubmitDistantCuisineTargetCommand
  | ReportDistantCuisineDistanceCommand
  | ReviewDistantCuisineTargetCommand
  | CompleteDistantCuisineChallengeCommand
  | ConfirmEggPartnerAcquiredCommand
  | ReportEggPartnerMemberLostCommand
  | ReportJammedDoorRollCommand
  | ReportZoologistEvidenceCommand
  | ReportLuxuryCarCandidateCommand
  | DecideLuxuryCarCandidateCommand
  | CompleteCooldownCommand
  | PauseMatchCommand
  | ResumeMatchCommand
  | EndMatchCommand
  | ArchiveMatchCommand;

export interface CreateMatchCommand {
  type: 'create_match';
  payload: {
    mode: MatchMode;
    contentPackId: string;
    contentPackVersion?: string;
    hostPlayerId: string;
    hostDisplayName: string;
    initialScale?: 'small' | 'medium' | 'large';
  };
}

export interface JoinMatchCommand {
  type: 'join_match';
  payload: {
    playerId: string;
    displayName: string;
  };
}

export interface RemoveMatchPlayerCommand {
  type: 'remove_match_player';
  payload: { playerId: string };
}

export interface LeaveMatchCommand {
  type: 'leave_match';
  payload: {};
}

export interface ImportContentPackCommand {
  type: 'import_content_pack';
  payload: {
    contentPackId: string;
  };
}

export interface PublishContentPackCommand {
  type: 'publish_content_pack';
  payload: {
    contentPackId: string;
  };
}

export interface AssignRoleCommand {
  type: 'assign_role';
  payload: {
    targetPlayerId: string;
    role: MatchRole;
    teamId?: string;
  };
}

export interface ConfirmRolesCommand {
  type: 'confirm_roles';
  payload: {};
}

export interface SetRulesetCommand {
  type: 'set_ruleset';
  payload: {
    rulesetId: string;
  };
}

export interface ConfirmRulesCommand {
  type: 'confirm_rules';
  payload: {};
}

export interface CreateMapRegionCommand {
  type: 'create_map_region';
  payload: {
    regionId: string;
    displayName?: string;
    regionKind?: PlayableRegionKind;
    featureDatasetRefs?: string[];
    geometry: GeoJsonGeometryModel;
    customOverlays?: CustomMapOverlayModel[];
    stationSource?: MapStationSource;
    customStations?: CustomMapStationModel[];
    bridgeAvailability?: 'unknown' | 'present' | 'none';
  };
}

export interface StartMatchCommand {
  type: 'start_match';
  payload: {};
}

export interface StartNextRoundCommand {
  type: 'start_next_round';
  payload: {
    nextHiderPlayerId: string;
  };
}

export interface LockHiderLocationCommand {
  type: 'lock_hider_location';
  payload: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  };
}

export interface SetHidingZoneCommand {
  type: 'set_hiding_zone';
  payload: {
    stationId: string;
    stationName: string;
    latitude: number;
    longitude: number;
  };
}

export interface SetFinalHidingSpotCommand {
  type: 'set_final_hiding_spot';
  payload: {
    latitude: number;
    longitude: number;
    publiclyAccessible: boolean;
    within3mOfMarkedPath: boolean;
  };
}

export interface ConfirmHiderFoundCommand {
  type: 'confirm_hider_found';
  payload: {
    latitude: number;
    longitude: number;
    visuallyIdentified: boolean;
  };
}

export interface UpdateLocationCommand {
  type: 'update_location';
  payload: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    altitudeMeters?: number;
    altitudeAccuracyMeters?: number;
    altitudeReference?: 'wgs84_ellipsoid' | 'mean_sea_level';
    source?: 'device' | 'manual' | 'system';
    onTransit?: boolean;
  };
}

export interface EndHidePhaseCommand {
  type: 'end_hide_phase';
  payload: {};
}

export interface BeginQuestionPromptCommand {
  type: 'begin_question_prompt';
  payload: {};
}

export interface AskQuestionCommand {
  type: 'ask_question';
  payload: {
    questionInstanceId: string;
    templateId: string;
    targetTeamId?: string;
    chosenDistanceMeters?: number;
    confirmedMovingTransit?: boolean;
    ransomNoteText?: string;
  };
}

export interface ExpireQuestionResponseCommand {
  type: 'expire_question_response';
  payload: { questionInstanceId: string };
}

export interface AnswerQuestionCommand {
  type: 'answer_question';
  payload: {
    questionInstanceId: string;
    answer: Record<string, unknown>;
  };
}

export interface ApplyConstraintCommand {
  type: 'apply_constraint';
  payload: {
    questionInstanceId: string;
    constraintId: string;
    metadata?: Record<string, unknown>;
    openCardResolution?: boolean;
  };
}

export interface SendChatMessageCommand {
  type: 'send_chat_message';
  payload: {
    messageId: string;
    channelId: string;
    body?: string;
    attachmentIds?: string[];
  };
}

export interface UploadAttachmentCommand {
  type: 'upload_attachment';
  payload: {
    attachmentId: string;
    kind: AttachmentKind;
    label: string;
    mimeType?: string;
    note?: string;
    visibilityScope: ProjectionScope;
    channelId?: string;
    questionInstanceId?: string;
    cardInstanceId?: string;
    captureMetadata?: Record<string, unknown>;
  };
}

export interface DrawCardCommand {
  type: 'draw_card';
  payload: {
    deckId: string;
    cardInstanceId?: string;
  };
}

export interface DealQuestionRewardCommand {
  type: 'deal_question_reward';
  payload: { questionInstanceId: string; useQuestionRewardDrawBonus?: boolean };
}

export interface ChooseQuestionRewardCommand {
  type: 'choose_question_reward';
  payload: {
    questionInstanceId: string;
    selectedCardInstanceIdsBySet: string[][];
  };
}

export interface PlayCardCommand {
  type: 'play_card';
  payload: {
    cardInstanceId: string;
    duplicateTargetCardInstanceId?: string;
  };
}

export interface DiscardCardCommand {
  type: 'discard_card';
  payload: {
    cardInstanceId: string;
  };
}

export interface ResolveCardWindowCommand {
  type: 'resolve_card_window';
  payload: {
    sourceCardInstanceId: string;
    questionTemplateIds?: string[];
    zoologistCategory?: import('../domain/match.ts').ZoologistAnimalCategory;
    zoologistHiderAttachmentId?: string;
    luxuryCarHiderAttachmentId?: string;
    luxuryCarDescription?: string;
    luxuryCarProductionYear?: number;
    luxuryCarMsrpCents?: number;
    luxuryCarCurrencyCode?: string;
    uTurnNextStationName?: string;
    uTurnPreconditionsConfirmed?: boolean;
    ransomNoteCastingCostConfirmed?: boolean;
    cairnTargetHeight?: number;
    cairnTargetConfirmed?: boolean;
    unguidedTouristHiderAttachmentId?: string;
    unguidedTouristRulesAttested?: boolean;
    birdGuideHiderAttachmentId?: string;
    birdGuideBirdPresentAttested?: boolean;
    mediocreTravelAgentDestinationName?: string;
    mediocreTravelAgentLatitude?: number;
    mediocreTravelAgentLongitude?: number;
    mediocreTravelAgentPublicAccessAttested?: boolean;
  impressionableConsumerMinimumAdDistanceMeters?: number;
  };
}

export interface SetHangmanWordCommand {
  type: 'set_hangman_word';
  payload: { sourceCardInstanceId: string; word: string };
}

export interface GuessHangmanLetterCommand {
  type: 'guess_hangman_letter';
  payload: { sourceCardInstanceId: string; letter: string };
}

export interface EndHangmanChallengeCommand {
  type: 'end_hangman_challenge';
  payload: { sourceCardInstanceId: string };
}

export interface PublishLabyrinthMazeCommand {
  type: 'publish_labyrinth_maze';
  payload: { sourceCardInstanceId: string; attachmentId: string };
}

export interface SubmitLabyrinthSolutionCommand {
  type: 'submit_labyrinth_solution';
  payload: { sourceCardInstanceId: string; solutionText: string };
}

export interface ReviewLabyrinthSolutionCommand {
  type: 'review_labyrinth_solution';
  payload: { sourceCardInstanceId: string; approved: boolean };
}

export interface SetBridgeTrollPositionCommand {
  type: 'set_bridge_troll_position';
  payload: { sourceCardInstanceId: string; underBridge: boolean };
}

export interface SetSeekerTransitContextCommand {
  type: 'set_seeker_transit_context';
  payload: { sourceCardInstanceId: string; onTransitOrAtStation: boolean };
}

export interface ReportUTurnDisembarkationCommand {
  type: 'report_u_turn_disembarkation';
  payload: { sourceCardInstanceId: string; stationName: string; targetPlayerId?: string };
}

export interface ReportRansomNoteQuestionCommand {
  type: 'report_ransom_note_question';
  payload: { sourceCardInstanceId: string; noteText: string; printedCutoutsConfirmed: boolean };
}

export interface DecideRansomNoteQuestionCommand {
  type: 'decide_ransom_note_question';
  payload: { sourceCardInstanceId: string; accepted: boolean };
}

export interface BeginCairnRockPlacementCommand {
  type: 'begin_cairn_rock_placement';
  payload: { sourceCardInstanceId: string };
}

export interface ConfirmCairnRockStableCommand {
  type: 'confirm_cairn_rock_stable';
  payload: { sourceCardInstanceId: string };
}

export interface ReportCairnTowerFallenCommand {
  type: 'report_cairn_tower_fallen';
  payload: { sourceCardInstanceId: string };
}

export interface ConfirmWaterWeightLiquidAcquiredCommand {
  type: 'confirm_water_weight_liquid_acquired';
  payload: { sourceCardInstanceId: string };
}

export interface ReportWaterWeightLiquidLostCommand {
  type: 'report_water_weight_liquid_lost';
  payload: { sourceCardInstanceId: string };
}

export interface ResolveEndlessTumbleCastCommand {
  type: 'resolve_endless_tumble_cast';
  payload: { sourceCardInstanceId: string; dieRoll: number };
}

export interface ReportEndlessTumbleRollCommand {
  type: 'report_endless_tumble_roll';
  payload: {
    sourceCardInstanceId: string;
    dieRoll: number | null;
    distanceMeters: number;
    unaided: boolean;
    landsCleanly: boolean;
    hitPerson: boolean;
  };
}

export interface SetLemonPhylacteryContactCommand {
  type: 'set_lemon_phylactery_contact';
  payload: { sourceCardInstanceId: string; touching: boolean; targetPlayerId?: string };
}

export interface ResolveGamblersFeetCastCommand {
  type: 'resolve_gamblers_feet_cast';
  payload: { sourceCardInstanceId: string; dieRoll: number };
}

export interface RollGamblersFeetDieCommand {
  type: 'roll_gamblers_feet_die';
  payload: { sourceCardInstanceId: string; dieRoll: number; targetPlayerId?: string };
}

export interface ReportGamblersFeetStepsCommand {
  type: 'report_gamblers_feet_steps';
  payload: { sourceCardInstanceId: string; stepsTaken: number; overstep?: 'accidental' | 'safety'; targetPlayerId?: string };
}

export interface ReportRightTurnRouteChoiceCommand {
  type: 'report_right_turn_route_choice';
  payload: {
    sourceCardInstanceId: string;
    choice: 'right' | 'straight' | 'left' | 'u_turn' | 'no_intersection';
    atStreetIntersection: boolean;
    deadEndDistanceMeters?: number;
    targetPlayerId?: string;
  };
}

export interface ConfirmUnguidedTouristOutdoorsCommand {
  type: 'confirm_unguided_tourist_outdoors';
  payload: { sourceCardInstanceId: string };
}

export interface SubmitUnguidedTouristPhotoCommand {
  type: 'submit_unguided_tourist_photo';
  payload: { sourceCardInstanceId: string; attachmentId: string; attestedNoInternetResearch: boolean };
}

export interface ReviewUnguidedTouristPhotoCommand {
  type: 'review_unguided_tourist_photo';
  payload: { sourceCardInstanceId: string; approved: boolean };
}

export interface SubmitBirdGuideVideoCommand {
  type: 'submit_bird_guide_video';
  payload: { sourceCardInstanceId: string; attachmentId: string };
}

export interface ReviewBirdGuideVideoCommand {
  type: 'review_bird_guide_video';
  payload: { sourceCardInstanceId: string; approved: boolean };
}

export interface ReportMediocreTravelSouvenirCommand {
  type: 'report_mediocre_travel_souvenir';
  payload: { sourceCardInstanceId: string; status: 'acquired' | 'lost' };
}

export interface CompleteMediocreTravelAgentCommand {
  type: 'complete_mediocre_travel_agent';
  payload: { sourceCardInstanceId: string };
}

export interface SubmitImpressionableConsumerTargetCommand {
  type: 'submit_impressionable_consumer_target';
  payload: {
    sourceCardInstanceId: string;
    advertisementName: string;
    advertisementLatitude: number;
    advertisementLongitude: number;
    advertisementOutdoorsAttested: true;
    targetName: string;
    targetLatitude: number;
    targetLongitude: number;
    action: 'enter_location' | 'buy_product_or_service';
    targetIsBusinessAttested: true;
  };
}

export interface ReviewImpressionableConsumerTargetCommand {
  type: 'review_impressionable_consumer_target';
  payload: { sourceCardInstanceId: string; approved: boolean };
}

export interface CompleteImpressionableConsumerChallengeCommand {
  type: 'complete_impressionable_consumer_challenge';
  payload: { sourceCardInstanceId: string };
}

export interface SetDistantCuisineOriginCommand {
  type: 'set_distant_cuisine_origin';
  payload: { sourceCardInstanceId: string; restaurantName: string; restaurantLatitude: number; restaurantLongitude: number; cuisineCountryName: string; cuisineCountryRegionId: string; publicSingleCountryReferenceAttested: true };
}

export interface SubmitDistantCuisineTargetCommand {
  type: 'submit_distant_cuisine_target';
  payload: { sourceCardInstanceId: string; restaurantName: string; restaurantLatitude: number; restaurantLongitude: number; cuisineCountryName: string; cuisineCountryRegionId: string; publicSingleCountryReferenceAttested: true };
}

export interface ReportDistantCuisineDistanceCommand {
  type: 'report_distant_cuisine_distance';
  payload: { sourceCardInstanceId: string; sourceCountryDistanceMeters: number; targetCountryDistanceMeters: number };
}

export interface ReviewDistantCuisineTargetCommand {
  type: 'review_distant_cuisine_target';
  payload: { sourceCardInstanceId: string; approved: boolean };
}

export interface CompleteDistantCuisineChallengeCommand {
  type: 'complete_distant_cuisine_challenge';
  payload: { sourceCardInstanceId: string };
}

export interface ConfirmEggPartnerAcquiredCommand {
  type: 'confirm_egg_partner_acquired';
  payload: { sourceCardInstanceId: string };
}

export interface ReportEggPartnerMemberLostCommand {
  type: 'report_egg_partner_member_lost';
  payload: { sourceCardInstanceId: string; memberId: string; lossKind: 'abandoned' | 'cracked' };
}

export interface ReportJammedDoorRollCommand {
  type: 'report_jammed_door_roll';
  payload: { sourceCardInstanceId: string; doorwayId: string; doorwayLabel: string; dieOne: number; dieTwo: number; doorwayVisible: boolean; targetPlayerId?: string };
}

export interface ReportZoologistEvidenceCommand {
  type: 'report_zoologist_evidence';
  payload: { sourceCardInstanceId: string; attachmentId: string };
}

export interface ReportLuxuryCarCandidateCommand {
  type: 'report_luxury_car_candidate';
  payload: {
    sourceCardInstanceId: string;
    attachmentId: string;
    carDescription: string;
    productionYear: number;
    msrpCents: number;
  };
}

export interface DecideLuxuryCarCandidateCommand {
  type: 'decide_luxury_car_candidate';
  payload: { sourceCardInstanceId: string; accepted: boolean };
}

export interface CompleteCooldownCommand {
  type: 'complete_cooldown';
  payload: {};
}

export interface PauseMatchCommand {
  type: 'pause_match';
  payload: {
    reason: string;
  };
}

export interface ResumeMatchCommand {
  type: 'resume_match';
  payload: {};
}

export interface EndMatchCommand {
  type: 'end_match';
  payload: {
    reason?: string;
  };
}

export interface ArchiveMatchCommand {
  type: 'archive_match';
  payload: {
    adminClose?: boolean;
  };
}

export interface CommandValidationError {
  code: string;
  message: string;
  commandType: DomainCommand['type'];
  expectedLifecycleState?: MatchLifecycleState;
  expectedSeekPhaseSubstate?: SeekPhaseSubstate;
  visibilityScope?: ProjectionScope;
}
