import * as SecureStore from 'expo-secure-store';
import { toSecureStoreKeySuffix } from './loginIdentifier';
import { safeParseJson } from './safeJson';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

interface PinAttemptRecord {
  failures: number;
  lockedUntil: number | null;
}

function attemptKey(loginKey: string): string {
  return `pin_attempts_${toSecureStoreKeySuffix(loginKey)}`;
}

async function readRecord(loginKey: string): Promise<PinAttemptRecord> {
  const raw = await SecureStore.getItemAsync(attemptKey(loginKey));
  if (!raw) return { failures: 0, lockedUntil: null };
  return safeParseJson<PinAttemptRecord>(raw, { failures: 0, lockedUntil: null });
}

async function writeRecord(loginKey: string, record: PinAttemptRecord): Promise<void> {
  await SecureStore.setItemAsync(attemptKey(loginKey), JSON.stringify(record));
}

export type PinLockStatus =
  | { locked: false }
  | { locked: true; retryAfterMs: number };

export async function getPinLockStatus(loginKey: string): Promise<PinLockStatus> {
  const record = await readRecord(loginKey);
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return { locked: true, retryAfterMs: record.lockedUntil - Date.now() };
  }
  return { locked: false };
}

export async function recordPinFailure(loginKey: string): Promise<PinLockStatus> {
  const record = await readRecord(loginKey);
  const failures = record.failures + 1;

  if (failures >= MAX_ATTEMPTS) {
    const lockedUntil = Date.now() + LOCKOUT_MS;
    await writeRecord(loginKey, { failures: 0, lockedUntil });
    return { locked: true, retryAfterMs: LOCKOUT_MS };
  }

  await writeRecord(loginKey, { failures, lockedUntil: null });
  return { locked: false };
}

export async function resetPinAttempts(loginKey: string): Promise<void> {
  await SecureStore.deleteItemAsync(attemptKey(loginKey));
}
