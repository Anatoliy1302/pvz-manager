import DataService from '../DataService';
import { Shift } from '../../types/user';

export async function fetchShiftsList(pvzId?: string): Promise<Shift[]> {
  const shifts = await DataService.getShiftsLocal();
  if (!pvzId) return shifts;
  return shifts.filter((s) => s.pvzId === pvzId);
}

/** Принудительная синхронизация смен из Supabase (pull-to-refresh). */
export async function fetchShiftsFromSupabase(pvzId?: string): Promise<Shift[]> {
  const shifts = await DataService.refreshShiftsCache();
  if (!pvzId) return shifts;
  return shifts.filter((s) => s.pvzId === pvzId);
}
