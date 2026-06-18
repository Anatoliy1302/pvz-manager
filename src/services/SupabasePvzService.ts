import { supabase } from '../../lib/supabase';
import * as SecureStore from 'expo-secure-store';
import { Pvz } from '../types/user';
import { isUuid, setPvzIdMapping } from '../utils/supabaseHelpers';
import { normalizeInn } from '../utils/innHelpers';
import { supabaseRestGet } from '../../lib/supabaseRest';
import { PVZ_COLUMNS } from './supabase/selectColumns';
import {
  hasSupabaseSession,
  ensureSupabaseClientSession,
  fetchProfileUser,
  resolveAuthAccessToken,
  warmSupabaseClientSession,
} from './SupabaseAuthService';

export const PVZ_LIMIT_PRO_MESSAGE = 'Для управления вторым ПВЗ перейдите на Pro-тариф';
export const PVZ_INN_TAKEN_MESSAGE = 'ПВЗ с таким ИНН уже зарегистрирован в системе';

function mapPvzSyncError(error: { message?: string; code?: string } | null): string | null {
  if (!error?.message) return null;
  const { message, code } = error;
  if (message.includes(PVZ_LIMIT_PRO_MESSAGE)) return PVZ_LIMIT_PRO_MESSAGE;
  if (message.includes(PVZ_INN_TAKEN_MESSAGE) || code === '23505') {
    if (message.includes('owner_inn') || message.includes('pvz_owner_inn_unique')) {
      return PVZ_INN_TAKEN_MESSAGE;
    }
  }
  return message;
}

function mapRemotePvzRow(row: Record<string, unknown>): Pvz {
  return {
    id: row.id as string,
    name: row.name as string,
    address: (row.address as string) || '',
    workStart: (row.work_start as string) || '09:00',
    workEnd: (row.work_end as string) || '21:00',
    workingHours: (row.working_hours as string) || '09:00 - 21:00',
    phone: (row.phone as string) || '',
    ownerId: row.owner_id as string,
    ownerInn: (row.owner_inn as string) || undefined,
  };
}

function mapPvzRows(rows: Record<string, unknown>[]): Pvz[] {
  return rows.map((row) => mapRemotePvzRow(row));
}

async function fetchPvzByOwnerViaClient(sessionUserId: string): Promise<Pvz[]> {
  const { data, error } = await supabase
    .from('pvz')
    .select(PVZ_COLUMNS)
    .eq('owner_id', sessionUserId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('fetchOwnerPvzsForSessionUser client:', error.message);
    return [];
  }

  return mapPvzRows((data || []) as Record<string, unknown>[]);
}

async function fetchPvzByProfileIdsViaClient(pvzIds: string[]): Promise<Pvz[]> {
  if (pvzIds.length === 0) return [];

  const { data, error } = await supabase.from('pvz').select(PVZ_COLUMNS).in('id', pvzIds);

  if (error) {
    console.warn('fetchOwnerPvzsForSessionUser profile client:', error.message);
    return [];
  }

  return mapPvzRows((data || []) as Record<string, unknown>[]);
}

async function fetchPvzByProfileIdsViaRest(
  pvzIds: string[],
  accessToken: string
): Promise<Pvz[]> {
  if (pvzIds.length === 0) return [];

  const idsFilter = pvzIds.join(',');
  const rows = await supabaseRestGet<Record<string, unknown>>(
    'pvz',
    `select=${PVZ_COLUMNS}&id=in.(${idsFilter})`,
    accessToken
  );
  if (!rows?.length) return [];
  return mapPvzRows(rows);
}

/** ПВЗ владельца из Supabase (после email OTP, когда локальный кэш пуст). */
export async function fetchOwnerPvzsFromSupabase(ownerId: string): Promise<Pvz[]> {
  return fetchOwnerPvzsForSessionUser(ownerId);
}

/**
 * ПВЗ по owner_id (= auth.users.id) + fallback через profiles.pvz_id.
 * REST с JWT сразу после OTP, затем supabase-js клиент.
 */
export async function fetchOwnerPvzsForSessionUser(
  sessionUserId: string,
  accessTokenOverride?: string | null
): Promise<Pvz[]> {
  if (!sessionUserId) return [];

  const accessToken = accessTokenOverride ?? (await resolveAuthAccessToken());

  if (accessToken) {
    const byOwner = await supabaseRestGet<Record<string, unknown>>(
      'pvz',
      `select=${PVZ_COLUMNS}&owner_id=eq.${sessionUserId}&order=created_at.asc`,
      accessToken
    );
    if (byOwner?.length) {
      warmSupabaseClientSession();
      return mapPvzRows(byOwner);
    }

    const profiles = await supabaseRestGet<{ pvz_id?: string; pvz_ids?: string[] }>(
      'profiles',
      `select=pvz_id,pvz_ids&id=eq.${sessionUserId}`,
      accessToken
    );
    const profile = profiles?.[0];
    if (profile) {
      const pvzIds = new Set<string>();
      if (profile.pvz_id) pvzIds.add(profile.pvz_id);
      profile.pvz_ids?.forEach((id) => pvzIds.add(id));
      const byProfile = await fetchPvzByProfileIdsViaRest(Array.from(pvzIds), accessToken);
      if (byProfile.length) {
        warmSupabaseClientSession();
        return byProfile;
      }
    }
  }

  if (!(await ensureSupabaseClientSession())) {
    return [];
  }

  const byOwnerClient = await fetchPvzByOwnerViaClient(sessionUserId);
  if (byOwnerClient.length) {
    return byOwnerClient;
  }

  const profileUser = await fetchProfileUser(sessionUserId);
  if (!profileUser) return [];

  const fallbackIds = new Set<string>();
  if (profileUser.pvzId) fallbackIds.add(profileUser.pvzId);
  profileUser.pvzIds?.forEach((id) => fallbackIds.add(id));

  return fetchPvzByProfileIdsViaClient(Array.from(fallbackIds));
}

function pvzRow(localPvz: Pvz) {
  return {
    id: isUuid(localPvz.id) ? localPvz.id : undefined,
    owner_id: localPvz.ownerId,
    name: localPvz.name,
    address: localPvz.address || '',
    work_start: localPvz.workStart || '09:00',
    work_end: localPvz.workEnd || '21:00',
    working_hours: localPvz.workingHours || '09:00 - 21:00',
    phone: localPvz.phone || '',
    owner_inn: normalizeInn(localPvz.ownerInn || ''),
    updated_at: new Date().toISOString(),
  };
}

export async function ensurePvzSynced(localPvz: Pvz): Promise<string> {
  if (!(await hasSupabaseSession())) {
    return localPvz.id;
  }

  if (isUuid(localPvz.id)) {
    const { error } = await supabase.from('pvz').upsert(pvzRow(localPvz), { onConflict: 'id' });
    const mapped = mapPvzSyncError(error);
    if (mapped) throw new Error(mapped);
    return localPvz.id;
  }

  const mapKey = `supabase_pvz_id_${localPvz.id}`;
  const existingMap = await SecureStore.getItemAsync(mapKey);
  if (existingMap) return existingMap;

  const { data: found } = await supabase
    .from('pvz')
    .select('id')
    .eq('owner_id', localPvz.ownerId)
    .eq('name', localPvz.name)
    .maybeSingle();

  if (found?.id) {
    await setPvzIdMapping(localPvz.id, found.id);
    return found.id;
  }

  const { data: inserted, error } = await supabase
    .from('pvz')
    .insert(pvzRow(localPvz))
    .select('id')
    .single();

  const mapped = mapPvzSyncError(error);
  if (mapped) throw new Error(mapped);
  if (!inserted?.id) throw new Error('PVZ sync failed');

  await setPvzIdMapping(localPvz.id, inserted.id);
  return inserted.id;
}
