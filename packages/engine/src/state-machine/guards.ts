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
    case 'remove_match_player':
    case 'leave_match':
      return ['draft', 'lobby', 'content_import', 'role_assignment', 'rules_confirmation', 'map_setup'].includes(aggregate.lifecycleState)
        ? []
        : [error(command.type, 'INVALID_STATE', 'Players can only leave or be removed before gameplay starts.')];
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
    case 'start_next_round':
      return isLifecycleState(aggregate, 'game_complete')
        ? []
        : [error(command.type, 'INVALID_STATE', 'A new round can only start after the previous hider is found.')];
    case 'lock_hider_location':
      return isLifecycleState(aggregate, 'hide_phase') ||
        (isSeekPhaseState(aggregate, 'awaiting_card_resolution') && aggregate.activeCardResolution?.resolutionKind === 'move')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Hider location can only be locked during hide phase or a Move card.')];
    case 'set_hiding_zone':
      return isLifecycleState(aggregate, 'hide_phase') ||
        (isSeekPhaseState(aggregate, 'awaiting_card_resolution') && aggregate.activeCardResolution?.resolutionKind === 'move')
        ? []
        : [error(command.type, 'INVALID_STATE', 'The hiding zone can only be selected during hide phase or a Move card.')];
    case 'set_final_hiding_spot':
      return isSeekPhaseState(aggregate)
        ? []
        : [error(command.type, 'INVALID_STATE', 'The final hiding spot can only be chosen during the seek phase.')];
    case 'confirm_hider_found':
      return isLifecycleState(aggregate, 'endgame')
        ? []
        : [error(command.type, 'INVALID_STATE', 'The hider can only be found during endgame.')];
    case 'update_location':
      return aggregate.lifecycleState === 'hide_phase' ||
        isSeekPhaseState(aggregate, 'ready') ||
        isSeekPhaseState(aggregate, 'cooldown') ||
        (isSeekPhaseState(aggregate, 'awaiting_card_resolution') && aggregate.activeCardResolution?.resolutionKind === 'move') ||
        isLifecycleState(aggregate, 'endgame')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Location updates are only allowed in active movement states.')];
    case 'end_hide_phase':
      if (!isLifecycleState(aggregate, 'hide_phase')) {
        return [error(command.type, 'INVALID_STATE', 'Hide phase can only end while the match is hiding.')];
      }
      if (aggregate.activeCardResolution?.resolutionKind === 'move') {
        return [error(command.type, 'CARD_RESOLUTION_LOCKED', 'The active Move card must finish before hide phase can end.')];
      }
      if (!hasLockedHiderLocation(aggregate)) {
        return [error(command.type, 'MISSING_HIDER_LOCATION', 'Hide phase cannot end before the hider location is locked.')];
      }
      return [];
    case 'begin_question_prompt':
      return isSeekPhaseState(aggregate, 'ready') ||
        (isLifecycleState(aggregate, 'endgame') &&
          (!aggregate.seekPhaseSubstate || aggregate.seekPhaseSubstate === 'ready'))
        ? []
        : [error(command.type, 'INVALID_STATE', 'Question prompts can only open when seekers are ready, including during endgame.')];
    case 'set_bridge_troll_position':
      return isSeekPhaseState(aggregate) || isLifecycleState(aggregate, 'endgame')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Bridge position can only be confirmed while seekers are searching.')];
    case 'set_seeker_transit_context':
      return isSeekPhaseState(aggregate) || isLifecycleState(aggregate, 'endgame')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Transit status can only be updated while seekers are searching.')];
    case 'confirm_water_weight_liquid_acquired':
    case 'report_water_weight_liquid_lost':
      return isSeekPhaseState(aggregate) || isLifecycleState(aggregate, 'endgame')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Water Weight status can only be updated while seekers are searching.')];
    case 'resolve_endless_tumble_cast':
      return isSeekPhaseState(aggregate) || isLifecycleState(aggregate, 'endgame')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Endless Tumble can only be cast while seekers are searching.')];
    case 'report_endless_tumble_roll':
      return isSeekPhaseState(aggregate) || isLifecycleState(aggregate, 'endgame')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Endless Tumble rolls can only be reported while seekers are searching.')];
    case 'set_lemon_phylactery_contact':
    case 'confirm_egg_partner_acquired':
    case 'report_egg_partner_member_lost':
    case 'report_jammed_door_roll':
    case 'report_zoologist_evidence':
    case 'report_luxury_car_candidate':
    case 'decide_luxury_car_candidate':
    case 'report_ransom_note_question':
    case 'decide_ransom_note_question':
    case 'begin_cairn_rock_placement':
    case 'confirm_cairn_rock_stable':
    case 'report_cairn_tower_fallen':
      return isSeekPhaseState(aggregate) || isLifecycleState(aggregate, 'endgame')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Challenge reports are only available while seekers are searching.')];
    case 'resolve_gamblers_feet_cast':
      return isSeekPhaseState(aggregate) || isLifecycleState(aggregate, 'endgame')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Gambler’s Feet can only be cast while seekers are searching.')];
    case 'roll_gamblers_feet_die':
    case 'report_gamblers_feet_steps':
      return isSeekPhaseState(aggregate) || isLifecycleState(aggregate, 'endgame')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Gambler’s Feet step tracking is only active while seekers are searching.')];
    case 'ask_question':
      return isSeekPhaseState(aggregate, 'awaiting_question_selection') ||
        (isLifecycleState(aggregate, 'endgame') && aggregate.seekPhaseSubstate === 'awaiting_question_selection')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Questions can only be asked while a prompt is open.')];
    case 'answer_question':
      return isSeekPhaseState(aggregate, 'awaiting_question_answer') ||
        (isLifecycleState(aggregate, 'endgame') && aggregate.seekPhaseSubstate === 'awaiting_question_answer')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Questions can only be answered while awaiting an answer.')];
    case 'apply_constraint':
      return isSeekPhaseState(aggregate, 'applying_constraints') ||
        (isLifecycleState(aggregate, 'endgame') && aggregate.seekPhaseSubstate === 'applying_constraints')
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
        Boolean(aggregate.zoologistChallenge) ||
        Boolean(aggregate.luxuryCarChallenge) ||
        isLifecycleState(aggregate, 'endgame') ||
        isLifecycleState(aggregate, 'game_complete')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Attachment placeholders can only be added in evidence-capable states.')];
    case 'draw_card':
      return aggregate.lifecycleState === 'hide_phase' ||
        isSeekPhaseState(aggregate, 'ready') ||
        isSeekPhaseState(aggregate, 'applying_constraints') ||
        isSeekPhaseState(aggregate, 'cooldown') ||
        (isLifecycleState(aggregate, 'endgame') &&
          ['ready', 'applying_constraints', 'cooldown'].includes(aggregate.seekPhaseSubstate ?? 'ready'))
        ? []
        : [error(command.type, 'INVALID_STATE', 'Cards can only be drawn in allowed gameplay windows.')];
    case 'deal_question_reward':
    case 'choose_question_reward':
      return isSeekPhaseState(aggregate, 'ready') ||
        isSeekPhaseState(aggregate, 'cooldown') ||
        (isLifecycleState(aggregate, 'endgame') && ['ready', 'cooldown'].includes(aggregate.seekPhaseSubstate ?? 'ready'))
        ? []
        : [error(command.type, 'INVALID_STATE', 'Question card rewards are handled after the question and map resolution are complete.')];
    case 'play_card':
      if (
        !(
          aggregate.lifecycleState === 'hide_phase' ||
          isSeekPhaseState(aggregate, 'awaiting_question_answer') ||
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
      return isSeekPhaseState(aggregate, 'awaiting_card_resolution') ||
        (isLifecycleState(aggregate, 'endgame') && aggregate.seekPhaseSubstate === 'awaiting_card_resolution') ||
        (isLifecycleState(aggregate, 'hide_phase') && aggregate.activeCardResolution?.resolutionKind === 'move')
        ? []
        : [error(command.type, 'INVALID_STATE', 'Card windows can only close during card resolution.')];
    case 'complete_cooldown':
      return isSeekPhaseState(aggregate, 'cooldown') ||
        (isLifecycleState(aggregate, 'endgame') && aggregate.seekPhaseSubstate === 'cooldown')
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
