/** Блокирует сетевые вызовы auth-js (setSession, refresh) во время OTP verify. */
let authClientNetworkSyncSuspended = false;

export function isAuthClientNetworkSyncSuspended(): boolean {
  return authClientNetworkSyncSuspended;
}

export function suspendAuthClientNetworkSync(): void {
  authClientNetworkSyncSuspended = true;
}

export function resumeAuthClientNetworkSync(): void {
  authClientNetworkSyncSuspended = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ждёт снятия блокировки перед fetch auth-js (RN: параллельный setSession → timeout). */
export async function waitUntilAuthClientNetworkSyncAllowed(
  maxWaitMs = 90_000,
): Promise<void> {
  if (!authClientNetworkSyncSuspended) return;

  const deadline = Date.now() + maxWaitMs;
  while (authClientNetworkSyncSuspended && Date.now() < deadline) {
    await sleep(50);
  }
}
