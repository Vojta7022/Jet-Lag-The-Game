import assert from 'node:assert/strict';
import test from 'node:test';

import type { MatchProjection, SyncEnvelope } from '../../../packages/shared-types/src/index.ts';

import {
  appShellReducer,
  createInitialShellState
} from '../src/state/app-shell-state.ts';

function makeProjection(overrides: Partial<MatchProjection> = {}): MatchProjection {
  return {
    matchId: 'match-1',
    contentPackId: 'pack-1',
    lifecycleState: 'draft',
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
    visibleEventLog: [],
    ...overrides
  };
}

function makeSyncEnvelope(overrides: Partial<SyncEnvelope> = {}): SyncEnvelope {
  return {
    syncId: 'sync-1',
    kind: 'snapshot',
    matchId: 'match-1',
    runtimeMode: 'single_device_referee',
    projectionScope: 'host_admin',
    snapshotVersion: 1,
    lastEventSequence: 1,
    requiresResync: false,
    projectionDelivery: {
      deliveryId: 'delivery-1',
      matchId: 'match-1',
      runtimeMode: 'single_device_referee',
      projectionScope: 'host_admin',
      recipient: {
        recipientId: 'host_admin:host-1',
        actorId: 'host-1',
        playerId: 'host-1',
        role: 'host',
        scope: 'host_admin'
      },
      snapshotVersion: 1,
      lastEventSequence: 1,
      projection: makeProjection(),
      generatedAt: '2026-01-01T00:00:01.000Z'
    },
    eventStream: {
      matchId: 'match-1',
      projectionScope: 'host_admin',
      fromSequence: 0,
      toSequence: 1,
      events: []
    },
    generatedAt: '2026-01-01T00:00:01.000Z',
    ...overrides
  };
}

test('app shell reducer saves runtime/session data and applies a connected match snapshot', () => {
  let state = createInitialShellState('in_memory');
  state = appShellReducer(state, {
    type: 'runtime_selected',
    runtimeKind: 'online_foundation'
  });
  state = appShellReducer(state, {
    type: 'session_saved',
    sessionProfile: {
      displayName: 'Host',
      playerId: 'host-1',
      authUserId: 'auth-host-1'
    }
  });
  state = appShellReducer(state, { type: 'operation_started' });

  const syncEnvelope = makeSyncEnvelope();
  state = appShellReducer(state, {
    type: 'match_connected',
    summary: {
      runtimeKind: 'online_foundation',
      runtimeMode: 'online_cloud',
      matchId: 'match-1',
      matchMode: 'online',
      transportFlavor: 'online',
      connectionState: 'connected',
      recipient: syncEnvelope.projectionDelivery.recipient,
      lifecycleState: 'draft',
      playerRole: 'host',
      snapshotVersion: 1,
      lastEventSequence: 1
    },
    syncEnvelope,
    receivedAt: '2026-01-01T00:00:02.000Z'
  });

  assert.equal(state.runtimeKind, 'online_foundation');
  assert.equal(state.sessionProfile.playerId, 'host-1');
  assert.equal(state.activeMatch?.matchId, 'match-1');
  assert.equal(state.activeMatch?.connectionState, 'connected');
  assert.equal(state.activeMatch?.receivedAt, '2026-01-01T00:00:02.000Z');
  assert.equal(state.loadState, 'ready');
});

test('app shell reducer clears match state after disconnect and preserves session profile', () => {
  let state = createInitialShellState('single_device_referee');
  state = appShellReducer(state, {
    type: 'session_saved',
    sessionProfile: {
      displayName: 'Referee',
      playerId: 'ref-1',
      authUserId: 'ref-1'
    }
  });
  state = appShellReducer(state, {
    type: 'match_connected',
    summary: {
      runtimeKind: 'single_device_referee',
      runtimeMode: 'single_device_referee',
      matchId: 'match-2',
      matchMode: 'single_device_referee',
      transportFlavor: 'single_device',
      connectionState: 'connected',
      recipient: {
        recipientId: 'host_admin:ref-1',
        actorId: 'ref-1',
        playerId: 'ref-1',
        role: 'host',
        scope: 'host_admin'
      },
      lifecycleState: 'draft',
      playerRole: 'host',
      snapshotVersion: 1,
      lastEventSequence: 1
    },
    syncEnvelope: makeSyncEnvelope({
      matchId: 'match-2',
      projectionDelivery: {
        ...makeSyncEnvelope().projectionDelivery,
        matchId: 'match-2'
      }
    }),
    receivedAt: '2026-01-01T00:00:03.000Z'
  });
  state = appShellReducer(state, { type: 'match_disconnected' });

  assert.equal(state.activeMatch, undefined);
  assert.equal(state.sessionProfile.playerId, 'ref-1');
  assert.equal(state.loadState, 'idle');
});

test('app shell reducer resets loading state after failure and after a later successful sync', () => {
  let state = createInitialShellState('in_memory');
  state = appShellReducer(state, { type: 'operation_started' });

  state = appShellReducer(state, {
    type: 'operation_failed',
    errorMessage: 'Map region apply failed.'
  });

  assert.equal(state.loadState, 'error');
  assert.equal(state.errorMessage, 'Map region apply failed.');

  state = appShellReducer(state, { type: 'clear_error' });
  assert.equal(state.loadState, 'idle');

  state = appShellReducer(state, { type: 'operation_started' });
  state = appShellReducer(state, {
    type: 'match_connected',
    summary: {
      runtimeKind: 'in_memory',
      runtimeMode: 'single_device_referee',
      matchId: 'match-3',
      matchMode: 'single_device_referee',
      transportFlavor: 'single_device',
      connectionState: 'connected',
      recipient: {
        recipientId: 'host_admin:host-3',
        actorId: 'host-3',
        playerId: 'host-3',
        role: 'host',
        scope: 'host_admin'
      },
      lifecycleState: 'map_setup',
      playerRole: 'host',
      snapshotVersion: 3,
      lastEventSequence: 3
    },
    syncEnvelope: makeSyncEnvelope({
      matchId: 'match-3',
      snapshotVersion: 3,
      lastEventSequence: 3,
      projectionDelivery: {
        ...makeSyncEnvelope().projectionDelivery,
        matchId: 'match-3',
        snapshotVersion: 3,
        lastEventSequence: 3,
        projection: makeProjection({
          matchId: 'match-3',
          lifecycleState: 'map_setup'
        })
      }
    }),
    receivedAt: '2026-01-01T00:00:04.000Z'
  });

  assert.equal(state.loadState, 'ready');
  assert.equal(state.errorMessage, undefined);
});

test('app shell reducer saves and clears map setup drafts per match', () => {
  let state = createInitialShellState('in_memory');

  state = appShellReducer(state, {
    type: 'map_setup_draft_saved',
    draft: {
      matchId: 'match-map-1',
      query: 'Prague',
      selectedPreviewRegionId: 'region-prague',
      selectedRegions: [
        {
          regionId: 'region-prague',
          displayName: 'Prague',
          regionKind: 'city',
          summary: 'Capital city boundary.',
          featureDatasetRefs: ['seed-prague'],
          geometry: {
            type: 'Polygon',
            coordinates: []
          },
          sourceKind: 'seed_catalog',
          sourceLabel: 'Bundled seed region catalog',
          searchAliases: ['Prague', 'Praha']
        }
      ]
    }
  });

  assert.equal(state.uiState.mapSetupDrafts['match-map-1']?.query, 'Prague');
  assert.equal(state.uiState.mapSetupDrafts['match-map-1']?.selectedRegions.length, 1);

  state = appShellReducer(state, {
    type: 'map_setup_draft_cleared',
    matchId: 'match-map-1'
  });

  assert.equal(state.uiState.mapSetupDrafts['match-map-1'], undefined);
});

test('app shell reducer ignores identical map setup drafts so screens do not resync forever', () => {
  let state = createInitialShellState('in_memory');

  const draft = {
    matchId: 'match-map-loop',
    query: 'Prague',
    selectedPreviewRegionId: 'region-prague',
    selectedRegions: [
      {
        regionId: 'region-prague',
        displayName: 'Prague',
        regionKind: 'city',
        summary: 'Capital city boundary.',
        featureDatasetRefs: ['seed-prague'],
        geometry: {
          type: 'Polygon',
          coordinates: []
        },
        sourceKind: 'seed_catalog' as const,
        sourceLabel: 'Bundled seed region catalog',
        searchAliases: ['Prague', 'Praha']
      }
    ]
  };

  state = appShellReducer(state, {
    type: 'map_setup_draft_saved',
    draft
  });

  const nextState = appShellReducer(state, {
    type: 'map_setup_draft_saved',
    draft: {
      ...draft,
      selectedRegions: [...draft.selectedRegions]
    }
  });

  assert.equal(nextState, state);
});
