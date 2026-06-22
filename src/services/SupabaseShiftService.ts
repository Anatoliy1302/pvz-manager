import { Shift } from '../types/user';

import { formatTimeFromDate, isUuid } from '../utils/supabaseHelpers';

import { getToken } from '../../lib/authSessionStore';

import * as shiftApi from '../../lib/shiftService';



function rowToShift(row: Shift): Shift {

  return row;

}



export async function fetchShiftsFromSupabase(_pvzIds?: string[]): Promise<Shift[] | null> {

  const token = await getToken();

  if (!token) return null;



  try {

    const shifts = await shiftApi.fetchShifts();

    return shifts.map(rowToShift);

  } catch (error) {

    if (__DEV__) {

      console.warn('[Shifts] fetchShiftsFromSupabase:', error);

    }

    return null;

  }

}



export async function upsertShiftToSupabase(shift: Shift): Promise<Shift | null> {

  const token = await getToken();

  if (!token) return null;



  try {

    return await shiftApi.upsertShift(shift);

  } catch (error) {

    if (__DEV__) {

      console.warn('[Shifts] upsertShiftToSupabase:', error);

    }

    return null;

  }

}



export async function deleteShiftFromSupabase(id: string): Promise<boolean> {

  const token = await getToken();

  if (!token || !isUuid(id)) return false;



  try {

    await shiftApi.deleteShift(id);

    return true;

  } catch (error) {

    if (__DEV__) {

      console.warn('[Shifts] deleteShiftFromSupabase:', error);

    }

    return false;

  }

}



export function subscribeShifts(_onChange: () => void): () => void {

  return () => undefined;

}



export { formatTimeFromDate };

