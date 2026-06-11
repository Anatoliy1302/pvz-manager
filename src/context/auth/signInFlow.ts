import * as SecureStore from 'expo-secure-store';
import { UserRole } from '../../types/user';
import DataService from '../../services/DataService';
import {
  mergeUserPermissions,
  ensureFullAdmin,
} from '../../utils/permissionHelpers';
import {
  linkSupabaseProfile,
  migrateLocalUserId,
  isSupabaseProviderConfigError,
  hasSupabaseSession,
} from '../../services/SupabaseAuthService';
import { runSyncOnLogin } from '../../services/runSyncOnLogin';
import {
  fetchInvitationByPhone,
  updateInvitationStatusInSupabase,
} from '../../services/SupabaseInvitationService';
import notificationService from '../../services/NotificationService';
import SupportService from '../../services/SupportService';
import { startSupabaseRealtime } from '../../services/SupabaseRealtimeService';
import { LAST_LOGIN_PROFILE_KEY, type LastLoginProfile } from './lastLoginProfile';
import { AuthSetters, SignInOptions } from './types';
import { bindPvzForSessionUser } from './pvzContextHelpers';
import {
  USERS_STORE,
  PENDING_EMPLOYEES,
  loadUsersFromStorage,
  saveUsersToStorage,
  savePendingEmployeesToStorage,
  refreshPendingEmployees,
} from './userMemoryStore';

async function applyPostLoginSideEffects(sessionUser: { id: string; role: UserRole }) {
  if (await hasSupabaseSession()) {
    await runSyncOnLogin(sessionUser as Parameters<typeof runSyncOnLogin>[0]);
    await startSupabaseRealtime(sessionUser as Parameters<typeof startSupabaseRealtime>[0]);
  }

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

  console.log('🔐 Вход:', { cleanPhone, selectedRole, options });

  await loadUsersFromStorage();
  await refreshPendingEmployees();

  let foundUser = USERS_STORE.find((u) => u.phone === cleanPhone && u.status === 'active') || null;

  if (foundUser) {
    console.log(`📋 Найден активный пользователь: ${foundUser.name}, роль: ${foundUser.role}`);

    if (foundUser.role !== selectedRole) {
      setters.setIsLoading(false);
      throw new Error(
        `Вы зарегистрированы как ${foundUser.role === 'owner' ? 'владелец' : foundUser.role === 'admin' ? 'администратор' : 'сотрудник'}. Выберите правильную роль.`
      );
    }
  }

  if (!foundUser && selectedRole !== 'owner') {
    console.log('🔍 Ищем в PENDING_EMPLOYEES:', PENDING_EMPLOYEES.map((u) => u.phone));

    let pendingUser = PENDING_EMPLOYEES.find((u) => u.phone === cleanPhone);

    if (!pendingUser && (await hasSupabaseSession())) {
      const remoteInvitation = await fetchInvitationByPhone(cleanPhone);
      if (remoteInvitation?.status === 'pending') {
        pendingUser = {
          id: Date.now().toString(),
          name: remoteInvitation.name,
          email: `${cleanPhone}@temp.pvz`,
          phone: cleanPhone,
          role: remoteInvitation.role,
          status: 'pending',
          pvzId: remoteInvitation.pvzId,
          createdAt: remoteInvitation.createdAt,
          invitedBy: remoteInvitation.invitedBy,
          passwordHash: '',
        };

        const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
        const allInvitations = allInvitationsRaw ? JSON.parse(allInvitationsRaw) : [];
        const exists = allInvitations.some((inv: { id: string }) => inv.id === remoteInvitation.id);
        if (!exists) {
          allInvitations.push({ ...remoteInvitation, pvzName: 'ПВЗ' });
          await SecureStore.setItemAsync('all_invitations', JSON.stringify(allInvitations));
        }
      }
    }

    if (pendingUser) {
      console.log('✅ Найден приглашённый сотрудник:', pendingUser.name);

      const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
      const allInvitations = allInvitationsRaw ? JSON.parse(allInvitationsRaw) : [];

      let invitation = options?.invitationId
        ? allInvitations.find(
            (inv: { id: string; status: string }) =>
              inv.id === options.invitationId && inv.status === 'pending'
          )
        : undefined;

      if (!invitation) {
        invitation = allInvitations.find(
          (inv: { phone: string; status: string; pvzId?: string; role?: string }) =>
            inv.phone.replace(/[^0-9]/g, '') === cleanPhone &&
            inv.status === 'pending' &&
            (!options?.pvzId || inv.pvzId === options.pvzId) &&
            (!inv.role || inv.role === selectedRole)
        );
      }

      if (!invitation) {
        console.log('❌ Приглашение отозвано или не найдено');
        setters.setIsLoading(false);
        throw new Error('Ваше приглашение отозвано или истекло. Обратитесь к администратору.');
      }

      const inviteRole: UserRole = invitation.role === 'admin' ? 'admin' : 'employee';
      if (inviteRole !== selectedRole) {
        setters.setIsLoading(false);
        throw new Error(
          `Ваше приглашение для роли «${inviteRole === 'admin' ? 'администратор' : 'сотрудник'}». Выберите правильную роль.`
        );
      }

      foundUser = {
        ...pendingUser,
        status: 'active' as const,
        name: invitation.name || pendingUser.name,
        role: inviteRole,
        pvzId: invitation.pvzId || pendingUser.pvzId,
        permissionLevel:
          inviteRole === 'admin' ? pendingUser.permissionLevel || 'full' : pendingUser.permissionLevel,
        pvzIds: inviteRole === 'admin' ? pendingUser.pvzIds || [invitation.pvzId] : pendingUser.pvzIds,
      };
      USERS_STORE.push(foundUser);
      await saveUsersToStorage();

      const pendingIndex = PENDING_EMPLOYEES.findIndex((u) => u.phone === cleanPhone);
      if (pendingIndex !== -1) {
        PENDING_EMPLOYEES.splice(pendingIndex, 1);
        await savePendingEmployeesToStorage();
      }

      invitation.status = 'accepted';
      await SecureStore.setItemAsync('all_invitations', JSON.stringify(allInvitations));
      await updateInvitationStatusInSupabase(invitation.id, 'accepted');

      const ownerInvitationsRaw = await SecureStore.getItemAsync(`invitations_${invitation.invitedBy}`);
      const ownerInvitations = ownerInvitationsRaw ? JSON.parse(ownerInvitationsRaw) : [];
      const ownerIndex = ownerInvitations.findIndex((inv: { id: string }) => inv.id === invitation.id);
      if (ownerIndex !== -1) {
        ownerInvitations[ownerIndex].status = 'accepted';
        await SecureStore.setItemAsync(
          `invitations_${invitation.invitedBy}`,
          JSON.stringify(ownerInvitations)
        );
      }

      console.log(`✅ Сотрудник ${foundUser.name} активирован! ПВЗ ID: ${foundUser.pvzId}`);
    } else {
      console.log('❌ Номер не найден в системе и нет приглашения');
      setters.setIsLoading(false);
      throw new Error('Номера нет в базе. Обратитесь к владельцу ПВЗ');
    }
  }

  if (!foundUser && selectedRole === 'owner' && __DEV__) {
    const demoOwners = [{ phone: '79991234567', name: 'Анатолий', id: '1' }];
    const demoUser = demoOwners.find((d) => d.phone === cleanPhone);

    if (demoUser) {
      foundUser = USERS_STORE.find((u) => u.id === demoUser.id) || null;
      if (!foundUser) {
        foundUser = {
          id: demoUser.id,
          name: demoUser.name,
          email: `${cleanPhone}@pvz.owner`,
          phone: cleanPhone,
          role: 'owner',
          status: 'active',
          createdAt: new Date().toISOString(),
          passwordHash: '',
        };
        USERS_STORE.push(foundUser);
        await saveUsersToStorage();
      }
    } else {
      setters.setIsLoading(false);
      throw new Error('Номера нет в базе. Обратитесь к владельцу ПВЗ');
    }
  }

  if (!foundUser) {
    setters.setIsLoading(false);
    throw new Error('Номера нет в базе. Обратитесь к владельцу ПВЗ');
  }

  let sessionUser =
    foundUser.role === 'employee'
      ? mergeUserPermissions(foundUser, foundUser.permissions)
      : foundUser;

  if (await hasSupabaseSession()) {
    try {
      const oldId = sessionUser.id;
      const supabaseUserId = await linkSupabaseProfile({
        name: sessionUser.name,
        phone: cleanPhone,
        role: sessionUser.role,
        pvzId: sessionUser.pvzId,
        pvzIds: sessionUser.pvzIds,
        permissionLevel: sessionUser.permissionLevel,
        permissions: sessionUser.permissions,
        status: sessionUser.status,
      });

      if (supabaseUserId && oldId !== supabaseUserId) {
        await migrateLocalUserId(oldId, supabaseUserId, sessionUser.role);
        const userIndex = USERS_STORE.findIndex((u) => u.id === oldId || u.phone === cleanPhone);
        if (userIndex !== -1) {
          USERS_STORE[userIndex].id = supabaseUserId;
          await saveUsersToStorage();
        }
        sessionUser = { ...sessionUser, id: supabaseUserId };
      }
    } catch (supabaseError) {
      if (isSupabaseProviderConfigError(supabaseError)) {
        console.warn('Supabase Auth: провайдер не настроен, вход только локально.', supabaseError);
      } else {
        console.error('Supabase Auth:', supabaseError);
        setters.setIsLoading(false);
        throw supabaseError instanceof Error
          ? supabaseError
          : new Error('Не удалось привязать профиль к Supabase');
      }
    }
  }

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

  setters.setIsLoading(false);
}
