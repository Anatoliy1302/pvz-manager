import * as SecureStore from 'expo-secure-store';
import { Pvz } from '../types/user';
import { normalizeEmail, toSecureStoreKeySuffix } from './loginIdentifier';
import { safeParseJson } from './safeJson';

export type OwnerPinLoginSnapshot = {
  ownerId: string;
  name: string;
  pvzId?: string;
  pvzList?: Pvz[];
};

function snapshotKey(email: string): string {
  return `owner_pin_login_${toSecureStoreKeySuffix(normalizeEmail(email))}`;
}

export async function saveOwnerPinLoginSnapshot(
  email: string,
  snapshot: OwnerPinLoginSnapshot
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized || !snapshot.ownerId) return;
  await SecureStore.setItemAsync(snapshotKey(normalized), JSON.stringify(snapshot));
}

export async function loadOwnerPinLoginSnapshot(
  email: string
): Promise<OwnerPinLoginSnapshot | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const raw = await SecureStore.getItemAsync(snapshotKey(normalized));
  return safeParseJson<OwnerPinLoginSnapshot | null>(raw, null);
}

export async function clearOwnerPinLoginSnapshot(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  await SecureStore.deleteItemAsync(snapshotKey(normalized));
}
