import type {
  DomainCommand,
  MatchProjection,
  MatchRole,
  VisibleLocationSampleProjection,
  VisibleMovementTrackProjection
} from '../../../../../packages/shared-types/src/index.ts';

export type LocationPermissionState =
  | 'unknown'
  | 'checking'
  | 'granted'
  | 'denied'
  | 'unavailable';

export type LocationAvailabilityState = 'unknown' | 'available' | 'unavailable';

export type LocationSharingState = 'idle' | 'starting' | 'sharing' | 'stopped' | 'error';

export type LocationUpdateFrequencyMode = 'manual' | 'balanced' | 'frequent';

export interface DeviceLocationSample {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  recordedAt: string;
  source: 'device' | 'manual';
}

export interface LocationShellState {
  permissionState: LocationPermissionState;
  availabilityState: LocationAvailabilityState;
  sharingState: LocationSharingState;
  frequencyMode: LocationUpdateFrequencyMode;
  lastDeviceSample?: DeviceLocationSample;
  lastSubmittedAt?: string;
  errorMessage?: string;
}

export type LocationShellAction =
  | { type: 'availability_checked'; availabilityState: LocationAvailabilityState }
  | { type: 'permission_check_started' }
  | { type: 'permission_checked'; permissionState: LocationPermissionState }
  | { type: 'permission_request_started' }
  | { type: 'permission_requested'; permissionState: LocationPermissionState }
  | { type: 'frequency_mode_selected'; frequencyMode: LocationUpdateFrequencyMode }
  | { type: 'sharing_started' }
  | { type: 'sharing_stopped' }
  | { type: 'sample_recorded'; sample: DeviceLocationSample }
  | { type: 'sample_submitted'; submittedAt: string }
  | { type: 'location_error'; errorMessage: string }
  | { type: 'clear_error' };

export interface MovementTrackViewModel {
  playerId: string;
  displayName: string;
  role: MatchRole;
  teamId?: string;
  sampleCount: number;
  latestSample?: VisibleLocationSampleProjection;
  recentSamples: VisibleLocationSampleProjection[];
}

export function createInitialLocationShellState(): LocationShellState {
  return {
    permissionState: 'unknown',
    availabilityState: 'unknown',
    sharingState: 'idle',
    frequencyMode: 'balanced'
  };
}

export function locationShellReducer(
  state: LocationShellState,
  action: LocationShellAction
): LocationShellState {
  switch (action.type) {
    case 'availability_checked':
      return {
        ...state,
        availabilityState: action.availabilityState,
        permissionState:
          action.availabilityState === 'unavailable' ? 'unavailable' : state.permissionState,
        errorMessage:
          action.availabilityState === 'unavailable'
            ? 'Location services are unavailable on this device or runtime.'
            : state.errorMessage
      };
    case 'permission_check_started':
    case 'permission_request_started':
      return {
        ...state,
        permissionState: 'checking',
        errorMessage: undefined
      };
    case 'permission_checked':
    case 'permission_requested':
      return {
        ...state,
        permissionState: action.permissionState,
        errorMessage:
          action.permissionState === 'denied'
            ? 'Location permission was denied. Sharing cannot start until access is granted.'
            : action.permissionState === 'unavailable'
              ? 'Location services are unavailable on this device or runtime.'
              : undefined
      };
    case 'frequency_mode_selected':
      return {
        ...state,
        frequencyMode: action.frequencyMode
      };
    case 'sharing_started':
      return {
        ...state,
        sharingState: 'sharing',
        errorMessage: undefined
      };
    case 'sharing_stopped':
      return {
        ...state,
        sharingState: 'stopped'
      };
    case 'sample_recorded':
      return {
        ...state,
        lastDeviceSample: action.sample,
        errorMessage: undefined
      };
    case 'sample_submitted':
      return {
        ...state,
        lastSubmittedAt: action.submittedAt,
        errorMessage: undefined
      };
    case 'location_error':
      return {
        ...state,
        sharingState: 'error',
        errorMessage: action.errorMessage
      };
    case 'clear_error':
      return {
        ...state,
        errorMessage: undefined,
        sharingState: state.sharingState === 'error' ? 'idle' : state.sharingState
      };
    default:
      return state;
  }
}

export function resolveLocationViewerRole(
  role: string | undefined,
  scope: string | undefined
): MatchRole {
  if (role === 'host' || scope === 'host_admin') {
    return 'host';
  }

  if (role === 'seeker') {
    return 'seeker';
  }

  if (role === 'hider') {
    return 'hider';
  }

  return 'spectator';
}

export function canViewerShareLiveLocation(role: MatchRole): boolean {
  return role === 'host' || role === 'seeker';
}

export function canStartContinuousSharing(
  role: MatchRole,
  state: LocationShellState
): boolean {
  return canViewerShareLiveLocation(role) &&
    state.permissionState === 'granted' &&
    state.availabilityState !== 'unavailable' &&
    state.frequencyMode !== 'manual';
}

export function canSendSingleLocationUpdate(
  role: MatchRole,
  state: LocationShellState
): boolean {
  return canViewerShareLiveLocation(role) &&
    state.permissionState === 'granted' &&
    state.availabilityState !== 'unavailable';
}

export function buildLocationUpdateCommand(sample: DeviceLocationSample): DomainCommand {
  return {
    type: 'update_location',
    payload: {
      latitude: sample.latitude,
      longitude: sample.longitude,
      accuracyMeters: sample.accuracyMeters,
      source: sample.source
    }
  };
}

export function buildMovementTrackViewModels(
  projection: MatchProjection | undefined,
  maxBreadcrumbSamples = 8
): MovementTrackViewModel[] {
  return (projection?.visibleMovementTracks ?? [])
    .map((track) => ({
      playerId: track.playerId,
      displayName: track.displayName,
      role: track.role,
      teamId: track.teamId,
      sampleCount: track.sampleCount,
      latestSample: track.latestSample,
      recentSamples: track.samples.slice(-maxBreadcrumbSamples)
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function countVisibleMovementSamples(track: VisibleMovementTrackProjection): number {
  return track.samples.length;
}

export function describeLocationPermissionState(state: LocationShellState): string {
  if (state.permissionState === 'granted') {
    return 'Foreground location access granted';
  }

  if (state.permissionState === 'denied') {
    return 'Foreground location access denied';
  }

  if (state.permissionState === 'unavailable') {
    return 'Location services unavailable';
  }

  if (state.permissionState === 'checking') {
    return 'Checking location permission';
  }

  return 'Location permission not checked yet';
}
