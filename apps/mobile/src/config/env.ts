export type MobileRuntimeKind =
  | 'in_memory'
  | 'online_foundation'
  | 'nearby_host_authority'
  | 'single_device_referee';

export interface MobileAppEnvironment {
  defaultRuntimeKind: MobileRuntimeKind;
  enableInMemoryMode: boolean;
  enableOnlineMode: boolean;
  enableNearbyMode: boolean;
  enableSingleDeviceMode: boolean;
  enableDeveloperTools: boolean;
  defaultMatchPrefix: string;
  onlineProjectUrl?: string;
  nearbyJoinTtlSeconds: number;
  regionProviderBaseUrl: string;
  regionProviderLabel: string;
  regionProviderAttributionUrl: string;
  regionProviderUsageMode: 'direct_public_dev_only' | 'proxy_backend_recommended';
  regionProviderContactEmail?: string;
  regionProviderThrottleMs: number;
  regionProviderCacheTtlSeconds: number;
  regionProviderTimeoutMs: number;
}

export interface RuntimeOption {
  kind: MobileRuntimeKind;
  label: string;
  description: string;
}

function parseBoolean(input: string | undefined, fallback: boolean): boolean {
  if (input === undefined) {
    return fallback;
  }

  return input === 'true' || input === '1' || input.toLowerCase() === 'yes';
}

function parseNumber(input: string | undefined, fallback: number): number {
  if (!input) {
    return fallback;
  }

  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseRuntimeKind(input: string | undefined): MobileRuntimeKind {
  switch (input) {
    case 'online_foundation':
    case 'nearby_host_authority':
    case 'single_device_referee':
    case 'in_memory':
      return input;
    default:
      return 'in_memory';
  }
}

function parseRegionProviderUsageMode(
  input: string | undefined
): 'direct_public_dev_only' | 'proxy_backend_recommended' {
  return input === 'proxy_backend_recommended'
    ? 'proxy_backend_recommended'
    : 'direct_public_dev_only';
}

export const mobileAppEnvironment: MobileAppEnvironment = {
  defaultRuntimeKind: parseRuntimeKind(process.env.EXPO_PUBLIC_DEFAULT_RUNTIME_MODE),
  enableInMemoryMode: parseBoolean(process.env.EXPO_PUBLIC_ENABLE_IN_MEMORY_MODE, true),
  enableOnlineMode: parseBoolean(process.env.EXPO_PUBLIC_ENABLE_ONLINE_MODE, true),
  enableNearbyMode: parseBoolean(process.env.EXPO_PUBLIC_ENABLE_NEARBY_MODE, true),
  enableSingleDeviceMode: parseBoolean(process.env.EXPO_PUBLIC_ENABLE_SINGLE_DEVICE_MODE, true),
  enableDeveloperTools: parseBoolean(process.env.EXPO_PUBLIC_ENABLE_DEVELOPER_TOOLS, true),
  defaultMatchPrefix: process.env.EXPO_PUBLIC_DEFAULT_MATCH_PREFIX || 'match',
  onlineProjectUrl: process.env.EXPO_PUBLIC_ONLINE_PROJECT_URL,
  nearbyJoinTtlSeconds: parseNumber(process.env.EXPO_PUBLIC_NEARBY_JOIN_TTL_SECONDS, 600),
  regionProviderBaseUrl: process.env.EXPO_PUBLIC_REGION_PROVIDER_BASE_URL || 'https://nominatim.openstreetmap.org',
  regionProviderLabel: process.env.EXPO_PUBLIC_REGION_PROVIDER_LABEL || 'OpenStreetMap Nominatim',
  regionProviderAttributionUrl: process.env.EXPO_PUBLIC_REGION_PROVIDER_ATTRIBUTION_URL || 'https://nominatim.openstreetmap.org',
  regionProviderUsageMode: parseRegionProviderUsageMode(process.env.EXPO_PUBLIC_REGION_PROVIDER_USAGE_MODE),
  regionProviderContactEmail: process.env.EXPO_PUBLIC_REGION_PROVIDER_CONTACT_EMAIL,
  regionProviderThrottleMs: parseNumber(process.env.EXPO_PUBLIC_REGION_PROVIDER_THROTTLE_MS, 1200),
  regionProviderCacheTtlSeconds: parseNumber(process.env.EXPO_PUBLIC_REGION_PROVIDER_CACHE_TTL_SECONDS, 900),
  regionProviderTimeoutMs: parseNumber(process.env.EXPO_PUBLIC_REGION_PROVIDER_TIMEOUT_MS, 12000)
};

export function getRuntimeOptions(environment: MobileAppEnvironment): RuntimeOption[] {
  const options: RuntimeOption[] = [];

  if (environment.enableInMemoryMode) {
    options.push({
      kind: 'in_memory',
      label: 'In-Memory',
      description: 'Local debug authority using the transport-core reference runtime.'
    });
  }

  if (environment.enableOnlineMode) {
    options.push({
      kind: 'online_foundation',
      label: 'Online Foundation',
      description: 'Mocked Supabase-oriented runtime using the online adapter contracts.'
    });
  }

  if (environment.enableNearbyMode) {
    options.push({
      kind: 'nearby_host_authority',
      label: 'Nearby Host',
      description: 'Host-authoritative nearby runtime with join-code and catch-up behavior.'
    });
  }

  if (environment.enableSingleDeviceMode) {
    options.push({
      kind: 'single_device_referee',
      label: 'Single Device',
      description: 'Referee fallback using protected reveal flows on one device.'
    });
  }

  return options;
}
