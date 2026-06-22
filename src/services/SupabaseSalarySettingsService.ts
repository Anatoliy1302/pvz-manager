import * as SecureStore from 'expo-secure-store';

import { SalaryFormula, EmployeeSalarySettings } from '../types/salary';

import { mergeById } from '../utils/supabaseHelpers';

import { getToken } from '../../lib/authSessionStore';

import DataService from './DataService';

import { safeParseJson } from '../utils/safeJson';

import { fetchPvzSalary, updatePvzSalary } from '../../lib/pvzFinanceService';

import { userBelongsToPvz } from '../utils/chatHelpers';



export interface PvzSalaryBundle {

  global: Record<string, unknown> | null;

  formulas: SalaryFormula[];

  employeeRates: Record<string, Record<string, unknown>>;

}



function mergeFormulas(local: SalaryFormula[], remote: SalaryFormula[]): SalaryFormula[] {

  return mergeById(local, remote);

}



function mergeEmployeeRates(

  local: Record<string, Record<string, unknown>>,

  remote: Record<string, Record<string, unknown>>

): Record<string, Record<string, unknown>> {

  return { ...remote, ...local };

}



async function readLocalPvzBundle(localPvzId: string): Promise<PvzSalaryBundle> {

  const [globalRaw, formulasRaw, ratesRaw] = await Promise.all([

    SecureStore.getItemAsync(`global_salary_settings_${localPvzId}`),

    SecureStore.getItemAsync(`salary_formulas_${localPvzId}`),

    SecureStore.getItemAsync(`salary_settings_${localPvzId}`),

  ]);



  return {

    global: globalRaw ? safeParseJson<Record<string, unknown> | null>(globalRaw, null) : null,

    formulas: safeParseJson<SalaryFormula[]>(formulasRaw ?? '[]', []),

    employeeRates: safeParseJson<Record<string, Record<string, unknown>>>(ratesRaw ?? '{}', {}),

  };

}



async function writeLocalPvzBundle(localPvzId: string, bundle: PvzSalaryBundle): Promise<void> {

  if (bundle.global) {

    await SecureStore.setItemAsync(

      `global_salary_settings_${localPvzId}`,

      JSON.stringify(bundle.global)

    );

  }

  await SecureStore.setItemAsync(

    `salary_formulas_${localPvzId}`,

    JSON.stringify(bundle.formulas)

  );

  await SecureStore.setItemAsync(

    `salary_settings_${localPvzId}`,

    JSON.stringify(bundle.employeeRates)

  );

}



async function readLocalEmployeeSettingsMap(

  localPvzId: string

): Promise<Record<string, EmployeeSalarySettings>> {

  const employees = await listPvzStaff(localPvzId);

  const map: Record<string, EmployeeSalarySettings> = {};

  for (const employee of employees) {

    const stored = await SecureStore.getItemAsync(`employee_salary_settings_${employee.id}`);

    if (!stored) continue;

    const settings = safeParseJson<EmployeeSalarySettings | null>(stored, null);

    if (settings) {

      map[employee.id] = settings;

    }

  }

  return map;

}



export async function fetchPvzSalaryBundleFromSupabase(

  localPvzId: string

): Promise<PvzSalaryBundle | null> {

  if (!(await getToken())) return null;



  try {

    const remote = await fetchPvzSalary(localPvzId);

    return remote.bundle ?? null;

  } catch (error) {

    if (__DEV__) {

      console.warn('fetchPvzSalaryBundleFromSupabase:', error);

    }

    return null;

  }

}



export async function fetchEmployeeSalarySettingsFromSupabase(

  localPvzId: string,

  employeeId: string

): Promise<EmployeeSalarySettings | null> {

  if (!(await getToken())) return null;



  try {

    const remote = await fetchPvzSalary(localPvzId);

    return remote.employeeSettings?.[employeeId] ?? null;

  } catch (error) {

    if (__DEV__) {

      console.warn('fetchEmployeeSalarySettingsFromSupabase:', error);

    }

    return null;

  }

}



/** Pull shared salary settings from owner snapshot (employees + owner multi-device). */

export async function pullPvzSalaryFromServer(localPvzId: string): Promise<void> {

  if (!(await getToken())) return;



  try {

    const remote = await fetchPvzSalary(localPvzId);

    if (remote.bundle) {

      await writeLocalPvzBundle(localPvzId, remote.bundle);

    }

    for (const [employeeId, settings] of Object.entries(remote.employeeSettings ?? {})) {

      await SecureStore.setItemAsync(

        `employee_salary_settings_${employeeId}`,

        JSON.stringify(settings)

      );

    }

    DataService.emitChange?.(`salary_settings_${localPvzId}`);

    DataService.emitChange?.(`salary_formulas_${localPvzId}`);

  } catch (error) {

    if (__DEV__) {

      console.warn('[Salary] pullPvzSalaryFromServer:', error);

    }

  }

}



async function listPvzStaff(localPvzId: string) {

  const users = await DataService.getUsers();

  const pvzs = await DataService.getPvzs();

  const pvz = pvzs.find((p) => p.id === localPvzId);

  if (!pvz) {

    return users.filter(

      (user) =>

        user.role !== 'owner' &&

        user.status === 'active' &&

        user.pvzId === localPvzId

    );

  }

  return users.filter(

    (user) =>

      user.role !== 'owner' && user.status === 'active' && userBelongsToPvz(user, pvz)

  );

}



export async function syncPvzSalarySettings(localPvzId: string): Promise<void> {

  const localBefore = await readLocalPvzBundle(localPvzId);

  const employeeSettingsBefore = await readLocalEmployeeSettingsMap(localPvzId);



  await pullPvzSalaryFromServer(localPvzId);



  const localAfter = await readLocalPvzBundle(localPvzId);

  const mergedBundle: PvzSalaryBundle = {

    global: localBefore.global ?? localAfter.global,

    formulas: mergeFormulas(localAfter.formulas, localBefore.formulas),

    employeeRates: mergeEmployeeRates(localBefore.employeeRates, localAfter.employeeRates),

  };

  await writeLocalPvzBundle(localPvzId, mergedBundle);



  const employeeSettingsAfter = await readLocalEmployeeSettingsMap(localPvzId);

  const mergedEmployeeSettings = { ...employeeSettingsAfter, ...employeeSettingsBefore };



  for (const [employeeId, settings] of Object.entries(mergedEmployeeSettings)) {

    await SecureStore.setItemAsync(

      `employee_salary_settings_${employeeId}`,

      JSON.stringify(settings)

    );

  }



  await pushPvzSalarySettings(localPvzId);

}



export async function pushPvzSalarySettings(localPvzId: string): Promise<void> {

  if (!(await getToken())) return;



  const bundle = await readLocalPvzBundle(localPvzId);

  const employeeSettings = await readLocalEmployeeSettingsMap(localPvzId);



  try {

    await updatePvzSalary(localPvzId, { bundle, employeeSettings });

    DataService.emitChange?.(`salary_settings_${localPvzId}`);

    DataService.emitChange?.(`salary_formulas_${localPvzId}`);

  } catch (error) {

    if (__DEV__) {

      console.warn('[Salary] pushPvzSalarySettings:', error);

    }

  }

}



/** @deprecated Use pushPvzSalarySettings */

export async function upsertPvzSalaryBundleToSupabase(

  localPvzId: string,

  bundle: PvzSalaryBundle

): Promise<boolean> {

  await writeLocalPvzBundle(localPvzId, bundle);

  await pushPvzSalarySettings(localPvzId);

  return true;

}



/** @deprecated Use pushPvzSalarySettings */

export async function upsertEmployeeSalarySettingsToSupabase(

  localPvzId: string,

  settings: EmployeeSalarySettings

): Promise<boolean> {

  await SecureStore.setItemAsync(

    `employee_salary_settings_${settings.employeeId}`,

    JSON.stringify(settings)

  );

  await pushPvzSalarySettings(localPvzId);

  return true;

}

