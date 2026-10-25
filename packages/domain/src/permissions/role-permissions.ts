import type {
  ActorRef,
  DomainCommand,
  MatchAggregate,
  MatchRole
} from '../../../shared-types/src/index.ts';

import { getPlayerRole } from '../entities/match-helpers.ts';

function resolveActorRole(aggregate: MatchAggregate | undefined, actor: ActorRef): MatchRole {
  if (actor.role === 'system') {
    return 'system';
  }

  if (aggregate && actor.role === 'host' && actor.playerId === aggregate.createdByPlayerId) {
    return 'host';
  }

  const aggregateRole = aggregate ? getPlayerRole(aggregate, actor.playerId) : undefined;
  return aggregateRole ?? actor.role;
}

const HOST_COMMANDS = new Set<DomainCommand['type']>([
  'create_match',
  'remove_match_player',
  'import_content_pack',
  'publish_content_pack',
  'assign_role',
  'confirm_roles',
  'set_ruleset',
  'confirm_rules',
  'create_map_region',
  'start_match',
  'start_next_round',
  'pause_match',
  'resume_match',
  'end_match',
  'archive_match',
  'resolve_card_window',
  'resolve_endless_tumble_cast',
  'report_endless_tumble_roll',
  'set_lemon_phylactery_contact',
  'resolve_gamblers_feet_cast',
  'roll_gamblers_feet_die',
  'report_gamblers_feet_steps',
  'report_right_turn_route_choice',
  'review_unguided_tourist_photo',
  'confirm_egg_partner_acquired',
  'report_egg_partner_member_lost',
  'report_jammed_door_roll',
  'report_zoologist_evidence',
  'decide_luxury_car_candidate',
  'decide_ransom_note_question',
  'begin_cairn_rock_placement',
  'confirm_cairn_rock_stable',
  'report_cairn_tower_fallen',
  'set_hangman_word',
  'end_hangman_challenge',
  'publish_labyrinth_maze',
  'review_labyrinth_solution',
  'complete_cooldown',
  'apply_constraint',
  'update_location'
]);

const HIDER_COMMANDS = new Set<DomainCommand['type']>([
  'join_match',
  'leave_match',
  'lock_hider_location',
  'set_hiding_zone',
  'set_final_hiding_spot',
  'update_location',
  'send_chat_message',
  'upload_attachment',
  'draw_card',
  'deal_question_reward',
  'choose_question_reward',
  'play_card',
  'discard_card',
  'resolve_card_window',
  'decide_luxury_car_candidate',
  'decide_ransom_note_question',
  'resolve_endless_tumble_cast',
  'resolve_gamblers_feet_cast',
  'set_hangman_word',
  'end_hangman_challenge',
  'publish_labyrinth_maze',
  'review_labyrinth_solution',
  'review_unguided_tourist_photo',
  'answer_question'
]);

const SEEKER_COMMANDS = new Set<DomainCommand['type']>([
  'join_match',
  'leave_match',
  'begin_question_prompt',
  'ask_question',
  'update_location',
  'confirm_hider_found',
  'send_chat_message',
  'upload_attachment',
  'draw_card',
  'play_card',
  'discard_card',
  'guess_hangman_letter',
  'submit_labyrinth_solution',
  'set_bridge_troll_position',
  'set_seeker_transit_context',
  'report_u_turn_disembarkation',
  'confirm_water_weight_liquid_acquired',
  'report_water_weight_liquid_lost',
  'report_endless_tumble_roll',
  'set_lemon_phylactery_contact',
  'roll_gamblers_feet_die',
  'report_gamblers_feet_steps',
  'report_right_turn_route_choice',
  'confirm_unguided_tourist_outdoors',
  'submit_unguided_tourist_photo',
  'confirm_egg_partner_acquired',
  'report_egg_partner_member_lost',
  'report_jammed_door_roll',
  'report_zoologist_evidence',
  'report_luxury_car_candidate',
  'report_ransom_note_question',
  'begin_cairn_rock_placement',
  'confirm_cairn_rock_stable',
  'report_cairn_tower_fallen'
]);

const SPECTATOR_COMMANDS = new Set<DomainCommand['type']>(['join_match', 'leave_match', 'send_chat_message']);

const SYSTEM_COMMANDS = new Set<DomainCommand['type']>([
  'create_match',
  'start_match',
  'end_hide_phase',
  'expire_question_response',
  'apply_constraint',
  'update_location',
  'complete_cooldown',
  'pause_match',
  'resume_match',
  'end_match',
  'archive_match'
]);

export function canActorExecuteCommand(
  aggregate: MatchAggregate | undefined,
  actor: ActorRef,
  command: DomainCommand
): boolean {
  const role = resolveActorRole(aggregate, actor);

  if (role === 'host') {
    return true;
  }

  if (role === 'hider') {
    return HIDER_COMMANDS.has(command.type);
  }

  if (role === 'seeker') {
    return SEEKER_COMMANDS.has(command.type);
  }

  if (role === 'spectator') {
    return SPECTATOR_COMMANDS.has(command.type);
  }

  if (role === 'system') {
    return SYSTEM_COMMANDS.has(command.type);
  }

  return HOST_COMMANDS.has(command.type);
}
