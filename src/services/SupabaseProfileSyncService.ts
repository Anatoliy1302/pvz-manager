import * as SecureStore from 'expo-secure-store';
import { User, UserRole, EmployeePermissions, defaultPermissions } from '../types/user';
import { cleanPhone } from '../utils/phoneHelpers';
import { isUuid, resolvePvzId } from '../utils/supabaseHelpers';
import { getToken } from '../../lib/authSessionStore';
import { readSnapshotArray, writeSnapshotArray } from '../../lib/snapshotSync';
import DataService from './DataService';

const SNAPSHOT_KEY = 'profiles';

function mapProfileRow(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    email: (row.email as string) || '',
    role: row.role as UserRole,
    status: (row.status as User['status']) || 'active',
    pvzId: (row.pvzId as string) || (row.pvz_id as string) || undefined,
    pvzIds: (row.pvzIds as string[]) || (row.pvz_ids as string[]) || undefined,
    permissionLevel: (row.permissionLevel as User['permissionLevel']) || undefined,
    permissions: (row.permissions as EmployeePermissions) || { ...defaultPermissions },
    createdAt: (row.createdAt as string) || (row.created_at as string) || new Date().toISOString(),
  };
}

function mergeUsersByPhone(local: User[], remote: User[]): User[] {
  const byPhone = new Map<string, User>();
  for (const user of local) {
    byPhone.set(cleanPhone(user.phone), user);
  }
  for (const remoteUser of remote) {
    const key = cleanPhone(remoteUser.phone);
    const existing = byPhone.get(key);
    if (existing) {
      byPhone.set(key, {
        ...existing,
        ...remoteUser,
        id: isUuid(existing.id) ? existing.id : remoteUser.id,
        permissions: remoteUser.permissions || existing.permissions,
      });
    } else {
      byPhone.set(key, remoteUser);
    }
  }
  return Array.from(byPhone.values());
}

async function fetchProfilesForResolvedPvz(resolvedPvzId: string): Promise<User[] | null> {
  const all = await readSnapshotArray<Record<string, unknown>>(SNAPSHOT_KEY);
  const filtered = all.filter(
    (row) => row.pvzId === resolvedPvzId || row.pvz_id === resolvedPvzId
  );
  return filtered.map((row) => mapProfileRow(row));
}

/** Подтянуть profiles с API в локальный pvz_users. */
export async function mergeRemoteProfilesIntoLocal(pvzIds: string[]): Promise<string | null> {
  if (!(await getToken()) || pvzIds.length === 0) return null;

  try {
    const localUsers = await DataService.getUsers();
    const resolvedIds = (
      await Promise.all(pvzIds.map((pvzId) => resolvePvzId(pvzId)))
    ).filter(Boolean) as string[];

    const remoteBatches = await Promise.all(
      resolvedIds.map((resolvedPvzId) => fetchProfilesForResolvedPvz(resolvedPvzId))
    );

    let merged = [...localUsers];
    for (const remoteProfiles of remoteBatches) {
      if (!remoteProfiles?.length) continue;
      merged = mergeUsersByPhone(merged, remoteProfiles);
    }

    await SecureStore.setItemAsync('pvz_users', JSON.stringify(merged));
    DataService.emitChange('pvz_users');
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось синхронизировать сотрудников';
    console.warn('mergeRemoteProfilesIntoLocal:', message);
    return message;
  }
}

/** Запушить локальных пользователей в snapshot profiles. */
export async function pushLocalProfilesToSupabase(sessionUser: User): Promise<string | null> {
  if (!(await getToken())) return null;

  try {
    const users = await DataService.getUsers();
    const pvzIds =
      sessionUser.role === 'owner'
        ? (await DataService.getPvzsByOwner(sessionUser.id)).map((p) => p.id)
        : sessionUser.pvzIds?.length
          ? sessionUser.pvzIds
          : sessionUser.pvzId
            ? [sessionUser.pvzId]
            : [];

    const scopedUsers = users.filter(
      (u) =>
        u.role !== 'owner' &&
        u.pvzId &&
        pvzIds.some((id) => id === u.pvzId) &&
        isUuid(u.id)
    );

    const remote = await readSnapshotArray<Record<string, unknown>>(SNAPSHOT_KEY);
    const remoteIds = new Set(remote.map((row) => String(row.id)));
    const next = [...remote];

    for (const user of scopedUsers) {
      const resolvedPvzId = user.pvzId ? await resolvePvzId(user.pvzId) : null;
      const row = {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email || null,
        role: user.role,
        pvzId: resolvedPvzId,
        pvzIds: user.pvzIds || [],
        permissionLevel: user.permissionLevel || null,
        permissions: user.permissions || defaultPermissions,
        status: user.status,
        updatedAt: new Date().toISOString(),
      };
      const index = next.findIndex((entry) => String(entry.id) === user.id);
      if (index >= 0) {
        next[index] = row;
      } else {
        next.push(row);
      }
      remoteIds.add(user.id);
    }

    await writeSnapshotArray(SNAPSHOT_KEY, next);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось отправить профили';
    console.warn('pushLocalProfilesToSupabase:', message);
    return message;
  }
}
