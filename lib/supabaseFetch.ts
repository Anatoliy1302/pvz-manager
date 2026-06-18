const RETRY_DELAYS_MS = [0, 400, 1200];

function isRetryableNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('timeout')
  );
}

function isAuthMutation(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return false;
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : 'url' in input
          ? input.url
          : String(input);
  return url.includes('/auth/v1/');
}

/**
 * Fetch для Supabase.
 * POST /auth/v1/* — без retry (повтор отправляет новый OTP).
 * Остальные запросы — короткий retry для нестабильных мобильных сетей.
 */
export async function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (isAuthMutation(input, init)) {
    return fetch(input, init);
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      return await fetch(input, init);
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
