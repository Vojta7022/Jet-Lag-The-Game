import type {
  CardInstanceModel,
  DomainEventEnvelope,
  EventLogEntry,
  MatchAggregate
} from '../../shared-types/src/index.ts';
import {
  applyConstraintArtifactsToSearchArea,
  buildPlayableRegionFromCommand,
  initializeSearchAreaFromRegion
} from '../../geo/src/index.ts';

function toEventLogEntry(eventEnvelope: DomainEventEnvelope): EventLogEntry {
  return {
    eventId: eventEnvelope.eventId,
    sequence: eventEnvelope.sequence,
    type: eventEnvelope.event.type,
    occurredAt: eventEnvelope.occurredAt,
    actorId: eventEnvelope.actor.actorId,
    actorRole: eventEnvelope.actor.role,
    visibilityScope: eventEnvelope.visibilityScope
  };
}

function moveCardToZone(
  card: CardInstanceModel,
  zone: CardInstanceModel['zone'],
  holderType: CardInstanceModel['holderType'],
  holderId: string,
  updatedAt: string
): CardInstanceModel {
  return {
    ...card,
    zone,
    holderType,
    holderId,
    updatedAt
  };
}

export function reduceMatchAggregate(
  aggregate: MatchAggregate | undefined,
  eventEnvelope: DomainEventEnvelope
): MatchAggregate {
  const eventLogEntry = toEventLogEntry(eventEnvelope);

  switch (eventEnvelope.event.type) {
    case 'match_created': {
      const { match, hostPlayer, teams, roleAssignments, cardInstances, lifecycleState } =
        eventEnvelope.event.payload;

      return {
        matchId: match.matchId,
        mode: match.mode,
        lifecycleState,
        revision: eventEnvelope.sequence,
        createdAt: eventEnvelope.occurredAt,
        updatedAt: eventEnvelope.occurredAt,
        contentPackId: match.contentPackId,
        createdByPlayerId: match.createdByPlayerId,
        selectedScale: match.selectedScale,
        players: {
          [hostPlayer.playerId]: hostPlayer
        },
        teams: Object.fromEntries(teams.map((team) => [team.teamId, team])),
        roleAssignments: Object.fromEntries(
          roleAssignments.map((assignment) => [assignment.playerId, assignment])
        ),
        timers: {},
        statusEffects: {},
        cardInstances: Object.fromEntries(cardInstances.map((card) => [card.cardInstanceId, card])),
        questionInstances: {},
        constraints: {},
        eventLog: [eventLogEntry],
        hiddenState: {}
      };
    }
    default:
      if (!aggregate) {
        throw new Error(`Cannot apply ${eventEnvelope.event.type} without an aggregate.`);
      }
  }

  const base: MatchAggregate = {
    ...aggregate,
    revision: eventEnvelope.sequence,
    updatedAt: eventEnvelope.occurredAt,
    eventLog: [...aggregate.eventLog, eventLogEntry]
  };

  switch (eventEnvelope.event.type) {
    case 'player_joined': {
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        players: {
          ...base.players,
          [eventEnvelope.event.payload.player.playerId]: eventEnvelope.event.payload.player
        }
      };
    }
    case 'content_import_started':
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState
      };
    case 'content_pack_published':
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState
      };
    case 'role_assigned': {
      const currentTeam = base.teams[eventEnvelope.event.payload.team.teamId];
      const existingMembers = currentTeam?.memberPlayerIds ?? [];
      const memberPlayerIds = existingMembers.includes(eventEnvelope.event.payload.targetPlayerId)
        ? existingMembers
        : [...existingMembers, eventEnvelope.event.payload.targetPlayerId];

      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        roleAssignments: {
          ...base.roleAssignments,
          [eventEnvelope.event.payload.targetPlayerId]: eventEnvelope.event.payload.roleAssignment
        },
        teams: {
          ...base.teams,
          [eventEnvelope.event.payload.team.teamId]: {
            ...eventEnvelope.event.payload.team,
            memberPlayerIds
          }
        }
      };
    }
    case 'roles_confirmed':
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState
      };
    case 'ruleset_selected':
      return {
        ...base,
        selectedRulesetId: eventEnvelope.event.payload.rulesetId,
        lifecycleState: eventEnvelope.event.payload.lifecycleState
      };
    case 'rules_confirmed':
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState
      };
    case 'map_region_created': {
      const mapRegion = buildPlayableRegionFromCommand(eventEnvelope.event.payload, eventEnvelope.occurredAt);
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        mapRegion,
        searchArea: initializeSearchAreaFromRegion(mapRegion, eventEnvelope.occurredAt)
      };
    }
    case 'match_started':
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: undefined,
        timers: {
          ...base.timers,
          [eventEnvelope.event.payload.timer.timerId]: eventEnvelope.event.payload.timer
        }
      };
    case 'hider_location_locked':
      return {
        ...base,
        hiddenState: {
          ...base.hiddenState,
          hiderLocation: {
            latitude: eventEnvelope.event.payload.latitude,
            longitude: eventEnvelope.event.payload.longitude,
            accuracyMeters: eventEnvelope.event.payload.accuracyMeters,
            lockedAt: eventEnvelope.occurredAt,
            lockedByPlayerId: eventEnvelope.event.payload.lockedByPlayerId
          }
        }
      };
    case 'hide_phase_ended': {
      const updatedTimers = Object.fromEntries(
        Object.values(base.timers).map((timer) =>
          timer.kind === 'hide'
            ? [timer.timerId, { ...timer, status: 'completed', remainingSeconds: 0 }]
            : [timer.timerId, timer]
        )
      );

      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate,
        timers: updatedTimers
      };
    }
    case 'question_prompt_opened':
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate
      };
    case 'question_asked':
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate,
        activeQuestionInstanceId: eventEnvelope.event.payload.question.questionInstanceId,
        questionInstances: {
          ...base.questionInstances,
          [eventEnvelope.event.payload.question.questionInstanceId]: eventEnvelope.event.payload.question
        }
      };
    case 'question_answered': {
      const question = base.questionInstances[eventEnvelope.event.payload.questionInstanceId];
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate,
        questionInstances: {
          ...base.questionInstances,
          [eventEnvelope.event.payload.questionInstanceId]: {
            ...question,
            status: 'applying_constraints',
            answer: eventEnvelope.event.payload.answer
          }
        }
      };
    }
    case 'constraint_applied': {
      const nextQuestionStatus =
        eventEnvelope.event.payload.seekPhaseSubstate === 'awaiting_card_resolution'
          ? 'awaiting_card_resolution'
          : 'resolved';
      const nextConstraint = eventEnvelope.event.payload.constraint;

      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate,
        activeQuestionInstanceId:
          nextQuestionStatus === 'resolved' ? undefined : base.activeQuestionInstanceId,
        questionInstances: {
          ...base.questionInstances,
          [eventEnvelope.event.payload.questionInstanceId]: {
            ...base.questionInstances[eventEnvelope.event.payload.questionInstanceId],
            status: nextQuestionStatus,
            resolvedAt:
              nextQuestionStatus === 'resolved'
                ? eventEnvelope.occurredAt
                : base.questionInstances[eventEnvelope.event.payload.questionInstanceId]?.resolvedAt
          }
        },
        constraints: {
          ...base.constraints,
          [nextConstraint.constraintRecordId]: nextConstraint
        },
        searchArea:
          base.searchArea
            ? applyConstraintArtifactsToSearchArea(base.searchArea, nextConstraint, eventEnvelope.occurredAt)
            : base.searchArea,
        timers: eventEnvelope.event.payload.cooldownTimer
          ? {
              ...base.timers,
              [eventEnvelope.event.payload.cooldownTimer.timerId]: eventEnvelope.event.payload.cooldownTimer
            }
          : base.timers
      };
    }
    case 'card_drawn':
      return {
        ...base,
        cardInstances: {
          ...base.cardInstances,
          [eventEnvelope.event.payload.cardInstance.cardInstanceId]: eventEnvelope.event.payload.cardInstance
        }
      };
    case 'card_played':
      return {
        ...base,
        cardInstances: {
          ...base.cardInstances,
          [eventEnvelope.event.payload.cardInstance.cardInstanceId]: eventEnvelope.event.payload.cardInstance
        }
      };
    case 'card_resolution_opened':
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate,
        activeCardResolution: {
          sourceCardInstanceId: eventEnvelope.event.payload.sourceCardInstanceId,
          openedAt: eventEnvelope.occurredAt,
          openedByPlayerId: eventEnvelope.actor.playerId ?? eventEnvelope.actor.actorId
        }
      };
    case 'card_resolution_closed': {
      const updatedCards = { ...base.cardInstances };
      const card = updatedCards[eventEnvelope.event.payload.sourceCardInstanceId];
      if (card) {
        updatedCards[card.cardInstanceId] = moveCardToZone(
          card,
          'discard_pile',
          'deck',
          card.holderId,
          eventEnvelope.occurredAt
        );
      }

      const updatedQuestionInstances =
        base.activeQuestionInstanceId && base.questionInstances[base.activeQuestionInstanceId]
          ? {
              ...base.questionInstances,
              [base.activeQuestionInstanceId]: {
                ...base.questionInstances[base.activeQuestionInstanceId],
                status: 'resolved',
                resolvedAt: eventEnvelope.occurredAt
              }
            }
          : base.questionInstances;

      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate,
        activeCardResolution: undefined,
        activeQuestionInstanceId: undefined,
        questionInstances: updatedQuestionInstances,
        cardInstances: updatedCards,
        timers: eventEnvelope.event.payload.cooldownTimer
          ? {
              ...base.timers,
              [eventEnvelope.event.payload.cooldownTimer.timerId]: eventEnvelope.event.payload.cooldownTimer
            }
          : base.timers
      };
    }
    case 'cooldown_completed': {
      const updatedTimers = Object.fromEntries(
        Object.values(base.timers).map((timer) =>
          timer.kind === 'cooldown'
            ? [timer.timerId, { ...timer, status: 'completed', remainingSeconds: 0 }]
            : [timer.timerId, timer]
        )
      );

      return {
        ...base,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate,
        timers: updatedTimers
      };
    }
    case 'match_paused': {
      const updatedTimers = Object.fromEntries(
        Object.values(base.timers).map((timer) =>
          timer.status === 'running'
            ? [
                timer.timerId,
                {
                  ...timer,
                  status: 'paused',
                  pausedAt: eventEnvelope.occurredAt
                }
              ]
            : [timer.timerId, timer]
        )
      );

      return {
        ...base,
        paused: eventEnvelope.event.payload.paused,
        timers: updatedTimers
      };
    }
    case 'match_resumed': {
      const updatedTimers = Object.fromEntries(
        Object.values(base.timers).map((timer) =>
          timer.status === 'paused'
            ? [
                timer.timerId,
                {
                  ...timer,
                  status: 'running',
                  pausedAt: undefined
                }
              ]
            : [timer.timerId, timer]
        )
      );

      return {
        ...base,
        paused: undefined,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate,
        timers: updatedTimers
      };
    }
    case 'match_ended':
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: undefined,
        activeCardResolution: undefined,
        activeQuestionInstanceId: undefined
      };
    case 'match_archived':
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: undefined,
        paused: undefined
      };
    default:
      return base;
  }
}

export function reduceEvents(eventEnvelopes: DomainEventEnvelope[]): MatchAggregate | undefined {
  return eventEnvelopes.reduce<MatchAggregate | undefined>((aggregate, eventEnvelope) => {
    return reduceMatchAggregate(aggregate, eventEnvelope);
  }, undefined);
}
