const screenTimings = new Map<string, number>();

/** Mark screen load start (call in useFocusEffect). */
export function markScreenLoadStart(screenName: string): void {
  screenTimings.set(screenName, Date.now());
}

/** Log screen load duration after data is ready. */
export function markScreenLoadEnd(screenName: string): void {
  const start = screenTimings.get(screenName);
  if (start === undefined) return;
  screenTimings.delete(screenName);
  const ms = Date.now() - start;
  if (__DEV__) {
    const label = ms > 1000 ? '⚠️' : '✓';
    console.log(`[perf] ${label} ${screenName}: ${ms}ms`);
  }
}
