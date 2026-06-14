import * as SecureStore from 'expo-secure-store';
import { User, Pvz, EmployeePermissions, defaultPermissions } from '../../types/user';
import { readLocalUsers, writeLocalUsers } from '../local/localUserStore';
import { dataEventBus } from './dataEventBus';
import { getPvzById, getPvzs } from './pvzDataService';
import { safeParseJson } from '../../utils/safeJson';

export async function getUsers(): Promise<User[]> {
  return readLocalUsers();
}

export async function getUserById(id: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.id === id) || null;
}

export async function getEmployees(pvzId?: string): Promise<User[]> {
  const users = await getUsers();
  let employees = users.filter((u) => u.role !== 'owner' && u.status === 'active');

  if (pvzId) {
    employees = employees.filter((e) => e.pvzId === pvzId);
  }

  return employees;
}

export async function saveUser(user: User): Promise<void> {
  const users = await getUsers();
  const index = users.findIndex((u) => u.id === user.id);

  if (index !== -1) {
    users[index] = user;
  } else {
    users.push(user);
  }

  await writeLocalUsers(users);
  dataEventBus.notify('pvz_users');
}

export async function deleteUser(id: string): Promise<void> {
  const users = await getUsers();
  const filtered = users.filter((u) => u.id !== id);
  await writeLocalUsers(filtered);
  dataEventBus.notify('pvz_users');
}

export async function permanentlyDeleteUser(userId: string): Promise<void> {
  const users = await getUsers();
  const filtered = users.filter((u) => u.id !== userId);
  await writeLocalUsers(filtered);

  await SecureStore.deleteItemAsync(`penalties_${userId}`);
  await SecureStore.deleteItemAsync(`balance_${userId}`);
  await SecureStore.deleteItemAsync(`payments_employee_${userId}`);

  dataEventBus.notify('pvz_users');
}

export async function updateUsers(users: User[]): Promise<void> {
  await writeLocalUsers(users);
  dataEventBus.notify('pvz_users');
}

export async function updateAdminPermissions(
  adminId: string,
  updates: { permissionLevel?: 'full' | 'restricted'; pvzIds?: string[] }
): Promise<void> {
  const users = await getUsers();
  const index = users.findIndex((u) => u.id === adminId);

  if (index !== -1 && users[index].role === 'admin') {
    if (updates.permissionLevel !== undefined) {
      users[index].permissionLevel = updates.permissionLevel;
    }
    if (updates.pvzIds !== undefined) {
      users[index].pvzIds = updates.pvzIds;
      users[index].pvzId = updates.pvzIds[0] || '';
    }

    await writeLocalUsers(users);
    dataEventBus.notify('pvz_users');
  }
}

export async function updateEmployeePermissions(
  employeeId: string,
  permissions: Partial<EmployeePermissions>
): Promise<void> {
  const users = await getUsers();
  const index = users.findIndex((u) => u.id === employeeId);

  if (index !== -1 && users[index].role === 'employee') {
    users[index].permissions = {
      ...defaultPermissions,
      ...users[index].permissions,
      ...permissions,
    };
    await writeLocalUsers(users);

    const sessionRaw = await SecureStore.getItemAsync('user');
    if (sessionRaw) {
      const sessionUser = safeParseJson<User | null>(sessionRaw, null);
      if (sessionUser?.id === employeeId) {
        sessionUser.permissions = users[index].permissions;
        await SecureStore.setItemAsync('user', JSON.stringify(sessionUser));
      }
    }

    dataEventBus.notify(`user_permissions_${employeeId}`);
    dataEventBus.notify('pvz_users');
  }
}

export async function updateEmployeePermissionsWithNotify(
  employeeId: string,
  permissions: Partial<EmployeePermissions>
): Promise<void> {
  const users = await getUsers();
  const index = users.findIndex((u) => u.id === employeeId);

  if (index !== -1 && users[index].role === 'employee') {
    users[index].permissions = {
      ...defaultPermissions,
      ...users[index].permissions,
      ...permissions,
    };
    await writeLocalUsers(users);
    dataEventBus.notify(`user_permissions_${employeeId}`);
    dataEventBus.notify('pvz_users');
  }
}

export async function getEmployeesWithPermissions(pvzId?: string): Promise<User[]> {
  const users = await getUsers();
  let employees = users.filter((u) => u.role === 'employee' && u.status === 'active');

  if (pvzId) {
    employees = employees.filter((e) => e.pvzId === pvzId);
  }

  return employees;
}

export async function hasPermission(
  employeeId: string,
  permission: keyof EmployeePermissions
): Promise<boolean> {
  const user = await getUserById(employeeId);
  if (!user || user.role !== 'employee') return false;

  if (user.permissions?.isFullAdmin) return true;

  return user.permissions?.[permission] || false;
}

export async function getEmployeePvzs(employeeId: string): Promise<Pvz[]> {
  const user = await getUserById(employeeId);
  if (!user || user.role !== 'employee') return [];

  if (user.pvzIds && user.pvzIds.length > 0) {
    const allPvzs = await getPvzs();
    return allPvzs.filter((p) => user.pvzIds?.includes(p.id));
  }

  if (user.pvzId) {
    const pvz = await getPvzById(user.pvzId);
    return pvz ? [pvz] : [];
  }

  return [];
}
