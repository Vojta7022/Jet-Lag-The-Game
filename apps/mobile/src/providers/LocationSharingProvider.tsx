import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

import { useAppShell } from './AppShellProvider.tsx';
import {
  buildLocationUpdateCommand,
  canSendSingleLocationUpdate,
  canStartBackgroundSharing,
  canStartContinuousSharing,
  shouldAutomaticallyShareLocation,
  createInitialLocationShellState,
  locationShellReducer,
  resolveLocationViewerRole,
  type DeviceLocationSample,
  type LocationShellState,
  type LocationUpdateFrequencyMode
} from '../features/location/location-state.ts';
import { createExpoLocationSource, type LocationWatchHandle, type MobileLocationSource } from '../features/location/location-source.ts';
import { flushPendingBackgroundLocationSamples } from '../features/location/location-background-task.ts';

interface LocationSharingContextValue {
  state: LocationShellState;
  refreshPermissionState: () => Promise<void>;
  requestForegroundPermission: () => Promise<void>;
  requestBackgroundPermission: () => Promise<void>;
  selectFrequencyMode: (mode: LocationUpdateFrequencyMode) => void;
  captureCurrentPosition: () => Promise<DeviceLocationSample | undefined>;
  sendSingleUpdate: () => Promise<void>;
  startSharing: () => Promise<void>;
  stopSharing: () => Promise<void>;
  clearError: () => void;
}

const LocationSharingContext = createContext<LocationSharingContextValue | undefined>(undefined);

export function LocationSharingProvider(props: {
  children: React.ReactNode;
  source?: MobileLocationSource;
}) {
  const { state: appShellState, submitCommand } = useAppShell();
  const [state, dispatch] = useReducer(locationShellReducer, createInitialLocationShellState());
  const sourceRef = useRef<MobileLocationSource>(props.source ?? createExpoLocationSource());
  const foregroundWatchRef = useRef<LocationWatchHandle | undefined>(undefined);
  const backgroundWatchRef = useRef<LocationWatchHandle | undefined>(undefined);
  const backgroundWatchScopeRef = useRef<string | undefined>(undefined);
  const backgroundStartScopeRef = useRef<string | undefined>(undefined);
  const activeMatch = appShellState.activeMatch;
  const activeRole = resolveLocationViewerRole(activeMatch?.playerRole, activeMatch?.recipient.scope);

  const submitSample = useCallback(async (sample: DeviceLocationSample) => {
    if (!canSendSingleLocationUpdate(
      activeRole,
      state,
      activeMatch?.projection.activeCardResolution?.resolutionKind === 'move'
    )) {
      return;
    }
    dispatch({ type: 'sample_recorded', sample });
    await submitCommand(buildLocationUpdateCommand(sample));
    dispatch({ type: 'sample_submitted', submittedAt: sample.recordedAt });
  }, [activeMatch?.projection.activeCardResolution?.resolutionKind, activeRole, state, submitCommand]);
  const submitSampleRef = useRef(submitSample);
  useEffect(() => {
    submitSampleRef.current = submitSample;
  }, [submitSample]);

  const refreshPermissionState = useCallback(async () => {
    const source = sourceRef.current;
    dispatch({ type: 'permission_check_started' });
    const availabilityState = await source.checkAvailability();
    dispatch({ type: 'availability_checked', availabilityState });
    if (availabilityState === 'unavailable') {
      dispatch({ type: 'permission_checked', permissionState: 'unavailable' });
      return;
    }

    const permissionState = await source.getPermissionState();
    dispatch({ type: 'permission_checked', permissionState });
    const backgroundPermissionState = await source.getBackgroundPermissionState();
    dispatch({ type: 'background_permission_checked', permissionState: backgroundPermissionState });
  }, []);

  const requestBackgroundPermission = useCallback(async () => {
    const source = sourceRef.current;
    let foregroundPermission = state.permissionState;
    if (foregroundPermission !== 'granted') {
      foregroundPermission = await source.requestPermission();
      dispatch({ type: 'permission_requested', permissionState: foregroundPermission });
    }
    if (foregroundPermission !== 'granted') {
      dispatch({
        type: 'background_permission_requested',
        permissionState: foregroundPermission === 'unavailable' ? 'unavailable' : 'denied'
      });
      return;
    }

    const backgroundPermissionState = await source.requestBackgroundPermission();
    dispatch({ type: 'background_permission_requested', permissionState: backgroundPermissionState });
  }, [state.permissionState]);

  const requestForegroundPermission = useCallback(async () => {
    const source = sourceRef.current;
    dispatch({ type: 'permission_request_started' });
    const permissionState = await source.requestPermission();
    dispatch({ type: 'permission_requested', permissionState });
  }, []);

  const stopSharing = useCallback(async () => {
    await foregroundWatchRef.current?.remove();
    await backgroundWatchRef.current?.remove();
    foregroundWatchRef.current = undefined;
    backgroundWatchRef.current = undefined;
    backgroundStartScopeRef.current = undefined;
    await sourceRef.current.stopBackgroundPosition();
    dispatch({ type: 'sharing_stopped' });
  }, []);

  const ensureBackgroundSharing = useCallback(async () => {
    if (!activeMatch || !canStartBackgroundSharing(activeRole, state)) return;
    const scopeKey = `${activeMatch.matchId}:${activeMatch.recipient.recipientId}`;
    if (backgroundWatchRef.current && backgroundWatchScopeRef.current === scopeKey) return;
    if (backgroundWatchRef.current && backgroundWatchScopeRef.current !== scopeKey) {
      await backgroundWatchRef.current.remove();
      backgroundWatchRef.current = undefined;
      backgroundWatchScopeRef.current = undefined;
    }
    if (backgroundStartScopeRef.current === scopeKey) return;
    backgroundStartScopeRef.current = scopeKey;
    try {
      backgroundWatchRef.current = await sourceRef.current.watchPositionInBackground(
        state.frequencyMode,
        scopeKey,
        (sample) => submitSampleRef.current(sample)
      );
      backgroundWatchScopeRef.current = scopeKey;
      await flushPendingBackgroundLocationSamples(scopeKey, (sample) => submitSampleRef.current(sample));
    } catch (error) {
      dispatch({
        type: 'background_tracking_error',
        errorMessage: error instanceof Error
          ? `Foreground GPS is active, but background tracking could not start: ${error.message}`
          : 'Foreground GPS is active, but background tracking could not start.'
      });
    }
  }, [activeMatch, activeRole, state]);

  const sendSingleUpdate = useCallback(async () => {
    const role = resolveLocationViewerRole(
      appShellState.activeMatch?.playerRole,
      appShellState.activeMatch?.recipient.scope
    );
    if (!canSendSingleLocationUpdate(
      role,
      state,
      appShellState.activeMatch?.projection.activeCardResolution?.resolutionKind === 'move'
    )) {
      return;
    }

    try {
      const sample = await sourceRef.current.getCurrentPosition(state.frequencyMode);
      await submitSample(sample);
    } catch (error) {
      dispatch({
        type: 'location_error',
        errorMessage: error instanceof Error ? error.message : 'Unable to fetch a device location sample.'
      });
    }
  }, [
    appShellState.activeMatch?.playerRole,
    appShellState.activeMatch?.projection.activeCardResolution?.resolutionKind,
    appShellState.activeMatch?.recipient.scope,
    state,
    submitSample
  ]);

  const captureCurrentPosition = useCallback(async (): Promise<DeviceLocationSample | undefined> => {
    try {
      if (state.permissionState !== 'granted' || state.availabilityState === 'unavailable') {
        return undefined;
      }
      return await sourceRef.current.getCurrentPosition(state.frequencyMode);
    } catch (error) {
      dispatch({
        type: 'location_error',
        errorMessage: error instanceof Error ? error.message : 'Unable to capture a device location sample.'
      });
      return undefined;
    }
  }, [state.availabilityState, state.frequencyMode, state.permissionState]);

  const startSharing = useCallback(async () => {
    const role = resolveLocationViewerRole(
      appShellState.activeMatch?.playerRole,
      appShellState.activeMatch?.recipient.scope
    );
    if (!canStartContinuousSharing(role, state)) {
      return;
    }

    await foregroundWatchRef.current?.remove();
    foregroundWatchRef.current = undefined;
    if (backgroundWatchRef.current) {
      await backgroundWatchRef.current.remove();
      backgroundWatchRef.current = undefined;
      backgroundWatchScopeRef.current = undefined;
      backgroundStartScopeRef.current = undefined;
    }
    dispatch({ type: 'sharing_started' });

    try {
      foregroundWatchRef.current = await sourceRef.current.watchPosition(state.frequencyMode, (sample) =>
        submitSampleRef.current(sample)
      );
      if (canStartBackgroundSharing(role, state)) {
        await ensureBackgroundSharing();
      }
    } catch (error) {
      dispatch({
        type: 'location_error',
        errorMessage: error instanceof Error ? error.message : 'Unable to start location sharing.'
      });
    }
  }, [
    appShellState.activeMatch?.playerRole,
    appShellState.activeMatch?.matchId,
    appShellState.activeMatch?.recipient.recipientId,
    appShellState.activeMatch?.recipient.scope,
    state,
    ensureBackgroundSharing
  ]);

  const selectFrequencyMode = useCallback((mode: LocationUpdateFrequencyMode) => {
    dispatch({ type: 'frequency_mode_selected', frequencyMode: mode });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'clear_error' });
  }, []);

  useEffect(() => {
    void refreshPermissionState();
  }, [refreshPermissionState]);

  useEffect(() => {
    if (appShellState.loadState !== 'ready') return;
    const lifecycle = activeMatch?.projection.lifecycleState;
    const matchIsInPlay = lifecycle === 'hide_phase' || lifecycle === 'seek_phase' || lifecycle === 'endgame';
    if (!activeMatch || !matchIsInPlay) void sourceRef.current.stopBackgroundPosition();
  }, [activeMatch, appShellState.loadState]);

  useEffect(() => {
    if (state.backgroundPermissionState === 'denied' || state.backgroundPermissionState === 'unavailable') {
      void (async () => {
        await backgroundWatchRef.current?.remove();
        backgroundWatchRef.current = undefined;
        backgroundWatchScopeRef.current = undefined;
        backgroundStartScopeRef.current = undefined;
        await sourceRef.current.stopBackgroundPosition();
      })();
    }
  }, [state.backgroundPermissionState]);

  useEffect(() => {
    const shouldShare = shouldAutomaticallyShareLocation(
      activeMatch?.projection.lifecycleState,
      activeRole,
      state,
      activeMatch?.projection.activeCardResolution?.resolutionKind === 'move'
    );
    if (shouldShare && state.sharingState !== 'sharing') {
      void startSharing();
    } else if (!shouldShare && state.sharingState === 'sharing') {
      void stopSharing();
    } else if (shouldShare && state.sharingState === 'sharing') {
      void ensureBackgroundSharing();
    }
  }, [
    activeMatch?.projection.lifecycleState,
    activeMatch?.projection.activeCardResolution?.resolutionKind,
    activeRole,
    startSharing,
    ensureBackgroundSharing,
    state,
    stopSharing
  ]);

  useEffect(() => {
    return () => {
      void foregroundWatchRef.current?.remove();
    };
  }, []);

  const value = useMemo<LocationSharingContextValue>(() => ({
    state,
    refreshPermissionState,
    requestForegroundPermission,
    requestBackgroundPermission,
    selectFrequencyMode,
    captureCurrentPosition,
    sendSingleUpdate,
    startSharing,
    stopSharing,
    clearError
  }), [
    clearError,
    captureCurrentPosition,
    refreshPermissionState,
    requestForegroundPermission,
    requestBackgroundPermission,
    selectFrequencyMode,
    sendSingleUpdate,
    startSharing,
    state,
    stopSharing
  ]);

  return (
    <LocationSharingContext.Provider value={value}>
      {props.children}
    </LocationSharingContext.Provider>
  );
}

export function useLocationSharing() {
  const context = useContext(LocationSharingContext);
  if (!context) {
    throw new Error('useLocationSharing must be used inside LocationSharingProvider.');
  }

  return context;
}
