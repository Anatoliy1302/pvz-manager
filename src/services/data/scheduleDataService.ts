import * as SecureStore from 'expo-secure-store';
import { Shift } from '../../types/user';
import { calculateTotalHours } from '../../utils/advancedPayrollCalculator';
import { calculateUnifiedShiftEarnings } from '../../utils/shiftEarnings';
import {
  getScheduleAssignmentsKey,
  mergeShiftsIntoAssignments,
  ScheduleAssignment,
} from '../../utils/scheduleHelpers';
import { generateUuid, isSamePvz } from '../../utils/supabaseHelpers';
import { dataEventBus } from './dataEventBus';
import { ShiftRequest } from './dataTypes';
import { addShift, getShifts } from './shiftDataService';
import { updateShiftRequest } from './shiftRequestDataService';

export async function getScheduleAssignments(pvzId: string): Promise<ScheduleAssignment[]> {
  const stored = await SecureStore.getItemAsync(getScheduleAssignmentsKey(pvzId));
  return stored ? JSON.parse(stored) : [];
}

export async function saveScheduleAssignments(
  pvzId: string,
  assignments: ScheduleAssignment[]
): Promise<void> {
  await SecureStore.setItemAsync(getScheduleAssignmentsKey(pvzId), JSON.stringify(assignments));
  dataEventBus.emitChange(`schedule_assignments_${pvzId}`);
}

export async function upsertScheduleAssignment(
  pvzId: string,
  assignment: ScheduleAssignment
): Promise<void> {
  const all = await getScheduleAssignments(pvzId);
  const existingIdx = all.findIndex(
    (a) =>
      a.id === assignment.id ||
      (a.employeeId === assignment.employeeId && a.date === assignment.date)
  );

  if (existingIdx !== -1) {
    all[existingIdx] = { ...all[existingIdx], ...assignment };
  } else {
    all.push(assignment);
  }

  await saveScheduleAssignments(pvzId, all);
}

export async function syncScheduleFromShifts(pvzId: string): Promise<ScheduleAssignment[]> {
  const assignments = await getScheduleAssignments(pvzId);
  const shifts = await getShifts();
  const pvzShifts: Shift[] = [];

  for (const shift of shifts) {
    if (await isSamePvz(shift.pvzId, pvzId)) {
      pvzShifts.push(shift);
    }
  }

  const { merged, changed } = mergeShiftsIntoAssignments(assignments, pvzShifts);

  if (changed) {
    await saveScheduleAssignments(pvzId, merged);
  }

  return merged;
}

export async function approveShiftRequest(request: ShiftRequest): Promise<Shift> {
  const pvzId = request.pvzId || '';
  if (!pvzId) {
    throw new Error('Не указан ПВЗ для заявки');
  }

  await updateShiftRequest(request.id, { status: 'approved' });

  const shiftId = generateUuid();
  const shiftPayload: Shift = {
    id: shiftId,
    employeeId: request.employeeId,
    employeeName: request.employeeName,
    date: request.date,
    startTime: request.startTime,
    endTime: request.endTime,
    shiftType: 'hourly',
    customStart: request.startTime,
    customEnd: request.endTime,
    status: 'planned',
    paymentStatus: 'pending',
    pvzId,
    pvzName: request.pvzName,
    totalHours: calculateTotalHours(request.startTime, request.endTime),
  };

  shiftPayload.earnings = await calculateUnifiedShiftEarnings(
    request.employeeId,
    pvzId,
    shiftPayload
  );

  await addShift(shiftPayload);

  await upsertScheduleAssignment(pvzId, {
    id: shiftId,
    employeeId: request.employeeId,
    employeeName: request.employeeName,
    date: request.date,
    shiftType: 'hourly',
    customStart: request.startTime,
    customEnd: request.endTime,
    status: 'planned',
    paymentStatus: 'pending',
    pvzId,
    pvzName: request.pvzName,
    earnings: shiftPayload.earnings,
  });

  return shiftPayload;
}
