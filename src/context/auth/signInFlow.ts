import * as SecureStore from 'expo-secure-store';
import { UserRole } from '../../types/user';
import DataService from '../../services/DataService';
import { mergeUserPermissions, ensureFullAdmin } from '../../utils/permissionHelpers';
import { runSyncOnLogin } from '../../services/runSyncOnLogin';
import notificationService from '../../services/NotificationService';
import SupportService from '../../services/SupportService';
import { startSupabaseRealtime } from '../../services/SupabaseRealtimeService';
import { hasSupabaseSession } from '../../services/SupabaseAuthService';
import { LAST_LOGIN_PROFILE_KEY, type LastLoginProfile } from './lastLoginProfile';
import { AuthSetters, SignInOptions } from './types';
import { bindPvzForSessionUser } from './pvzContextHelpers';
import {
  loadUsersFromStorage,
  saveUsersToStorage,
  refreshPendingEmployees,
} from './userMemoryStore';
import { resolveLocalUser } from './localSignInFlow';
import { linkRemoteProfile } from './remoteSignInFlow';

async function applyPostLoginSideEffects(sessionUser: { id: string; role: UserRole }) {
  if (await hasSupabaseSession()) {
    await runSyncOnLogin(sessionUser as Parameters<typeof runSyncOnLogin>[0]);
    await startSupabaseRealtime(sessionUser as Parameters<typeof startSupabaseRealtime>[0]);
  }

  notificationService.setCurrentUserId(sessionUser.id);
  notificationService.setCurrentUserRole(sessionUser.role);
  await notificationService.applyUserPreferences();
  await notificationService.registerPushTokenForUser(sessionUser.id);
  await notificationService.deliverPendingStaffAlerts(sessionUser.id);
  await SupportService.flushLocalQueue();
}

export async function performSignIn(
  phone: string,
  selectedRole: UserRole,
  setters: AuthSetters,
  options?: SignInOptions
) {
  setters.setIsLoading(true);

  const cleanPhone = phone.replace(/[^0-9]/g, '');

  try {
    await loadUsersFromStorage();
    await refreshPendingEmployees();

    const foundUser = await resolveLocalUser(cleanPhone, selectedRole, options);

    let sessionUser =
      foundUser.role === 'employee'
        ? mergeUserPermissions(foundUser, foundUser.permissions)
        : foundUser;

    sessionUser = await linkRemoteProfile(sessionUser, cleanPhone);

    if (sessionUser.role === 'admin' && sessionUser.permissionLevel !== 'full') {
      await DataService.updateAdminPermissions(sessionUser.id, { permissionLevel: 'full' });
      sessionUser = { ...sessionUser, permissionLevel: 'full' };
    }
    sessionUser = ensureFullAdmin(sessionUser);
    setters.setUser(sessionUser);
    await SecureStore.setItemAsync('user', JSON.stringify(sessionUser));

    const lastLoginProfile: LastLoginProfile = {
      phone: cleanPhone,
      role: foundUser.role,
      name: foundUser.name,
    };
    await SecureStore.setItemAsync(LAST_LOGIN_PROFILE_KEY, JSON.stringify(lastLoginProfile));

    await bindPvzForSessionUser(sessionUser, setters);
    await applyPostLoginSideEffects(sessionUser);
  } finally {
    setters.setIsLoading(false);
  }
}
