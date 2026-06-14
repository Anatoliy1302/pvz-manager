import * as SecureStore from 'expo-secure-store';
import { cleanPhone } from './phoneHelpers';
import { safeParseJson } from './safeJson';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

interface PinAttemptRecord {
  failures: number;
  lockedUntil: number | null;
}

function attemptKey(phone: string): string {
  return `pin_attempts_${cleanPhone(phone)}`;
}

async function readRecord(phone: string): Promise<PinAttemptRecord> {
  const raw = await SecureStore.getItemAsync(attemptKey(phone));
  if (!raw) return { failures: 0, lockedUntil: null };
  return safeParseJson<PinAttemptRecord>(raw, { failures: 0, lockedUntil: null });
}

async function writeRecord(phone: string, record: PinAttemptRecord): Promise<void> {
  await SecureStore.setItemAsync(attemptKey(phone), JSON.stringify(record));
}

export type PinLockStatus =
  | { locked: false }
  | { locked: true; retryAfterMs: number };

export async function getPinLockStatus(phone: string): Promise<PinLockStatus> {
  const record = await readRecord(phone);
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return { locked: true, retryAfterMs: record.lockedUntil - Date.now() };
  }
  return { locked: false };
}

export async function recordPinFailure(phone: string): Promise<PinLockStatus> {
  const record = await readRecord(phone);
  const failures = record.failures + 1;

  if (failures >= MAX_ATTEMPTS) {
    const lockedUntil = Date.now() + LOCKOUT_MS;
    await writeRecord(phone, { failures: 0, lockedUntil });
    return { locked: true, retryAfterMs: LOCKOUT_MS };
  }

  await writeRecord(phone, { failures, lockedUntil: null });
  return { locked: false };
}

export async function resetPinAttempts(phone: string): Promise<void> {
  await SecureStore.deleteItemAsync(attemptKey(phone));
}
