import type {
  CardDefinition,
  CardInstanceModel,
  CommandEnvelope,
  CommandValidationError,
  ContentPack,
  DeckDefinition,
  MatchAggregate
} from '../../../shared-types/src/index.ts';
import { isPolygonBoundaryGeometry } from '../../../geo/src/index.ts';

import {
  buildCardResolutionPlan,
  buildQuestionSelectionState,
  canActorExecuteCommand,
  countPaidDiscardCost,
  countPaidDiscardKindCost,
  getAttachment,
  getChatChannel,
  getActiveQuestion,
  getCardInstance,
  getHandCardsForHolder,
  getPlayerRole,
  getPlayerTeam,
  getTimerByKind,
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

function getDeckDefinition(contentPack: ContentPack, deckId: string): DeckDefinition | undefined {
  return contentPack.decks.find((candidate) => candidate.deckId === deckId);
}

function isCardAccessibleToActor(
  aggregate: MatchAggregate,
  card: CardInstanceModel,
  playerId: string | undefined,
  actorRole: CommandEnvelope['actor']['role']
): boolean {
  if (actorRole === 'host' || actorRole === 'system') {
    return true;
  }

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

function canActorUseDeck(
  aggregate: MatchAggregate,
  deck: DeckDefinition,
  playerId: string | undefined,
  actorRole: CommandEnvelope['actor']['role']
): boolean {
  if (actorRole === 'host' || actorRole === 'system') {
    return true;
  }

  if (!playerId) {
    return false;
  }

  const role = getPlayerRole(aggregate, playerId) ?? actorRole;
  const team = getPlayerTeam(aggregate, playerId);

  switch (deck.ownerScope) {
    case 'hider_team':
      return role === 'hider' && team?.side === 'hider';
    case 'seeker_team':
      return role === 'seeker' && team?.side === 'seeker';
    case 'hider_player':
      return role === 'hider';
    case 'seeker_player':
      return role === 'seeker';
    case 'shared_public':
      return role !== 'spectator';
    case 'host_only':
      return role === 'host';
    default:
      return false;
  }
}

function resolveDeckHolder(
  aggregate: MatchAggregate,
  deck: DeckDefinition,
  playerId: string | undefined,
  actorRole: CommandEnvelope['actor']['role']
): { holderType: CardInstanceModel['holderType']; holderId: string } | undefined {
  const hiderTeamId = Object.values(aggregate.teams).find((team) => team.side === 'hider')?.teamId ?? 'team-hider';
  const seekerTeamId = Object.values(aggregate.teams).find((team) => team.side === 'seeker')?.teamId ?? 'team-seeker';
  const team = getPlayerTeam(aggregate, playerId);

  switch (deck.ownerScope) {
    case 'hider_team':
      return {
        holderType: 'team',
        holderId: hiderTeamId
      };
    case 'seeker_team':
      return {
        holderType: 'team',
        holderId: seekerTeamId
      };
    case 'shared_public':
      return team?.teamId
        ? {
            holderType: 'team',
            holderId: team.teamId
          }
        : playerId
          ? {
              holderType: 'player',
              holderId: playerId
            }
          : undefined;
    case 'hider_player':
    case 'seeker_player':
    case 'host_only':
      return playerId
        ? {
            holderType: 'player',
            holderId: playerId
          }
        : actorRole === 'host'
          ? {
              holderType: 'player',
              holderId: aggregate.createdByPlayerId
            }
          : undefined;
    default:
      return undefined;
  }
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

function getAllowedAnswerValues(schema: Record<string, unknown>): string[] {
  const candidateValues = schema.allowedValues ?? schema.values;
  return Array.isArray(candidateValues)
    ? candidateValues.filter((value): value is string => typeof value === 'string')
    : [];
}

function validateAnswerPayload(args: {
  commandType: CommandEnvelope['command']['type'];
  aggregate: MatchAggregate;
  templateAnswerSchema: Record<string, unknown>;
  categoryAnswerSchema: Record<string, unknown>;
  answer: Record<string, unknown>;
}): CommandValidationError[] {
  const schema =
    Object.keys(args.templateAnswerSchema).length > 0 ? args.templateAnswerSchema : args.categoryAnswerSchema;
  const kind = typeof schema.kind === 'string' ? schema.kind : 'manual';

  if (kind === 'boolean' || kind === 'enum') {
    const value = args.answer.value;
    const allowedValues = getAllowedAnswerValues(schema);

    if (typeof value !== 'string' || value.trim().length === 0) {
      return [
        error(
          args.commandType,
          'ANSWER_VALUE_REQUIRED',
          'This question answer must choose one of the allowed response values.'
        )
      ];
    }

    if (allowedValues.length > 0 && !allowedValues.includes(value)) {
      return [
        error(
          args.commandType,
          'ANSWER_VALUE_INVALID',
          `The answer "${value}" is not valid for this question.`
        )
      ];
    }

    return [];
  }

  if (kind === 'feature_choice') {
    const selectedFeatureId =
      typeof args.answer.selectedFeatureId === 'string' && args.answer.selectedFeatureId.trim().length > 0
        ? args.answer.selectedFeatureId.trim()
        : typeof args.answer.value === 'string' && args.answer.value.trim().length > 0
          ? args.answer.value.trim()
          : undefined;

    return selectedFeatureId
      ? []
      : [
          error(
            args.commandType,
            'FEATURE_SELECTION_REQUIRED',
            'This question answer must identify one of the candidate features.'
          )
        ];
  }

  if (kind === 'attachment') {
    const attachmentIds = Array.isArray(args.answer.attachmentIds)
      ? args.answer.attachmentIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const minAttachments =
      typeof schema.minAttachments === 'number' && Number.isFinite(schema.minAttachments)
        ? schema.minAttachments
        : 1;

    if (attachmentIds.length < minAttachments) {
      return [
        error(
          args.commandType,
          'ATTACHMENT_REQUIRED',
          `This question answer requires at least ${minAttachments} attachment${minAttachments === 1 ? '' : 's'}.`
        )
      ];
    }

    for (const attachmentId of attachmentIds) {
      if (!getAttachment(args.aggregate, attachmentId)) {
        return [
          error(
            args.commandType,
            'ATTACHMENT_NOT_FOUND',
            `The attachment "${attachmentId}" does not exist in this match.`
          )
        ];
      }
    }

    return [];
  }

  const value = args.answer.value;
  const note = args.answer.note;
  if (
    (typeof value !== 'string' || value.trim().length === 0) &&
    (typeof note !== 'string' || note.trim().length === 0)
  ) {
    return [
      error(
        args.commandType,
        'ANSWER_REQUIRED',
        'This question answer requires a recorded response value or note.'
      )
    ];
  }

  return [];
}

function validateDiscardResolution(
  aggregate: MatchAggregate,
  contentPack: ContentPack,
  envelope: CommandEnvelope<Extract<CommandEnvelope['command'], { type: 'resolve_card_window' }>>
): CommandValidationError[] {
  const activeResolution = aggregate.activeCardResolution;
  if (!activeResolution?.discardRequirement) {
    return [];
  }

  if (!activeResolution.openingHandCardInstanceIds) {
    return [
      error(
        envelope.command.type,
        'CARD_RESOLUTION_INVALID',
        'The active card resolution is missing its opening hand snapshot.'
      )
    ];
  }

  const requiredCount =
    activeResolution.discardRequirement.discardWholeHand
      ? Math.max(0, activeResolution.openingHandCardInstanceIds.length - 1)
      : activeResolution.discardRequirement.requiredCards ?? 0;

  if (activeResolution.discardRequirement.requiredKind) {
    const cardDefinitionsById = Object.fromEntries(
      contentPack.cards.map((card) => [card.cardDefinitionId, card])
    ) as Record<string, CardDefinition>;
    const paidCount = countPaidDiscardKindCost({
      resolution: activeResolution,
      cardInstances: aggregate.cardInstances,
      cardDefinitionsById,
      requiredKind: activeResolution.discardRequirement.requiredKind
    });

    if (paidCount < requiredCount) {
      return [
          error(
            envelope.command.type,
            'DISCARD_COST_UNPAID',
            'The card window cannot close until its discard cost is fully paid.'
          )
        ];
    }
  }
  else {
    const paidCount = countPaidDiscardCost({
      resolution: activeResolution,
      cardInstances: aggregate.cardInstances
    });

    if (paidCount < requiredCount) {
      return [
        error(
          envelope.command.type,
          'DISCARD_COST_UNPAID',
          'The card window cannot close until its discard cost is fully paid.'
        )
      ];
    }
  }

  if (
    activeResolution.drawCountOnResolve &&
    activeResolution.sourceDeckId
  ) {
    const remainingDrawCount = Object.values(aggregate.cardInstances).filter(
      (card) =>
        card.holderType === 'deck' &&
        card.holderId === activeResolution.sourceDeckId &&
        card.zone === 'draw_pile'
    ).length;

    if (remainingDrawCount < activeResolution.drawCountOnResolve) {
      return [
        error(
          envelope.command.type,
          'DRAW_PILE_EMPTY',
          'The source deck does not have enough cards left to finish this effect.'
        )
      ];
    }
  }

  return [];
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

      const category = getQuestionCategory(contentPack, template.categoryId);
      if (!category) {
        return [error(envelope.command.type, 'QUESTION_CATEGORY_NOT_FOUND', 'The selected question category does not exist.')];
      }

      const selectionState = buildQuestionSelectionState({
        contentPack,
        category,
        selectedScale: aggregate.selectedScale,
        askedQuestions: Object.values(aggregate.questionInstances).filter((question) => question.status !== 'canceled')
      });

      if (!selectionState.drawnTemplateIds.includes(template.templateId)) {
        return [
          error(
            envelope.command.type,
            'QUESTION_NOT_IN_DRAW',
            'This question is not part of the current workbook draw for its category.'
          )
        ];
      }

      if (!selectionState.availableTemplateIds.includes(template.templateId)) {
        return [
          error(
            envelope.command.type,
            'QUESTION_ALREADY_USED',
            'This question has already been used from the current workbook draw.'
          )
        ];
      }

      return [];
    }
    case 'answer_question': {
      const activeQuestion = getActiveQuestion(aggregate);
      if (!activeQuestion || activeQuestion.questionInstanceId !== envelope.command.payload.questionInstanceId) {
        return [error(envelope.command.type, 'QUESTION_NOT_ACTIVE', 'This question is not the active question.')];
      }

      const template = getQuestionTemplate(contentPack, activeQuestion.templateId);
      if (!template) {
        return [error(envelope.command.type, 'QUESTION_TEMPLATE_NOT_FOUND', 'The active question template could not be resolved.')];
      }

      const category = getQuestionCategory(contentPack, template.categoryId);
      if (!category) {
        return [error(envelope.command.type, 'QUESTION_CATEGORY_NOT_FOUND', 'The active question category could not be resolved.')];
      }

      return validateAnswerPayload({
        commandType: envelope.command.type,
        aggregate,
        templateAnswerSchema: template.answerSchema,
        categoryAnswerSchema: category.defaultAnswerSchema,
        answer: envelope.command.payload.answer
      });
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
      const deck = getDeckDefinition(contentPack, envelope.command.payload.deckId);
      if (!deck) {
        return [error(envelope.command.type, 'DECK_NOT_FOUND', 'The selected deck does not exist.')];
      }

      if (!canActorUseDeck(aggregate, deck, envelope.actor.playerId, envelope.actor.role)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'The actor cannot draw from this deck.')];
      }

      const holder = resolveDeckHolder(aggregate, deck, envelope.actor.playerId, envelope.actor.role);
      if (!holder) {
        return [error(envelope.command.type, 'DECK_HOLDER_UNAVAILABLE', 'The deck does not have a valid hand owner in this match.')];
      }

      const hasCardToDraw = Object.values(aggregate.cardInstances).some(
        (card) => card.holderType === 'deck' && card.holderId === deck.deckId && card.zone === 'draw_pile'
      );
      if (!hasCardToDraw) {
        return [error(envelope.command.type, 'DRAW_PILE_EMPTY', 'This deck has no remaining cards to draw.')];
      }

      if (deck.ownerScope === 'hider_team') {
        const handCount = getHandCardsForHolder(aggregate, holder.holderType, holder.holderId).length;
        if (handCount >= 6) {
          return [
            error(
              envelope.command.type,
              'HAND_SIZE_LIMIT',
              'The hider hand is already at the target size of 6 cards.'
            )
          ];
        }
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

      if (!isCardAccessibleToActor(aggregate, cardInstance, envelope.actor.playerId, envelope.actor.role)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'The actor cannot play this card.')];
      }

      const cardDefinition = getCardDefinition(contentPack, cardInstance.cardDefinitionId);
      if (!cardDefinition) {
        return [error(envelope.command.type, 'CARD_DEFINITION_NOT_FOUND', 'The card definition is missing from the content pack.')];
      }

      if (
        aggregate.lifecycleState === 'endgame' &&
        cardDefinition.kind === 'curse' &&
        /cannot be played during the endgame/i.test(cardDefinition.description)
      ) {
        return [error(envelope.command.type, 'CARD_NOT_PLAYABLE_IN_ENDGAME', 'This curse cannot be played during the endgame.')];
      }

      const resolutionPlan = buildCardResolutionPlan(cardDefinition, aggregate.selectedScale);
      if (resolutionPlan.kind === 'time_bonus' && !getTimerByKind(aggregate, 'hide')) {
        return [error(envelope.command.type, 'TIME_BONUS_NOT_AVAILABLE', 'Time bonus cards only work while the hide timer is still running.')];
      }

      const handCards = getHandCardsForHolder(aggregate, cardInstance.holderType, cardInstance.holderId);
      const otherHandCards = handCards.filter((card) => card.cardInstanceId !== cardInstance.cardInstanceId);
      if (resolutionPlan.discardRequirement.discardWholeHand && otherHandCards.length === 0) {
        return [error(envelope.command.type, 'DISCARD_COST_UNPAID', 'This card needs spare hand cards to pay its discard cost.')];
      }

      if (resolutionPlan.discardRequirement.requiredCards) {
        if (resolutionPlan.discardRequirement.requiredKind) {
          const matchingCards = otherHandCards.filter((card) => {
            const definition = getCardDefinition(contentPack, card.cardDefinitionId);
            return definition?.kind === resolutionPlan.discardRequirement.requiredKind;
          }).length;

          if (matchingCards < resolutionPlan.discardRequirement.requiredCards) {
            return [
              error(
                envelope.command.type,
                'DISCARD_COST_UNPAID',
                `This card requires ${resolutionPlan.discardRequirement.requiredCards} ${resolutionPlan.discardRequirement.requiredKind.replace(/_/g, ' ')} discard payment.`
              )
            ];
          }
        } else if (otherHandCards.length < resolutionPlan.discardRequirement.requiredCards) {
          return [
            error(
              envelope.command.type,
              'DISCARD_COST_UNPAID',
              `This card requires ${resolutionPlan.discardRequirement.requiredCards} additional discarded card${resolutionPlan.discardRequirement.requiredCards === 1 ? '' : 's'}.`
            )
          ];
        }
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

      if (!isCardAccessibleToActor(aggregate, cardInstance, envelope.actor.playerId, envelope.actor.role)) {
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

      return validateDiscardResolution(
        aggregate,
        contentPack,
        envelope as CommandEnvelope<Extract<CommandEnvelope['command'], { type: 'resolve_card_window' }>>
      );
    }
    case 'resume_match':
      return [];
    case 'archive_match':
      return [];
    default:
      return [];
  }
}
