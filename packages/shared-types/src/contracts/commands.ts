import type {
  AttachmentKind,
  GeoJsonGeometryModel,
  MatchLifecycleState,
  MatchMode,
  MatchRole,
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
  | ImportContentPackCommand
  | PublishContentPackCommand
  | AssignRoleCommand
  | ConfirmRolesCommand
  | SetRulesetCommand
  | ConfirmRulesCommand
  | CreateMapRegionCommand
  | StartMatchCommand
  | LockHiderLocationCommand
  | UpdateLocationCommand
  | EndHidePhaseCommand
  | BeginQuestionPromptCommand
  | AskQuestionCommand
  | AnswerQuestionCommand
  | ApplyConstraintCommand
  | SendChatMessageCommand
  | UploadAttachmentCommand
  | DrawCardCommand
  | PlayCardCommand
  | DiscardCardCommand
  | ResolveCardWindowCommand
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
  };
}

export interface StartMatchCommand {
  type: 'start_match';
  payload: {};
}

export interface LockHiderLocationCommand {
  type: 'lock_hider_location';
  payload: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  };
}

export interface UpdateLocationCommand {
  type: 'update_location';
  payload: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    source?: 'device' | 'manual' | 'system';
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
  };
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

export interface PlayCardCommand {
  type: 'play_card';
  payload: {
    cardInstanceId: string;
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
  };
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
