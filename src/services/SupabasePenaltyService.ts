import { supabase } from '../../lib/supabase';
import { fetchAllFromQuery } from '../../lib/supabasePagination';
import { isUuid, mergeById, resolvePvzId, resolveUserId } from '../utils/supabaseHelpers';
import { PENALTY_COLUMNS } from './supabase/selectColumns';
import { ensureSupabaseClientSession } from './SupabaseAuthService';

export interface SyncPenalty {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  reason: string;
  date: string;
  createdAt: string;
  createdBy: string;
  pvzId?: string;
}

function rowToPenalty(row: Record<string, unknown>): SyncPenalty {
  const type = row.type as string;
  const rawAmount = Number(row.amount);
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    employeeName: '',
    amount: type === 'bonus' ? -rawAmount : rawAmount,
    reason: row.reason as string,
    date: row.date as string,
    createdAt: row.created_at as string,
    createdBy: '',
    pvzId: row.pvz_id as string,
  };
}

async function penaltyToRow(penalty: SyncPenalty): Promise<Record<string, unknown> | null> {
  if (!penalty.pvzId) return null;

  const pvzId = await resolvePvzId(penalty.pvzId);
  const employeeId = await resolveUserId(penalty.employeeId);
  if (!employeeId || !isUuid(pvzId)) return null;

  const type = penalty.amount >= 0 ? 'fine' : 'bonus';
  const row: Record<string, unknown> = {
    pvz_id: pvzId,
    employee_id: employeeId,
    type,
    amount: Math.abs(penalty.amount),
    reason: penalty.reason,
    date: penalty.date,
  };

  if (penalty.id && isUuid(penalty.id)) {
    row.id = penalty.id;
  }

  return row;
}

export async function fetchPenaltiesFromSupabase(): Promise<SyncPenalty[] | null> {
  if (!(await ensureSupabaseClientSession())) return null;

  const data = await fetchAllFromQuery<Record<string, unknown>>(() =>
    supabase.from('penalties').select(PENALTY_COLUMNS).order('created_at', { ascending: false })
  );

  if (!data) {
    console.warn('fetchPenaltiesFromSupabase: paginated fetch failed');
    return null;
  }

  return data.map((row) => rowToPenalty(row));
}

export async function upsertPenaltyToSupabase(penalty: SyncPenalty): Promise<SyncPenalty | null> {
  if (!(await ensureSupabaseClientSession())) return null;

  const row = await penaltyToRow(penalty);
  if (!row) return null;

  const { data, error } = await supabase
    .from('penalties')
    .upsert(row, { onConflict: 'id' })
    .select(PENALTY_COLUMNS)
    .single();

  if (error) {
    const { data: inserted, error: insertError } = await supabase
      .from('penalties')
      .insert(row)
      .select(PENALTY_COLUMNS)
      .single();

    if (insertError) {
      console.warn('upsertPenaltyToSupabase:', insertError.message);
      return null;
    }
    const synced = rowToPenalty(inserted as Record<string, unknown>);
    return { ...penalty, ...synced, employeeName: penalty.employeeName };
  }

  const synced = rowToPenalty(data as Record<string, unknown>);
  return { ...penalty, ...synced, employeeName: penalty.employeeName };
}

export function mergePenalties(local: SyncPenalty[], remote: SyncPenalty[]): SyncPenalty[] {
  const merged = mergeById(local, remote);
  return merged.map((penalty) => {
    const localMatch = local.find((l) => l.id === penalty.id);
    if (localMatch) {
      return {
        ...penalty,
        employeeName: localMatch.employeeName || penalty.employeeName,
        createdBy: localMatch.createdBy || penalty.createdBy,
      };
    }
    return penalty;
  });
}
