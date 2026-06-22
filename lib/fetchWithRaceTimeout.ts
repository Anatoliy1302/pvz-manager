function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FetchRaceTimeoutError extends Error {
  constructor(label = 'fetch_timeout') {
    super(label);
    this.name = 'FetchRaceTimeoutError';
  }
}

/**
 * Таймаут через Promise.race — без AbortController (на RN/iOS abort даёт ложные AbortError).
 */
export async function fetchWithRaceTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const result = await Promise.race([
    fetch(input, init),
    sleep(timeoutMs).then(() => {
      throw new FetchRaceTimeoutError();
    }),
  ]);
  return result;
}
