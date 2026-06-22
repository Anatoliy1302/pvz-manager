/**
 * Сохранение и восстановление данных при выходе/входе (VPS sync snapshot).
 */
import * as SecureStore from 'expo-secure-store';
import { User, Shift } from '../src/types/user';
import { getToken } from './authSessionStore';
import { pushSync, pullSync } from './syncService';
import { readSnapshotPayload } from './snapshotSync';
import DataService from '../src/services/DataService';
import StorageService from '../src/services/StorageService';
import { safeParseJson } from '../src/utils/safeJson';
import { getScheduleAssignmentsKey } from '../src/utils/scheduleHelpers';
import { mergeDeepSnapshot } from './snapshotMerge';
import { resolveLocalPvzId } from '../src/utils/supabaseHelpers';

const SNAPSHOT_ARRAY_KEYS = [
  'payments',
  'penalties',
  'advance_requests',
  'shift_requests',
  'notifications',
  'profiles',
] as const;

async function collectPvzIds(user: User): Promise<string[]> {
  if (user.role === 'owner') {
    return (await DataService.getPvzsByOwner(user.id)).map((p) => p.id);
  }
  if (user.pvzIds?.length) return user.pvzIds;
  if (user.pvzId) return [user.pvzId];
  const pvzs = await DataService.getPvzs();
  return pvzs.map((p) => p.id);
}

async function readJsonArray<T>(key: string): Promise<T[]> {
  const fromSecure = await SecureStore.getItemAsync(key);
  if (fromSecure) return safeParseJson<T[]>(fromSecure, []);
  const fromAsync = await StorageService.getItem(key);
  return safeParseJson<T[]>(fromAsync ?? '[]', []);
}

/** Собрать локальные данные в payload для /api/sync перед выходом. */
export async function collectLocalSnapshotPayload(user: User): Promise<Record<string, unknown>> {
  const pvzIds = await collectPvzIds(user);
  const payload: Record<string, unknown> = {};

  const users = await DataService.getUsers();
  if (users.length > 0) {
    payload.profiles = users;
  }

  for (const key of SNAPSHOT_ARRAY_KEYS) {
    if (key === 'profiles') continue;
    const stored = await StorageService.getItem(key);
    if (!stored) {
      const secure = await SecureStore.getItemAsync(key);
      if (secure) {
        const parsed = safeParseJson<unknown[]>(secure, []);
        if (parsed.length > 0) payload[key] = parsed;
      }
      continue;
    }
    const parsed = safeParseJson<unknown[]>(stored, []);
    if (parsed.length > 0) payload[key] = parsed;
  }

  if (!payload.shift_requests) {
    const allRequests = await SecureStore.getItemAsync('all_shift_requests');
    const parsed = safeParseJson<unknown[]>(allRequests ?? '[]', []);
    if (parsed.length > 0) payload.shift_requests = parsed;
  }

  const payments: unknown[] = [];
  for (const pvzId of pvzIds) {
    const items = await readJsonArray(`payments_${pvzId}`);
    payments.push(...items);
  }
  if (payments.length > 0) {
    payload.payments = payments;
  }

  const penalties: unknown[] = [];
  const employees = users.filter((u) => u.role === 'employee');
  for (const emp of employees) {
    const items = await readJsonArray(`penalties_${emp.id}`);
    penalties.push(...items);
  }
  if (penalties.length > 0 && !payload.penalties) {
    payload.penalties = penalties;
  }

  const scheduleMap: Record<string, unknown> = {};
  const swapMap: Record<string, unknown> = {};
  const formulasMap: Record<string, unknown> = {};
  const salarySettingsMap: Record<string, unknown> = {};
  const globalSalaryMap: Record<string, unknown> = {};

  for (const pvzId of pvzIds) {
    const schedule = await SecureStore.getItemAsync(getScheduleAssignmentsKey(pvzId));
    if (schedule) {
      const parsed = safeParseJson(schedule, []);
      if (Array.isArray(parsed) && parsed.length > 0) scheduleMap[pvzId] = parsed;
    }
    const swaps = await StorageService.getItem(`swap_requests_${pvzId}`);
    if (swaps) {
      const parsed = safeParseJson(swaps, []);
      if (Array.isArray(parsed) && parsed.length > 0) swapMap[pvzId] = parsed;
    }
    const formulas = await SecureStore.getItemAsync(`salary_formulas_${pvzId}`);
    if (formulas) {
      const parsed = safeParseJson(formulas, []);
      if (Array.isArray(parsed) && parsed.length > 0) formulasMap[pvzId] = parsed;
    }
    const settings = await SecureStore.getItemAsync(`salary_settings_${pvzId}`);
    if (settings) {
      const parsed = safeParseJson(settings, null);
      if (parsed) salarySettingsMap[pvzId] = parsed;
    }
    const globalSettings = await SecureStore.getItemAsync(`global_salary_settings_${pvzId}`);
    if (globalSettings) {
      const parsed = safeParseJson(globalSettings, null);
      if (parsed) globalSalaryMap[pvzId] = parsed;
    }
  }

  if (Object.keys(scheduleMap).length > 0) payload.schedule_assignments_by_pvz = scheduleMap;
  if (Object.keys(swapMap).length > 0) payload.swap_requests_by_pvz = swapMap;
  if (Object.keys(formulasMap).length > 0) payload.salary_formulas_by_pvz = formulasMap;
  if (Object.keys(salarySettingsMap).length > 0) payload.salary_settings_by_pvz = salarySettingsMap;
  if (Object.keys(globalSalaryMap).length > 0) payload.global_salary_settings_by_pvz = globalSalaryMap;

  const shifts = await SecureStore.getItemAsync('shifts');
  const parsedShifts = safeParseJson<Shift[]>(shifts ?? '[]', []);
  const pvzList = await DataService.getPvzs();
  if (pvzList.length > 0) payload.pvz = pvzList;
  if (parsedShifts.length > 0) payload.shifts = parsedShifts;

  const invitations = await SecureStore.getItemAsync('all_invitations');
  const parsedInvitations = safeParseJson(invitations ?? '[]', []);
  if (parsedInvitations.length > 0) payload.all_invitations = parsedInvitations;

  const advanceRequests: unknown[] = [];
  for (const pvzId of pvzIds) {
    const items = await readJsonArray(`advance_requests_${pvzId}`);
    advanceRequests.push(...items);
  }
  if (advanceRequests.length > 0) {
    payload.advance_requests = advanceRequests;
  }

  const bundlesMap: Record<string, unknown> = {};
  for (const pvzId of pvzIds) {
    const [globalRaw, formulasRaw, ratesRaw] = await Promise.all([
      SecureStore.getItemAsync(`global_salary_settings_${pvzId}`),
      SecureStore.getItemAsync(`salary_formulas_${pvzId}`),
      SecureStore.getItemAsync(`salary_settings_${pvzId}`),
    ]);
    const bundle = {
      global: globalRaw ? safeParseJson(globalRaw, null) : null,
      formulas: safeParseJson<unknown[]>(formulasRaw ?? '[]', []),
      employeeRates: safeParseJson<Record<string, unknown>>(ratesRaw ?? '{}', {}),
    };
    if (
      bundle.global ||
      bundle.formulas.length > 0 ||
      Object.keys(bundle.employeeRates).length > 0
    ) {
      bundlesMap[pvzId] = bundle;
    }
  }
  if (Object.keys(bundlesMap).length > 0) {
    payload.salary_bundles = bundlesMap;
  }

  const employeeSettingsMap: Record<string, unknown> = {};
  for (const emp of employees) {
    const stored = await SecureStore.getItemAsync(`employee_salary_settings_${emp.id}`);
    if (!stored || !emp.pvzId) continue;
    employeeSettingsMap[`${emp.pvzId}:${emp.id}`] = safeParseJson(stored, null);
  }
  if (Object.keys(employeeSettingsMap).length > 0) {
    payload.employee_salary_settings = employeeSettingsMap;
  }

  const correctionsMap: Record<string, unknown> = {};
  const overtimeMap: Record<string, unknown> = {};
  for (const emp of employees) {
    const corrections = await SecureStore.getItemAsync(`corrections_${emp.id}`);
    if (corrections) {
      const parsed = safeParseJson(corrections, []);
      if (Array.isArray(parsed) && parsed.length > 0) correctionsMap[emp.id] = parsed;
    }
    const overtime = await SecureStore.getItemAsync(`overtime_${emp.id}`);
    if (overtime) {
      const parsed = safeParseJson(overtime, []);
      if (Array.isArray(parsed) && parsed.length > 0) overtimeMap[emp.id] = parsed;
    }
  }
  if (Object.keys(correctionsMap).length > 0) payload.corrections_by_employee = correctionsMap;
  if (Object.keys(overtimeMap).length > 0) payload.overtime_by_employee = overtimeMap;

  payload.userId = user.id;
  payload.role = user.role;

  return payload;
}

/** Восстановить локальные ключи из snapshot после pull. */
export async function hydrateLocalFromSnapshot(
  snapshot: Record<string, unknown> | undefined
): Promise<void> {
  if (!snapshot || typeof snapshot !== 'object') return;

  if (Array.isArray(snapshot.profiles) && snapshot.profiles.length > 0) {
    await SecureStore.setItemAsync('pvz_users', JSON.stringify(snapshot.profiles));
    DataService.emitChange?.('pvz_users');
  }

  for (const key of SNAPSHOT_ARRAY_KEYS) {
    if (key === 'profiles') continue;
    const value = snapshot[key];
    if (!Array.isArray(value) || value.length === 0) continue;
    await StorageService.setItem(key, JSON.stringify(value));
    if (key === 'shift_requests') {
      await SecureStore.setItemAsync('all_shift_requests', JSON.stringify(value));
      DataService.emitChange?.('all_shift_requests');
    }
    if (key === 'notifications') {
      DataService.emitChange?.('notifications');
    }
  }

  const scheduleMap = snapshot.schedule_assignments_by_pvz;
  if (scheduleMap && typeof scheduleMap === 'object') {
    for (const [pvzId, assignments] of Object.entries(scheduleMap)) {
      if (!Array.isArray(assignments)) continue;
      await SecureStore.setItemAsync(getScheduleAssignmentsKey(pvzId), JSON.stringify(assignments));
      DataService.emitChange?.(`schedule_assignments_${pvzId}`);
    }
  }

  const swapMap = snapshot.swap_requests_by_pvz;
  if (swapMap && typeof swapMap === 'object') {
    for (const [pvzId, swaps] of Object.entries(swapMap)) {
      if (!Array.isArray(swaps)) continue;
      await StorageService.setItem(`swap_requests_${pvzId}`, JSON.stringify(swaps));
      DataService.emitChange?.(`swap_requests_${pvzId}`);
    }
  }

  const formulasMap = snapshot.salary_formulas_by_pvz;
  if (formulasMap && typeof formulasMap === 'object') {
    for (const [pvzId, formulas] of Object.entries(formulasMap)) {
      if (!Array.isArray(formulas)) continue;
      const localPvzId = await resolveLocalPvzId(pvzId);
      await SecureStore.setItemAsync(`salary_formulas_${localPvzId}`, JSON.stringify(formulas));
      DataService.emitChange?.(`salary_formulas_${localPvzId}`);
    }
  }

  const settingsMap = snapshot.salary_settings_by_pvz;
  if (settingsMap && typeof settingsMap === 'object') {
    for (const [pvzId, settings] of Object.entries(settingsMap)) {
      if (!settings) continue;
      const localPvzId = await resolveLocalPvzId(pvzId);
      await SecureStore.setItemAsync(`salary_settings_${localPvzId}`, JSON.stringify(settings));
      DataService.emitChange?.(`salary_settings_${localPvzId}`);
    }
  }

  const globalMap = snapshot.global_salary_settings_by_pvz;
  if (globalMap && typeof globalMap === 'object') {
    for (const [pvzId, settings] of Object.entries(globalMap)) {
      if (!settings) continue;
      const localPvzId = await resolveLocalPvzId(pvzId);
      await SecureStore.setItemAsync(`global_salary_settings_${localPvzId}`, JSON.stringify(settings));
      DataService.emitChange?.(`salary_settings_${localPvzId}`);
    }
  }

  if (Array.isArray(snapshot.payments) && snapshot.payments.length > 0) {
    const byPvz = new Map<string, unknown[]>();
    for (const payment of snapshot.payments as Array<{ pvzId?: string }>) {
      const pvzId = payment.pvzId;
      if (!pvzId) continue;
      const localPvzId = await resolveLocalPvzId(pvzId);
      if (!byPvz.has(localPvzId)) byPvz.set(localPvzId, []);
      byPvz.get(localPvzId)!.push({ ...payment, pvzId: localPvzId });
    }
    for (const [pvzId, items] of byPvz) {
      await StorageService.setItem(`payments_${pvzId}`, JSON.stringify(items));
      DataService.emitChange?.(`payments_${pvzId}`);
    }
  }

  if (Array.isArray(snapshot.penalties) && snapshot.penalties.length > 0) {
    const byEmployee = new Map<string, unknown[]>();
    for (const penalty of snapshot.penalties as Array<{ employeeId?: string }>) {
      const employeeId = penalty.employeeId;
      if (!employeeId) continue;
      if (!byEmployee.has(employeeId)) byEmployee.set(employeeId, []);
      byEmployee.get(employeeId)!.push(penalty);
    }
    for (const [employeeId, items] of byEmployee) {
      await StorageService.setItem(`penalties_${employeeId}`, JSON.stringify(items));
    }
  }

  if (Array.isArray(snapshot.all_invitations)) {
    await SecureStore.setItemAsync('all_invitations', JSON.stringify(snapshot.all_invitations));
  }

  if (Array.isArray(snapshot.shifts) && snapshot.shifts.length > 0) {
    const existing = safeParseJson<Shift[]>(
      (await SecureStore.getItemAsync('shifts')) ?? '[]',
      []
    );
    const byId = new Map<string, Shift>();
    for (const shift of existing) byId.set(shift.id, shift);
    for (const shift of snapshot.shifts as Shift[]) byId.set(shift.id, shift);
    await SecureStore.setItemAsync('shifts', JSON.stringify([...byId.values()]));
    DataService.emitChange?.('shifts');
  }

  const bundlesMap = snapshot.salary_bundles;
  if (bundlesMap && typeof bundlesMap === 'object' && !Array.isArray(bundlesMap)) {
    for (const [pvzId, bundle] of Object.entries(bundlesMap)) {
      if (!bundle || typeof bundle !== 'object') continue;
      const localPvzId = await resolveLocalPvzId(pvzId);
      const b = bundle as { global?: unknown; formulas?: unknown[]; employeeRates?: unknown };
      if (b.global) {
        await SecureStore.setItemAsync(
          `global_salary_settings_${localPvzId}`,
          JSON.stringify(b.global)
        );
      }
      if (Array.isArray(b.formulas)) {
        await SecureStore.setItemAsync(`salary_formulas_${localPvzId}`, JSON.stringify(b.formulas));
      }
      if (b.employeeRates) {
        await SecureStore.setItemAsync(
          `salary_settings_${localPvzId}`,
          JSON.stringify(b.employeeRates)
        );
      }
      DataService.emitChange?.(`salary_settings_${localPvzId}`);
      DataService.emitChange?.(`salary_formulas_${localPvzId}`);
    }
  }

  const empSettingsMap = snapshot.employee_salary_settings;
  if (empSettingsMap && typeof empSettingsMap === 'object' && !Array.isArray(empSettingsMap)) {
    for (const [key, settings] of Object.entries(empSettingsMap)) {
      if (!settings) continue;
      const employeeId = key.includes(':') ? key.split(':')[1] : key;
      await SecureStore.setItemAsync(
        `employee_salary_settings_${employeeId}`,
        JSON.stringify(settings)
      );
    }
  }

  const correctionsMap = snapshot.corrections_by_employee;
  if (correctionsMap && typeof correctionsMap === 'object' && !Array.isArray(correctionsMap)) {
    for (const [employeeId, corrections] of Object.entries(correctionsMap)) {
      if (!Array.isArray(corrections)) continue;
      await SecureStore.setItemAsync(`corrections_${employeeId}`, JSON.stringify(corrections));
      DataService.emitChange?.(`corrections_${employeeId}`);
    }
  }

  const overtimeMap = snapshot.overtime_by_employee;
  if (overtimeMap && typeof overtimeMap === 'object' && !Array.isArray(overtimeMap)) {
    for (const [employeeId, overtimes] of Object.entries(overtimeMap)) {
      if (!Array.isArray(overtimes)) continue;
      await SecureStore.setItemAsync(`overtime_${employeeId}`, JSON.stringify(overtimes));
      DataService.emitChange?.(`overtime_${employeeId}`);
    }
  }

  if (Array.isArray(snapshot.advance_requests) && snapshot.advance_requests.length > 0) {
    const byPvz = new Map<string, unknown[]>();
    for (const request of snapshot.advance_requests as Array<{ pvzId?: string }>) {
      const pvzId = request.pvzId;
      if (!pvzId) continue;
      if (!byPvz.has(pvzId)) byPvz.set(pvzId, []);
      byPvz.get(pvzId)!.push(request);
    }
    for (const [pvzId, items] of byPvz) {
      await StorageService.setItem(`advance_requests_${pvzId}`, JSON.stringify(items));
    }
  }
}

/** Перед выходом: слить локальные данные с облаком. */
export async function pushSnapshotBeforeLogout(user: User): Promise<void> {
  if (!(await getToken())) return;
  try {
    const remote = await readSnapshotPayload();
    const local = await collectLocalSnapshotPayload(user);
    await pushSync(mergeDeepSnapshot(remote, local));
  } catch (error) {
    if (__DEV__) {
      console.warn('pushSnapshotBeforeLogout:', error);
    }
  }
}

export async function pullAndHydrateSnapshot(): Promise<void> {
  if (!(await getToken())) return;
  const remote = await pullSync();
  const snapshot =
    remote.snapshot && typeof remote.snapshot === 'object'
      ? (remote.snapshot as Record<string, unknown>)
      : {};
  await hydrateLocalFromSnapshot(snapshot);
}

export async function pushSnapshotPatch(patch: Record<string, unknown>): Promise<void> {
  if (!(await getToken())) return;
  try {
    const current = await readSnapshotPayload();
    await pushSync(mergeDeepSnapshot(current, patch));
  } catch (error) {
    if (__DEV__) {
      console.warn('pushSnapshotPatch:', error);
    }
  }
}

export function queueSnapshotPatch(patch: Record<string, unknown>): void {
  void pushSnapshotPatch(patch);
}

export async function syncScheduleToServer(
  pvzId: string,
  assignments: unknown[]
): Promise<void> {
  await pushSnapshotPatch({
    schedule_assignments_by_pvz: { [pvzId]: assignments },
  });
}

export async function syncSwapRequestsToServer(
  pvzId: string,
  requests: unknown[]
): Promise<void> {
  await pushSnapshotPatch({
    swap_requests_by_pvz: { [pvzId]: requests },
  });
}

export async function syncShiftsToServer(shifts: Shift[]): Promise<void> {
  await pushSnapshotPatch({ shifts });
}
