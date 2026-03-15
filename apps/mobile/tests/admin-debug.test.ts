import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  MatchProjection,
  SyncEnvelope
} from '../../../packages/shared-types/src/index.ts';

import type { ActiveMatchViewState } from '../src/state/app-shell-state.ts';
import {
  buildAdminControlModels,
  buildProjectionInspectionModel,
  buildRuntimeDiagnosticsModel,
  canAccessAdminTools
} from '../src/features/admin/admin-debug-state.ts';

function makeProjection(overrides: Partial<MatchProjection> = {}): MatchProjection {
  return {
    matchId: 'match-admin-1',
    contentPackId: 'pack-1',
    lifecycleState: 'seek_phase',
    seekPhaseSubstate: 'ready',
    players: [],
    teams: [],
    visibleMovementTracks: [],
    visibleChatChannels: [],
    visibleChatMessages: [],
    visibleAttachments: [],
    visibleCards: [],
    visibleQuestions: [],
    visibleConstraints: [],
    visibleTimers: [],
    visibleEventLog: [
      {
        eventId: 'event:1',
        sequence: 1,
        type: 'match_created',
        occurredAt: '2026-01-01T00:00:01.000Z',
        actorId: 'host-1',
        actorRole: 'host',
        visibilityScope: 'public_match'
      }
    ],
    hiddenState: {
      hiderLocation: {
        latitude: 50.087,
        longitude: 14.421,
        accuracyMeters: 12,
        lockedAt: '2026-01-01T00:10:00.000Z',
        lockedByPlayerId: 'hider-1'
      }
    },
    ...overrides
  };
}

function makeActiveMatch(overrides: Partial<ActiveMatchViewState> = {}): ActiveMatchViewState {
  return {
    runtimeKind: 'single_device_referee',
    runtimeMode: 'single_device_referee',
    matchId: 'match-admin-1',
    matchMode: 'single_device_referee',
    transportFlavor: 'single_device',
    connectionState: 'connected',
    recipient: {
      recipientId: 'host_admin:host-1',
      actorId: 'host-1',
      playerId: 'host-1',
      role: 'host',
      scope: 'host_admin'
    },
    lifecycleState: 'seek_phase',
    seekPhaseSubstate: 'ready',
    playerRole: 'host',
    snapshotVersion: 5,
    lastEventSequence: 9,
    projection: makeProjection(),
    ...overrides
  };
}

function makeSyncEnvelope(): SyncEnvelope {
  return {
    syncId: 'sync-admin-1',
    kind: 'delta',
    matchId: 'match-admin-1',
    runtimeMode: 'single_device_referee',
    projectionScope: 'host_admin',
    snapshotVersion: 5,
    lastEventSequence: 9,
    baseSnapshotVersion: 4,
    requiresResync: false,
    projectionDelivery: {
      deliveryId: 'delivery-admin-1',
      matchId: 'match-admin-1',
      runtimeMode: 'single_device_referee',
      projectionScope: 'host_admin',
      recipient: {
        recipientId: 'host_admin:host-1',
        actorId: 'host-1',
        playerId: 'host-1',
        role: 'host',
        scope: 'host_admin'
      },
      snapshotVersion: 5,
      lastEventSequence: 9,
      projection: makeProjection(),
      generatedAt: '2026-01-01T00:00:09.000Z'
    },
    eventStream: {
      matchId: 'match-admin-1',
      projectionScope: 'host_admin',
      fromSequence: 5,
      toSequence: 9,
      events: [
        {
          eventId: 'event:9',
          sequence: 9,
          type: 'match_paused',
          occurredAt: '2026-01-01T00:00:09.000Z',
          actorId: 'host-1',
          actorRole: 'host',
          visibilityScope: 'public_match',
          detail: 'summary'
        }
      ]
    },
    generatedAt: '2026-01-01T00:00:09.000Z'
  };
}

test('admin helper enables wired controls for host-admin views and keeps unsupported tools explicit', () => {
  const activeMatch = makeActiveMatch();

  assert.equal(canAccessAdminTools(activeMatch), true);

  const controls = buildAdminControlModels(activeMatch);
  const pause = controls.find((control) => control.action === 'pause_match');
  const resume = controls.find((control) => control.action === 'resume_match');
  const endMatch = controls.find((control) => control.action === 'end_match');
  const archive = controls.find((control) => control.action === 'archive_match');
  const recover = controls.find((control) => control.action === 'recover_snapshot');
  const rewind = controls.find((control) => control.action === 'rewind_repair');

  assert.equal(pause?.enabled, true);
  assert.equal(resume?.enabled, false);
  assert.equal(endMatch?.enabled, true);
  assert.equal(archive?.enabled, false);
  assert.equal(recover?.enabled, true);
  assert.equal(rewind?.wired, false);
  assert.equal(rewind?.enabled, false);
});

test('admin helper flips resume and admin-close archive availability in paused pregame states', () => {
  const activeMatch = makeActiveMatch({
    lifecycleState: 'map_setup',
    projection: makeProjection({
      lifecycleState: 'map_setup',
      paused: {
        reason: 'Debug pause',
        pausedAt: '2026-01-01T00:00:11.000Z',
        pausedByPlayerId: 'host-1',
        pausedByRole: 'host',
        resumeLifecycleState: 'map_setup'
      }
    })
  });

  const controls = buildAdminControlModels(activeMatch);
  const pause = controls.find((control) => control.action === 'pause_match');
  const resume = controls.find((control) => control.action === 'resume_match');
  const archive = controls.find((control) => control.action === 'archive_match');

  assert.equal(pause?.enabled, false);
  assert.equal(resume?.enabled, true);
  assert.equal(archive?.enabled, true);
  assert.deepEqual(archive?.command?.payload, { adminClose: true });
});

test('projection inspector redacts hidden state when sensitive inspection is not allowed', () => {
  const projection = makeProjection();
  const redacted = buildProjectionInspectionModel(projection, {
    allowSensitiveState: false
  });
  const privileged = buildProjectionInspectionModel(projection, {
    allowSensitiveState: true
  });

  assert.equal(redacted.rawProjectionJson.includes('hiderLocation'), false);
  assert.equal(privileged.rawProjectionJson.includes('hiderLocation'), true);
});

test('spectator view cannot access admin tools and diagnostics still summarize sync state', () => {
  const activeMatch = makeActiveMatch({
    playerRole: 'spectator',
    recipient: {
      recipientId: 'public_match',
      actorId: 'spectator-1',
      playerId: 'spectator-1',
      role: 'spectator',
      scope: 'public_match'
    },
    projection: makeProjection({
      hiddenState: undefined
    })
  });

  assert.equal(canAccessAdminTools(activeMatch), false);

  const controls = buildAdminControlModels(activeMatch);
  assert.equal(controls.every((control) => !control.enabled), true);

  const diagnostics = buildRuntimeDiagnosticsModel(activeMatch, makeSyncEnvelope());
  assert.equal(diagnostics.runtimeMode, 'single_device_referee');
  assert.equal(diagnostics.eventStreamRange, '5 -> 9');
  assert.deepEqual(diagnostics.recentEventTypes, ['match_paused']);
});
