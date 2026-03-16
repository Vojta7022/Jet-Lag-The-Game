import { createRandomUuid } from '../../shared-types/src/index.ts';

import type {
  CommandEnvelope,
  ContentPack,
  DomainCommand,
  DomainEventEnvelope,
  MatchAggregate
} from '../../shared-types/src/index.ts';
import { executeCommand } from '../../engine/src/index.ts';
import { getTimerByKind, hasLockedHiderLocation } from '../../domain/src/index.ts';

export interface RuntimeReconciliationResult {
  aggregate: MatchAggregate;
  events: DomainEventEnvelope[];
}

function timerExpired(timerStartedAt: string, durationSeconds: number, nowIso: string): boolean {
  const startedAtMs = Date.parse(timerStartedAt);
  const nowMs = Date.parse(nowIso);

  if (Number.isNaN(startedAtMs) || Number.isNaN(nowMs)) {
    return false;
  }

  return startedAtMs + durationSeconds * 1000 <= nowMs;
}

function buildSystemEnvelope(
  aggregate: MatchAggregate,
  command: DomainCommand,
  occurredAt: string,
  step: number
): CommandEnvelope {
  return {
    commandId: `system:${command.type}:${createRandomUuid()}`,
    matchId: aggregate.matchId,
    actor: {
      actorId: 'system-runtime',
      role: 'system'
    },
    occurredAt,
    idempotencyKey: `system:${command.type}:${occurredAt}:${step}`,
    clientSequence: aggregate.revision + step + 1,
    command
  };
}

function nextAutomaticCommand(aggregate: MatchAggregate, nowIso: string): DomainCommand | undefined {
  if (aggregate.paused) {
    return undefined;
  }

  const hideTimer = getTimerByKind(aggregate, 'hide');
  if (
    aggregate.lifecycleState === 'hide_phase' &&
    hideTimer &&
    hideTimer.status === 'running' &&
    hasLockedHiderLocation(aggregate) &&
    timerExpired(hideTimer.startedAt, hideTimer.durationSeconds, nowIso)
  ) {
    return {
      type: 'end_hide_phase',
      payload: {}
    };
  }

  const cooldownTimer = getTimerByKind(aggregate, 'cooldown');
  if (
    aggregate.lifecycleState === 'seek_phase' &&
    aggregate.seekPhaseSubstate === 'cooldown' &&
    cooldownTimer &&
    cooldownTimer.status === 'running' &&
    timerExpired(cooldownTimer.startedAt, cooldownTimer.durationSeconds, nowIso)
  ) {
    return {
      type: 'complete_cooldown',
      payload: {}
    };
  }

  return undefined;
}

export function reconcileRuntimeState(args: {
  aggregate: MatchAggregate;
  contentPack: ContentPack;
  occurredAt: string;
}): RuntimeReconciliationResult {
  let currentAggregate = args.aggregate;
  const events: DomainEventEnvelope[] = [];

  for (let step = 0; step < 4; step += 1) {
    const nextCommand = nextAutomaticCommand(currentAggregate, args.occurredAt);
    if (!nextCommand) {
      break;
    }

    const result = executeCommand(
      currentAggregate,
      buildSystemEnvelope(currentAggregate, nextCommand, args.occurredAt, step),
      args.contentPack
    );

    currentAggregate = result.aggregate;
    events.push(...result.events);
  }

  return {
    aggregate: currentAggregate,
    events
  };
}
