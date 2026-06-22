import { fetchWithRaceTimeout, FetchRaceTimeoutError } from './fetchWithRaceTimeout';
import {
  isAuthClientNetworkSyncSuspended,
  waitUntilAuthClientNetworkSyncAllowed,
} from './authClientSyncGate';
import { enqueueAuthFetch } from './authFetchQueue';
import { readStoredAccessToken } from './authStorageSession';

const RETRY_DELAYS_MS = [0, 400, 1200];
const REQUEST_TIMEOUT_MS = 45_000;

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if ('url' in input) return input.url;
  return String(input);
}

/** Auth-js сам отменяет запросы; наш AbortController даёт ложный AbortError. */
function isSupabaseAuthV1Request(input: RequestInfo | URL): boolean {
  return getRequestUrl(input).includes('/auth/v1/');
}

export function isFetchAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('abort');
}

function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof FetchRaceTimeoutError) return true;
  if (isFetchAbortError(error)) return false;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('timeout') ||
    message.includes('fetch_timeout')
  );
}

/**
 * Fetch для Supabase.
 * /auth/v1/* — нативный fetch без таймаута (auth-js + iOS).
 * REST/functions — подставляем JWT из SecureStore (без setSession на RN).
 */
export async function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const requestUrl = getRequestUrl(input);

  let requestInit = init;
  if (!isSupabaseAuthV1Request(input)) {
    const token = await readStoredAccessToken();
    if (token) {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      requestInit = { ...init, headers };
    }
  }

  if (isSupabaseAuthV1Request(input)) {
    if (isAuthClientNetworkSyncSuspended()) {
      await waitUntilAuthClientNetworkSyncAllowed();
    }
    const { signal: _callerSignal, ...rest } = requestInit ?? {};
    const run = () => fetch(input, rest);
    if (requestUrl.includes('/auth/v1/verify')) {
      return run();
    }
    return enqueueAuthFetch(run);
  }

  const { signal: _callerSignal, ...rest } = requestInit ?? {};

  let lastError: unknown;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      return await fetchWithRaceTimeout(input, rest, REQUEST_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt === RETRY_DELAYS_MS.length - 1) {
        throw error;
      }
    }
  }

  throw lastError;
}

export function isSupabaseNetworkError(error: unknown): boolean {
  return isRetryableNetworkError(error);
}
