import { AdvanceRequest } from '../types/payment';
import { isUuid, mergeById, resolvePvzId, resolveUserId } from '../utils/supabaseHelpers';
import { getToken } from '../../lib/authSessionStore';
import { upsertPvzAdvanceRequest } from '../../lib/pvzFinanceService';
import { generateUuidV4 } from '../utils/generateSecureId';

export async function upsertAdvanceRequestToSupabase(  request: AdvanceRequest
): Promise<AdvanceRequest | null> {
  if (!(await getToken()) || !request.pvzId) return null;

  const localPvzId = request.pvzId;
  const pvzId = await resolvePvzId(localPvzId);
  const employeeId = (await resolveUserId(request.employeeId)) || request.employeeId;

  const payload: AdvanceRequest = {
    ...request,
    id: request.id && isUuid(request.id) ? request.id : generateUuidV4(),
    pvzId,
    employeeId,
    createdAt: request.createdAt || new Date().toISOString(),
  };

  try {
    const synced = await upsertPvzAdvanceRequest(localPvzId, payload);
    return { ...synced, pvzId: localPvzId };
  } catch (error) {
    if (__DEV__) {
      console.warn('upsertAdvanceRequestToSupabase:', error);
    }
    return null;
  }
}

export function mergeAdvanceRequests(  local: AdvanceRequest[],
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
