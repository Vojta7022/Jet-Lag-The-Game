import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

import type {
  DomainCommand,
  SyncEnvelope,
  TransportSubscription
} from '../../../../packages/shared-types/src/index.ts';

import { useRuntimeClient } from './RuntimeClientProvider.tsx';
import { useRuntimeMode } from './RuntimeModeProvider.tsx';
import {
  appShellReducer,
  createInitialShellState,
  type AppShellState
} from '../state/app-shell-state.ts';
import type {
  CreateMatchInput,
  JoinMatchInput,
  RuntimeConnection,
  SessionProfileDraft
} from '../runtime/types.ts';

interface AppShellContextValue {
  state: AppShellState;
  saveSessionProfile: (profile: SessionProfileDraft) => void;
  selectRuntimeKind: (runtimeKind: CreateMatchInput['runtimeKind']) => void;
  createMatch: (input: Omit<CreateMatchInput, 'runtimeKind'>) => Promise<boolean>;
  joinMatch: (input: Omit<JoinMatchInput, 'runtimeKind'>) => Promise<boolean>;
  refreshActiveMatch: () => Promise<boolean>;
  recoverActiveMatch: () => Promise<boolean>;
  submitCommand: (command: DomainCommand) => Promise<boolean>;
  submitCommands: (commands: DomainCommand[]) => Promise<boolean>;
  disconnectActiveMatch: () => Promise<void>;
  clearError: () => void;
}

const AppShellContext = createContext<AppShellContextValue | undefined>(undefined);

export function AppShellProvider(props: { children: React.ReactNode }) {
  const { runtimeKind, selectRuntimeKind } = useRuntimeMode();
  const runtimeClient = useRuntimeClient();
  const [state, dispatch] = useReducer(appShellReducer, createInitialShellState(runtimeKind));
  const connectionRef = useRef<RuntimeConnection | undefined>(undefined);
  const subscriptionRef = useRef<TransportSubscription | undefined>(undefined);

  useEffect(() => {
    dispatch({ type: 'runtime_selected', runtimeKind });
  }, [runtimeKind]);

  const bindConnectedMatch = useCallback((connection: RuntimeConnection, syncEnvelope: SyncEnvelope) => {
    const summary = runtimeClient.summarize(connection, syncEnvelope);
    dispatch({
      type: 'match_connected',
      summary,
      syncEnvelope
    });
  }, [runtimeClient]);

  const subscribeToConnection = useCallback(async (connection: RuntimeConnection, initialSync: SyncEnvelope) => {
    await subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = await connection.transport.subscribe(
      {
        matchId: connection.matchId,
        deliverInitialSync: false,
        cursor: {
          snapshotVersion: initialSync.snapshotVersion,
          lastEventSequence: initialSync.lastEventSequence
        }
      },
      async (syncEnvelope) => {
        const summary = runtimeClient.summarize(connection, syncEnvelope);
        dispatch({
          type: 'sync_received',
          summary,
          syncEnvelope
        });
      }
    );
  }, [runtimeClient]);

  const replaceConnection = useCallback(async (connection: RuntimeConnection, initialSync: SyncEnvelope) => {
    await subscriptionRef.current?.unsubscribe();
    await runtimeClient.disconnect(connectionRef.current);
    connectionRef.current = connection;
    bindConnectedMatch(connection, initialSync);
    await subscribeToConnection(connection, initialSync);
  }, [bindConnectedMatch, runtimeClient, subscribeToConnection]);

  const saveSessionProfile = useCallback((profile: SessionProfileDraft) => {
    dispatch({
      type: 'session_saved',
      sessionProfile: profile
    });
  }, []);

  const handleFailure = useCallback((error: unknown) => {
    dispatch({
      type: 'operation_failed',
      errorMessage: error instanceof Error ? error.message : 'The app shell operation failed.'
    });
  }, []);

  const createMatch = useCallback(async (input: Omit<CreateMatchInput, 'runtimeKind'>) => {
    dispatch({ type: 'operation_started' });
    try {
      const result = await runtimeClient.createMatch(state.sessionProfile, {
        ...input,
        runtimeKind
      });
      await replaceConnection(result.connection, result.initialSync);
      return true;
    } catch (error) {
      handleFailure(error);
      return false;
    }
  }, [handleFailure, replaceConnection, runtimeClient, runtimeKind, state.sessionProfile]);

  const joinMatch = useCallback(async (input: Omit<JoinMatchInput, 'runtimeKind'>) => {
    dispatch({ type: 'operation_started' });
    try {
      const result = await runtimeClient.joinMatch(state.sessionProfile, {
        ...input,
        runtimeKind
      });
      await replaceConnection(result.connection, result.initialSync);
      return true;
    } catch (error) {
      handleFailure(error);
      return false;
    }
  }, [handleFailure, replaceConnection, runtimeClient, runtimeKind, state.sessionProfile]);

  const refreshActiveMatch = useCallback(async () => {
    if (!connectionRef.current) {
      return false;
    }

    dispatch({ type: 'operation_started' });
    try {
      const syncEnvelope = await runtimeClient.refresh(connectionRef.current);
      const summary = runtimeClient.summarize(connectionRef.current, syncEnvelope);
      dispatch({
        type: 'sync_received',
        summary,
        syncEnvelope
      });
      return true;
    } catch (error) {
      handleFailure(error);
      return false;
    }
  }, [handleFailure, runtimeClient]);

  const recoverActiveMatch = useCallback(async () => {
    if (!connectionRef.current) {
      return false;
    }

    dispatch({ type: 'operation_started' });
    try {
      const recovered = await runtimeClient.recover(connectionRef.current);
      if (!recovered) {
        throw new Error('No stored snapshot or trailing events are available for runtime recovery.');
      }

      const syncEnvelope = await runtimeClient.refresh(connectionRef.current);
      const summary = runtimeClient.summarize(connectionRef.current, syncEnvelope);
      dispatch({
        type: 'sync_received',
        summary,
        syncEnvelope
      });
      return true;
    } catch (error) {
      handleFailure(error);
      return false;
    }
  }, [handleFailure, runtimeClient]);

  const submitCommand = useCallback(async (command: DomainCommand) => {
    if (!connectionRef.current) {
      return false;
    }

    dispatch({ type: 'operation_started' });
    try {
      const syncEnvelope = await runtimeClient.submitCommands(connectionRef.current, {
        actorId: state.sessionProfile.playerId,
        playerId: state.sessionProfile.playerId,
        role: connectionRef.current.recipient.role ?? 'spectator'
      }, [command]);
      const summary = runtimeClient.summarize(connectionRef.current, syncEnvelope);
      dispatch({
        type: 'sync_received',
        summary,
        syncEnvelope
      });
      return true;
    } catch (error) {
      handleFailure(error);
      return false;
    }
  }, [handleFailure, runtimeClient, state.sessionProfile.playerId]);

  const submitCommands = useCallback(async (commands: DomainCommand[]) => {
    if (!connectionRef.current) {
      return false;
    }

    dispatch({ type: 'operation_started' });
    try {
      const syncEnvelope = await runtimeClient.submitCommands(connectionRef.current, {
        actorId: state.sessionProfile.playerId,
        playerId: state.sessionProfile.playerId,
        role: connectionRef.current.recipient.role ?? 'spectator'
      }, commands);
      const summary = runtimeClient.summarize(connectionRef.current, syncEnvelope);
      dispatch({
        type: 'sync_received',
        summary,
        syncEnvelope
      });
      return true;
    } catch (error) {
      handleFailure(error);
      return false;
    }
  }, [handleFailure, runtimeClient, state.sessionProfile.playerId]);

  const disconnectActiveMatch = useCallback(async () => {
    await subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = undefined;
    await runtimeClient.disconnect(connectionRef.current);
    connectionRef.current = undefined;
    dispatch({ type: 'match_disconnected' });
  }, [runtimeClient]);

  const clearError = useCallback(() => {
    dispatch({ type: 'clear_error' });
  }, []);

  useEffect(() => {
    return () => {
      void subscriptionRef.current?.unsubscribe();
      void runtimeClient.disconnect(connectionRef.current);
    };
  }, [runtimeClient]);

  const value = useMemo<AppShellContextValue>(() => ({
    state,
    saveSessionProfile,
    selectRuntimeKind,
    createMatch,
    joinMatch,
    refreshActiveMatch,
    recoverActiveMatch,
    submitCommand,
    submitCommands,
    disconnectActiveMatch,
    clearError
  }), [
    clearError,
    createMatch,
    disconnectActiveMatch,
    joinMatch,
    refreshActiveMatch,
    recoverActiveMatch,
    saveSessionProfile,
    selectRuntimeKind,
    state,
    submitCommand,
    submitCommands
  ]);

  return (
    <AppShellContext.Provider value={value}>
      {props.children}
    </AppShellContext.Provider>
  );
}

export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error('useAppShell must be used inside AppShellProvider.');
  }

  return context;
}
