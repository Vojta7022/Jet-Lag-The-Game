import type { MatchProjection } from '../../../../../packages/shared-types/src/index.ts';

export interface TimingBannerModel {
  tone: 'info' | 'warning' | 'success';
  title: string;
  detail?: string;
}

export interface TimingRowModel {
  timerId: string;
  label: string;
  remainingSeconds: number;
  remainingLabel: string;
  statusLabel: string;
  detail: string;
  kind: string;
  status: string;
}

export interface MatchTimingDisplayModel {
  banner?: TimingBannerModel;
  phaseLabel: string;
  syncAgeLabel?: string;
  timers: TimingRowModel[];
  pauseSummary?: string;
  pauseDetail?: string;
  flowLockSummary?: string;
  flowLockDetail?: string;
}

interface BuildMatchTimingDisplayModelOptions {
  projection?: MatchProjection;
  syncGeneratedAt?: string;
  nowMs: number;
}

interface VisibleTimerLike {
  timerId: string;
  kind: string;
  status: string;
  remainingSeconds: number;
}

function parseTime(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatDurationWords(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export function formatSyncAge(syncGeneratedAt: string | undefined, nowMs: number): string | undefined {
  const syncTime = parseTime(syncGeneratedAt);
  if (syncTime === undefined) {
    return undefined;
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - syncTime) / 1000));
  if (elapsedSeconds < 2) {
    return 'Just now';
  }

  return `${formatDurationWords(elapsedSeconds)} ago`;
}

export function getEffectiveRemainingSeconds(
  timer: VisibleTimerLike,
  syncGeneratedAt: string | undefined,
  nowMs: number
): number {
  const baseRemaining = Math.max(0, timer.remainingSeconds);
  if (timer.status !== 'running') {
    return baseRemaining;
  }

  const syncTime = parseTime(syncGeneratedAt);
  if (syncTime === undefined) {
    return baseRemaining;
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - syncTime) / 1000));
  return Math.max(0, baseRemaining - elapsedSeconds);
}

function formatPhaseLabel(projection: MatchProjection): string {
  return projection.seekPhaseSubstate
    ? `${projection.lifecycleState} / ${projection.seekPhaseSubstate}`
    : projection.lifecycleState;
}

function formatTimerLabel(timer: VisibleTimerLike): string {
  switch (timer.kind) {
    case 'hide':
      return 'Hide Phase';
    case 'cooldown':
      return 'Question Cooldown';
    case 'question':
      return 'Question Timer';
    case 'status_effect':
      return 'Effect Timer';
    case 'custom':
      return 'Match Timer';
    default:
      return 'Timer';
  }
}

function formatTimerStatusLabel(timer: VisibleTimerLike, remainingSeconds: number): string {
  if (timer.status === 'completed') {
    return 'Completed';
  }

  if (timer.status === 'paused') {
    return 'Paused';
  }

  if (remainingSeconds <= 0) {
    return 'Due';
  }

  return 'Running';
}

function formatTimerDetail(timer: VisibleTimerLike, remainingSeconds: number): string {
  if (timer.status === 'completed') {
    return 'This timer has completed.';
  }

  if (timer.status === 'paused') {
    return `${formatDurationWords(remainingSeconds)} left when the match was paused.`;
  }

  if (remainingSeconds <= 0) {
    return 'Waiting for the next synced state update.';
  }

  return `${formatDurationWords(remainingSeconds)} remaining.`;
}

function timerPriority(timer: VisibleTimerLike): number {
  switch (timer.kind) {
    case 'hide':
      return 0;
    case 'cooldown':
      return 1;
    case 'question':
      return 2;
    case 'status_effect':
      return 3;
    case 'custom':
      return 4;
    default:
      return 5;
  }
}

function buildTimerRows(
  projection: MatchProjection,
  syncGeneratedAt: string | undefined,
  nowMs: number
): TimingRowModel[] {
  return [...projection.visibleTimers]
    .sort((left, right) => {
      const priorityDelta = timerPriority(left) - timerPriority(right);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.timerId.localeCompare(right.timerId);
    })
    .map((timer) => {
      const remainingSeconds = getEffectiveRemainingSeconds(timer, syncGeneratedAt, nowMs);
      return {
        timerId: timer.timerId,
        label: formatTimerLabel(timer),
        remainingSeconds,
        remainingLabel: formatCountdown(remainingSeconds),
        statusLabel: formatTimerStatusLabel(timer, remainingSeconds),
        detail: formatTimerDetail(timer, remainingSeconds),
        kind: timer.kind,
        status: timer.status
      };
    });
}

function buildPauseSummary(
  projection: MatchProjection,
  nowMs: number
): Pick<MatchTimingDisplayModel, 'pauseSummary' | 'pauseDetail'> {
  if (!projection.paused) {
    return {};
  }

  const pausedAt = parseTime(projection.paused.pausedAt);
  const elapsedSeconds =
    pausedAt === undefined ? undefined : Math.max(0, Math.floor((nowMs - pausedAt) / 1000));
  const resumeTarget = projection.paused.resumeSeekPhaseSubstate
    ? `${projection.paused.resumeLifecycleState} / ${projection.paused.resumeSeekPhaseSubstate}`
    : projection.paused.resumeLifecycleState;

  return {
    pauseSummary: projection.paused.reason,
    pauseDetail:
      elapsedSeconds === undefined
        ? `Timers are frozen. Resuming returns the match to ${resumeTarget}.`
        : `Paused ${formatDurationWords(elapsedSeconds)} ago. Timers are frozen until the match resumes in ${resumeTarget}.`
  };
}

function buildFlowLockSummary(projection: MatchProjection): Pick<MatchTimingDisplayModel, 'flowLockSummary' | 'flowLockDetail'> {
  if (projection.activeCardResolution) {
    return {
      flowLockSummary: 'Card window open',
      flowLockDetail: 'The current card effect stays open until a permitted role closes the resolution window.'
    };
  }

  if (projection.lifecycleState === 'seek_phase' && projection.seekPhaseSubstate === 'awaiting_question_answer') {
    return {
      flowLockSummary: 'Waiting for answer',
      flowLockDetail: 'The active question must be answered before the candidate area can update.'
    };
  }

  if (projection.lifecycleState === 'seek_phase' && projection.seekPhaseSubstate === 'applying_constraints') {
    return {
      flowLockSummary: 'Resolving question result',
      flowLockDetail: 'The runtime is applying the next constraint to the bounded search area.'
    };
  }

  if (projection.lifecycleState === 'seek_phase' && projection.seekPhaseSubstate === 'cooldown') {
    return {
      flowLockSummary: 'Question cooldown',
      flowLockDetail: 'A new question cannot start until the current cooldown timer completes.'
    };
  }

  return {};
}

function buildBanner(
  projection: MatchProjection,
  timers: TimingRowModel[],
  model: Pick<MatchTimingDisplayModel, 'pauseSummary' | 'pauseDetail' | 'flowLockSummary' | 'flowLockDetail'>
): TimingBannerModel | undefined {
  if (projection.paused) {
    return {
      tone: 'warning',
      title: 'Match paused',
      detail: model.pauseDetail
    };
  }

  const hideTimer = timers.find((timer) => timer.kind === 'hide' && timer.status !== 'completed');
  if (projection.lifecycleState === 'hide_phase' && hideTimer) {
    return {
      tone: 'info',
      title: `Hide phase: ${hideTimer.remainingLabel} remaining`,
      detail: 'Seekers stay locked out of questions until the hide phase ends.'
    };
  }

  const cooldownTimer = timers.find((timer) => timer.kind === 'cooldown' && timer.status !== 'completed');
  if (projection.lifecycleState === 'seek_phase' && projection.seekPhaseSubstate === 'cooldown' && cooldownTimer) {
    return {
      tone: 'info',
      title: `Question cooldown: ${cooldownTimer.remainingLabel} remaining`,
      detail: 'The next question opens when this cooldown finishes.'
    };
  }

  if (projection.activeCardResolution) {
    return {
      tone: 'warning',
      title: 'Card resolution is blocking play',
      detail: 'Resolve the active card window before the next cooldown or question step can continue.'
    };
  }

  if (model.flowLockSummary) {
    return {
      tone: 'info',
      title: model.flowLockSummary,
      detail: model.flowLockDetail
    };
  }

  const primaryTimer = timers.find((timer) => timer.status !== 'completed');
  if (!primaryTimer) {
    return undefined;
  }

  return {
    tone: 'success',
    title: `${primaryTimer.label}: ${primaryTimer.remainingLabel}`,
    detail: primaryTimer.detail
  };
}

export function buildMatchTimingDisplayModel(
  options: BuildMatchTimingDisplayModelOptions
): MatchTimingDisplayModel | undefined {
  if (!options.projection) {
    return undefined;
  }

  const timers = buildTimerRows(options.projection, options.syncGeneratedAt, options.nowMs);
  const pauseSummary = buildPauseSummary(options.projection, options.nowMs);
  const flowLockSummary = buildFlowLockSummary(options.projection);

  return {
    phaseLabel: formatPhaseLabel(options.projection),
    syncAgeLabel: formatSyncAge(options.syncGeneratedAt, options.nowMs),
    timers,
    ...pauseSummary,
    ...flowLockSummary,
    banner: buildBanner(options.projection, timers, {
      ...pauseSummary,
      ...flowLockSummary
    })
  };
}
