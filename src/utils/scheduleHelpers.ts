import { Shift } from '../types/user';

export type ScheduleAssignment = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  shiftType: 'full' | 'half_morning' | 'half_evening' | 'hourly';
  customStart?: string;
  customEnd?: string;
  status?: string;
  paymentStatus?: string;
  earnings?: number;
  pvzId?: string;
  pvzName?: string;
};

export function getScheduleAssignmentsKey(pvzId: string): string {
  return `schedule_assignments_${pvzId}`;
}

export function shiftToScheduleAssignment(shift: Shift): ScheduleAssignment {
  return {
    id: shift.id,
    employeeId: shift.employeeId,
    employeeName: shift.employeeName,
    date: shift.date,
    shiftType: shift.shiftType || 'hourly',
    customStart: shift.customStart || shift.startTime,
    customEnd: shift.customEnd || shift.endTime,
    status: shift.status,
    paymentStatus: shift.paymentStatus,
    earnings: shift.earnings,
    pvzId: shift.pvzId,
    pvzName: shift.pvzName,
  };
}

export function mergeShiftsIntoAssignments(
  assignments: ScheduleAssignment[],
  shifts: Shift[]
): { merged: ScheduleAssignment[]; changed: boolean } {
  const covered = new Set(assignments.map((a) => `${a.employeeId}_${a.date}`));
  const knownIds = new Set(assignments.map((a) => a.id));
  const merged = [...assignments];
  let changed = false;

  for (const shift of shifts) {
    const key = `${shift.employeeId}_${shift.date}`;
    if (covered.has(key) || knownIds.has(shift.id)) continue;
    merged.push(shiftToScheduleAssignment(shift));
    covered.add(key);
    knownIds.add(shift.id);
    changed = true;
  }

  return { merged, changed };
}
