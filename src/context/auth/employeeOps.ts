import * as SecureStore from 'expo-secure-store';
import { User, UserRole, Pvz, EmployeePermissions, defaultPermissions } from '../../types/user';
import DataService from '../../services/DataService';
import {
  upsertInvitationToSupabase,
  updateInvitationStatusInSupabase,
} from '../../services/SupabaseInvitationService';
import { normalizePermissions } from '../../utils/permissionHelpers';
import { checkHasPermission } from './authPermissions';
import {
  USERS_STORE,
  PENDING_EMPLOYEES,
  MAX_EMPLOYEES_PER_PVZ,
  loadUsersFromStorage,
  saveUsersToStorage,
  savePendingEmployeesToStorage,
  refreshPendingEmployees,
} from './userMemoryStore';

export async function addEmployeeInvitation(
  phone: string,
  name: string,
  role: UserRole,
  currentUser: User | null,
  currentPvz: Pvz | null,
  pvzId?: string
) {
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  await loadUsersFromStorage();
  await refreshPendingEmployees();

  if (USERS_STORE.find((u) => u.phone === cleanPhone && u.status === 'blocked')) {
    throw new Error('Этот пользователь был заблокирован. Нельзя отправить приглашение.');
  }

  if (USERS_STORE.some((u) => u.phone === cleanPhone && u.status === 'active')) {
    throw new Error('Пользователь с таким номером уже зарегистрирован');
  }

  if (PENDING_EMPLOYEES.some((u) => u.phone === cleanPhone)) {
    throw new Error('Приглашение уже отправлено на этот номер');
  }

  if (currentUser?.id) {
    const ownerInvitations = await DataService.getInvitations(currentUser.id);
    if (
      ownerInvitations.some(
        (inv) => String(inv.phone).replace(/[^0-9]/g, '') === cleanPhone && inv.status === 'pending'
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

  const currentEmployeesCount = USERS_STORE.filter(
    (u) => u.pvzId === targetPvzId && u.status === 'active'
  ).length;
  const pendingCount = PENDING_EMPLOYEES.filter((u) => u.pvzId === targetPvzId).length;

  if (currentEmployeesCount + pendingCount >= MAX_EMPLOYEES_PER_PVZ) {
    throw new Error(`Достигнут лимит сотрудников для этого ПВЗ (максимум ${MAX_EMPLOYEES_PER_PVZ})`);
  }

  const pvzItem = await DataService.getPvzById(targetPvzId);
  const inviteRole = role === 'owner' ? 'employee' : role;

  const newPendingUser: User = {
    id: Date.now().toString(),
    name: name.trim(),
    email: `${cleanPhone}@temp.pvz`,
    phone: cleanPhone,
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

  PENDING_EMPLOYEES.push(newPendingUser);
  await savePendingEmployeesToStorage();

  const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
  const allInvitations = allInvitationsRaw ? JSON.parse(allInvitationsRaw) : [];

  const newInvitation = {
    id: Date.now().toString(),
    phone: cleanPhone,
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

  const syncedInvitation = await upsertInvitationToSupabase(newInvitation);
  if (syncedInvitation && syncedInvitation.id !== newInvitation.id) {
    const invIndex = allInvitations.findIndex((inv: { id: string }) => inv.id === newInvitation.id);
    if (invIndex !== -1) {
      allInvitations[invIndex] = {
        ...allInvitations[invIndex],
        id: syncedInvitation.id,
        pvzId: syncedInvitation.pvzId,
      };
      await SecureStore.setItemAsync('all_invitations', JSON.stringify(allInvitations));
    }
    const ownerIndex = invitations.findIndex((inv) => inv.id === newInvitation.id);
    if (ownerIndex !== -1) {
      invitations[ownerIndex] = {
        ...invitations[ownerIndex],
        id: syncedInvitation.id,
        pvzId: syncedInvitation.pvzId,
      };
      await SecureStore.setItemAsync(`invitations_${currentUser?.id}`, JSON.stringify(invitations));
    }
  }

  DataService.emitChange(`invitations_${currentUser?.id}`);
  console.log(`✅ Приглашение создано для ${cleanPhone}`);
}

export async function revokeEmployeeInvitation(invitationId: string, ownerId: string) {
  await refreshPendingEmployees();

  const ownerInvitationsRaw = await SecureStore.getItemAsync(`invitations_${ownerId}`);
  const ownerInvitations = ownerInvitationsRaw ? JSON.parse(ownerInvitationsRaw) : [];
  const invitation = ownerInvitations.find((inv: { id: string }) => inv.id === invitationId);

  if (!invitation) {
    throw new Error('Приглашение не найдено');
  }

  const cleanPhone = String(invitation.phone).replace(/[^0-9]/g, '');
  const pendingIndex = PENDING_EMPLOYEES.findIndex((u) => u.phone === cleanPhone);
  if (pendingIndex !== -1) {
    PENDING_EMPLOYEES.splice(pendingIndex, 1);
    await savePendingEmployeesToStorage();
  }

  const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
  const allInvitations = allInvitationsRaw ? JSON.parse(allInvitationsRaw) : [];
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
    await upsertInvitationToSupabase({ ...invitation, ...expiredInvitation, status: 'expired' });
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

  const pendingIndex = PENDING_EMPLOYEES.findIndex((u) => u.id === pendingUserId);
  if (pendingIndex === -1) {
    throw new Error('Ожидающий сотрудник не найден');
  }

  const pendingUser = PENDING_EMPLOYEES[pendingIndex];
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

  if (USERS_STORE.some((u) => u.phone === pendingUser.phone && u.status === 'active')) {
    PENDING_EMPLOYEES.splice(pendingIndex, 1);
    await savePendingEmployeesToStorage();
    DataService.emitChange('pending_employees');
    throw new Error('Пользователь уже активирован');
  }

  const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
  const allInvitations = allInvitationsRaw ? JSON.parse(allInvitationsRaw) : [];
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

  USERS_STORE.push(activeUser);
  await saveUsersToStorage();

  PENDING_EMPLOYEES.splice(pendingIndex, 1);
  await savePendingEmployeesToStorage();

  const markAccepted = (inv: { phone: string; status: string; pvzId?: string }) => {
    const invPhone = inv.phone.replace(/[^0-9]/g, '');
    if (
      invPhone === pendingUser.phone &&
      inv.status === 'pending' &&
      (!inv.pvzId || inv.pvzId === targetPvzId)
    ) {
      return { ...inv, status: 'accepted' };
    }
    return inv;
  };

  await SecureStore.setItemAsync(
    'all_invitations',
    JSON.stringify(allInvitations.map(markAccepted))
  );

  const inviterId = invitation?.invitedBy || pendingUser.invitedBy;
  if (inviterId) {
    const ownerInvitationsRaw = await SecureStore.getItemAsync(`invitations_${inviterId}`);
    if (ownerInvitationsRaw) {
      const ownerInvitations = JSON.parse(ownerInvitationsRaw).map(markAccepted);
      await SecureStore.setItemAsync(`invitations_${inviterId}`, JSON.stringify(ownerInvitations));
      DataService.emitChange(`invitations_${inviterId}`);
    }
  }

  DataService.emitChange('pvz_users');
  DataService.emitChange('pending_employees');
  console.log(`✅ Сотрудник ${activeUser.name} подтверждён`);
}

export async function updateEmployeePvzAssignment(employeeId: string, newPvzId: string) {
  const userIndex = USERS_STORE.findIndex((u) => u.id === employeeId);
  if (userIndex !== -1) {
    USERS_STORE[userIndex].pvzId = newPvzId;
    await saveUsersToStorage();
    return;
  }

  const pendingIndex = PENDING_EMPLOYEES.findIndex((u) => u.id === employeeId);
  if (pendingIndex !== -1) {
    PENDING_EMPLOYEES[pendingIndex].pvzId = newPvzId;
    await savePendingEmployeesToStorage();
  }
}

export function getActiveEmployees(currentUser: User | null, currentPvz: Pvz | null) {
  if (currentUser?.role === 'owner') {
    return USERS_STORE.filter((u) => u.role !== 'owner' && u.status === 'active');
  }
  if (currentUser?.role === 'admin') {
    return USERS_STORE.filter(
      (u) => u.role === 'employee' && u.status === 'active' && u.pvzId === currentPvz?.id
    );
  }
  return [];
}

export function getActiveEmployeesByPvz(pvzId: string) {
  return USERS_STORE.filter((u) => u.pvzId === pvzId && u.status === 'active');
}

export function getPendingEmployeeList() {
  return PENDING_EMPLOYEES;
}

export function getPendingEmployeesCountForUser(userId?: string) {
  return PENDING_EMPLOYEES.filter((emp) => emp.invitedBy === userId).length;
}
