import type {
  ActorRef,
  ArchiveMatchCommand,
  ApplyConstraintCommand,
  AskQuestionCommand,
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
  SendChatMessageCommand,
  UpdateLocationCommand,
  PauseMatchCommand,
  PlayCardCommand,
  PublishContentPackCommand,
  ResolveCardWindowCommand,
  ResumeMatchCommand,
  SetRulesetCommand,
  StartMatchCommand,
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
  | ContentImportStartedEvent
  | ContentPackPublishedEvent
  | RoleAssignedEvent
  | RolesConfirmedEvent
  | RulesetSelectedEvent
  | RulesConfirmedEvent
  | MapRegionCreatedEvent
  | MatchStartedEvent
  | HiderLocationLockedEvent
  | LocationUpdatedEvent
  | HidePhaseEndedEvent
  | QuestionPromptOpenedEvent
  | QuestionAskedEvent
  | QuestionAnsweredEvent
  | ConstraintAppliedEvent
  | ChatMessageSentEvent
  | AttachmentUploadedEvent
  | CardDrawnEvent
  | CardPlayedEvent
  | TimerAdjustedEvent
  | CardDiscardedEvent
  | CardResolutionOpenedEvent
  | CardResolutionClosedEvent
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
      'matchId' | 'mode' | 'contentPackId' | 'createdByPlayerId' | 'selectedScale'
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
  };
}

export interface HiderLocationLockedEvent {
  type: 'hider_location_locked';
  payload: LockHiderLocationCommand['payload'] & {
    lockedByPlayerId: string;
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

export interface QuestionAnsweredEvent {
  type: 'question_answered';
  payload: AnswerQuestionCommand['payload'] & {
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
    seekPhaseSubstate: SeekPhaseSubstate;
    lifecycleState: MatchLifecycleState;
    resolutionKind?: 'manual_only' | 'discard_then_draw' | 'time_bonus';
    discardRequirement?: {
      requiredCards?: number;
      requiredKind?: CardKind;
      discardWholeHand?: boolean;
    };
    drawCountOnResolve?: number;
    timeBonusMinutes?: number;
    sourceDeckId?: string;
    holderType?: CardInstanceModel['holderType'];
    holderId?: string;
    openingHandCardInstanceIds?: string[];
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
