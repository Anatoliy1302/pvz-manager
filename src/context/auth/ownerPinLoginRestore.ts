import * as SecureStore from 'expo-secure-store';
import DataService from '../../services/DataService';
import PinService from '../../services/PinService';
import { normalizeEmail } from '../../utils/loginIdentifier';
import { loadOwnerPinLoginSnapshot } from '../../utils/ownerPinLoginStore';
import { loadOwnerPvzsWithRemoteFallback } from '../../services/SupabasePvzService';
import { ensureLocalOwnerRecord, resolveOwnerPvzsForLogin } from './ownerOps';
import { loadUsersFromStorage } from './userMemoryStore';
import type { Pvz } from '../../types/user';

async function persistOwnerPvzList(pvzList: Pvz[], primaryPvzId?: string): Promise<void> {
  if (pvzList.length === 0) return;
  await Promise.all(pvzList.map((pvz) => DataService.savePvz(pvz)));
  const primary = pvzList.find((pvz) => pvz.id === primaryPvzId) ?? pvzList[0];
  await SecureStore.setItemAsync('pvz', JSON.stringify(primary));
}

/** Восстановить локального владельца и ПВЗ для входа только по PIN (без OTP). */
export async function restoreOwnerForPinLogin(normalizedEmail: string): Promise<boolean> {
  const email = normalizeEmail(normalizedEmail);
  if (!email || !(await PinService.hasPin(email))) {
    return false;
  }

  const snapshot = await loadOwnerPinLoginSnapshot(email);
  if (!snapshot?.ownerId) {
    return false;
  }

  await loadUsersFromStorage();
  await ensureLocalOwnerRecord(email, snapshot.ownerId, snapshot.pvzId, snapshot.name);

  if (snapshot.pvzList?.length) {
    await persistOwnerPvzList(snapshot.pvzList, snapshot.pvzId);
    return true;
  }

  const resolved = await resolveOwnerPvzsForLogin(email, snapshot.ownerId);
  if (resolved.pvzList.length > 0) {
    await persistOwnerPvzList(resolved.pvzList, snapshot.pvzId ?? resolved.pvzList[0]?.id);
    return true;
  }

  const remote = await loadOwnerPvzsWithRemoteFallback(snapshot.ownerId);
  if (remote.length > 0) {
    await persistOwnerPvzList(remote, snapshot.pvzId ?? remote[0]?.id);
    return true;
  }

  return true;
}
