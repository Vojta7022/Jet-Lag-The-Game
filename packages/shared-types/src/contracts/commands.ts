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
  | SetBridgeTrollPositionCommand
  | SetSeekerTransitContextCommand
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

export interface SetBridgeTrollPositionCommand {
  type: 'set_bridge_troll_position';
  payload: { sourceCardInstanceId: string; underBridge: boolean };
}

export interface SetSeekerTransitContextCommand {
  type: 'set_seeker_transit_context';
  payload: { sourceCardInstanceId: string; onTransitOrAtStation: boolean };
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
