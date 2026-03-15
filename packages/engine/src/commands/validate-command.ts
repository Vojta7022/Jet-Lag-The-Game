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
  getAttachment,
  getChatChannel,
  getActiveQuestion,
  getCardInstance,
  getHandCardsForHolder,
  getPlayerRole,
  getPlayerTeam,
  hasActiveQuestion
} from '../../../domain/src/index.ts';
import {
  getCardDefinition,
  getConstraintDefinition,
  getQuestionCategory,
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

function canActorUseChannel(
  aggregate: MatchAggregate,
  channelId: string,
  playerId: string | undefined,
  actorRole: CommandEnvelope['actor']['role']
): boolean {
  const channel = getChatChannel(aggregate, channelId);
  if (!channel) {
    return false;
  }

  if (actorRole === 'host') {
    return true;
  }

  if (channel.visibilityScope === 'public_match') {
    return true;
  }

  if (channel.visibilityScope === 'team_private') {
    const team = getPlayerTeam(aggregate, playerId);
    return Boolean(team && channel.teamId && team.teamId === channel.teamId);
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
    case 'update_location': {
      if (!envelope.actor.playerId) {
        return [error(envelope.command.type, 'PLAYER_REQUIRED', 'Location updates require an associated player.')];
      }

      if (
        !Number.isFinite(envelope.command.payload.latitude) ||
        !Number.isFinite(envelope.command.payload.longitude)
      ) {
        return [error(envelope.command.type, 'INVALID_LOCATION', 'Location updates require numeric latitude and longitude values.')];
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

      if (!activeQuestion.answer) {
        return [error(envelope.command.type, 'QUESTION_NOT_ANSWERED', 'Constraints require a recorded answer before resolution.')];
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

      const template = getQuestionTemplate(contentPack, activeQuestion.templateId);
      if (!template) {
        return [error(envelope.command.type, 'QUESTION_TEMPLATE_NOT_FOUND', 'The active question template could not be resolved.')];
      }

      const category = getQuestionCategory(contentPack, template.categoryId);
      if (!category) {
        return [error(envelope.command.type, 'QUESTION_CATEGORY_NOT_FOUND', 'The active question category could not be resolved.')];
      }

      const constraint = getConstraintDefinition(contentPack, envelope.command.payload.constraintId);
      if (!constraint) {
        return [error(envelope.command.type, 'CONSTRAINT_NOT_FOUND', 'The selected constraint definition does not exist.')];
      }

      const allowedConstraintIds = new Set([
        ...template.constraintRefs,
        ...(category.defaultConstraintRefs ?? [])
      ]);
      if (!allowedConstraintIds.has(constraint.constraintId)) {
        return [error(envelope.command.type, 'CONSTRAINT_NOT_ALLOWED', 'The selected constraint is not allowed for this question template.')];
      }

      const answerValue = activeQuestion.answer?.value;
      if (
        category.resolverKind === 'threshold_distance' &&
        ((answerValue === 'yes' && constraint.kind !== 'within_distance') ||
          (answerValue === 'no' && constraint.kind !== 'beyond_distance'))
      ) {
        return [error(envelope.command.type, 'CONSTRAINT_MISMATCH', 'Radar answers must use the matching inclusion or exclusion constraint.')];
      }

      return [];
    }
    case 'send_chat_message': {
      const channel = getChatChannel(aggregate, envelope.command.payload.channelId);
      if (!channel) {
        return [error(envelope.command.type, 'CHANNEL_NOT_FOUND', 'The selected chat channel does not exist.')];
      }

      if (
        !canActorUseChannel(
          aggregate,
          channel.channelId,
          envelope.actor.playerId,
          envelope.actor.role
        )
      ) {
        return [error(envelope.command.type, 'FORBIDDEN', 'The actor cannot send messages to this channel.')];
      }

      const body = envelope.command.payload.body?.trim() ?? '';
      const attachmentIds = envelope.command.payload.attachmentIds ?? [];
      if (body.length === 0 && attachmentIds.length === 0) {
        return [
          error(
            envelope.command.type,
            'EMPTY_MESSAGE',
            'Chat messages must include text, at least one attachment placeholder, or both.'
          )
        ];
      }

      for (const attachmentId of attachmentIds) {
        const attachment = getAttachment(aggregate, attachmentId);
        if (!attachment) {
          return [
            error(
              envelope.command.type,
              'ATTACHMENT_NOT_FOUND',
              `The attachment placeholder "${attachmentId}" does not exist.`
            )
          ];
        }

        if (attachment.visibilityScope !== channel.visibilityScope) {
          return [
            error(
              envelope.command.type,
              'ATTACHMENT_SCOPE_MISMATCH',
              'Attachment placeholders must match the selected channel visibility.'
            )
          ];
        }

        if (attachment.channelId && attachment.channelId !== channel.channelId) {
          return [
            error(
              envelope.command.type,
              'ATTACHMENT_CHANNEL_MISMATCH',
              'Attachment placeholders tied to another channel cannot be reused here.'
            )
          ];
        }
      }

      return [];
    }
    case 'upload_attachment': {
      const label = envelope.command.payload.label.trim();
      const note = envelope.command.payload.note?.trim() ?? '';
      if (label.length === 0) {
        return [error(envelope.command.type, 'LABEL_REQUIRED', 'Attachment placeholders require a label.')];
      }

      if (
        !envelope.command.payload.channelId &&
        !envelope.command.payload.questionInstanceId &&
        !envelope.command.payload.cardInstanceId
      ) {
        return [
          error(
            envelope.command.type,
            'ATTACHMENT_CONTEXT_REQUIRED',
            'Attachment placeholders require a chat channel, question context, or card context.'
          )
        ];
      }

      if (envelope.command.payload.channelId) {
        const channel = getChatChannel(aggregate, envelope.command.payload.channelId);
        if (!channel) {
          return [error(envelope.command.type, 'CHANNEL_NOT_FOUND', 'The selected chat channel does not exist.')];
        }

        if (channel.visibilityScope !== envelope.command.payload.visibilityScope) {
          return [
            error(
              envelope.command.type,
              'ATTACHMENT_SCOPE_MISMATCH',
              'Attachment placeholder visibility must match the selected channel visibility.'
            )
          ];
        }

        if (
          !canActorUseChannel(
            aggregate,
            channel.channelId,
            envelope.actor.playerId,
            envelope.actor.role
          )
        ) {
          return [
            error(
              envelope.command.type,
              'FORBIDDEN',
              'The actor cannot upload an attachment placeholder into this channel.'
            )
          ];
        }
      }

      if (
        envelope.command.payload.questionInstanceId &&
        !aggregate.questionInstances[envelope.command.payload.questionInstanceId]
      ) {
        return [
          error(
            envelope.command.type,
            'QUESTION_NOT_FOUND',
            'Attachment placeholders cannot be linked to a missing question.'
          )
        ];
      }

      if (
        envelope.command.payload.cardInstanceId &&
        !aggregate.cardInstances[envelope.command.payload.cardInstanceId]
      ) {
        return [
          error(
            envelope.command.type,
            'CARD_NOT_FOUND',
            'Attachment placeholders cannot be linked to a missing card.'
          )
        ];
      }

      if (label.length === 0 && note.length === 0) {
        return [
          error(
            envelope.command.type,
            'ATTACHMENT_EMPTY',
            'Attachment placeholders must include a label or note.'
          )
        ];
      }

      return [];
    }
    case 'draw_card': {
      const deckId = envelope.command.payload.deckId;
      const deck = contentPack.decks.find((candidate) => candidate.deckId === deckId);
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
    case 'discard_card': {
      const cardInstance = getCardInstance(aggregate, envelope.command.payload.cardInstanceId);
      if (!cardInstance) {
        return [error(envelope.command.type, 'CARD_NOT_FOUND', 'The selected card instance does not exist.')];
      }

      if (cardInstance.zone !== 'hand') {
        return [error(envelope.command.type, 'CARD_NOT_IN_HAND', 'Only cards in hand can be discarded.')];
      }

      if (!isCardAccessibleToActor(aggregate, cardInstance, envelope.actor.playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'The actor cannot discard this card.')];
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
