import type {
  DomainCommand,
  MatchLifecycleState,
  MatchProjection,
  SyncEnvelope
} from '../../../../../packages/shared-types/src/index.ts';

import type { ActiveMatchViewState } from '../../state/app-shell-state.ts';

export type AdminControlAction =
  | 'pause_match'
  | 'resume_match'
  | 'end_match'
  | 'archive_match'
  | 'recover_snapshot'
  | 'rebuild_from_log'
  | 'rewind_repair'
  | 'export_bundle';

export interface AdminControlModel {
  action: AdminControlAction;
  label: string;
  description: string;
  wired: boolean;
  enabled: boolean;
  tone: 'primary' | 'secondary' | 'danger';
  command?: DomainCommand;
  disabledReason?: string;
}

export interface RuntimeDiagnosticsModel {
  runtimeKind?: string;
  runtimeMode?: string;
  transportFlavor?: string;
  connectionState?: string;
  matchId?: string;
  matchMode?: string;
  projectionScope?: string;
  snapshotVersion?: number;
  lastEventSequence?: number;
  syncKind?: string;
  requiresResync?: boolean;
  baseSnapshotVersion?: number;
  eventStreamRange?: string;
  eventStreamCount?: number;
  recentEventTypes: string[];
  joinCode?: string;
  joinExpiresAt?: string;
}

export interface ProjectionInspectionModel {
  summaryRows: Array<{
    label: string;
    value: string;
  }>;
  rawProjectionJson: string;
}

const ACTIVE_GAMEPLAY_STATES = new Set<MatchLifecycleState>(['hide_phase', 'seek_phase', 'endgame']);
const ADMIN_CLOSE_STATES = new Set<MatchLifecycleState>([
  'draft',
  'lobby',
  'role_assignment',
  'rules_confirmation',
  'map_setup'
]);

export function canAccessAdminTools(activeMatch?: ActiveMatchViewState): boolean {
  if (!activeMatch) {
    return false;
  }

  return activeMatch.recipient.scope === 'host_admin' ||
    activeMatch.playerRole === 'host' ||
    activeMatch.recipient.role === 'host';
}

export function buildAdminControlModels(activeMatch?: ActiveMatchViewState): AdminControlModel[] {
  const canAccess = canAccessAdminTools(activeMatch);
  const projection = activeMatch?.projection;
  const lifecycleState = projection?.lifecycleState;
  const isPaused = Boolean(projection?.paused);
  const canArchiveWithAdminClose = lifecycleState ? ADMIN_CLOSE_STATES.has(lifecycleState) : false;

  return [
    {
      action: 'pause_match',
      label: 'Pause Match',
      description: 'Requests the real pause command through the current runtime and preserves the resume target state.',
      wired: true,
      enabled: canAccess && !isPaused && lifecycleState !== 'archived',
      tone: 'danger',
      command: {
        type: 'pause_match',
        payload: {
          reason: 'Paused from the mobile admin/debug shell.'
        }
      },
      disabledReason: buildPauseDisabledReason(canAccess, isPaused, lifecycleState)
    },
    {
      action: 'resume_match',
      label: 'Resume Match',
      description: 'Resumes from the stored pause overlay and returns the match to its recorded lifecycle state.',
      wired: true,
      enabled: canAccess && isPaused,
      tone: 'primary',
      command: {
        type: 'resume_match',
        payload: {}
      },
      disabledReason: !canAccess
        ? 'Only host-admin or referee views can resume a match.'
        : !isPaused
          ? 'The match is not currently paused.'
          : undefined
    },
    {
      action: 'end_match',
      label: 'End Match',
      description: 'Ends active gameplay through the engine and moves the match into the completed lifecycle state.',
      wired: true,
      enabled: canAccess && Boolean(lifecycleState && ACTIVE_GAMEPLAY_STATES.has(lifecycleState)),
      tone: 'danger',
      command: {
        type: 'end_match',
        payload: {
          reason: 'Ended from the mobile admin/debug shell.'
        }
      },
      disabledReason: !canAccess
        ? 'Only host-admin or referee views can end the match.'
        : lifecycleState && ACTIVE_GAMEPLAY_STATES.has(lifecycleState)
          ? undefined
          : lifecycleState
            ? 'Matches can only end from hide, seek, or endgame states.'
            : 'No active lifecycle state is available yet.'
    },
    {
      action: 'archive_match',
      label: 'Archive Match',
      description: canArchiveWithAdminClose
        ? 'Uses the real archive command with explicit admin-close semantics from a pregame setup state.'
        : 'Archives a completed match through the engine/runtime contracts.',
      wired: true,
      enabled: canAccess && Boolean(
        lifecycleState === 'game_complete' ||
        canArchiveWithAdminClose
      ),
      tone: 'secondary',
      command: {
        type: 'archive_match',
        payload: canArchiveWithAdminClose ? { adminClose: true } : {}
      },
      disabledReason: buildArchiveDisabledReason(canAccess, lifecycleState)
    },
    {
      action: 'recover_snapshot',
      label: 'Recover Stored Snapshot',
      description: 'Uses the runtime recovery surface to rebuild the latest stored snapshot plus trailing event replay, then refreshes the scoped projection.',
      wired: true,
      enabled: canAccess && Boolean(activeMatch),
      tone: 'secondary',
      disabledReason: !canAccess
        ? 'Only host-admin or referee views can request runtime recovery.'
        : undefined
    },
    {
      action: 'rebuild_from_log',
      label: 'Rebuild From Log',
      description: 'Explicit operator-triggered full replay from the UI is not exposed yet.',
      wired: false,
      enabled: false,
      tone: 'secondary',
      disabledReason: 'Current runtimes only expose recovery through the shared snapshot-recovery contract.'
    },
    {
      action: 'rewind_repair',
      label: 'Rewind / Repair',
      description: 'Reserved for future repair tooling once rewind and repair commands exist in the engine/runtime contracts.',
      wired: false,
      enabled: false,
      tone: 'secondary',
      disabledReason: 'No rewind or repair command is available yet.'
    },
    {
      action: 'export_bundle',
      label: 'Archive / Export Bundle',
      description: 'Reserved for future archive export, debug-bundle download, or log export workflows.',
      wired: false,
      enabled: false,
      tone: 'secondary',
      disabledReason: 'Export and download flows are not exposed by the current mobile/runtime foundation yet.'
    }
  ];
}

export function buildRuntimeDiagnosticsModel(
  activeMatch?: ActiveMatchViewState,
  lastSync?: SyncEnvelope
): RuntimeDiagnosticsModel {
  return {
    runtimeKind: activeMatch?.runtimeKind,
    runtimeMode: activeMatch?.runtimeMode,
    transportFlavor: activeMatch?.transportFlavor,
    connectionState: activeMatch?.connectionState,
    matchId: activeMatch?.matchId,
    matchMode: activeMatch?.matchMode,
    projectionScope: activeMatch?.recipient.scope,
    snapshotVersion: activeMatch?.snapshotVersion,
    lastEventSequence: activeMatch?.lastEventSequence,
    syncKind: lastSync?.kind,
    requiresResync: lastSync?.requiresResync,
    baseSnapshotVersion: lastSync?.baseSnapshotVersion,
    eventStreamRange: lastSync
      ? `${lastSync.eventStream.fromSequence} -> ${lastSync.eventStream.toSequence}`
      : undefined,
    eventStreamCount: lastSync?.eventStream.events.length,
    recentEventTypes: lastSync?.eventStream.events.map((eventFrame) => eventFrame.type) ?? [],
    joinCode: activeMatch?.joinOffer?.joinCode,
    joinExpiresAt: activeMatch?.joinOffer?.expiresAt
  };
}

export function buildProjectionInspectionModel(
  projection: MatchProjection | undefined,
  options: {
    allowSensitiveState: boolean;
  }
): ProjectionInspectionModel {
  if (!projection) {
    return {
      summaryRows: [],
      rawProjectionJson: '{}'
    };
  }

  const sanitizedProjection = options.allowSensitiveState
    ? projection
    : {
        ...projection,
        hiddenState: undefined
      };

  return {
    summaryRows: [
      { label: 'Lifecycle State', value: projection.lifecycleState },
      { label: 'Seek Substate', value: projection.seekPhaseSubstate ?? 'n/a' },
      { label: 'Paused', value: projection.paused ? `Yes: ${projection.paused.reason}` : 'No' },
      { label: 'Players', value: String(projection.players.length) },
      { label: 'Teams', value: String(projection.teams.length) },
      { label: 'Visible Cards', value: String(projection.visibleCards.length) },
      { label: 'Visible Questions', value: String(projection.visibleQuestions.length) },
      { label: 'Visible Constraints', value: String(projection.visibleConstraints.length) },
      { label: 'Visible Chat Messages', value: String(projection.visibleChatMessages.length) },
      { label: 'Visible Attachments', value: String(projection.visibleAttachments.length) },
      { label: 'Movement Tracks', value: String(projection.visibleMovementTracks.length) },
      { label: 'Timers', value: String(projection.visibleTimers.length) },
      { label: 'Event Log Entries', value: String(projection.visibleEventLog.length) },
      { label: 'Map Loaded', value: projection.visibleMap ? projection.visibleMap.displayName : 'No' },
      {
        label: 'Hidden State',
        value: options.allowSensitiveState
          ? projection.hiddenState?.hiderLocation
            ? 'Visible to this scope'
            : 'No hidden location is currently stored'
          : 'Redacted for this scope'
      }
    ],
    rawProjectionJson: JSON.stringify(sanitizedProjection, null, 2)
  };
}

function buildPauseDisabledReason(
  canAccess: boolean,
  isPaused: boolean,
  lifecycleState: MatchLifecycleState | undefined
) {
  if (!canAccess) {
    return 'Only host-admin or referee views can pause the match.';
  }

  if (isPaused) {
    return 'The match is already paused.';
  }

  if (lifecycleState === 'archived') {
    return 'Archived matches cannot be paused.';
  }

  return undefined;
}

function buildArchiveDisabledReason(
  canAccess: boolean,
  lifecycleState: MatchLifecycleState | undefined
) {
  if (!canAccess) {
    return 'Only host-admin or referee views can archive the match.';
  }

  if (lifecycleState === 'archived') {
    return 'The match is already archived.';
  }

  if (lifecycleState === 'game_complete') {
    return undefined;
  }

  if (lifecycleState && ADMIN_CLOSE_STATES.has(lifecycleState)) {
    return undefined;
  }

  return 'Archive is only available after match completion or explicit admin close from pregame setup states.';
}
