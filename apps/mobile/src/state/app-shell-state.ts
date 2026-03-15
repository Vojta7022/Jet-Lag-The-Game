import type {
  MatchProjection,
  NearbyJoinOffer,
  ProjectionScope,
  SyncEnvelope,
  TransportConnectionState
} from '../../../../packages/shared-types/src/index.ts';

import type { MobileRuntimeKind } from '../config/env.ts';
import type { ConnectionSnapshotSummary, SessionProfileDraft } from '../runtime/types.ts';

export type ShellLoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface ActiveMatchViewState extends ConnectionSnapshotSummary {
  projection: MatchProjection;
  connectionState: TransportConnectionState;
}

export interface AppShellState {
  runtimeKind: MobileRuntimeKind;
  loadState: ShellLoadState;
  sessionProfile: SessionProfileDraft;
  activeMatch?: ActiveMatchViewState;
  lastSync?: SyncEnvelope;
  errorMessage?: string;
}

export type AppShellAction =
  | { type: 'runtime_selected'; runtimeKind: MobileRuntimeKind }
  | { type: 'session_saved'; sessionProfile: SessionProfileDraft }
  | { type: 'operation_started' }
  | { type: 'operation_failed'; errorMessage: string }
  | { type: 'match_connected'; summary: ConnectionSnapshotSummary; syncEnvelope: SyncEnvelope }
  | { type: 'sync_received'; summary: ConnectionSnapshotSummary; syncEnvelope: SyncEnvelope }
  | { type: 'connection_state_changed'; connectionState: TransportConnectionState }
  | { type: 'join_offer_updated'; joinOffer: NearbyJoinOffer | undefined }
  | { type: 'match_disconnected' }
  | { type: 'clear_error' };

export function createInitialShellState(runtimeKind: MobileRuntimeKind): AppShellState {
  return {
    runtimeKind,
    loadState: 'idle',
    sessionProfile: {
      displayName: 'Player',
      playerId: 'player-1',
      authUserId: 'player-1'
    }
  };
}

export function appShellReducer(
  state: AppShellState,
  action: AppShellAction
): AppShellState {
  switch (action.type) {
    case 'runtime_selected':
      return {
        ...state,
        runtimeKind: action.runtimeKind,
        errorMessage: undefined
      };
    case 'session_saved':
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
          connectionState: action.summary.connectionState
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
