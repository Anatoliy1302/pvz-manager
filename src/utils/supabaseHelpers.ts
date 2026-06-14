import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../lib/supabase';
import { safeParseJson } from './safeJson';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PVZ_MAP_PREFIX = 'supabase_pvz_id_';
const USER_MAP_PREFIX = 'supabase_user_id_';

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function getPvzIdMapping(localPvzId: string): Promise<string | null> {
  return SecureStore.getItemAsync(`${PVZ_MAP_PREFIX}${localPvzId}`);
}

export async function setPvzIdMapping(localPvzId: string, supabasePvzId: string): Promise<void> {
  await SecureStore.setItemAsync(`${PVZ_MAP_PREFIX}${localPvzId}`, supabasePvzId);
}

export async function resolvePvzId(localPvzId: string): Promise<string> {
  if (isUuid(localPvzId)) return localPvzId;
  const mapped = await getPvzIdMapping(localPvzId);
  return mapped || localPvzId;
}

/** UUID Supabase → локальный id ПВЗ из pvz_list (если есть маппинг). */
export async function resolveLocalPvzId(pvzId: string): Promise<string> {
  if (!isUuid(pvzId)) return pvzId;

  const pvzsRaw = await SecureStore.getItemAsync('pvz_list');
  if (!pvzsRaw) return pvzId;

  const pvzs = safeParseJson<Array<{ id: string }>>(pvzsRaw, []);
  for (const pvz of pvzs) {
    if (pvz.id === pvzId) return pvz.id;
    const mapped = await getPvzIdMapping(pvz.id);
    if (mapped === pvzId) return pvz.id;
  }

  return pvzId;
}

export async function isSamePvz(
  shiftPvzId: string | undefined,
  localPvzId: string
): Promise<boolean> {
  if (!shiftPvzId || !localPvzId) return true;
  if (shiftPvzId === localPvzId) return true;

  const resolvedLocal = await resolvePvzId(localPvzId);
  if (shiftPvzId === resolvedLocal) return true;

  const localFromRemote = await resolveLocalPvzId(shiftPvzId);
  return localFromRemote === localPvzId;
}

export function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatTimeFromDate(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export async function getUserIdMapping(localUserId: string): Promise<string | null> {
  return SecureStore.getItemAsync(`${USER_MAP_PREFIX}${localUserId}`);
}

export async function setUserIdMapping(localUserId: string, supabaseUserId: string): Promise<void> {
  await SecureStore.setItemAsync(`${USER_MAP_PREFIX}${localUserId}`, supabaseUserId);
}

/** Локальный id → UUID профиля Supabase (маппинг или поиск по телефону). */
export async function resolveUserId(localOrUuid: string): Promise<string | null> {
  if (isUuid(localOrUuid)) return localOrUuid;

  const mapped = await getUserIdMapping(localOrUuid);
  if (mapped) return mapped;

  const usersRaw = await SecureStore.getItemAsync('pvz_users');
  if (!usersRaw) return null;

  const users = safeParseJson<Array<{ id: string; phone?: string }>>(usersRaw, []);
  const localUser = users.find((u) => u.id === localOrUuid);
  if (!localUser?.phone) return null;

  const cleanPhone = localUser.phone.replace(/[^0-9]/g, '');
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone', cleanPhone)
    .maybeSingle();

  if (error || !data?.id) return null;

  await setUserIdMapping(localOrUuid, data.id);
  return data.id;
}

export function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const remoteIds = new Set(remote.map((item) => item.id));
  const localOnly = local.filter((item) => !remoteIds.has(item.id));
  return [...remote, ...localOnly];
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}
