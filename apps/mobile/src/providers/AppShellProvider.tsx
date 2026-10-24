import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

import type {
  ContentPack,
  DomainCommand,
  MatchRole,
  ProjectionViewer,
  SingleDeviceRevealResult,
  SingleDeviceRevealToken,
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
import {
  clearActiveSingleDeviceSession,
  loadActiveSingleDeviceSession,
  saveActiveSingleDeviceSession
} from '../runtime/local-session-storage.ts';

interface AppShellContextValue {
  state: AppShellState;
  saveSessionProfile: (profile: SessionProfileDraft) => void;
  selectRuntimeKind: (runtimeKind: CreateMatchInput['runtimeKind']) => void;
  createMatch: (input: Omit<CreateMatchInput, 'runtimeKind'>) => Promise<boolean>;
  getContentPackByReference: (packId?: string, packVersion?: string) => ContentPack;
  getInstalledContentPacks: () => ContentPack[];
  joinMatch: (input: Omit<JoinMatchInput, 'runtimeKind'>) => Promise<boolean>;
  refreshActiveMatch: () => Promise<boolean>;
  recoverActiveMatch: () => Promise<boolean>;
  submitCommand: (command: DomainCommand) => Promise<boolean>;
  submitCommands: (commands: DomainCommand[]) => Promise<boolean>;
  prepareAttachmentUploadCommands: (drafts: LocalMediaAttachmentDraft[]) => Promise<DomainCommand[] | undefined>;
  getAttachmentMediaSource: (attachment: VisibleAttachmentProjection) => RemoteAttachmentMediaSource | undefined;
  armProtectedReveal: (viewer: ProjectionViewer, reason: string) => Promise<SingleDeviceRevealToken | undefined>;
  openProtectedReveal: (tokenId: string) => Promise<SingleDeviceRevealResult | undefined>;
  hideProtectedReveal: (tokenId: string) => Promise<boolean>;
  listProtectedReveals: () => Promise<SingleDeviceRevealToken[]>;
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

async function updateSavedSession(
  runtimeKind: CreateMatchInput['runtimeKind'],
  matchId: string,
  profile: SessionProfileDraft
) {
  if (runtimeKind === 'single_device_referee') {
    await saveActiveSingleDeviceSession({
      version: 1,
      runtimeKind,
      matchId,
      profile
    });
  } else {
    await clearActiveSingleDeviceSession();
  }
}

export function AppShellProvider(props: { children: React.ReactNode }) {
  const { runtimeKind, selectRuntimeKind } = useRuntimeMode();
  const runtimeClient = useRuntimeClient();
  const [state, dispatch] = useReducer(appShellReducer, createInitialShellState(runtimeKind));
  const connectionRef = useRef<RuntimeConnection | undefined>(undefined);
  const subscriptionRef = useRef<TransportSubscription | undefined>(undefined);
  const resumeStartedRef = useRef(false);

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

  const handleFailure = useCallback((error: unknown) => {
    dispatch({
      type: 'operation_failed',
      errorMessage: toPlayerFacingShellError(error, connectionRef.current)
    });
  }, []);

  useEffect(() => {
    if (resumeStartedRef.current) {
      return;
    }
    resumeStartedRef.current = true;
    dispatch({ type: 'operation_started' });

    void (async () => {
      try {
        const savedSession = await loadActiveSingleDeviceSession();
        if (!savedSession) {
          dispatch({ type: 'clear_error' });
          return;
        }

        dispatch({ type: 'session_saved', sessionProfile: savedSession.profile });
        selectRuntimeKind('single_device_referee');

        const restored = await runtimeClient.resumeSingleDeviceMatch(
          savedSession.matchId,
          savedSession.profile
        );
        if (!restored) {
          await clearActiveSingleDeviceSession();
          throw new Error('The saved referee match has no recoverable game state. Start a new game.');
        }

        await replaceConnection(restored.connection, restored.initialSync);
      } catch (error) {
        handleFailure(error);
      }
    })();
  }, [handleFailure, replaceConnection, runtimeClient, selectRuntimeKind]);

  const saveSessionProfile = useCallback((profile: SessionProfileDraft) => {
    dispatch({
      type: 'session_saved',
      sessionProfile: profile
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
      try {
        await updateSavedSession(
          runtimeKind,
          result.connection.matchId,
          result.resolvedSessionProfile ?? state.sessionProfile
        );
      } catch (error) {
        dispatch({
          type: 'operation_failed',
          errorMessage: `Match started, but this device could not save its resume point: ${error instanceof Error ? error.message : 'storage unavailable'}`
        });
      }
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
      try {
        await updateSavedSession(
          runtimeKind,
          result.connection.matchId,
          result.resolvedSessionProfile ?? state.sessionProfile
        );
      } catch (error) {
        dispatch({
          type: 'operation_failed',
          errorMessage: `Match started, but this device could not save its resume point: ${error instanceof Error ? error.message : 'storage unavailable'}`
        });
      }
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
    const disconnectedRuntimeKind = connectionRef.current?.runtimeKind;
    await subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = undefined;
    await runtimeClient.disconnect(connectionRef.current);
    connectionRef.current = undefined;
    dispatch({ type: 'match_disconnected' });
    if (disconnectedRuntimeKind === 'single_device_referee') {
      try {
        await clearActiveSingleDeviceSession();
      } catch (error) {
        handleFailure(error);
      }
    }
  }, [handleFailure, runtimeClient]);

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

  const getContentPackByReference = useCallback((packId?: string, packVersion?: string) => {
    return runtimeClient.getContentPackByReference(packId, packVersion);
  }, [runtimeClient]);

  const getInstalledContentPacks = useCallback(() => runtimeClient.getInstalledContentPacks(), [runtimeClient]);

  const armProtectedReveal = useCallback(async (viewer: ProjectionViewer, reason: string) => {
    const connection = connectionRef.current;
    if (!connection) return undefined;
    try {
      return await runtimeClient.armProtectedReveal(connection, viewer, reason);
    } catch (error) {
      handleFailure(error);
      return undefined;
    }
  }, [handleFailure, runtimeClient]);

  const openProtectedReveal = useCallback(async (tokenId: string) => {
    const connection = connectionRef.current;
    if (!connection) return undefined;
    try {
      return await runtimeClient.openProtectedReveal(connection, tokenId);
    } catch (error) {
      handleFailure(error);
      return undefined;
    }
  }, [handleFailure, runtimeClient]);

  const hideProtectedReveal = useCallback(async (tokenId: string) => {
    const connection = connectionRef.current;
    if (!connection) return false;
    try {
      await runtimeClient.hideProtectedReveal(connection, tokenId);
      return true;
    } catch (error) {
      handleFailure(error);
      return false;
    }
  }, [handleFailure, runtimeClient]);

  const listProtectedReveals = useCallback(async () => {
    const connection = connectionRef.current;
    if (!connection) return [];
    try {
      return await runtimeClient.listProtectedReveals(connection);
    } catch (error) {
      handleFailure(error);
      return [];
    }
  }, [handleFailure, runtimeClient]);

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
    getContentPackByReference,
    getInstalledContentPacks,
    armProtectedReveal,
    openProtectedReveal,
    hideProtectedReveal,
    listProtectedReveals,
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
    getContentPackByReference,
    getInstalledContentPacks,
    armProtectedReveal,
    openProtectedReveal,
    hideProtectedReveal,
    listProtectedReveals,
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
