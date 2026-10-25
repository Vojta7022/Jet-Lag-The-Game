import {
  normalizeDeviceLocationSample,
  type DeviceLocationSample,
  type LocationAvailabilityState,
  type LocationPermissionState,
  type LocationUpdateFrequencyMode
} from './location-state.ts';
import { Platform } from 'react-native';
import {
  LOCATION_BACKGROUND_TASK_NAME,
  registerBackgroundLocationSampleHandler,
  setBackgroundLocationQueueScope
} from './location-background-task.ts';

type ExpoLocationModule = typeof import('expo-location');

interface ExpoLocationPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    altitude?: number | null;
    altitudeAccuracy?: number | null;
  };
  timestamp?: number;
}

function altitudeReferenceForCurrentPlatform(): 'wgs84_ellipsoid' | 'mean_sea_level' {
  // Expo SDK 55 forwards CLLocation.altitude on iOS (orthometric/MSL height),
  // while Android Location.getAltitude and browser geolocation use ellipsoid height.
  return Platform.OS === 'ios' ? 'mean_sea_level' : 'wgs84_ellipsoid';
}

export interface LocationWatchHandle {
  remove: () => Promise<void> | void;
}

export interface MobileLocationSource {
  checkAvailability: () => Promise<LocationAvailabilityState>;
  getPermissionState: () => Promise<LocationPermissionState>;
  requestPermission: () => Promise<LocationPermissionState>;
  getBackgroundPermissionState: () => Promise<LocationPermissionState>;
  requestBackgroundPermission: () => Promise<LocationPermissionState>;
  getCurrentPosition: (mode: LocationUpdateFrequencyMode) => Promise<DeviceLocationSample>;
  watchPosition: (
    mode: LocationUpdateFrequencyMode,
    onSample: (sample: DeviceLocationSample) => void | Promise<void>
  ) => Promise<LocationWatchHandle>;
  watchPositionInBackground: (
    mode: LocationUpdateFrequencyMode,
    scopeKey: string,
    onSample: (sample: DeviceLocationSample) => void | Promise<void>
  ) => Promise<LocationWatchHandle>;
  stopBackgroundPosition: () => Promise<void>;
}

interface ExpoPermissionResponse {
  granted?: boolean;
  status?: string;
}

function mapPermissionResponse(permission: ExpoPermissionResponse | undefined): LocationPermissionState {
  if (!permission) {
    return 'unavailable';
  }

  if (permission.granted || permission.status === 'granted') {
    return 'granted';
  }

  if (permission.status === 'denied') {
    return 'denied';
  }

  return 'unknown';
}

function intervalForMode(mode: LocationUpdateFrequencyMode): number {
  if (mode === 'frequent') {
    return 2500;
  }

  if (mode === 'manual') {
    return 0;
  }

  return 7000;
}

function distanceForMode(mode: LocationUpdateFrequencyMode): number {
  if (mode === 'frequent') {
    return 8;
  }

  if (mode === 'manual') {
    return 0;
  }

  return 30;
}

async function loadExpoLocationModule(): Promise<ExpoLocationModule | undefined> {
  try {
    return await import('expo-location');
  } catch {
    return undefined;
  }
}

function resolveExpoAccuracy(
  expoLocation: ExpoLocationModule,
  mode: LocationUpdateFrequencyMode
): number | undefined {
  if (mode === 'frequent') {
    return expoLocation.Accuracy.Highest ?? expoLocation.Accuracy.Balanced;
  }

  return expoLocation.Accuracy.Balanced ?? expoLocation.Accuracy.Low;
}

export function createExpoLocationSource(): MobileLocationSource {
  return {
    async checkAvailability() {
      const expoLocation = await loadExpoLocationModule();
      if (!expoLocation || typeof expoLocation.hasServicesEnabledAsync !== 'function') {
        return 'unavailable';
      }

      try {
        const enabled = await expoLocation.hasServicesEnabledAsync();
        return enabled ? 'available' : 'unavailable';
      } catch {
        return 'unavailable';
      }
    },
    async getPermissionState() {
      const expoLocation = await loadExpoLocationModule();
      if (!expoLocation || typeof expoLocation.getForegroundPermissionsAsync !== 'function') {
        return 'unavailable';
      }

      try {
        return mapPermissionResponse(await expoLocation.getForegroundPermissionsAsync());
      } catch {
        return 'unavailable';
      }
    },
    async requestPermission() {
      const expoLocation = await loadExpoLocationModule();
      if (!expoLocation || typeof expoLocation.requestForegroundPermissionsAsync !== 'function') {
        return 'unavailable';
      }

      try {
        return mapPermissionResponse(await expoLocation.requestForegroundPermissionsAsync());
      } catch {
        return 'unavailable';
      }
    },
    async getBackgroundPermissionState() {
      const expoLocation = await loadExpoLocationModule();
      if (!expoLocation || typeof expoLocation.getBackgroundPermissionsAsync !== 'function') {
        return 'unavailable';
      }
      try {
        return mapPermissionResponse(await expoLocation.getBackgroundPermissionsAsync());
      } catch {
        return 'unavailable';
      }
    },
    async requestBackgroundPermission() {
      const expoLocation = await loadExpoLocationModule();
      if (!expoLocation || typeof expoLocation.requestBackgroundPermissionsAsync !== 'function') {
        return 'unavailable';
      }
      try {
        return mapPermissionResponse(await expoLocation.requestBackgroundPermissionsAsync());
      } catch {
        return 'unavailable';
      }
    },
    async getCurrentPosition(mode) {
      const expoLocation = await loadExpoLocationModule();
      if (!expoLocation || typeof expoLocation.getCurrentPositionAsync !== 'function') {
        throw new Error('Location services are unavailable in this runtime.');
      }

      const accuracy = resolveExpoAccuracy(expoLocation, mode);
      const position = await expoLocation.getCurrentPositionAsync({
        accuracy
      });

      return normalizeDeviceLocationSample(position, altitudeReferenceForCurrentPlatform());
    },
    async watchPosition(mode, onSample) {
      const expoLocation = await loadExpoLocationModule();
      if (!expoLocation || typeof expoLocation.watchPositionAsync !== 'function') {
        throw new Error('Continuous location watching is unavailable in this runtime.');
      }

      const accuracy = resolveExpoAccuracy(expoLocation, mode);
      const subscription = await expoLocation.watchPositionAsync(
        {
          accuracy,
          timeInterval: intervalForMode(mode) || undefined,
          distanceInterval: distanceForMode(mode) || undefined
        },
        (position: ExpoLocationPosition) => {
          void onSample(normalizeDeviceLocationSample(position, altitudeReferenceForCurrentPlatform()));
        }
      );

      return {
        async remove() {
          await subscription.remove?.();
        }
      };
    },
    async watchPositionInBackground(mode, scopeKey, onSample) {
      const expoLocation = await loadExpoLocationModule();
      if (!expoLocation || typeof expoLocation.startLocationUpdatesAsync !== 'function') {
        throw new Error('Background location is unavailable in this runtime.');
      }
      const taskManager = await import('expo-task-manager');
      if (!taskManager.isTaskDefined(LOCATION_BACKGROUND_TASK_NAME)) {
        throw new Error('Background location task was not registered by the app entry point.');
      }
      await setBackgroundLocationQueueScope(scopeKey);
      const unregisterHandler = registerBackgroundLocationSampleHandler(onSample);
      try {
        if (!(await expoLocation.hasStartedLocationUpdatesAsync(LOCATION_BACKGROUND_TASK_NAME))) {
          const accuracy = resolveExpoAccuracy(expoLocation, mode);
          await expoLocation.startLocationUpdatesAsync(LOCATION_BACKGROUND_TASK_NAME, {
            accuracy,
            timeInterval: intervalForMode(mode) || undefined,
            distanceInterval: distanceForMode(mode) || undefined,
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: 'Hide + Seek location sharing',
              notificationBody: 'Your team can see your latest position during the active game.'
            }
          });
        }
      } catch (error) {
        unregisterHandler();
        throw error;
      }

      return {
        async remove() {
          unregisterHandler();
          if (await expoLocation.hasStartedLocationUpdatesAsync(LOCATION_BACKGROUND_TASK_NAME)) {
            await expoLocation.stopLocationUpdatesAsync(LOCATION_BACKGROUND_TASK_NAME);
          }
          await setBackgroundLocationQueueScope(undefined);
        }
      };
    },
    async stopBackgroundPosition() {
      const expoLocation = await loadExpoLocationModule();
      if (!expoLocation || typeof expoLocation.hasStartedLocationUpdatesAsync !== 'function') return;
      if (await expoLocation.hasStartedLocationUpdatesAsync(LOCATION_BACKGROUND_TASK_NAME)) {
        await expoLocation.stopLocationUpdatesAsync(LOCATION_BACKGROUND_TASK_NAME);
      }
      await setBackgroundLocationQueueScope(undefined);
    }
  };
}
