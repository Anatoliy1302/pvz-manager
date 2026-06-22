import { mergeById, resolvePvzId, resolveUserId, isUuid } from '../utils/supabaseHelpers';
import { getToken } from '../../lib/authSessionStore';
import { upsertPvzPenalty, deletePvzPenalty } from '../../lib/pvzFinanceService';
import { generateUuidV4 } from '../utils/generateSecureId';
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

export async function upsertPenaltyToSupabase(penalty: SyncPenalty): Promise<SyncPenalty | null> {
  if (!(await getToken()) || !penalty.pvzId) return null;

  const localPvzId = penalty.pvzId;
  const pvzId = await resolvePvzId(localPvzId);
  const employeeId = (await resolveUserId(penalty.employeeId)) || penalty.employeeId;

  const payload: SyncPenalty = {
    ...penalty,
    id: penalty.id && isUuid(penalty.id) ? penalty.id : generateUuidV4(),
    pvzId,
    employeeId,
    createdAt: penalty.createdAt || new Date().toISOString(),
  };

  try {
    return await upsertPvzPenalty(localPvzId, payload);
  } catch (error) {
    if (__DEV__) {
      console.warn('upsertPenaltyToSupabase:', error);
    }
    return null;
  }
}

export async function deletePenaltyFromSupabase(
  localPvzId: string,
  penaltyId: string
): Promise<boolean> {
  if (!(await getToken()) || !penaltyId) return false;
  try {
    await deletePvzPenalty(localPvzId, penaltyId);
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('deletePenaltyFromSupabase:', error);
    }
    return false;
  }
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
