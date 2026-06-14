import * as SecureStore from 'expo-secure-store';
import { dataEventBus } from './dataEventBus';
import { Correction, Overtime } from './dataTypes';
import { getShiftsHistory } from './shiftDataService';
import { safeParseJson } from '../../utils/safeJson';

export async function getCorrections(employeeId: string): Promise<Correction[]> {
  const stored = await SecureStore.getItemAsync(`corrections_${employeeId}`);
  return safeParseJson<Correction[]>(stored ?? '[]', []);
}

export async function addCorrection(employeeId: string, correction: Correction): Promise<void> {
  const corrections = await getCorrections(employeeId);
  corrections.push(correction);
  await SecureStore.setItemAsync(`corrections_${employeeId}`, JSON.stringify(corrections));
  dataEventBus.notify(`corrections_${employeeId}`);
}

export async function getOvertimes(employeeId: string): Promise<Overtime[]> {
  const stored = await SecureStore.getItemAsync(`overtime_${employeeId}`);
  return safeParseJson<Overtime[]>(stored ?? '[]', []);
}

export async function addOvertime(employeeId: string, overtime: Overtime): Promise<void> {
  const overtimes = await getOvertimes(employeeId);
  overtimes.push(overtime);
  await SecureStore.setItemAsync(`overtime_${employeeId}`, JSON.stringify(overtimes));
  dataEventBus.notify(`overtime_${employeeId}`);
}

export async function updateOvertime(
  employeeId: string,
  id: string,
  status: 'approved' | 'rejected'
): Promise<void> {
  const overtimes = await getOvertimes(employeeId);
  const index = overtimes.findIndex((o) => o.id === id);

  if (index !== -1) {
    overtimes[index].status = status;
    await SecureStore.setItemAsync(`overtime_${employeeId}`, JSON.stringify(overtimes));
    dataEventBus.notify(`overtime_${employeeId}`);
  }
}

export async function calculateEmployeeStats(employeeId: string, startDate: string, endDate: string) {
  const history = await getShiftsHistory(employeeId);
  const periodShifts = history.filter((s: any) => s.date >= startDate && s.date <= endDate);

  const totalHours = periodShifts.reduce((sum: number, s: any) => sum + (s.duration || 0), 0) / 3600;
  const totalEarned = periodShifts.reduce((sum: number, s: any) => sum + (s.earnings || 0), 0);
  const totalShifts = periodShifts.length;

  return {
    totalHours: Math.round(totalHours * 10) / 10,
    totalEarned,
    totalShifts,
    daysWorked: new Set(periodShifts.map((s: any) => s.date)).size,
  };
}

export async function getItemAsync(key: string): Promise<string | null> {
  return await SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function clearAllData(): Promise<void> {
  const keys = [
    'pvz_list',
    'pvz_users',
    'pending_employees',
    'shifts',
    'shifts_history',
    'active_shift',
    'all_shift_requests',
    'notifications',
    'user',
    'pvz',
    'all_invitations',
  ];

  for (const key of keys) {
    await SecureStore.deleteItemAsync(key);
  }

  dataEventBus.clear();
}
