import { isUuid, mergeById, resolvePvzId, resolveUserId } from '../utils/supabaseHelpers';
import { getToken } from '../../lib/authSessionStore';
import {
  readSnapshotArray,
  upsertSnapshotItem,
  updateSnapshotItem,
} from '../../lib/snapshotSync';
import { generateSecureId } from '../utils/generateSecureId';

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

const SNAPSHOT_KEY = 'shift_requests';

export async function fetchShiftRequestsFromSupabase(): Promise<SyncShiftRequest[] | null> {
  if (!(await getToken())) return null;
  try {
    return await readSnapshotArray<SyncShiftRequest>(SNAPSHOT_KEY);
  } catch (error) {
    if (__DEV__) {
      console.warn('fetchShiftRequestsFromSupabase:', error);
    }
    return null;
  }
}

export async function upsertShiftRequestToSupabase(
  request: SyncShiftRequest
): Promise<SyncShiftRequest | null> {
  if (!(await getToken()) || !request.pvzId) return null;

  const pvzId = await resolvePvzId(request.pvzId);
  const employeeId = await resolveUserId(request.employeeId);
  if (!employeeId || !isUuid(pvzId)) return null;

  const payload: SyncShiftRequest = {
    ...request,
    id: request.id && isUuid(request.id) ? request.id : generateSecureId(),
    pvzId,
    employeeId,
    createdAt: request.createdAt || new Date().toISOString(),
  };

  try {
    return await upsertSnapshotItem(SNAPSHOT_KEY, payload);
  } catch (error) {
    if (__DEV__) {
      console.warn('upsertShiftRequestToSupabase:', error);
    }
    return null;
  }
}

export async function updateShiftRequestInSupabase(
  id: string,
  updates: Partial<SyncShiftRequest>
): Promise<boolean> {
  if (!(await getToken()) || !isUuid(id)) return false;
  try {
    return await updateSnapshotItem<SyncShiftRequest>(SNAPSHOT_KEY, id, updates);
  } catch (error) {
    if (__DEV__) {
      console.warn('updateShiftRequestInSupabase:', error);
    }
    return false;
  }
}

export function mergeShiftRequests(
  local: SyncShiftRequest[],
  remote: SyncShiftRequest[]
): SyncShiftRequest[] {
  return mergeById(local, remote);
}
