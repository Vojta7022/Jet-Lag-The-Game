import type {
  CardInstanceModel,
  DomainEventEnvelope,
  EventLogEntry,
  MatchAggregate,
  TeamModel
} from '../../shared-types/src/index.ts';
import {
  applyConstraintRecordToSearchArea,
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

function mapTimers(
  timers: MatchAggregate['timers'],
  transform: (timer: MatchAggregate['timers'][string]) => MatchAggregate['timers'][string]
): MatchAggregate['timers'] {
  const updated: MatchAggregate['timers'] = {};

  for (const timer of Object.values(timers)) {
    updated[timer.timerId] = transform(timer);
  }

  return updated;
}

function buildDefaultChatChannels(teams: TeamModel[], createdAt: string): MatchAggregate['chatChannels'] {
  const channels = [
    {
      channelId: 'channel:lobby',
      kind: 'lobby' as const,
      displayName: 'Lobby',
      visibilityScope: 'public_match' as const,
      createdAt
    },
    {
      channelId: 'channel:global',
      kind: 'global' as const,
      displayName: 'Global',
      visibilityScope: 'public_match' as const,
      createdAt
    },
    ...teams.map((team) => ({
      channelId: `channel:team:${team.teamId}`,
      kind: 'team' as const,
      displayName: `${team.name} Chat`,
      visibilityScope: 'team_private' as const,
      teamId: team.teamId,
      createdAt
    }))
  ];

  return Object.fromEntries(channels.map((channel) => [channel.channelId, channel]));
}

function ensureTeamChannel(
  aggregate: MatchAggregate,
  team: TeamModel,
  createdAt: string
): MatchAggregate['chatChannels'] {
  const channelId = `channel:team:${team.teamId}`;
  if (aggregate.chatChannels[channelId]) {
    return aggregate.chatChannels;
  }

  return {
    ...aggregate.chatChannels,
    [channelId]: {
      channelId,
      kind: 'team',
      displayName: `${team.name} Chat`,
      visibilityScope: 'team_private',
      teamId: team.teamId,
      createdAt
    }
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
        chatChannels: buildDefaultChatChannels(teams, eventEnvelope.occurredAt),
        chatMessages: {},
        attachments: {},
        locationSamples: [],
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
        },
        chatChannels: ensureTeamChannel(base, eventEnvelope.event.payload.team, eventEnvelope.occurredAt)
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
    case 'location_updated':
      return {
        ...base,
        locationSamples: [
          ...base.locationSamples,
          {
            sampleId: `location:${eventEnvelope.sequence}`,
            playerId: eventEnvelope.event.payload.playerId,
            role: eventEnvelope.event.payload.role,
            teamId: eventEnvelope.event.payload.teamId,
            latitude: eventEnvelope.event.payload.latitude,
            longitude: eventEnvelope.event.payload.longitude,
            accuracyMeters: eventEnvelope.event.payload.accuracyMeters,
            source: eventEnvelope.event.payload.source ?? 'device',
            recordedAt: eventEnvelope.occurredAt
          }
        ]
      };
    case 'hide_phase_ended': {
      const updatedTimers = mapTimers(base.timers, (timer) =>
        timer.kind === 'hide'
          ? { ...timer, status: 'completed', remainingSeconds: 0 }
          : timer
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
        },
        timers: eventEnvelope.event.payload.questionTimer
          ? {
              ...base.timers,
              [eventEnvelope.event.payload.questionTimer.timerId]: eventEnvelope.event.payload.questionTimer
            }
          : base.timers
      };
    case 'question_answered': {
      const questionInstanceId = eventEnvelope.event.payload.questionInstanceId;
      const question = base.questionInstances[questionInstanceId];
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate,
        questionInstances: {
          ...base.questionInstances,
          [questionInstanceId]: {
            ...question,
            status: 'applying_constraints',
            answer: eventEnvelope.event.payload.answer
          }
        },
        timers: mapTimers(base.timers, (timer) =>
          timer.kind === 'question' && timer.ownerRef === questionInstanceId
            ? { ...timer, status: 'completed', remainingSeconds: 0 }
            : timer
        )
      };
    }
    case 'constraint_applied': {
      const nextQuestionStatus: MatchAggregate['questionInstances'][string]['status'] =
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
            ? applyConstraintRecordToSearchArea(base.searchArea, nextConstraint, eventEnvelope.occurredAt)
            : base.searchArea,
        timers: eventEnvelope.event.payload.cooldownTimer
          ? {
              ...base.timers,
              [eventEnvelope.event.payload.cooldownTimer.timerId]: eventEnvelope.event.payload.cooldownTimer
            }
          : base.timers
      };
    }
    case 'attachment_uploaded':
      return {
        ...base,
        attachments: {
          ...base.attachments,
          [eventEnvelope.event.payload.attachment.attachmentId]: eventEnvelope.event.payload.attachment
        }
      };
    case 'chat_message_sent': {
      const updatedAttachments = { ...base.attachments };

      for (const attachmentId of eventEnvelope.event.payload.message.attachmentIds) {
        const attachment = updatedAttachments[attachmentId];
        if (!attachment) {
          continue;
        }

        updatedAttachments[attachmentId] = {
          ...attachment,
          status: 'linked',
          linkedMessageId: eventEnvelope.event.payload.message.messageId
        };
      }

      return {
        ...base,
        chatMessages: {
          ...base.chatMessages,
          [eventEnvelope.event.payload.message.messageId]: eventEnvelope.event.payload.message
        },
        attachments: updatedAttachments
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
    case 'card_discarded':
      return {
        ...base,
        cardInstances: {
          ...base.cardInstances,
          [eventEnvelope.event.payload.cardInstance.cardInstanceId]: eventEnvelope.event.payload.cardInstance
        }
      };
    case 'timer_adjusted':
      return {
        ...base,
        timers: {
          ...base.timers,
          [eventEnvelope.event.payload.timer.timerId]: eventEnvelope.event.payload.timer
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
          openedByPlayerId: eventEnvelope.actor.playerId ?? eventEnvelope.actor.actorId,
          resolutionKind: eventEnvelope.event.payload.resolutionKind,
          discardRequirement: eventEnvelope.event.payload.discardRequirement,
          drawCountOnResolve: eventEnvelope.event.payload.drawCountOnResolve,
          timeBonusMinutes: eventEnvelope.event.payload.timeBonusMinutes,
          sourceDeckId: eventEnvelope.event.payload.sourceDeckId,
          holderType: eventEnvelope.event.payload.holderType,
          holderId: eventEnvelope.event.payload.holderId,
          openingHandCardInstanceIds: eventEnvelope.event.payload.openingHandCardInstanceIds
        }
      };
    case 'card_resolution_closed': {
      const updatedCards = { ...base.cardInstances };
      const card = updatedCards[eventEnvelope.event.payload.sourceCardInstanceId];
      if (card) {
        updatedCards[card.cardInstanceId] = moveCardToZone(
          card,
          'discard_pile',
          card.holderType,
          card.holderId,
          eventEnvelope.occurredAt
        );
      }

      const updatedQuestionInstances =
        base.activeQuestionInstanceId && base.questionInstances[base.activeQuestionInstanceId]
          ? ({
              ...base.questionInstances,
              [base.activeQuestionInstanceId]: {
                ...base.questionInstances[base.activeQuestionInstanceId],
                status: 'resolved',
                resolvedAt: eventEnvelope.occurredAt
              }
            } satisfies MatchAggregate['questionInstances'])
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
      const updatedTimers = mapTimers(base.timers, (timer) =>
        timer.kind === 'cooldown'
          ? { ...timer, status: 'completed', remainingSeconds: 0 }
          : timer
      );

      return {
        ...base,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate,
        timers: updatedTimers
      };
    }
    case 'match_paused': {
      const updatedTimers = mapTimers(base.timers, (timer) =>
        timer.status === 'running'
          ? {
              ...timer,
              status: 'paused',
              pausedAt: eventEnvelope.occurredAt
            }
          : timer
      );

      return {
        ...base,
        paused: eventEnvelope.event.payload.paused,
        timers: updatedTimers
      };
    }
    case 'match_resumed': {
      const updatedTimers = mapTimers(base.timers, (timer) =>
        timer.status === 'paused'
          ? {
              ...timer,
              status: 'running',
              pausedAt: undefined
            }
          : timer
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
