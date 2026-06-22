import * as SecureStore from 'expo-secure-store';
import { UserRole } from '../../types/user';
import DataService from '../../services/DataService';
import { mergeUserPermissions, ensureFullAdmin } from '../../utils/permissionHelpers';
import { runSyncOnLogin } from '../../services/runSyncOnLogin';
import notificationService from '../../services/NotificationService';
import SupportService from '../../services/SupportService';
import analyticsService from '../../services/AnalyticsService';
import { AnalyticsEvents } from '../../services/analytics/events';
import { startSupabaseRealtime } from '../../services/SupabaseRealtimeService';
import { LAST_LOGIN_PROFILE_KEY, type LastLoginProfile } from './lastLoginProfile';
import { normalizeEmail } from '../../utils/loginIdentifier';
import { AuthSetters, SignInOptions } from './types';
import { bindPvzForSessionUser } from './pvzContextHelpers';
import {
  loadUsersFromStorage,
  saveUsersToStorage,
  refreshPendingEmployees,
} from './userMemoryStore';
import { resolveLocalUser } from './localSignInFlow';
import { linkRemoteProfile } from './remoteSignInFlow';
import { saveOwnerPinLoginSnapshot } from '../../utils/ownerPinLoginStore';
import { rebuildPendingEmployeesFromInvitations } from './employeeOps';

async function applyPostLoginSideEffects(sessionUser: { id: string; role: UserRole }) {
  void (async () => {
    await runSyncOnLogin(sessionUser as Parameters<typeof runSyncOnLogin>[0]);
    await startSupabaseRealtime(sessionUser as Parameters<typeof startSupabaseRealtime>[0]);
    notificationService.setCurrentUserId(sessionUser.id);
    notificationService.setCurrentUserRole(sessionUser.role);
    await notificationService.applyUserPreferences();
    await notificationService.registerPushTokenForUser(sessionUser.id);
    await notificationService.deliverPendingStaffAlerts(sessionUser.id);
    await SupportService.flushLocalQueue();
    analyticsService.track(AnalyticsEvents.SIGN_IN, { role: sessionUser.role });
  })();
}

export async function performSignIn(
  loginKey: string,
  selectedRole: UserRole,
  setters: AuthSetters,
  options?: SignInOptions
) {
  // Не трогаем глобальный isLoading — он только для bootstrap AppNavigator.
  // Иначе после PIN весь экран уходит в SkeletonList на время signIn.
  let sessionUser: Awaited<ReturnType<typeof resolveLocalUser>> | null = null;

  await loadUsersFromStorage();
  await refreshPendingEmployees();

  const foundUser = await resolveLocalUser(loginKey, selectedRole, options);

  sessionUser =
    foundUser.role === 'employee'
      ? mergeUserPermissions(foundUser, foundUser.permissions)
      : foundUser;

  sessionUser = await linkRemoteProfile(sessionUser, loginKey, options);

  if (sessionUser.role === 'admin' && sessionUser.permissionLevel !== 'full') {
    await DataService.updateAdminPermissions(sessionUser.id, { permissionLevel: 'full' });
    sessionUser = { ...sessionUser, permissionLevel: 'full' };
  }
  sessionUser = ensureFullAdmin(sessionUser);
  setters.setUser(sessionUser);
  await SecureStore.setItemAsync('user', JSON.stringify(sessionUser));

  const lastLoginProfile: LastLoginProfile =
    selectedRole === 'owner'
      ? {
          email: normalizeEmail(loginKey),
          role: foundUser.role,
          name: foundUser.name,
        }
      : {
          phone: loginKey.replace(/[^0-9]/g, ''),
          role: foundUser.role,
          name: foundUser.name,
        };
  await SecureStore.setItemAsync(LAST_LOGIN_PROFILE_KEY, JSON.stringify(lastLoginProfile));

  try {
    await bindPvzForSessionUser(sessionUser, setters);
  } catch (bindError) {
    if (__DEV__) {
      console.warn('[Auth] bindPvzForSessionUser:', bindError);
    }
  }

  if (sessionUser.role === 'owner' || sessionUser.role === 'admin') {
    try {
      await rebuildPendingEmployeesFromInvitations(sessionUser.id);
    } catch (rebuildError) {
      if (__DEV__) {
        console.warn('[Auth] rebuildPendingEmployeesFromInvitations:', rebuildError);
      }
    }
  }

  if (sessionUser.role === 'owner' && sessionUser.email) {
    try {
      const ownerEmail = normalizeEmail(sessionUser.email);
      const ownerPvzs = await DataService.getPvzsByOwner(sessionUser.id);
      await saveOwnerPinLoginSnapshot(ownerEmail, {
        ownerId: sessionUser.id,
        name: sessionUser.name,
        pvzId: sessionUser.pvzId,
        pvzList: ownerPvzs,
      });
    } catch (snapshotError) {
      if (__DEV__) {
        console.warn('[Auth] saveOwnerPinLoginSnapshot:', snapshotError);
      }
    }
  }

  void applyPostLoginSideEffects(sessionUser);
}
