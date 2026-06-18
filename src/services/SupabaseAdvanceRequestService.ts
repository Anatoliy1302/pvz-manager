import { supabase } from '../../lib/supabase';
import { fetchAllFromQuery } from '../../lib/supabasePagination';
import { AdvanceRequest } from '../types/payment';
import { isUuid, mergeById, resolvePvzId, resolveUserId } from '../utils/supabaseHelpers';
import { ADVANCE_REQUEST_COLUMNS } from './supabase/selectColumns';
import { ensureSupabaseClientSession } from './SupabaseAuthService';

function rowToAdvanceRequest(row: Record<string, unknown>): AdvanceRequest {
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    employeeName: row.employee_name as string,
    amount: Number(row.amount),
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    reason: (row.reason as string) || undefined,
    status: row.status as AdvanceRequest['status'],
    createdAt: row.created_at as string,
    reviewedAt: (row.reviewed_at as string) || undefined,
    reviewedBy: (row.reviewed_by as string) || undefined,
    reviewedByName: (row.reviewed_by_name as string) || undefined,
    pvzId: row.pvz_id as string,
  };
}

async function advanceRequestToRow(
  request: AdvanceRequest
): Promise<Record<string, unknown> | null> {
  const pvzId = await resolvePvzId(request.pvzId);
  const employeeId = await resolveUserId(request.employeeId);
  if (!employeeId || !isUuid(pvzId)) return null;

  const row: Record<string, unknown> = {
    pvz_id: pvzId,
    employee_id: employeeId,
    employee_name: request.employeeName,
    amount: request.amount,
    period_start: request.periodStart,
    period_end: request.periodEnd,
    reason: request.reason || null,
    status: request.status,
    reviewed_at: request.reviewedAt || null,
    reviewed_by: request.reviewedBy ? await resolveUserId(request.reviewedBy) : null,
    reviewed_by_name: request.reviewedByName || null,
  };

  if (request.id && isUuid(request.id)) {
    row.id = request.id;
  }

  return row;
}

export async function fetchAdvanceRequestsFromSupabase(): Promise<AdvanceRequest[] | null> {
  if (!(await ensureSupabaseClientSession())) return null;

  const data = await fetchAllFromQuery<Record<string, unknown>>(() =>
    supabase
      .from('advance_requests')
      .select(ADVANCE_REQUEST_COLUMNS)
      .order('created_at', { ascending: false })
  );

  if (!data) {
    console.warn('fetchAdvanceRequestsFromSupabase: paginated fetch failed');
    return null;
  }

  return data.map((row) => rowToAdvanceRequest(row));
}

export async function upsertAdvanceRequestToSupabase(
  request: AdvanceRequest
): Promise<AdvanceRequest | null> {
  if (!(await ensureSupabaseClientSession())) return null;

  const row = await advanceRequestToRow(request);
  if (!row) return null;

  const { data, error } = await supabase
    .from('advance_requests')
    .upsert(row, { onConflict: 'id' })
    .select(ADVANCE_REQUEST_COLUMNS)
    .single();

  if (error) {
    const { data: inserted, error: insertError } = await supabase
      .from('advance_requests')
      .insert(row)
      .select(ADVANCE_REQUEST_COLUMNS)
      .single();

    if (insertError) {
      console.warn('upsertAdvanceRequestToSupabase:', insertError.message);
      return null;
    }
    const synced = rowToAdvanceRequest(inserted as Record<string, unknown>);
    return { ...request, ...synced, employeeName: request.employeeName };
  }

  const synced = rowToAdvanceRequest(data as Record<string, unknown>);
  return { ...request, ...synced, employeeName: request.employeeName };
}

export async function updateAdvanceRequestInSupabase(
  id: string,
  updates: Partial<AdvanceRequest>
): Promise<boolean> {
  if (!(await ensureSupabaseClientSession()) || !isUuid(id)) return false;

  const row: Record<string, unknown> = {};
  if (updates.status) row.status = updates.status;
  if (updates.reviewedAt) row.reviewed_at = updates.reviewedAt;
  if (updates.reviewedBy) row.reviewed_by = await resolveUserId(updates.reviewedBy);
  if (updates.reviewedByName) row.reviewed_by_name = updates.reviewedByName;

  const { error } = await supabase.from('advance_requests').update(row).eq('id', id);
  if (error) {
    console.warn('updateAdvanceRequestInSupabase:', error.message);
    return false;
  }
  return true;
}

export function mergeAdvanceRequests(
  local: AdvanceRequest[],
  remote: AdvanceRequest[]
): AdvanceRequest[] {
  const merged = mergeById(local, remote);
  return merged.map((request) => {
    const localMatch = local.find((item) => item.id === request.id);
    if (localMatch?.employeeName) {
      return {
        ...request,
        employeeName: localMatch.employeeName,
        reviewedByName: localMatch.reviewedByName || request.reviewedByName,
      };
    }
    return request;
  });
}
