import type {
  ActorRef,
  ArchiveMatchCommand,
  ApplyConstraintCommand,
  AskQuestionCommand,
  ExpireQuestionResponseCommand,
  AssignRoleCommand,
  BeginQuestionPromptCommand,
  CompleteCooldownCommand,
  ConfirmRolesCommand,
  ConfirmRulesCommand,
  CreateMapRegionCommand,
  CreateMatchCommand,
  DiscardCardCommand,
  DrawCardCommand,
  EndHidePhaseCommand,
  EndMatchCommand,
  ImportContentPackCommand,
  JoinMatchCommand,
  LockHiderLocationCommand,
  SetHidingZoneCommand,
  SendChatMessageCommand,
  UpdateLocationCommand,
  PauseMatchCommand,
  PlayCardCommand,
  PublishContentPackCommand,
  ResolveCardWindowCommand,
  ResumeMatchCommand,
  SetRulesetCommand,
  StartMatchCommand,
  StartNextRoundCommand,
  AnswerQuestionCommand,
  UploadAttachmentCommand
} from '../contracts/commands.ts';
import type {
  CardInstanceModel,
  ConstraintRecordModel,
  MatchAggregate,
  MatchLifecycleState,
  PauseOverlayState,
  PlayerModel,
  QuestionInstanceModel,
  RoundResultModel,
  RoleAssignmentModel,
  SeekPhaseSubstate,
  TeamModel,
  TimerModel
} from '../domain/match.ts';
import type { AttachmentModel, ChatMessageModel } from '../domain/chat.ts';
import type { CardKind, ProjectionScope } from '../content.ts';

export interface DomainEventEnvelope<TEvent extends DomainEvent = DomainEvent> {
  eventId: string;
  matchId: string;
  sequence: number;
  occurredAt: string;
  actor: ActorRef;
  visibilityScope: ProjectionScope;
  event: TEvent;
}

export type DomainEvent =
  | MatchCreatedEvent
  | PlayerJoinedEvent
  | PlayerRemovedEvent
  | ContentImportStartedEvent
  | ContentPackPublishedEvent
  | RoleAssignedEvent
  | RolesConfirmedEvent
  | RulesetSelectedEvent
  | RulesConfirmedEvent
  | MapRegionCreatedEvent
  | MatchStartedEvent
  | RoundStartedEvent
  | HiderLocationLockedEvent
  | HidingZoneSetEvent
  | FinalHidingSpotSetEvent
  | LocationUpdatedEvent
  | EndgameStartedEvent
  | HiderFoundEvent
  | HidePhaseEndedEvent
  | QuestionPromptOpenedEvent
  | QuestionAskedEvent
  | QuestionResponseExpiredEvent
  | QuestionAnsweredEvent
  | QuestionVetoedEvent
  | QuestionRandomizedEvent
  | QuestionNullAnswerResolvedEvent
  | ConstraintAppliedEvent
  | ChatMessageSentEvent
  | AttachmentUploadedEvent
  | CardDrawnEvent
  | QuestionRewardDealtEvent
  | QuestionRewardChosenEvent
  | QuestionRewardDrawBonusGrantedEvent
  | CardPlayedEvent
  | TimerAdjustedEvent
  | CardDiscardedEvent
  | CardResolutionOpenedEvent
  | CardResolutionClosedEvent
  | HangmanWordSetEvent
  | HangmanLetterGuessedEvent
  | HangmanChallengeEndedEvent
  | QuestionTemplatesDisabledEvent
  | QuestionCategoryDisabledEvent
  | HiderHandLimitExpandedEvent
  | CooldownCompletedEvent
  | MatchPausedEvent
  | MatchResumedEvent
  | MatchEndedEvent
  | MatchArchivedEvent;

export interface MatchCreatedEvent {
  type: 'match_created';
  payload: {
    match: Pick<
      MatchAggregate,
      'matchId' | 'mode' | 'contentPackId' | 'contentPackVersion' | 'createdByPlayerId' | 'selectedScale'
    >;
    hostPlayer: PlayerModel;
    teams: TeamModel[];
    roleAssignments: RoleAssignmentModel[];
    cardInstances: CardInstanceModel[];
    lifecycleState: MatchLifecycleState;
  };
}

export interface PlayerJoinedEvent {
  type: 'player_joined';
  payload: {
    player: PlayerModel;
    lifecycleState: MatchLifecycleState;
  };
}

export interface PlayerRemovedEvent {
  type: 'player_removed';
  payload: {
    playerId: string;
    lifecycleState: MatchLifecycleState;
  };
}

export interface ContentImportStartedEvent {
  type: 'content_import_started';
  payload: ImportContentPackCommand['payload'] & {
    lifecycleState: MatchLifecycleState;
  };
}

export interface ContentPackPublishedEvent {
  type: 'content_pack_published';
  payload: PublishContentPackCommand['payload'] & {
    lifecycleState: MatchLifecycleState;
  };
}

export interface RoleAssignedEvent {
  type: 'role_assigned';
  payload: AssignRoleCommand['payload'] & {
    roleAssignment: RoleAssignmentModel;
    team: TeamModel;
    lifecycleState: MatchLifecycleState;
  };
}

export interface RolesConfirmedEvent {
  type: 'roles_confirmed';
  payload: ConfirmRolesCommand['payload'] & {
    lifecycleState: MatchLifecycleState;
  };
}

export interface RulesetSelectedEvent {
  type: 'ruleset_selected';
  payload: SetRulesetCommand['payload'] & {
    lifecycleState: MatchLifecycleState;
  };
}

export interface RulesConfirmedEvent {
  type: 'rules_confirmed';
  payload: ConfirmRulesCommand['payload'] & {
    lifecycleState: MatchLifecycleState;
  };
}

export interface MapRegionCreatedEvent {
  type: 'map_region_created';
  payload: CreateMapRegionCommand['payload'] & {
    lifecycleState: MatchLifecycleState;
  };
}

export interface MatchStartedEvent {
  type: 'match_started';
  payload: StartMatchCommand['payload'] & {
    lifecycleState: MatchLifecycleState;
    timer: TimerModel;
    roleAssignments: RoleAssignmentModel[];
    teams: TeamModel[];
    hiderRotationOrder: string[];
    cardInstances: CardInstanceModel[];
  };
}

export interface RoundStartedEvent {
  type: 'round_started';
  payload: StartNextRoundCommand['payload'] & {
    lifecycleState: 'hide_phase';
    timer: TimerModel;
    cardInstances: CardInstanceModel[];
    roleAssignments: RoleAssignmentModel[];
    teams: TeamModel[];
    hiderRotationOrder: string[];
    roundStartLocation: { latitude: number; longitude: number };
  };
}

export interface HiderLocationLockedEvent {
  type: 'hider_location_locked';
  payload: LockHiderLocationCommand['payload'] & {
    lockedByPlayerId: string;
  };
}

export interface HidingZoneSetEvent {
  type: 'hiding_zone_set';
  payload: SetHidingZoneCommand['payload'] & {
    radiusMeters: number;
    selectedByPlayerId: string;
  };
}

export interface LocationUpdatedEvent {
  type: 'location_updated';
  payload: UpdateLocationCommand['payload'] & {
    playerId: string;
    role: MatchAggregate['roleAssignments'][string]['role'];
    teamId?: string;
  };
}

export interface FinalHidingSpotSetEvent {
  type: 'final_hiding_spot_set';
  payload: {
    latitude: number;
    longitude: number;
    selectedByPlayerId: string;
  };
}

export interface EndgameStartedEvent {
  type: 'endgame_started';
  payload: {
    triggeredByPlayerId: string;
  };
}

export interface HiderFoundEvent {
  type: 'hider_found';
  payload: {
    roundResult: RoundResultModel;
  };
}

export interface HidePhaseEndedEvent {
  type: 'hide_phase_ended';
  payload: EndHidePhaseCommand['payload'] & {
    lifecycleState: MatchLifecycleState;
    seekPhaseSubstate: SeekPhaseSubstate;
  };
}

export interface QuestionPromptOpenedEvent {
  type: 'question_prompt_opened';
  payload: BeginQuestionPromptCommand['payload'] & {
    lifecycleState: MatchLifecycleState;
    seekPhaseSubstate: SeekPhaseSubstate;
  };
}

export interface QuestionAskedEvent {
  type: 'question_asked';
  payload: AskQuestionCommand['payload'] & {
    question: QuestionInstanceModel;
    lifecycleState: MatchLifecycleState;
    seekPhaseSubstate: SeekPhaseSubstate;
    questionTimer?: TimerModel;
  };
}

export interface QuestionResponseExpiredEvent {
  type: 'question_response_expired';
  payload: ExpireQuestionResponseCommand['payload'] & {
    lateResponseStartedAt: string;
  };
}

export interface QuestionAnsweredEvent {
  type: 'question_answered';
  payload: AnswerQuestionCommand['payload'] & {
    lifecycleState: MatchLifecycleState;
    seekPhaseSubstate: SeekPhaseSubstate;
    automaticResolution?: MatchAggregate['questionInstances'][string]['automaticResolution'];
  };
}

export interface QuestionVetoedEvent {
  type: 'question_vetoed';
  payload: {
    questionInstanceId: string;
    lifecycleState: MatchLifecycleState;
    seekPhaseSubstate: SeekPhaseSubstate;
  };
}

export interface QuestionRandomizedEvent {
  type: 'question_randomized';
  payload: {
    originalQuestionInstanceId: string;
    replacementQuestion: QuestionInstanceModel;
    lifecycleState: MatchLifecycleState;
    seekPhaseSubstate: SeekPhaseSubstate;
    replacementQuestionTimer: TimerModel;
  };
}

export interface QuestionNullAnswerResolvedEvent {
  type: 'question_null_answer_resolved';
  payload: {
    questionInstanceId: string;
    answer: Record<string, unknown>;
    automaticResolution?: import('../domain/match.ts').AutomaticQuestionResolutionModel;
    lifecycleState: MatchLifecycleState;
    seekPhaseSubstate: SeekPhaseSubstate;
  };
}

export interface ConstraintAppliedEvent {
  type: 'constraint_applied';
  payload: ApplyConstraintCommand['payload'] & {
    constraint: ConstraintRecordModel;
    lifecycleState: MatchLifecycleState;
    seekPhaseSubstate: SeekPhaseSubstate;
    cooldownTimer?: TimerModel;
  };
}

export interface ChatMessageSentEvent {
  type: 'chat_message_sent';
  payload: SendChatMessageCommand['payload'] & {
    message: ChatMessageModel;
  };
}

export interface AttachmentUploadedEvent {
  type: 'attachment_uploaded';
  payload: UploadAttachmentCommand['payload'] & {
    attachment: AttachmentModel;
  };
}

export interface CardDrawnEvent {
  type: 'card_drawn';
  payload: DrawCardCommand['payload'] & {
    cardInstance: CardInstanceModel;
  };
}

export interface QuestionRewardDealtEvent {
  type: 'question_reward_dealt';
  payload: {
    pendingReward: NonNullable<MatchAggregate['pendingQuestionReward']>;
    cardInstances: CardInstanceModel[];
  };
}

export interface QuestionRewardChosenEvent {
  type: 'question_reward_chosen';
  payload: {
    questionInstanceId: string;
    cardInstances: CardInstanceModel[];
  };
}

export interface QuestionRewardDrawBonusGrantedEvent {
  type: 'question_reward_draw_bonus_granted';
  payload: {
    questionCount: number;
    extraDrawCount: number;
    sourceCardInstanceId: string;
  };
}

export interface CardPlayedEvent {
  type: 'card_played';
  payload: PlayCardCommand['payload'] & {
    cardInstance: CardInstanceModel;
  };
}

export interface TimerAdjustedEvent {
  type: 'timer_adjusted';
  payload: {
    timer: TimerModel;
    sourceCardInstanceId?: string;
  };
}

export interface CardDiscardedEvent {
  type: 'card_discarded';
  payload: DiscardCardCommand['payload'] & {
    cardInstance: CardInstanceModel;
  };
}

export interface CardResolutionOpenedEvent {
  type: 'card_resolution_opened';
  payload: {
    sourceCardInstanceId: string;
    copiedCardInstanceId?: string;
    seekPhaseSubstate: SeekPhaseSubstate;
    lifecycleState: MatchLifecycleState;
    resolutionKind?: 'manual_only' | 'move' | 'discard_then_draw' | 'time_bonus' | 'disable_question_templates' | 'random_question_category_lock' | 'extra_question_reward_draws' | 'hangman_challenge';
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
    questionTemplateCount?: number;
    requireDistinctQuestionCategories?: boolean;
    rerollAfterQuestion?: boolean;
    questionRewardCount?: number;
    extraQuestionRewardDrawCount?: number;
    sourceDeckId?: string;
    holderType?: CardInstanceModel['holderType'];
    holderId?: string;
    openingHandCardInstanceIds?: string[];
  };
}

export interface HangmanWordSetEvent {
  type: 'hangman_word_set';
  payload: { sourceCardInstanceId: string; word: string; secretOwnerPlayerId: string };
}

export interface HangmanLetterGuessedEvent {
  type: 'hangman_letter_guessed';
  payload: { sourceCardInstanceId: string; letter: string; correct: boolean; solved: boolean };
}

export interface HangmanChallengeEndedEvent {
  type: 'hangman_challenge_ended';
  payload: { sourceCardInstanceId: string; revealedWord: string };
}

export interface QuestionTemplatesDisabledEvent {
  type: 'question_templates_disabled';
  payload: {
    questionTemplateIds: string[];
    sourceCardInstanceId: string;
  };
}

export interface QuestionCategoryDisabledEvent {
  type: 'question_category_disabled';
  payload: {
    categoryId: string;
    sourceCardInstanceId: string;
    reason: 'initial_roll' | 'question_reroll';
  };
}

export interface CardResolutionClosedEvent {
  type: 'card_resolution_closed';
  payload: ResolveCardWindowCommand['payload'] & {
    seekPhaseSubstate: SeekPhaseSubstate;
    lifecycleState: MatchLifecycleState;
    cooldownTimer?: TimerModel;
  };
}

export interface HiderHandLimitExpandedEvent {
  type: 'hider_hand_limit_expanded';
  payload: {
    sourceCardInstanceId: string;
    increaseBy: number;
  };
}

export interface CooldownCompletedEvent {
  type: 'cooldown_completed';
  payload: CompleteCooldownCommand['payload'] & {
    seekPhaseSubstate: SeekPhaseSubstate;
  };
}

export interface MatchPausedEvent {
  type: 'match_paused';
  payload: PauseMatchCommand['payload'] & {
    paused: PauseOverlayState;
  };
}

export interface MatchResumedEvent {
  type: 'match_resumed';
  payload: ResumeMatchCommand['payload'] & {
    lifecycleState: MatchLifecycleState;
    seekPhaseSubstate?: SeekPhaseSubstate;
  };
}

export interface MatchEndedEvent {
  type: 'match_ended';
  payload: EndMatchCommand['payload'] & {
    lifecycleState: MatchLifecycleState;
  };
}

export interface MatchArchivedEvent {
  type: 'match_archived';
  payload: ArchiveMatchCommand['payload'] & {
    lifecycleState: MatchLifecycleState;
  };
}
