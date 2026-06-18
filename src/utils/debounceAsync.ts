/**
 * Debounces async handlers — only the last call within `waitMs` runs.
 * Concurrent callers share the same pending promise.
 */
export function debounceAsync<T extends (...args: never[]) => Promise<void>>(
  fn: T,
  waitMs: number
): (...args: Parameters<T>) => Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Promise<void> | null = null;
  let lastArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);

    if (!pending) {
      pending = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          timer = null;
          const runArgs = lastArgs!;
          fn(...runArgs)
            .catch(() => {})
            .finally(() => {
              pending = null;
              resolve();
            });
        }, waitMs);
      });
    }

    return pending;
  };
}
