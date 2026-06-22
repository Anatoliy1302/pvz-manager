import * as SecureStore from 'expo-secure-store';

import { Pvz } from '../types/user';
import DataService from './DataService';

import { isUuid, setPvzIdMapping } from '../utils/supabaseHelpers';

import { normalizeInn } from '../utils/innHelpers';

import {

  resolveAuthAccessToken,

} from './SupabaseAuthService';

import * as pvzApi from '../../lib/pvzService';

import { getToken } from '../../lib/authSessionStore';



export const PVZ_LIMIT_PRO_MESSAGE = 'Для управления вторым ПВЗ перейдите на Pro-тариф';

export const PVZ_INN_TAKEN_MESSAGE = 'ПВЗ с таким ИНН уже зарегистрирован в системе';



function mapPvzSyncError(message: string): string | null {

  if (message.includes(PVZ_LIMIT_PRO_MESSAGE)) return PVZ_LIMIT_PRO_MESSAGE;

  if (message.includes(PVZ_INN_TAKEN_MESSAGE)) return PVZ_INN_TAKEN_MESSAGE;

  return message;

}



/** ПВЗ владельца с API. */

export async function fetchOwnerPvzsFromSupabase(_ownerId: string): Promise<Pvz[]> {

  return fetchOwnerPvzsForSessionUser(_ownerId);

}



export async function fetchOwnerPvzsForSessionUser(

  sessionUserId: string,

  _accessTokenOverride?: string | null

): Promise<Pvz[]> {

  if (!sessionUserId) return [];

  const token = await getToken();

  if (!token) return [];



  try {

    const list = await pvzApi.fetchPvzList();

    return list.map((p) => ({ ...p, ownerId: p.ownerId || sessionUserId }));

  } catch (error) {

    if (__DEV__) {

      console.warn('[Pvz] fetchOwnerPvzsForSessionUser:', error);

    }

    return [];

  }

}



/** Локальные ПВЗ владельца; дополняет список с API (новые ПВЗ с других устройств). */
export async function loadOwnerPvzsWithRemoteFallback(ownerId: string): Promise<Pvz[]> {
  if (!ownerId) return [];

  const local = await DataService.getPvzsByOwner(ownerId);
  const remote = await fetchOwnerPvzsForSessionUser(ownerId);

  if (remote.length === 0) {
    return local;
  }

  const byId = new Map<string, Pvz>();
  for (const item of local) {
    byId.set(item.id, item);
  }

  for (const item of remote) {
    const normalized = { ...item, ownerId: item.ownerId || ownerId };
    byId.set(normalized.id, normalized);
    if (!local.some((p) => p.id === normalized.id)) {
      await DataService.savePvz(normalized);
    }
  }

  return Array.from(byId.values());
}



export async function ensurePvzSynced(localPvz: Pvz): Promise<string> {

  const token = await resolveAuthAccessToken();

  if (!token) {
    throw new Error('No token');
  }



  try {

    if (isUuid(localPvz.id)) {

      await pvzApi.updatePvz(localPvz.id, localPvz);

      return localPvz.id;

    }



    const mapKey = `supabase_pvz_id_${localPvz.id}`;

    const existingMap = await SecureStore.getItemAsync(mapKey);

    if (existingMap) return existingMap;



    const created = await pvzApi.createPvz({

      ...localPvz,

      ownerInn: normalizeInn(localPvz.ownerInn || ''),

    });

    await setPvzIdMapping(localPvz.id, created.id);

    return created.id;

  } catch (error) {

    const message = error instanceof Error ? error.message : String(error);

    const mapped = mapPvzSyncError(message);

    if (mapped) throw new Error(mapped);

    if (__DEV__) {

      console.warn('[Pvz] ensurePvzSynced:', message);

    }

    return localPvz.id;

  }

}

