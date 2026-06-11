import { supabase } from '../../lib/supabase';
import { Shift } from '../types/user';
import { formatTimeFromDate, isUuid, resolvePvzId } from '../utils/supabaseHelpers';
import { hasSupabaseSession } from './SupabaseAuthService';

function rowToShift(row: Record<string, unknown>): Shift {
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    employeeName: row.employee_name as string,
    date: row.date as string,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    status: row.status as Shift['status'],
    paymentStatus: (row.payment_status as Shift['paymentStatus']) || 'pending',
    shiftType: row.shift_type as Shift['shiftType'],
    totalHours: row.total_hours != null ? Number(row.total_hours) : undefined,
    earnings: row.earnings != null ? Number(row.earnings) : undefined,
    pvzId: row.pvz_id as string,
  };
}

async function shiftToRow(shift: Shift): Promise<Record<string, unknown>> {
  const pvzId = shift.pvzId ? await resolvePvzId(shift.pvzId) : undefined;
  const row: Record<string, unknown> = {
    pvz_id: pvzId,
    employee_id: shift.employeeId,
    employee_name: shift.employeeName,
    date: shift.date,
    start_time: shift.startTime,
    end_time: shift.endTime,
    status: shift.status || 'planned',
    shift_type: shift.shiftType || null,
    total_hours: shift.totalHours ?? null,
    earnings: shift.earnings ?? null,
    payment_status: shift.paymentStatus || 'pending',
    updated_at: new Date().toISOString(),
  };

  if (shift.id && isUuid(shift.id)) {
    row.id = shift.id;
  }

  return row;
}

export async function fetchShiftsFromSupabase(): Promise<Shift[] | null> {
  if (!(await hasSupabaseSession())) return null;

  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .order('date', { ascending: true });

  if (error) {
    console.warn('fetchShiftsFromSupabase:', error.message);
    return null;
  }

  return (data || []).map((row) => rowToShift(row as Record<string, unknown>));
}

export async function upsertShiftToSupabase(shift: Shift): Promise<Shift | null> {
  if (!(await hasSupabaseSession())) return null;

  const row = await shiftToRow(shift);
  const { data, error } = await supabase
    .from('shifts')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    const { data: inserted, error: insertError } = await supabase
      .from('shifts')
      .insert(row)
      .select('*')
      .single();

    if (insertError) {
      console.warn('upsertShiftToSupabase:', insertError.message);
      return null;
    }
    return rowToShift(inserted as Record<string, unknown>);
  }

  return data ? rowToShift(data as Record<string, unknown>) : null;
}

export async function deleteShiftFromSupabase(id: string): Promise<boolean> {
  if (!(await hasSupabaseSession()) || !isUuid(id)) return false;

  const { error } = await supabase.from('shifts').delete().eq('id', id);
  if (error) {
    console.warn('deleteShiftFromSupabase:', error.message);
    return false;
  }
  return true;
}

export function subscribeShifts(onChange: () => void): () => void {
  const channel = supabase
    .channel('shifts-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
      onChange();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export { formatTimeFromDate };
