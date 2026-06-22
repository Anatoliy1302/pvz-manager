import { apiRequest } from './apiClient';
import type { Shift } from '../src/types/user';
import type { ScheduleAssignment } from '../src/utils/scheduleHelpers';

export type PvzSchedulePayload = {
  assignments: ScheduleAssignment[];
  shifts: Shift[];
};

export async function fetchPvzSchedule(pvzId: string): Promise<PvzSchedulePayload> {
  const result = await apiRequest<PvzSchedulePayload>(
    `/api/pvz/${encodeURIComponent(pvzId)}/schedule`
  );
  return {
    assignments: result?.assignments ?? [],
    shifts: result?.shifts ?? [],
  };
}

export async function updatePvzSchedule(
  pvzId: string,
  payload: Partial<PvzSchedulePayload>
): Promise<void> {
  await apiRequest(`/api/pvz/${encodeURIComponent(pvzId)}/schedule`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
