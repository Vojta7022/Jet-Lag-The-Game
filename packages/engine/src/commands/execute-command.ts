import { randomUUID } from 'node:crypto';

import type {
  CardDefinition,
  CardInstanceModel,
  CommandEnvelope,
  ContentPack,
  DomainEventEnvelope,
  MatchAggregate,
  RoleAssignmentModel,
  TeamModel,
  TimerModel
} from '../../../shared-types/src/index.ts';
import { buildConstraintArtifactsForRegion } from '../../../geo/src/index.ts';

import { getPlayerRole, getPlayerTeam } from '../../../domain/src/index.ts';
import {
  getCardDefinition,
  getHidePhaseDurationSeconds,
  getQuestionCooldownSeconds,
  getQuestionTemplate
} from '../helpers/content-pack.ts';
import { reduceMatchAggregate } from '../reducer.ts';
import { validateCommandEnvelope } from './validate-command.ts';

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
    eventId: randomUUID(),
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
    .sort((left, right) => left.cardInstanceId.localeCompare(right.cardInstanceId))[0];
}

function buildCooldownTimer(aggregate: MatchAggregate, contentPack: ContentPack, templateId: string, occurredAt: string): TimerModel {
  const durationSeconds = getQuestionCooldownSeconds(contentPack, aggregate.selectedRulesetId, templateId);
  return {
    timerId: `cooldown:${randomUUID()}`,
    kind: 'cooldown',
    status: 'running',
    durationSeconds,
    remainingSeconds: durationSeconds,
    startedAt: occurredAt
  };
}

function buildHideTimer(contentPack: ContentPack, rulesetId: string | undefined, occurredAt: string): TimerModel {
  const durationSeconds = getHidePhaseDurationSeconds(contentPack, rulesetId);
  return {
    timerId: 'hide-phase',
    kind: 'hide',
    status: 'running',
    durationSeconds,
    remainingSeconds: durationSeconds,
    startedAt: occurredAt
  };
}

function eventsForCommand(
  aggregate: MatchAggregate | undefined,
  envelope: CommandEnvelope,
  contentPack: ContentPack
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
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'authority', {
          type: 'match_started',
          payload: {
            lifecycleState: 'hide_phase',
            timer: buildHideTimer(contentPack, aggregate?.selectedRulesetId, envelope.occurredAt)
          }
        })
      ];
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
    case 'begin_question_prompt':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'question_prompt_opened',
          payload: {
            lifecycleState: 'seek_phase',
            seekPhaseSubstate: 'awaiting_question_selection'
          }
        })
      ];
    case 'ask_question': {
      const template = getQuestionTemplate(contentPack, envelope.command.payload.templateId)!;
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'question_asked',
          payload: {
            ...envelope.command.payload,
            question: {
              questionInstanceId: envelope.command.payload.questionInstanceId,
              templateId: template.templateId,
              categoryId: template.categoryId,
              askedByPlayerId: envelope.actor.playerId ?? envelope.actor.actorId,
              targetTeamId: envelope.command.payload.targetTeamId,
              status: 'awaiting_answer',
              askedAt: envelope.occurredAt
            },
            lifecycleState: 'seek_phase',
            seekPhaseSubstate: 'awaiting_question_answer'
          }
        })
      ];
    }
    case 'answer_question':
      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'question_answered',
          payload: {
            ...envelope.command.payload,
            lifecycleState: 'seek_phase',
            seekPhaseSubstate: 'applying_constraints'
          }
        })
      ];
    case 'apply_constraint': {
      const question = aggregate!.questionInstances[envelope.command.payload.questionInstanceId];
      const constraintRecordId = `constraint:${randomUUID()}`;
      const constraintArtifacts = aggregate?.mapRegion
        ? buildConstraintArtifactsForRegion({
            region: aggregate.mapRegion,
            metadata: envelope.command.payload.metadata,
            createdAt: envelope.occurredAt,
            constraintRecordId
          })
        : {
            resolutionMode: 'metadata_only' as const,
            artifacts: []
          };
      const cooldownTimer = envelope.command.payload.openCardResolution
        ? undefined
        : buildCooldownTimer(aggregate!, contentPack, question.templateId, envelope.occurredAt);

      return [
        makeEventEnvelope(aggregate, envelope, 0, 'public_match', {
          type: 'constraint_applied',
          payload: {
            ...envelope.command.payload,
            constraint: {
              constraintRecordId,
              constraintId: envelope.command.payload.constraintId,
              status: 'active',
              sourceQuestionInstanceId: envelope.command.payload.questionInstanceId,
              resolutionMode: constraintArtifacts.resolutionMode,
              artifacts: constraintArtifacts.artifacts,
              metadata: envelope.command.payload.metadata ?? {},
              createdAt: envelope.occurredAt
            },
            lifecycleState: 'seek_phase',
            seekPhaseSubstate: envelope.command.payload.openCardResolution
              ? 'awaiting_card_resolution'
              : 'cooldown',
            cooldownTimer
          }
        })
      ];
    }
    case 'draw_card': {
      const card = aggregate ? findTopCardInDeck(aggregate, envelope.command.payload.deckId) : undefined;
      if (!card) {
        return [];
      }

      const team = getPlayerTeam(aggregate!, envelope.actor.playerId);
      const holderType = team ? 'team' : 'player';
      const holderId = team?.teamId ?? envelope.actor.playerId ?? envelope.actor.actorId;

      return [
        makeEventEnvelope(aggregate, envelope, 0, 'team_private', {
          type: 'card_drawn',
          payload: {
            ...envelope.command.payload,
            cardInstance: {
              ...card,
              zone: 'hand',
              holderType,
              holderId,
              updatedAt: envelope.occurredAt
            }
          }
        })
      ];
    }
    case 'play_card': {
      const currentCard = aggregate!.cardInstances[envelope.command.payload.cardInstanceId];
      const cardDefinition = getCardDefinition(contentPack, currentCard.cardDefinitionId) as CardDefinition;
      const opensResolutionWindow =
        cardDefinition.automationLevel !== 'authoritative' && aggregate?.lifecycleState === 'seek_phase';
      const playedCard = {
        ...currentCard,
        zone: opensResolutionWindow ? 'pending_resolution' : 'discard_pile',
        holderType: currentCard.holderType,
        holderId: currentCard.holderId,
        updatedAt: envelope.occurredAt
      };

      const events = [
        makeEventEnvelope(aggregate, envelope, 0, 'team_private', {
          type: 'card_played',
          payload: {
            ...envelope.command.payload,
            cardInstance: playedCard
          }
        })
      ];

      if (opensResolutionWindow) {
        events.push(
          makeEventEnvelope(aggregate, envelope, 1, 'team_private', {
            type: 'card_resolution_opened',
            payload: {
              sourceCardInstanceId: currentCard.cardInstanceId,
              seekPhaseSubstate: 'awaiting_card_resolution',
              lifecycleState: aggregate!.lifecycleState
            }
          })
        );
      }

      return events;
    }
    case 'resolve_card_window': {
      const activeQuestion = aggregate?.activeQuestionInstanceId
        ? aggregate.questionInstances[aggregate.activeQuestionInstanceId]
        : undefined;

      return [
        makeEventEnvelope(aggregate, envelope, 0, 'team_private', {
          type: 'card_resolution_closed',
          payload: {
            ...envelope.command.payload,
            seekPhaseSubstate: 'cooldown',
            lifecycleState: 'seek_phase',
            cooldownTimer: activeQuestion
              ? buildCooldownTimer(aggregate!, contentPack, activeQuestion.templateId, envelope.occurredAt)
              : undefined
          }
        })
      ];
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
  contentPack: ContentPack
): ExecuteCommandResult {
  const issues = validateCommandEnvelope(aggregate, envelope, contentPack);
  if (issues.length > 0) {
    throw new EngineCommandError(issues[0]?.message ?? 'Command validation failed.', issues);
  }

  const events = eventsForCommand(aggregate, envelope, contentPack);
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
