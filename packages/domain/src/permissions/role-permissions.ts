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
  'set_hangman_word',
  'end_hangman_challenge',
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
  'set_hangman_word',
  'end_hangman_challenge',
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
  'guess_hangman_letter'
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
