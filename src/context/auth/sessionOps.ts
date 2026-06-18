import * as SecureStore from 'expo-secure-store';
import { User, Pvz, defaultPermissions } from '../../types/user';
import { safeParseJson } from '../../utils/safeJson';
import DataService from '../../services/DataService';
import {
  mergeUserPermissions,
  ensureFullAdmin,
} from '../../utils/permissionHelpers';
import { runSyncOnLogin } from '../../services/runSyncOnLogin';
import notificationService from '../../services/NotificationService';
import { startSupabaseRealtime } from '../../services/SupabaseRealtimeService';
import { AuthSetters } from './types';
import {
  bindPvzForSessionUser,
  refreshOwnerPvzList,
  syncAdminPvzContext,
} from './pvzContextHelpers';
import {
  userMemory,
  subscribeUsersStore,
  loadUsersFromStorage,
} from './userMemoryStore';

export async function quickRestoreFromStorage(setters: AuthSetters): Promise<boolean> {
  try {
    const storedUser = await SecureStore.getItemAsync('user');
    if (!storedUser) return false;

    const parsedUser = safeParseJson<User | null>(storedUser, null);
    if (!parsedUser) return false;

    const currentUser = userMemory.getUsers().find((u) => u.id === parsedUser.id);
    if (currentUser && currentUser.status !== 'active') return false;

    let sessionUser = parsedUser;
    if (sessionUser.role === 'employee') {
      const source = currentUser || userMemory.getUsers().find((u) => u.id === sessionUser.id);
      if (source?.permissions) {
        sessionUser = mergeUserPermissions(sessionUser, source.permissions);
      } else if (!sessionUser.permissions) {
        sessionUser = mergeUserPermissions(sessionUser, defaultPermissions);
      }
    }
    sessionUser = ensureFullAdmin(sessionUser);
    setters.setUser(sessionUser);

    const storedPvz = await SecureStore.getItemAsync('pvz');
    if (sessionUser.role === 'owner') {
      const ownerPvzs = await DataService.getPvzsByOwner(sessionUser.id);
      setters.setUserPvzs(ownerPvzs);
      if (storedPvz) {
        const pvzData = safeParseJson<Pvz | null>(storedPvz, null);
        if (pvzData) setters.setPvz(pvzData);
      } else if (ownerPvzs.length > 0) {
        setters.setPvz(ownerPvzs[0]);
      }
    } else if (sessionUser.role === 'admin') {
      await syncAdminPvzContext(sessionUser, setters);
    } else if (sessionUser.pvzId) {
      await bindPvzForSessionUser(sessionUser, setters);
    }

    notificationService.setCurrentUserId(sessionUser.id);
    notificationService.setCurrentUserRole(sessionUser.role);
    return true;
  } catch {
    return false;
  }
}

export async function hydrateSessionUser(sessionUser: User, setters: AuthSetters) {
  let userToSet = sessionUser;

  if (sessionUser.role === 'employee') {
    await loadUsersFromStorage();
    const source = userMemory.getUsers().find(
      (u) => u.id === sessionUser.id || u.phone === sessionUser.phone
    );
    if (source?.permissions) {
      userToSet = mergeUserPermissions(sessionUser, source.permissions);
    }
  }

  if (userToSet.role === 'admin' && userToSet.permissionLevel !== 'full') {
    await DataService.updateAdminPermissions(userToSet.id, { permissionLevel: 'full' });
  }
  userToSet = ensureFullAdmin(userToSet);
  setters.setUser(userToSet);
  await SecureStore.setItemAsync('user', JSON.stringify(userToSet));

  await bindPvzForSessionUser(userToSet, setters);
  notificationService.setCurrentUserId(userToSet.id);
  notificationService.setCurrentUserRole(userToSet.role);
  void (async () => {
    await runSyncOnLogin(userToSet);
    await startSupabaseRealtime(userToSet);
    await notificationService.applyUserPreferences();
    await notificationService.registerPushTokenForUser(userToSet.id);
    await notificationService.deliverPendingStaffAlerts(userToSet.id);
  })();
}

export async function loadStoredUser(
  setters: AuthSetters,
  signOut: () => Promise<void>
) {
  try {
    const storedUser = await SecureStore.getItemAsync('user');
    const storedPvz = await SecureStore.getItemAsync('pvz');

    if (!storedUser) return;

    const parsedUser = safeParseJson<User | null>(storedUser, null);
    if (!parsedUser) return;
    const currentUser = userMemory.getUsers().find((u) => u.id === parsedUser.id);
    if (currentUser && currentUser.status !== 'active') {
      console.log('❌ Пользователь заблокирован, выходим');
      await signOut();
      return;
    }

    let sessionUser = parsedUser as User;
    if (sessionUser.role === 'employee') {
      const source = currentUser || userMemory.getUsers().find((u) => u.id === sessionUser.id);
      if (source?.permissions) {
        sessionUser = mergeUserPermissions(sessionUser, source.permissions);
        await SecureStore.setItemAsync('user', JSON.stringify(sessionUser));
      } else if (!sessionUser.permissions) {
        sessionUser = mergeUserPermissions(sessionUser, defaultPermissions);
        await SecureStore.setItemAsync('user', JSON.stringify(sessionUser));
      }
    }

    if (sessionUser.role === 'admin' && sessionUser.permissionLevel !== 'full') {
      await DataService.updateAdminPermissions(sessionUser.id, { permissionLevel: 'full' });
      sessionUser = { ...sessionUser, permissionLevel: 'full' };
    }
    sessionUser = ensureFullAdmin(sessionUser);
    setters.setUser(sessionUser);
    await SecureStore.setItemAsync('user', JSON.stringify(sessionUser));

    if (sessionUser.role === 'owner') {
      const ownerPvzs = await DataService.getPvzsByOwner(sessionUser.id);
      setters.setUserPvzs(ownerPvzs);
      if (storedPvz) {
        const pvz = safeParseJson<Pvz | null>(storedPvz, null);
        if (pvz) setters.setPvz(pvz);
      } else if (ownerPvzs.length > 0) {
        setters.setPvz(ownerPvzs[0]);
      }
    } else if (sessionUser.role === 'admin') {
      await syncAdminPvzContext(sessionUser, setters);
    } else if (sessionUser.pvzId) {
      await bindPvzForSessionUser(sessionUser, setters);
    }

    notificationService.setCurrentUserId(sessionUser.id);
    notificationService.setCurrentUserRole(sessionUser.role);
    await notificationService.applyUserPreferences();
    await notificationService.registerPushTokenForUser(sessionUser.id);
    await notificationService.deliverPendingStaffAlerts(sessionUser.id);
  } catch (error) {
    console.error('Ошибка загрузки пользователя:', error);
  } finally {
    setters.setIsLoading(false);
  }
}

export async function refreshUserData(
  currentPvz: Pvz | null,
  setters: Pick<AuthSetters, 'setUser' | 'setPvz' | 'setUserPvzs'>
) {
  const storedUser = await SecureStore.getItemAsync('user');
  if (!storedUser) return;

  let currentUser = safeParseJson<User | null>(storedUser, null);
  if (!currentUser) return;

  if (currentUser.role === 'employee') {
    await loadUsersFromStorage();
    const userId = currentUser.id;
    const source = userMemory.getUsers().find((u) => u.id === userId);
    if (source?.permissions) {
      currentUser = mergeUserPermissions(currentUser, source.permissions);
      await SecureStore.setItemAsync('user', JSON.stringify(currentUser));
    }
  }

  setters.setUser(currentUser);

  if (currentUser.role === 'owner') {
    await refreshOwnerPvzList(currentUser.id, currentPvz, setters);
  } else if (currentUser.role === 'admin') {
    await syncAdminPvzContext(currentUser, setters);
  } else if (currentUser.pvzId) {
    const userPvz = await DataService.getPvzById(currentUser.pvzId);
    if (userPvz) {
      setters.setPvz(userPvz);
      setters.setUserPvzs([userPvz]);
      await SecureStore.setItemAsync('pvz', JSON.stringify(userPvz));
    } else {
      const pvzs = await DataService.getPvzs();
      if (pvzs.length > 0) {
        setters.setPvz(pvzs[0]);
        setters.setUserPvzs([pvzs[0]]);
      }
    }
  }
}
