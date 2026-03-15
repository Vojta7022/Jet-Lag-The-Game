import type {
  DeviceLocationSample,
  LocationAvailabilityState,
  LocationPermissionState,
  LocationUpdateFrequencyMode
} from './location-state.ts';

type ExpoLocationModule = typeof import('expo-location');

interface ExpoLocationPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  };
  timestamp?: number;
}

export interface LocationWatchHandle {
  remove: () => Promise<void> | void;
}

export interface MobileLocationSource {
  checkAvailability: () => Promise<LocationAvailabilityState>;
  getPermissionState: () => Promise<LocationPermissionState>;
  requestPermission: () => Promise<LocationPermissionState>;
  getCurrentPosition: (mode: LocationUpdateFrequencyMode) => Promise<DeviceLocationSample>;
  watchPosition: (
    mode: LocationUpdateFrequencyMode,
    onSample: (sample: DeviceLocationSample) => void | Promise<void>
  ) => Promise<LocationWatchHandle>;
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
    async getCurrentPosition(mode) {
      const expoLocation = await loadExpoLocationModule();
      if (!expoLocation || typeof expoLocation.getCurrentPositionAsync !== 'function') {
        throw new Error('Location services are unavailable in this runtime.');
      }

      const accuracy = resolveExpoAccuracy(expoLocation, mode);
      const position = await expoLocation.getCurrentPositionAsync({
        accuracy
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? undefined,
        recordedAt: new Date(position.timestamp ?? Date.now()).toISOString(),
        source: 'device'
      };
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
          void onSample({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy ?? undefined,
            recordedAt: new Date(position.timestamp ?? Date.now()).toISOString(),
            source: 'device'
          });
        }
      );

      return {
        async remove() {
          await subscription.remove?.();
        }
      };
    }
  };
}
