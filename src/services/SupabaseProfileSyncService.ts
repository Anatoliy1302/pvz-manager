import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../lib/supabase';
import { fetchAllFromQuery } from '../../lib/supabasePagination';
import { User, UserRole, EmployeePermissions, defaultPermissions } from '../types/user';
import { cleanPhone } from '../utils/phoneHelpers';
import { isUuid, resolvePvzId } from '../utils/supabaseHelpers';
import { PROFILE_COLUMNS } from './supabase/selectColumns';
import { ensureSupabaseClientSession } from './SupabaseAuthService';
import DataService from './DataService';

function mapProfileRow(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    email: (row.email as string) || '',
    role: row.role as UserRole,
    status: (row.status as User['status']) || 'active',
    pvzId: (row.pvz_id as string) || undefined,
    pvzIds: (row.pvz_ids as string[]) || undefined,
    permissionLevel: (row.permission_level as User['permissionLevel']) || undefined,
    permissions: (row.permissions as EmployeePermissions) || { ...defaultPermissions },
    createdAt: (row.created_at as string) || new Date().toISOString(),
  };
}

async function fetchProfilesForResolvedPvz(resolvedPvzId: string): Promise<User[] | null> {
  const data = await fetchAllFromQuery<Record<string, unknown>>(() =>
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('pvz_id', resolvedPvzId)
  );

  if (!data) {
    console.warn('fetchProfilesForResolvedPvz: paginated fetch failed');
    return null;
  }

  return data.map((row) => mapProfileRow(row));
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

/** Подтянуть profiles из Supabase в локальный pvz_users для доступных ПВЗ. */
export async function mergeRemoteProfilesIntoLocal(pvzIds: string[]): Promise<string | null> {
  if (!(await ensureSupabaseClientSession()) || pvzIds.length === 0) return null;

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

/** Запушить локальных пользователей с UUID в profiles (только известные auth id). */
export async function pushLocalProfilesToSupabase(sessionUser: User): Promise<string | null> {
  if (!(await ensureSupabaseClientSession())) return null;

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

    const results = await Promise.all(
      scopedUsers.map(async (user) => {
        const resolvedPvzId = user.pvzId ? await resolvePvzId(user.pvzId) : null;
        const { error } = await supabase.from('profiles').upsert(
          {
            id: user.id,
            name: user.name,
            phone: user.phone,
            email: null,
            role: user.role,
            pvz_id: resolvedPvzId,
            pvz_ids: user.pvzIds || [],
            permission_level: user.permissionLevel || null,
            permissions: user.permissions || defaultPermissions,
            status: user.status,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
        return error?.message ?? null;
      })
    );

    const firstError = results.find((message) => message);
    if (firstError) {
      console.warn('pushLocalProfilesToSupabase:', firstError);
      return firstError;
    }

    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось отправить профили';
    console.warn('pushLocalProfilesToSupabase:', message);
    return message;
  }
}
