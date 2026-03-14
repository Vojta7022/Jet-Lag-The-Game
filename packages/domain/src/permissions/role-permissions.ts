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

  const aggregateRole = aggregate ? getPlayerRole(aggregate, actor.playerId) : undefined;
  return aggregateRole ?? actor.role;
}

const HOST_COMMANDS = new Set<DomainCommand['type']>([
  'create_match',
  'import_content_pack',
  'publish_content_pack',
  'assign_role',
  'confirm_roles',
  'set_ruleset',
  'confirm_rules',
  'create_map_region',
  'start_match',
  'pause_match',
  'resume_match',
  'end_match',
  'archive_match',
  'resolve_card_window',
  'complete_cooldown',
  'apply_constraint',
  'update_location'
]);

const HIDER_COMMANDS = new Set<DomainCommand['type']>([
  'join_match',
  'lock_hider_location',
  'update_location',
  'draw_card',
  'play_card',
  'answer_question'
]);

const SEEKER_COMMANDS = new Set<DomainCommand['type']>([
  'join_match',
  'begin_question_prompt',
  'ask_question',
  'update_location',
  'draw_card',
  'play_card'
]);

const SPECTATOR_COMMANDS = new Set<DomainCommand['type']>(['join_match']);

const SYSTEM_COMMANDS = new Set<DomainCommand['type']>([
  'create_match',
  'start_match',
  'end_hide_phase',
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
