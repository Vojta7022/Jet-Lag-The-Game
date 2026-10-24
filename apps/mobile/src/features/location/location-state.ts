import type {
  DomainCommand,
  MatchLifecycleState,
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

export type LocationFreshness = 'fresh' | 'stale' | 'unknown';

export function classifyLocationFreshness(
  recordedAt: string | undefined,
  nowMilliseconds: number,
  maxAgeSeconds = 30
): LocationFreshness {
  if (!recordedAt) return 'unknown';
  const recordedAtMilliseconds = Date.parse(recordedAt);
  if (!Number.isFinite(recordedAtMilliseconds) || recordedAtMilliseconds > nowMilliseconds) return 'unknown';
  const ageSeconds = (nowMilliseconds - recordedAtMilliseconds) / 1000;
  return ageSeconds <= maxAgeSeconds ? 'fresh' : 'stale';
}

export function describeLocationSampleAge(
  recordedAt: string | undefined,
  nowMilliseconds: number
): string {
  if (!recordedAt) return 'No fix yet';
  const recordedAtMilliseconds = Date.parse(recordedAt);
  if (!Number.isFinite(recordedAtMilliseconds) || recordedAtMilliseconds > nowMilliseconds) {
    return 'Fix time unavailable';
  }
  const ageSeconds = Math.max(0, Math.floor((nowMilliseconds - recordedAtMilliseconds) / 1000));
  if (ageSeconds < 5) return 'Just updated';
  if (ageSeconds < 60) return `${ageSeconds} sec ago`;
  return `${Math.floor(ageSeconds / 60)} min ago`;
}

export interface LiveLocationStatusModel {
  own: { label: 'Your GPS'; value: string; tone: 'default' | 'success' | 'warning' };
  team: { label: string; value: string; tone: 'default' | 'success' | 'warning' };
}

export function buildLiveLocationStatusModel(args: {
  locationState: LocationShellState;
  visibleMovementTracks: VisibleMovementTrackProjection[];
  viewerRole: MatchRole;
  nowMilliseconds: number;
  maxAgeSeconds?: number;
}): LiveLocationStatusModel {
  const maxAgeSeconds = args.maxAgeSeconds ?? 30;
  const sample = args.locationState.lastDeviceSample;
  const freshness = classifyLocationFreshness(sample?.recordedAt, args.nowMilliseconds, maxAgeSeconds);
  const ownValue = args.locationState.permissionState === 'denied'
    ? 'Permission needed'
    : args.locationState.permissionState === 'unavailable'
      ? 'Location unavailable'
      : args.locationState.sharingState === 'error'
        ? 'Sharing error'
        : sample
          ? `${freshness === 'fresh' ? 'Fresh' : freshness === 'stale' ? 'Stale' : 'Check fix'} · ${describeLocationSampleAge(sample.recordedAt, args.nowMilliseconds)}`
          : args.locationState.sharingState === 'sharing'
            ? 'Waiting for first fix'
            : 'Sharing off';
  const ownTone = freshness === 'fresh' && args.locationState.permissionState === 'granted'
    ? 'success'
    : freshness === 'stale' || args.locationState.permissionState === 'denied' || args.locationState.sharingState === 'error'
      ? 'warning'
      : 'default';
  const samples = args.visibleMovementTracks
    .map((track) => track.latestSample)
    .filter((trackSample): trackSample is VisibleLocationSampleProjection => Boolean(trackSample));
  const freshCount = samples.filter((trackSample) =>
    classifyLocationFreshness(trackSample.recordedAt, args.nowMilliseconds, maxAgeSeconds) === 'fresh'
  ).length;
  const staleCount = samples.filter((trackSample) =>
    classifyLocationFreshness(trackSample.recordedAt, args.nowMilliseconds, maxAgeSeconds) === 'stale'
  ).length;
  const unknownCount = samples.length - freshCount - staleCount;
  const teamStatusParts = [
    freshCount > 0 ? `${freshCount} fresh` : undefined,
    staleCount > 0 ? `${staleCount} stale` : undefined,
    unknownCount > 0 ? `${unknownCount} unknown` : undefined
  ].filter((part): part is string => Boolean(part));
  const teamValue = samples.length === 0 ? 'No visible team fixes' : teamStatusParts.join(' · ');

  return {
    own: { label: 'Your GPS', value: ownValue, tone: ownTone },
    team: {
      label: args.viewerRole === 'hider' ? 'Seeker GPS' : 'Team GPS',
      value: teamValue,
      tone: samples.length > 0 && staleCount === 0 && unknownCount === 0 ? 'success' : 'warning'
    }
  };
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
  return role === 'host' || role === 'seeker' || role === 'hider';
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

export function shouldAutomaticallyShareLocation(
  lifecycleState: MatchLifecycleState | undefined,
  role: MatchRole,
  state: LocationShellState
): boolean {
  const activePlayPhase = lifecycleState === 'hide_phase' ||
    lifecycleState === 'seek_phase' ||
    lifecycleState === 'endgame';
  return activePlayPhase && canStartContinuousSharing(role, state);
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
