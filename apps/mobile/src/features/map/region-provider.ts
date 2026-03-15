import type {
  PlayableRegionCatalogEntry,
  RegionSourceAttribution
} from './region-types.ts';

export type RegionProviderErrorCode =
  | 'unavailable'
  | 'rate_limited'
  | 'invalid_response';

interface RegionProviderErrorOptions {
  code: RegionProviderErrorCode;
  retryable: boolean;
  statusCode?: number;
  cause?: unknown;
}

export class RegionProviderError extends Error {
  readonly code: RegionProviderErrorCode;
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(message: string, options: RegionProviderErrorOptions) {
    super(message);
    this.name = 'RegionProviderError';
    this.code = options.code;
    this.retryable = options.retryable;
    this.statusCode = options.statusCode;
    if (options.cause !== undefined) {
      // Preserve causal context when supported by the current runtime.
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class RegionProviderUnavailableError extends RegionProviderError {
  constructor(message: string, options?: Omit<RegionProviderErrorOptions, 'code' | 'retryable'>) {
    super(message, {
      code: 'unavailable',
      retryable: true,
      ...options
    });
    this.name = 'RegionProviderUnavailableError';
  }
}

export class RegionProviderRateLimitError extends RegionProviderError {
  constructor(message: string, options?: Omit<RegionProviderErrorOptions, 'code' | 'retryable'>) {
    super(message, {
      code: 'rate_limited',
      retryable: true,
      ...options
    });
    this.name = 'RegionProviderRateLimitError';
  }
}

export class RegionProviderResponseError extends RegionProviderError {
  constructor(message: string, options?: Omit<RegionProviderErrorOptions, 'code' | 'retryable'>) {
    super(message, {
      code: 'invalid_response',
      retryable: false,
      ...options
    });
    this.name = 'RegionProviderResponseError';
  }
}

export interface RegionBoundaryProvider {
  providerKey: string;
  providerLabel: string;
  attribution: RegionSourceAttribution;
  searchRegions: (query: string) => Promise<PlayableRegionCatalogEntry[]>;
  getRegionById: (regionId: string) => Promise<PlayableRegionCatalogEntry | undefined>;
}
