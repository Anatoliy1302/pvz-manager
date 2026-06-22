import * as SecureStore from 'expo-secure-store';
import { User, Pvz } from '../../types/user';
import DataService from '../../services/DataService';
import { AuthSetters } from './types';
import { safeParseJson } from '../../utils/safeJson';
import { loadOwnerPvzsWithRemoteFallback } from '../../services/SupabasePvzService';

export async function syncAdminPvzContext(
  adminUser: User,
  setters: Pick<AuthSetters, 'setUserPvzs' | 'setPvz'>
) {
  const adminPvzList = await DataService.getPvzsForAdmin(adminUser);
  setters.setUserPvzs(adminPvzList);

  if (adminPvzList.length === 0) {
    setters.setPvz(null);
    return;
  }

  const storedPvzRaw = await SecureStore.getItemAsync('pvz');
  if (storedPvzRaw) {
    const storedPvz = safeParseJson<Pvz | null>(storedPvzRaw, null);
    if (storedPvz) {
      const matched = adminPvzList.find((p) => p.id === storedPvz.id);
      if (matched) {
        setters.setPvz(matched);
        return;
      }
    }
  }

  const primary = adminPvzList.find((p) => p.id === adminUser.pvzId) || adminPvzList[0];
  setters.setPvz(primary);
  await SecureStore.setItemAsync('pvz', JSON.stringify(primary));
}

export async function bindPvzForSessionUser(sessionUser: User, setters: AuthSetters) {
  if (sessionUser.role === 'owner') {
    const ownerPvzs = await loadOwnerPvzsWithRemoteFallback(sessionUser.id);
    setters.setUserPvzs(ownerPvzs);
    const storedPvz = await SecureStore.getItemAsync('pvz');
    if (storedPvz) {
      const parsed = safeParseJson<Pvz | null>(storedPvz, null);
      const matched = parsed ? ownerPvzs.find((p) => p.id === parsed.id) : null;
      if (matched) {
        setters.setPvz(matched);
        return;
      }
    }
    if (ownerPvzs.length > 0) {
      setters.setPvz(ownerPvzs[0]);
      await SecureStore.setItemAsync('pvz', JSON.stringify(ownerPvzs[0]));
    }
    return;
  }

  if (sessionUser.role === 'admin') {
    await syncAdminPvzContext(sessionUser, setters);
    return;
  }

  if (sessionUser.pvzId) {
    const userPvz = await DataService.getPvzById(sessionUser.pvzId);
    if (userPvz) {
      setters.setPvz(userPvz);
      setters.setUserPvzs([userPvz]);
      await SecureStore.setItemAsync('pvz', JSON.stringify(userPvz));
      return;
    }

    const pvzs = await DataService.getPvzs();
    if (pvzs.length > 0) {
      setters.setPvz(pvzs[0]);
      setters.setUserPvzs([pvzs[0]]);
      await SecureStore.setItemAsync('pvz', JSON.stringify(pvzs[0]));
    }
  }
}

function samePvzList(prev: Pvz[], next: Pvz[]): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((p, i) => p.id === next[i]?.id);
}

export async function refreshOwnerPvzList(
  ownerId: string,
  currentPvz: Pvz | null,
  setters: Pick<AuthSetters, 'setUserPvzs' | 'setPvz'>
) {
  const ownerPvzs = await loadOwnerPvzsWithRemoteFallback(ownerId);
  setters.setUserPvzs((prev) => (samePvzList(prev, ownerPvzs) ? prev : ownerPvzs));
  if (currentPvz && ownerPvzs.some((p) => p.id === currentPvz.id)) {
    const updatedPvz = ownerPvzs.find((p) => p.id === currentPvz.id);
    if (updatedPvz) {
      setters.setPvz((prev) => (prev?.id === updatedPvz.id ? prev : updatedPvz));
    }
  } else if (ownerPvzs.length > 0) {
    setters.setPvz((prev) => (prev?.id === ownerPvzs[0].id ? prev : ownerPvzs[0]));
    await SecureStore.setItemAsync('pvz', JSON.stringify(ownerPvzs[0]));
  }
}
