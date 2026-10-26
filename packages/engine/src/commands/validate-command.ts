import type {
  CardDefinition,
  CardInstanceModel,
  CommandEnvelope,
  CreateMapRegionCommand,
  CommandValidationError,
  ContentPack,
  DeckDefinition,
  MatchAggregate,
  QuestionFeatureDatasetModel
} from '../../../shared-types/src/index.ts';
import { circleWithinGeometry, distanceMeters, isPolygonBoundaryGeometry, pointInGeometry } from '../../../geo/src/index.ts';
import { computeDistantCuisineDistances } from '../helpers/distant-cuisine-distance.ts';

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
  getRuleset,
  getMapPreset,
  getHidingZoneRadiusMeters
} from '../helpers/content-pack.ts';
import { validateStateForCommand } from '../state-machine/guards.ts';
import { resolveAutomaticQuestionAnswer } from '../questions/automatic-question-answer.ts';

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

function isOsmBoundaryId(value: string): boolean {
  return /^osm:(?:relation|way):\d+$/.test(value);
}

function freshDeviceLocation(aggregate: MatchAggregate, playerId: string | undefined, occurredAt: string) {
  if (!playerId) return undefined;
  const sample = [...aggregate.locationSamples].reverse().find((candidate) => candidate.playerId === playerId);
  const age = sample ? Date.parse(occurredAt) - Date.parse(sample.recordedAt) : Number.POSITIVE_INFINITY;
  return sample && sample.source === 'device' && typeof sample.accuracyMeters === 'number' && sample.accuracyMeters <= 50 && age >= 0 && age <= 30_000
    ? sample
    : undefined;
}

const QUESTION_OR_TRANSIT_BLOCKING_CARD_KINDS = new Set([
  'hangman_challenge',
  'labyrinth_challenge',
  'unguided_tourist_challenge',
  'bird_guide_challenge',
  'mediocre_travel_agent_challenge',
  'impressionable_consumer_challenge',
  'distant_cuisine_challenge',
  'bridge_troll_challenge',
  'seeker_off_transit_challenge',
  'u_turn_challenge',
  'ransom_note_challenge',
  'cairn_challenge',
  'water_weight_challenge',
  'endless_tumble_challenge',
  'lemon_phylactery_challenge',
  'egg_partner_challenge',
  'zoologist_challenge',
  'luxury_car_challenge'
]);

function hasActiveQuestionOrTransitBlockingCurse(aggregate: MatchAggregate): boolean {
  return Boolean(
    aggregate.bridgeTrollChallenge ||
    aggregate.seekerOffTransitRestriction ||
    aggregate.uTurnChallenge ||
    aggregate.ransomNoteChallenge ||
    (aggregate.cairnChallenge && !aggregate.cairnChallenge.completedAt) ||
    aggregate.waterWeightChallenge ||
    aggregate.endlessTumbleChallenge ||
    aggregate.lemonPhylacteryChallenge ||
    (aggregate.eggPartnerChallenge && !aggregate.eggPartnerChallenge.eggAcquiredAt) ||
    aggregate.zoologistChallenge ||
    aggregate.luxuryCarChallenge ||
    aggregate.unguidedTouristChallenge ||
    aggregate.birdGuideChallenge ||
    (aggregate.mediocreTravelAgentChallenge && !aggregate.mediocreTravelAgentChallenge.completedAt) ||
    (aggregate.impressionableConsumerChallenge && !aggregate.impressionableConsumerChallenge.completedAt) ||
    (aggregate.distantCuisineChallenge && !aggregate.distantCuisineChallenge.completedAt) ||
    (aggregate.activeCardResolution?.resolutionKind &&
      QUESTION_OR_TRANSIT_BLOCKING_CARD_KINDS.has(aggregate.activeCardResolution.resolutionKind))
  );
}

function isGeoJsonPosition(value: unknown, budget: { positions: number }): value is number[] {
  budget.positions += 1;
  return budget.positions <= 25_000 && Array.isArray(value) && value.length >= 2 &&
    Number.isFinite(value[0]) && Math.abs(value[0] as number) <= 180 &&
    Number.isFinite(value[1]) && Math.abs(value[1] as number) <= 90;
}

function isGeoJsonLine(value: unknown, budget: { positions: number }, minimum = 2): boolean {
  return Array.isArray(value) && value.length >= minimum && value.every((position) => isGeoJsonPosition(position, budget));
}

function isValidMapOverlayGeometry(value: unknown, depth = 0, budget = { positions: 0 }): boolean {
  if (!value || typeof value !== 'object' || depth > 8) return false;
  const geometry = value as { type?: unknown; coordinates?: unknown; geometries?: unknown };
  const coordinates = geometry.coordinates;
  switch (geometry.type) {
    case 'Point': return isGeoJsonPosition(coordinates, budget);
    case 'MultiPoint': return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every((point) => isGeoJsonPosition(point, budget));
    case 'LineString': return isGeoJsonLine(coordinates, budget);
    case 'MultiLineString': return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every((line) => isGeoJsonLine(line, budget));
    case 'Polygon':
      return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every((ring) =>
        isGeoJsonLine(ring, budget, 4) && Array.isArray(ring) &&
        (ring[0] as number[])[0] === (ring[ring.length - 1] as number[])[0] &&
        (ring[0] as number[])[1] === (ring[ring.length - 1] as number[])[1]
      );
    case 'MultiPolygon':
      return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every((polygon) =>
        Array.isArray(polygon) && polygon.length > 0 && polygon.every((ring) =>
          isGeoJsonLine(ring, budget, 4) && Array.isArray(ring) &&
          (ring[0] as number[])[0] === (ring[ring.length - 1] as number[])[0] &&
          (ring[0] as number[])[1] === (ring[ring.length - 1] as number[])[1]
        )
      );
    case 'GeometryCollection':
      return Array.isArray(geometry.geometries) && geometry.geometries.length > 0 &&
        geometry.geometries.every((child) => isValidMapOverlayGeometry(child, depth + 1, budget));
    default: return false;
  }
}

function hasValidMapSetupData(payload: {
  customOverlays?: Array<{ id: string; name: string; color: string; visible: boolean; geometry: unknown }>;
  stationSource?: string;
  customStations?: Array<{ id: string; name: string; latitude: number; longitude: number }>;
  bridgeAvailability?: string;
}): boolean {
  if (payload.stationSource !== undefined && !['osm', 'custom', 'both'].includes(payload.stationSource)) return false;
  if (payload.bridgeAvailability !== undefined && !['unknown', 'present', 'none'].includes(payload.bridgeAvailability)) return false;
  const geometryBudget = { positions: 0 };
  if (payload.customOverlays !== undefined && (
    !Array.isArray(payload.customOverlays) || payload.customOverlays.length > 100 ||
    !payload.customOverlays.every((overlay) => overlay &&
      typeof overlay.id === 'string' && overlay.id.length > 0 && overlay.id.length <= 100 &&
      typeof overlay.name === 'string' && overlay.name.trim().length > 0 && overlay.name.length <= 100 &&
      typeof overlay.color === 'string' && /^#[0-9a-f]{6}$/i.test(overlay.color) &&
      typeof overlay.visible === 'boolean' && isValidMapOverlayGeometry(overlay.geometry, 0, geometryBudget))
  )) return false;
  if (payload.customStations !== undefined && (
    !Array.isArray(payload.customStations) || payload.customStations.length > 2000 ||
    !payload.customStations.every((station) => station &&
      typeof station.id === 'string' && station.id.length > 0 && station.id.length <= 100 &&
      typeof station.name === 'string' && station.name.trim().length > 0 && station.name.length <= 100 &&
      Number.isFinite(station.latitude) && station.latitude >= -90 && station.latitude <= 90 &&
      Number.isFinite(station.longitude) && station.longitude >= -180 && station.longitude <= 180)
  )) return false;
  return true;
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
      ? Math.max(0, activeResolution.openingHandCardInstanceIds.length - 1 - Number(Boolean(activeResolution.copiedCardInstanceId)))
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
  contentPack: ContentPack,
  questionFeatureDataset?: QuestionFeatureDatasetModel
): CommandValidationError[] {
  if (envelope.command.type === 'create_match') {
    if (aggregate) {
      return [error(envelope.command.type, 'MATCH_ALREADY_EXISTS', 'Create match can only run before a match exists.')];
    }

    if (envelope.command.payload.contentPackId !== contentPack.packId) {
      return [error(envelope.command.type, 'CONTENT_PACK_MISMATCH', 'Create match content pack does not match the loaded pack.')];
    }

    if (envelope.command.payload.contentPackVersion && envelope.command.payload.contentPackVersion !== contentPack.packVersion) {
      return [error(envelope.command.type, 'CONTENT_PACK_VERSION_MISMATCH', 'Create match content pack version does not match the loaded pack.')];
    }

    return [];
  }

  if (!aggregate) {
    return [error(envelope.command.type, 'MATCH_NOT_FOUND', 'A match must exist before this command can run.')];
  }

  if (aggregate.contentPackId !== contentPack.packId) {
    return [error(envelope.command.type, 'CONTENT_PACK_MISMATCH', 'The aggregate content pack does not match the loaded pack.')];
  }

  if (aggregate.contentPackVersion !== contentPack.packVersion) {
    return [error(envelope.command.type, 'CONTENT_PACK_VERSION_MISMATCH', 'The aggregate content pack version does not match the loaded pack.')];
  }

  if (!canActorExecuteCommand(aggregate, envelope.actor, envelope.command)) {
    return [error(envelope.command.type, 'FORBIDDEN', 'The actor does not have permission to execute this command.')];
  }

  const stateErrors = validateStateForCommand(aggregate, envelope.command);
  if (stateErrors.length > 0) {
    return stateErrors;
  }

  if (envelope.command.type === 'begin_question_prompt' && aggregate.unguidedTouristChallenge) {
    return [error(envelope.command.type, 'QUESTION_BLOCKED_BY_CURSE', 'Seekers are not ready to ask questions until the active challenge is cleared.')];
  }

  if (envelope.command.type === 'begin_question_prompt' && aggregate.birdGuideChallenge) {
    return [error(envelope.command.type, 'QUESTION_BLOCKED_BY_CURSE', 'Seekers are not ready to ask questions until the active Bird Guide video is approved.')];
  }

  if (envelope.command.type === 'begin_question_prompt' && aggregate.mediocreTravelAgentChallenge && !aggregate.mediocreTravelAgentChallenge.completedAt) {
    return [error(envelope.command.type, 'QUESTION_BLOCKED_BY_CURSE', 'Seekers are not ready to ask questions until they finish the trip, wait, send three photos, and obtain the souvenir.')];
  }

  if (envelope.command.type === 'begin_question_prompt' && aggregate.impressionableConsumerChallenge && !aggregate.impressionableConsumerChallenge.completedAt) {
    return [error(envelope.command.type, 'QUESTION_BLOCKED_BY_CURSE', 'Seekers are not ready to ask questions until they complete the approved advertisement challenge.')];
  }

  if (envelope.command.type === 'begin_question_prompt' && aggregate.distantCuisineChallenge && !aggregate.distantCuisineChallenge.completedAt) {
    return [error(envelope.command.type, 'QUESTION_BLOCKED_BY_CURSE', 'Seekers are not ready to ask questions until every seeker has visited the approved distant-cuisine restaurant.')];
  }

  switch (envelope.command.type) {
    case 'remove_match_player': {
      const playerId = envelope.command.payload.playerId;
      if (!aggregate.players[playerId]) {
        return [error(envelope.command.type, 'PLAYER_NOT_FOUND', 'Cannot remove a player who is not in this match.')];
      }
      if (playerId === aggregate.createdByPlayerId) {
        return [error(envelope.command.type, 'HOST_CANNOT_BE_REMOVED', 'The match host cannot be removed from their own match.')];
      }
      return [];
    }
    case 'leave_match': {
      const playerId = envelope.actor.playerId;
      if (!playerId || !aggregate.players[playerId]) {
        return [error(envelope.command.type, 'MATCH_MEMBERSHIP_REQUIRED', 'A joined player identity is required to leave this match.')];
      }
      if (playerId === aggregate.createdByPlayerId) {
        return [error(envelope.command.type, 'HOST_CANNOT_LEAVE', 'The match host cannot leave before transferring or closing the room.')];
      }
      return [];
    }
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
      const mapPayload = (envelope.command as CreateMapRegionCommand).payload;
      if (mapPayload.mapPresetId && !contentPack.mapPresets.some((preset) => preset.mapPresetId === mapPayload.mapPresetId)) {
        return [error(envelope.command.type, 'MAP_PRESET_NOT_FOUND', 'The selected map preset is not present in this content pack.')];
      }
      const mapPreset = getMapPreset(contentPack, mapPayload.mapPresetId);
      if (!mapPreset) {
        return [error(envelope.command.type, 'MAP_PRESET_REQUIRED', 'Choose a map preset from this content pack before applying a playable area.')];
      }
      const allowedRegionKinds = mapPreset.geometry.allowedRegionKinds;
      const regionKind = mapPayload.regionKind ?? 'custom';
      if (Array.isArray(allowedRegionKinds) && !allowedRegionKinds.includes(regionKind)) {
        return [error(envelope.command.type, 'MAP_PRESET_REGION_KIND_NOT_ALLOWED', 'This map preset does not allow the selected playable region type.')];
      }
      if (!isPolygonBoundaryGeometry(envelope.command.payload.geometry)) {
        return [
          error(
            envelope.command.type,
            'INVALID_REGION_BOUNDARY',
            'The playable region must be defined by a polygon or multipolygon boundary.'
          )
        ];
      }
      if (!hasValidMapSetupData(envelope.command.payload)) {
        return [error(envelope.command.type, 'INVALID_MAP_SETUP_DATA', 'Custom map layers or station settings are invalid.')];
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
      const hasBridgeTroll = contentPack.cards.some((card) =>
        card.effects.some((effect) => effect.effectType === 'bridge_troll_challenge')
      );
      if (hasBridgeTroll && (aggregate.mapRegion.bridgeAvailability ?? 'unknown') === 'unknown') {
        return [error(envelope.command.type, 'BRIDGE_AVAILABILITY_REQUIRED', 'Confirm whether the map has bridges before starting the match.')];
      }
      return [];
    }
    case 'start_next_round': {
      const nextHider = aggregate.players[envelope.command.payload.nextHiderPlayerId];
      if (!nextHider || getPlayerRole(aggregate, nextHider.playerId) !== 'seeker') {
        return [error(envelope.command.type, 'NEXT_HIDER_MUST_BE_SEEKER', 'Choose a current seeker to hide in the next round.')];
      }
      const rotationOrder = aggregate.hiderRotationOrder ?? [
        ...Object.values(aggregate.roleAssignments)
          .filter((assignment) => assignment.role === 'hider')
          .map((assignment) => assignment.playerId),
        ...Object.values(aggregate.roleAssignments)
          .filter((assignment) => assignment.role === 'seeker')
          .map((assignment) => assignment.playerId)
          .sort((left, right) => left.localeCompare(right))
      ];
      const expectedHiderPlayerId = rotationOrder[aggregate.roundResults?.length ?? 0];
      if (!expectedHiderPlayerId) {
        return [error(envelope.command.type, 'ROTATION_COMPLETE', 'Every player in the hider rotation has completed their round.')];
      }
      if (envelope.command.payload.nextHiderPlayerId !== expectedHiderPlayerId) {
        return [error(envelope.command.type, 'ROTATION_ORDER', 'The hider order was randomized before play. Start the next round with the next player in that order.')];
      }
      const result = aggregate.roundResults?.at(-1);
      if (!result?.finalHidingSpot) {
        return [error(envelope.command.type, 'PREVIOUS_HIDING_SPOT_REQUIRED', 'The next round needs the previous hider’s found location as its starting point.')];
      }
      const foundAt = Date.parse(result.foundAt);
      const startAt = Date.parse(envelope.occurredAt);
      if (Number.isNaN(foundAt) || Number.isNaN(startAt) || startAt < foundAt || startAt - foundAt > 10 * 60 * 1000) {
        return [error(envelope.command.type, 'PREPARATION_WINDOW_EXPIRED', 'Start the next round within 10 minutes of finding the previous hider.')];
      }
      return [];
    }
    case 'lock_hider_location': {
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId);
      if (actorRole !== 'hider' && envelope.actor.role !== 'host') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the hider or host can lock the hider location.')];
      }
      if (!Number.isFinite(envelope.command.payload.latitude) || !Number.isFinite(envelope.command.payload.longitude)) {
        return [error(envelope.command.type, 'INVALID_LOCATION', 'Locking the hider location requires valid coordinates.')];
      }
      if (
        aggregate.activeCardResolution?.resolutionKind === 'move' &&
        actorRole !== 'hider' && envelope.actor.role !== 'host'
      ) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the hider can confirm arrival during a Move card.')];
      }
      const zone = aggregate.hiddenState.hidingZone;
      if (zone && distanceMeters(
        [envelope.command.payload.longitude, envelope.command.payload.latitude],
        [zone.longitude, zone.latitude]
      ) > 100) {
        return [error(envelope.command.type, 'NOT_AT_ZONE_STATION', 'The hider must confirm arrival at the selected hiding-zone station.')];
      }
      return [];
    }
    case 'set_hiding_zone': {
      const isMoveResolution = aggregate.activeCardResolution?.resolutionKind === 'move';
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId);
      if (isMoveResolution && actorRole !== 'hider' && envelope.actor.role !== 'host') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the hider can select a new zone during a Move card.')];
      }
      const { stationId, stationName, latitude, longitude } = envelope.command.payload;
      if (!stationId.trim() || !stationName.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return [error(envelope.command.type, 'INVALID_HIDING_ZONE', 'Choose a named transit station with valid coordinates.')];
      }
      const stationSource = aggregate.mapRegion?.stationSource ?? 'osm';
      const isCustomStation = stationId.startsWith('custom:');
      if (!isCustomStation && stationSource === 'custom') {
        return [error(envelope.command.type, 'STATION_SOURCE_MISMATCH', 'This map uses custom stations only. Choose one from the shared station list.')];
      }
      if (isCustomStation) {
        const customStation = stationSource !== 'osm'
          ? aggregate.mapRegion?.customStations?.find((candidate) => stationId === `custom:${candidate.id}`)
          : undefined;
        const sameName = customStation?.name.normalize('NFKC').trim().toLocaleLowerCase() ===
          stationName.normalize('NFKC').trim().toLocaleLowerCase();
        const samePoint = customStation && distanceMeters(
          [longitude, latitude], [customStation.longitude, customStation.latitude]
        ) <= 5;
        if (!customStation || !sameName || !samePoint) {
          return [error(envelope.command.type, 'UNVERIFIED_HIDING_STATION', 'Choose a custom transit station saved in the shared map settings.')];
        }
      } else if (stationSource !== 'custom' && aggregate.mode === 'online' && !questionFeatureDataset) {
        return [error(envelope.command.type, 'STATION_DATA_UNAVAILABLE', 'The authority could not verify this transit station. Try again when map data is available.')];
      }
      if (!isCustomStation && stationSource !== 'custom' && questionFeatureDataset) {
        const trustedStation = questionFeatureDataset.features.find((feature) =>
          feature.featureClassId === 'rail-station' && feature.featureId === `osm:${stationId}`
        );
        const sameName = trustedStation?.label.normalize('NFKC').trim().toLocaleLowerCase() ===
          stationName.normalize('NFKC').trim().toLocaleLowerCase();
        const samePoint = trustedStation && distanceMeters(
          [longitude, latitude], [trustedStation.longitude, trustedStation.latitude]
        ) <= 5;
        if (!trustedStation || !sameName || !samePoint) {
          return [error(envelope.command.type, 'UNVERIFIED_HIDING_STATION', 'Choose a transit station that matches the authority-verified map data.')];
        }
      }
      const geometry = aggregate.mapRegion?.boundaryGeometry;
      const radiusMeters = getHidingZoneRadiusMeters(contentPack, aggregate.selectedRulesetId, aggregate.selectedScale);
      if (radiusMeters <= 0) {
        return [error(envelope.command.type, 'INVALID_HIDING_RADIUS', 'The selected ruleset must define a positive hiding-zone radius.')];
      }
      if (!geometry || !circleWithinGeometry([longitude, latitude], radiusMeters, geometry)) {
        return [error(envelope.command.type, 'STATION_OUTSIDE_MAP', 'The selected station and its full hiding zone must fit inside the playable map.')];
      }
      const lockedLocation = aggregate.hiddenState.hiderLocation;
      if (!isMoveResolution && lockedLocation && distanceMeters(
        [longitude, latitude],
        [lockedLocation.longitude, lockedLocation.latitude]
      ) > 100) {
        return [error(envelope.command.type, 'ZONE_STATION_MISMATCH', 'The locked hider location must be at the selected zone station.')];
      }
      return [];
    }
    case 'end_hide_phase': {
      const ruleset = getRuleset(contentPack, aggregate.selectedRulesetId);
      if (ruleset?.locationPolicies?.requireStationCenteredZone === true && !aggregate.hiddenState.hidingZone) {
        return [error(envelope.command.type, 'HIDING_ZONE_REQUIRED', 'Select a valid station-centered hiding zone before ending the hide phase.')];
      }
      return [];
    }
    case 'set_final_hiding_spot': {
      const { latitude, longitude, publiclyAccessible, within3mOfMarkedPath } = envelope.command.payload;
      const zone = aggregate.hiddenState.hidingZone;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return [error(envelope.command.type, 'INVALID_LOCATION', 'Choose a valid point on the map for the final hiding spot.')];
      }
      if (!publiclyAccessible || !within3mOfMarkedPath) {
        return [error(envelope.command.type, 'FINAL_SPOT_RULES', 'The final spot must be confirmed publicly accessible and within 3 meters of a marked path.')];
      }
      if (!zone || distanceMeters([longitude, latitude], [zone.longitude, zone.latitude]) > zone.radiusMeters) {
        return [error(envelope.command.type, 'OUTSIDE_HIDING_ZONE', 'The final hiding spot must be inside the selected hiding zone.')];
      }
      return [];
    }
    case 'confirm_hider_found': {
      if (getPlayerRole(aggregate, envelope.actor.playerId) !== 'seeker' && envelope.actor.role !== 'host') {
        return [error(envelope.command.type, 'SEEKER_REQUIRED', 'Only a seeker or referee can confirm that the hider was found.')];
      }
      const { latitude, longitude, visuallyIdentified } = envelope.command.payload;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return [error(envelope.command.type, 'INVALID_LOCATION', 'Finding the hider requires valid seeker coordinates.')];
      }
      if (!visuallyIdentified) {
        return [error(envelope.command.type, 'VISUAL_IDENTIFICATION_REQUIRED', 'Visual identification is required before the seekers can confirm the hider was found.')];
      }
      const finalSpot = aggregate.hiddenState.endgame?.finalHidingSpot;
      if (!finalSpot) {
        return [error(envelope.command.type, 'FINAL_SPOT_REQUIRED', 'The hider final spot is not available for this endgame.')];
      }
      const ruleset = getRuleset(contentPack, aggregate.selectedRulesetId);
      const foundDistanceMeters = Number(ruleset?.locationPolicies?.foundDistanceMeters ?? 2);
      if (distanceMeters([longitude, latitude], [finalSpot.longitude, finalSpot.latitude]) > foundDistanceMeters) {
        return [error(envelope.command.type, 'SEEKER_TOO_FAR', `The seekers must be within ${foundDistanceMeters} meters of the hider.`)];
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
      if (envelope.command.payload.altitudeMeters !== undefined && !Number.isFinite(envelope.command.payload.altitudeMeters)) {
        return [error(envelope.command.type, 'INVALID_ALTITUDE', 'Altitude must be a finite number when supplied.')];
      }
      if (envelope.command.payload.altitudeAccuracyMeters !== undefined &&
        (!Number.isFinite(envelope.command.payload.altitudeAccuracyMeters) || envelope.command.payload.altitudeAccuracyMeters < 0)) {
        return [error(envelope.command.type, 'INVALID_ALTITUDE_ACCURACY', 'Altitude accuracy must be a finite, nonnegative number when supplied.')];
      }
      if (envelope.command.payload.altitudeReference !== undefined &&
        !['wgs84_ellipsoid', 'mean_sea_level'].includes(envelope.command.payload.altitudeReference)) {
        return [error(envelope.command.type, 'INVALID_ALTITUDE_REFERENCE', 'Altitude reference must identify a supported vertical datum.')];
      }

      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId);
      if (envelope.command.payload.onTransit === true && actorRole === 'seeker' && aggregate.unguidedTouristChallenge) {
        return [error(envelope.command.type, 'UNGUIDED_TOURIST_NO_TRANSIT', 'Seekers cannot use transportation until the hider approves a found-location photo.')];
      }
      const isMoveResolution = aggregate.activeCardResolution?.resolutionKind === 'move';
      if (isMoveResolution && actorRole !== 'hider' && envelope.actor.role !== 'host') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the hider can move during a Move card.')];
      }
      const ruleset = getRuleset(contentPack, aggregate.selectedRulesetId);
      if (actorRole === 'seeker' && aggregate.lifecycleState === 'seek_phase' &&
        ruleset?.locationPolicies?.endgameRequiresOffTransit === true &&
        envelope.command.payload.onTransit === false && aggregate.hiddenState.hidingZone &&
        distanceMeters(
          [envelope.command.payload.longitude, envelope.command.payload.latitude],
          [aggregate.hiddenState.hidingZone.longitude, aggregate.hiddenState.hidingZone.latitude]
        ) <= aggregate.hiddenState.hidingZone.radiusMeters && !aggregate.hiddenState.finalHidingSpot) {
        return [error(envelope.command.type, 'FINAL_SPOT_REQUIRED', 'The hider must choose a rule-compliant final spot before a seeker enters the zone off transit.')];
      }
      if (actorRole === 'hider' && aggregate.lifecycleState === 'endgame') {
        return [error(envelope.command.type, 'HIDER_LOCATION_FROZEN', 'The hider must stay at the final hiding spot during endgame.')];
      }
      if (!isMoveResolution && actorRole === 'hider' && aggregate.lifecycleState === 'seek_phase' &&
        ruleset?.locationPolicies?.requireStationCenteredZone === true) {
        const zone = aggregate.hiddenState.hidingZone;
        if (!zone) {
          return [error(envelope.command.type, 'HIDING_ZONE_REQUIRED', 'The hider must select a station-centered hiding zone before moving during seek phase.')];
        }
        if (distanceMeters(
          [envelope.command.payload.longitude, envelope.command.payload.latitude],
          [zone.longitude, zone.latitude]
        ) > zone.radiusMeters) {
          return [error(envelope.command.type, 'OUTSIDE_HIDING_ZONE', 'The hider cannot move outside the selected hiding zone.')];
        }
      }

      return [];
    }
    case 'ask_question': {
      if (hasActiveQuestion(aggregate)) {
        return [error(envelope.command.type, 'QUESTION_FLOW_LOCKED', 'A question is already active.')];
      }
      if (aggregate.pendingQuestionReward || Object.values(aggregate.questionInstances).some(
        (question) => question.status === 'resolved' && !question.lateResponseStartedAt && question.cardRewardStatus !== 'complete'
      )) {
        return [error(envelope.command.type, 'QUESTION_REWARD_REQUIRED', 'Finish the hider’s card draw and pick reward before asking another question.')];
      }

      const template = getQuestionTemplate(contentPack, envelope.command.payload.templateId);
      if (!template) {
        return [error(envelope.command.type, 'QUESTION_TEMPLATE_NOT_FOUND', 'The selected question template does not exist.')];
      }
      if ((aggregate.disabledQuestionTemplateIds ?? []).includes(template.templateId)) {
        return [error(envelope.command.type, 'QUESTION_TEMPLATE_DISABLED', 'This question is locked for the rest of the hider run.')];
      }
      if (aggregate.disabledQuestionCategoryId === template.categoryId) {
        return [error(envelope.command.type, 'QUESTION_CATEGORY_DISABLED', 'This question category is disabled for the current roll.')];
      }

      if (aggregate.bridgeTrollChallenge) {
        const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
        const missingAttestation = (seekerTeam?.memberPlayerIds ?? []).some((playerId) => {
          const attestedAt = aggregate.bridgeTrollChallenge!.attestedAtByPlayerId[playerId];
          return !attestedAt;
        });
        if (!seekerTeam?.memberPlayerIds.length || missingAttestation) {
          return [error(envelope.command.type, 'BRIDGE_TROLL_ATTESTATIONS_REQUIRED', 'Every seeker must confirm they are under a bridge before the next question.')];
        }
      }

      if (aggregate.zoologistChallenge) {
        const missingSeekerIds = aggregate.zoologistChallenge.requiredSeekerPlayerIds.filter(
          (playerId) => !aggregate.zoologistChallenge!.attachmentIdBySeekerPlayerId[playerId]
        );
        if (missingSeekerIds.length > 0) {
          return [error(envelope.command.type, 'ZOOLOGIST_EVIDENCE_REQUIRED', 'Every seeker must submit a photo of a wild animal in the hider’s chosen category before the next question.')];
        }
      }
      if (aggregate.luxuryCarChallenge) {
        return [error(envelope.command.type, 'LUXURY_CAR_EVIDENCE_REQUIRED', 'The hider must accept a seeker photo and higher production-year MSRP before the next question.')];
      }
      if (aggregate.seekerOffTransitRestriction) {
        const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
        const statuses = seekerTeam?.memberPlayerIds.map((playerId) =>
          aggregate.seekerOffTransitRestriction!.statusByPlayerId[playerId]
        ) ?? [];
        if (!seekerTeam?.memberPlayerIds.length || statuses.some((status) => !status)) {
          return [error(envelope.command.type, 'URBAN_EXPLORER_ATTESTATIONS_REQUIRED', 'Each seeker must confirm they are off transit and outside a train station.')];
        }
        if (statuses.some((status) => status?.onTransitOrAtStation)) {
          return [error(envelope.command.type, 'URBAN_EXPLORER_TRANSIT_RESTRICTED', 'Seekers cannot ask while anyone is on transit or at a train station.')];
        }
      }
      if (aggregate.uTurnChallenge) {
        const missingPlayer = aggregate.uTurnChallenge.requiredSeekerPlayerIds.some((playerId) =>
          !aggregate.uTurnChallenge!.disembarkedAtByPlayerId[playerId]
        );
        if (missingPlayer) {
          return [error(envelope.command.type, 'U_TURN_DISEMBARKATION_REQUIRED', `Each seeker must confirm disembarking at ${aggregate.uTurnChallenge.nextStationName}.`)];
        }
      }
      if (aggregate.ransomNoteChallenge) {
        const acceptedText = aggregate.ransomNoteChallenge.acceptedNoteText;
        const submittedText = envelope.command.payload.ransomNoteText?.trim();
        if (!acceptedText) {
          return [error(envelope.command.type, 'RANSOM_NOTE_APPROVAL_REQUIRED', 'The hider must approve the cut-out question before the seekers ask it.')];
        }
        if (submittedText !== acceptedText) {
          return [error(envelope.command.type, 'RANSOM_NOTE_TEXT_MISMATCH', 'The approved ransom note wording must match the question being asked.')];
        }
      }
      if (aggregate.cairnChallenge && !aggregate.cairnChallenge.completedAt) {
        return [error(envelope.command.type, 'CAIRN_TEAM_TOWER_REQUIRED', `Seekers must build a tower with ${aggregate.cairnChallenge.targetHeight} rocks that each stand for five seconds before asking another question.`)];
      }
      if (aggregate.waterWeightChallenge && !aggregate.waterWeightChallenge.liquidAcquiredAt) {
        return [error(envelope.command.type, 'WATER_WEIGHT_LIQUID_REQUIRED', 'Seekers must confirm they acquired the required new liquid before asking another question.')];
      }
      if (aggregate.endlessTumbleChallenge && !aggregate.endlessTumbleChallenge.successfulRollAt) {
        return [error(
          envelope.command.type,
          'ENDLESS_TUMBLE_ROLL_REQUIRED',
          `Seekers must report a clean, unaided roll of ${aggregate.endlessTumbleChallenge.successfulDieResults.join(' or ')} over at least ${aggregate.endlessTumbleChallenge.minimumDistanceMeters} m before asking another question.`
        )];
      }

      if (aggregate.lemonPhylacteryChallenge) {
        const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
        const statuses = seekerTeam?.memberPlayerIds.map((playerId) =>
          aggregate.lemonPhylacteryChallenge!.statusByPlayerId[playerId]?.touching
        ) ?? [];
        if (!seekerTeam?.memberPlayerIds.length || statuses.some((touching) => !touching)) {
          return [error(envelope.command.type, 'LEMON_PHYLACTERY_CONTACT_REQUIRED', 'Each seeker must attach a lemon to their outermost clothing or skin before another question.')];
        }
      }
      if (aggregate.eggPartnerChallenge && !aggregate.eggPartnerChallenge.eggAcquiredAt) {
        return [error(envelope.command.type, 'EGG_PARTNER_ACQUISITION_REQUIRED', 'Seekers must acquire a real egg before asking another question.')];
      }

      const category = getQuestionCategory(contentPack, template.categoryId);
      if (!category) {
        return [error(envelope.command.type, 'QUESTION_CATEGORY_NOT_FOUND', 'The selected question category does not exist.')];
      }

      const requiresMovingTransitConfirmation = (template.featureClassRefs ?? [])
        .some((feature) => feature.featureClassId === 'transit-line');
      if (requiresMovingTransitConfirmation && envelope.command.payload.confirmedMovingTransit !== true) {
        return [error(envelope.command.type, 'TRANSIT_RULE_CONFIRMATION_REQUIRED', 'Confirm the seekers are riding moving transit before asking Transit Line.')];
      }
      if (!requiresMovingTransitConfirmation && envelope.command.payload.confirmedMovingTransit !== undefined) {
        return [error(envelope.command.type, 'TRANSIT_RULE_CONFIRMATION_NOT_APPLICABLE', 'Moving-transit confirmation only applies to the Transit Line question.')];
      }

      const chosenDistanceMeters = envelope.command.payload.chosenDistanceMeters;
      const needsChosenDistance = template.parameters?.distanceMode === 'player_choice';
      if (needsChosenDistance && (typeof chosenDistanceMeters !== 'number' || !Number.isFinite(chosenDistanceMeters) || chosenDistanceMeters <= 0)) {
        return [error(envelope.command.type, 'CHOSEN_DISTANCE_REQUIRED', 'Choose a distance greater than zero meters for this Radar question.')];
      }
      if (!needsChosenDistance && chosenDistanceMeters !== undefined) {
        return [error(envelope.command.type, 'CHOSEN_DISTANCE_NOT_ALLOWED', 'This question uses its printed distance and cannot accept a custom radius.')];
      }

      if (envelope.command.payload.targetTeamId && aggregate.teams[envelope.command.payload.targetTeamId]?.side !== 'hider') {
        return [error(envelope.command.type, 'INVALID_QUESTION_TARGET', 'Investigation Book questions must target the active hider team.')];
      }

      const selectionState = buildQuestionSelectionState({
        contentPack,
        category,
        selectedScale: aggregate.selectedScale,
        askedQuestions: Object.values(aggregate.questionInstances).filter((question) => question.status !== 'canceled')
      });

      if (!selectionState.availableTemplateIds.includes(template.templateId)) {
        return [
          error(
            envelope.command.type,
            'QUESTION_NOT_AVAILABLE_AT_SCALE',
            'This question is not available in the selected game scale.'
          )
        ];
      }

      const automaticAnswer = resolveAutomaticQuestionAnswer({
        aggregate,
        contentPack,
        category,
        template,
        askedByPlayerId: envelope.actor.playerId ?? envelope.actor.actorId,
        targetTeamId: envelope.command.payload.targetTeamId,
        chosenDistanceMeters,
        occurredAt: envelope.occurredAt,
        questionFeatureDataset
      });
      if (automaticAnswer.kind === 'blocked') {
        return [error(envelope.command.type, automaticAnswer.code, automaticAnswer.message)];
      }

      return [];
    }
    case 'expire_question_response': {
      if (envelope.actor.role !== 'system') {
        return [error(envelope.command.type, 'SYSTEM_ONLY', 'Question response timeouts are applied by the match authority.')];
      }
      const question = aggregate.questionInstances[envelope.command.payload.questionInstanceId];
      const timer = Object.values(aggregate.timers).find(
        (candidate) => candidate.kind === 'question' && candidate.ownerRef === question?.questionInstanceId
      );
      if (!question || question.questionInstanceId !== aggregate.activeQuestionInstanceId || question.status !== 'awaiting_answer') {
        return [error(envelope.command.type, 'QUESTION_NOT_ACTIVE', 'Only the active unanswered question can time out.')];
      }
      if (question.lateResponseStartedAt || !timer || timer.status !== 'running' ||
        Date.parse(envelope.occurredAt) < Date.parse(timer.startedAt) + timer.durationSeconds * 1000) {
        return [error(envelope.command.type, 'QUESTION_RESPONSE_NOT_EXPIRED', 'The response timer has not expired.')];
      }
      return [];
    }
    case 'deal_question_reward': {
      if (aggregate.pendingQuestionReward) {
        return [error(envelope.command.type, 'QUESTION_REWARD_PENDING', 'The current question reward must be picked first.')];
      }
      const question = aggregate.questionInstances[envelope.command.payload.questionInstanceId];
      if (!question || question.status !== 'resolved') {
        return [error(envelope.command.type, 'QUESTION_NOT_RESOLVED', 'Only a resolved Investigation Book question can pay its card reward.')];
      }
      if (question.lateResponseStartedAt) {
        return [error(envelope.command.type, 'LATE_ANSWER_NO_REWARD', 'Late answers do not earn a hider card reward under the base rules.')];
      }
      if (question.cardRewardStatus) {
        return [error(envelope.command.type, 'QUESTION_REWARD_ALREADY_DEALT', 'This question already has a card reward in progress or completed.')];
      }
      const template = getQuestionTemplate(contentPack, question.templateId);
      const category = template ? getQuestionCategory(contentPack, template.categoryId) : undefined;
      if (!template || !category || category.drawRule.drawCount < 1 || category.drawRule.pickCount < 1) {
        return [error(envelope.command.type, 'QUESTION_REWARD_UNAVAILABLE', 'The question category does not define a valid draw-and-pick reward.')];
      }
      const multiplier = Object.values(aggregate.questionInstances).filter(
        (candidate) => candidate.templateId === question.templateId && (candidate.status === 'resolved' || candidate.status === 'vetoed')
      ).length;
      const deck = contentPack.decks.find((candidate) => candidate.ownerScope === 'hider_team');
      if (!deck) {
        return [error(envelope.command.type, 'DECK_NOT_FOUND', 'The hider reward deck is missing from this content pack.')];
      }
      const requestedBonusDraw = envelope.command.payload.useQuestionRewardDrawBonus === true;
      const availableBonus = aggregate.questionRewardDrawBonus;
      if (requestedBonusDraw && (!availableBonus || availableBonus.opportunitiesRemaining < 1 || availableBonus.extraDrawCount < 1)) {
        return [error(envelope.command.type, 'QUESTION_REWARD_DRAW_BONUS_UNAVAILABLE', 'There is no extra question reward draw available.')];
      }
      const requiredCards = category.drawRule.drawCount * multiplier + (requestedBonusDraw ? availableBonus!.extraDrawCount : 0);
      const availableCards = Object.values(aggregate.cardInstances).filter(
        (card) => card.holderType === 'deck' && card.holderId === deck.deckId && card.zone === 'draw_pile'
      ).length;
      if (availableCards < requiredCards) {
        return [error(envelope.command.type, 'DRAW_PILE_EMPTY', 'The hider deck does not contain enough cards for this full reward.')];
      }
      return [];
    }
    case 'choose_question_reward': {
      const pending = aggregate.pendingQuestionReward;
      if (!pending || pending.questionInstanceId !== envelope.command.payload.questionInstanceId) {
        return [error(envelope.command.type, 'QUESTION_REWARD_NOT_PENDING', 'There is no matching question reward to pick.')];
      }
      const choices = envelope.command.payload.selectedCardInstanceIdsBySet;
      if (choices.length !== pending.sets.length || choices.some((set, index) =>
        !Array.isArray(set) || set.length !== pending.sets[index]?.pickCount || new Set(set).size !== set.length ||
        set.some((cardId) => !pending.sets[index]?.cardInstanceIds.includes(cardId))
      )) {
        return [error(envelope.command.type, 'INVALID_REWARD_SELECTION', 'Choose the printed number of cards from each separate draw set.')];
      }
      const selectedCount = choices.reduce((total, set) => total + set.length, 0);
      const currentHandCount = Object.values(aggregate.cardInstances).filter(
        (card) => card.holderType === pending.holderType && card.holderId === pending.holderId && card.zone === 'hand'
      ).length;
      if (currentHandCount + selectedCount > 6 + (aggregate.hiderHandLimitBonus ?? 0)) {
        return [error(envelope.command.type, 'HAND_SIZE_LIMIT', 'Make room in the hider hand before keeping these reward cards.')];
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

      if (envelope.command.payload.answer.cannotAnswerDueToEndgame === true) {
        if (aggregate.lifecycleState !== 'endgame' || category.resolverKind !== 'photo_challenge') {
          return [error(envelope.command.type, 'ENDGAME_UNANSWERABLE_NOT_ALLOWED', 'This unable-to-answer option is only valid for a photo challenge during endgame.')];
        }
        return [];
      }

      if (envelope.command.payload.answer.cannotAnswerBecauseSubjectAbsent === true) {
        if (category.resolverKind !== 'photo_challenge' || envelope.command.payload.answer.value !== null) {
          return [error(envelope.command.type, 'PHOTO_SUBJECT_ABSENT_NOT_ALLOWED', 'This unable-to-answer option is only valid for a photo challenge when its subject is absent from the hiding zone.')];
        }
        return [];
      }

      if (activeQuestion.randomizedNullAnswerAllowed && envelope.command.payload.answer.value === null) {
        return [];
      }

      if (category.resolverKind === 'photo_challenge') {
        const attachmentIds = Array.isArray(envelope.command.payload.answer.attachmentIds)
          ? envelope.command.payload.answer.attachmentIds
          : [];
        const validPhotoEvidence = attachmentIds.length > 0 && attachmentIds.every((attachmentId) => {
          const attachment = aggregate.attachments[attachmentId];
          return attachment?.kind === 'photo_evidence' &&
            attachment.linkedQuestionInstanceId === activeQuestion.questionInstanceId &&
            attachment.visibilityScope === 'public_match';
        });
        if (!validPhotoEvidence) {
          return [error(
            envelope.command.type,
            'QUESTION_EVIDENCE_INVALID',
            'Photo questions require photo evidence: attach a public photo for this question.'
          )];
        }
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

      if (envelope.command.payload.kind === 'video_evidence' && envelope.command.payload.cardInstanceId) {
        const resolution = aggregate.activeCardResolution;
        const challenge = aggregate.birdGuideChallenge;
        const cardInstanceId = envelope.command.payload.cardInstanceId;
        const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
        const durationMs = Number(envelope.command.payload.captureMetadata?.durationMs ?? 0);
        if (resolution?.sourceCardInstanceId === cardInstanceId && resolution.resolutionKind === 'bird_guide_challenge') {
          const activeHider = Object.values(aggregate.roleAssignments).find((assignment) => assignment.role === 'hider')?.playerId;
          const priorHiderVideo = Object.values(aggregate.attachments).some((attachment) =>
            attachment.linkedCardInstanceId === cardInstanceId && attachment.kind === 'video_evidence' && attachment.ownerPlayerId === envelope.actor.playerId
          );
          if ((actorRole !== 'host' && (actorRole !== 'hider' || envelope.actor.playerId !== activeHider)) || priorHiderVideo) {
            return [error(envelope.command.type, 'BIRD_GUIDE_ONE_HIDER_RECORDING', 'The hider can record only one Bird Guide video.')];
          }
          if (envelope.command.payload.visibilityScope !== 'public_match' || envelope.command.payload.captureMetadata?.pickerSource !== 'camera' ||
            !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > (resolution.birdGuideMaximumDurationMinutes ?? 5) * 60_000) {
            return [error(envelope.command.type, 'BIRD_GUIDE_HIDER_VIDEO_INVALID', 'Record one public camera video within the scale’s Bird Guide time limit.')];
          }
        } else if (challenge?.sourceCardInstanceId === cardInstanceId) {
          const seekerIds = Object.values(aggregate.teams).find((team) => team.side === 'seeker')?.memberPlayerIds ?? [];
          if (challenge.candidate) {
            return [error(envelope.command.type, 'BIRD_GUIDE_REVIEW_PENDING', 'Wait for the hider to review the current video before recording another attempt.')];
          }
          if (!envelope.actor.playerId || !seekerIds.includes(envelope.actor.playerId) || actorRole !== 'seeker') {
            return [error(envelope.command.type, 'FORBIDDEN', 'Only a seeker may record a Bird Guide attempt.')];
          }
          if (envelope.command.payload.visibilityScope !== 'public_match' || envelope.command.payload.captureMetadata?.pickerSource !== 'camera' ||
            !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > challenge.maximumDurationMs) {
            return [error(envelope.command.type, 'BIRD_GUIDE_SEEKER_VIDEO_INVALID', 'Record a public camera video within the Bird Guide time limit.')];
          }
        }
      }

      if (envelope.command.payload.kind === 'photo_evidence' && envelope.command.payload.cardInstanceId &&
        aggregate.mediocreTravelAgentChallenge?.sourceCardInstanceId === envelope.command.payload.cardInstanceId) {
        const challenge = aggregate.mediocreTravelAgentChallenge;
        const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
        const seekerIds = Object.values(aggregate.teams).find((team) => team.side === 'seeker')?.memberPlayerIds ?? [];
        const occurredAt = Date.parse(envelope.occurredAt);
        if (challenge.completedAt || (actorRole !== 'host' && (actorRole !== 'seeker' || !envelope.actor.playerId || !seekerIds.includes(envelope.actor.playerId)))) {
          return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_PHOTO_FORBIDDEN', 'Only the seeker team may add its trip photos while the challenge is active.')];
        }
        if (envelope.command.payload.visibilityScope !== 'public_match' || envelope.command.payload.captureMetadata?.pickerSource !== 'camera' ||
          occurredAt <= Date.parse(challenge.startedAt)) {
          return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_PHOTO_REQUIRED', 'Add new public camera photos taken during the trip so the hider can see them.')];
        }
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
        if (aggregate.pendingQuestionReward || Object.values(aggregate.questionInstances).some(
          (question) => question.status === 'resolved' && question.cardRewardStatus !== 'complete'
        )) {
          return [error(envelope.command.type, 'QUESTION_REWARD_REQUIRED', 'Use the question’s printed draw-and-pick reward before drawing additional hider cards.')];
        }
        const handCount = getHandCardsForHolder(aggregate, holder.holderType, holder.holderId).length;
        if (handCount >= 6 + (aggregate.hiderHandLimitBonus ?? 0)) {
          return [
            error(
              envelope.command.type,
              'HAND_SIZE_LIMIT',
              `The hider hand is already at its target size of ${6 + (aggregate.hiderHandLimitBonus ?? 0)} cards.`
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

      const duplicateEffect = cardDefinition.effects.some((effect) => effect.effectType === 'duplicate_card');
      const duplicateTargetId = envelope.command.payload.duplicateTargetCardInstanceId;
      let effectCardDefinition = cardDefinition;
      if (duplicateEffect) {
        if (!duplicateTargetId) {
          return [error(envelope.command.type, 'DUPLICATE_TARGET_REQUIRED', 'Choose a card in your hand to copy.')];
        }
        const targetCard = aggregate.cardInstances[duplicateTargetId];
        if (
          !targetCard || targetCard.zone !== 'hand' ||
          targetCard.holderType !== cardInstance.holderType || targetCard.holderId !== cardInstance.holderId ||
          targetCard.cardInstanceId === cardInstance.cardInstanceId
        ) {
          return [error(envelope.command.type, 'DUPLICATE_TARGET_NOT_IN_HAND', 'Duplicate can only copy another card in the same hand.')];
        }
        const targetDefinition = getCardDefinition(contentPack, targetCard.cardDefinitionId);
        if (!targetDefinition || targetDefinition.kind === 'time_bonus' || targetDefinition.effects.some((effect) => effect.effectType === 'duplicate_card')) {
          return [error(envelope.command.type, 'DUPLICATE_TARGET_NOT_PLAYABLE', 'Choose another playable card to copy. Time bonuses stay in hand, and Duplicate cannot copy itself.')];
        }
        effectCardDefinition = targetDefinition;
      } else if (duplicateTargetId) {
        return [error(envelope.command.type, 'DUPLICATE_TARGET_NOT_ALLOWED', 'Only a Duplicate card can name a card to copy.')];
      }

      const allowedPhases = effectCardDefinition.timingWindow?.allowedPhases;
      if (allowedPhases && !allowedPhases.includes(aggregate.lifecycleState)) {
        return [error(
          envelope.command.type,
          'CARD_NOT_ALLOWED_IN_PHASE',
          `${effectCardDefinition.name} cannot be played during the ${aggregate.lifecycleState.replaceAll('_', ' ')}.`
        )];
      }

      if (cardDefinition.kind === 'time_bonus') {
        return [error(envelope.command.type, 'TIME_BONUS_NOT_PLAYABLE', 'Time bonus cards cannot be played. Keep them in hand to add their value to your final hiding time when found, or discard them.')];
      }

      if (
        aggregate.lifecycleState === 'endgame' &&
        cardDefinition.kind === 'curse' &&
        (/cannot be played during the endgame/i.test(cardDefinition.description) ||
          effectCardDefinition.effects.some((effect) => effect.effectType === 'lemon_phylactery_challenge'))
      ) {
        return [error(envelope.command.type, 'CARD_NOT_PLAYABLE_IN_ENDGAME', 'This curse cannot be played during the endgame.')];
      }

      const resolutionPlan = buildCardResolutionPlan(effectCardDefinition, aggregate.selectedScale);
      if (
        QUESTION_OR_TRANSIT_BLOCKING_CARD_KINDS.has(resolutionPlan.kind) &&
        hasActiveQuestionOrTransitBlockingCurse(aggregate)
      ) {
        return [error(
          envelope.command.type,
          'QUESTION_BLOCKING_CURSE_ALREADY_ACTIVE',
          'Wait until the active question- or transit-blocking curse is cleared before playing another one.'
        )];
      }
      if (resolutionPlan.kind === 'move' && !aggregate.hiddenState.hidingZone) {
        return [error(envelope.command.type, 'MOVE_ORIGIN_REQUIRED', 'Move requires an original hiding station to reveal to seekers.')];
      }
      if (
        resolutionPlan.kind === 'move' &&
        aggregate.lifecycleState === 'seek_phase' &&
        (aggregate.activeQuestionInstanceId || aggregate.seekPhaseSubstate !== 'ready')
      ) {
        return [error(envelope.command.type, 'MOVE_TIMING_INVALID', 'Move can only begin between questions when seekers are ready.')];
      }
      if (resolutionPlan.kind === 'veto_question' || resolutionPlan.kind === 'randomize_question') {
        if (!aggregate.activeQuestionInstanceId || !aggregate.questionInstances[aggregate.activeQuestionInstanceId]) {
          return [error(envelope.command.type, 'QUESTION_NOT_ACTIVE', 'This card can only be played while a question is awaiting an answer.')];
        }
        if (aggregate.questionInstances[aggregate.activeQuestionInstanceId]!.lateResponseStartedAt) {
          return [error(envelope.command.type, 'RESPONSE_WINDOW_EXPIRED', 'Veto and Randomize must be played before the response timer expires.')];
        }
        if (aggregate.seekPhaseSubstate !== 'awaiting_question_answer') {
          return [error(envelope.command.type, 'QUESTION_NOT_ANSWERABLE', 'This card can only be played during the question response window.')];
        }
        if (resolutionPlan.kind === 'randomize_question') {
          const activeQuestion = aggregate.questionInstances[aggregate.activeQuestionInstanceId!];
          const previouslyAsked = new Set(Object.values(aggregate.questionInstances)
            .filter((question) => question.status === 'resolved' || question.status === 'vetoed')
            .map((question) => question.templateId));
          const hasReplacement = contentPack.questionTemplates.some((template) =>
            template.categoryId === activeQuestion.categoryId &&
            template.templateId !== activeQuestion.templateId &&
            (!aggregate.selectedScale || template.scaleSet.appliesTo.includes(aggregate.selectedScale)) &&
            !previouslyAsked.has(template.templateId)
          );
          if (!hasReplacement) {
            return [error(envelope.command.type, 'NO_RANDOM_QUESTION_AVAILABLE', 'There is no other unasked question in this category for the selected scale.')];
          }
        }
      }
      if (resolutionPlan.kind === 'time_bonus' && !getTimerByKind(aggregate, 'hide')) {
        return [error(envelope.command.type, 'TIME_BONUS_NOT_AVAILABLE', 'Time bonus cards only work while the hide timer is still running.')];
      }

      const handCards = getHandCardsForHolder(aggregate, cardInstance.holderType, cardInstance.holderId);
      const otherHandCards = handCards.filter((card) =>
        card.cardInstanceId !== cardInstance.cardInstanceId && card.cardInstanceId !== duplicateTargetId
      );
      if (
        resolutionPlan.discardRequirement.discardWholeHand &&
        resolutionPlan.kind !== 'move' &&
        otherHandCards.length === 0
      ) {
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
      const activeResolution = aggregate.activeCardResolution;
      if (activeResolution?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'CARD_WINDOW_NOT_ACTIVE', 'This card resolution window is not active.')];
      }

      if (activeResolution.resolutionKind === 'endless_tumble_challenge') {
        return [error(envelope.command.type, 'ENDLESS_TUMBLE_CAST_ROLL_REQUIRED', 'Roll the casting die and record its result to resolve Endless Tumble.')];
      }

      if (activeResolution.resolutionKind === 'hangman_challenge' &&
        !['solved', 'ended'].includes(activeResolution.hangman?.status ?? 'awaiting_word')) {
        return [error(envelope.command.type, 'HANGMAN_CHALLENGE_ACTIVE', activeResolution.hangman?.status === 'awaiting_word'
          ? 'Set the five-letter word and complete the Hangman challenge before closing this card.'
          : 'Finish the Hangman challenge before closing this card.')];
      }

      if (activeResolution.resolutionKind === 'labyrinth_challenge' && activeResolution.labyrinth?.status !== 'solved') {
        return [error(envelope.command.type, 'LABYRINTH_CHALLENGE_ACTIVE', 'Publish a maze, have the seekers submit a solution, and approve the solved route before closing this curse.')];
      }

      if (activeResolution.resolutionKind === 'unguided_tourist_challenge') {
        if (envelope.command.payload.unguidedTouristRulesAttested !== true) {
          return [error(envelope.command.type, 'UNGUIDED_TOURIST_RULES_ATTESTATION_REQUIRED', 'The hider must confirm the Street View clue is within 152 m, unzoomed, level with the horizon, and shows a qualifying structure.')];
        }
        const seekers = Object.values(aggregate.teams).find((team) => team.side === 'seeker')?.memberPlayerIds ?? [];
        const outdoors = new Set(activeResolution.unguidedTouristOutdoorsConfirmedByPlayerIds ?? []);
        if (seekers.some((playerId) => !outdoors.has(playerId))) {
          return [error(envelope.command.type, 'SEEKERS_MUST_BE_OUTSIDE', 'Each seeker must confirm they are outside before the Street View challenge can begin.')];
        }
        const attachment = envelope.command.payload.unguidedTouristHiderAttachmentId
          ? aggregate.attachments[envelope.command.payload.unguidedTouristHiderAttachmentId]
          : undefined;
        if (!attachment || attachment.kind !== 'photo_evidence' ||
          attachment.linkedCardInstanceId !== activeResolution.sourceCardInstanceId ||
          attachment.ownerPlayerId !== envelope.actor.playerId || attachment.visibilityScope !== 'public_match' ||
          attachment.captureMetadata.pickerSource !== 'library') {
          return [error(envelope.command.type, 'UNGUIDED_TOURIST_REFERENCE_REQUIRED', 'The hider must share a public Street View reference image from their photo library for this card.')];
        }
      }

      if (activeResolution.resolutionKind === 'bird_guide_challenge') {
        const attachment = envelope.command.payload.birdGuideHiderAttachmentId
          ? aggregate.attachments[envelope.command.payload.birdGuideHiderAttachmentId]
          : undefined;
        const durationMs = Number(attachment?.captureMetadata.durationMs ?? 0);
        const maximumDurationMs = (activeResolution.birdGuideMaximumDurationMinutes ?? 5) * 60_000;
        if (envelope.command.payload.birdGuideBirdPresentAttested !== true) {
          return [error(envelope.command.type, 'BIRD_GUIDE_FRAME_ATTESTATION_REQUIRED', 'Confirm the bird was in frame when recording started. Any recognizable part counts.')];
        }
        if (!attachment || attachment.kind !== 'video_evidence' ||
          attachment.linkedCardInstanceId !== activeResolution.sourceCardInstanceId ||
          attachment.ownerPlayerId !== envelope.actor.playerId || attachment.visibilityScope !== 'public_match' ||
          attachment.captureMetadata.pickerSource !== 'camera' || !Number.isFinite(durationMs) || durationMs <= 0 ||
          durationMs > maximumDurationMs) {
          return [error(envelope.command.type, 'BIRD_GUIDE_HIDER_VIDEO_REQUIRED', `Record a public camera video of the bird, no longer than ${maximumDurationMs / 60_000} minutes, then attach it to this card.`)];
        }
      }

      if (activeResolution.resolutionKind === 'mediocre_travel_agent_challenge') {
        const payload = envelope.command.payload;
        const name = payload.mediocreTravelAgentDestinationName?.trim();
        const latitude = payload.mediocreTravelAgentLatitude;
        const longitude = payload.mediocreTravelAgentLongitude;
        if (!name || name.length > 100 || payload.mediocreTravelAgentPublicAccessAttested !== true ||
          !Number.isFinite(latitude) || Math.abs(latitude!) > 90 || !Number.isFinite(longitude) || Math.abs(longitude!) > 180) {
          return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_DESTINATION_REQUIRED', 'Name a publicly accessible destination, mark its map point, and confirm seekers are not on transit.')];
        }
        const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
        const maximumDistanceMeters = activeResolution.mediocreTravelAgentMaximumDistanceMeters;
        if (!seekerTeam || !Number.isFinite(maximumDistanceMeters) || !maximumDistanceMeters) {
          return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_SEEKERS_REQUIRED', 'A current seeker location and scale limit are required to set the trip.')];
        }
        if (aggregate.mapRegion && !pointInGeometry([longitude!, latitude!], aggregate.mapRegion.boundaryGeometry)) {
          return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_DESTINATION_OUTSIDE_REGION', 'Choose the destination inside the selected playable map region.')];
        }
        for (const playerId of seekerTeam.memberPlayerIds) {
          const transitStatus = activeResolution.mediocreTravelAgentTransitStatusByPlayerId?.[playerId];
          const sample = [...aggregate.locationSamples].reverse().find((candidate) => candidate.playerId === playerId);
          const ageMs = sample ? Date.parse(envelope.occurredAt) - Date.parse(sample.recordedAt) : Infinity;
          if (!transitStatus || transitStatus.onTransitOrAtStation || !sample || sample.source !== 'device' ||
            typeof sample.accuracyMeters !== 'number' || sample.accuracyMeters > 50 || ageMs < 0 || ageMs > 30_000) {
            return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_SEEKER_FIX_REQUIRED', 'Every seeker must share a fresh accurate phone location and confirm they are off transit before the hider chooses the trip.')];
          }
          if (distanceMeters([longitude!, latitude!], [sample.longitude, sample.latitude]) > maximumDistanceMeters) {
            return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_DESTINATION_TOO_FAR', `The destination must be within ${Math.round(maximumDistanceMeters)} m of every seeker’s current location.`)];
          }
        }
      }

      if (activeResolution.resolutionKind === 'zoologist_challenge') {
        const category = envelope.command.payload.zoologistCategory;
        const attachment = envelope.command.payload.zoologistHiderAttachmentId
          ? aggregate.attachments[envelope.command.payload.zoologistHiderAttachmentId]
          : undefined;
        if (!['fish', 'bird', 'mammal', 'reptile', 'amphibian', 'bug'].includes(category ?? '') ||
          !attachment || attachment.kind !== 'photo_evidence' ||
          attachment.linkedCardInstanceId !== activeResolution.sourceCardInstanceId ||
          attachment.ownerPlayerId !== envelope.actor.playerId ||
          attachment.visibilityScope !== 'public_match' ||
          attachment.captureMetadata.pickerSource !== 'camera') {
          return [error(envelope.command.type, 'ZOOLOGIST_HIDER_PHOTO_REQUIRED', 'Take a new photo with the camera, choose its animal category, and record it publicly for this card before closing it.')];
        }
      }

      if (activeResolution.resolutionKind === 'luxury_car_challenge') {
        const { luxuryCarHiderAttachmentId, luxuryCarDescription, luxuryCarProductionYear, luxuryCarMsrpCents, luxuryCarCurrencyCode } = envelope.command.payload;
        const attachment = luxuryCarHiderAttachmentId ? aggregate.attachments[luxuryCarHiderAttachmentId] : undefined;
        if (!attachment || attachment.kind !== 'photo_evidence' ||
          attachment.linkedCardInstanceId !== activeResolution.sourceCardInstanceId ||
          attachment.ownerPlayerId !== envelope.actor.playerId ||
          attachment.visibilityScope !== 'public_match' || attachment.captureMetadata.pickerSource !== 'camera' ||
          typeof luxuryCarDescription !== 'string' || luxuryCarDescription.trim().length < 2 || luxuryCarDescription.trim().length > 120 ||
          !Number.isInteger(luxuryCarProductionYear) || luxuryCarProductionYear! < 1886 || luxuryCarProductionYear! > 2100 ||
          !Number.isSafeInteger(luxuryCarMsrpCents) || luxuryCarMsrpCents! <= 0 ||
          typeof luxuryCarCurrencyCode !== 'string' || !/^[A-Z]{3}$/.test(luxuryCarCurrencyCode)) {
          return [error(envelope.command.type, 'LUXURY_CAR_REFERENCE_INVALID', 'Record a public camera photo, car description, production year, positive MSRP, and three-letter currency code before closing the card.')];
        }
      }

      if (activeResolution.resolutionKind === 'u_turn_challenge') {
        const stationName = envelope.command.payload.uTurnNextStationName?.trim();
        if (!stationName || stationName.length > 120 || envelope.command.payload.uTurnPreconditionsConfirmed !== true ||
          !Number.isInteger(activeResolution.uTurnAlternateTransitWindowMinutes) ||
          (activeResolution.uTurnAlternateTransitWindowMinutes ?? 0) <= 0) {
          return [error(envelope.command.type, 'U_TURN_PRECONDITIONS_REQUIRED', 'Record the next actual stop and confirm the seekers are moving farther from the hider and another transit mode serves that stop within the displayed time window.')];
        }
      }

      if (activeResolution.resolutionKind === 'ransom_note_challenge' &&
        envelope.command.payload.ransomNoteCastingCostConfirmed !== true) {
        return [error(envelope.command.type, 'RANSOM_NOTE_CASTING_COST_REQUIRED', 'The hider must spell RANSOM NOTE with printed cutouts before activating this curse.')];
      }

      if (activeResolution.resolutionKind === 'cairn_challenge' &&
        (!Number.isSafeInteger(envelope.command.payload.cairnTargetHeight) || (envelope.command.payload.cairnTargetHeight ?? 0) < 1 || envelope.command.payload.cairnTargetConfirmed !== true)) {
        return [error(envelope.command.type, 'CAIRN_TARGET_HEIGHT_REQUIRED', 'Record the hider tower height: at least one rock must have stood for five seconds.')];
      }

      if (activeResolution.resolutionKind === 'move') {
        if (
          typeof activeResolution.moveDurationSeconds === 'number' &&
          Date.parse(envelope.occurredAt) < Date.parse(activeResolution.openedAt) + activeResolution.moveDurationSeconds * 1000
        ) {
          return [error(envelope.command.type, 'MOVE_TIMER_ACTIVE', 'The Move timer has not expired yet.')];
        }
        const zone = aggregate.hiddenState.hidingZone;
        if (!zone || (activeResolution.moveOriginStationId && zone.stationId === activeResolution.moveOriginStationId)) {
          return [error(envelope.command.type, 'MOVE_ZONE_REQUIRED', 'Choose a new transit station as the hiding-zone center before ending Move.')];
        }
        if (!aggregate.hiddenState.hiderLocation) {
          return [error(envelope.command.type, 'MOVE_ARRIVAL_REQUIRED', 'Confirm arrival at the new hiding-zone station before ending Move.')];
        }
      }

      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId);
      const sourceCard = aggregate.cardInstances[activeResolution.sourceCardInstanceId];
      if (actorRole === 'hider' && (!sourceCard || !isCardAccessibleToActor(aggregate, sourceCard, envelope.actor.playerId, envelope.actor.role))) {
        return [error(envelope.command.type, 'FORBIDDEN', 'A hider can only resolve a card from their own team hand.')];
      }

      const questionTemplateIds = envelope.command.payload.questionTemplateIds ?? [];
      if (activeResolution.resolutionKind === 'disable_question_templates') {
        const selectedTemplates = questionTemplateIds.map((templateId) =>
          contentPack.questionTemplates.find((template) => template.templateId === templateId)
        );
        if (selectedTemplates.some((template) =>
          template && aggregate.selectedScale && !template.scaleSet.appliesTo.includes(aggregate.selectedScale)
        )) {
          return [error(envelope.command.type, 'QUESTION_TEMPLATE_NOT_AVAILABLE_AT_SCALE', 'A selected question is not available in the selected game scale.')];
        }
        if (
          questionTemplateIds.length !== activeResolution.questionTemplateCount ||
          new Set(questionTemplateIds).size !== questionTemplateIds.length ||
          selectedTemplates.some((template) => !template) ||
          (activeResolution.requireDistinctQuestionCategories &&
            new Set(selectedTemplates.map((template) => template?.categoryId)).size !== questionTemplateIds.length)
        ) {
          return [error(envelope.command.type, 'QUESTION_TEMPLATE_SELECTION_INVALID', `Choose exactly ${activeResolution.questionTemplateCount} different questions${activeResolution.requireDistinctQuestionCategories ? ', each from a different category' : ''}.`)];
        }
      } else if (questionTemplateIds.length > 0) {
        return [error(envelope.command.type, 'QUESTION_TEMPLATE_SELECTION_NOT_ALLOWED', 'This card does not select questions.')];
      }

      return validateDiscardResolution(
        aggregate,
        contentPack,
        envelope as CommandEnvelope<Extract<CommandEnvelope['command'], { type: 'resolve_card_window' }>>
      );
    }
    case 'confirm_unguided_tourist_outdoors': {
      const { sourceCardInstanceId } = envelope.command.payload;
      const active = aggregate.activeCardResolution;
      const seekerIds = Object.values(aggregate.teams).find((team) => team.side === 'seeker')?.memberPlayerIds ?? [];
      if (active?.sourceCardInstanceId !== sourceCardInstanceId || active.resolutionKind !== 'unguided_tourist_challenge') {
        return [error(envelope.command.type, 'UNGUIDED_TOURIST_NOT_ACTIVE', 'There is no active Unguided Tourist card awaiting seeker outdoor confirmations.')];
      }
      if (!envelope.actor.playerId || !seekerIds.includes(envelope.actor.playerId) ||
        (getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role) !== 'seeker') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Each seeker must confirm their own outdoor status.')];
      }
      if (active.unguidedTouristOutdoorsConfirmedByPlayerIds?.includes(envelope.actor.playerId)) {
        return [error(envelope.command.type, 'ALREADY_CONFIRMED', 'You already confirmed that you are outside.')];
      }
      return [];
    }
    case 'submit_unguided_tourist_photo': {
      const challenge = aggregate.unguidedTouristChallenge;
      const payload = envelope.command.payload;
      const attachment = aggregate.attachments[payload.attachmentId];
      if (challenge?.sourceCardInstanceId !== payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'UNGUIDED_TOURIST_NOT_ACTIVE', 'There is no active Unguided Tourist photo challenge.')];
      }
      if (challenge.candidate) return [error(envelope.command.type, 'PHOTO_REVIEW_PENDING', 'Wait for the hider to review the current photo before submitting another.')];
      if (payload.attestedNoInternetResearch !== true) return [error(envelope.command.type, 'NO_INTERNET_ATTESTATION_REQUIRED', 'Confirm that seekers did not use internet research to locate the pictured structure.')];
      if (!envelope.actor.playerId || !challenge.requiredSeekerPlayerIds.includes(envelope.actor.playerId) ||
        (getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role) !== 'seeker') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only a seeker on the active team can submit the found-location photo.')];
      }
      if (!attachment || attachment.kind !== 'photo_evidence' || attachment.linkedCardInstanceId !== payload.sourceCardInstanceId ||
        attachment.ownerPlayerId !== envelope.actor.playerId || attachment.visibilityScope !== 'public_match' ||
        attachment.captureMetadata.pickerSource !== 'camera' || Date.parse(attachment.createdAt) <= Date.parse(challenge.activatedAt ?? '')) {
        return [error(envelope.command.type, 'SEEKER_CAMERA_PHOTO_REQUIRED', 'Take a new public photo with the camera and attach it to this card.')];
      }
      return [];
    }
    case 'review_unguided_tourist_photo': {
      const challenge = aggregate.unguidedTouristChallenge;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || !challenge.candidate) {
        return [error(envelope.command.type, 'PHOTO_NOT_PENDING', 'There is no seeker photo awaiting hider review.')];
      }
      if (!challenge.candidate.attestedNoInternetResearch) return [error(envelope.command.type, 'NO_INTERNET_ATTESTATION_REQUIRED', 'The seeker must attest that they did not use internet research.')];
      const activeHider = Object.values(aggregate.roleAssignments).find((assignment) => assignment.role === 'hider')?.playerId;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if (actorRole !== 'host' && (actorRole !== 'hider' || envelope.actor.playerId !== activeHider)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the active hider can approve or reject the seekers’ photo.')];
      }
      return [];
    }
    case 'submit_bird_guide_video': {
      const challenge = aggregate.birdGuideChallenge;
      const payload = envelope.command.payload;
      const attachment = aggregate.attachments[payload.attachmentId];
      if (challenge?.sourceCardInstanceId !== payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'BIRD_GUIDE_NOT_ACTIVE', 'There is no active Bird Guide video challenge.')];
      }
      if (challenge.candidate) return [error(envelope.command.type, 'BIRD_GUIDE_REVIEW_PENDING', 'Wait for the hider to review the current video before submitting another.')];
      const seekerIds = Object.values(aggregate.teams).find((team) => team.side === 'seeker')?.memberPlayerIds ?? [];
      if (!envelope.actor.playerId || !seekerIds.includes(envelope.actor.playerId) ||
        (getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role) !== 'seeker') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only a seeker may submit a matching bird video.')];
      }
      const durationMs = Number(attachment?.captureMetadata.durationMs ?? 0);
      if (!attachment || attachment.kind !== 'video_evidence' || attachment.linkedCardInstanceId !== payload.sourceCardInstanceId ||
        attachment.ownerPlayerId !== envelope.actor.playerId || attachment.visibilityScope !== 'public_match' ||
        attachment.captureMetadata.pickerSource !== 'camera' || Date.parse(attachment.createdAt) <= Date.parse(challenge.activatedAt) ||
        !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > challenge.maximumDurationMs) {
        return [error(envelope.command.type, 'BIRD_GUIDE_CAMERA_VIDEO_REQUIRED', 'Record a new public camera video of a bird within the challenge time limit and attach it to this card.')];
      }
      if (durationMs < challenge.hiderDurationMs) {
        return [error(envelope.command.type, 'BIRD_GUIDE_VIDEO_TOO_SHORT', 'Your bird video must last the same amount of time or longer than the hider recording.')];
      }
      return [];
    }
    case 'review_bird_guide_video': {
      const challenge = aggregate.birdGuideChallenge;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || !challenge.candidate) {
        return [error(envelope.command.type, 'BIRD_GUIDE_VIDEO_NOT_PENDING', 'There is no seeker video awaiting hider review.')];
      }
      const activeHider = Object.values(aggregate.roleAssignments).find((assignment) => assignment.role === 'hider')?.playerId;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if (actorRole !== 'host' && (actorRole !== 'hider' || envelope.actor.playerId !== activeHider)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the active hider can approve or reject the seekers’ bird video.')];
      }
      return [];
    }
    case 'report_mediocre_travel_souvenir': {
      const challenge = aggregate.mediocreTravelAgentChallenge;
      const payload = envelope.command.payload;
      if (challenge?.sourceCardInstanceId !== payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_NOT_ACTIVE', 'There is no active Mediocre Travel Agent trip.')];
      }
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      const seekerIds = Object.values(aggregate.teams).find((team) => team.side === 'seeker')?.memberPlayerIds ?? [];
      if (actorRole !== 'host' && (!envelope.actor.playerId || actorRole !== 'seeker' || !seekerIds.includes(envelope.actor.playerId))) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only a seeker may report acquiring or losing the souvenir.')];
      }
      if (payload.status === 'acquired') {
        if (challenge.souvenirAcquiredAt || challenge.souvenirLostAt) {
          return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_SOUVENIR_ALREADY_REPORTED', 'The seeker team has already reported its souvenir status.')];
        }
      } else if (!challenge.souvenirAcquiredAt) {
        return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_SOUVENIR_NOT_ACQUIRED', 'Acquire a physical souvenir before reporting that it was lost.')];
      } else if (challenge.souvenirLostAt) {
        return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_SOUVENIR_ALREADY_REPORTED', 'The souvenir loss was already reported and its time bonus recorded.')];
      } else if (aggregate.lifecycleState === 'game_complete' || aggregate.lifecycleState === 'archived') {
        return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_SOUVENIR_TOO_LATE', 'The souvenir bonus only applies before the hider is found.')];
      }
      return [];
    }
    case 'complete_mediocre_travel_agent': {
      const challenge = aggregate.mediocreTravelAgentChallenge;
      const payload = envelope.command.payload;
      if (challenge?.sourceCardInstanceId !== payload.sourceCardInstanceId || challenge.completedAt) {
        return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_NOT_ACTIVE', 'There is no unfinished Mediocre Travel Agent trip.')];
      }
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      const seekerIds = Object.values(aggregate.teams).find((team) => team.side === 'seeker')?.memberPlayerIds ?? [];
      if (actorRole !== 'host' && (!envelope.actor.playerId || actorRole !== 'seeker' || !seekerIds.includes(envelope.actor.playerId))) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only a seeker may complete the team trip.')];
      }
      const now = Date.parse(envelope.occurredAt);
      for (const playerId of challenge.requiredSeekerPlayerIds) {
        const stayStartedAt = challenge.stayStartedAtByPlayerId[playerId];
        const sample = [...aggregate.locationSamples].reverse().find((candidate) => candidate.playerId === playerId);
        if (!stayStartedAt || now - Date.parse(stayStartedAt) < challenge.stayMinutes * 60_000) {
          return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_STAY_INCOMPLETE', `Every seeker must stay at the destination for at least ${challenge.stayMinutes} minutes.`)];
        }
        if (!sample || sample.source !== 'device' ||
          typeof sample.accuracyMeters !== 'number' || sample.accuracyMeters > challenge.arrivalRadiusMeters ||
          now - Date.parse(sample.recordedAt) < 0 || now - Date.parse(sample.recordedAt) > 30_000 ||
          distanceMeters([sample.longitude, sample.latitude], [challenge.destinationLongitude, challenge.destinationLatitude]) > challenge.arrivalRadiusMeters) {
          return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_STAY_NOT_CONFIRMED', 'Each seeker must still be at the destination off transit with a fresh phone location.')];
        }
        const transitStatus = challenge.transitStatusByPlayerId[playerId];
        if (!transitStatus || transitStatus.onTransitOrAtStation) {
          return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_TRANSIT_STATUS_REQUIRED', 'Each seeker must confirm they are off transit and clear of the station before completing the trip.')];
        }
      }
      const tripPhotos = Object.values(aggregate.attachments).filter((attachment) =>
        attachment.linkedCardInstanceId === challenge.sourceCardInstanceId && attachment.kind === 'photo_evidence' &&
        attachment.visibilityScope === 'public_match' && attachment.captureMetadata.pickerSource === 'camera' &&
        Date.parse(attachment.createdAt) > Date.parse(challenge.startedAt)
      );
      if (tripPhotos.length < challenge.requiredPhotoCount) {
        return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_PHOTOS_REQUIRED', `Send at least ${challenge.requiredPhotoCount} new public camera photos from the trip before asking another question.`)];
      }
      if (!challenge.souvenirAcquiredAt) {
        return [error(envelope.command.type, 'MEDIOCRE_TRAVEL_AGENT_SOUVENIR_REQUIRED', 'The seekers must acquire a physical souvenir before finishing the trip.')];
      }
      return [];
    }
    case 'submit_impressionable_consumer_target': {
      const challenge = aggregate.impressionableConsumerChallenge;
      const payload = envelope.command.payload;
      if (challenge?.sourceCardInstanceId !== payload.sourceCardInstanceId || challenge.completedAt) {
        return [error(envelope.command.type, 'IMPRESSIONABLE_CONSUMER_NOT_ACTIVE', 'There is no active Impressionable Consumer challenge.')];
      }
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      const seekerIds = Object.values(aggregate.teams).find((team) => team.side === 'seeker')?.memberPlayerIds ?? [];
      if (actorRole !== 'host' && (!envelope.actor.playerId || actorRole !== 'seeker' || !seekerIds.includes(envelope.actor.playerId))) {
        return [error(envelope.command.type, 'FORBIDDEN', 'A seeker must submit the advertised place or product from their seeker account.')];
      }
      if (challenge.target?.reviewApproved === true || !payload.advertisementName.trim() || payload.advertisementName.trim().length > 120 ||
        !payload.targetName.trim() || payload.targetName.trim().length > 120 || payload.advertisementOutdoorsAttested !== true ||
        payload.targetIsBusinessAttested !== true || !['enter_location', 'buy_product_or_service'].includes(payload.action) ||
        !Number.isFinite(payload.advertisementLatitude) || Math.abs(payload.advertisementLatitude) > 90 ||
        !Number.isFinite(payload.advertisementLongitude) || Math.abs(payload.advertisementLongitude) > 180 ||
        !Number.isFinite(payload.targetLatitude) || Math.abs(payload.targetLatitude) > 90 ||
        !Number.isFinite(payload.targetLongitude) || Math.abs(payload.targetLongitude) > 180) {
        return [error(envelope.command.type, 'IMPRESSIONABLE_CONSUMER_TARGET_INVALID', 'Name the outdoor advertisement and advertised business, confirm it was found outdoors, and choose whether the seekers must enter or buy.')];
      }
      if (aggregate.mapRegion && (!pointInGeometry([payload.advertisementLongitude, payload.advertisementLatitude], aggregate.mapRegion.boundaryGeometry) ||
        !pointInGeometry([payload.targetLongitude, payload.targetLatitude], aggregate.mapRegion.boundaryGeometry))) {
        return [error(envelope.command.type, 'IMPRESSIONABLE_CONSUMER_OUTSIDE_REGION', 'Both the advertisement and its advertised business must be inside the playable region.')];
      }
      const distance = distanceMeters([payload.advertisementLongitude, payload.advertisementLatitude], [payload.targetLongitude, payload.targetLatitude]);
      if (distance < challenge.minimumAdvertisementDistanceMeters) {
        return [error(envelope.command.type, 'IMPRESSIONABLE_CONSUMER_AD_TOO_CLOSE', `Find an outdoor advertisement at least ${challenge.minimumAdvertisementDistanceMeters} m from the advertised business.`)];
      }
      return [];
    }
    case 'review_impressionable_consumer_target': {
      const challenge = aggregate.impressionableConsumerChallenge;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || !challenge.target || challenge.target.reviewApproved !== undefined) {
        return [error(envelope.command.type, 'IMPRESSIONABLE_CONSUMER_REVIEW_NOT_READY', 'There is no new advertised target to review.')];
      }
      if (actorRole !== 'host' && actorRole !== 'hider') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the hider or referee can review the advertised target.')];
      }
      return [];
    }
    case 'complete_impressionable_consumer_challenge': {
      const challenge = aggregate.impressionableConsumerChallenge;
      const playerId = envelope.actor.playerId;
      const actorRole = getPlayerRole(aggregate, playerId) ?? envelope.actor.role;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || challenge.completedAt ||
        !challenge.target || challenge.target.reviewApproved !== true) {
        return [error(envelope.command.type, 'IMPRESSIONABLE_CONSUMER_TARGET_NOT_APPROVED', 'The hider must approve an eligible outdoor advertisement and its business before the seekers visit.')];
      }
      if (!playerId || actorRole !== 'seeker' || !challenge.requiredSeekerPlayerIds.includes(playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Each seeker must report their own entry or purchase from their seeker account.')];
      }
      if (challenge.completedAtByPlayerId[playerId]) {
        return [error(envelope.command.type, 'IMPRESSIONABLE_CONSUMER_ALREADY_REPORTED', 'You already reported completing this visit.')];
      }
      const sample = [...aggregate.locationSamples].reverse().find((candidate) => candidate.playerId === playerId);
      const now = Date.parse(envelope.occurredAt);
      if (!sample || sample.source !== 'device' || typeof sample.accuracyMeters !== 'number' || sample.accuracyMeters > 50 ||
        now - Date.parse(sample.recordedAt) < 0 || now - Date.parse(sample.recordedAt) > 30_000 ||
        distanceMeters([sample.longitude, sample.latitude], [challenge.target.targetLongitude, challenge.target.targetLatitude]) > 50) {
        return [error(envelope.command.type, 'IMPRESSIONABLE_CONSUMER_ARRIVAL_NOT_CONFIRMED', 'A fresh phone fix must place you at the approved business to attest entry or receipt of the purchase.')];
      }
      return [];
    }
    case 'set_distant_cuisine_origin': {
      const challenge = aggregate.distantCuisineChallenge;
      const payload = envelope.command.payload;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if (challenge?.sourceCardInstanceId !== payload.sourceCardInstanceId || challenge.completedAt) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_NOT_ACTIVE', 'There is no active Distant Cuisine challenge.')];
      }
      if (actorRole !== 'hider' && actorRole !== 'host') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the hider or referee can record the restaurant where the curse was played.')];
      }
      if (!payload.restaurantName.trim() || payload.restaurantName.trim().length > 120 || !payload.cuisineCountryName.trim() || payload.cuisineCountryName.trim().length > 120 || !isOsmBoundaryId(payload.cuisineCountryRegionId) || payload.publicSingleCountryReferenceAttested !== true || !Number.isFinite(payload.restaurantLatitude) || Math.abs(payload.restaurantLatitude) > 90 || !Number.isFinite(payload.restaurantLongitude) || Math.abs(payload.restaurantLongitude) > 180) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_ORIGIN_INVALID', 'Name the restaurant and one country identified in its public-facing material, and select that country boundary.')];
      }
      if (aggregate.mapRegion && !pointInGeometry([payload.restaurantLongitude, payload.restaurantLatitude], aggregate.mapRegion.boundaryGeometry)) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_RESTAURANT_OUTSIDE_MAP', 'The restaurant where the hider played this card must be inside the applied game map.')];
      }
      const sample = freshDeviceLocation(aggregate, envelope.actor.playerId, envelope.occurredAt);
      if (!sample || distanceMeters([sample.longitude, sample.latitude], [payload.restaurantLongitude, payload.restaurantLatitude]) > 50) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_HIDER_NOT_AT_RESTAURANT', 'A fresh hider phone fix must place the hider at the restaurant where the curse is played.')];
      }
      return [];
    }
    case 'submit_distant_cuisine_target': {
      const challenge = aggregate.distantCuisineChallenge;
      const payload = envelope.command.payload;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if (challenge?.sourceCardInstanceId !== payload.sourceCardInstanceId || !challenge.origin || challenge.completedAt) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_ORIGIN_REQUIRED', 'The hider must record the restaurant and cuisine country where the curse was played first.')];
      }
      if (!envelope.actor.playerId || actorRole !== 'seeker' || !challenge.requiredSeekerPlayerIds.includes(envelope.actor.playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'A seeker must submit the restaurant and cuisine country from their seeker account.')];
      }
      if ((challenge.target?.reviewApproved === undefined && challenge.target) || challenge.target?.reviewApproved === true || !payload.restaurantName.trim() || payload.restaurantName.trim().length > 120 || !payload.cuisineCountryName.trim() || payload.cuisineCountryName.trim().length > 120 || !isOsmBoundaryId(payload.cuisineCountryRegionId) || payload.publicSingleCountryReferenceAttested !== true || !Number.isFinite(payload.restaurantLatitude) || Math.abs(payload.restaurantLatitude) > 90 || !Number.isFinite(payload.restaurantLongitude) || Math.abs(payload.restaurantLongitude) > 180) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_TARGET_INVALID', 'Submit a restaurant whose public-facing material identifies one country or region within one country.')];
      }
      if (aggregate.mapRegion && !pointInGeometry([payload.restaurantLongitude, payload.restaurantLatitude], aggregate.mapRegion.boundaryGeometry)) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_RESTAURANT_OUTSIDE_MAP', 'The restaurant must be inside the applied game map.')];
      }
      return [];
    }
    case 'report_distant_cuisine_distance': {
      const challenge = aggregate.distantCuisineChallenge;
      const playerId = envelope.actor.playerId;
      const actorRole = getPlayerRole(aggregate, playerId) ?? envelope.actor.role;
      const payload = envelope.command.payload;
      if (challenge?.sourceCardInstanceId !== payload.sourceCardInstanceId || !challenge.origin || !challenge.target || challenge.target.reviewApproved !== undefined || challenge.completedAt) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_TARGET_NOT_READY', 'A proposed restaurant must be awaiting review before measuring country distances.')];
      }
      if (!playerId || actorRole !== 'seeker' || !challenge.requiredSeekerPlayerIds.includes(playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Each seeker must report country distance from their own seeker account.')];
      }
      if (challenge.distanceByPlayerId[playerId]) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_DISTANCE_ALREADY_REPORTED', 'Your distance check has already been recorded for this restaurant.')];
      }
      const location = freshDeviceLocation(aggregate, playerId, envelope.occurredAt);
      if (!location) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_LOCATION_NOT_FRESH', 'Refresh your phone location immediately before measuring the two country boundaries.')];
      }
      const distances = computeDistantCuisineDistances({ challenge, location, dataset: questionFeatureDataset });
      if (!distances) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_COUNTRY_BOUNDARY_UNAVAILABLE', 'The authority could not load complete OSM country boundaries for both cuisine countries. Try again when map data is available.')];
      }
      return [];
    }
    case 'review_distant_cuisine_target': {
      const challenge = aggregate.distantCuisineChallenge;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || !challenge.target || challenge.target.reviewApproved !== undefined) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_REVIEW_NOT_READY', 'There is no new restaurant target to review.')];
      }
      if (actorRole !== 'hider' && actorRole !== 'host') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the hider or referee can review the restaurant and its public cuisine reference.')];
      }
      if (envelope.command.payload.approved && !challenge.requiredSeekerPlayerIds.every((playerId) => challenge.distanceByPlayerId[playerId])) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_DISTANCES_REQUIRED', 'Every seeker must confirm the target cuisine country is at least as far away before the hider can approve it.')];
      }
      if (envelope.command.payload.approved && challenge.requiredSeekerPlayerIds.some((playerId) => {
        const distances = challenge.distanceByPlayerId[playerId];
        return distances && distances.targetCountryDistanceMeters < distances.sourceCountryDistanceMeters;
      })) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_TARGET_COUNTRY_TOO_NEAR', 'Every seeker must be at least as far from the target cuisine country as from the original country.')];
      }
      return [];
    }
    case 'complete_distant_cuisine_challenge': {
      const challenge = aggregate.distantCuisineChallenge;
      const playerId = envelope.actor.playerId;
      const actorRole = getPlayerRole(aggregate, playerId) ?? envelope.actor.role;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || challenge.completedAt || !challenge.origin || !challenge.target || challenge.target.reviewApproved !== true) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_TARGET_NOT_APPROVED', 'The hider must approve the target restaurant and cuisine country before the seekers visit.')];
      }
      if (!playerId || actorRole !== 'seeker' || !challenge.requiredSeekerPlayerIds.includes(playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Each seeker must report their own restaurant visit from their seeker account.')];
      }
      if (!challenge.distanceByPlayerId[playerId] || challenge.completedAtByPlayerId[playerId]) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_DISTANCE_REQUIRED', 'Record your nearest-boundary distance check before reporting the visit.')];
      }
      const sample = freshDeviceLocation(aggregate, playerId, envelope.occurredAt);
      if (!sample || distanceMeters([sample.longitude, sample.latitude], [challenge.target.restaurantLongitude, challenge.target.restaurantLatitude]) > 50) {
        return [error(envelope.command.type, 'DISTANT_CUISINE_ARRIVAL_NOT_CONFIRMED', 'A fresh seeker phone fix must place you at the approved restaurant.')];
      }
      return [];
    }
    case 'set_hangman_word': {
      const resolution = aggregate.activeCardResolution;
      if (resolution?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || resolution.resolutionKind !== 'hangman_challenge') {
        return [error(envelope.command.type, 'HANGMAN_NOT_ACTIVE', 'There is no active Hidden Hangman challenge for this card.')];
      }
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if (actorRole !== 'hider' && actorRole !== 'host' && actorRole !== 'system') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the hider may choose the Hangman word.')];
      }
      const word = envelope.command.payload.word.normalize('NFC').toUpperCase();
      if (resolution.hangman?.status !== 'awaiting_word' || !/^\p{L}{5}$/u.test(word)) {
        return [error(envelope.command.type, 'HANGMAN_WORD_INVALID', 'Choose one five-letter word in the language your group is playing.')];
      }
      return [];
    }
    case 'guess_hangman_letter': {
      const resolution = aggregate.activeCardResolution;
      if (resolution?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || resolution.resolutionKind !== 'hangman_challenge') {
        return [error(envelope.command.type, 'HANGMAN_NOT_ACTIVE', 'There is no active Hidden Hangman challenge for this card.')];
      }
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if (actorRole !== 'seeker') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only a seeker may guess a Hangman letter.')];
      }
      const letter = envelope.command.payload.letter.normalize('NFC').toUpperCase();
      if (resolution.hangman?.status !== 'playing' || !/^\p{L}$/u.test(letter)) {
        return [error(envelope.command.type, 'HANGMAN_GUESS_INVALID', 'Enter one letter after the hider sets the word.')];
      }
      if (resolution.hangman.guessedLetters.includes(letter)) {
        return [error(envelope.command.type, 'HANGMAN_LETTER_ALREADY_GUESSED', 'That letter has already been guessed.')];
      }
      return [];
    }
    case 'end_hangman_challenge': {
      const resolution = aggregate.activeCardResolution;
      if (resolution?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || resolution.resolutionKind !== 'hangman_challenge') {
        return [error(envelope.command.type, 'HANGMAN_NOT_ACTIVE', 'There is no active Hidden Hangman challenge for this card.')];
      }
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if (actorRole !== 'hider' && actorRole !== 'host' && actorRole !== 'system') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the hider may end the Hangman challenge.')];
      }
      if (resolution.hangman?.status !== 'playing') {
        return [error(envelope.command.type, 'HANGMAN_CHALLENGE_NOT_PLAYING', 'The Hangman challenge is not waiting for the seeker team.')];
      }
      return [];
    }
    case 'publish_labyrinth_maze': {
      const resolution = aggregate.activeCardResolution;
      if (resolution?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || resolution.resolutionKind !== 'labyrinth_challenge') {
        return [error(envelope.command.type, 'LABYRINTH_NOT_ACTIVE', 'There is no active Curse of the Labyrinth challenge for this card.')];
      }
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      const attachment = aggregate.attachments[envelope.command.payload.attachmentId];
      if ((actorRole !== 'hider' && actorRole !== 'host') ||
        !attachment || attachment.kind !== 'photo_evidence' ||
        attachment.linkedCardInstanceId !== resolution.sourceCardInstanceId ||
        attachment.ownerPlayerId !== envelope.actor.playerId ||
        attachment.visibilityScope !== 'public_match' ||
        attachment.captureMetadata.pickerSource !== 'camera') {
        return [error(envelope.command.type, 'LABYRINTH_MAZE_PHOTO_REQUIRED', 'Take a public camera photo of the hand-drawn maze and attach it to this card before publishing.')];
      }
      if (!resolution.labyrinth || !['awaiting_maze', 'solving'].includes(resolution.labyrinth.status)) {
        return [error(envelope.command.type, 'LABYRINTH_MAZE_CANNOT_BE_PUBLISHED', 'The maze can only be published before a solution is awaiting hider review.')];
      }
      return [];
    }
    case 'submit_labyrinth_solution': {
      const resolution = aggregate.activeCardResolution;
      if (resolution?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || resolution.resolutionKind !== 'labyrinth_challenge') {
        return [error(envelope.command.type, 'LABYRINTH_NOT_ACTIVE', 'There is no active Curse of the Labyrinth challenge for this card.')];
      }
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      const solutionText = envelope.command.payload.solutionText.trim();
      if (actorRole !== 'seeker' || resolution.labyrinth?.status !== 'solving' || !resolution.labyrinth.mazeAttachmentId || solutionText.length < 1 || solutionText.length > 2000) {
        return [error(envelope.command.type, 'LABYRINTH_SOLUTION_INVALID', 'After the hider publishes a maze, a seeker must submit a solution between 1 and 2,000 characters.')];
      }
      return [];
    }
    case 'review_labyrinth_solution': {
      const resolution = aggregate.activeCardResolution;
      if (resolution?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || resolution.resolutionKind !== 'labyrinth_challenge') {
        return [error(envelope.command.type, 'LABYRINTH_NOT_ACTIVE', 'There is no active Curse of the Labyrinth challenge for this card.')];
      }
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if ((actorRole !== 'hider' && actorRole !== 'host') || resolution.labyrinth?.status !== 'awaiting_hider_review') {
        return [error(envelope.command.type, 'LABYRINTH_REVIEW_NOT_READY', 'Only the hider can review a submitted maze solution.')];
      }
      return [];
    }
    case 'set_bridge_troll_position': {
      const challenge = aggregate.bridgeTrollChallenge;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'BRIDGE_TROLL_NOT_ACTIVE', 'There is no active Bridge Troll condition to confirm.')];
      }
      if (typeof envelope.command.payload.underBridge !== 'boolean') {
        return [error(envelope.command.type, 'BRIDGE_TROLL_STATUS_INVALID', 'Choose whether you are currently under the bridge.')];
      }
      const playerId = envelope.actor.playerId;
      const actorRole = getPlayerRole(aggregate, playerId) ?? envelope.actor.role;
      const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
      if (!playerId || actorRole !== 'seeker' || !seekerTeam?.memberPlayerIds.includes(playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Each seeker must confirm their own position from their seeker account.')];
      }
      return [];
    }
    case 'set_seeker_transit_context': {
      if (envelope.command.payload.onTransitOrAtStation === true && aggregate.unguidedTouristChallenge) {
        return [error(envelope.command.type, 'UNGUIDED_TOURIST_NO_TRANSIT', 'Seekers cannot use transportation until the hider approves a found-location photo.')];
      }
      const restriction = aggregate.seekerOffTransitRestriction;
      const sourceCardInstanceId = envelope.command.payload.sourceCardInstanceId;
      const isUrbanExplorer = restriction?.sourceCardInstanceId === sourceCardInstanceId;
      const resolution = aggregate.activeCardResolution;
      const travelChallenge = aggregate.mediocreTravelAgentChallenge;
      const isTravelAgent = (resolution?.resolutionKind === 'mediocre_travel_agent_challenge' && resolution.sourceCardInstanceId === sourceCardInstanceId) ||
        travelChallenge?.sourceCardInstanceId === sourceCardInstanceId;
      if (!isUrbanExplorer && !isTravelAgent) {
        return [error(envelope.command.type, 'URBAN_EXPLORER_NOT_ACTIVE', 'The Urban Explorer restriction is not active.')];
      }
      if (typeof envelope.command.payload.onTransitOrAtStation !== 'boolean') {
        return [error(envelope.command.type, 'URBAN_EXPLORER_STATUS_INVALID', 'Choose whether you are on transit or inside a train station.')];
      }
      const playerId = envelope.actor.playerId;
      const actorRole = getPlayerRole(aggregate, playerId) ?? envelope.actor.role;
      const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
      if (!playerId || actorRole !== 'seeker' || !seekerTeam?.memberPlayerIds.includes(playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Each seeker must update their own transit status from their seeker account.')];
      }
      return [];
    }
    case 'report_u_turn_disembarkation': {
      const challenge = aggregate.uTurnChallenge;
      const { sourceCardInstanceId, stationName } = envelope.command.payload;
      if (!challenge || challenge.sourceCardInstanceId !== sourceCardInstanceId) {
        return [error(envelope.command.type, 'U_TURN_NOT_ACTIVE', 'There is no active U-Turn transit challenge.')];
      }
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      const playerId = actorRole === 'host' ? envelope.command.payload.targetPlayerId : envelope.actor.playerId;
      const reportedPlayerRole = getPlayerRole(aggregate, playerId);
      if (!playerId || !challenge.requiredSeekerPlayerIds.includes(playerId) || reportedPlayerRole !== 'seeker' ||
        (actorRole !== 'host' && (actorRole !== 'seeker' || envelope.command.payload.targetPlayerId !== undefined))) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Each seeker must report from their own account; only the host referee may record a report on a seeker’s behalf.')];
      }
      if (challenge.disembarkedAtByPlayerId[playerId]) {
        return [error(envelope.command.type, 'U_TURN_ALREADY_REPORTED', 'You have already confirmed this U-Turn stop.')];
      }
      if (typeof stationName !== 'string' || stationName.trim().toLocaleLowerCase() !== challenge.nextStationName.toLocaleLowerCase()) {
        return [error(envelope.command.type, 'U_TURN_STATION_MISMATCH', `Confirm that you disembarked at ${challenge.nextStationName}.`)];
      }
      return [];
    }
    case 'report_ransom_note_question': {
      const challenge = aggregate.ransomNoteChallenge;
      const { sourceCardInstanceId, noteText, printedCutoutsConfirmed } = envelope.command.payload;
      if (!challenge || challenge.sourceCardInstanceId !== sourceCardInstanceId) {
        return [error(envelope.command.type, 'RANSOM_NOTE_NOT_ACTIVE', 'There is no active Ransom Note question challenge.')];
      }
      if (challenge.candidate || challenge.acceptedNoteText) {
        return [error(envelope.command.type, 'RANSOM_NOTE_REVIEW_PENDING', 'Wait for the hider to accept or reject the current note before submitting another.')];
      }
      const playerId = envelope.actor.playerId;
      const actorRole = getPlayerRole(aggregate, playerId) ?? envelope.actor.role;
      const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
      if (!playerId || actorRole !== 'seeker' || !seekerTeam?.memberPlayerIds.includes(playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'A seeker must submit the cut-out question from their own player account.')];
      }
      const words = typeof noteText === 'string' ? noteText.trim().split(/\s+/u).filter(Boolean) : [];
      if (words.length < 5 || noteText.trim().length > 500 || printedCutoutsConfirmed !== true) {
        return [error(envelope.command.type, 'RANSOM_NOTE_TEXT_INVALID', 'Enter at least five words and confirm they are cut from printed material; the hider will review coherence and the physical note.')];
      }
      return [];
    }
    case 'decide_ransom_note_question': {
      const challenge = aggregate.ransomNoteChallenge;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || !challenge.candidate) {
        return [error(envelope.command.type, 'RANSOM_NOTE_CANDIDATE_REQUIRED', 'There is no submitted cut-out question awaiting review.')];
      }
      if (actorRole !== 'hider' && actorRole !== 'host' && actorRole !== 'system') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the hider or host referee may review the cut-out question.')];
      }
      if (typeof envelope.command.payload.accepted !== 'boolean') {
        return [error(envelope.command.type, 'RANSOM_NOTE_DECISION_INVALID', 'Choose whether the question is coherent and follows the cut-out rule.')];
      }
      return [];
    }
    case 'begin_cairn_rock_placement': {
      const challenge = aggregate.cairnChallenge;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || challenge.completedAt) {
        return [error(envelope.command.type, 'CAIRN_NOT_ACTIVE', 'There is no unfinished Cairn tower challenge.')];
      }
      if (challenge.pendingRockStartedAt) {
        return [error(envelope.command.type, 'CAIRN_ROCK_ALREADY_PENDING', 'Wait for the current rock to stand for five seconds or report that the tower fell.')];
      }
      if (challenge.seekerStableHeight >= challenge.targetHeight) {
        return [error(envelope.command.type, 'CAIRN_ALREADY_COMPLETE', 'The seekers have already matched the hider tower.')];
      }
      return [];
    }
    case 'confirm_cairn_rock_stable': {
      const challenge = aggregate.cairnChallenge;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || challenge.completedAt || !challenge.pendingRockStartedAt) {
        return [error(envelope.command.type, 'CAIRN_ROCK_NOT_PENDING', 'Start placing a rock before confirming that it stood.')];
      }
      if (Date.parse(envelope.occurredAt) < Date.parse(challenge.pendingRockStartedAt) + 5_000) {
        return [error(envelope.command.type, 'CAIRN_STABILITY_TIME_REQUIRED', 'Each rock must stand for at least five seconds before it counts.')];
      }
      return [];
    }
    case 'report_cairn_tower_fallen': {
      const challenge = aggregate.cairnChallenge;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || challenge.completedAt) {
        return [error(envelope.command.type, 'CAIRN_NOT_ACTIVE', 'There is no unfinished Cairn tower challenge.')];
      }
      if (!challenge.pendingRockStartedAt && challenge.seekerStableHeight === 0) {
        return [error(envelope.command.type, 'CAIRN_TOWER_NOT_BUILT', 'Begin building the seeker tower before reporting that it fell.')];
      }
      return [];
    }
    case 'confirm_water_weight_liquid_acquired': {
      const challenge = aggregate.waterWeightChallenge;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'WATER_WEIGHT_NOT_ACTIVE', 'There is no active Water Weight challenge.')];
      }
      if (challenge.liquidAcquiredAt) {
        return [error(envelope.command.type, 'WATER_WEIGHT_ALREADY_ACQUIRED', 'The seekers have already confirmed that they acquired the required liquid.')];
      }
      const playerId = envelope.actor.playerId;
      const actorRole = getPlayerRole(aggregate, playerId) ?? envelope.actor.role;
      const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
      if (!playerId || actorRole !== 'seeker' || !seekerTeam?.memberPlayerIds.includes(playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only a seeker may confirm the team acquired its required liquid.')];
      }
      return [];
    }
    case 'report_water_weight_liquid_lost': {
      const challenge = aggregate.waterWeightChallenge;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'WATER_WEIGHT_NOT_ACTIVE', 'There is no active Water Weight challenge.')];
      }
      if (!challenge.liquidAcquiredAt) {
        return [error(envelope.command.type, 'WATER_WEIGHT_LIQUID_NOT_ACQUIRED', 'The required liquid has not been acquired yet.')];
      }
      const playerId = envelope.actor.playerId;
      const actorRole = getPlayerRole(aggregate, playerId) ?? envelope.actor.role;
      const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
      if (!playerId || actorRole !== 'seeker' || !seekerTeam?.memberPlayerIds.includes(playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only a seeker may report that the team liquid was lost or abandoned.')];
      }
      return [];
    }
    case 'resolve_endless_tumble_cast': {
      const resolution = aggregate.activeCardResolution;
      if (resolution?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || resolution.resolutionKind !== 'endless_tumble_challenge') {
        return [error(envelope.command.type, 'ENDLESS_TUMBLE_NOT_WAITING_FOR_CAST_ROLL', 'There is no Endless Tumble casting roll to resolve.')];
      }
      if (!Number.isInteger(envelope.command.payload.dieRoll) || envelope.command.payload.dieRoll < 1 || envelope.command.payload.dieRoll > 6) {
        return [error(envelope.command.type, 'ENDLESS_TUMBLE_DIE_ROLL_INVALID', 'Enter a die result from 1 to 6.')];
      }
      const sourceCard = aggregate.cardInstances[resolution.sourceCardInstanceId];
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if ((actorRole !== 'hider' && actorRole !== 'host' && actorRole !== 'system') || !sourceCard ||
        (actorRole === 'hider' && !isCardAccessibleToActor(aggregate, sourceCard, envelope.actor.playerId, envelope.actor.role))) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only a hider who holds the curse may resolve its casting roll.')];
      }
      return [];
    }
    case 'report_endless_tumble_roll': {
      const challenge = aggregate.endlessTumbleChallenge;
      const payload = envelope.command.payload;
      if (challenge?.sourceCardInstanceId !== payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'ENDLESS_TUMBLE_NOT_ACTIVE', 'There is no active Endless Tumble challenge.')];
      }
      if (challenge.successfulRollAt) {
        return [error(envelope.command.type, 'ENDLESS_TUMBLE_ALREADY_PASSED', 'The seekers already completed the required roll.')];
      }
      if (payload.dieRoll !== null && (!Number.isInteger(payload.dieRoll) || payload.dieRoll < 1 || payload.dieRoll > 6)) {
        return [error(envelope.command.type, 'ENDLESS_TUMBLE_DIE_ROLL_INVALID', 'Enter a die result from 1 to 6.')];
      }
      if (!Number.isFinite(payload.distanceMeters) || payload.distanceMeters < 0 || payload.distanceMeters > 10000) {
        return [error(envelope.command.type, 'ENDLESS_TUMBLE_DISTANCE_INVALID', 'Enter a measured roll distance between 0 and 10,000 meters.')];
      }
      if (typeof payload.unaided !== 'boolean' || typeof payload.landsCleanly !== 'boolean' || typeof payload.hitPerson !== 'boolean') {
        return [error(envelope.command.type, 'ENDLESS_TUMBLE_ATTESTATION_REQUIRED', 'Confirm whether the die rolled unaided, landed cleanly, and hit someone.')];
      }
      const playerId = envelope.actor.playerId;
      const actorRole = getPlayerRole(aggregate, playerId) ?? envelope.actor.role;
      const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
      const refereeMayReport = actorRole === 'host' || actorRole === 'system';
      if (!refereeMayReport && (!playerId || actorRole !== 'seeker' || !seekerTeam?.memberPlayerIds.includes(playerId))) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only a seeker may report the team’s die roll from a seeker account.')];
      }
      return [];
    }
    case 'set_lemon_phylactery_contact': {
      const challenge = aggregate.lemonPhylacteryChallenge;
      const payload = envelope.command.payload;
      if (challenge?.sourceCardInstanceId !== payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'LEMON_PHYLACTERY_NOT_ACTIVE', 'There is no active Lemon Phylactery challenge.')];
      }
      if (typeof payload.touching !== 'boolean') {
        return [error(envelope.command.type, 'LEMON_PHYLACTERY_STATUS_INVALID', 'Choose whether your lemon is still touching your clothing or skin.')];
      }
      const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
      const targetPlayerId = payload.targetPlayerId ?? envelope.actor.playerId;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      const refereeMaySetAnother = actorRole === 'host' || actorRole === 'system';
      if (!targetPlayerId || !seekerTeam?.memberPlayerIds.includes(targetPlayerId) ||
        (!refereeMaySetAnother && (actorRole !== 'seeker' || targetPlayerId !== envelope.actor.playerId))) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Each seeker reports their own lemon contact from their seeker account.')];
      }
      if ((challenge.statusByPlayerId[targetPlayerId]?.touching ?? false) === payload.touching) {
        return [error(envelope.command.type, 'LEMON_PHYLACTERY_STATUS_UNCHANGED', 'That seeker’s lemon contact status is already recorded.')];
      }
      return [];
    }
    case 'resolve_gamblers_feet_cast': {
      const resolution = aggregate.activeCardResolution;
      if (resolution?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || resolution.resolutionKind !== 'gamblers_feet_challenge') {
        return [error(envelope.command.type, 'GAMBLERS_FEET_NOT_WAITING_FOR_CAST_ROLL', 'There is no Gambler’s Feet casting roll to resolve.')];
      }
      if (!Number.isInteger(envelope.command.payload.dieRoll) || envelope.command.payload.dieRoll < 1 || envelope.command.payload.dieRoll > 6) {
        return [error(envelope.command.type, 'GAMBLERS_FEET_DIE_ROLL_INVALID', 'Enter a six-sided die result from 1 to 6.')];
      }
      const sourceCard = aggregate.cardInstances[resolution.sourceCardInstanceId];
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if ((actorRole !== 'hider' && actorRole !== 'host' && actorRole !== 'system') || !sourceCard ||
        (actorRole === 'hider' && !isCardAccessibleToActor(aggregate, sourceCard, envelope.actor.playerId, envelope.actor.role))) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only the hider who holds the curse may resolve its casting roll.')];
      }
      return [];
    }
    case 'roll_gamblers_feet_die':
    case 'report_gamblers_feet_steps': {
      const challenge = aggregate.gamblersFeetChallenge;
      const payload = envelope.command.payload;
      if (challenge?.sourceCardInstanceId !== payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'GAMBLERS_FEET_NOT_ACTIVE', 'There is no active Gambler’s Feet challenge.')];
      }
      if (Date.parse(envelope.occurredAt) >= Date.parse(challenge.expiresAt)) {
        return [error(envelope.command.type, 'GAMBLERS_FEET_EXPIRED', 'The Gambler’s Feet timer has expired.')];
      }
      const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
      const targetPlayerId = payload.targetPlayerId ?? envelope.actor.playerId;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      const refereeMaySetAnother = actorRole === 'host' || actorRole === 'system';
      if (!targetPlayerId || !seekerTeam?.memberPlayerIds.includes(targetPlayerId) ||
        (!refereeMaySetAnother && (actorRole !== 'seeker' || targetPlayerId !== envelope.actor.playerId))) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Each seeker reports their own die rolls and steps from their seeker account.')];
      }
      const playerState = challenge.statusByPlayerId[targetPlayerId] ?? { stepsRemaining: 0, unaccountedSteps: 0, updatedAt: envelope.occurredAt };
      if (envelope.command.type === 'roll_gamblers_feet_die') {
        const rollPayload = envelope.command.payload as { dieRoll: number };
        if (!Number.isInteger(rollPayload.dieRoll) || rollPayload.dieRoll < 1 || rollPayload.dieRoll > 6) {
          return [error(envelope.command.type, 'GAMBLERS_FEET_DIE_ROLL_INVALID', 'Enter a six-sided die result from 1 to 6.')];
        }
        return [];
      }
      const stepsPayload = envelope.command.payload as { stepsTaken: number; overstep?: 'accidental' | 'safety' };
      if (!Number.isInteger(stepsPayload.stepsTaken) || stepsPayload.stepsTaken < 1 || stepsPayload.stepsTaken > 10000) {
        return [error(envelope.command.type, 'GAMBLERS_FEET_STEPS_INVALID', 'Enter a whole number of steps from 1 to 10,000.')];
      }
      if (playerState.unaccountedSteps > 0) {
        return [error(envelope.command.type, 'GAMBLERS_FEET_RECONCILIATION_REQUIRED', `Roll again to account for the ${playerState.unaccountedSteps} unaccounted step${playerState.unaccountedSteps === 1 ? '' : 's'} before walking.`)];
      }
      if (stepsPayload.stepsTaken > playerState.stepsRemaining && stepsPayload.overstep !== 'accidental' && stepsPayload.overstep !== 'safety') {
        return [error(envelope.command.type, 'GAMBLERS_FEET_STEP_LIMIT_EXCEEDED', 'You may only report steps covered by your die roll. Mark an accidental overstep or safety exception if one occurred.')];
      }
      return [];
    }
    case 'report_right_turn_route_choice': {
      const challenge = aggregate.rightTurnChallenge;
      const payload = envelope.command.payload;
      if (challenge?.sourceCardInstanceId !== payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'RIGHT_TURN_NOT_ACTIVE', 'There is no active Right Turn challenge.')];
      }
      if (Date.parse(envelope.occurredAt) >= Date.parse(challenge.expiresAt)) {
        return [error(envelope.command.type, 'RIGHT_TURN_EXPIRED', 'The Right Turn timer has expired.')];
      }
      if (!['right', 'straight', 'left', 'u_turn', 'no_intersection'].includes(payload.choice) || typeof payload.atStreetIntersection !== 'boolean') {
        return [error(envelope.command.type, 'RIGHT_TURN_REPORT_INVALID', 'Record the turn taken and whether it was at a street intersection.')];
      }
      if ((payload.choice === 'no_intersection' && payload.atStreetIntersection) ||
        (payload.choice !== 'no_intersection' && payload.choice !== 'u_turn' && !payload.atStreetIntersection)) {
        return [error(envelope.command.type, 'RIGHT_TURN_CONTEXT_MISMATCH', 'Confirm a street intersection for turn reports; choose “no street intersection” only when none was encountered.')];
      }
      if (payload.deadEndDistanceMeters !== undefined && (!Number.isFinite(payload.deadEndDistanceMeters) || payload.deadEndDistanceMeters < 0 || payload.deadEndDistanceMeters > 100_000)) {
        return [error(envelope.command.type, 'RIGHT_TURN_DISTANCE_INVALID', 'Enter a valid distance from 0 to 100,000 meters.')];
      }
      if (payload.choice === 'u_turn' && (payload.deadEndDistanceMeters ?? 0) < challenge.deadEndDistanceMeters) {
        return [error(envelope.command.type, 'RIGHT_TURN_DEAD_END_NOT_REACHED', `A U-turn is allowed only after a dead end with no forward or right turn for ${challenge.deadEndDistanceMeters} meters.`)];
      }
      const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
      const targetPlayerId = payload.targetPlayerId ?? envelope.actor.playerId;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      const refereeMaySetAnother = actorRole === 'host' || actorRole === 'system';
      if (!targetPlayerId || !seekerTeam?.memberPlayerIds.includes(targetPlayerId) ||
        (!refereeMaySetAnother && (actorRole !== 'seeker' || targetPlayerId !== envelope.actor.playerId))) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Each seeker reports their own route choices; a host referee may record a player report.')];
      }
      return [];
    }
    case 'confirm_egg_partner_acquired': {
      const challenge = aggregate.eggPartnerChallenge;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'EGG_PARTNER_NOT_ACTIVE', 'There is no active Egg Partner challenge.')];
      }
      if (challenge.eggAcquiredAt) {
        return [error(envelope.command.type, 'EGG_PARTNER_ALREADY_ACQUIRED', 'The egg has already been acquired.')];
      }
      if (actorRole !== 'seeker' && actorRole !== 'host' && actorRole !== 'system') {
        return [error(envelope.command.type, 'FORBIDDEN', 'Only a seeker or the host referee can confirm acquiring the egg.')];
      }
      return [];
    }
    case 'report_egg_partner_member_lost': {
      const challenge = aggregate.eggPartnerChallenge;
      const { sourceCardInstanceId, memberId, lossKind } = envelope.command.payload;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
      const isEgg = memberId === 'egg-partner:egg';
      const memberExists = isEgg || Boolean(seekerTeam?.memberPlayerIds.includes(memberId));
      const refereeMayReportAny = actorRole === 'host' || actorRole === 'system';
      if (challenge?.sourceCardInstanceId !== sourceCardInstanceId) {
        return [error(envelope.command.type, 'EGG_PARTNER_NOT_ACTIVE', 'There is no active Egg Partner challenge.')];
      }
      if (!memberExists || (actorRole !== 'seeker' && !refereeMayReportAny) ||
        (actorRole === 'seeker' && !isEgg && memberId !== envelope.actor.playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'A seeker can report the egg or their own loss; the host referee can report any seeker.')];
      }
      if (isEgg && !challenge.eggAcquiredAt) {
        return [error(envelope.command.type, 'EGG_PARTNER_NOT_ACQUIRED', 'Acquire the egg before reporting that it was abandoned or cracked.')];
      }
      if (!isEgg && lossKind !== 'abandoned') {
        return [error(envelope.command.type, 'EGG_PARTNER_LOSS_KIND_INVALID', 'A seeker can only be marked as abandoned; cracking applies to the egg.')];
      }
      if (challenge.statusByMemberId[memberId]?.lossKind) {
        return [error(envelope.command.type, 'EGG_PARTNER_MEMBER_ALREADY_LOST', 'This team member was already reported lost.')];
      }
      return [];
    }
    case 'report_jammed_door_roll': {
      const challenge = aggregate.jammedDoorChallenge;
      const payload = envelope.command.payload;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
      const targetPlayerId = payload.targetPlayerId ?? envelope.actor.playerId;
      const refereeMayReportForOthers = actorRole === 'host' || actorRole === 'system';
      if (challenge?.sourceCardInstanceId !== payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'JAMMED_DOOR_NOT_ACTIVE', 'There is no active Jammed Door challenge.')];
      }
      if (Date.parse(envelope.occurredAt) >= Date.parse(challenge.expiresAt)) {
        return [error(envelope.command.type, 'JAMMED_DOOR_EXPIRED', 'The Jammed Door curse timer has expired.')];
      }
      if (!targetPlayerId || !seekerTeam?.memberPlayerIds.includes(targetPlayerId) ||
        (!refereeMayReportForOthers && (actorRole !== 'seeker' || targetPlayerId !== envelope.actor.playerId))) {
        return [error(envelope.command.type, 'FORBIDDEN', 'A seeker reports their own doorway roll; the host referee may record a roll for any seeker.')];
      }
      if (payload.doorwayVisible !== true) {
        return [error(envelope.command.type, 'JAMMED_DOOR_NOT_VISIBLE', 'Roll only after the doorway is visible to the seekers.')];
      }
      if (typeof payload.doorwayId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.doorwayId) ||
        typeof payload.doorwayLabel !== 'string' || payload.doorwayLabel.trim().length < 3 || payload.doorwayLabel.trim().length > 120) {
        return [error(envelope.command.type, 'JAMMED_DOOR_ID_INVALID', 'Give the visible doorway a short, stable name so the team can share its result.')];
      }
      if (![payload.dieOne, payload.dieTwo].every((value) => Number.isInteger(value) && value >= 1 && value <= 6)) {
        return [error(envelope.command.type, 'JAMMED_DOOR_DICE_INVALID', 'Both dice must show a whole number from 1 to 6.')];
      }
      const prior = challenge.statusByDoorwayId[payload.doorwayId];
      if (prior?.passedAt) {
        return [error(envelope.command.type, 'JAMMED_DOOR_ALREADY_PASSED', 'The seeker team has already passed through this doorway.')];
      }
      if (prior?.retryAt && Date.parse(envelope.occurredAt) < Date.parse(prior.retryAt)) {
        return [error(envelope.command.type, 'JAMMED_DOOR_COOLDOWN', 'This doorway cannot be retried yet; wait for its displayed cooldown.')];
      }
      return [];
    }
    case 'report_zoologist_evidence': {
      const challenge = aggregate.zoologistChallenge;
      const playerId = envelope.actor.playerId;
      const actorRole = getPlayerRole(aggregate, playerId) ?? envelope.actor.role;
      const attachment = aggregate.attachments[envelope.command.payload.attachmentId];
      if (!challenge || challenge.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'ZOOLOGIST_NOT_ACTIVE', 'There is no active Zoologist evidence challenge.')];
      }
      if (!playerId || actorRole !== 'seeker' || !challenge.requiredSeekerPlayerIds.includes(playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'Each seeker must submit matching photo evidence from their own player account.')];
      }
      if (challenge.attachmentIdBySeekerPlayerId[playerId]) {
        return [error(envelope.command.type, 'ZOOLOGIST_EVIDENCE_ALREADY_REPORTED', 'You have already submitted your photo for this Zoologist challenge.')];
      }
      if (!attachment || attachment.kind !== 'photo_evidence' ||
        attachment.linkedCardInstanceId !== challenge.sourceCardInstanceId ||
        attachment.ownerPlayerId !== playerId || attachment.visibilityScope !== 'public_match' ||
        attachment.captureMetadata.pickerSource !== 'camera' ||
        Date.parse(attachment.createdAt) < Date.parse(challenge.activatedAt)) {
        return [error(envelope.command.type, 'ZOOLOGIST_PHOTO_REQUIRED', 'Take a new photo after the challenge starts, then record your public camera evidence for this card.')];
      }
      return [];
    }
    case 'report_luxury_car_candidate': {
      const challenge = aggregate.luxuryCarChallenge;
      const payload = envelope.command.payload;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      const attachment = aggregate.attachments[payload.attachmentId];
      const seekerTeam = Object.values(aggregate.teams).find((team) => team.side === 'seeker');
      if (!challenge || challenge.sourceCardInstanceId !== payload.sourceCardInstanceId) {
        return [error(envelope.command.type, 'LUXURY_CAR_NOT_ACTIVE', 'There is no active Luxury Car comparison.')];
      }
      if (challenge.candidate) {
        return [error(envelope.command.type, 'LUXURY_CAR_CANDIDATE_PENDING', 'The hider must accept or reject the current car before another can be submitted.')];
      }
      if (challenge.usedAttachmentIds.includes(payload.attachmentId)) {
        return [error(envelope.command.type, 'LUXURY_CAR_PHOTO_ALREADY_USED', 'Take a different car photo after the hider rejects an attempt.')];
      }
      if (!envelope.actor.playerId || actorRole !== 'seeker' || !seekerTeam?.memberPlayerIds.includes(envelope.actor.playerId)) {
        return [error(envelope.command.type, 'FORBIDDEN', 'A seeker must submit the candidate car from their own player account.')];
      }
      if (!attachment || attachment.kind !== 'photo_evidence' || attachment.linkedCardInstanceId !== challenge.sourceCardInstanceId ||
        attachment.ownerPlayerId !== envelope.actor.playerId || attachment.visibilityScope !== 'public_match' ||
        attachment.captureMetadata.pickerSource !== 'camera' || Date.parse(attachment.createdAt) < Date.parse(challenge.activatedAt)) {
        return [error(envelope.command.type, 'LUXURY_CAR_PHOTO_REQUIRED', 'Take and record a new public camera photo after the challenge starts.')];
      }
      if (typeof payload.carDescription !== 'string' || payload.carDescription.trim().length < 2 || payload.carDescription.trim().length > 120 ||
        !Number.isInteger(payload.productionYear) || payload.productionYear < 1886 || payload.productionYear > 2100 ||
        !Number.isSafeInteger(payload.msrpCents) || payload.msrpCents <= challenge.hiderMsrpCents) {
        return [error(envelope.command.type, 'LUXURY_CAR_PRICE_NOT_HIGHER', `Enter the photographed car and a production-year MSRP higher than ${challenge.currencyCode} ${(challenge.hiderMsrpCents / 100).toFixed(2)}.`)];
      }
      return [];
    }
    case 'decide_luxury_car_candidate': {
      const challenge = aggregate.luxuryCarChallenge;
      const actorRole = getPlayerRole(aggregate, envelope.actor.playerId) ?? envelope.actor.role;
      if (challenge?.sourceCardInstanceId !== envelope.command.payload.sourceCardInstanceId || !challenge.candidate) {
        return [error(envelope.command.type, 'LUXURY_CAR_CANDIDATE_REQUIRED', 'There is no seeker car awaiting the hider’s review.')];
      }
      if (actorRole !== 'hider' && actorRole !== 'host' && actorRole !== 'system') {
        return [error(envelope.command.type, 'FORBIDDEN', 'The hider or host referee must review the seeker’s car and MSRP.')];
      }
      if (typeof envelope.command.payload.accepted !== 'boolean') {
        return [error(envelope.command.type, 'LUXURY_CAR_DECISION_INVALID', 'Choose whether the seeker’s photographed car and MSRP are accepted.')];
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
