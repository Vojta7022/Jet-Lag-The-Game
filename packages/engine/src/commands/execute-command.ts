import { createRandomUuid } from '../../../shared-types/src/index.ts';

import type {
  AttachmentModel,
  CardDefinition,
  CardInstanceModel,
  ChatMessageModel,
  CommandEnvelope,
  ContentPack,
  DomainEventEnvelope,
  LocationSampleModel,
  MatchAggregate,
  QuestionInstanceModel,
  QuestionFeatureDatasetModel,
  RoleAssignmentModel,
  TeamModel,
  TimerModel
} from '../../../shared-types/src/index.ts';
import {
  materializeConstraintRecord,
  resolveQuestionConstraint,
  distanceMeters
} from '../../../geo/src/index.ts';

import { buildCardResolutionPlan, getPlayerRole, getPlayerTeam } from '../../../domain/src/index.ts';
import { getChatChannel } from '../../../domain/src/index.ts';
import {
  getCardDefinition,
  getConstraintDefinition,
  getHidePhaseDurationSeconds,
  getHidingZoneRadiusMeters,
  getQuestionCategory,
  getQuestionCooldownSeconds,
  getQuestionTimerSeconds,
  getQuestionTemplate,
  getRuleset
} from '../helpers/content-pack.ts';
import { reduceMatchAggregate } from '../reducer.ts';
import { validateCommandEnvelope } from './validate-command.ts';
import { resolveAutomaticQuestionAnswer } from '../questions/automatic-question-answer.ts';

export class EngineCommandError extends Error {
  readonly issues: ReturnType<typeof validateCommandEnvelope>;

  constructor(message: string, issues: ReturnType<typeof validateCommandEnvelope>) {
    super(message);
    this.issues = issues;
  }
}

export interface ExecuteCommandResult {
  aggregate: MatchAggregate;
  events: DomainEventEnvelope[];
}

function nextSequence(aggregate: MatchAggregate | undefined, index: number): number {
  return (aggregate?.revision ?? 0) + index + 1;
}

function makeEventEnvelope(
  aggregate: MatchAggregate | undefined,
  envelope: CommandEnvelope,
  index: number,
  visibilityScope: DomainEventEnvelope['visibilityScope'],
  event: DomainEventEnvelope['event']
): DomainEventEnvelope {
  return {
    eventId: createRandomUuid(),
    matchId: envelope.matchId,
    sequence: nextSequence(aggregate, index),
    occurredAt: envelope.occurredAt,
    actor: envelope.actor,
    visibilityScope,
    event
  };
}

function buildDefaultTeams(): TeamModel[] {
  return [
    {
      teamId: 'team-hider',
      side: 'hider',
      name: 'Hider Team',
      memberPlayerIds: [],
      sharedHand: true
    },
    {
      teamId: 'team-seeker',
      side: 'seeker',
      name: 'Seeker Team',
      memberPlayerIds: [],
      sharedHand: true
    }
  ];
}

function shuffleValues<T>(values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex]!, values[index]!];
  }
  return values;
}

function buildRoundRoles(aggregate: MatchAggregate, hiderPlayerId: string) {
  const roleAssignments = Object.values(aggregate.roleAssignments).map((assignment) => {
    if (assignment.role !== 'hider' && assignment.role !== 'seeker') {
      return assignment;
    }
    const isHider = assignment.playerId === hiderPlayerId;
    return {
      ...assignment,
      role: isHider ? 'hider' as const : 'seeker' as const,
      teamId: isHider ? 'team-hider' : 'team-seeker'
    };
  });
  const teamDefinitions = {
    ...aggregate.teams,
    ...Object.fromEntries(buildDefaultTeams().map((team) => [team.teamId, team]))
  };
  const teams = Object.values(teamDefinitions).map((team) => ({
    ...team,
    memberPlayerIds: roleAssignments
      .filter((assignment) => assignment.teamId === team.teamId)
      .map((assignment) => assignment.playerId)
  }));
  return { roleAssignments, teams };
}

function buildRoleAssignment(playerId: string, role: RoleAssignmentModel['role'], teamId?: string): RoleAssignmentModel {
  return {
    playerId,
    role,
    teamId
  };
}

function buildInitialCardInstances(
  contentPack: ContentPack,
  occurredAt: string
): CardInstanceModel[] {
  const cardInstances: CardInstanceModel[] = [];

  for (const deck of contentPack.decks) {
    for (const entry of deck.entries) {
      const cardDefinition = getCardDefinition(contentPack, entry.cardDefinitionId);
      if (!cardDefinition) {
        continue;
      }

      for (let index = 0; index < entry.quantity; index += 1) {
        cardInstances.push({
          cardInstanceId: `${deck.deckId}:${entry.cardDefinitionId}:${String(index + 1).padStart(3, '0')}`,
          cardDefinitionId: entry.cardDefinitionId,
          holderType: 'deck',
          holderId: deck.deckId,
          zone: 'draw_pile',
          visibilityPolicy: cardDefinition.visibilityPolicy,
          createdAt: occurredAt,
          updatedAt: occurredAt
        });
      }
    }
  }

  return cardInstances;
}

function findTopCardInDeck(aggregate: MatchAggregate, deckId: string): CardInstanceModel | undefined {
  return Object.values(aggregate.cardInstances)
    .filter((card) => card.holderType === 'deck' && card.holderId === deckId && card.zone === 'draw_pile')
    .sort((left, right) =>
      (left.drawOrder ?? Number.MAX_SAFE_INTEGER) - (right.drawOrder ?? Number.MAX_SAFE_INTEGER) ||
      left.cardInstanceId.localeCompare(right.cardInstanceId)
    )[0];
}

function findTopCardsInDeck(aggregate: MatchAggregate, deckId: string, count: number): CardInstanceModel[] {
  return Object.values(aggregate.cardInstances)
    .filter((card) => card.holderType === 'deck' && card.holderId === deckId && card.zone === 'draw_pile')
    .sort((left, right) =>
      (left.drawOrder ?? Number.MAX_SAFE_INTEGER) - (right.drawOrder ?? Number.MAX_SAFE_INTEGER) ||
      left.cardInstanceId.localeCompare(right.cardInstanceId)
    )
    .slice(0, count);
}

function shuffleAndResetCards(
  aggregate: MatchAggregate,
  contentPack: ContentPack,
  occurredAt: string
): CardInstanceModel[] {
  const definitionsById = new Map(contentPack.cards.map((card) => [card.cardDefinitionId, card]));
  return contentPack.decks.flatMap((deck) => {
    const cards = Object.values(aggregate.cardInstances)
      .filter((instance) => definitionsById.get(instance.cardDefinitionId)?.deckId === deck.deckId)
      .map((instance) => ({
        ...instance,
        holderType: 'deck' as const,
        holderId: deck.deckId,
        zone: 'draw_pile' as const,
        updatedAt: occurredAt
      }));

    shuffleValues(cards);

    return cards.map((card, drawOrder) => ({ ...card, drawOrder }));
  });
}

function buildCooldownTimer(aggregate: MatchAggregate, contentPack: ContentPack, templateId: string, occurredAt: string): TimerModel {
  const durationSeconds = getQuestionCooldownSeconds(contentPack, aggregate.selectedRulesetId, templateId);
  return {
    timerId: `cooldown:${createRandomUuid()}`,
    kind: 'cooldown',
    status: 'running',
    durationSeconds,
    remainingSeconds: durationSeconds,
    startedAt: occurredAt
  };
}

function buildHideTimer(
  contentPack: ContentPack,
  rulesetId: string | undefined,
  selectedScale: MatchAggregate['selectedScale'],
  occurredAt: string
): TimerModel {
  const durationSeconds = getHidePhaseDurationSeconds(contentPack, rulesetId, selectedScale);
  return {
    timerId: 'hide-phase',
    kind: 'hide',
    status: 'running',
    durationSeconds,
    remainingSeconds: durationSeconds,
    startedAt: occurredAt
  };
}

function pauseTimerAt(timer: TimerModel, occurredAt: string): TimerModel {
  const startedAtMs = Date.parse(timer.startedAt);
  const nowMs = Date.parse(occurredAt);
  const elapsedSeconds = timer.status === 'running' && Number.isFinite(startedAtMs) && Number.isFinite(nowMs)
    ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
    : 0;
  return {
    ...timer,
    status: 'paused',
    pausedAt: occurredAt,
    remainingSeconds: timer.status === 'running'
      ? Math.max(0, timer.durationSeconds - elapsedSeconds)
      : timer.remainingSeconds
  };
}

function resumeTimerAt(timer: TimerModel, occurredAt: string): TimerModel {
  const elapsedSeconds = Math.max(0, timer.durationSeconds - timer.remainingSeconds);
  const resumedAtMs = Date.parse(occurredAt);
  const startedAt = Number.isFinite(resumedAtMs)
    ? new Date(resumedAtMs - elapsedSeconds * 1000).toISOString()
    : timer.startedAt;
  return {
    ...timer,
    status: 'running',
    startedAt,
    pausedAt: undefined
  };
}

function buildQuestionTimer(
  aggregate: MatchAggregate,
  contentPack: ContentPack,
  questionInstanceId: string,
  templateId: string,
  occurredAt: string
): TimerModel {
  const durationSeconds = getQuestionTimerSeconds(contentPack, templateId, aggregate.selectedScale);
  return {
    timerId: `question:${questionInstanceId}`,
    kind: 'question',
    status: 'running',
    durationSeconds,
    remainingSeconds: durationSeconds,
    startedAt: occurredAt,
    ownerRef: questionInstanceId
  };
}

function getDeckDefinition(contentPack: ContentPack, deckId: string) {
  return contentPack.decks.find((deck) => deck.deckId === deckId);
}

function resolveDeckHolderForDefinition(
  aggregate: MatchAggregate,
  contentPack: ContentPack,
  deckId: string,
  playerId: string | undefined,
  _actorRole: CommandEnvelope['actor']['role']
): { holderType: CardInstanceModel['holderType']; holderId: string } {
  const deck = getDeckDefinition(contentPack, deckId);
  const hiderTeamId = Object.values(aggregate.teams).find((team) => team.side === 'hider')?.teamId ?? 'team-hider';
  const seekerTeamId = Object.values(aggregate.teams).find((team) => team.side === 'seeker')?.teamId ?? 'team-seeker';
  const team = getPlayerTeam(aggregate, playerId);

  switch (deck?.ownerScope) {
    case 'hider_team':
      return { holderType: 'team', holderId: hiderTeamId };
    case 'seeker_team':
      return { holderType: 'team', holderId: seekerTeamId };
    case 'shared_public':
      return team?.teamId
        ? { holderType: 'team', holderId: team.teamId }
        : { holderType: 'player', holderId: playerId ?? aggregate.createdByPlayerId };
    case 'hider_player':
    case 'seeker_player':
    case 'host_only':
    default:
      return { holderType: 'player', holderId: playerId ?? aggregate.createdByPlayerId };
  }
}

function buildLocationSample(
  aggregate: MatchAggregate,
  envelope: CommandEnvelope<Extract<CommandEnvelope['command'], { type: 'update_location' }>>
): LocationSampleModel {
  const playerId = envelope.actor.playerId ?? envelope.actor.actorId;
  const role = getPlayerRole(aggregate, playerId) ?? envelope.actor.role;
  const team = getPlayerTeam(aggregate, playerId);

  return {
    sampleId: `location:${createRandomUuid()}`,
    playerId,
    role,
    teamId: team?.teamId,
    latitude: envelope.command.payload.latitude,
    longitude: envelope.command.payload.longitude,
    accuracyMeters: envelope.command.payload.accuracyMeters,
    source: envelope.command.payload.source ?? 'device',
    onTransit: envelope.command.payload.onTransit,
    recordedAt: envelope.occurredAt
  };
}

function elapsedUnpausedSeconds(aggregate: MatchAggregate, startedAt: string, endedAt: string): number {
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(endedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  const pausedIntervals: Array<[number, number]> = [];
  let pausedAtMs: number | undefined;
  const openMoveWindows = new Map<string, number>();
  for (const entry of [...aggregate.eventLog].sort((left, right) => left.sequence - right.sequence)) {
    const occurredAtMs = Date.parse(entry.occurredAt);
    if (!Number.isFinite(occurredAtMs)) continue;
    if (entry.type === 'card_resolution_opened' && entry.resolutionKind === 'move' && entry.sourceCardInstanceId) {
      openMoveWindows.set(entry.sourceCardInstanceId, occurredAtMs);
    } else if (entry.type === 'card_resolution_closed' && entry.sourceCardInstanceId) {
      const moveStartedAt = openMoveWindows.get(entry.sourceCardInstanceId);
      if (moveStartedAt !== undefined) {
        pausedIntervals.push([moveStartedAt, occurredAtMs]);
        openMoveWindows.delete(entry.sourceCardInstanceId);
      }
    }
    if (!Number.isFinite(occurredAtMs) || occurredAtMs <= startMs || occurredAtMs >= endMs) continue;
    if (entry.type === 'match_paused' && pausedAtMs === undefined) {
      pausedAtMs = occurredAtMs;
    } else if (entry.type === 'match_resumed' && pausedAtMs !== undefined) {
      pausedIntervals.push([pausedAtMs, occurredAtMs]);
      pausedAtMs = undefined;
    }
  }
  if (pausedAtMs !== undefined) pausedIntervals.push([pausedAtMs, endMs]);
  for (const moveStartedAt of openMoveWindows.values()) pausedIntervals.push([moveStartedAt, endMs]);
  for (const question of Object.values(aggregate.questionInstances)) {
    if (!question.lateResponseStartedAt) continue;
    const lateStartedAt = Date.parse(question.lateResponseStartedAt);
    const lateEndedAt = question.lateResponseEndedAt ? Date.parse(question.lateResponseEndedAt) : endMs;
    if (Number.isFinite(lateStartedAt) && Number.isFinite(lateEndedAt)) {
      pausedIntervals.push([lateStartedAt, Math.min(endMs, lateEndedAt)]);
    }
  }
  const clipped = pausedIntervals
    .map(([from, to]) => [Math.max(startMs, from), Math.min(endMs, to)] as [number, number])
    .filter(([from, to]) => to > from)
    .sort((left, right) => left[0] - right[0]);
  let pausedMs = 0;
  let mergedFrom: number | undefined;
  let mergedTo: number | undefined;
  for (const [from, to] of clipped) {
    if (mergedFrom === undefined || mergedTo === undefined || from > mergedTo) {
      if (mergedFrom !== undefined && mergedTo !== undefined) pausedMs += mergedTo - mergedFrom;
      mergedFrom = from;
      mergedTo = to;
    } else {
      mergedTo = Math.max(mergedTo, to);
    }
  }
  if (mergedFrom !== undefined && mergedTo !== undefined) pausedMs += mergedTo - mergedFrom;
  const elapsedMs = endMs - startMs - pausedMs;
  return Math.floor(elapsedMs / 1000);
}

function buildChatMessage(
  aggregate: MatchAggregate,
  envelope: CommandEnvelope<Extract<CommandEnvelope['command'], { type: 'send_chat_message' }>>
): ChatMessageModel {
  const senderPlayerId = envelope.actor.playerId;
  const senderTeam = getPlayerTeam(aggregate, senderPlayerId);
  const channel = getChatChannel(aggregate, envelope.command.payload.channelId);
  const senderDisplayName =
    (senderPlayerId ? aggregate.players[senderPlayerId]?.displayName : undefined) ??
    senderPlayerId ??
    envelope.actor.actorId;

  return {
    messageId: envelope.command.payload.messageId,
    channelId: envelope.command.payload.channelId,
    senderPlayerId,
    senderDisplayName,
    senderRole: getPlayerRole(aggregate, senderPlayerId) ?? envelope.actor.role,
    body: envelope.command.payload.body?.trim() ?? '',
    attachmentIds: envelope.command.payload.attachmentIds ?? [],
    visibilityScope: channel?.visibilityScope ?? 'public_match',
    teamId: channel?.teamId ?? senderTeam?.teamId,
    sentAt: envelope.occurredAt
  };
}

function buildAttachmentPlaceholder(
  aggregate: MatchAggregate,
  envelope: CommandEnvelope<Extract<CommandEnvelope['command'], { type: 'upload_attachment' }>>
): AttachmentModel {
  const ownerTeam = getPlayerTeam(aggregate, envelope.actor.playerId);
  const channel = getChatChannel(aggregate, envelope.command.payload.channelId);

  return {
    attachmentId: envelope.command.payload.attachmentId,
    kind: envelope.command.payload.kind,
    status: 'placeholder_pending',
    label: envelope.command.payload.label.trim(),
    mimeType: envelope.command.payload.mimeType,
    visibilityScope: envelope.command.payload.visibilityScope,
    ownerPlayerId: envelope.actor.playerId,
    ownerTeamId: channel?.teamId ?? ownerTeam?.teamId,
    channelId: envelope.command.payload.channelId,
    linkedQuestionInstanceId: envelope.command.payload.questionInstanceId,
    linkedCardInstanceId: envelope.command.payload.cardInstanceId,
    note: envelope.command.payload.note?.trim(),
    captureMetadata: envelope.command.payload.captureMetadata ?? {},
    createdAt: envelope.occurredAt
  };
}

function buildConstraintAppliedEvent(args: {
  aggregate: MatchAggregate;
  envelope: CommandEnvelope;
  contentPack: ContentPack;
  question: QuestionInstanceModel;
  constraintId: string;
  metadata: Record<string, unknown>;
  index: number;
  openCardResolution?: boolean;
}): DomainEventEnvelope {
  const { aggregate, envelope, contentPack, question, constraintId, metadata, index } = args;
  const template = getQuestionTemplate(contentPack, question.templateId)!;
  const category = getQuestionCategory(contentPack, template.categoryId)!;
  const constraintDefinition = getConstraintDefinition(contentPack, constraintId)!;
  const constraintRecordId = `constraint:${createRandomUuid()}`;
  const resolvedConstraint = resolveQuestionConstraint({
    aggregate,
    contentPack,
    question,
    category,
    template,
    constraint: constraintDefinition,
    createdAt: envelope.occurredAt,
    resolutionMetadata: metadata
  });
  const {
    featureData: _featureData,
    ...persistedRawMetadata
  } = metadata;
  const persistedDraft = {
    ...resolvedConstraint,
    metadata: resolvedConstraint.metadata
      ? Object.fromEntries(Object.entries(resolvedConstraint.metadata).filter(([key]) => key !== 'featureData'))
      : undefined
  };
  const constraintRecord = materializeConstraintRecord({
    searchArea: aggregate.searchArea!,
    region: aggregate.mapRegion!,
    constraintRecordId,
    constraintId,
    sourceQuestionInstanceId: question.questionInstanceId,
    createdAt: envelope.occurredAt,
    draft: persistedDraft,
    rawMetadata: persistedRawMetadata
  });
  const cooldownSeconds = getQuestionCooldownSeconds(
    contentPack,
    aggregate.selectedRulesetId,
    question.templateId
  );
  const cooldownTimer = args.openCardResolution || cooldownSeconds === 0
    ? undefined
    : buildCooldownTimer(aggregate, contentPack, question.templateId, envelope.occurredAt);

  return makeEventEnvelope(aggregate, envelope, index, 'public_match', {
    type: 'constraint_applied',
    payload: {
      questionInstanceId: question.questionInstanceId,
      constraintId,
      metadata: persistedRawMetadata,
      constraint: constraintRecord,
      lifecycleState: aggregate.lifecycleState,
      seekPhaseSubstate: args.openCardResolution
        ? 'awaiting_card_resolution'
        : cooldownTimer ? 'cooldown' : 'ready',
      cooldownTimer
    }
  });
}

function eventsForCommand(
  aggregate: MatchAggregate | undefined,
  envelope: CommandEnvelope,
  contentPack: ContentPack,
  questionFeatureDataset?: QuestionFeatureDatasetModel
): DomainEventEnvelope[] {
  switch (envelope.command.type) {
    case 'create_match': {
      const teams = buildDefaultTeams();
      const hostPlayer = {
        playerId: envelope.command.payload.hostPlayerId,
        displayName: envelope.command.payload.hostDisplayName,
        connectionState: 'connected' as const,
        joinedAt: envelope.occurredAt
      };
      const roleAssignments = [buildRoleAssignment(hostPlayer.playerId, 'host')];

      return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'match_created',
          payload: {
            match: {
              matchId: envelope.matchId,
              mode: envelope.command.payload.mode,
              contentPackId: envelope.command.payload.contentPackId,
              createdByPlayerId: hostPlayer.playerId,
              selectedScale: envelope.command.payload.initialScale
            },
            hostPlayer,
            teams,
            roleAssignments,
            cardInstances: buildInitialCardInstances(contentPack, envelope.occurredAt),
            lifecycleState: 'draft'
          }
        })
      ];
    }
    case 'join_match':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'player_joined',
          payload: {
            player: {
              playerId: envelope.command.payload.playerId,
              displayName: envelope.command.payload.displayName,
              connectionState: 'connected',
              joinedAt: envelope.occurredAt
            },
            lifecycleState: aggregate?.lifecycleState === 'draft' ? 'lobby' : aggregate!.lifecycleState
          }
        })
      ];
    case 'remove_match_player':
      return [makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
        type: 'player_removed',
        payload: {
          playerId: envelope.command.payload.playerId,
          lifecycleState: aggregate!.lifecycleState
        }
      })];
    case 'leave_match':
      return [makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
        type: 'player_removed',
        payload: {
          playerId: envelope.actor.playerId!,
          lifecycleState: aggregate!.lifecycleState
        }
      })];
    case 'import_content_pack':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'content_import_started',
          payload: {
            ...envelope.command.payload,
            lifecycleState: 'content_import'
          }
        })
      ];
    case 'publish_content_pack':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'content_pack_published',
          payload: {
            ...envelope.command.payload,
            lifecycleState: 'lobby'
          }
        })
      ];
    case 'assign_role': {
      const targetRole = envelope.command.payload.role;
      const teamId =
        envelope.command.payload.teamId ??
        (targetRole === 'hider' ? 'team-hider' : targetRole === 'seeker' ? 'team-seeker' : undefined);
      const team =
        (teamId ? aggregate?.teams[teamId] : undefined) ??
        (teamId === 'team-hider'
          ? {
              teamId,
              side: 'hider',
              name: 'Hider Team',
              memberPlayerIds: [],
              sharedHand: true
            }
          : {
              teamId: teamId ?? 'spectator-team',
              side: 'seeker',
              name: 'Seeker Team',
              memberPlayerIds: [],
              sharedHand: true
            });

      return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'role_assigned',
          payload: {
            ...envelope.command.payload,
            roleAssignment: {
              playerId: envelope.command.payload.targetPlayerId,
              role: envelope.command.payload.role,
              teamId
            },
            team,
            lifecycleState: 'role_assignment'
          }
        })
      ];
    }
    case 'confirm_roles':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'roles_confirmed',
          payload: {
            lifecycleState: 'rules_confirmation'
          }
        })
      ];
    case 'set_ruleset':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'ruleset_selected',
          payload: {
            ...envelope.command.payload,
            lifecycleState: 'rules_confirmation'
          }
        })
      ];
    case 'confirm_rules':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'rules_confirmed',
          payload: {
            lifecycleState: 'map_setup'
          }
        })
      ];
    case 'create_map_region':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'map_region_created',
          payload: {
            ...envelope.command.payload,
            lifecycleState: 'map_setup'
          }
        })
      ];
    case 'start_match':
      {
        const hiderRotationOrder = shuffleValues(Object.values(aggregate!.roleAssignments)
          .filter((assignment) => assignment.role === 'hider' || assignment.role === 'seeker')
          .map((assignment) => assignment.playerId)
          .sort((left, right) => left.localeCompare(right)));
        const initialHiderPlayerId = hiderRotationOrder[0];
        const initialRoles = initialHiderPlayerId
          ? buildRoundRoles(aggregate!, initialHiderPlayerId)
          : { roleAssignments: Object.values(aggregate!.roleAssignments), teams: Object.values(aggregate!.teams) };
        return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'match_started',
          payload: {
            lifecycleState: 'hide_phase',
            timer: buildHideTimer(
              contentPack,
              aggregate?.selectedRulesetId,
              aggregate?.selectedScale,
              envelope.occurredAt
            ),
            roleAssignments: initialRoles.roleAssignments,
            teams: initialRoles.teams,
            hiderRotationOrder,
            cardInstances: shuffleAndResetCards(aggregate!, contentPack, envelope.occurredAt)
          }
        })
      ];
      }
    case 'start_next_round': {
      const nextHiderPlayerId = envelope.command.payload.nextHiderPlayerId;
      const hiderRotationOrder = aggregate!.hiderRotationOrder ?? [
        ...Object.values(aggregate!.roleAssignments)
          .filter((assignment) => assignment.role === 'hider')
          .map((assignment) => assignment.playerId),
        ...Object.values(aggregate!.roleAssignments)
          .filter((assignment) => assignment.role === 'seeker')
          .map((assignment) => assignment.playerId)
          .sort((left, right) => left.localeCompare(right))
      ];
      const { roleAssignments, teams } = buildRoundRoles(aggregate!, nextHiderPlayerId);
      const roundStartLocation = aggregate!.roundResults?.at(-1)?.finalHidingSpot;

      return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'round_started',
          payload: {
            nextHiderPlayerId,
            lifecycleState: 'hide_phase',
            timer: {
              ...buildHideTimer(contentPack, aggregate!.selectedRulesetId, aggregate!.selectedScale, envelope.occurredAt),
              timerId: `hide-phase:round:${(aggregate!.roundResults?.length ?? 0) + 1}`
            },
            cardInstances: shuffleAndResetCards(aggregate!, contentPack, envelope.occurredAt),
            roleAssignments,
            teams,
            hiderRotationOrder,
            roundStartLocation: roundStartLocation!
          }
        })
      ];
    }
    case 'lock_hider_location':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'hider_location_locked',
          payload: {
            ...envelope.command.payload,
            lockedByPlayerId: envelope.actor.playerId ?? envelope.actor.actorId
          }
        })
      ];
    case 'set_hiding_zone':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'hiding_zone_set',
          payload: {
            ...envelope.command.payload,
            radiusMeters: getHidingZoneRadiusMeters(contentPack, aggregate?.selectedRulesetId, aggregate?.selectedScale),
            selectedByPlayerId: envelope.actor.playerId ?? envelope.actor.actorId
          }
        })
      ];
    case 'set_final_hiding_spot':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'final_hiding_spot_set',
          payload: {
            latitude: envelope.command.payload.latitude,
            longitude: envelope.command.payload.longitude,
            selectedByPlayerId: envelope.actor.playerId ?? envelope.actor.actorId
          }
        })
      ];
    case 'update_location': {
      const locationSample = buildLocationSample(aggregate!, envelope as typeof envelope & {
        command: { type: 'update_location'; payload: { latitude: number; longitude: number; accuracyMeters?: number; source?: 'device' | 'manual' | 'system'; } };
      });

      const events = [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'location_updated',
          payload: {
            ...envelope.command.payload,
            playerId: locationSample.playerId,
            role: locationSample.role,
            teamId: locationSample.teamId
          }
        })
      ];
      const ruleset = getRuleset(contentPack, aggregate?.selectedRulesetId);
      const zone = aggregate?.hiddenState.hidingZone;
      const isSeeker = locationSample.role === 'seeker' || envelope.actor.role === 'host';
      const isInsideZone = Boolean(zone && distanceMeters(
        [locationSample.longitude, locationSample.latitude],
        [zone.longitude, zone.latitude]
      ) <= zone.radiusMeters);
      if (
        aggregate?.lifecycleState === 'seek_phase' &&
        isSeeker &&
        envelope.command.payload.onTransit === false &&
        ruleset?.locationPolicies?.endgameRequiresOffTransit === true &&
        isInsideZone &&
        aggregate.hiddenState.finalHidingSpot
      ) {
        events.push(makeEventEnvelope(aggregate, envelope, 1, 'public_match', {
          type: 'endgame_started',
          payload: {
            triggeredByPlayerId: locationSample.playerId
          }
        }));
      }
      return events;
    }
    case 'end_hide_phase':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'hide_phase_ended',
          payload: {
            lifecycleState: 'seek_phase',
            seekPhaseSubstate: 'ready'
          }
        })
      ];
    case 'confirm_hider_found': {
      const hiderTeam = Object.values(aggregate!.teams).find((team) => team.side === 'hider');
      const hideTimer = Object.values(aggregate!.timers).find((timer) => timer.kind === 'hide');
      const matchStartedAt = aggregate!.eventLog.find((entry) => entry.type === 'match_started')?.occurredAt;
      const survivalSeconds = elapsedUnpausedSeconds(
        aggregate!,
        matchStartedAt ?? hideTimer?.startedAt ?? envelope.occurredAt,
        envelope.occurredAt
      );
      const hiderTeamId = hiderTeam?.teamId ?? 'team-hider';
      const heldHiderCards = Object.values(aggregate!.cardInstances).filter(
        (card) => card.zone === 'hand' && card.holderType === 'team' && card.holderId === hiderTeamId
      );
      const heldTimeBonuses = heldHiderCards.flatMap((card) => {
        const definition = getCardDefinition(contentPack, card.cardDefinitionId);
        if (!definition || definition.kind !== 'time_bonus') return [];
        return [buildCardResolutionPlan(definition, aggregate!.selectedScale).timeBonusMinutes ?? 0];
      });
      const duplicateCount = heldHiderCards.filter((card) => {
        const definition = getCardDefinition(contentPack, card.cardDefinitionId);
        return definition?.effects.some((effect) => effect.effectType === 'duplicate_card') ?? false;
      }).length;
      const heldBonusMinutes = heldTimeBonuses.reduce((total, minutes) => total + minutes, 0);
      const copiedBonusMinutes = duplicateCount > 0 ? Math.max(0, ...heldTimeBonuses) * duplicateCount : 0;
      const timeBonusSeconds = (heldBonusMinutes + copiedBonusMinutes) * 60;
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'hider_found',
          payload: {
            roundResult: {
              hiderTeamId,
              hiderPlayerId: hiderTeam?.memberPlayerIds[0],
              foundByPlayerId: envelope.actor.playerId ?? envelope.actor.actorId,
              foundAt: envelope.occurredAt,
              survivalSeconds,
              timeBonusSeconds,
              finalHidingTimeSeconds: survivalSeconds + timeBonusSeconds,
              finalHidingSpot: aggregate!.hiddenState.finalHidingSpot
                ? {
                    latitude: aggregate!.hiddenState.finalHidingSpot.latitude,
                    longitude: aggregate!.hiddenState.finalHidingSpot.longitude
                  }
                : undefined
            }
          }
        })
      ];
    }
    case 'begin_question_prompt':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'question_prompt_opened',
          payload: {
            lifecycleState: aggregate!.lifecycleState,
            seekPhaseSubstate: 'awaiting_question_selection'
          }
        })
      ];
    case 'expire_question_response': {
      const question = aggregate!.questionInstances[envelope.command.payload.questionInstanceId];
      const timer = Object.values(aggregate!.timers).find(
        (candidate) => candidate.kind === 'question' && candidate.ownerRef === question.questionInstanceId
      )!;
      return [makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
        type: 'question_response_expired',
        payload: {
          questionInstanceId: question.questionInstanceId,
          lateResponseStartedAt: new Date(Date.parse(timer.startedAt) + timer.durationSeconds * 1000).toISOString()
        }
      })];
    }
    case 'ask_question': {
      const template = getQuestionTemplate(contentPack, envelope.command.payload.templateId)!;
      const category = getQuestionCategory(contentPack, template.categoryId)!;
      const askedByPlayerId = envelope.actor.playerId ?? envelope.actor.actorId;
      const questionTimer = buildQuestionTimer(
        aggregate!,
        contentPack,
        envelope.command.payload.questionInstanceId,
        template.templateId,
        envelope.occurredAt
      );
      const question: QuestionInstanceModel = {
        questionInstanceId: envelope.command.payload.questionInstanceId,
        templateId: template.templateId,
        categoryId: template.categoryId,
        askedByPlayerId,
        targetTeamId: envelope.command.payload.targetTeamId,
        chosenDistanceMeters: envelope.command.payload.chosenDistanceMeters,
        status: 'awaiting_answer',
        askedAt: envelope.occurredAt
      };
      const automaticAnswer = resolveAutomaticQuestionAnswer({
        aggregate: aggregate!,
        contentPack,
        category,
        template,
        askedByPlayerId,
        targetTeamId: envelope.command.payload.targetTeamId,
        chosenDistanceMeters: envelope.command.payload.chosenDistanceMeters,
        occurredAt: envelope.occurredAt,
        questionFeatureDataset
      });
      const events: DomainEventEnvelope[] = [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'question_asked',
          payload: {
            ...envelope.command.payload,
            question,
            lifecycleState: aggregate!.lifecycleState,
            seekPhaseSubstate: 'awaiting_question_answer',
            questionTimer
          }
        })
      ];
      if (aggregate!.disabledQuestionCategoryId && aggregate!.disabledQuestionCategorySourceCardInstanceId) {
        const categories = contentPack.questionCategories;
        const nextCategory = categories[Math.floor(Math.random() * categories.length)];
        if (nextCategory) {
          events.push(makeEventEnvelope(aggregate, envelope, events.length, 'public_match', {
            type: 'question_category_disabled',
            payload: {
              categoryId: nextCategory.categoryId,
              sourceCardInstanceId: aggregate!.disabledQuestionCategorySourceCardInstanceId,
              reason: 'question_reroll'
            }
          }));
        }
      }
      if (automaticAnswer.kind !== 'resolved') return events;

      if (automaticAnswer.answer.value === null || !automaticAnswer.constraintId) {
        events.push(makeEventEnvelope(aggregate, envelope, events.length, 'public_match', {
          type: 'question_null_answer_resolved',
          payload: {
            questionInstanceId: question.questionInstanceId,
            answer: automaticAnswer.answer,
            automaticResolution: automaticAnswer.automaticResolution,
            lifecycleState: aggregate!.lifecycleState,
            seekPhaseSubstate: 'ready'
          }
        }));
        return events;
      }

      const answeredQuestion: QuestionInstanceModel = {
        ...question,
        status: 'applying_constraints',
        answer: automaticAnswer.answer,
        automaticResolution: automaticAnswer.automaticResolution
      };
      events.push(makeEventEnvelope(aggregate, envelope, events.length, 'public_match', {
        type: 'question_answered',
        payload: {
          questionInstanceId: question.questionInstanceId,
          answer: automaticAnswer.answer,
          automaticResolution: automaticAnswer.automaticResolution,
          lifecycleState: aggregate!.lifecycleState,
          seekPhaseSubstate: 'applying_constraints'
        }
      }));
      events.push(buildConstraintAppliedEvent({
        aggregate: aggregate!,
        envelope,
        contentPack,
        question: answeredQuestion,
        constraintId: automaticAnswer.constraintId,
        metadata: {
          automaticResolution: automaticAnswer.automaticResolution,
          ...(automaticAnswer.constraintMetadata ?? {})
        },
        index: events.length
      }));
      return events;
    }
    case 'answer_question': {
      const activeQuestion = aggregate!.questionInstances[envelope.command.payload.questionInstanceId];
      if (activeQuestion?.randomizedNullAnswerAllowed && envelope.command.payload.answer.value === null) {
        return [makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'question_null_answer_resolved',
          payload: {
            questionInstanceId: activeQuestion.questionInstanceId,
            answer: envelope.command.payload.answer,
            lifecycleState: aggregate!.lifecycleState,
            seekPhaseSubstate: 'ready'
          }
        })];
      }
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'question_answered',
          payload: {
            ...envelope.command.payload,
            lifecycleState: aggregate!.lifecycleState,
            seekPhaseSubstate: 'applying_constraints'
          }
        })
      ];
    }
    case 'apply_constraint': {
      const question = aggregate!.questionInstances[envelope.command.payload.questionInstanceId];
      return [buildConstraintAppliedEvent({
        aggregate: aggregate!,
        envelope,
        contentPack,
        question,
        constraintId: envelope.command.payload.constraintId,
        metadata: envelope.command.payload.metadata ?? {},
        index: 0,
        openCardResolution: envelope.command.payload.openCardResolution
      })];
    }
    case 'deal_question_reward': {
      const question = aggregate!.questionInstances[envelope.command.payload.questionInstanceId];
      const template = getQuestionTemplate(contentPack, question.templateId)!;
      const category = getQuestionCategory(contentPack, template.categoryId)!;
      const multiplier = Object.values(aggregate!.questionInstances).filter(
        (candidate) => candidate.templateId === question.templateId && (candidate.status === 'resolved' || candidate.status === 'vetoed')
      ).length;
      const deck = contentPack.decks.find((candidate) => candidate.ownerScope === 'hider_team')!;
      const holder = resolveDeckHolderForDefinition(aggregate!, contentPack, deck.deckId, envelope.actor.playerId, envelope.actor.role);
      const baseDrawCount = category.drawRule.drawCount;
      const basePickCount = category.drawRule.pickCount;
      const bonusDrawCount = envelope.command.payload.useQuestionRewardDrawBonus
        ? aggregate!.questionRewardDrawBonus?.extraDrawCount ?? 0
        : 0;
      const allCards = findTopCardsInDeck(aggregate!, deck.deckId, baseDrawCount * multiplier + bonusDrawCount);
      const cardInstances: CardInstanceModel[] = [];
      let cardOffset = 0;
      const sets = Array.from({ length: multiplier }, (_, setIndex) => {
        const setDrawCount = baseDrawCount + (setIndex === 0 ? bonusDrawCount : 0);
        const sourceCards = allCards.slice(cardOffset, cardOffset + setDrawCount);
        cardOffset += setDrawCount;
        const selected = sourceCards.map((source) => {
          const card = {
            ...source,
            holderType: holder.holderType,
            holderId: holder.holderId,
            zone: 'reward_selection' as const,
            updatedAt: envelope.occurredAt
          };
          cardInstances.push(card);
          return card.cardInstanceId;
        });
        return { setIndex, cardInstanceIds: selected, pickCount: basePickCount };
      });
      const pendingReward = {
        questionInstanceId: question.questionInstanceId,
        templateId: template.templateId,
        categoryId: category.categoryId,
        deckId: deck.deckId,
        holderType: holder.holderType,
        holderId: holder.holderId,
        bonusDrawCount: bonusDrawCount > 0 ? bonusDrawCount : undefined,
        sets,
        dealtAt: envelope.occurredAt
      };
      return [makeEventEnvelope(aggregate, envelope, 0, 'team_private', {
        type: 'question_reward_dealt',
        payload: { pendingReward, cardInstances }
      })];
    }
    case 'choose_question_reward': {
      const pending = aggregate!.pendingQuestionReward!;
      const selected = new Set(envelope.command.payload.selectedCardInstanceIdsBySet.flat());
      const cardInstances = pending.sets.flatMap((set) => set.cardInstanceIds).map((cardId) => {
        const card = aggregate!.cardInstances[cardId]!;
        return {
          ...card,
          zone: selected.has(cardId) ? 'hand' as const : 'discard_pile' as const,
          updatedAt: envelope.occurredAt
        };
      });
      return [makeEventEnvelope(aggregate, envelope, 0, 'team_private', {
        type: 'question_reward_chosen',
        payload: { questionInstanceId: pending.questionInstanceId, cardInstances }
      })];
    }
    case 'send_chat_message': {
      const message = buildChatMessage(aggregate!, envelope as typeof envelope & {
        command: { type: 'send_chat_message'; payload: { messageId: string; channelId: string; body?: string; attachmentIds?: string[] } };
      });

      return [
        makeEventEnvelope(aggregate, envelope, 0, message.visibilityScope, {
          type: 'chat_message_sent',
          payload: {
            ...envelope.command.payload,
            message
          }
        })
      ];
    }
    case 'upload_attachment': {
      const attachment = buildAttachmentPlaceholder(aggregate!, envelope as typeof envelope & {
        command: { type: 'upload_attachment'; payload: { attachmentId: string; kind: AttachmentModel['kind']; label: string; mimeType?: string; note?: string; visibilityScope: AttachmentModel['visibilityScope']; channelId?: string; questionInstanceId?: string; cardInstanceId?: string; captureMetadata?: Record<string, unknown>; } };
      });

      return [
        makeEventEnvelope(aggregate, envelope, 0, attachment.visibilityScope, {
          type: 'attachment_uploaded',
          payload: {
            ...envelope.command.payload,
            attachment
          }
        })
      ];
    }
    case 'draw_card': {
      const card = aggregate ? findTopCardInDeck(aggregate, envelope.command.payload.deckId) : undefined;
      if (!card) {
        return [];
      }

      const holder = resolveDeckHolderForDefinition(
        aggregate!,
        contentPack,
        envelope.command.payload.deckId,
        envelope.actor.playerId,
        envelope.actor.role
      );

      return [
        makeEventEnvelope(aggregate, envelope, 0, 'team_private', {
          type: 'card_drawn',
          payload: {
            ...envelope.command.payload,
            cardInstance: {
              ...card,
              zone: 'hand',
              holderType: holder.holderType,
              holderId: holder.holderId,
              updatedAt: envelope.occurredAt
            }
          }
        })
      ];
    }
    case 'play_card': {
      const currentCard = aggregate!.cardInstances[envelope.command.payload.cardInstanceId];
      const cardDefinition = getCardDefinition(contentPack, currentCard.cardDefinitionId) as CardDefinition;
      const copiedCardInstanceId = envelope.command.payload.duplicateTargetCardInstanceId;
      const copiedCardInstance = copiedCardInstanceId ? aggregate!.cardInstances[copiedCardInstanceId] : undefined;
      const effectCardDefinition = copiedCardInstance
        ? getCardDefinition(contentPack, copiedCardInstance.cardDefinitionId) as CardDefinition
        : cardDefinition;
      const resolutionPlan = buildCardResolutionPlan(effectCardDefinition, aggregate!.selectedScale);
      const opensResolutionWindow = resolutionPlan.kind === 'move'
        ? aggregate?.lifecycleState === 'hide_phase' || aggregate?.lifecycleState === 'seek_phase'
        : resolutionPlan.kind !== 'time_bonus' &&
          resolutionPlan.kind !== 'draw_and_expand_hand' &&
          resolutionPlan.kind !== 'veto_question' &&
          resolutionPlan.kind !== 'randomize_question' &&
          aggregate?.lifecycleState === 'seek_phase';
      const playedCard: CardInstanceModel = {
        ...currentCard,
        zone: opensResolutionWindow ? 'pending_resolution' : 'discard_pile',
        holderType: currentCard.holderType,
        holderId: currentCard.holderId,
        updatedAt: envelope.occurredAt
      };

      const events: DomainEventEnvelope[] = [
        makeEventEnvelope(aggregate, envelope, 0, 'team_private', {
          type: 'card_played',
          payload: {
            ...envelope.command.payload,
            cardInstance: playedCard
          }
        })
      ];

      if (resolutionPlan.kind === 'draw_and_expand_hand') {
        let workingAggregate = reduceMatchAggregate(aggregate!, events[0]!);
        for (let index = 0; index < (resolutionPlan.drawCountOnResolve ?? 0); index += 1) {
          const nextCard = findTopCardInDeck(workingAggregate, cardDefinition.deckId);
          if (!nextCard) break;
          const drawEvent = makeEventEnvelope(aggregate, envelope, events.length, 'team_private', {
            type: 'card_drawn',
            payload: {
              deckId: cardDefinition.deckId,
              cardInstance: {
                ...nextCard,
                zone: 'hand',
                holderType: currentCard.holderType,
                holderId: currentCard.holderId,
                updatedAt: envelope.occurredAt
              }
            }
          });
          events.push(drawEvent);
          workingAggregate = reduceMatchAggregate(workingAggregate, drawEvent);
        }
        events.push(makeEventEnvelope(aggregate, envelope, events.length, 'team_private', {
          type: 'hider_hand_limit_expanded',
          payload: {
            sourceCardInstanceId: currentCard.cardInstanceId,
            increaseBy: resolutionPlan.handSizeIncreaseOnResolve ?? 1
          }
        }));
        return events;
      }

      if (resolutionPlan.kind === 'veto_question') {
        const activeQuestion = aggregate!.activeQuestionInstanceId
          ? aggregate!.questionInstances[aggregate!.activeQuestionInstanceId]
          : undefined;
        if (activeQuestion) {
          events.push(makeEventEnvelope(aggregate, envelope, events.length, 'public_match', {
            type: 'question_vetoed',
            payload: {
              questionInstanceId: activeQuestion.questionInstanceId,
              lifecycleState: aggregate!.lifecycleState,
              seekPhaseSubstate: 'ready'
            }
          }));
        }
        return events;
      }

      if (resolutionPlan.kind === 'randomize_question') {
        const originalQuestion = aggregate!.activeQuestionInstanceId
          ? aggregate!.questionInstances[aggregate!.activeQuestionInstanceId]
          : undefined;
        if (!originalQuestion) return events;
        const previouslyAskedTemplateIds = new Set(Object.values(aggregate!.questionInstances)
          .filter((question) => question.status === 'resolved' || question.status === 'vetoed')
          .map((question) => question.templateId));
        const candidates = contentPack.questionTemplates.filter((template) =>
          template.categoryId === originalQuestion.categoryId &&
          template.templateId !== originalQuestion.templateId &&
          (!aggregate!.selectedScale || template.scaleSet.appliesTo.includes(aggregate!.selectedScale)) &&
          !previouslyAskedTemplateIds.has(template.templateId)
        );
        const replacementTemplate = candidates[Math.floor(Math.random() * candidates.length)];
        if (!replacementTemplate) return events;
        const replacementCategory = getQuestionCategory(contentPack, replacementTemplate.categoryId)!;
        const replacementQuestion: QuestionInstanceModel = {
          questionInstanceId: `question:${createRandomUuid()}`,
          templateId: replacementTemplate.templateId,
          categoryId: replacementTemplate.categoryId,
          askedByPlayerId: originalQuestion.askedByPlayerId,
          targetTeamId: originalQuestion.targetTeamId,
          status: 'awaiting_answer',
          askedAt: envelope.occurredAt,
          randomizedFromQuestionInstanceId: originalQuestion.questionInstanceId,
          randomizedNullAnswerAllowed: true
        };
        const replacementQuestionTimer = buildQuestionTimer(
          aggregate!, contentPack, replacementQuestion.questionInstanceId, replacementTemplate.templateId, envelope.occurredAt
        );
        events.push(makeEventEnvelope(aggregate, envelope, events.length, 'public_match', {
          type: 'question_randomized',
          payload: {
            originalQuestionInstanceId: originalQuestion.questionInstanceId,
            replacementQuestion,
            lifecycleState: aggregate!.lifecycleState,
            seekPhaseSubstate: 'awaiting_question_answer',
            replacementQuestionTimer
          }
        }));

        const automaticAnswer = resolveAutomaticQuestionAnswer({
          aggregate: aggregate!, contentPack, category: replacementCategory, template: replacementTemplate,
          askedByPlayerId: replacementQuestion.askedByPlayerId, targetTeamId: replacementQuestion.targetTeamId,
          occurredAt: envelope.occurredAt
        });
        if (automaticAnswer.kind === 'resolved') {
          if (automaticAnswer.answer.value === null || !automaticAnswer.constraintId) {
            events.push(makeEventEnvelope(aggregate, envelope, events.length, 'public_match', {
              type: 'question_null_answer_resolved',
              payload: {
                questionInstanceId: replacementQuestion.questionInstanceId,
                answer: automaticAnswer.answer,
                automaticResolution: automaticAnswer.automaticResolution,
                lifecycleState: aggregate!.lifecycleState,
                seekPhaseSubstate: 'ready'
              }
            }));
            return events;
          }
          const answeredQuestion: QuestionInstanceModel = {
            ...replacementQuestion, status: 'applying_constraints', answer: automaticAnswer.answer,
            automaticResolution: automaticAnswer.automaticResolution
          };
          events.push(makeEventEnvelope(aggregate, envelope, events.length, 'public_match', {
            type: 'question_answered',
            payload: {
              questionInstanceId: replacementQuestion.questionInstanceId,
              answer: automaticAnswer.answer,
              automaticResolution: automaticAnswer.automaticResolution,
              lifecycleState: aggregate!.lifecycleState,
              seekPhaseSubstate: 'applying_constraints'
            }
          }));
          events.push(buildConstraintAppliedEvent({
            aggregate: aggregate!, envelope, contentPack, question: answeredQuestion,
            constraintId: automaticAnswer.constraintId,
            metadata: {
              automaticResolution: automaticAnswer.automaticResolution,
              ...(automaticAnswer.constraintMetadata ?? {})
            }, index: events.length
          }));
        }
        return events;
      }

      if (opensResolutionWindow) {
        const openingHandCardInstanceIds = Object.values(aggregate!.cardInstances)
          .filter(
            (candidate) =>
              candidate.zone === 'hand' &&
              candidate.holderType === currentCard.holderType &&
              candidate.holderId === currentCard.holderId
          )
          .map((candidate) => candidate.cardInstanceId)
          .sort((left, right) => left.localeCompare(right));

        events.push(
          makeEventEnvelope(aggregate, envelope, 1, 'team_private', {
            type: 'card_resolution_opened',
            payload: {
              sourceCardInstanceId: currentCard.cardInstanceId,
              seekPhaseSubstate: 'awaiting_card_resolution',
              lifecycleState: aggregate!.lifecycleState,
              resolutionKind: resolutionPlan.kind,
              moveOriginStationId: resolutionPlan.kind === 'move' ? aggregate!.hiddenState.hidingZone?.stationId : undefined,
              moveOriginStationName: resolutionPlan.kind === 'move' ? aggregate!.hiddenState.hidingZone?.stationName : undefined,
              discardRequirement: resolutionPlan.kind === 'move'
                ? undefined
                : resolutionPlan.discardRequirement.requiredCards ||
                  resolutionPlan.discardRequirement.requiredKind ||
                  resolutionPlan.discardRequirement.discardWholeHand
                  ? resolutionPlan.discardRequirement
                  : undefined,
              drawCountOnResolve: resolutionPlan.drawCountOnResolve,
              timeBonusMinutes: resolutionPlan.timeBonusMinutes,
              questionTemplateCount: resolutionPlan.questionTemplateCount,
              requireDistinctQuestionCategories: resolutionPlan.requireDistinctQuestionCategories,
              rerollAfterQuestion: resolutionPlan.rerollAfterQuestion,
              questionRewardCount: resolutionPlan.questionRewardCount,
              extraQuestionRewardDrawCount: resolutionPlan.extraQuestionRewardDrawCount,
              copiedCardInstanceId,
              sourceDeckId: cardDefinition.deckId,
              holderType: currentCard.holderType,
              holderId: currentCard.holderId,
              openingHandCardInstanceIds
            }
          })
        );

        if (resolutionPlan.kind === 'move') {
          for (const cardInstanceId of openingHandCardInstanceIds) {
            if (cardInstanceId === currentCard.cardInstanceId) continue;
            const card = aggregate!.cardInstances[cardInstanceId];
            if (!card || card.zone !== 'hand') continue;
            events.push(makeEventEnvelope(aggregate, envelope, events.length, 'team_private', {
              type: 'card_discarded',
              payload: {
                cardInstanceId,
                cardInstance: {
                  ...card,
                  zone: 'discard_pile',
                  updatedAt: envelope.occurredAt
                }
              }
            }));
          }
          if (aggregate!.lifecycleState === 'hide_phase') {
            const hideTimer = Object.values(aggregate!.timers).find((timer) => timer.kind === 'hide');
            if (hideTimer) {
              events.push(makeEventEnvelope(aggregate, envelope, events.length, 'authority', {
                type: 'timer_adjusted',
                payload: {
                  sourceCardInstanceId: currentCard.cardInstanceId,
                  timer: pauseTimerAt(hideTimer, envelope.occurredAt)
                }
              }));
            }
          }
        }
      }

      return events;
    }
    case 'discard_card': {
      const currentCard = aggregate!.cardInstances[envelope.command.payload.cardInstanceId];

      return [
        makeEventEnvelope(aggregate, envelope, 0, 'team_private', {
          type: 'card_discarded',
          payload: {
            ...envelope.command.payload,
            cardInstance: {
              ...currentCard,
              zone: 'discard_pile',
              holderType: currentCard.holderType,
              holderId: currentCard.holderId,
              updatedAt: envelope.occurredAt
            }
          }
        })
      ];
    }
    case 'resolve_card_window': {
      const activeQuestion = aggregate?.activeQuestionInstanceId
        ? aggregate.questionInstances[aggregate.activeQuestionInstanceId]
        : undefined;
      const activeResolution = aggregate!.activeCardResolution;
      const events: DomainEventEnvelope[] = [];
      let workingAggregate = aggregate;

      if (
        activeResolution?.resolutionKind === 'discard_then_draw' &&
        activeResolution.drawCountOnResolve &&
        activeResolution.sourceDeckId &&
        activeResolution.holderType &&
        activeResolution.holderId
      ) {
        for (let index = 0; index < activeResolution.drawCountOnResolve; index += 1) {
          const nextCard = workingAggregate
            ? findTopCardInDeck(workingAggregate, activeResolution.sourceDeckId)
            : undefined;
          if (!nextCard) {
            break;
          }

          const drawEvent = makeEventEnvelope(aggregate, envelope, events.length, 'team_private', {
            type: 'card_drawn',
            payload: {
              deckId: activeResolution.sourceDeckId,
              cardInstance: {
                ...nextCard,
                zone: 'hand',
                holderType: activeResolution.holderType,
                holderId: activeResolution.holderId,
                updatedAt: envelope.occurredAt
              }
            }
          });

          events.push(drawEvent);
          workingAggregate = reduceMatchAggregate(workingAggregate, drawEvent);
        }
      }

      const cooldownSeconds = activeQuestion
        ? getQuestionCooldownSeconds(contentPack, aggregate!.selectedRulesetId, activeQuestion.templateId)
        : 0;

      if (activeResolution?.resolutionKind === 'disable_question_templates') {
        events.push(makeEventEnvelope(aggregate, envelope, events.length, 'public_match', {
          type: 'question_templates_disabled',
          payload: {
            questionTemplateIds: envelope.command.payload.questionTemplateIds ?? [],
            sourceCardInstanceId: activeResolution.sourceCardInstanceId
          }
        }));
      }

      if (activeResolution?.resolutionKind === 'random_question_category_lock') {
        const categories = contentPack.questionCategories;
        const selectedCategory = categories[Math.floor(Math.random() * categories.length)];
        if (selectedCategory) {
          events.push(makeEventEnvelope(aggregate, envelope, events.length, 'public_match', {
            type: 'question_category_disabled',
            payload: {
              categoryId: selectedCategory.categoryId,
              sourceCardInstanceId: activeResolution.sourceCardInstanceId,
              reason: 'initial_roll'
            }
          }));
        }
      }

      if (activeResolution?.resolutionKind === 'extra_question_reward_draws') {
        events.push(makeEventEnvelope(aggregate, envelope, events.length, 'team_private', {
          type: 'question_reward_draw_bonus_granted',
          payload: {
            questionCount: activeResolution.questionRewardCount ?? 0,
            extraDrawCount: activeResolution.extraQuestionRewardDrawCount ?? 0,
            sourceCardInstanceId: activeResolution.sourceCardInstanceId
          }
        }));
      }

      if (activeResolution?.resolutionKind === 'move' && aggregate!.lifecycleState === 'hide_phase') {
        const hideTimer = Object.values(aggregate!.timers).find((timer) => timer.kind === 'hide' && timer.status === 'paused');
        if (hideTimer) {
          events.push(makeEventEnvelope(aggregate, envelope, events.length, 'authority', {
            type: 'timer_adjusted',
            payload: {
              sourceCardInstanceId: activeResolution.sourceCardInstanceId,
              timer: resumeTimerAt(hideTimer, envelope.occurredAt)
            }
          }));
        }
      }

      events.push(
        makeEventEnvelope(aggregate, envelope, events.length, 'team_private', {
          type: 'card_resolution_closed',
          payload: {
            ...envelope.command.payload,
            seekPhaseSubstate: cooldownSeconds > 0 ? 'cooldown' : 'ready',
            lifecycleState: aggregate!.lifecycleState,
            cooldownTimer: activeQuestion && cooldownSeconds > 0
              ? buildCooldownTimer(aggregate!, contentPack, activeQuestion.templateId, envelope.occurredAt)
              : undefined,
          }
        })
      );

      return events;
    }
    case 'complete_cooldown':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'cooldown_completed',
          payload: {
            seekPhaseSubstate: 'ready'
          }
        })
      ];
    case 'pause_match':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'match_paused',
          payload: {
            ...envelope.command.payload,
            paused: {
              reason: envelope.command.payload.reason,
              pausedAt: envelope.occurredAt,
              pausedByPlayerId: envelope.actor.playerId,
              pausedByRole: envelope.actor.role,
              resumeLifecycleState: aggregate!.lifecycleState,
              resumeSeekPhaseSubstate: aggregate!.seekPhaseSubstate
            }
          }
        })
      ];
    case 'resume_match':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'match_resumed',
          payload: {
            lifecycleState: aggregate!.paused!.resumeLifecycleState,
            seekPhaseSubstate: aggregate!.paused!.resumeSeekPhaseSubstate
          }
        })
      ];
    case 'end_match':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'match_ended',
          payload: {
            ...envelope.command.payload,
            lifecycleState: 'game_complete'
          }
        })
      ];
    case 'archive_match':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'match_archived',
          payload: {
            ...envelope.command.payload,
            lifecycleState: 'archived'
          }
        })
      ];
    default:
      return [];
  }
}

export function executeCommand(
  aggregate: MatchAggregate | undefined,
  envelope: CommandEnvelope,
  contentPack: ContentPack,
  questionFeatureDataset?: QuestionFeatureDatasetModel
): ExecuteCommandResult {
  const issues = validateCommandEnvelope(aggregate, envelope, contentPack, questionFeatureDataset);
  if (issues.length > 0) {
    throw new EngineCommandError(issues[0]?.message ?? 'Command validation failed.', issues);
  }

  const events = eventsForCommand(aggregate, envelope, contentPack, questionFeatureDataset);
  if (events.length === 0) {
    throw new EngineCommandError('Command produced no events.', [
      {
        commandType: envelope.command.type,
        code: 'NO_EVENTS_EMITTED',
        message: 'The command did not emit any events.'
      }
    ]);
  }

  const nextAggregate = events.reduce<MatchAggregate | undefined>((current, eventEnvelope) => {
    return reduceMatchAggregate(current, eventEnvelope);
  }, aggregate);

  if (!nextAggregate) {
    throw new Error('Reducer did not produce an aggregate.');
  }

  return {
    aggregate: nextAggregate,
    events
  };
}
