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
import { getPvzs } from './pvzDataService';

export type GetShiftsOptions = {
  /** Pull from Supabase and merge (default: false — local cache only). */
  refresh?: boolean;
};

let refreshInFlight: Promise<Shift[]> | null = null;

async function readLocalShifts(): Promise<Shift[]> {
  const stored = await SecureStore.getItemAsync('shifts');
  return safeParseJson<Shift[]>(stored ?? '[]', []);
}

async function writeLocalShifts(shifts: Shift[]): Promise<void> {
  await SecureStore.setItemAsync('shifts', JSON.stringify(shifts));
  dataEventBus.notify('shifts');
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

/** Read shifts from local SecureStore only (no network). */
export async function getShiftsLocal(): Promise<Shift[]> {
  return normalizeShiftPvzIds(await readLocalShifts());
}

/**
 * Returns cached shifts instantly. Pass `{ refresh: true }` to pull from Supabase.
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
    const remote = await fetchShiftsFromSupabase(pvzIds.length > 0 ? pvzIds : undefined);

    if (!remote) {
      return normalizeShiftPvzIds(local);
    }

    const merged = remote.length === 0 ? local : mergeShiftsLocalRemote(local, remote);
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
}

export async function updateShift(id: string, updates: Partial<Shift>): Promise<void> {
  const shifts = await readLocalShifts();
  const index = shifts.findIndex((s) => s.id === id);
  if (index === -1) return;

  const updated = { ...shifts[index], ...updates };
  const synced = await upsertShiftToSupabase(updated);
  shifts[index] = synced || updated;
  await writeLocalShifts(shifts);
}

export async function saveShifts(shifts: Shift[]): Promise<void> {
  await Promise.all(shifts.map((shift) => upsertShiftToSupabase(shift)));
  await writeLocalShifts(shifts);
}

export async function deleteShift(id: string): Promise<void> {
  await deleteShiftFromSupabase(id);
  const shifts = await readLocalShifts();
  const filtered = shifts.filter((s) => s.id !== id);
  await writeLocalShifts(filtered);
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
