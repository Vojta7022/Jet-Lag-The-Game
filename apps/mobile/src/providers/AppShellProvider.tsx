import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

import type {
  DomainCommand,
  MatchRole,
  SyncEnvelope,
  TransportSubscription,
  VisibleAttachmentProjection
} from '../../../../packages/shared-types/src/index.ts';

import { useRuntimeClient } from './RuntimeClientProvider.tsx';
import { useRuntimeMode } from './RuntimeModeProvider.tsx';
import {
  appShellReducer,
  createInitialShellState,
  type AppShellState,
  type MapSetupDraftState
} from '../state/app-shell-state.ts';
import type {
  CreateMatchInput,
  JoinMatchInput,
  RuntimeConnection,
  SessionProfileDraft
} from '../runtime/types.ts';
import type { LocalMediaAttachmentDraft } from '../features/evidence/evidence-model.ts';
import type { RemoteAttachmentMediaSource } from '../runtime/supabase-attachment-storage.ts';

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
  prepareAttachmentUploadCommands: (drafts: LocalMediaAttachmentDraft[]) => Promise<DomainCommand[] | undefined>;
  getAttachmentMediaSource: (attachment: VisibleAttachmentProjection) => RemoteAttachmentMediaSource | undefined;
  saveMapSetupDraft: (draft: MapSetupDraftState) => void;
  clearMapSetupDraft: (matchId: string) => void;
  disconnectActiveMatch: () => Promise<void>;
  clearError: () => void;
}

const AppShellContext = createContext<AppShellContextValue | undefined>(undefined);

function resolveCommandActor(
  connection: RuntimeConnection | undefined,
  sessionProfile: SessionProfileDraft,
  activePlayerRole: MatchRole | undefined
) {
  if (!connection) {
    return {
      actorId: sessionProfile.authUserId ?? sessionProfile.playerId,
      playerId: sessionProfile.playerId,
      role: 'spectator' as const
    };
  }

  return {
    actorId: connection.recipient.actorId,
    playerId: connection.recipient.playerId ?? sessionProfile.playerId,
    role: connection.recipient.scope === 'host_admin'
      ? 'host'
      : activePlayerRole ?? connection.recipient.role ?? 'spectator'
  };
}

function toPlayerFacingShellError(
  error: unknown,
  connection: RuntimeConnection | undefined
): string {
  const message = error instanceof Error ? error.message : 'The app shell operation failed.';

  if (/authenticated session player/i.test(message)) {
    const connectedPlayer = connection?.recipient.playerId ?? 'the connected player';

    return connection?.runtimeKind === 'online_foundation'
      ? `This online match is still connected as "${connectedPlayer}". Disconnect the current match, confirm the player profile, then create or join again before continuing setup.`
      : 'The current match is still using a different player identity. Disconnect and reconnect with the intended player profile before continuing.';
  }

  return message;
}

export function AppShellProvider(props: { children: React.ReactNode }) {
  const { runtimeKind, selectRuntimeKind } = useRuntimeMode();
  const runtimeClient = useRuntimeClient();
  const [state, dispatch] = useReducer(appShellReducer, createInitialShellState(runtimeKind));
  const connectionRef = useRef<RuntimeConnection | undefined>(undefined);
  const subscriptionRef = useRef<TransportSubscription | undefined>(undefined);

  useEffect(() => {
    if (state.runtimeKind !== runtimeKind) {
      dispatch({ type: 'runtime_selected', runtimeKind });
    }
  }, [runtimeKind, state.runtimeKind]);

  const bindConnectedMatch = useCallback((connection: RuntimeConnection, syncEnvelope: SyncEnvelope) => {
    const summary = runtimeClient.summarize(connection, syncEnvelope);
    dispatch({
      type: 'match_connected',
      summary,
      syncEnvelope,
      receivedAt: new Date().toISOString()
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
          syncEnvelope,
          receivedAt: new Date().toISOString()
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
      errorMessage: toPlayerFacingShellError(error, connectionRef.current)
    });
  }, []);

  const createMatch = useCallback(async (input: Omit<CreateMatchInput, 'runtimeKind'>) => {
    dispatch({ type: 'operation_started' });
    try {
      const result = await runtimeClient.createMatch(state.sessionProfile, {
        ...input,
        runtimeKind
      });
      if (result.resolvedSessionProfile) {
        dispatch({
          type: 'session_saved',
          sessionProfile: result.resolvedSessionProfile
        });
      }
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
      if (result.resolvedSessionProfile) {
        dispatch({
          type: 'session_saved',
          sessionProfile: result.resolvedSessionProfile
        });
      }
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
        syncEnvelope,
        receivedAt: new Date().toISOString()
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
        syncEnvelope,
        receivedAt: new Date().toISOString()
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
      const actor = resolveCommandActor(
        connectionRef.current,
        state.sessionProfile,
        state.activeMatch?.playerRole
      );
      const syncEnvelope = await runtimeClient.submitCommands(connectionRef.current, {
        actorId: actor.actorId,
        playerId: actor.playerId,
        role: actor.role ?? 'spectator'
      }, [command]);
      const summary = runtimeClient.summarize(connectionRef.current, syncEnvelope);
      dispatch({
        type: 'sync_received',
        summary,
        syncEnvelope,
        receivedAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      handleFailure(error);
      return false;
    }
  }, [handleFailure, runtimeClient, state.activeMatch?.playerRole, state.sessionProfile]);

  const submitCommands = useCallback(async (commands: DomainCommand[]) => {
    if (!connectionRef.current) {
      return false;
    }

    dispatch({ type: 'operation_started' });
    try {
      const actor = resolveCommandActor(
        connectionRef.current,
        state.sessionProfile,
        state.activeMatch?.playerRole
      );
      const syncEnvelope = await runtimeClient.submitCommands(connectionRef.current, {
        actorId: actor.actorId,
        playerId: actor.playerId,
        role: actor.role ?? 'spectator'
      }, commands);
      const summary = runtimeClient.summarize(connectionRef.current, syncEnvelope);
      dispatch({
        type: 'sync_received',
        summary,
        syncEnvelope,
        receivedAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      handleFailure(error);
      return false;
    }
  }, [handleFailure, runtimeClient, state.activeMatch?.playerRole, state.sessionProfile]);

  const saveMapSetupDraft = useCallback((draft: MapSetupDraftState) => {
    dispatch({
      type: 'map_setup_draft_saved',
      draft
    });
  }, []);

  const clearMapSetupDraft = useCallback((matchId: string) => {
    dispatch({
      type: 'map_setup_draft_cleared',
      matchId
    });
  }, []);

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

  const prepareAttachmentUploadCommands = useCallback(async (drafts: LocalMediaAttachmentDraft[]) => {
    if (!connectionRef.current) {
      return undefined;
    }

    try {
      return await runtimeClient.prepareAttachmentUploadCommands(connectionRef.current, drafts);
    } catch (error) {
      handleFailure(error);
      return undefined;
    }
  }, [handleFailure, runtimeClient]);

  const getAttachmentMediaSource = useCallback((attachment: VisibleAttachmentProjection) => {
    return runtimeClient.getAttachmentMediaSource(connectionRef.current, attachment);
  }, [runtimeClient]);

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
    prepareAttachmentUploadCommands,
    getAttachmentMediaSource,
    saveMapSetupDraft,
    clearMapSetupDraft,
    disconnectActiveMatch,
    clearError
  }), [
    clearMapSetupDraft,
    clearError,
    createMatch,
    disconnectActiveMatch,
    getAttachmentMediaSource,
    joinMatch,
    prepareAttachmentUploadCommands,
    refreshActiveMatch,
    recoverActiveMatch,
    saveSessionProfile,
    saveMapSetupDraft,
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
