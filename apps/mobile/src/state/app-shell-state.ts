import type {
  MatchProjection,
  NearbyJoinOffer,
  ProjectionScope,
  SyncEnvelope,
  TransportConnectionState
} from '../../../../packages/shared-types/src/index.ts';
import type { PlayableRegionCatalogEntry } from '../features/map/region-types.ts';

import type { MobileRuntimeKind } from '../config/env.ts';
import type { ConnectionSnapshotSummary, SessionProfileDraft } from '../runtime/types.ts';
import { createGeneratedSessionProfile } from '../runtime/session-profile.ts';

export type ShellLoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface MapSetupDraftState {
  matchId: string;
  selectedRegions: PlayableRegionCatalogEntry[];
  selectedPreviewRegionId?: string;
  query: string;
}

function isSameSessionProfile(
  left: SessionProfileDraft,
  right: SessionProfileDraft
): boolean {
  return left.displayName === right.displayName &&
    left.playerId === right.playerId &&
    left.authUserId === right.authUserId;
}

function sameDraftRegionSelection(
  left: PlayableRegionCatalogEntry[],
  right: PlayableRegionCatalogEntry[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((region, index) => region.regionId === right[index]?.regionId);
}

export function isSameMapSetupDraft(
  left: MapSetupDraftState | undefined,
  right: MapSetupDraftState | undefined
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.matchId === right.matchId &&
    left.query === right.query &&
    left.selectedPreviewRegionId === right.selectedPreviewRegionId &&
    sameDraftRegionSelection(left.selectedRegions, right.selectedRegions);
}

export interface ActiveMatchViewState extends ConnectionSnapshotSummary {
  projection: MatchProjection;
  connectionState: TransportConnectionState;
  receivedAt: string;
}

export interface MobileUiState {
  mapSetupDrafts: Record<string, MapSetupDraftState>;
}

export interface AppShellState {
  runtimeKind: MobileRuntimeKind;
  loadState: ShellLoadState;
  sessionProfile: SessionProfileDraft;
  uiState: MobileUiState;
  activeMatch?: ActiveMatchViewState;
  lastSync?: SyncEnvelope;
  errorMessage?: string;
}

export type AppShellAction =
  | { type: 'runtime_selected'; runtimeKind: MobileRuntimeKind }
  | { type: 'session_saved'; sessionProfile: SessionProfileDraft }
  | { type: 'operation_started' }
  | { type: 'operation_failed'; errorMessage: string }
  | { type: 'match_connected'; summary: ConnectionSnapshotSummary; syncEnvelope: SyncEnvelope; receivedAt: string }
  | { type: 'sync_received'; summary: ConnectionSnapshotSummary; syncEnvelope: SyncEnvelope; receivedAt: string }
  | { type: 'connection_state_changed'; connectionState: TransportConnectionState }
  | { type: 'join_offer_updated'; joinOffer: NearbyJoinOffer | undefined }
  | { type: 'map_setup_draft_saved'; draft: MapSetupDraftState }
  | { type: 'map_setup_draft_cleared'; matchId: string }
  | { type: 'match_disconnected' }
  | { type: 'clear_error' };

export function createInitialShellState(runtimeKind: MobileRuntimeKind): AppShellState {
  return {
    runtimeKind,
    loadState: 'idle',
    uiState: {
      mapSetupDrafts: {}
    },
    sessionProfile: createGeneratedSessionProfile()
  };
}

export function appShellReducer(
  state: AppShellState,
  action: AppShellAction
): AppShellState {
  switch (action.type) {
    case 'runtime_selected':
      if (state.runtimeKind === action.runtimeKind) {
        return state;
      }

      return {
        ...state,
        runtimeKind: action.runtimeKind,
        errorMessage: undefined
      };
    case 'session_saved':
      if (isSameSessionProfile(state.sessionProfile, action.sessionProfile)) {
        return state;
      }

      return {
        ...state,
        sessionProfile: action.sessionProfile,
        errorMessage: undefined
      };
    case 'operation_started':
      return {
        ...state,
        loadState: 'loading',
        errorMessage: undefined
      };
    case 'operation_failed':
      return {
        ...state,
        loadState: 'error',
        errorMessage: action.errorMessage
      };
    case 'match_connected':
    case 'sync_received':
      return {
        ...state,
        loadState: 'ready',
        errorMessage: undefined,
        lastSync: action.syncEnvelope,
        activeMatch: {
          ...action.summary,
          projection: action.syncEnvelope.projectionDelivery.projection,
          connectionState: action.summary.connectionState,
          receivedAt: action.receivedAt
        }
      };
    case 'connection_state_changed':
      return {
        ...state,
        activeMatch: state.activeMatch
          ? {
              ...state.activeMatch,
              connectionState: action.connectionState
            }
          : state.activeMatch
      };
    case 'join_offer_updated':
      return {
        ...state,
        activeMatch: state.activeMatch
          ? {
              ...state.activeMatch,
              joinOffer: action.joinOffer
            }
          : state.activeMatch
      };
    case 'map_setup_draft_saved':
      if (isSameMapSetupDraft(state.uiState.mapSetupDrafts[action.draft.matchId], action.draft)) {
        return state;
      }

      return {
        ...state,
        uiState: {
          ...state.uiState,
          mapSetupDrafts: {
            ...state.uiState.mapSetupDrafts,
            [action.draft.matchId]: action.draft
          }
        }
      };
    case 'map_setup_draft_cleared': {
      const nextDrafts = { ...state.uiState.mapSetupDrafts };
      delete nextDrafts[action.matchId];
      return {
        ...state,
        uiState: {
          ...state.uiState,
          mapSetupDrafts: nextDrafts
        }
      };
    }
    case 'match_disconnected':
      return {
        ...state,
        loadState: 'idle',
        activeMatch: undefined,
        lastSync: undefined,
        errorMessage: undefined
      };
    case 'clear_error':
      return {
        ...state,
        errorMessage: undefined,
        loadState: state.activeMatch ? 'ready' : 'idle'
      };
    default:
      return state;
  }
}

export function getCurrentProjectionScope(state: AppShellState): ProjectionScope | undefined {
  return state.activeMatch?.recipient.scope;
}
