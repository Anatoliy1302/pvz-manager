import { supabase } from '../../lib/supabase';
import { fetchAllFromQuery } from '../../lib/supabasePagination';
import { isUuid, mergeById, resolvePvzId, resolveUserId } from '../utils/supabaseHelpers';
import { SHIFT_REQUEST_COLUMNS } from './supabase/selectColumns';
import { ensureSupabaseClientSession } from './SupabaseAuthService';

export interface SyncShiftRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  pvzId?: string;
  pvzName?: string;
  reason?: string;
}

function rowToShiftRequest(row: Record<string, unknown>): SyncShiftRequest {
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    employeeName: row.employee_name as string,
    date: row.date as string,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    status: row.status as SyncShiftRequest['status'],
    createdAt: row.created_at as string,
    pvzId: row.pvz_id as string,
    reason: (row.reason as string) || undefined,
  };
}

async function shiftRequestToRow(
  request: SyncShiftRequest
): Promise<Record<string, unknown> | null> {
  if (!request.pvzId) return null;

  const pvzId = await resolvePvzId(request.pvzId);
  const employeeId = await resolveUserId(request.employeeId);
  if (!employeeId || !isUuid(pvzId)) return null;

  const row: Record<string, unknown> = {
    pvz_id: pvzId,
    employee_id: employeeId,
    employee_name: request.employeeName,
    date: request.date,
    start_time: request.startTime,
    end_time: request.endTime,
    status: request.status,
    reason: request.reason || null,
  };

  if (request.id && isUuid(request.id)) {
    row.id = request.id;
  }

  return row;
}

export async function fetchShiftRequestsFromSupabase(): Promise<SyncShiftRequest[] | null> {
  if (!(await ensureSupabaseClientSession())) return null;

  const data = await fetchAllFromQuery<Record<string, unknown>>(() =>
    supabase
      .from('shift_requests')
      .select(SHIFT_REQUEST_COLUMNS)
      .order('created_at', { ascending: false })
  );

  if (!data) {
    console.warn('fetchShiftRequestsFromSupabase: paginated fetch failed');
    return null;
  }

  return data.map((row) => rowToShiftRequest(row));
}

export async function upsertShiftRequestToSupabase(
  request: SyncShiftRequest
): Promise<SyncShiftRequest | null> {
  if (!(await ensureSupabaseClientSession())) return null;

  const row = await shiftRequestToRow(request);
  if (!row) return null;

  const { data, error } = await supabase
    .from('shift_requests')
    .upsert(row, { onConflict: 'id' })
    .select(SHIFT_REQUEST_COLUMNS)
    .single();

  if (error) {
    const { data: inserted, error: insertError } = await supabase
      .from('shift_requests')
      .insert(row)
      .select(SHIFT_REQUEST_COLUMNS)
      .single();

    if (insertError) {
      console.warn('upsertShiftRequestToSupabase:', insertError.message);
      return null;
    }
    return rowToShiftRequest(inserted as Record<string, unknown>);
  }

  return data ? rowToShiftRequest(data as Record<string, unknown>) : null;
}

export async function updateShiftRequestInSupabase(
  id: string,
  updates: Partial<SyncShiftRequest>
): Promise<boolean> {
  if (!(await ensureSupabaseClientSession()) || !isUuid(id)) return false;

  const row: Record<string, unknown> = {};
  if (updates.status) row.status = updates.status;
  if (updates.reason !== undefined) row.reason = updates.reason;

  const { error } = await supabase.from('shift_requests').update(row).eq('id', id);
  if (error) {
    console.warn('updateShiftRequestInSupabase:', error.message);
    return false;
  }
  return true;
}

export function mergeShiftRequests(
  local: SyncShiftRequest[],
  remote: SyncShiftRequest[]
): SyncShiftRequest[] {
  return mergeById(local, remote);
}
