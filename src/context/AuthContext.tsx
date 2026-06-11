// src/context/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { User, UserRole, Pvz, EmployeePermissions } from '../types/user';
import DataService from '../services/DataService';
import { mergeUserPermissions } from '../utils/permissionHelpers';
import {
  restoreSupabaseSession,
  signOutSupabase,
  subscribeToAuthChanges,
} from '../services/SupabaseAuthService';
import notificationService from '../services/NotificationService';
import { stopSupabaseRealtime } from '../services/SupabaseRealtimeService';

export { LAST_LOGIN_PROFILE_KEY, type LastLoginProfile } from './auth/lastLoginProfile';
export type { SignInOptions } from './auth/types';

import { AuthContextData, AuthSetters } from './auth/types';
import { checkHasPermission, checkHasRole } from './auth/authPermissions';
import { syncAdminPvzContext } from './auth/pvzContextHelpers';
import {
  USERS_STORE,
  loadUsersFromStorage,
  loadPendingEmployeesFromStorage,
} from './auth/userMemoryStore';
import { performSignIn } from './auth/signInFlow';
import { hydrateSessionUser, loadStoredUser, refreshUserData } from './auth/sessionOps';
import {
  addEmployeeInvitation,
  revokeEmployeeInvitation,
  confirmPendingEmployeeAccount,
  updateEmployeePvzAssignment,
  getActiveEmployees,
  getActiveEmployeesByPvz,
  getPendingEmployeeList,
  getPendingEmployeesCountForUser,
} from './auth/employeeOps';
import {
  blockUserAccount,
  checkOwnerExists,
  registerOwnerAccount,
} from './auth/ownerOps';

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [pvz, setPvz] = useState<Pvz | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userPvzs, setUserPvzs] = useState<Pvz[]>([]);

  const setters: AuthSetters = { setUser, setPvz, setUserPvzs, setIsLoading };

  const signOut = async () => {
    stopSupabaseRealtime();
    await signOutSupabase();
    notificationService.setCurrentUserRole(undefined);
    await notificationService.applyUserPreferences();
    await SecureStore.deleteItemAsync('user');
    await SecureStore.deleteItemAsync('pvz');
    setUser(null);
    setPvz(null);
    setUserPvzs([]);
  };

  useEffect(() => {
    const init = async () => {
      await loadUsersFromStorage();
      await loadPendingEmployeesFromStorage();

      const supabaseUser = await restoreSupabaseSession();
      if (supabaseUser) {
        await hydrateSessionUser(supabaseUser, setters);
        setIsLoading(false);
        return;
      }

      await loadStoredUser(setters, signOut);
    };
    init();
  }, []);

  useEffect(() => {
    return subscribeToAuthChanges(async () => {
      const supabaseUser = await restoreSupabaseSession();
      if (supabaseUser) {
        await hydrateSessionUser(supabaseUser, setters);
      }
    });
  }, []);

  useEffect(() => {
    const unsubscribeUsers = DataService.subscribe('pvz_users', async () => {
      await loadUsersFromStorage();
      await loadPendingEmployeesFromStorage();

      const storedUser = await SecureStore.getItemAsync('user');
      if (!storedUser) return;

      const parsed = JSON.parse(storedUser) as User;
      if (parsed.role === 'employee') {
        const source = USERS_STORE.find((u) => u.id === parsed.id);
        if (source?.permissions) {
          const updated = mergeUserPermissions(parsed, source.permissions);
          setUser(updated);
          await SecureStore.setItemAsync('user', JSON.stringify(updated));
        }
      } else if (parsed.role === 'admin') {
        const source = USERS_STORE.find((u) => u.id === parsed.id);
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
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) return;

      let userPvzList: Pvz[] = [];
      if (user.role === 'owner') {
        userPvzList = await DataService.getPvzsByOwner(user.id);
      } else {
        userPvzList = await DataService.getPvzsForAdmin(user);
      }

      setUserPvzs(userPvzList);
      if (userPvzList.length > 0 && (!pvz || !userPvzList.some((p) => p.id === pvz.id))) {
        setPvz(userPvzList[0]);
        await SecureStore.setItemAsync('pvz', JSON.stringify(userPvzList[0]));
      }
    });

    return () => unsubscribe();
  }, [user, pvz]);

  return (
    <AuthContext.Provider
      value={{
        user,
        pvz,
        isLoading,
        userPvzs,
        signIn: (phone, role, options) => performSignIn(phone, role, setters, options),
        signOut,
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
