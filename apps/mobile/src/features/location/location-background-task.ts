import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { normalizeDeviceLocationSample, type DeviceLocationSample } from './location-state.ts';

export const LOCATION_BACKGROUND_TASK_NAME = 'jet-lag-live-location-v1';

const PENDING_SAMPLES_KEY = 'jet-lag:pending-background-location-samples:v1';
const BACKGROUND_QUEUE_SCOPE_KEY = 'jet-lag:background-location-queue-scope:v1';
const MAX_PENDING_SAMPLES = 50;

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

type BackgroundLocationSampleHandler = (sample: DeviceLocationSample) => void | Promise<void>;

let backgroundSampleHandler: BackgroundLocationSampleHandler | undefined;
let backgroundQueueScope: string | undefined;

async function enqueuePendingSample(sample: DeviceLocationSample) {
  try {
    const stored = await AsyncStorage.getItem(PENDING_SAMPLES_KEY);
    const storedScope = await AsyncStorage.getItem(BACKGROUND_QUEUE_SCOPE_KEY);
    const queueScope = backgroundQueueScope ?? storedScope ?? undefined;
    if (!queueScope) return;
    const pending = stored ? JSON.parse(stored) as { scope: string; samples: DeviceLocationSample[] } : undefined;
    const nextSamples = pending?.scope === queueScope ? pending.samples : [];
    await AsyncStorage.setItem(PENDING_SAMPLES_KEY, JSON.stringify({
      scope: queueScope,
      samples: [...nextSamples, sample].slice(-MAX_PENDING_SAMPLES)
    }));
  } catch {
    // A background write is best-effort; the next foreground GPS fix can refresh it.
  }
}

export async function setBackgroundLocationQueueScope(scope: string | undefined) {
  backgroundQueueScope = scope;
  if (scope) await AsyncStorage.setItem(BACKGROUND_QUEUE_SCOPE_KEY, scope);
  else {
    await AsyncStorage.removeItem(BACKGROUND_QUEUE_SCOPE_KEY);
    await AsyncStorage.removeItem(PENDING_SAMPLES_KEY);
  }
}

export function registerBackgroundLocationSampleHandler(handler: BackgroundLocationSampleHandler) {
  backgroundSampleHandler = handler;
  return () => {
    if (backgroundSampleHandler === handler) backgroundSampleHandler = undefined;
  };
}

export async function flushPendingBackgroundLocationSamples(
  expectedScope: string,
  handler: BackgroundLocationSampleHandler = backgroundSampleHandler ?? (() => undefined)
) {
  let stored: string | null;
  try {
    stored = await AsyncStorage.getItem(PENDING_SAMPLES_KEY);
    await AsyncStorage.removeItem(PENDING_SAMPLES_KEY);
  } catch {
    return;
  }
  if (!stored) return;

  let pending: DeviceLocationSample[];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || !('scope' in parsed) || !('samples' in parsed)) return;
    const scoped = parsed as { scope: string; samples: DeviceLocationSample[] };
    if (scoped.scope !== expectedScope || !Array.isArray(scoped.samples)) return;
    pending = scoped.samples;
  } catch {
    return;
  }

  for (let index = 0; index < pending.length; index += 1) {
    try {
      await handler(pending[index]!);
    } catch {
      const remaining = pending.slice(index);
      await enqueuePendingSampleBatch(remaining);
      return;
    }
  }
}

async function enqueuePendingSampleBatch(samples: DeviceLocationSample[]) {
  try {
    const scope = backgroundQueueScope ?? await AsyncStorage.getItem(BACKGROUND_QUEUE_SCOPE_KEY);
    if (!scope) return;
    const stored = await AsyncStorage.getItem(PENDING_SAMPLES_KEY);
    const parsed = stored ? JSON.parse(stored) as { scope: string; samples: DeviceLocationSample[] } : undefined;
    const existing = parsed?.scope === scope ? parsed.samples : [];
    await AsyncStorage.setItem(
      PENDING_SAMPLES_KEY,
      JSON.stringify({ scope, samples: [...existing, ...samples].slice(-MAX_PENDING_SAMPLES) })
    );
  } catch {
    // Keep the live game usable even if the local queue cannot be repaired.
  }
}

if (!TaskManager.isTaskDefined(LOCATION_BACKGROUND_TASK_NAME)) {
  TaskManager.defineTask<{ locations?: ExpoLocationPosition[] }>(
    LOCATION_BACKGROUND_TASK_NAME,
    async ({ data, error }) => {
      if (error || !data?.locations?.length) return;
      for (const position of data.locations) {
        const sample = normalizeDeviceLocationSample(
          position,
          Platform.OS === 'ios' ? 'mean_sea_level' : 'wgs84_ellipsoid'
        );
        if (backgroundSampleHandler) {
          try {
            await backgroundSampleHandler(sample);
          } catch {
            await enqueuePendingSample(sample);
          }
        } else {
          await enqueuePendingSample(sample);
        }
      }
    }
  );
}
