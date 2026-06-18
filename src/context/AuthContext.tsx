// src/context/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { User, UserRole, Pvz } from '../types/user';
import DataService from '../services/DataService';
import { mergeUserPermissions } from '../utils/permissionHelpers';
import { safeParseJson } from '../utils/safeJson';
import {
  restoreSupabaseSession,
  signOutSupabase,
  subscribeToAuthChanges,
  warmSupabaseClientSession,
} from '../services/SupabaseAuthService';
import notificationService from '../services/NotificationService';
import { stopSupabaseRealtime } from '../services/SupabaseRealtimeService';
import { withTimeout } from '../utils/withTimeout';
import subscriptionService, { Subscription } from '../services/subscriptionService';
import analyticsService from '../services/AnalyticsService';
import { AnalyticsEvents } from '../services/analytics/events';
import { clearQueryCache } from '../lib/queryClient';

export { LAST_LOGIN_PROFILE_KEY, type LastLoginProfile } from './auth/lastLoginProfile';
export type { SignInOptions } from './auth/types';

import { AuthContextData, AuthSetters } from './auth/types';
import { checkHasPermission, checkHasRole } from './auth/authPermissions';
import { syncAdminPvzContext } from './auth/pvzContextHelpers';
import {
  userMemory,
  loadUsersFromStorage,
  loadPendingEmployeesFromStorage,
} from './auth/userMemoryStore';
import { performSignIn } from './auth/signInFlow';
import { hydrateSessionUser, loadStoredUser, refreshUserData, quickRestoreFromStorage } from './auth/sessionOps';
import {
  addEmployeeInvitation,
  revokeEmployeeInvitation,
  confirmPendingEmployeeAccount,
  updateEmployeePvzAssignment,
  getActiveEmployees,
  getActiveEmployeesByPvz,
  countStaffForPvz,
  getPendingEmployeeList,
  getPendingEmployeesCountForUser,
} from './auth/employeeOps';
import {
  blockUserAccount,
  checkOwnerExists,
  registerOwnerAccount,
} from './auth/ownerOps';
import { deleteUserAccount, AccountDeletionError } from './accountDeletionService';

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [pvz, setPvz] = useState<Pvz | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userPvzs, setUserPvzs] = useState<Pvz[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const setters: AuthSetters = { setUser, setPvz, setUserPvzs, setIsLoading };

  const signOut = async () => {
    analyticsService.track(AnalyticsEvents.SIGN_OUT, { role: user?.role });
    stopSupabaseRealtime();
    notificationService.setCurrentUserId(undefined);
    notificationService.setCurrentUserRole(undefined);

    try {
      await DataService.clearAllData();
      await subscriptionService.clearCache();
      clearQueryCache();
    } catch (error) {
      console.error('signOut: не удалось очистить локальные данные:', error);
    }

    await signOutSupabase();
    await notificationService.applyUserPreferences();

    setUser(null);
    setPvz(null);
    setUserPvzs([]);
    setSubscription(null);
  };

  const deleteAccount = async () => {
    try {
      await deleteUserAccount();
    } catch (error) {
      if (error instanceof AccountDeletionError) {
        throw error;
      }
      throw new AccountDeletionError(
        error instanceof Error ? error.message : 'Не удалось удалить аккаунт'
      );
    }
    await signOut();
  };

  const initDoneRef = useRef(false);
  const userRef = useRef(user);
  const pvzRef = useRef(pvz);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    pvzRef.current = pvz;
  }, [pvz]);

  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([
          loadUsersFromStorage(),
          loadPendingEmployeesFromStorage(),
        ]);

        // Быстрый путь: показать UI из локального кэша без ожидания сети
        const hasLocalSession = await quickRestoreFromStorage(setters);
        if (hasLocalSession) {
          initDoneRef.current = true;
          setIsLoading(false);
          const cached = await subscriptionService.getCachedSubscription();
          if (cached) setSubscription(cached);
        }

        const supabaseUser = await withTimeout(restoreSupabaseSession(), 8000, null);
        if (supabaseUser) {
          await hydrateSessionUser(supabaseUser, setters);
          const sub = await subscriptionService.fetchSubscription(supabaseUser.id);
          setSubscription(sub);
          return;
        }

        if (!hasLocalSession) {
          await loadStoredUser(setters, signOut);
          warmSupabaseClientSession();
          const cached = await subscriptionService.getCachedSubscription();
          if (cached) setSubscription(cached);
        } else {
          warmSupabaseClientSession();
        }
      } catch (error) {
        console.error('Ошибка инициализации сессии:', error);
      } finally {
        initDoneRef.current = true;
        setIsLoading(false);
      }
    };
    void init();
  }, []);

  useEffect(() => {
    return subscribeToAuthChanges(() => {
      if (!initDoneRef.current) return;

      void (async () => {
        try {
          const supabaseUser = await restoreSupabaseSession();
          if (supabaseUser) {
            await hydrateSessionUser(supabaseUser, setters);
            const sub = await subscriptionService.fetchSubscription(supabaseUser.id);
            setSubscription(sub);
          }
        } catch (error) {
          if (__DEV__) {
            console.warn('[Auth] auth state sync failed:', error);
          }
        }
      })();
    });
  }, []);

  useEffect(() => {
    const unsubscribeUsers = DataService.subscribe('pvz_users', async () => {
      await loadUsersFromStorage();
      await loadPendingEmployeesFromStorage();

      const storedUser = await SecureStore.getItemAsync('user');
      if (!storedUser) return;

      const parsed = safeParseJson<User | null>(storedUser, null);
      if (!parsed) return;
      if (parsed.role === 'employee') {
        const source = userMemory.getUsers().find((u) => u.id === parsed.id);
        if (source?.permissions) {
          const updated = mergeUserPermissions(parsed, source.permissions);
          setUser(updated);
          await SecureStore.setItemAsync('user', JSON.stringify(updated));
        }
      } else if (parsed.role === 'admin') {
        const source = userMemory.getUsers().find((u) => u.id === parsed.id);
        if (source) {
          const updated: User = {
            ...parsed,
            pvzId: source.pvzId,
            pvzIds: source.pvzIds,
            permissionLevel: source.permissionLevel,
          };
          setUser(updated);
          await SecureStore.setItemAsync('user', JSON.stringify(updated));
          await syncAdminPvzContext(updated, setters);
        }
      }
    });

    return () => unsubscribeUsers();
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'employee') return;

    const unsubscribe = DataService.subscribeToPermissions(user.id, async () => {
      const users = await DataService.getUsers();
      const source = users.find((u) => u.id === user.id);
      if (source?.permissions) {
        const updated = mergeUserPermissions(user, source.permissions);
        setUser(updated);
        await SecureStore.setItemAsync('user', JSON.stringify(updated));
      }
    });

    return unsubscribe;
  }, [user?.id, user?.role]);

  useEffect(() => {
    const unsubscribe = DataService.subscribe('pvz_list', async () => {
      const currentUser = userRef.current;
      if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'admin')) return;

      let userPvzList: Pvz[] = [];
      if (currentUser.role === 'owner') {
        userPvzList = await DataService.getPvzsByOwner(currentUser.id);
      } else {
        userPvzList = await DataService.getPvzsForAdmin(currentUser);
      }

      setUserPvzs(userPvzList);
      const currentPvz = pvzRef.current;
      if (userPvzList.length > 0 && (!currentPvz || !userPvzList.some((p) => p.id === currentPvz.id))) {
        setPvz(userPvzList[0]);
        await SecureStore.setItemAsync('pvz', JSON.stringify(userPvzList[0]));
      }
    });

    return () => unsubscribe();
  }, []);

  const refreshSubscription = async (): Promise<Subscription | null> => {
    if (!user?.id) return null;
    const sub = await subscriptionService.fetchSubscription(user.id);
    setSubscription(sub);
    return sub;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        pvz,
        subscription,
        isLoading,
        userPvzs,
        signIn: (phone, role, options) => performSignIn(phone, role, setters, options),
        signOut,
        deleteAccount,
        deleteUserAccount: deleteAccount,
        hasRole: (roles) => checkHasRole(user, roles),
        hasPermission: (permission) => checkHasPermission(user, permission),
        switchPvz: async (pvzId) => {
          const newPvz = userPvzs.find((p) => p.id === pvzId);
          if (newPvz && (user?.role === 'owner' || user?.role === 'admin')) {
            setPvz(newPvz);
            await SecureStore.setItemAsync('pvz', JSON.stringify(newPvz));
          }
        },
        addEmployee: (phone, name, role, pvzId) =>
          addEmployeeInvitation(phone, name, role, user, pvz, pvzId),
        revokeInvitation: (invitationId) => {
          if (!user?.id) throw new Error('Не авторизован');
          return revokeEmployeeInvitation(invitationId, user.id);
        },
        confirmPendingEmployee: (pendingUserId) => {
          if (!user) throw new Error('Не авторизован');
          return confirmPendingEmployeeAccount(pendingUserId, user, pvz);
        },
        getPendingEmployees: getPendingEmployeeList,
        getEmployees: () => getActiveEmployees(user, pvz),
        getEmployeesByPvz: getActiveEmployeesByPvz,
        updateEmployeePvz: updateEmployeePvzAssignment,
        updateUserPvzs: async (newPvzs) => {
          setUserPvzs(newPvzs);
          if (pvz === null || !newPvzs.some((p) => p.id === pvz?.id)) {
            if (newPvzs.length > 0) {
              setPvz(newPvzs[0]);
              await SecureStore.setItemAsync('pvz', JSON.stringify(newPvzs[0]));
            }
          }
        },
        updateCurrentPvz: async (pvzId) => {
          const newPvz = userPvzs.find((p) => p.id === pvzId);
          if (newPvz && (user?.role === 'owner' || user?.role === 'admin')) {
            setPvz(newPvz);
            await SecureStore.setItemAsync('pvz', JSON.stringify(newPvz));
          }
        },
        refreshUserData: () => refreshUserData(pvz, setters),
        getPendingEmployeesCount: () => getPendingEmployeesCountForUser(user?.id),
        registerOwner: (phone, name, pvzName, address) =>
          registerOwnerAccount(phone, name, pvzName, address, setters),
        isOwnerExists: checkOwnerExists,
        blockUser: (userId) => blockUserAccount(userId, user?.id, signOut),
        refreshSubscription,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
