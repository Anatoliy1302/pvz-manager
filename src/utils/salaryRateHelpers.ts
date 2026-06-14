import * as SecureStore from 'expo-secure-store';
import DataService from '../services/DataService';
import { calculateTotalHours } from './advancedPayrollCalculator';
import { safeParseJson } from './safeJson';

export const DEFAULT_FULL_SHIFT_RATE = 3000;

export interface PvzWorkHours {
  workStart: string;
  workEnd: string;
  totalHours: number;
}

export interface ShiftRates {
  fullShiftRate: number;
  halfShiftRate: number;
  hourlyRate: number;
  isCustom: boolean;
  totalHours: number;
  workStart: string;
  workEnd: string;
}

export type ShiftTypeForEarnings = 'full' | 'half_morning' | 'half_evening' | 'hourly';

export function calcPvzTotalHours(workStart: string, workEnd: string): number {
  return calculateTotalHours(workStart, workEnd);
}

export async function getPvzWorkHours(pvzId: string): Promise<PvzWorkHours> {
  const pvz = await DataService.getPvzById(pvzId);
  const workStart = pvz?.workStart || '09:00';
  const workEnd = pvz?.workEnd || '21:00';
  return {
    workStart,
    workEnd,
    totalHours: calcPvzTotalHours(workStart, workEnd),
  };
}

export async function getGlobalFullShiftRate(pvzId: string): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(`global_salary_settings_${pvzId}`);
    if (raw) {
      const global = safeParseJson<{ fullShiftRate?: number }>(raw, {});
      return global.fullShiftRate || DEFAULT_FULL_SHIFT_RATE;
    }
  } catch (error) {
    console.error('Ошибка загрузки общей ставки:', error);
  }
  return DEFAULT_FULL_SHIFT_RATE;
}

export function buildRatesFromFullShift(
  fullShiftRate: number,
  totalHours: number
): Pick<ShiftRates, 'fullShiftRate' | 'halfShiftRate' | 'hourlyRate'> {
  const safeHours = totalHours > 0 ? totalHours : 12;
  return {
    fullShiftRate,
    halfShiftRate: fullShiftRate / 2,
    hourlyRate: fullShiftRate / safeHours,
  };
}

export async function getEmployeeShiftRates(
  employeeId: string,
  pvzId: string
): Promise<ShiftRates> {
  const { workStart, workEnd, totalHours } = await getPvzWorkHours(pvzId);
  const globalFull = await getGlobalFullShiftRate(pvzId);

  let customFull: number | undefined;
  try {
    const individualRaw = await SecureStore.getItemAsync(`salary_settings_${pvzId}`);
    if (individualRaw) {
      const individual = safeParseJson<Record<string, { fullShiftRate?: number }>>(individualRaw, {});
      customFull = individual[employeeId]?.fullShiftRate;
    }
  } catch (error) {
    console.error('Ошибка загрузки индивидуальной ставки:', error);
  }

  const fullShiftRate = customFull ?? globalFull;
  const rates = buildRatesFromFullShift(fullShiftRate, totalHours);

  return {
    ...rates,
    isCustom: customFull !== undefined,
    totalHours,
    workStart,
    workEnd,
  };
}

export function calculateEarningsByShiftType(
  shiftType: ShiftTypeForEarnings,
  rates: Pick<ShiftRates, 'fullShiftRate' | 'halfShiftRate' | 'hourlyRate'>,
  options?: { customStart?: string; customEnd?: string }
): number {
  if (shiftType === 'full') {
    return Math.round(rates.fullShiftRate);
  }
  if (shiftType === 'half_morning' || shiftType === 'half_evening') {
    return Math.round(rates.halfShiftRate);
  }
  if (shiftType === 'hourly' && options?.customStart && options?.customEnd) {
    const hours = calculateTotalHours(options.customStart, options.customEnd);
    return Math.round(hours * rates.hourlyRate);
  }
  return 0;
}

export async function calculateSimpleShiftEarnings(
  employeeId: string,
  pvzId: string,
  shift: {
    shiftType?: string;
    startTime?: string;
    endTime?: string;
    customStart?: string;
    customEnd?: string;
  }
): Promise<number> {
  const rates = await getEmployeeShiftRates(employeeId, pvzId);
  const shiftType = (shift.shiftType || 'full') as ShiftTypeForEarnings;

  if (shiftType === 'hourly') {
    const start = shift.customStart || shift.startTime;
    const end = shift.customEnd || shift.endTime;
    if (start && end) {
      return calculateEarningsByShiftType('hourly', rates, { customStart: start, customEnd: end });
    }
    return 0;
  }

  return calculateEarningsByShiftType(shiftType, rates);
}

export async function calculateShiftEarningsForEmployee(
  employeeId: string,
  pvzId: string,
  shift: {
    shiftType?: string;
    startTime?: string;
    endTime?: string;
    customStart?: string;
    customEnd?: string;
  }
): Promise<number> {
  const { calculateUnifiedShiftEarnings } = await import('./shiftEarnings');
  return calculateUnifiedShiftEarnings(employeeId, pvzId, shift as import('../types/user').Shift);
}
