import { Shift } from '../types/user';
import { t } from '../i18n';
import DataService from '../services/DataService';
import {
  calculateEmployeeAccruals,
  syncShiftStatusesInStorage,
} from '../services/PaymentService';
import { getShiftStatus, isShiftCountableForAccruals } from './shiftStatusHelper';
import { toDateKey } from './dateHelpers';
import {
  calculateShiftEarningsForEmployee,
  getEmployeeShiftRates,
} from './salaryRateHelpers';

export type ShiftDisplayStatus = 'completed' | 'paid' | 'planned' | 'active';

type ShiftHoursInput = {
  totalHours?: number;
  duration?: number;
  startTime?: string;
  endTime?: string;
};

export function calcShiftHours(shift: ShiftHoursInput): number {
  if (shift.totalHours) return shift.totalHours;
  if (shift.duration) return Number(shift.duration) / 3600;
  if (shift.startTime && shift.endTime) {
    const [startH, startM] = shift.startTime.split(':').map(Number);
    const [endH, endM] = shift.endTime.split(':').map(Number);
    let h = endH - startH;
    let m = endM - startM;
    if (m < 0) {
      h--;
      m += 60;
    }
    if (h < 0) h += 24;
    return h + m / 60;
  }
  return 12;
}

export function getMonthPeriod(date: Date): { periodStart: string; periodEnd: string } {
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    periodStart: toDateKey(new Date(year, month, 1)),
    periodEnd: toDateKey(new Date(year, month + 1, 0)),
  };
}

export function getShiftDisplayStatus(shift: Shift): ShiftDisplayStatus {
  return getShiftStatus(shift).status;
}

export function getShiftStatusLabel(status: ShiftDisplayStatus): string {
  switch (status) {
    case 'completed':
      return t('common.shiftStatus.completed');
    case 'paid':
      return t('common.shiftStatus.paidLabel');
    case 'planned':
      return t('common.shiftStatus.planned');
    case 'active':
      return t('common.shiftStatus.active');
    default:
      return '';
  }
}

export interface DayShiftStat {
  date: string;
  hours: number;
  earnings: number;
  shiftCount: number;
}

export interface PlannedShiftStat {
  id: string;
  date: string;
  hours: number;
  status: ShiftDisplayStatus;
  startTime?: string;
  endTime?: string;
}

export interface EmployeeMonthStats {
  totalEarned: number;
  shiftsEarned: number;
  totalFines: number;
  totalBonuses: number;
  totalShifts: number;
  totalHours: number;
  daysWorked: number;
  avgHoursPerShift: number;
  bestDayEarned: number;
  bestDayDate: string;
  completedDays: DayShiftStat[];
  plannedShifts: PlannedShiftStat[];
}

function filterEmployeePeriodShifts(
  shifts: Shift[],
  employeeId: string,
  pvzId: string,
  periodStart: string,
  periodEnd: string
): Shift[] {
  return shifts.filter((s) => {
    if (s.employeeId !== employeeId) return false;
    if (pvzId && s.pvzId && s.pvzId !== pvzId) return false;
    if (s.date < periodStart || s.date > periodEnd) return false;
    return true;
  });
}

export function getPeriodBounds(
  startDate: Date,
  endDate: Date
): { periodStart: string; periodEnd: string } {
  const start = toDateKey(startDate);
  const end = toDateKey(endDate);
  return start <= end
    ? { periodStart: start, periodEnd: end }
    : { periodStart: end, periodEnd: start };
}

export function formatMoney(amount: number): string {
  return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
}

export interface TimesheetShiftRow {
  id: string;
  date: string;
  hours: number;
  earnings: number;
  status: ShiftDisplayStatus;
  startTime?: string;
  endTime?: string;
}

export interface EmployeeTimesheetData {
  periodStart: string;
  periodEnd: string;
  plannedHours: number;
  actualHours: number;
  plannedSalary: number;
  actualSalary: number;
  fines: number;
  bonuses: number;
  netEarned: number;
  fullShiftRate: number;
  halfShiftRate: number;
  hourlyRate: number;
  completedShifts: TimesheetShiftRow[];
  plannedShifts: TimesheetShiftRow[];
}

export async function loadEmployeeTimesheet(
  employeeId: string,
  pvzId: string,
  startDate: Date,
  endDate: Date
): Promise<EmployeeTimesheetData> {
  await syncShiftStatusesInStorage();

  const { periodStart, periodEnd } = getPeriodBounds(startDate, endDate);
  const allShifts = await DataService.getShifts();
  const periodShifts = filterEmployeePeriodShifts(
    allShifts,
    employeeId,
    pvzId,
    periodStart,
    periodEnd
  );

  const rates = await getEmployeeShiftRates(employeeId, pvzId);
  const plannedOnly = periodShifts.filter((s) => !isShiftCountableForAccruals(s));
  const actualShifts = periodShifts.filter(isShiftCountableForAccruals);

  let plannedHours = 0;
  let plannedSalary = 0;
  const plannedRows: TimesheetShiftRow[] = [];

  for (const shift of plannedOnly) {
    const hours = calcShiftHours(shift);
    let earnings = shift.earnings;
    if (!earnings) {
      earnings = await calculateShiftEarningsForEmployee(employeeId, pvzId, shift);
    }
    plannedHours += hours;
    plannedSalary += earnings || 0;
    plannedRows.push({
      id: shift.id,
      date: shift.date,
      hours,
      earnings: earnings || 0,
      status: getShiftDisplayStatus(shift),
      startTime: shift.startTime,
      endTime: shift.endTime,
    });
  }

  const accruals = await calculateEmployeeAccruals(employeeId, pvzId, {
    periodStart,
    periodEnd,
  });

  let actualHours = 0;
  const completedRows: TimesheetShiftRow[] = [];

  actualShifts.forEach((shift) => {
    const hours = calcShiftHours(shift);
    actualHours += hours;
    completedRows.push({
      id: shift.id,
      date: shift.date,
      hours,
      earnings: shift.earnings || 0,
      status: getShiftDisplayStatus(shift),
      startTime: shift.startTime,
      endTime: shift.endTime,
    });
  });

  completedRows.sort((a, b) => a.date.localeCompare(b.date));
  plannedRows.sort((a, b) => a.date.localeCompare(b.date));

  return {
    periodStart,
    periodEnd,
    plannedHours: Math.round(plannedHours * 10) / 10,
    actualHours: Math.round(actualHours * 10) / 10,
    plannedSalary: Math.round(plannedSalary),
    actualSalary: accruals.shiftsEarned,
    fines: accruals.totalFines,
    bonuses: accruals.totalBonuses,
    netEarned: accruals.netEarned,
    fullShiftRate: rates.fullShiftRate,
    halfShiftRate: rates.halfShiftRate,
    hourlyRate: Math.round(rates.hourlyRate),
    completedShifts: completedRows,
    plannedShifts: plannedRows,
  };
}

export async function loadEmployeeMonthStats(
  employeeId: string,
  pvzId: string,
  month: Date
): Promise<EmployeeMonthStats> {
  await syncShiftStatusesInStorage();

  const { periodStart, periodEnd } = getMonthPeriod(month);
  const allShifts = await DataService.getShifts();
  const monthShifts = filterEmployeePeriodShifts(
    allShifts,
    employeeId,
    pvzId,
    periodStart,
    periodEnd
  );

  const countableShifts = monthShifts.filter(isShiftCountableForAccruals);
  const plannedShifts = monthShifts
    .filter((s) => !isShiftCountableForAccruals(s))
    .map((s) => ({
      id: s.id,
      date: s.date,
      hours: calcShiftHours(s),
      status: getShiftDisplayStatus(s),
      startTime: s.startTime,
      endTime: s.endTime,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const accruals = await calculateEmployeeAccruals(employeeId, pvzId, {
    periodStart,
    periodEnd,
  });

  const shiftsByDay: Record<string, DayShiftStat> = {};
  countableShifts.forEach((shift) => {
    if (!shiftsByDay[shift.date]) {
      shiftsByDay[shift.date] = {
        date: shift.date,
        hours: 0,
        earnings: 0,
        shiftCount: 0,
      };
    }
    shiftsByDay[shift.date].hours += calcShiftHours(shift);
    shiftsByDay[shift.date].earnings += shift.earnings || 0;
    shiftsByDay[shift.date].shiftCount += 1;
  });

  const completedDays = Object.values(shiftsByDay).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const totalHours = countableShifts.reduce((sum, s) => sum + calcShiftHours(s), 0);
  const totalShifts = countableShifts.length;
  const daysWorked = completedDays.length;
  const avgHoursPerShift = totalShifts > 0 ? totalHours / totalShifts : 0;

  let bestDay = { date: '', earnings: 0 };
  completedDays.forEach((day) => {
    if (day.earnings > bestDay.earnings) {
      bestDay = { date: day.date, earnings: day.earnings };
    }
  });

  return {
    totalEarned: accruals.netEarned,
    shiftsEarned: accruals.shiftsEarned,
    totalFines: accruals.totalFines,
    totalBonuses: accruals.totalBonuses,
    totalShifts,
    totalHours: Math.round(totalHours * 10) / 10,
    daysWorked,
    avgHoursPerShift: Math.round(avgHoursPerShift * 10) / 10,
    bestDayEarned: bestDay.earnings,
    bestDayDate: bestDay.date
      ? new Date(bestDay.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
      : '—',
    completedDays,
    plannedShifts,
  };
}
