import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../lib/supabase';
import { User, UserRole, EmployeePermissions, defaultPermissions } from '../types/user';
import { cleanPhone } from '../utils/phoneHelpers';
import { isUuid, resolvePvzId } from '../utils/supabaseHelpers';
import { hasSupabaseSession } from './SupabaseAuthService';
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
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('pvz_id', resolvedPvzId);

  if (error) {
    console.warn('fetchProfilesForResolvedPvz:', error.message);
    return null;
  }

  return (data || []).map((row) => mapProfileRow(row as Record<string, unknown>));
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
  if (!(await hasSupabaseSession()) || pvzIds.length === 0) return null;

  try {
    const localUsers = await DataService.getUsers();
    let merged = [...localUsers];

    for (const pvzId of pvzIds) {
      const resolvedPvzId = await resolvePvzId(pvzId);
      if (!resolvedPvzId) continue;

      const remoteProfiles = await fetchProfilesForResolvedPvz(resolvedPvzId);
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
  if (!(await hasSupabaseSession())) return null;

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

    for (const user of scopedUsers) {
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

      if (error) {
        console.warn('pushLocalProfilesToSupabase:', error.message);
        return error.message;
      }
    }

    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось отправить профили';
    console.warn('pushLocalProfilesToSupabase:', message);
    return message;
  }
}
