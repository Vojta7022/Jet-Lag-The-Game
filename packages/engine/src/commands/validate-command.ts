import type {
  CardInstanceModel,
  CommandEnvelope,
  CommandValidationError,
  ContentPack,
  MatchAggregate
} from '../../../shared-types/src/index.ts';
import { isPolygonBoundaryGeometry } from '../../../geo/src/index.ts';

import {
  canActorExecuteCommand,
  getActiveQuestion,
  getCardInstance,
  getHandCardsForHolder,
  getPlayerRole,
  getPlayerTeam,
  hasActiveQuestion
} from '../../../domain/src/index.ts';
import {
  getCardDefinition,
  getQuestionTemplate,
  getRuleset
} from '../helpers/content-pack.ts';
import { validateStateForCommand } from '../state-machine/guards.ts';

function error(
  commandType: CommandEnvelope['command']['type'],
  code: string,
  message: string
): CommandValidationError {
  return {
    commandType,
    code,
    message
  };
}

function isCardAccessibleToActor(
  aggregate: MatchAggregate,
  card: CardInstanceModel,
  playerId: string | undefined
): boolean {
  if (!playerId) {
    return false;
  }

  if (card.holderType === 'player') {
    return card.holderId === playerId;
  }

  if (card.holderType === 'team') {
    const team = getPlayerTeam(aggregate, playerId);
    return team?.teamId === card.holderId;
  }

  return false;
}

export function validateCommandEnvelope(
  aggregate: MatchAggregate | undefined,
  envelope: CommandEnvelope,
  contentPack: ContentPack
): CommandValidationError[] {
  if (envelope.command.type === 'create_match') {
    if (aggregate) {
      return [error(envelope.command.type, 'MATCH_ALREADY_EXISTS', 'Create match can only run before a match exists.')];
    }

    if (envelope.command.payload.contentPackId !== contentPack.packId) {
      return [error(envelope.command.type, 'CONTENT_PACK_MISMATCH', 'Create match content pack does not match the loaded pack.')];
    }

    return [];
  }

  if (!aggregate) {
    return [error(envelope.command.type, 'MATCH_NOT_FOUND', 'A match must exist before this command can run.')];
  }

  if (aggregate.contentPackId !== contentPack.packId) {
    return [error(envelope.command.type, 'CONTENT_PACK_MISMATCH', 'The aggregate content pack does not match the loaded pack.')];
  }

  if (!canActorExecuteCommand(aggregate, envelope.actor, envelope.command)) {
    return [error(envelope.command.type, 'FORBIDDEN', 'The actor does not have permission to execute this command.')];
  }

  const stateErrors = validateStateForCommand(aggregate, envelope.command);
  if (stateErrors.length > 0) {
    return stateErrors;
  }

  switch (envelope.command.type) {
    case 'join_match': {
      if (aggregate.players[envelope.command.payload.playerId]) {
        return [error(envelope.command.type, 'PLAYER_EXISTS', 'This player is already part of the match.')];
      }
      return [];
    }
    case 'assign_role': {
      if (!aggregate.players[envelope.command.payload.targetPlayerId]) {
        return [error(envelope.command.type, 'PLAYER_NOT_FOUND', 'Cannot assign a role to a missing player.')];
      }
      return [];
    }
    case 'confirm_roles': {
      const assignedRoles = Object.values(aggregate.roleAssignments).map((assignment) => assignment.role);
      if (!assignedRoles.includes('hider') || !assignedRoles.includes('seeker')) {
        return [error(envelope.command.type, 'ROLES_INCOMPLETE', 'At least one hider and one seeker are required.')];
      }
      return [];
    }
    case 'set_ruleset': {
      if (!getRuleset(contentPack, envelope.command.payload.rulesetId)) {
        return [error(envelope.command.type, 'RULESET_NOT_FOUND', 'The selected ruleset is not present in the content pack.')];
      }
      return [];
    }
    case 'create_map_region': {
      if (!isPolygonBoundaryGeometry(envelope.command.payload.geometry)) {
        return [
          error(
            envelope.command.type,
            'INVALID_REGION_BOUNDARY',
            'The playable region must be defined by a polygon or multipolygon boundary.'
          )
        ];
      }
      return [];
    }
    case 'start_match': {
      if (!aggregate.selectedRulesetId) {
        return [error(envelope.command.type, 'RULESET_REQUIRED', 'A ruleset must be selected before starting the match.')];
      }
      if (!aggregate.mapRegion) {
        return [error(envelope.command.type, 'MAP_REGION_REQUIRED', 'A map region must be configured before starting the match.')];
      }
      return [];
    }
    case 'lock_hider_location': {
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId);
      if (actorRole !== 'hider' && envelope.actor.role !== 'host') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the hider or host can lock the hider location.')];
      }
      return [];
    }
    case 'ask_question': {
      if (hasActiveQuestion(aggregate)) {
        return [error(envelope.command.type, 'QUESTION_FLOW_LOCKED', 'A question is already active.')];
      }

      const template = getQuestionTemplate(contentPack, envelope.command.payload.templateId);
      if (!template) {
        return [error(envelope.command.type, 'QUESTION_TEMPLATE_NOT_FOUND', 'The selected question template does not exist.')];
      }
      return [];
    }
    case 'answer_question': {
      const activeQuestion = getActiveQuestion(aggregate);
      if (!activeQuestion || activeQuestion.questionInstanceId !== envelope.command.payload.questionInstanceId) {
        return [error(envelope.command.type, 'QUESTION_NOT_ACTIVE', 'This question is not the active question.')];
      }
      return [];
    }
    case 'apply_constraint': {
      const activeQuestion = getActiveQuestion(aggregate);
      if (!activeQuestion || activeQuestion.questionInstanceId !== envelope.command.payload.questionInstanceId) {
        return [error(envelope.command.type, 'QUESTION_NOT_ACTIVE', 'Constraints can only be applied to the active question.')];
      }

      if (!aggregate.mapRegion || !aggregate.searchArea) {
        return [
          error(
            envelope.command.type,
            'MAP_REGION_REQUIRED',
            'Constraints require a configured playable region and initialized search area.'
          )
        ];
      }

      if (!contentPack.constraints.find((constraint) => constraint.constraintId === envelope.command.payload.constraintId)) {
        return [error(envelope.command.type, 'CONSTRAINT_NOT_FOUND', 'The selected constraint definition does not exist.')];
      }
      return [];
    }
    case 'draw_card': {
      const deck = contentPack.decks.find((candidate) => candidate.deckId === envelope.command.payload.deckId);
      if (!deck) {
        return [error(envelope.command.type, 'DECK_NOT_FOUND', 'The selected deck does not exist.')];
      }
      return [];
    }
    case 'play_card': {
      const cardInstance = getCardInstance(aggregate, envelope.command.payload.cardInstanceId);
      if (!cardInstance) {
        return [error(envelope.command.type, 'CARD_NOT_FOUND', 'The selected card instance does not exist.')];
      }

      if (cardInstance.zone !== 'hand') {
        return [error(envelope.command.type, 'CARD_NOT_IN_HAND', 'Only cards in hand can be played.')];
      }

      if (!isCardAccessibleToActor(aggregate, cardInstance, envelope.actor.playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'The actor cannot play this card.')];
      }

      if (!getCardDefinition(contentPack, cardInstance.cardDefinitionId)) {
        return [error(envelope.command.type, 'CARD_DEFINITION_NOT_FOUND', 'The card definition is missing from the content pack.')];
      }

      return [];
    }
    case 'resolve_card_window': {
      if (aggregate.activeCardResolution?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'CARD_WINDOW_NOT_ACTIVE', 'This card resolution window is not active.')];
      }
      return [];
    }
    case 'resume_match':
      return [];
    case 'archive_match':
      return [];
    default:
      return [];
  }
}
