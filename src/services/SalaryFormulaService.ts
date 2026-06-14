// src/services/SalaryFormulaService.ts
import * as SecureStore from 'expo-secure-store';
import { SalaryFormula, EmployeeSalarySettings, ShiftCalculation, ShiftStats, defaultSalaryFormula } from '../types/salary';
import { Shift, User } from '../types/user';
import {
  fetchEmployeeSalarySettingsFromSupabase,
  fetchPvzSalaryBundleFromSupabase,
  pushPvzSalarySettings,
  upsertEmployeeSalarySettingsToSupabase,
} from './SupabaseSalarySettingsService';
import { generateSecureId } from '../utils/generateSecureId';
import { safeParseJson } from '../utils/safeJson';

// ============ КЛЮЧИ ДЛЯ ХРАНЕНИЯ ============

const getFormulasKey = (pvzId: string) => `salary_formulas_${pvzId}`;
const getEmployeeSettingsKey = (employeeId: string) => `employee_salary_settings_${employeeId}`;
const getShiftCalculationsKey = (shiftId: string) => `shift_calculation_${shiftId}`;

// ============ ФОРМУЛЫ ============

/**
 * Получить все формулы ПВЗ
 */
export async function getFormulas(pvzId: string): Promise<SalaryFormula[]> {
  try {
    const stored = await SecureStore.getItemAsync(getFormulasKey(pvzId));
    let formulas = safeParseJson<SalaryFormula[]>(stored ?? '[]', []);

    const remoteBundle = await fetchPvzSalaryBundleFromSupabase(pvzId);
    if (remoteBundle?.formulas?.length) {
      const remoteIds = new Set(remoteBundle.formulas.map((formula) => formula.id));
      const localOnly = formulas.filter((formula) => !remoteIds.has(formula.id));
      formulas = [...remoteBundle.formulas, ...localOnly];
      await SecureStore.setItemAsync(getFormulasKey(pvzId), JSON.stringify(formulas));
    }
    
    if (formulas.length === 0) {
      const defaultFormula: SalaryFormula = {
        ...defaultSalaryFormula,
        id: generateSecureId(),
        pvzId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      formulas.push(defaultFormula);
      await SecureStore.setItemAsync(getFormulasKey(pvzId), JSON.stringify(formulas));
      await pushPvzSalarySettings(pvzId);
    }
    
    return formulas;
  } catch (error) {
    console.error('Ошибка загрузки формул:', error);
    return [];
  }
}

/**
 * Получить формулу по ID
 */
export async function getFormulaById(pvzId: string, formulaId: string): Promise<SalaryFormula | null> {
  const formulas = await getFormulas(pvzId);
  return formulas.find(f => f.id === formulaId) || null;
}

/**
 * Получить активную формулу ПВЗ по умолчанию
 */
export async function getDefaultFormula(pvzId: string): Promise<SalaryFormula | null> {
  const formulas = await getFormulas(pvzId);
  return formulas.find(f => f.isActive) || formulas[0] || null;
}

/**
 * Сохранить формулу
 */
export async function saveFormula(pvzId: string, formula: SalaryFormula): Promise<void> {
  const formulas = await getFormulas(pvzId);
  const index = formulas.findIndex(f => f.id === formula.id);
  
  if (index !== -1) {
    formulas[index] = { ...formula, updatedAt: new Date().toISOString() };
  } else {
    formulas.push({ ...formula, id: generateSecureId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  
  await SecureStore.setItemAsync(getFormulasKey(pvzId), JSON.stringify(formulas));
  await pushPvzSalarySettings(pvzId);
}

/**
 * Удалить формулу
 */
export async function deleteFormula(pvzId: string, formulaId: string): Promise<void> {
  const formulas = await getFormulas(pvzId);
  const filtered = formulas.filter(f => f.id !== formulaId);
  await SecureStore.setItemAsync(getFormulasKey(pvzId), JSON.stringify(filtered));
  await pushPvzSalarySettings(pvzId);
}

// ============ НАСТРОЙКИ СОТРУДНИКОВ ============

/**
 * Получить настройки сотрудника
 */
export async function getEmployeeSalarySettings(
  employeeId: string,
  pvzId?: string
): Promise<EmployeeSalarySettings | null> {
  try {
    const stored = await SecureStore.getItemAsync(getEmployeeSettingsKey(employeeId));
    const local = stored ? safeParseJson<EmployeeSalarySettings | null>(stored, null) : null;

    if (!pvzId) {
      return local;
    }

    const remote = await fetchEmployeeSalarySettingsFromSupabase(pvzId, employeeId);
    if (!remote) {
      return local;
    }

    await SecureStore.setItemAsync(getEmployeeSettingsKey(employeeId), JSON.stringify(remote));
    return remote;
  } catch (error) {
    console.error('Ошибка загрузки настроек сотрудника:', error);
    return null;
  }
}

/**
 * Сохранить настройки сотрудника
 */
export async function saveEmployeeSalarySettings(
  employeeId: string,
  settings: EmployeeSalarySettings,
  pvzId?: string
): Promise<void> {
  await SecureStore.setItemAsync(getEmployeeSettingsKey(employeeId), JSON.stringify(settings));
  if (pvzId) {
    await upsertEmployeeSalarySettingsToSupabase(pvzId, settings);
  }
}

/**
 * Получить формулу для сотрудника
 */
export async function getFormulaForEmployee(employeeId: string, pvzId: string): Promise<SalaryFormula | null> {
  const settings = await getEmployeeSalarySettings(employeeId);
  
  if (settings && settings.formulaId) {
    const formula = await getFormulaById(pvzId, settings.formulaId);
    if (formula) return formula;
  }
  
  return await getDefaultFormula(pvzId);
}

// ============ РАСЧЁТЫ СМЕН ============

/**
 * Сохранить расчёт смены
 */
export async function saveShiftCalculation(calculation: ShiftCalculation): Promise<void> {
  await SecureStore.setItemAsync(getShiftCalculationsKey(calculation.shiftId), JSON.stringify(calculation));
}

/**
 * Получить расчёт смены
 */
export async function getShiftCalculation(shiftId: string): Promise<ShiftCalculation | null> {
  try {
    const stored = await SecureStore.getItemAsync(getShiftCalculationsKey(shiftId));
    return stored ? safeParseJson<ShiftCalculation | null>(stored, null) : null;
  } catch (error) {
    console.error('Ошибка загрузки расчёта смены:', error);
    return null;
  }
}

/**
 * Получить все расчёты для зарплатной ведомости
 */
export async function getShiftCalculationsForPeriod(
  employeeId: string,
  startDate: string,
  endDate: string
): Promise<ShiftCalculation[]> {
  try {
    const shiftsRaw = await SecureStore.getItemAsync('shifts');
    const shifts = safeParseJson<Shift[]>(shiftsRaw ?? '[]', []);
    
    const employeeShifts = shifts.filter(s => 
      s.employeeId === employeeId && 
      s.date >= startDate && 
      s.date <= endDate &&
      s.status === 'completed'
    );
    
    const calculations: ShiftCalculation[] = [];
    for (const shift of employeeShifts) {
      const calc = await getShiftCalculation(shift.id);
      if (calc) {
        calculations.push(calc);
      }
    }
    
    return calculations;
  } catch (error) {
    console.error('Ошибка загрузки расчётов смен:', error);
    return [];
  }
}

/**
 * Рассчитать стаж сотрудника (в годах)
 */
export function calculateSeniorityYears(hireDate: string): number {
  const hire = new Date(hireDate);
  const now = new Date();
  let years = now.getFullYear() - hire.getFullYear();
  const monthDiff = now.getMonth() - hire.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < hire.getDate())) {
    years--;
  }
  
  return Math.max(0, years);
}