// src/utils/advancedPayrollCalculator.ts
import StorageService from '../services/StorageService';
import { SecureStoreKeys, dynamicSecureStoreKey } from '../constants/secureStoreKeys';
import { Shift, User } from '../types/user';
import DataService from '../services/DataService';
import { SalaryFormula, ShiftCalculation, ShiftStats, EmployeeSalarySettings } from '../types/salary';
import { getFormulaForEmployee, getEmployeeSalarySettings, saveShiftCalculation } from '../services/SalaryFormulaService';
import {
  calculateBaseEarningsForFormula,
  calculateGoodsBonusAmount,
  calculateTotalHours,
} from './salaryFormulaHelpers';
import { generateSecureId } from './generateSecureId';
import { safeParseJson } from './safeJson';
import { isShiftPastScheduledEnd } from './shiftStatusHelper';
import { calculateUnifiedShiftEarnings } from './shiftEarnings';

export { calculateTotalHours };

async function getShiftCalculationLocal(shiftId: string): Promise<ShiftCalculation | null> {
  try {
    const stored = await StorageService.getItem(dynamicSecureStoreKey.shiftCalculation(shiftId));
    return stored ? safeParseJson<ShiftCalculation | null>(stored, null) : null;
  } catch (error) {
    console.error('Ошибка загрузки расчёта смены:', error);
    return null;
  }
}

function calculateSeniorityYearsLocal(hireDate?: string): number {
  if (!hireDate) return 0;
  try {
    const hire = new Date(hireDate);
    const now = new Date();
    let years = now.getFullYear() - hire.getFullYear();
    const monthDiff = now.getMonth() - hire.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < hire.getDate())) {
      years--;
    }
    return Math.max(0, years);
  } catch {
    return 0;
  }
}

async function getEmployeePenaltiesForDate(employeeId: string, date: string): Promise<{ totalFines: number; totalBonuses: number }> {
  try {
    const stored = await StorageService.getItem(dynamicSecureStoreKey.penalties(employeeId));
    if (!stored) return { totalFines: 0, totalBonuses: 0 };
    
    const penalties = safeParseJson<unknown[]>(stored, []);
    const dayPenalties = penalties.filter((p: any) => p.date === date);
    
    const totalFines = dayPenalties
      .filter((p: any) => p.amount > 0)
      .reduce((sum: number, p: any) => sum + p.amount, 0);
    
    const totalBonuses = dayPenalties
      .filter((p: any) => p.amount < 0)
      .reduce((sum: number, p: any) => sum + Math.abs(p.amount), 0);
    
    return { totalFines, totalBonuses };
  } catch (error) {
    console.error('Ошибка загрузки штрафов:', error);
    return { totalFines: 0, totalBonuses: 0 };
  }
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

function getShiftIntervalMinutes(shift: Pick<Shift, 'startTime' | 'endTime'>): {
  start: number;
  end: number;
} {
  const start = parseTimeToMinutes(shift.startTime);
  let end = parseTimeToMinutes(shift.endTime);
  if (end <= start) {
    end += 24 * 60;
  }
  return { start, end };
}

function shiftsOverlapInTime(
  a: Pick<Shift, 'startTime' | 'endTime'>,
  b: Pick<Shift, 'startTime' | 'endTime'>
): boolean {
  const intervalA = getShiftIntervalMinutes(a);
  const intervalB = getShiftIntervalMinutes(b);
  return intervalA.start < intervalB.end && intervalB.start < intervalA.end;
}

async function getEmployeesOnShift(shiftId: string, pvzId: string): Promise<number> {
  try {
    const allShifts = await DataService.getShifts();
    const currentShift = allShifts.find((s) => s.id === shiftId);

    if (!currentShift) return 1;

    const overlappingShifts = allShifts.filter(
      (s) =>
        s.pvzId === pvzId &&
        s.date === currentShift.date &&
        (s.status as string) !== 'cancelled' &&
        shiftsOverlapInTime(s, currentShift)
    );

    return Math.min(Math.max(overlappingShifts.length, 1), 4);
  } catch (error) {
    console.error('Ошибка подсчёта сотрудников на смене:', error);
    return 1;
  }
}

function getRateByEmployeesCount(formula: SalaryFormula, employeesCount: number): number {
  if (employeesCount === 1) return formula.rate1Employee;
  if (employeesCount === 2) return formula.rate2Employees;
  if (employeesCount === 3) return formula.rate3Employees;
  return formula.rate4Employees;
}

function calculateSeniorityBonus(
  bonusConfig: { enabled: boolean; perYear?: number } | undefined,
  seniorityYears: number
): { bonus: number; calculation: string } {
  if (!bonusConfig?.enabled || !bonusConfig.perYear || seniorityYears === 0) {
    return { bonus: 0, calculation: '' };
  }
  
  const bonus = seniorityYears * bonusConfig.perYear;
  const calculation = `Стаж ${seniorityYears} лет × ${bonusConfig.perYear} ₽ = ${bonus} ₽`;
  
  return { bonus, calculation };
}

function calculateLatePenalty(
  penaltyConfig: { enabled: boolean; amount?: number } | undefined,
  lateMinutes: number
): { penalty: number; calculation: string } {
  if (!penaltyConfig?.enabled || !penaltyConfig.amount || lateMinutes === 0) {
    return { penalty: 0, calculation: '' };
  }
  
  const penalty = penaltyConfig.amount;
  const calculation = `Опоздание ${lateMinutes} мин: -${penalty} ₽`;
  
  return { penalty, calculation };
}

function calculateRatingPenalty(
  penaltyConfig: { enabled: boolean; perPoint?: number; targetRating?: number } | undefined,
  rating: number
): { penalty: number; calculation: string } {
  if (!penaltyConfig?.enabled || !penaltyConfig.perPoint || !penaltyConfig.targetRating) {
    return { penalty: 0, calculation: '' };
  }
  
  const diff = Math.max(0, penaltyConfig.targetRating - rating);
  if (diff === 0) {
    return { penalty: 0, calculation: '' };
  }
  
  const penalty = diff * penaltyConfig.perPoint;
  const calculation = `Рейтинг ${rating} (ниже ${penaltyConfig.targetRating} на ${diff} баллов): -${penalty} ₽`;
  
  return { penalty, calculation };
}

export async function calculateAdvancedShiftEarnings(
  shift: Shift,
  employee: User,
  pvzId: string,
  stats?: ShiftStats
): Promise<ShiftCalculation> {
  const formula = await getFormulaForEmployee(employee.id, pvzId);
  if (!formula) {
    throw new Error('Формула расчёта не найдена');
  }
  
  const employeeSettings = await getEmployeeSalarySettings(employee.id, pvzId);
  
  const employeesOnShift = stats?.employeesOnShift || await getEmployeesOnShift(shift.id, pvzId);
  
  let baseRate = getRateByEmployeesCount(formula, employeesOnShift);
  if (employeeSettings?.customRate) {
    baseRate = employeeSettings.customRate;
  }
  
  let actualHours = 0;
  let hoursCalculationNote = '';
  
  if (formula.hoursCalculationType === 'planned') {
    actualHours = calculateTotalHours(shift.startTime, shift.endTime);
    hoursCalculationNote = `Плановые часы: ${actualHours} ч`;
  } else {
    actualHours = shift.actualHours || calculateTotalHours(shift.startTime, shift.endTime);
    hoursCalculationNote = shift.actualHours ? `Фактические часы: ${actualHours} ч` : `Плановые часы: ${actualHours} ч`;
  }
  
  const { earnings: baseEarnings, calculation: baseCalc } = calculateBaseEarningsForFormula(
    formula,
    baseRate,
    actualHours,
    shift
  );
  
  const goodsIssuedCount = stats?.goodsIssuedCount || 0;
  const goodsReceivedCount = stats?.goodsReceivedCount || 0;
  
  const { bonus: goodsIssuedBonus, calculation: goodsIssuedCalc } = calculateGoodsBonusAmount(
    formula.goodsIssuedBonus,
    goodsIssuedCount,
    stats?.goodsIssuedValue,
    'Премия за выданные товары'
  );
  
  const { bonus: goodsReceivedBonus, calculation: goodsReceivedCalc } = calculateGoodsBonusAmount(
    formula.goodsReceivedBonus,
    goodsReceivedCount,
    stats?.goodsReceivedValue,
    'Премия за принятые товары'
  );
  
  const isSubstitution = stats?.isSubstitution || false;
  let substitutionBonus = 0;
  let substitutionCalc = '';
  
  if (formula.substitutionBonus?.enabled && isSubstitution) {
    substitutionBonus = formula.substitutionBonus.amount;
    substitutionCalc = `Доплата за подмену: +${substitutionBonus} ₽`;
  }
  
  const seniorityYears = stats?.seniorityYears || calculateSeniorityYearsLocal(employeeSettings?.hireDate || employee.createdAt);
  const { bonus: seniorityBonus, calculation: seniorityCalc } = calculateSeniorityBonus(
    formula.seniorityBonus,
    seniorityYears
  );
  
  const lateMinutes = stats?.lateMinutes || 0;
  const { penalty: latePenalty, calculation: lateCalc } = calculateLatePenalty(formula.latePenalty, lateMinutes);
  
  const rating = stats?.rating || 5;
  const { penalty: ratingPenalty, calculation: ratingCalc } = calculateRatingPenalty(formula.ratingPenalty, rating);
  
  const { totalFines, totalBonuses } = await getEmployeePenaltiesForDate(employee.id, shift.date);
  
  let totalEarnings = baseEarnings + goodsIssuedBonus + goodsReceivedBonus + substitutionBonus + seniorityBonus 
    - latePenalty - ratingPenalty 
    - totalFines + totalBonuses;
  
  const calculationDetails = [
    baseCalc,
    hoursCalculationNote,
    `Количество сотрудников на смене: ${employeesOnShift}`,
    goodsIssuedCalc,
    goodsReceivedCalc,
    substitutionCalc,
    seniorityCalc,
    lateCalc,
    ratingCalc,
    totalFines > 0 ? `Ручные штрафы: -${totalFines} ₽` : '',
    totalBonuses > 0 ? `Ручные бонусы: +${totalBonuses} ₽` : '',
    `ИТОГО: ${Math.max(0, totalEarnings)} ₽`,
  ].filter(line => line).join('\n');
  
  const calculation: ShiftCalculation = {
    id: generateSecureId(),
    shiftId: shift.id,
    formulaId: formula.id,
    formulaName: formula.name,
    baseRate,
    actualHours,
    employeesOnShift,
    goodsIssuedCount,
    goodsReceivedCount,
    lateMinutes,
    rating,
    seniorityYears,
    isSubstitution,
    baseEarnings,
    goodsIssuedBonus,
    goodsReceivedBonus,
    substitutionBonus,
    seniorityBonus,
    latePenalty,
    ratingPenalty,
    totalEarnings: Math.max(0, totalEarnings),
    calculationDetails,
    calculatedAt: new Date().toISOString(),
  };
  
  await saveShiftCalculation(calculation);
  
  return calculation;
}

function isShiftOpenForRecalc(shift: Shift): boolean {
  if (shift.paymentStatus === 'paid' || shift.status === 'paid') return false;
  if ((shift.status as string) === 'cancelled') return false;
  return (
    shift.status === 'planned' ||
    shift.status === 'completed' ||
    (shift.status as string) === 'active'
  );
}

/** Пересчёт earnings по формулам для всех неоплаченных смен ПВЗ. */
export async function recalculatePvzOpenShifts(pvzId: string): Promise<number> {
  const allShifts = await DataService.getShiftsLocal();
  let updated = 0;

  for (const shift of allShifts) {
    if (shift.pvzId !== pvzId || !shift.employeeId) continue;
    if (!isShiftOpenForRecalc(shift)) continue;

    try {
      const earnings = await calculateUnifiedShiftEarnings(shift.employeeId, pvzId, shift);
      const totalHours =
        shift.totalHours || calculateTotalHours(shift.startTime, shift.endTime);

      if (shift.earnings !== earnings || shift.totalHours !== totalHours) {
        await DataService.updateShift(shift.id, {
          earnings,
          totalHours,
          status: shift.status,
        });
        updated++;
      }
    } catch (error) {
      console.warn('recalculatePvzOpenShifts:', shift.id, error);
    }
  }

  if (updated > 0) {
    try {
      const assignments = await DataService.getScheduleAssignments(pvzId);
      const shiftsById = new Map(
        (await DataService.getShiftsLocal())
          .filter((s) => s.pvzId === pvzId)
          .map((s) => [s.id, s])
      );
      const nextAssignments = assignments.map((a) => {
        const linked = shiftsById.get(a.id);
        return linked?.earnings != null ? { ...a, earnings: linked.earnings } : a;
      });
      const changed = nextAssignments.some(
        (a, i) => a.earnings !== assignments[i]?.earnings
      );
      if (changed) {
        await DataService.saveScheduleAssignments(pvzId, nextAssignments);
      }
    } catch (error) {
      console.warn('recalculatePvzOpenShifts: schedule sync', error);
    }

    DataService.emitChange('shifts');
  }

  return updated;
}

export async function recalculateEmployeeShifts(
  employeeId: string,
  pvzId: string,
  startDate: string,
  endDate: string
): Promise<ShiftCalculation[]> {
  const allShifts = await DataService.getShiftsLocal();

  const employeeShifts = allShifts.filter(
    (s) =>
      s.employeeId === employeeId &&
      s.pvzId === pvzId &&
      s.date >= startDate &&
      s.date <= endDate &&
      isShiftOpenForRecalc(s)
  );

  const employee = await DataService.getUserById(employeeId);
  const calculations: ShiftCalculation[] = [];

  for (const shift of employeeShifts) {
    const earnings = await calculateUnifiedShiftEarnings(employeeId, pvzId, shift);
    const totalHours =
      shift.totalHours || calculateTotalHours(shift.startTime, shift.endTime);

    await DataService.updateShift(shift.id, {
      earnings,
      totalHours,
      status: shift.status,
    });

    if (employee) {
      const calculation = await calculateAdvancedShiftEarnings(shift, employee, pvzId);
      calculations.push(calculation);
    }
  }

  return calculations;
}

export async function getDetailedSalaryReport(
  employeeId: string,
  pvzId: string,
  startDate: string,
  endDate: string
): Promise<{
  employeeName: string;
  period: { start: string; end: string };
  shifts: ShiftCalculation[];
  summary: {
    totalShifts: number;
    totalHours: number;
    totalBaseEarnings: number;
    totalBonuses: number;
    totalPenalties: number;
    totalEarnings: number;
  };
}> {
  const shiftsRaw = await StorageService.getItem(SecureStoreKeys.shifts);
  const allShifts = safeParseJson<Shift[]>(shiftsRaw ?? '[]', []);
  
  const usersRaw = await StorageService.getItem(SecureStoreKeys.pvzUsers);
  const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
  const employee = users.find((u) => u.id === employeeId);
  if (!employee) {
    throw new Error(`Сотрудник ${employeeId} не найден`);
  }

  const employeeShifts = allShifts.filter(s =>
    s.employeeId === employeeId && 
    s.date >= startDate && 
    s.date <= endDate &&
    s.status === 'completed'
  );
  
  const calculations: ShiftCalculation[] = [];
  
  for (const shift of employeeShifts) {
    let calculation = await getShiftCalculationLocal(shift.id);
    if (!calculation) {
      calculation = await calculateAdvancedShiftEarnings(shift, employee, pvzId);
    }
    calculations.push(calculation);
  }
  
  const summary = {
    totalShifts: calculations.length,
    totalHours: calculations.reduce((sum, c) => sum + c.actualHours, 0),
    totalBaseEarnings: calculations.reduce((sum, c) => sum + c.baseEarnings, 0),
    totalBonuses: calculations.reduce((sum, c) => sum + c.goodsIssuedBonus + c.goodsReceivedBonus + c.substitutionBonus + c.seniorityBonus, 0),
    totalPenalties: calculations.reduce((sum, c) => sum + c.latePenalty + c.ratingPenalty, 0),
    totalEarnings: calculations.reduce((sum, c) => sum + c.totalEarnings, 0),
  };
  
  return {
    employeeName: employee?.name || 'Сотрудник',
    period: { start: startDate, end: endDate },
    shifts: calculations,
    summary,
  };
}

/**
 * Автозавершение смен по расписанию: planned → completed после времени окончания,
 * расчёт зарплаты и запись в историю.
 */
export async function autoCompleteScheduledShifts(): Promise<boolean> {
  const shiftsRaw = await StorageService.getItem(SecureStoreKeys.shifts);
  if (!shiftsRaw) return false;

  const allShifts = safeParseJson<Shift[]>(shiftsRaw, []);
  const now = new Date();
  let updated = false;
  const nextShifts: Shift[] = [];

  for (const shift of allShifts) {
    let current: Shift =
      (shift.status as string) === 'active' ? { ...shift, status: 'planned' } : shift;

    if (current.paymentStatus === 'paid' || current.status === 'paid') {
      if (current.status !== 'paid' || current.paymentStatus !== 'paid') {
        current = { ...current, status: 'paid', paymentStatus: 'paid' };
        updated = true;
      }
      nextShifts.push(current);
      continue;
    }

    if (current.status === 'completed') {
      nextShifts.push(current);
      continue;
    }

    const shouldComplete =
      current.status === 'planned' && isShiftPastScheduledEnd(current, now);

    if (!shouldComplete) {
      nextShifts.push(current);
      continue;
    }

    const pvzId = current.pvzId || '';
    let earnings = current.earnings;
    let totalHours = current.totalHours;

    if (pvzId && current.employeeId) {
      try {
        earnings = await calculateUnifiedShiftEarnings(current.employeeId, pvzId, current);
      } catch (error) {
        console.warn('autoCompleteScheduledShifts: расчёт зарплаты', error);
      }
    }

    if (!totalHours) {
      totalHours = calculateTotalHours(current.startTime, current.endTime);
    }

    const completed: Shift = {
      ...current,
      status: 'completed',
      earnings: earnings ?? 0,
      totalHours,
      autoEnded: true,
      endedAt: now.toISOString(),
    };

    const history = await DataService.getShiftsHistory(current.employeeId);
    const historyList = Array.isArray(history) ? history : [];
    const alreadyInHistory = historyList.some((record) => record.id === completed.id);
    if (!alreadyInHistory) {
      await DataService.addShiftHistory({
        ...completed,
        closedAt: now.toISOString(),
      });
    }

    updated = true;
    nextShifts.push(completed);
  }

  if (updated) {
    await StorageService.setItem(SecureStoreKeys.shifts, JSON.stringify(nextShifts));
    DataService.emitChange('shifts');
  }

  return updated;
}
