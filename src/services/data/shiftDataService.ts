import * as SecureStore from 'expo-secure-store';

import { Shift } from '../../types/user';

import {

  fetchShiftsFromSupabase,

  upsertShiftToSupabase,

  deleteShiftFromSupabase,

} from '../SupabaseShiftService';

import { isUuid, resolveLocalPvzId } from '../../utils/supabaseHelpers';

import { safeParseJson } from '../../utils/safeJson';

import { dataEventBus } from './dataEventBus';

import { syncShiftsToServer } from '../../../lib/syncPersistence';

import { getPvzs } from './pvzDataService';



export type GetShiftsOptions = {

  /** Pull from API and merge (default: false — local cache only). */

  refresh?: boolean;

};



type WriteOptions = { skipSync?: boolean };



let refreshInFlight: Promise<Shift[]> | null = null;



export async function readLocalShifts(): Promise<Shift[]> {

  const stored = await SecureStore.getItemAsync('shifts');

  return safeParseJson<Shift[]>(stored ?? '[]', []);

}



async function writeLocalShifts(shifts: Shift[], options?: WriteOptions): Promise<void> {

  await SecureStore.setItemAsync('shifts', JSON.stringify(shifts));

  dataEventBus.notify('shifts');

  if (!options?.skipSync) {

    void syncShiftsToServer(shifts);

  }

}



async function normalizeShiftPvzIds(shifts: Shift[]): Promise<Shift[]> {

  return Promise.all(

    shifts.map(async (shift) => {

      if (!shift.pvzId) return shift;

      const localPvzId = await resolveLocalPvzId(shift.pvzId);

      if (localPvzId === shift.pvzId) return shift;

      return { ...shift, pvzId: localPvzId };

    })

  );

}



function mergeShiftsLocalRemote(local: Shift[], remote: Shift[]): Shift[] {

  const byKey = new Map<string, Shift>();



  const addShift = (shift: Shift) => {

    const key = `${shift.employeeId}_${shift.date}_${shift.pvzId || ''}`;

    const existing = byKey.get(key);

    if (!existing) {

      byKey.set(key, shift);

      return;

    }

    if (isUuid(shift.id) && !isUuid(existing.id)) {

      byKey.set(key, { ...shift, pvzName: shift.pvzName || existing.pvzName });

    }

  };



  remote.forEach(addShift);

  local.forEach((shift) => {

    if (!remote.some((r) => r.id === shift.id)) {

      addShift(shift);

    }

  });



  return Array.from(byKey.values());

}



/** Merge remote PVZ shifts into local store (employee / multi-device sync). */

export async function mergePvzShiftsFromRemote(

  pvzId: string,

  remoteShifts: Shift[]

): Promise<void> {

  const local = await readLocalShifts();

  const normalizedRemote = await normalizeShiftPvzIds(remoteShifts);

  const otherPvz = local.filter((s) => s.pvzId !== pvzId);

  const localPvz = local.filter((s) => s.pvzId === pvzId);

  const byId = new Map<string, Shift>();

  for (const shift of localPvz) byId.set(shift.id, shift);

  for (const shift of normalizedRemote) byId.set(shift.id, shift);

  await writeLocalShifts([...otherPvz, ...byId.values()], { skipSync: true });

}



/** Read shifts from local SecureStore only (no network). */

export async function getShiftsLocal(): Promise<Shift[]> {

  return normalizeShiftPvzIds(await readLocalShifts());

}



/**

 * Returns cached shifts instantly. Pass `{ refresh: true }` to pull from API.

 */

export async function getShifts(options?: GetShiftsOptions): Promise<Shift[]> {

  if (options?.refresh) {

    return refreshShiftsCache();

  }

  return getShiftsLocal();

}



export async function refreshShiftsCache(): Promise<Shift[]> {

  if (refreshInFlight) {

    return refreshInFlight;

  }



  refreshInFlight = (async () => {

    const local = await readLocalShifts();

    const pvzIds = (await getPvzs()).map((p) => p.id);



    const { pullPvzScheduleFromServer } = await import('./scheduleDataService');

    await Promise.all(pvzIds.map((pvzId) => pullPvzScheduleFromServer(pvzId)));



    const afterPull = await readLocalShifts();

    const remote = await fetchShiftsFromSupabase(pvzIds.length > 0 ? pvzIds : undefined);



    if (!remote) {

      return normalizeShiftPvzIds(afterPull.length > 0 ? afterPull : local);

    }



    const base = afterPull.length > 0 ? afterPull : local;

    const merged = remote.length === 0 ? base : mergeShiftsLocalRemote(base, remote);

    const normalized = await normalizeShiftPvzIds(merged);

    await writeLocalShifts(normalized);



    const { syncScheduleFromShifts } = await import('./scheduleDataService');

    await Promise.all(pvzIds.map((pvzId) => syncScheduleFromShifts(pvzId)));



    return normalized;

  })();



  try {

    return await refreshInFlight;

  } finally {

    refreshInFlight = null;

  }

}



export async function getShiftsByDate(date: string, pvzId?: string): Promise<Shift[]> {

  const shifts = await getShiftsLocal();

  let filtered = shifts.filter((s) => s.date === date);



  if (pvzId) {

    filtered = filtered.filter((s) => (s as { pvzId?: string }).pvzId === pvzId);

  }



  return filtered;

}



export async function getShiftsByEmployee(

  employeeId: string,

  startDate?: string,

  endDate?: string

): Promise<Shift[]> {

  const shifts = await getShiftsLocal();

  let filtered = shifts.filter((s) => s.employeeId === employeeId);



  if (startDate) {

    filtered = filtered.filter((s) => s.date >= startDate);

  }

  if (endDate) {

    filtered = filtered.filter((s) => s.date <= endDate);

  }



  return filtered;

}



export async function addShift(shift: Shift): Promise<void> {

  let toSave = shift;

  const synced = await upsertShiftToSupabase(shift);

  if (synced) {

    toSave = {

      ...synced,

      pvzId: shift.pvzId || synced.pvzId,

      pvzName: shift.pvzName || synced.pvzName,

      customStart: shift.customStart || synced.customStart,

      customEnd: shift.customEnd || synced.customEnd,

      shiftType: shift.shiftType || synced.shiftType,

      employeeId: shift.employeeId || synced.employeeId,

      employeeName: shift.employeeName || synced.employeeName,

      date: shift.date || synced.date,

      status: shift.status || synced.status,

      earnings: shift.earnings ?? synced.earnings,

    };

  }



  const shifts = await readLocalShifts();

  const existingIndex = shifts.findIndex((s) => s.id === toSave.id);

  if (existingIndex !== -1) {

    shifts[existingIndex] = toSave;

  } else {

    shifts.push(toSave);

  }

  await writeLocalShifts(shifts);



  if (shift.pvzId && shift.status === 'planned') {

    const { pushPvzScheduleBundle } = await import('./scheduleDataService');

    void pushPvzScheduleBundle(shift.pvzId);

  }

}



export async function updateShift(id: string, updates: Partial<Shift>): Promise<void> {

  const shifts = await readLocalShifts();

  const index = shifts.findIndex((s) => s.id === id);

  if (index === -1) return;



  const updated = { ...shifts[index], ...updates };

  const synced = await upsertShiftToSupabase(updated);

  shifts[index] = synced || updated;

  await writeLocalShifts(shifts);



  const pvzId = shifts[index].pvzId;

  if (pvzId && (shifts[index].status === 'planned' || updates.status === 'planned')) {

    const { pushPvzScheduleBundle } = await import('./scheduleDataService');

    void pushPvzScheduleBundle(pvzId);

  }

}



export async function saveShifts(shifts: Shift[]): Promise<void> {

  await Promise.all(

    shifts

      .filter((shift) => shift.status !== 'planned')

      .map((shift) => upsertShiftToSupabase(shift))

  );

  await writeLocalShifts(shifts);



  const pvzIds = [...new Set(shifts.map((s) => s.pvzId).filter(Boolean))] as string[];

  const { pushPvzScheduleBundle } = await import('./scheduleDataService');

  await Promise.all(pvzIds.map((pvzId) => pushPvzScheduleBundle(pvzId)));

}



export async function deleteShift(id: string): Promise<void> {

  const shifts = await readLocalShifts();

  const removed = shifts.find((s) => s.id === id);

  await deleteShiftFromSupabase(id);

  const filtered = shifts.filter((s) => s.id !== id);

  await writeLocalShifts(filtered);



  if (removed?.pvzId) {

    const { pushPvzScheduleBundle } = await import('./scheduleDataService');

    void pushPvzScheduleBundle(removed.pvzId);

  }

}



export async function getShiftsHistory(employeeId?: string): Promise<unknown[]> {

  const stored = await SecureStore.getItemAsync('shifts_history');

  const history = safeParseJson<unknown[]>(stored ?? '[]', []);



  if (employeeId) {

    return history.filter((s: { employeeId?: string }) => s.employeeId === employeeId);

  }



  return history;

}



export async function addShiftHistory(record: unknown): Promise<void> {

  const history = await getShiftsHistory();

  history.push(record);

  await SecureStore.setItemAsync('shifts_history', JSON.stringify(history));

  dataEventBus.notify('shifts_history');

}



export async function updateShiftHistory(id: string, updates: Record<string, unknown>): Promise<void> {

  const history = await getShiftsHistory();

  const index = history.findIndex((s: { id?: string }) => s.id === id);



  if (index !== -1) {

    history[index] = { ...(history[index] as object), ...updates };

    await SecureStore.setItemAsync('shifts_history', JSON.stringify(history));

    dataEventBus.notify('shifts_history');

  }

}



export async function getActiveShift(): Promise<unknown | null> {

  const stored = await SecureStore.getItemAsync('active_shift');

  return stored ? safeParseJson<Shift | null>(stored, null) : null;

}



export async function setActiveShift(shift: unknown | null): Promise<void> {

  if (shift) {

    await SecureStore.setItemAsync('active_shift', JSON.stringify(shift));

  } else {

    await SecureStore.deleteItemAsync('active_shift');

  }

  dataEventBus.notify('active_shift');

}


