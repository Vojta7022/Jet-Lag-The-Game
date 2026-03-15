import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

import { useAppShell } from './AppShellProvider.tsx';
import {
  buildLocationUpdateCommand,
  canSendSingleLocationUpdate,
  canStartContinuousSharing,
  createInitialLocationShellState,
  locationShellReducer,
  resolveLocationViewerRole,
  type DeviceLocationSample,
  type LocationShellState,
  type LocationUpdateFrequencyMode
} from '../features/location/location-state.ts';
import { createExpoLocationSource, type LocationWatchHandle, type MobileLocationSource } from '../features/location/location-source.ts';

interface LocationSharingContextValue {
  state: LocationShellState;
  refreshPermissionState: () => Promise<void>;
  requestForegroundPermission: () => Promise<void>;
  selectFrequencyMode: (mode: LocationUpdateFrequencyMode) => void;
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
  const watchRef = useRef<LocationWatchHandle | undefined>(undefined);

  const submitSample = useCallback(async (sample: DeviceLocationSample) => {
    dispatch({ type: 'sample_recorded', sample });
    await submitCommand(buildLocationUpdateCommand(sample));
    dispatch({ type: 'sample_submitted', submittedAt: sample.recordedAt });
  }, [submitCommand]);

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
  }, []);

  const requestForegroundPermission = useCallback(async () => {
    const source = sourceRef.current;
    dispatch({ type: 'permission_request_started' });
    const permissionState = await source.requestPermission();
    dispatch({ type: 'permission_requested', permissionState });
  }, []);

  const stopSharing = useCallback(async () => {
    await watchRef.current?.remove();
    watchRef.current = undefined;
    dispatch({ type: 'sharing_stopped' });
  }, []);

  const sendSingleUpdate = useCallback(async () => {
    const role = resolveLocationViewerRole(
      appShellState.activeMatch?.playerRole,
      appShellState.activeMatch?.recipient.scope
    );
    if (!canSendSingleLocationUpdate(role, state)) {
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
  }, [appShellState.activeMatch?.playerRole, appShellState.activeMatch?.recipient.scope, state, submitSample]);

  const startSharing = useCallback(async () => {
    const role = resolveLocationViewerRole(
      appShellState.activeMatch?.playerRole,
      appShellState.activeMatch?.recipient.scope
    );
    if (!canStartContinuousSharing(role, state)) {
      return;
    }

    await stopSharing();
    dispatch({ type: 'sharing_started' });

    try {
      watchRef.current = await sourceRef.current.watchPosition(state.frequencyMode, async (sample) => {
        await submitSample(sample);
      });
    } catch (error) {
      dispatch({
        type: 'location_error',
        errorMessage: error instanceof Error ? error.message : 'Unable to start location sharing.'
      });
    }
  }, [
    appShellState.activeMatch?.playerRole,
    appShellState.activeMatch?.recipient.scope,
    state,
    stopSharing,
    submitSample
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
    return () => {
      void watchRef.current?.remove();
    };
  }, []);

  const value = useMemo<LocationSharingContextValue>(() => ({
    state,
    refreshPermissionState,
    requestForegroundPermission,
    selectFrequencyMode,
    sendSingleUpdate,
    startSharing,
    stopSharing,
    clearError
  }), [
    clearError,
    refreshPermissionState,
    requestForegroundPermission,
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
