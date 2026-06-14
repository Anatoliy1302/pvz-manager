import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../lib/supabase';
import { SalaryFormula, EmployeeSalarySettings } from '../types/salary';
import { isUuid, mergeById, resolvePvzId, resolveUserId } from '../utils/supabaseHelpers';
import { hasSupabaseSession } from './SupabaseAuthService';
import DataService from './DataService';
import { safeParseJson } from '../utils/safeJson';

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
  return { ...local, ...remote };
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
  if (bundle.formulas.length > 0) {
    await SecureStore.setItemAsync(
      `salary_formulas_${localPvzId}`,
      JSON.stringify(bundle.formulas)
    );
  }
  await SecureStore.setItemAsync(
    `salary_settings_${localPvzId}`,
    JSON.stringify(bundle.employeeRates)
  );
}

export async function fetchPvzSalaryBundleFromSupabase(
  localPvzId: string
): Promise<PvzSalaryBundle | null> {
  if (!(await hasSupabaseSession())) return null;

  const pvzId = await resolvePvzId(localPvzId);
  if (!isUuid(pvzId)) return null;

  const { data, error } = await supabase
    .from('global_salary_settings')
    .select('settings')
    .eq('pvz_id', pvzId)
    .maybeSingle();

  if (error) {
    console.warn('fetchPvzSalaryBundleFromSupabase:', error.message);
    return null;
  }

  if (!data?.settings) return null;

  const settings = data.settings as Record<string, unknown>;
  return {
    global: (settings.global as Record<string, unknown>) || null,
    formulas: (settings.formulas as SalaryFormula[]) || [],
    employeeRates: (settings.employeeRates as Record<string, Record<string, unknown>>) || {},
  };
}

export async function upsertPvzSalaryBundleToSupabase(
  localPvzId: string,
  bundle: PvzSalaryBundle
): Promise<boolean> {
  if (!(await hasSupabaseSession())) return false;

  const pvzId = await resolvePvzId(localPvzId);
  if (!isUuid(pvzId)) return false;

  const { error } = await supabase.from('global_salary_settings').upsert(
    {
      pvz_id: pvzId,
      settings: bundle,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'pvz_id' }
  );

  if (error) {
    console.warn('upsertPvzSalaryBundleToSupabase:', error.message);
    return false;
  }
  return true;
}

export async function fetchEmployeeSalarySettingsFromSupabase(
  localPvzId: string,
  employeeId: string
): Promise<EmployeeSalarySettings | null> {
  if (!(await hasSupabaseSession())) return null;

  const pvzId = await resolvePvzId(localPvzId);
  const resolvedEmployeeId = await resolveUserId(employeeId);
  if (!isUuid(pvzId) || !resolvedEmployeeId) return null;

  const { data, error } = await supabase
    .from('employee_salary_settings')
    .select('settings')
    .eq('pvz_id', pvzId)
    .eq('employee_id', resolvedEmployeeId)
    .maybeSingle();

  if (error) {
    console.warn('fetchEmployeeSalarySettingsFromSupabase:', error.message);
    return null;
  }

  return data?.settings ? (data.settings as EmployeeSalarySettings) : null;
}

export async function upsertEmployeeSalarySettingsToSupabase(
  localPvzId: string,
  settings: EmployeeSalarySettings
): Promise<boolean> {
  if (!(await hasSupabaseSession())) return false;

  const pvzId = await resolvePvzId(localPvzId);
  const employeeId = await resolveUserId(settings.employeeId);
  if (!isUuid(pvzId) || !employeeId) return false;

  const { error } = await supabase.from('employee_salary_settings').upsert(
    {
      pvz_id: pvzId,
      employee_id: employeeId,
      settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'pvz_id,employee_id' }
  );

  if (error) {
    console.warn('upsertEmployeeSalarySettingsToSupabase:', error.message);
    return false;
  }
  return true;
}

export async function syncPvzSalarySettings(localPvzId: string): Promise<void> {
  const localBundle = await readLocalPvzBundle(localPvzId);
  await upsertPvzSalaryBundleToSupabase(localPvzId, localBundle);

  const remoteBundle = await fetchPvzSalaryBundleFromSupabase(localPvzId);
  if (remoteBundle) {
    const merged: PvzSalaryBundle = {
      global: remoteBundle.global || localBundle.global,
      formulas: mergeFormulas(localBundle.formulas, remoteBundle.formulas),
      employeeRates: mergeEmployeeRates(localBundle.employeeRates, remoteBundle.employeeRates),
    };
    await writeLocalPvzBundle(localPvzId, merged);
  }

  const users = await DataService.getUsers();
  const employees = users.filter(
    (user) => user.pvzId === localPvzId && user.role === 'employee' && user.status === 'active'
  );

  for (const employee of employees) {
    const key = `employee_salary_settings_${employee.id}`;
    const stored = await SecureStore.getItemAsync(key);
    const localSettings = stored ? safeParseJson<EmployeeSalarySettings | null>(stored, null) : null;

    if (localSettings) {
      await upsertEmployeeSalarySettingsToSupabase(localPvzId, localSettings);
    }

    const remoteSettings = await fetchEmployeeSalarySettingsFromSupabase(
      localPvzId,
      employee.id
    );
    if (remoteSettings) {
      await SecureStore.setItemAsync(key, JSON.stringify(remoteSettings));
    }
  }
}

export async function pushPvzSalarySettings(localPvzId: string): Promise<void> {
  const bundle = await readLocalPvzBundle(localPvzId);
  await upsertPvzSalaryBundleToSupabase(localPvzId, bundle);
}
