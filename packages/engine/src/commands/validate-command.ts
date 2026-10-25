import type {
  CardDefinition,
  CardInstanceModel,
  CommandEnvelope,
  CommandValidationError,
  ContentPack,
  DeckDefinition,
  MatchAggregate,
  QuestionFeatureDatasetModel
} from '../../../shared-types/src/index.ts';
import { circleWithinGeometry, distanceMeters, isPolygonBoundaryGeometry } from '../../../geo/src/index.ts';

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
        /cannot be played during the endgame/i.test(cardDefinition.description)
      ) {
        return [error(envelope.command.type, 'CARD_NOT_PLAYABLE_IN_ENDGAME', 'This curse cannot be played during the endgame.')];
      }

      const resolutionPlan = buildCardResolutionPlan(effectCardDefinition, aggregate.selectedScale);
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

      if (activeResolution.resolutionKind === 'hangman_challenge' &&
        !['solved', 'ended'].includes(activeResolution.hangman?.status ?? 'awaiting_word')) {
        return [error(envelope.command.type, 'HANGMAN_CHALLENGE_ACTIVE', activeResolution.hangman?.status === 'awaiting_word'
          ? 'Set the five-letter word and complete the Hangman challenge before closing this card.'
          : 'Finish the Hangman challenge before closing this card.')];
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
    case 'resume_match':
      return [];
    case 'archive_match':
      return [];
    default:
      return [];
  }
}
