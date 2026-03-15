import {
  RegionProviderRateLimitError,
  RegionProviderResponseError,
  RegionProviderUnavailableError
} from './region-provider.ts';

export interface RegionProviderJsonRequest {
  path: string;
  searchParams?: Record<string, string | undefined>;
  headers?: Record<string, string>;
  cacheKey?: string;
}

export interface RegionProviderJsonExecutor {
  getJson: <T>(request: RegionProviderJsonRequest) => Promise<T>;
}

interface CreateRegionProviderJsonExecutorOptions {
  baseUrl: string;
  throttleMs: number;
  timeoutMs: number;
  defaultHeaders?: Record<string, string>;
  fetchFn?: typeof fetch;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function createRequestKey(request: RegionProviderJsonRequest): string {
  if (request.cacheKey) {
    return request.cacheKey;
  }

  const params = Object.entries(request.searchParams ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`);

  return `${request.path}?${params.join('&')}`;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch (error) {
    throw new RegionProviderResponseError(
      'The region provider returned an unreadable JSON payload.',
      { cause: error, statusCode: response.status }
    );
  }
}

export function createRegionProviderJsonExecutor(
  options: CreateRegionProviderJsonExecutorOptions
): RegionProviderJsonExecutor {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  let nextAllowedStartAt = 0;
  let gate = Promise.resolve();
  const inFlight = new Map<string, Promise<unknown>>();

  async function waitForThrottleWindow() {
    let releaseGate: (() => void) | undefined;
    const previousGate = gate;
    gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    await previousGate;

    try {
      const delayMs = Math.max(0, nextAllowedStartAt - Date.now());
      if (delayMs > 0) {
        await sleep(delayMs);
      }

      nextAllowedStartAt = Date.now() + Math.max(0, options.throttleMs);
    } finally {
      releaseGate?.();
    }
  }

  return {
    async getJson<T>(request: RegionProviderJsonRequest) {
      if (!fetchFn) {
        throw new RegionProviderUnavailableError('The region provider fetch API is unavailable in this runtime.');
      }

      const requestKey = createRequestKey(request);
      const existing = inFlight.get(requestKey);
      if (existing) {
        return existing as Promise<T>;
      }

      const promise = (async () => {
        await waitForThrottleWindow();

        const url = new URL(request.path, options.baseUrl);
        for (const [key, value] of Object.entries(request.searchParams ?? {})) {
          if (typeof value === 'string' && value.length > 0) {
            url.searchParams.set(key, value);
          }
        }

        const controller = typeof AbortController !== 'undefined' && options.timeoutMs > 0
          ? new AbortController()
          : undefined;
        const timeoutId = controller
          ? setTimeout(() => controller.abort(), options.timeoutMs)
          : undefined;

        let response: Response;
        try {
          response = await fetchFn(url.toString(), {
            headers: {
              Accept: 'application/json',
              ...(options.defaultHeaders ?? {}),
              ...(request.headers ?? {})
            },
            signal: controller?.signal
          });
        } catch (error) {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          const message = error instanceof Error && error.name === 'AbortError'
            ? 'The region provider request timed out.'
            : error instanceof Error
              ? error.message
              : 'The region provider could not be reached.';
          throw new RegionProviderUnavailableError(message, { cause: error });
        }

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (response.status === 429) {
          throw new RegionProviderRateLimitError(
            'The region provider is rate limiting requests right now.',
            { statusCode: response.status }
          );
        }

        if (response.status >= 500 || response.status === 408) {
          throw new RegionProviderUnavailableError(
            `The region provider returned ${response.status} ${response.statusText}.`,
            { statusCode: response.status }
          );
        }

        if (!response.ok) {
          throw new RegionProviderResponseError(
            `The region provider rejected the request with ${response.status} ${response.statusText}.`,
            { statusCode: response.status }
          );
        }

        return readJsonResponse<T>(response);
      })().finally(() => {
        inFlight.delete(requestKey);
      });

      inFlight.set(requestKey, promise);
      return promise as Promise<T>;
    }
  };
}
