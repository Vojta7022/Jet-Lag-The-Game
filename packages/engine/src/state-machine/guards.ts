import type {
  CommandValidationError,
  DomainCommand,
  MatchAggregate
} from '../../../shared-types/src/index.ts';

import { hasActiveCardResolution, hasLockedHiderLocation, isPaused } from '../../../domain/src/index.ts';
import { isLifecycleState, isSeekPhaseState } from './model.ts';

function error(
  commandType: DomainCommand['type'],
  code: string,
  message: string
): CommandValidationError {
  return {
    code,
    message,
    commandType
  };
}

export function validateStateForCommand(
  aggregate: MatchAggregate,
  command: DomainCommand
): CommandValidationError[] {
  const allowsPausedUpload = command.type === 'upload_attachment' && Boolean(command.payload.channelId);
  if (
    isPaused(aggregate) &&
    command.type !== 'resume_match' &&
    command.type !== 'send_chat_message' &&
    !allowsPausedUpload
  ) {
    return [error(command.type, 'MATCH_PAUSED', 'The match is paused and cannot accept this command.')];
  }

  switch (command.type) {
    case 'join_match':
      return ['draft', 'lobby', 'role_assignment'].includes(aggregate.lifecycleState)
        ? []
        : [error(command.type, 'INVALID_STATE', 'Players can only join during draft, lobby, or role assignment.')];
    case 'import_content_pack':
    case 'publish_content_pack':
      return ['draft', 'lobby', 'content_import'].includes(aggregate.lifecycleState)
        ? []
        : [error(command.type, 'INVALID_STATE', 'Content import commands are only valid before gameplay begins.')];
    case 'assign_role':
      return ['draft', 'lobby', 'role_assignment'].includes(aggregate.lifecycleState)
        ? []
        : [error(command.type, 'INVALID_STATE', 'Roles can only be assigned before rules confirmation.')];
    case 'confirm_roles':
      return isLifecycleState(aggregate, 'role_assignment')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Roles can only be confirmed during role assignment.')];
    case 'set_ruleset':
      return ['draft', 'lobby', 'rules_confirmation', 'map_setup'].includes(aggregate.lifecycleState)
        ? []
        : [error(command.type, 'INVALID_STATE', 'Rulesets can only be selected before the match starts.')];
    case 'confirm_rules':
      return isLifecycleState(aggregate, 'rules_confirmation')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Rules can only be confirmed during rules confirmation.')];
    case 'create_map_region':
      return isLifecycleState(aggregate, 'map_setup')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Map regions can only be created during map setup.')];
    case 'start_match':
      return isLifecycleState(aggregate, 'map_setup')
        ? []
        : [error(command.type, 'INVALID_STATE', 'The match can only start from map setup.')];
    case 'lock_hider_location':
      return isLifecycleState(aggregate, 'hide_phase')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Hider location can only be locked during hide phase.')];
    case 'update_location':
      return aggregate.lifecycleState === 'hide_phase' ||
        isSeekPhaseState(aggregate, 'ready') ||
        isSeekPhaseState(aggregate, 'cooldown') ||
        isLifecycleState(aggregate, 'endgame')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Location updates are only allowed in active movement states.')];
    case 'end_hide_phase':
      if (!isLifecycleState(aggregate, 'hide_phase')) {
        return [error(command.type, 'INVALID_STATE', 'Hide phase can only end while the match is hiding.')];
      }
      if (!hasLockedHiderLocation(aggregate)) {
        return [error(command.type, 'MISSING_HIDER_LOCATION', 'Hide phase cannot end before the hider location is locked.')];
      }
      return [];
    case 'begin_question_prompt':
      return isSeekPhaseState(aggregate, 'ready')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Question prompts can only open from seek phase ready.')];
    case 'ask_question':
      return isSeekPhaseState(aggregate, 'awaiting_question_selection')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Questions can only be asked while a prompt is open.')];
    case 'answer_question':
      return isSeekPhaseState(aggregate, 'awaiting_question_answer')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Questions can only be answered while awaiting an answer.')];
    case 'apply_constraint':
      return isSeekPhaseState(aggregate, 'applying_constraints')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Constraints can only be applied during constraint resolution.')];
    case 'send_chat_message':
      return aggregate.lifecycleState === 'archived'
        ? [error(command.type, 'INVALID_STATE', 'Chat messages cannot be sent after the match is archived.')]
        : [];
    case 'upload_attachment':
      return command.payload.channelId
        ? (aggregate.lifecycleState === 'archived'
            ? [error(command.type, 'INVALID_STATE', 'Attachment placeholders cannot be added after the match is archived.')]
            : [])
        : isSeekPhaseState(aggregate, 'awaiting_question_answer') ||
        isSeekPhaseState(aggregate, 'awaiting_card_resolution') ||
        isLifecycleState(aggregate, 'endgame') ||
        isLifecycleState(aggregate, 'game_complete')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Attachment placeholders can only be added in evidence-capable states.')];
    case 'draw_card':
      return aggregate.lifecycleState === 'hide_phase' ||
        isSeekPhaseState(aggregate, 'ready') ||
        isSeekPhaseState(aggregate, 'applying_constraints') ||
        isSeekPhaseState(aggregate, 'cooldown')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Cards can only be drawn in allowed gameplay windows.')];
    case 'play_card':
      if (
        !(
          aggregate.lifecycleState === 'hide_phase' ||
          isSeekPhaseState(aggregate, 'ready') ||
          isSeekPhaseState(aggregate, 'applying_constraints') ||
          isSeekPhaseState(aggregate, 'awaiting_card_resolution') ||
          isSeekPhaseState(aggregate, 'cooldown') ||
          isLifecycleState(aggregate, 'endgame')
        )
      ) {
        return [error(command.type, 'INVALID_STATE', 'Cards cannot be played in the current state.')];
      }

      if (
        hasActiveCardResolution(aggregate) &&
        aggregate.activeCardResolution?.sourceCardInstanceId !== command.payload.cardInstanceId
      ) {
        return [
          error(
            command.type,
            'CARD_RESOLUTION_LOCKED',
            'Another card resolution window is already active.'
          )
        ];
      }

      return [];
    case 'discard_card':
      return isSeekPhaseState(aggregate, 'ready') ||
        isSeekPhaseState(aggregate, 'awaiting_card_resolution') ||
        isSeekPhaseState(aggregate, 'cooldown')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Cards can only be discarded in allowed hand-management windows.')];
    case 'resolve_card_window':
      return isSeekPhaseState(aggregate, 'awaiting_card_resolution')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Card windows can only close during card resolution.')];
    case 'complete_cooldown':
      return isSeekPhaseState(aggregate, 'cooldown')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Cooldowns can only complete from the cooldown substate.')];
    case 'pause_match':
      return aggregate.lifecycleState === 'archived'
        ? [error(command.type, 'INVALID_STATE', 'Archived matches cannot be paused.')]
        : [];
    case 'resume_match':
      return aggregate.paused
        ? []
        : [error(command.type, 'INVALID_STATE', 'The match is not paused.')];
    case 'end_match':
      return ['hide_phase', 'seek_phase', 'endgame'].includes(aggregate.lifecycleState)
        ? []
        : [error(command.type, 'INVALID_STATE', 'Matches can only end from active gameplay states.')];
    case 'archive_match':
      return aggregate.lifecycleState === 'game_complete' ||
        ((aggregate.lifecycleState === 'draft' ||
          aggregate.lifecycleState === 'lobby' ||
          aggregate.lifecycleState === 'role_assignment' ||
          aggregate.lifecycleState === 'rules_confirmation' ||
          aggregate.lifecycleState === 'map_setup') &&
          Boolean(command.payload.adminClose))
        ? []
        : [error(command.type, 'INVALID_STATE', 'Matches can only be archived after completion or explicit admin close.')];
    case 'create_match':
      return [];
    default:
      return [];
  }
}
