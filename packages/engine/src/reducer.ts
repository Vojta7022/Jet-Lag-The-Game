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
  const event = eventEnvelope.event;
  const isCardResolutionEvent = event.type === 'card_resolution_opened' || event.type === 'card_resolution_closed';
  return {
    eventId: eventEnvelope.eventId,
    sequence: eventEnvelope.sequence,
    type: eventEnvelope.event.type,
    occurredAt: eventEnvelope.occurredAt,
    actorId: eventEnvelope.actor.actorId,
    actorRole: eventEnvelope.actor.role,
    visibilityScope: eventEnvelope.visibilityScope,
    resolutionKind: event.type === 'card_resolution_opened' ? event.payload.resolutionKind : undefined,
    sourceCardInstanceId: isCardResolutionEvent ? event.payload.sourceCardInstanceId : undefined
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

function remainingAt(timer: MatchAggregate['timers'][string], timestamp: string): number {
  const startedAtMs = Date.parse(timer.startedAt);
  const nowMs = Date.parse(timestamp);
  if (timer.status !== 'running' || Number.isNaN(startedAtMs) || Number.isNaN(nowMs)) {
    return timer.remainingSeconds;
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  return Math.max(0, timer.durationSeconds - elapsedSeconds);
}

function resumedTimer(timer: MatchAggregate['timers'][string], resumedAt: string) {
  const elapsedSeconds = Math.max(0, timer.durationSeconds - timer.remainingSeconds);
  const resumedAtMs = Date.parse(resumedAt);
  const startedAt = Number.isNaN(resumedAtMs)
    ? timer.startedAt
    : new Date(resumedAtMs - elapsedSeconds * 1000).toISOString();

  return {
    ...timer,
    status: 'running' as const,
    startedAt,
    pausedAt: undefined
  };
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
        contentPackVersion: match.contentPackVersion,
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
        hiddenState: {},
        roundResults: []
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
    case 'player_removed': {
      const playerId = eventEnvelope.event.payload.playerId;
      const players = { ...base.players };
      const roleAssignments = { ...base.roleAssignments };
      delete players[playerId];
      delete roleAssignments[playerId];
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        players,
        roleAssignments,
        teams: Object.fromEntries(Object.entries(base.teams).map(([teamId, team]) => [
          teamId,
          { ...team, memberPlayerIds: team.memberPlayerIds.filter((memberId) => memberId !== playerId) }
        ])),
        hiderRotationOrder: base.hiderRotationOrder?.filter((memberId) => memberId !== playerId)
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
      const targetPlayerId = eventEnvelope.event.payload.targetPlayerId;
      const teamsWithoutPlayer = Object.fromEntries(
        Object.entries(base.teams).map(([teamId, team]) => [
          teamId,
          {
            ...team,
            memberPlayerIds: team.memberPlayerIds.filter((playerId) => playerId !== targetPlayerId)
          }
        ])
      );
      const currentTeam = teamsWithoutPlayer[eventEnvelope.event.payload.team.teamId];
      const existingMembers = currentTeam?.memberPlayerIds ?? [];
      const memberPlayerIds = existingMembers.includes(targetPlayerId)
        ? existingMembers
        : [...existingMembers, targetPlayerId];

      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        roleAssignments: {
          ...base.roleAssignments,
          [eventEnvelope.event.payload.targetPlayerId]: eventEnvelope.event.payload.roleAssignment
        },
        teams: {
          ...teamsWithoutPlayer,
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
        roleAssignments: Object.fromEntries(
          eventEnvelope.event.payload.roleAssignments.map((assignment) => [assignment.playerId, assignment])
        ),
        teams: Object.fromEntries(eventEnvelope.event.payload.teams.map((team) => [team.teamId, team])),
        hiderRotationOrder: eventEnvelope.event.payload.hiderRotationOrder,
        seekerOffTransitRestriction: undefined,
        waterWeightChallenge: undefined,
        endlessTumbleChallenge: undefined,
        lemonPhylacteryChallenge: undefined,
        gamblersFeetChallenge: undefined,
        eggPartnerChallenge: undefined,
        jammedDoorChallenge: undefined,
        awardedCurseBonusMinutes: 0,
        cardInstances: Object.fromEntries(
          eventEnvelope.event.payload.cardInstances.map((card) => [card.cardInstanceId, card])
        ),
        timers: {
          ...base.timers,
          [eventEnvelope.event.payload.timer.timerId]: eventEnvelope.event.payload.timer
        }
      };
    case 'round_started': {
      const roleAssignments = Object.fromEntries(
        eventEnvelope.event.payload.roleAssignments.map((assignment) => [assignment.playerId, assignment])
      );
      const teams = Object.fromEntries(
        eventEnvelope.event.payload.teams.map((team) => [team.teamId, team])
      );

      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: undefined,
        roleAssignments,
        teams,
        cardInstances: Object.fromEntries(
          eventEnvelope.event.payload.cardInstances.map((card) => [card.cardInstanceId, card])
        ),
        timers: { [eventEnvelope.event.payload.timer.timerId]: eventEnvelope.event.payload.timer },
        statusEffects: {},
        questionInstances: {},
        activeQuestionInstanceId: undefined,
        activeCardResolution: undefined,
        seekerOffTransitRestriction: undefined,
        waterWeightChallenge: undefined,
        endlessTumbleChallenge: undefined,
        lemonPhylacteryChallenge: undefined,
        gamblersFeetChallenge: undefined,
        eggPartnerChallenge: undefined,
        jammedDoorChallenge: undefined,
        awardedCurseBonusMinutes: 0,
        disabledQuestionTemplateIds: [],
        disabledQuestionCategoryId: undefined,
        disabledQuestionCategorySourceCardInstanceId: undefined,
        questionRewardDrawBonus: undefined,
        constraints: {},
        locationSamples: [],
        hiddenState: {},
        roundStartLocation: eventEnvelope.event.payload.roundStartLocation,
        hiderRotationOrder: eventEnvelope.event.payload.hiderRotationOrder,
        hiderHandLimitBonus: 0,
        searchArea: base.mapRegion
          ? initializeSearchAreaFromRegion(base.mapRegion, eventEnvelope.occurredAt)
          : undefined,
        paused: undefined
      };
    }
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
    case 'hiding_zone_set':
      return {
        ...base,
        hiddenState: {
          ...base.hiddenState,
          hidingZone: {
            ...eventEnvelope.event.payload,
            selectedAt: eventEnvelope.occurredAt
          }
        }
      };
    case 'final_hiding_spot_set':
      return {
        ...base,
        hiddenState: {
          ...base.hiddenState,
          finalHidingSpot: {
            latitude: eventEnvelope.event.payload.latitude,
            longitude: eventEnvelope.event.payload.longitude,
            publiclyAccessible: true,
            within3mOfMarkedPath: true,
            selectedAt: eventEnvelope.occurredAt,
            selectedByPlayerId: eventEnvelope.event.payload.selectedByPlayerId
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
            altitudeMeters: eventEnvelope.event.payload.altitudeMeters,
            altitudeAccuracyMeters: eventEnvelope.event.payload.altitudeAccuracyMeters,
            altitudeReference: eventEnvelope.event.payload.altitudeReference,
            source: eventEnvelope.event.payload.source ?? 'device',
            onTransit: eventEnvelope.event.payload.onTransit,
            recordedAt: eventEnvelope.occurredAt
          }
        ]
      };
    case 'endgame_started':
      return {
        ...base,
        lifecycleState: 'endgame',
        seekPhaseSubstate: undefined,
        hiddenState: {
          ...base.hiddenState,
          endgame: base.hiddenState.finalHidingSpot
            ? {
                startedAt: eventEnvelope.occurredAt,
                finalHidingSpot: base.hiddenState.finalHidingSpot,
                triggeredByPlayerId: eventEnvelope.event.payload.triggeredByPlayerId
              }
            : undefined
        }
      };
    case 'hider_found':
      return {
        ...base,
        lifecycleState: 'game_complete',
        seekPhaseSubstate: undefined,
        roundResults: [...(base.roundResults ?? []), eventEnvelope.event.payload.roundResult]
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
        bridgeTrollChallenge: undefined,
        endlessTumbleChallenge: base.endlessTumbleChallenge?.successfulRollAt ? undefined : base.endlessTumbleChallenge,
        timers: eventEnvelope.event.payload.questionTimer
          ? {
              ...base.timers,
              [eventEnvelope.event.payload.questionTimer.timerId]: eventEnvelope.event.payload.questionTimer
            }
          : base.timers
      };
    case 'bridge_troll_challenge_started':
      return {
        ...base,
        bridgeTrollChallenge: {
          sourceCardInstanceId: eventEnvelope.event.payload.sourceCardInstanceId,
          activatedAt: eventEnvelope.occurredAt,
          attestedAtByPlayerId: {}
        }
      };
    case 'bridge_troll_position_changed': {
      const challenge = base.bridgeTrollChallenge;
      if (challenge?.sourceCardInstanceId !== eventEnvelope.event.payload.sourceCardInstanceId) return base;
      const attestedAtByPlayerId = { ...challenge.attestedAtByPlayerId };
      if (eventEnvelope.event.payload.underBridge) {
        attestedAtByPlayerId[eventEnvelope.event.payload.playerId] = eventEnvelope.occurredAt;
      } else {
        delete attestedAtByPlayerId[eventEnvelope.event.payload.playerId];
      }
      return {
        ...base,
        bridgeTrollChallenge: {
          ...challenge,
          attestedAtByPlayerId
        }
      };
    }
    case 'seeker_off_transit_restriction_started':
      return {
        ...base,
        seekerOffTransitRestriction: {
          sourceCardInstanceId: eventEnvelope.event.payload.sourceCardInstanceId,
          activatedAt: eventEnvelope.occurredAt,
          statusByPlayerId: {}
        }
      };
    case 'seeker_transit_context_changed': {
      const restriction = base.seekerOffTransitRestriction;
      if (restriction?.sourceCardInstanceId !== eventEnvelope.event.payload.sourceCardInstanceId) return base;
      return {
        ...base,
        seekerOffTransitRestriction: {
          ...restriction,
          statusByPlayerId: {
            ...restriction.statusByPlayerId,
            [eventEnvelope.event.payload.playerId]: {
              onTransitOrAtStation: eventEnvelope.event.payload.onTransitOrAtStation,
              updatedAt: eventEnvelope.occurredAt
            }
          }
        }
      };
    }
    case 'water_weight_challenge_started':
      return {
        ...base,
        waterWeightChallenge: {
          sourceCardInstanceId: eventEnvelope.event.payload.sourceCardInstanceId,
          activatedAt: eventEnvelope.occurredAt,
          hiderBonusMinutes: eventEnvelope.event.payload.hiderBonusMinutes
        }
      };
    case 'water_weight_liquid_acquired': {
      const challenge = base.waterWeightChallenge;
      if (challenge?.sourceCardInstanceId !== eventEnvelope.event.payload.sourceCardInstanceId) return base;
      return {
        ...base,
        waterWeightChallenge: {
          ...challenge,
          liquidAcquiredAt: eventEnvelope.occurredAt,
          liquidAcquiredByPlayerId: eventEnvelope.event.payload.playerId
        }
      };
    }
    case 'water_weight_liquid_lost': {
      const challenge = base.waterWeightChallenge;
      if (challenge?.sourceCardInstanceId !== eventEnvelope.event.payload.sourceCardInstanceId) return base;
      return {
        ...base,
        waterWeightChallenge: {
          ...challenge,
          liquidAcquiredAt: undefined,
          liquidAcquiredByPlayerId: undefined,
          lastLossReportedAt: eventEnvelope.occurredAt,
          bonusAwardedAt: eventEnvelope.event.payload.bonusMinutesAwarded > 0
            ? eventEnvelope.occurredAt
            : challenge.bonusAwardedAt
        },
        awardedCurseBonusMinutes: (base.awardedCurseBonusMinutes ?? 0) + eventEnvelope.event.payload.bonusMinutesAwarded
      };
    }
    case 'endless_tumble_challenge_started':
      return {
        ...base,
        endlessTumbleChallenge: {
          sourceCardInstanceId: eventEnvelope.event.payload.sourceCardInstanceId,
          activatedAt: eventEnvelope.occurredAt,
          hiderBonusMinutes: eventEnvelope.event.payload.hiderBonusMinutes,
          minimumDistanceMeters: eventEnvelope.event.payload.minimumDistanceMeters,
          successfulDieResults: eventEnvelope.event.payload.successfulDieResults,
          reportedAttempts: 0
        }
      };
    case 'endless_tumble_roll_reported': {
      const challenge = base.endlessTumbleChallenge;
      if (challenge?.sourceCardInstanceId !== eventEnvelope.event.payload.sourceCardInstanceId) return base;
      return {
        ...base,
        endlessTumbleChallenge: {
          ...challenge,
          successfulRollAt: eventEnvelope.event.payload.successful ? eventEnvelope.occurredAt : challenge.successfulRollAt,
          reportedAttempts: challenge.reportedAttempts + 1
        },
        awardedCurseBonusMinutes: (base.awardedCurseBonusMinutes ?? 0) + eventEnvelope.event.payload.bonusMinutesAwarded
      };
    }
    case 'lemon_phylactery_challenge_started':
      return {
        ...base,
        lemonPhylacteryChallenge: {
          sourceCardInstanceId: eventEnvelope.event.payload.sourceCardInstanceId,
          activatedAt: eventEnvelope.occurredAt,
          hiderBonusMinutes: eventEnvelope.event.payload.hiderBonusMinutes,
          statusByPlayerId: {}
        }
      };
    case 'lemon_phylactery_contact_changed': {
      const challenge = base.lemonPhylacteryChallenge;
      if (challenge?.sourceCardInstanceId !== eventEnvelope.event.payload.sourceCardInstanceId) return base;
      const { playerId, touching, bonusMinutesAwarded } = eventEnvelope.event.payload;
      return {
        ...base,
        lemonPhylacteryChallenge: {
          ...challenge,
          statusByPlayerId: {
            ...challenge.statusByPlayerId,
            [playerId]: { touching, updatedAt: eventEnvelope.occurredAt }
          }
        },
        awardedCurseBonusMinutes: (base.awardedCurseBonusMinutes ?? 0) + bonusMinutesAwarded
      };
    }
    case 'gamblers_feet_challenge_started':
      return {
        ...base,
        gamblersFeetChallenge: {
          sourceCardInstanceId: eventEnvelope.event.payload.sourceCardInstanceId,
          activatedAt: eventEnvelope.occurredAt,
          expiresAt: eventEnvelope.event.payload.expiresAt,
          durationMinutes: eventEnvelope.event.payload.durationMinutes,
          statusByPlayerId: {}
        }
      };
    case 'gamblers_feet_player_updated': {
      const challenge = base.gamblersFeetChallenge;
      if (challenge?.sourceCardInstanceId !== eventEnvelope.event.payload.sourceCardInstanceId) return base;
      const { playerId, stepsRemaining, unaccountedSteps, dieRoll } = eventEnvelope.event.payload;
      return {
        ...base,
        gamblersFeetChallenge: {
          ...challenge,
          statusByPlayerId: {
            ...challenge.statusByPlayerId,
            [playerId]: { stepsRemaining, unaccountedSteps, ...(dieRoll !== undefined ? { lastDieRoll: dieRoll } : {}), updatedAt: eventEnvelope.occurredAt }
          }
        }
      };
    }
    case 'egg_partner_challenge_started':
      return {
        ...base,
        eggPartnerChallenge: {
          sourceCardInstanceId: eventEnvelope.event.payload.sourceCardInstanceId,
          activatedAt: eventEnvelope.occurredAt,
          hiderBonusMinutes: eventEnvelope.event.payload.hiderBonusMinutes,
          statusByMemberId: {}
        }
      };
    case 'egg_partner_acquired': {
      const challenge = base.eggPartnerChallenge;
      if (challenge?.sourceCardInstanceId !== eventEnvelope.event.payload.sourceCardInstanceId) return base;
      return { ...base, eggPartnerChallenge: { ...challenge, eggAcquiredAt: eventEnvelope.occurredAt } };
    }
    case 'egg_partner_member_lost': {
      const challenge = base.eggPartnerChallenge;
      if (challenge?.sourceCardInstanceId !== eventEnvelope.event.payload.sourceCardInstanceId) return base;
      const { memberId, lossKind, bonusMinutesAwarded } = eventEnvelope.event.payload;
      return {
        ...base,
        eggPartnerChallenge: {
          ...challenge,
          statusByMemberId: { ...challenge.statusByMemberId, [memberId]: { lossKind, updatedAt: eventEnvelope.occurredAt } },
          bonusAwardedAt: bonusMinutesAwarded > 0 ? eventEnvelope.occurredAt : challenge.bonusAwardedAt
        },
        awardedCurseBonusMinutes: (base.awardedCurseBonusMinutes ?? 0) + bonusMinutesAwarded
      };
    }
    case 'jammed_door_challenge_started':
      return {
        ...base,
        jammedDoorChallenge: {
          sourceCardInstanceId: eventEnvelope.event.payload.sourceCardInstanceId,
          activatedAt: eventEnvelope.occurredAt,
          expiresAt: eventEnvelope.event.payload.expiresAt,
          durationMinutes: eventEnvelope.event.payload.durationMinutes,
          retryCooldownMinutes: eventEnvelope.event.payload.retryCooldownMinutes,
          minimumTotal: eventEnvelope.event.payload.minimumTotal,
          statusByDoorwayId: {}
        }
      };
    case 'jammed_door_roll_reported': {
      const challenge = base.jammedDoorChallenge;
      if (challenge?.sourceCardInstanceId !== eventEnvelope.event.payload.sourceCardInstanceId) return base;
      const { doorwayId, doorwayLabel, reportedByPlayerId, dieOne, dieTwo, total, passed, retryAt } = eventEnvelope.event.payload;
      return {
        ...base,
        jammedDoorChallenge: {
          ...challenge,
          statusByDoorwayId: {
            ...challenge.statusByDoorwayId,
            [doorwayId]: {
              doorwayLabel,
              lastAttemptAt: eventEnvelope.occurredAt,
              lastReportedByPlayerId: reportedByPlayerId,
              dieOne,
              dieTwo,
              total,
              ...(passed ? { passedAt: eventEnvelope.occurredAt } : { retryAt })
            }
          }
        }
      };
    }
    case 'question_response_expired': {
      const question = base.questionInstances[eventEnvelope.event.payload.questionInstanceId];
      if (!question) return base;
      return {
        ...base,
        questionInstances: {
          ...base.questionInstances,
          [question.questionInstanceId]: {
            ...question,
            lateResponseStartedAt: eventEnvelope.event.payload.lateResponseStartedAt
          }
        },
        timers: mapTimers(base.timers, (timer) =>
          timer.kind === 'question' && timer.ownerRef === question.questionInstanceId
            ? { ...timer, status: 'completed', remainingSeconds: 0 }
            : timer
        )
      };
    }
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
            answer: eventEnvelope.event.payload.answer,
            automaticResolution: eventEnvelope.event.payload.automaticResolution,
            lateResponseEndedAt: question?.lateResponseStartedAt ? eventEnvelope.occurredAt : undefined
          }
        },
        timers: mapTimers(base.timers, (timer) =>
          timer.kind === 'question' && timer.ownerRef === questionInstanceId
            ? { ...timer, status: 'completed', remainingSeconds: 0 }
            : timer
        )
      };
    }
    case 'question_vetoed': {
      const questionInstanceId = eventEnvelope.event.payload.questionInstanceId;
      const question = base.questionInstances[questionInstanceId];
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate,
        activeQuestionInstanceId: undefined,
        questionInstances: {
          ...base.questionInstances,
          [questionInstanceId]: { ...question, status: 'vetoed', resolvedAt: eventEnvelope.occurredAt }
        },
        timers: mapTimers(base.timers, (timer) => timer.kind === 'question' && timer.ownerRef === questionInstanceId
          ? { ...timer, status: 'completed', remainingSeconds: 0 }
          : timer)
      };
    }
    case 'question_randomized': {
      const { originalQuestionInstanceId, replacementQuestion, replacementQuestionTimer } = eventEnvelope.event.payload;
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate,
        activeQuestionInstanceId: replacementQuestion.questionInstanceId,
        questionInstances: {
          ...base.questionInstances,
          [originalQuestionInstanceId]: {
            ...base.questionInstances[originalQuestionInstanceId],
            status: 'canceled',
            resolvedAt: eventEnvelope.occurredAt
          },
          [replacementQuestion.questionInstanceId]: replacementQuestion
        },
        timers: {
          ...mapTimers(base.timers, (timer) => timer.kind === 'question' && timer.ownerRef === originalQuestionInstanceId
            ? { ...timer, status: 'completed', remainingSeconds: 0 }
            : timer),
          [replacementQuestionTimer.timerId]: replacementQuestionTimer
        }
      };
    }
    case 'question_null_answer_resolved': {
      const questionInstanceId = eventEnvelope.event.payload.questionInstanceId;
      const question = base.questionInstances[questionInstanceId];
      return {
        ...base,
        lifecycleState: eventEnvelope.event.payload.lifecycleState,
        seekPhaseSubstate: eventEnvelope.event.payload.seekPhaseSubstate,
        activeQuestionInstanceId: undefined,
        questionInstances: {
          ...base.questionInstances,
          [questionInstanceId]: {
            ...question,
            status: 'resolved',
            answer: eventEnvelope.event.payload.answer,
            automaticResolution: eventEnvelope.event.payload.automaticResolution,
            lateResponseEndedAt: question?.lateResponseStartedAt ? eventEnvelope.occurredAt : undefined,
            resolvedAt: eventEnvelope.occurredAt
          }
        },
        timers: mapTimers(base.timers, (timer) => timer.kind === 'question' && timer.ownerRef === questionInstanceId
          ? { ...timer, status: 'completed', remainingSeconds: 0 }
          : timer)
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
    case 'question_reward_dealt': {
      const questionInstanceId = eventEnvelope.event.payload.pendingReward.questionInstanceId;
      const bonus = base.questionRewardDrawBonus;
      const opportunitiesRemaining = bonus ? Math.max(0, bonus.opportunitiesRemaining - 1) : 0;
      return {
        ...base,
        questionRewardDrawBonus: bonus && opportunitiesRemaining > 0
          ? { ...bonus, opportunitiesRemaining }
          : undefined,
        pendingQuestionReward: eventEnvelope.event.payload.pendingReward,
        questionInstances: {
          ...base.questionInstances,
          [questionInstanceId]: {
            ...base.questionInstances[questionInstanceId],
            cardRewardStatus: 'pending'
          }
        },
        cardInstances: {
          ...base.cardInstances,
          ...Object.fromEntries(eventEnvelope.event.payload.cardInstances.map((card) => [card.cardInstanceId, card]))
        }
      };
    }
    case 'question_reward_draw_bonus_granted': {
      const current = base.questionRewardDrawBonus;
      return {
        ...base,
        questionRewardDrawBonus: {
          opportunitiesRemaining: (current?.opportunitiesRemaining ?? 0) + eventEnvelope.event.payload.questionCount,
          extraDrawCount: (current?.extraDrawCount ?? 0) + eventEnvelope.event.payload.extraDrawCount
        }
      };
    }
    case 'question_reward_chosen': {
      const updatedCards = Object.fromEntries(eventEnvelope.event.payload.cardInstances.map((card) => [card.cardInstanceId, card]));
      return {
        ...base,
        pendingQuestionReward: undefined,
        questionInstances: {
          ...base.questionInstances,
          [eventEnvelope.event.payload.questionInstanceId]: {
            ...base.questionInstances[eventEnvelope.event.payload.questionInstanceId],
            cardRewardStatus: 'complete'
          }
        },
        cardInstances: { ...base.cardInstances, ...updatedCards }
      };
    }
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
          copiedCardInstanceId: eventEnvelope.event.payload.copiedCardInstanceId,
          openedAt: eventEnvelope.occurredAt,
          openedByPlayerId: eventEnvelope.actor.playerId ?? eventEnvelope.actor.actorId,
          resolutionKind: eventEnvelope.event.payload.resolutionKind,
          moveOriginStationId: eventEnvelope.event.payload.moveOriginStationId,
          moveOriginStationName: eventEnvelope.event.payload.moveOriginStationName,
          moveDurationSeconds: eventEnvelope.event.payload.moveDurationSeconds,
          discardRequirement: eventEnvelope.event.payload.discardRequirement,
          drawCountOnResolve: eventEnvelope.event.payload.drawCountOnResolve,
          timeBonusMinutes: eventEnvelope.event.payload.timeBonusMinutes,
          endlessTumbleMinimumDistanceMeters: eventEnvelope.event.payload.endlessTumbleMinimumDistanceMeters,
          endlessTumbleSuccessfulDieResults: eventEnvelope.event.payload.endlessTumbleSuccessfulDieResults,
          gamblersFeetDurationMinutes: eventEnvelope.event.payload.gamblersFeetDurationMinutes,
          jammedDoorRetryCooldownMinutes: eventEnvelope.event.payload.jammedDoorRetryCooldownMinutes,
          jammedDoorMinimumTotal: eventEnvelope.event.payload.jammedDoorMinimumTotal,
          jammedDoorDurationMinutes: eventEnvelope.event.payload.jammedDoorDurationMinutes,
          questionTemplateCount: eventEnvelope.event.payload.questionTemplateCount,
          requireDistinctQuestionCategories: eventEnvelope.event.payload.requireDistinctQuestionCategories,
          questionRewardCount: eventEnvelope.event.payload.questionRewardCount,
          extraQuestionRewardDrawCount: eventEnvelope.event.payload.extraQuestionRewardDrawCount,
          sourceDeckId: eventEnvelope.event.payload.sourceDeckId,
          holderType: eventEnvelope.event.payload.holderType,
          holderId: eventEnvelope.event.payload.holderId,
          openingHandCardInstanceIds: eventEnvelope.event.payload.openingHandCardInstanceIds,
          hangman: eventEnvelope.event.payload.resolutionKind === 'hangman_challenge'
            ? { status: 'awaiting_word', guessedLetters: [], incorrectLetters: [] }
            : undefined
        },
        hiddenState: eventEnvelope.event.payload.resolutionKind === 'move'
          ? { ...base.hiddenState, hiderLocation: undefined, finalHidingSpot: undefined }
          : base.hiddenState
      };
    case 'hangman_word_set':
      if (base.activeCardResolution?.sourceCardInstanceId !== eventEnvelope.event.payload.sourceCardInstanceId) return base;
      return {
        ...base,
        activeCardResolution: {
          ...base.activeCardResolution,
          hangman: {
            status: 'playing',
            secretWord: eventEnvelope.event.payload.word,
            secretOwnerPlayerId: eventEnvelope.event.payload.secretOwnerPlayerId,
            guessedLetters: [],
            incorrectLetters: []
          }
        }
      };
    case 'hangman_letter_guessed': {
      if (base.activeCardResolution?.sourceCardInstanceId !== eventEnvelope.event.payload.sourceCardInstanceId) return base;
      const hangman = base.activeCardResolution.hangman;
      if (!hangman) return base;
      return {
        ...base,
        activeCardResolution: {
          ...base.activeCardResolution,
          hangman: {
            ...hangman,
            status: eventEnvelope.event.payload.solved ? 'solved' : 'playing',
            guessedLetters: [...hangman.guessedLetters, eventEnvelope.event.payload.letter],
            incorrectLetters: eventEnvelope.event.payload.correct
              ? hangman.incorrectLetters
              : [...hangman.incorrectLetters, eventEnvelope.event.payload.letter]
          }
        }
      };
    }
    case 'hangman_challenge_ended':
      if (base.activeCardResolution?.sourceCardInstanceId !== eventEnvelope.event.payload.sourceCardInstanceId) return base;
      return {
        ...base,
        activeCardResolution: {
          ...base.activeCardResolution,
          hangman: {
            ...base.activeCardResolution.hangman!,
            status: 'ended',
            revealedWord: eventEnvelope.event.payload.revealedWord
          }
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
    case 'question_templates_disabled':
      return {
        ...base,
        disabledQuestionTemplateIds: [...new Set([
          ...(base.disabledQuestionTemplateIds ?? []),
          ...eventEnvelope.event.payload.questionTemplateIds
        ])]
      };
    case 'question_category_disabled':
      return {
        ...base,
        disabledQuestionCategoryId: eventEnvelope.event.payload.categoryId,
        disabledQuestionCategorySourceCardInstanceId: eventEnvelope.event.payload.sourceCardInstanceId
      };
    case 'hider_hand_limit_expanded':
      return {
        ...base,
        hiderHandLimitBonus: (base.hiderHandLimitBonus ?? 0) + eventEnvelope.event.payload.increaseBy
      };
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
              pausedAt: eventEnvelope.occurredAt,
              remainingSeconds: remainingAt(timer, eventEnvelope.occurredAt)
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
          ? resumedTimer(timer, eventEnvelope.occurredAt)
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
