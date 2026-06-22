import { pullSync, pushSync } from './syncService';
import { getToken } from './authSessionStore';
import { mergeDeepSnapshot } from './snapshotMerge';

const SNAPSHOT_KEYS = [
  'payments',
  'penalties',
  'advance_requests',
  'shift_requests',
  'notifications',
  'profiles',
  'salary_bundles',
  'employee_salary_settings',
  'subscriptions',
  'subscription_payments',
  'push_tokens',
  'support_messages',
  'analytics_events',
] as const;

export type SnapshotKey = (typeof SNAPSHOT_KEYS)[number];

export async function readSnapshotPayload(): Promise<Record<string, unknown>> {
  if (!(await getToken())) return {};
  try {
    const remote = await pullSync();
    const snap = remote.snapshot;
    if (snap && typeof snap === 'object' && !Array.isArray(snap)) {
      return { ...(snap as Record<string, unknown>) };
    }
    return {};
  } catch {
    return {};
  }
}

export async function patchSnapshotPayload(patch: Record<string, unknown>): Promise<void> {
  if (!(await getToken())) return;
  const current = await readSnapshotPayload();
  await pushSync(mergeDeepSnapshot(current, patch));
}

export async function readSnapshotArray<T>(key: SnapshotKey | string): Promise<T[]> {
  const payload = await readSnapshotPayload();
  const value = payload[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function writeSnapshotArray<T>(key: SnapshotKey | string, items: T[]): Promise<void> {
  await patchSnapshotPayload({ [key]: items });
}

export async function upsertSnapshotItem<T extends { id: string }>(
  key: SnapshotKey | string,
  item: T
): Promise<T> {
  const items = await readSnapshotArray<T>(key);
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    items[index] = item;
  } else {
    items.push(item);
  }
  await writeSnapshotArray(key, items);
  return item;
}

export async function updateSnapshotItem<T extends { id: string }>(
  key: SnapshotKey | string,
  id: string,
  patch: Partial<T>
): Promise<boolean> {
  const items = await readSnapshotArray<T>(key);
  const index = items.findIndex((entry) => entry.id === id);
  if (index < 0) return false;
  items[index] = { ...items[index], ...patch };
  await writeSnapshotArray(key, items);
  return true;
}

export async function readSnapshotMap<T>(
  key: SnapshotKey | string
): Promise<Record<string, T>> {
  const payload = await readSnapshotPayload();
  const value = payload[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, T>;
  }
  return {};
}

export async function writeSnapshotMap<T>(
  key: SnapshotKey | string,
  map: Record<string, T>
): Promise<void> {
  await patchSnapshotPayload({ [key]: map });
}
