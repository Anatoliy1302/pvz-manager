/** Очередь /auth/v1/* на RN — параллельные fetch (send+health+verify) дают таймауты. */
let authFetchChain: Promise<void> = Promise.resolve();

export function enqueueAuthFetch<T>(operation: () => Promise<T>): Promise<T> {
  const run = authFetchChain.then(operation, operation);
  authFetchChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Дождаться завершения send/health перед verify (RN: иначе Network request failed). */
export async function drainAuthFetchQueue(timeoutMs = 5_000): Promise<void> {
  if (timeoutMs <= 0) {
    await authFetchChain;
    return;
  }

  await Promise.race([
    authFetchChain,
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
}
