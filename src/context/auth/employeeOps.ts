import * as SecureStore from 'expo-secure-store';
import { User, UserRole, Pvz, EmployeePermissions, defaultPermissions } from '../../types/user';
import DataService from '../../services/DataService';
import { ensurePvzSynced, loadOwnerPvzsWithRemoteFallback } from '../../services/SupabasePvzService';
import { hasStoredAuthTokens } from '../../services/SupabaseAuthService';
import {
  upsertInvitationToSupabase,
  updateInvitationStatusInSupabase,
  type SyncInvitation,
} from '../../services/SupabaseInvitationService';
import { withTimeoutReject } from '../../utils/withTimeout';
import { normalizePermissions } from '../../utils/permissionHelpers';
import { userWorksAtPvz } from '../../utils/pvzUserHelpers';
import { checkHasPermission } from './authPermissions';
import { isUuid } from '../../utils/supabaseHelpers';
import {
  userMemory,
  MAX_EMPLOYEES_PER_PVZ,
  loadUsersFromStorage,
  refreshPendingEmployees,
} from './userMemoryStore';
import { cleanPhone } from '../../utils/phoneHelpers';
import { safeParseJson } from '../../utils/safeJson';
import { generateSecureId } from '../../utils/generateSecureId';

type StoredInvitation = {
  id: string;
  phone: string;
  status: string;
  pvzId?: string;
  [key: string]: unknown;
};

const INVITATION_CLOUD_SYNC_TIMEOUT_MS = 15_000;

async function applySyncedInvitationIds(
  ownerId: string,
  localInvitation: StoredInvitation,
  synced: SyncInvitation
): Promise<void> {
  if (synced.id === localInvitation.id && synced.pvzId === localInvitation.pvzId) return;

  const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
  const allInvitations = safeParseJson<StoredInvitation[]>(allInvitationsRaw ?? '[]', []);
  const invIndex = allInvitations.findIndex((inv) => inv.id === localInvitation.id);
  if (invIndex !== -1) {
    allInvitations[invIndex] = {
      ...allInvitations[invIndex],
      id: synced.id,
      pvzId: synced.pvzId,
    };
    await SecureStore.setItemAsync('all_invitations', JSON.stringify(allInvitations));
  }

  const invitations = await DataService.getInvitations(ownerId);
  const ownerIndex = invitations.findIndex((inv) => inv.id === localInvitation.id);
  if (ownerIndex !== -1) {
    invitations[ownerIndex] = {
      ...invitations[ownerIndex],
      id: synced.id,
      pvzId: synced.pvzId,
    };
    await SecureStore.setItemAsync(`invitations_${ownerId}`, JSON.stringify(invitations));
  }
}

async function resolveInvitationPvzId(ownerId: string, localPvzId: string): Promise<string | null> {
  const ownerPvzs = await DataService.getPvzsByOwner(ownerId);
  for (const pvz of ownerPvzs) {
    if (!isUuid(pvz.id)) {
      try {
        const syncedId = await ensurePvzSynced(pvz);
        if (isUuid(syncedId) && syncedId !== pvz.id) {
          await DataService.savePvz({ ...pvz, id: syncedId, ownerId });
        }
      } catch {
        // continue — попробуем целевой ПВЗ ниже
      }
    }
  }

  const pvzForSync =
    (await DataService.getPvzById(localPvzId)) ??
    ownerPvzs.find((pvz) => pvz.id === localPvzId);
  if (!pvzForSync) {
    const remoteList = await loadOwnerPvzsWithRemoteFallback(ownerId);
    const matched = remoteList.find((pvz) => pvz.id === localPvzId);
    return matched && isUuid(matched.id) ? matched.id : remoteList[0]?.id ?? null;
  }

  let pvzId = await ensurePvzSynced(pvzForSync);
  if (!isUuid(pvzId)) {
    const remoteList = await loadOwnerPvzsWithRemoteFallback(ownerId);
    const matched =
      remoteList.find((pvz) => pvz.id === localPvzId || pvz.id === pvzId) ??
      remoteList.find((pvz) => pvz.name === pvzForSync.name);
    pvzId = matched?.id ?? remoteList[0]?.id ?? pvzId;
  }

  if (isUuid(pvzId) && pvzId !== localPvzId) {
    await DataService.savePvz({ ...pvzForSync, id: pvzId, ownerId });
  }

  return isUuid(pvzId) ? pvzId : null;
}

async function syncInvitationToCloud(
  invitation: SyncInvitation & { pvzName?: string; invitedByName?: string },
  ownerId: string,
  localPvzId: string
): Promise<SyncInvitation | null> {
  if (!(await hasStoredAuthTokens())) return null;

  const pvzId = await resolveInvitationPvzId(ownerId, localPvzId);
  if (!pvzId) return null;

  return upsertInvitationToSupabase({ ...invitation, pvzId });
}

/** Синхронизация приглашения в Supabase — в фоне, не блокирует UI. */
function scheduleInvitationCloudSync(
  invitation: SyncInvitation & { pvzName?: string; invitedByName?: string },
  ownerId: string,
  localPvzId: string
): void {
  void (async () => {
    try {
      const synced = await withTimeoutReject(
        syncInvitationToCloud(invitation, ownerId, localPvzId),
        INVITATION_CLOUD_SYNC_TIMEOUT_MS,
        'invitation_sync_timeout'
      );
      if (synced) {
        await applySyncedInvitationIds(ownerId, invitation, synced);
        DataService.emitChange(`invitations_${ownerId}`);
      } else if (__DEV__) {
        console.warn('[Invite] cloud sync returned null — check pvz UUID mapping and owner session');
      }
    } catch (error) {
      if (__DEV__) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[Invite] cloud sync failed, will retry:', message);
      }
      setTimeout(() => {
        void syncInvitationToCloud(invitation, ownerId, localPvzId)
          .then(async (synced) => {
            if (!synced) return;
            await applySyncedInvitationIds(ownerId, invitation, synced);
            DataService.emitChange(`invitations_${ownerId}`);
          })
          .catch(() => undefined);
      }, 5_000);
    }
  })();
}

/** Отправить все pending-приглашения владельца на VPS (сотрудник входит с другого устройства). */
export async function pushPendingInvitationsToApi(ownerId: string): Promise<number> {
  if (!ownerId || !(await hasStoredAuthTokens())) return 0;

  const invitations = await DataService.getInvitations(ownerId);
  const pending = invitations.filter((inv) => inv.status === 'pending');
  let syncedCount = 0;

  for (const inv of pending) {
    if (!inv.pvzId) continue;
    try {
      const synced = await withTimeoutReject(
        syncInvitationToCloud(
          {
            id: inv.id,
            phone: inv.phone,
            name: inv.name,
            role: inv.role,
            pvzId: inv.pvzId,
            pvzName: inv.pvzName,
            status: 'pending',
            createdAt: inv.createdAt,
            invitedBy: inv.invitedBy || ownerId,
            invitedByName: inv.invitedByName,
          },
          ownerId,
          inv.pvzId
        ),
        INVITATION_CLOUD_SYNC_TIMEOUT_MS,
        'invitation_sync_timeout'
      );
      if (synced) {
        await applySyncedInvitationIds(ownerId, inv, synced);
        syncedCount += 1;
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[Invitation] pushPendingInvitationsToApi:', inv.phone, error);
      }
    }
  }

  if (syncedCount > 0) {
    DataService.emitChange(`invitations_${ownerId}`);
    DataService.emitChange('all_invitations');
  }

  return syncedCount;
}

/** Восстановить pending_employees из приглашений (локально + API) после входа владельца. */
export async function rebuildPendingEmployeesFromInvitations(ownerId: string): Promise<void> {
  if (!ownerId) return;

  await pushPendingInvitationsToApi(ownerId);

  await loadUsersFromStorage();
  await refreshPendingEmployees();

  const invitations = await DataService.getInvitations(ownerId);
  const pendingInvites = invitations.filter((inv) => inv.status === 'pending');
  if (pendingInvites.length === 0) return;

  const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
  const allInvitations = safeParseJson<StoredInvitation[]>(allInvitationsRaw ?? '[]', []);
  let allChanged = false;

  for (const inv of pendingInvites) {
    const normalizedPhone = cleanPhone(inv.phone);
    if (normalizedPhone.length !== 11) continue;

    const existsInAll = allInvitations.some(
      (item) => cleanPhone(String(item.phone)) === normalizedPhone && item.status === 'pending'
    );
    if (!existsInAll) {
      allInvitations.push({
        id: inv.id,
        phone: normalizedPhone,
        name: inv.name,
        role: inv.role,
        pvzId: inv.pvzId,
        pvzName: inv.pvzName,
        status: 'pending',
        createdAt: inv.createdAt,
        invitedBy: inv.invitedBy,
      });
      allChanged = true;
    }

    if (userMemory.getUsers().some((u) => u.phone === normalizedPhone && u.status === 'active')) {
      continue;
    }

    const existingPending = userMemory.getPendingEmployees().find((u) => u.phone === normalizedPhone);
    if (existingPending) {
      if (existingPending.pvzId !== inv.pvzId || existingPending.role !== inv.role) {
        await userMemory.updatePending(existingPending.id, {
          pvzId: inv.pvzId,
          role: inv.role,
          name: inv.name,
        });
      }
      continue;
    }

    const inviteRole: UserRole = inv.role === 'admin' ? 'admin' : 'employee';
    await userMemory.addPending({
      id: generateSecureId('pending'),
      name: inv.name,
      email: `${normalizedPhone}@users.pvzpersonal.ru`,
      phone: normalizedPhone,
      role: inviteRole,
      status: 'pending',
      pvzId: inv.pvzId,
      createdAt: inv.createdAt || new Date().toISOString(),
      invitedBy: inv.invitedBy || ownerId,
      permissions: inviteRole === 'employee' ? { ...defaultPermissions } : undefined,
      permissionLevel: inviteRole === 'admin' ? 'full' : undefined,
      pvzIds: inviteRole === 'admin' ? [inv.pvzId] : undefined,
      passwordHash: '',
    });
  }

  if (allChanged) {
    await SecureStore.setItemAsync('all_invitations', JSON.stringify(allInvitations));
    DataService.emitChange('all_invitations');
  }
}

export async function addEmployeeInvitation(
  phone: string,
  name: string,
  role: UserRole,
  currentUser: User | null,
  currentPvz: Pvz | null,
  pvzId?: string
) {
  const normalizedPhone = cleanPhone(phone);
  if (normalizedPhone.length !== 11) {
    throw new Error('Некорректный номер телефона');
  }

  await loadUsersFromStorage();
  await refreshPendingEmployees();

  const users = userMemory.getUsers();
  const pending = userMemory.getPendingEmployees();

  if (users.find((u) => u.phone === normalizedPhone && u.status === 'blocked')) {
    throw new Error('Этот пользователь был заблокирован. Нельзя отправить приглашение.');
  }

  if (users.some((u) => u.phone === normalizedPhone && u.status === 'active')) {
    throw new Error('Пользователь с таким номером уже зарегистрирован');
  }

  if (pending.some((u) => u.phone === normalizedPhone)) {
    throw new Error('Приглашение уже отправлено на этот номер');
  }

  if (currentUser?.id) {
    const ownerInvitations = await DataService.getInvitations(currentUser.id);
    if (
      ownerInvitations.some(
        (inv) => cleanPhone(String(inv.phone)) === normalizedPhone && inv.status === 'pending'
      )
    ) {
      throw new Error('Приглашение уже отправлено на этот номер');
    }
  }

  if (currentUser?.role !== 'owner' && currentUser?.role !== 'admin') {
    throw new Error('Только владелец или администратор ПВЗ может добавлять сотрудников');
  }

  const targetPvzId = pvzId || currentPvz?.id;
  if (!targetPvzId) {
    throw new Error('Не выбран ПВЗ для назначения сотрудника');
  }

  const currentEmployeesCount = users.filter(
    (u) =>
      u.role !== 'owner' && u.status === 'active' && userWorksAtPvz(u, targetPvzId)
  ).length;
  const pendingCount = pending.filter((u) => u.pvzId === targetPvzId).length;

  if (currentEmployeesCount + pendingCount >= MAX_EMPLOYEES_PER_PVZ) {
    throw new Error(`Достигнут лимит сотрудников для этого ПВЗ (максимум ${MAX_EMPLOYEES_PER_PVZ})`);
  }

  const pvzItem = await DataService.getPvzById(targetPvzId);
  const inviteRole = role === 'owner' ? 'employee' : role;

  const newPendingUser: User = {
    id: generateSecureId('pending'),
    name: name.trim(),
    email: `${normalizedPhone}@users.pvzpersonal.ru`,
    phone: normalizedPhone,
    role: inviteRole as UserRole,
    status: 'pending',
    pvzId: targetPvzId,
    createdAt: new Date().toISOString(),
    invitedBy: currentUser?.id,
    permissions: inviteRole === 'employee' ? { ...defaultPermissions } : undefined,
    permissionLevel: inviteRole === 'admin' ? 'full' : undefined,
    pvzIds: inviteRole === 'admin' ? [targetPvzId] : undefined,
    passwordHash: '',
  };

  await userMemory.addPending(newPendingUser);

  const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
  const allInvitations = safeParseJson<StoredInvitation[]>(allInvitationsRaw ?? '[]', []);

  const newInvitation = {
    id: generateSecureId('inv'),
    phone: normalizedPhone,
    name: name.trim(),
    role: inviteRole as 'employee' | 'admin',
    pvzId: targetPvzId,
    pvzName: pvzItem?.name || 'ПВЗ',
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
    invitedBy: currentUser?.id || '',
    invitedByName: currentUser?.name,
  };

  allInvitations.push(newInvitation);
  await SecureStore.setItemAsync('all_invitations', JSON.stringify(allInvitations));

  const invitations = await DataService.getInvitations(currentUser?.id || '');
  invitations.push(newInvitation);
  await SecureStore.setItemAsync(`invitations_${currentUser?.id}`, JSON.stringify(invitations));

  DataService.emitChange(`invitations_${currentUser?.id}`);

  if (currentUser?.id) {
    if (await hasStoredAuthTokens()) {
      const synced = await withTimeoutReject(
        syncInvitationToCloud(newInvitation, currentUser.id, targetPvzId),
        INVITATION_CLOUD_SYNC_TIMEOUT_MS,
        'invitation_sync_timeout'
      ).catch(() => null);
      if (synced) {
        await applySyncedInvitationIds(currentUser.id, newInvitation, synced);
        DataService.emitChange(`invitations_${currentUser.id}`);
      } else {
        scheduleInvitationCloudSync(newInvitation, currentUser.id, targetPvzId);
        throw new Error(
          'Приглашение создано локально, но не сохранено на сервере. Сотрудник не сможет войти по SMS — проверьте интернет и что ПВЗ синхронизирован с сервером.'
        );
      }
    } else {
      throw new Error(
        'Для приглашения сотрудника нужен вход в аккаунт с интернетом. Выйдите и войдите по email и PIN, затем добавьте сотрудника снова.'
      );
    }
  }
}

export async function revokeEmployeeInvitation(invitationId: string, ownerId: string) {
  await refreshPendingEmployees();

  const ownerInvitationsRaw = await SecureStore.getItemAsync(`invitations_${ownerId}`);
  const ownerInvitations = safeParseJson<StoredInvitation[]>(ownerInvitationsRaw ?? '[]', []);
  const invitation = ownerInvitations.find((inv: { id: string }) => inv.id === invitationId);

  if (!invitation) {
    throw new Error('Приглашение не найдено');
  }

  const cleanPhone = String(invitation.phone).replace(/[^0-9]/g, '');
  const pendingIndex = userMemory.getPendingEmployees().findIndex((u) => u.phone === cleanPhone);
  if (pendingIndex !== -1) {
    await userMemory.removePendingByIndex(pendingIndex);
  }

  const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
  const allInvitations = safeParseJson<Array<{ id: string; phone: string; status: string }>>(
    allInvitationsRaw ?? '[]',
    []
  );
  const updatedAll = allInvitations.map((inv: { id: string; phone: string; status: string }) => {
    const invPhone = String(inv.phone).replace(/[^0-9]/g, '');
    if (inv.id === invitationId || invPhone === cleanPhone) {
      return { ...inv, status: 'expired' };
    }
    return inv;
  });
  await SecureStore.setItemAsync('all_invitations', JSON.stringify(updatedAll));

  const expiredInvitation = updatedAll.find(
    (inv: { id: string; phone: string }) =>
      inv.id === invitationId || String(inv.phone).replace(/[^0-9]/g, '') === cleanPhone
  );
  if (expiredInvitation) {
    await upsertInvitationToSupabase({ ...(invitation as unknown as SyncInvitation), status: 'expired' });
  } else {
    await updateInvitationStatusInSupabase(invitationId, 'expired');
  }

  const updatedOwner = ownerInvitations.filter((inv: { id: string }) => inv.id !== invitationId);
  await SecureStore.setItemAsync(`invitations_${ownerId}`, JSON.stringify(updatedOwner));
  DataService.emitChange(`invitations_${ownerId}`);
}

export async function confirmPendingEmployeeAccount(
  pendingUserId: string,
  currentUser: User,
  currentPvz: Pvz | null
) {
  if (currentUser.role !== 'owner' && currentUser.role !== 'admin') {
    throw new Error('Недостаточно прав для подтверждения сотрудника');
  }

  if (currentUser.role === 'admin' && !checkHasPermission(currentUser, 'canManageEmployees')) {
    throw new Error('Нет прав на управление сотрудниками');
  }

  await loadUsersFromStorage();
  await refreshPendingEmployees();

  const pendingList = userMemory.getPendingEmployees();
  const pendingIndex = pendingList.findIndex((u) => u.id === pendingUserId);
  if (pendingIndex === -1) {
    throw new Error('Ожидающий сотрудник не найден');
  }

  const pendingUser = pendingList[pendingIndex];
  const targetPvzId = pendingUser.pvzId;

  if (!targetPvzId) {
    throw new Error('ПВЗ не указан для сотрудника');
  }

  if (
    currentUser.role === 'admin' &&
    targetPvzId !== currentPvz?.id &&
    !currentUser.pvzIds?.includes(targetPvzId)
  ) {
    throw new Error('Нельзя подтвердить сотрудника другого ПВЗ');
  }

  if (userMemory.getUsers().some((u) => u.phone === pendingUser.phone && u.status === 'active')) {
    await userMemory.removePendingByIndex(pendingIndex);
    DataService.emitChange('pending_employees');
    throw new Error('Пользователь уже активирован');
  }

  const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
  const allInvitations = safeParseJson<
    Array<{ phone: string; status: string; pvzId?: string; role?: string; name?: string; invitedBy?: string }>
  >(allInvitationsRaw ?? '[]', []);
  const invitation = allInvitations.find(
    (inv: { phone: string; status: string; pvzId?: string; role?: string; name?: string; invitedBy?: string }) =>
      inv.phone.replace(/[^0-9]/g, '') === pendingUser.phone &&
      inv.status === 'pending' &&
      (!inv.pvzId || inv.pvzId === targetPvzId)
  );

  const inviteRole: UserRole = invitation?.role === 'admin' ? 'admin' : 'employee';
  const activeUser: User = {
    ...pendingUser,
    status: 'active',
    name: invitation?.name || pendingUser.name,
    role: inviteRole,
    pvzId: targetPvzId,
    pvzIds: inviteRole === 'admin' ? pendingUser.pvzIds || [targetPvzId] : undefined,
    permissionLevel: inviteRole === 'admin' ? pendingUser.permissionLevel || 'full' : undefined,
    permissions: inviteRole === 'employee' ? normalizePermissions(pendingUser.permissions) : undefined,
  };

  await userMemory.activatePendingAt(pendingIndex, activeUser);

  // Приглашение в облаке остаётся pending — сотрудник входит по SMS и принимает его при регистрации.

  DataService.emitChange('pvz_users');
  DataService.emitChange('pending_employees');
}

export async function updateEmployeePvzAssignment(employeeId: string, newPvzId: string) {
  const users = userMemory.getUsers();
  if (users.some((u) => u.id === employeeId)) {
    await userMemory.updateUser(employeeId, { pvzId: newPvzId });
    return;
  }

  if (userMemory.getPendingEmployees().some((u) => u.id === employeeId)) {
    await userMemory.updatePending(employeeId, { pvzId: newPvzId });
  }
}

export function getActiveEmployees(currentUser: User | null, currentPvz: Pvz | null) {
  const users = userMemory.getUsers();
  if (currentUser?.role === 'owner') {
    return users.filter((u) => u.role !== 'owner' && u.status === 'active');
  }
  if (currentUser?.role === 'admin') {
    return users.filter(
      (u) => u.role === 'employee' && u.status === 'active' && u.pvzId === currentPvz?.id
    );
  }
  return [];
}

export function getActiveEmployeesByPvz(pvzId: string) {
  return userMemory
    .getUsers()
    .filter(
      (u) => u.role !== 'owner' && u.status === 'active' && userWorksAtPvz(u, pvzId)
    );
}

/** Активные + ожидающие сотрудники/админы на конкретном ПВЗ (для лимита free). */
export function countStaffForPvz(pvzId: string): number {
  const active = getActiveEmployeesByPvz(pvzId).length;
  const pending = userMemory.getPendingEmployees().filter((u) => u.pvzId === pvzId).length;
  return active + pending;
}

export function getPendingEmployeeList() {
  return userMemory.getPendingEmployees();
}

export function getPendingEmployeesCountForUser(userId?: string) {
  return userMemory.getPendingEmployees().filter((emp) => emp.invitedBy === userId).length;
}
