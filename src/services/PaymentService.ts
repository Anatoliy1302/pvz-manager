// src/services/PaymentService.ts
import StorageService from './StorageService';
import { SecureStoreKeys } from '../constants/secureStoreKeys';
import DataService from './DataService';
import {
  fetchPaymentsFromRemote,
  mergePayments,
  upsertPaymentToRemote,
} from './PaymentSyncService';
import {
  mergeAdvanceRequests,
  upsertAdvanceRequestToRemote,
} from './AdvanceRequestSyncService';
import { resolvePvzId, getPvzEquivalentIds, collectEmployeeIdAliases } from '../utils/apiIdHelpers';
import { filterShiftsForEmployee, findEmployeeRecord } from '../utils/employeeShiftFilter';
import { generateUuidV4 } from '../utils/generateSecureId';
import { safeParseJson } from '../utils/safeJson';
import {
  mergePenalties,
  upsertPenaltyToRemote,
  deletePenaltyFromRemote,
  SyncPenalty,
} from './PenaltySyncService';
import { 
  Payment, 
  PaymentType, 
  AdvanceRequest, 
  EmployeeBalance,
  PeriodFinanceSummary,
  EmployeePeriodDetail 
} from '../types/payment';
import { Shift, ShiftStatus, User } from '../types/user';
import { isShiftCountableForAccruals, getShiftStatus } from '../utils/shiftStatusHelper';

// ============ КЛЮЧИ ДЛЯ ХРАНЕНИЯ ============

const getPaymentsKey = (pvzId: string) => `payments_${pvzId}`;
const getEmployeePaymentsKey = (employeeId: string) => `payments_employee_${employeeId}`;
const getAdvanceRequestsKey = (pvzId: string) => `advance_requests_${pvzId}`;
const getEmployeeAdvanceRequestsKey = (employeeId: string) => `advance_requests_employee_${employeeId}`;
const getBalanceKey = (employeeId: string) => `balance_${employeeId}`;

// ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ШТРАФОВ ============

export interface PenaltyTotals {
  totalFines: number;
  totalBonuses: number;
  /** Сумма к вычету из начислений: штрафы − бонусы */
  netDeduction: number;
}

export interface EmployeeAccruals {
  shiftsEarned: number;
  totalFines: number;
  totalBonuses: number;
  netEarned: number;
  totalPaid: number;
  balance: number;
}

export interface AccrualsOptions {
  periodStart?: string;
  periodEnd?: string;
}

/** Штрафы и бонусы сотрудника (опционально за период) */
export async function getPenaltyTotals(
  employeeId: string,
  periodStart?: string,
  periodEnd?: string
): Promise<PenaltyTotals> {
  try {
    const stored = await StorageService.getItem(`penalties_${employeeId}`);
    if (!stored) {
      return { totalFines: 0, totalBonuses: 0, netDeduction: 0 };
    }

    let penalties = safeParseJson<SyncPenalty[]>(stored, []);
    if (periodStart && periodEnd) {
      penalties = penalties.filter(
        (p: { date: string }) => p.date >= periodStart && p.date <= periodEnd
      );
    }

    const totalFines = penalties
      .filter((p: { amount: number }) => p.amount > 0)
      .reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);

    const totalBonuses = penalties
      .filter((p: { amount: number }) => p.amount < 0)
      .reduce((sum: number, p: { amount: number }) => sum + Math.abs(p.amount), 0);

    return {
      totalFines,
      totalBonuses,
      netDeduction: totalFines - totalBonuses,
    };
  } catch (error) {
    if (__DEV__) console.error('Ошибка загрузки штрафов:', error);
    return { totalFines: 0, totalBonuses: 0, netDeduction: 0 };
  }
}

function getPaymentPaidDate(payment: Payment & { date?: string }): string {
  const raw = payment.paidAt || payment.date || '';
  return raw.split('T')[0];
}

function filterCountableShifts(
  shifts: Shift[],
  employeeId: string,
  pvzId?: string,
  periodStart?: string,
  periodEnd?: string
): Shift[] {
  return shifts.filter(s => {
    if (s.employeeId !== employeeId) return false;
    if (pvzId && s.pvzId && s.pvzId !== pvzId) return false;
    if (!isShiftCountableForAccruals(s)) return false;
    if (periodStart && periodEnd && (s.date < periodStart || s.date > periodEnd)) return false;
    return true;
  });
}

/**
 * Синхронизирует status в storage для прошедших смен (planned → completed).
 * Дедупликация: параллельные вызовы ждут один проход.
 */
let syncShiftStatusesInFlight: Promise<void> | null = null;

export async function syncShiftStatusesInStorage(): Promise<void> {
  if (syncShiftStatusesInFlight) {
    return syncShiftStatusesInFlight;
  }

  syncShiftStatusesInFlight = (async () => {
    const { autoCompleteScheduledShifts } = await import('../utils/advancedPayrollCalculator');
    await autoCompleteScheduledShifts();
  })();

  try {
    await syncShiftStatusesInFlight;
  } finally {
    syncShiftStatusesInFlight = null;
  }
}

export interface EmployeeSalaryOverviewRow {
  employeeId: string;
  accruals: EmployeeAccruals;
  shiftsCount: number;
  hours: number;
}

function employeeWorksAtPvz(user: User, pvzId: string): boolean {
  if (!pvzId) return true;
  if (user.pvzId === pvzId) return true;
  return user.pvzIds?.includes(pvzId) ?? false;
}

/**
 * Сводка зарплаты по всем сотрудникам ПВЗ за период — один проход по данным
 * (без N вызовов syncShiftStatuses / fetchPaymentsFromRemote).
 */
export async function calculatePvzSalaryOverview(
  pvzId: string,
  periodStart: string,
  periodEnd: string
): Promise<EmployeeSalaryOverviewRow[]> {
  await syncShiftStatusesInStorage();

  const [usersRaw, shiftsRaw, payments] = await Promise.all([
    StorageService.getItem(SecureStoreKeys.pvzUsers),
    StorageService.getItem(SecureStoreKeys.shifts),
    getPayments(pvzId),
  ]);

  const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
  const allShifts = safeParseJson<Shift[]>(shiftsRaw ?? '[]', []);
  const equivalentPvzIds = await getPvzEquivalentIds(pvzId);
  const pvzShifts = allShifts.filter(
    (shift) => !shift.pvzId || equivalentPvzIds.has(shift.pvzId)
  );

  const employees = users.filter(
    (u) => u.role !== 'owner' && u.status === 'active' && employeeWorksAtPvz(u, pvzId)
  );

  const penaltyEntries = await Promise.all(
    employees.map(async (emp) => {
      const totals = await getPenaltyTotals(emp.id, periodStart, periodEnd);
      return [emp.id, totals] as const;
    })
  );
  const penaltyByEmployee = new Map(penaltyEntries);

  return employees.map((emp) => {
    const employeeShifts = filterCountableShifts(
      pvzShifts,
      emp.id,
      undefined,
      periodStart,
      periodEnd
    );
    const shiftsEarned = employeeShifts.reduce((sum, s) => sum + (s.earnings || 0), 0);
    const { totalFines, totalBonuses, netDeduction } =
      penaltyByEmployee.get(emp.id) ?? { totalFines: 0, totalBonuses: 0, netDeduction: 0 };
    const netEarned = Math.max(0, shiftsEarned - netDeduction);

    const relevantPayments = payments
      .filter((p) => p.employeeId === emp.id)
      .filter((p) => {
        const paidDate = getPaymentPaidDate(p);
        if (!paidDate) return false;
        return paidDate >= periodStart && paidDate <= periodEnd;
      });
    const totalPaid = relevantPayments.reduce((sum, p) => sum + p.amount, 0);
    const hours = employeeShifts.reduce((sum, s) => sum + (s.totalHours || 0), 0);

    return {
      employeeId: emp.id,
      accruals: {
        shiftsEarned: Math.round(shiftsEarned),
        totalFines: Math.round(totalFines),
        totalBonuses: Math.round(totalBonuses),
        netEarned: Math.round(netEarned),
        totalPaid: Math.round(totalPaid),
        balance: Math.round(Math.max(0, netEarned - totalPaid)),
      },
      shiftsCount: employeeShifts.length,
      hours: Math.round(hours * 10) / 10,
    };
  });
}

export interface PvzPayrollRow {
  employeeId: string;
  periodAccruals: EmployeeAccruals;
  lifetimeBalance: number;
  shiftsCount: number;
}

/**
 * Пакетный расчёт зарплаты по ПВЗ: период + накопительный баланс за один проход.
 */
export async function loadPvzPayrollBundle(
  pvzId: string,
  employeeIds: string[],
  periodStart: string,
  periodEnd: string
): Promise<Map<string, PvzPayrollRow>> {
  await syncShiftStatusesInStorage();

  const [shiftsRaw, paymentsRaw, usersRaw] = await Promise.all([
    StorageService.getItem(SecureStoreKeys.shifts),
    StorageService.getItem(getPaymentsKey(pvzId)),
    StorageService.getItem(SecureStoreKeys.pvzUsers),
  ]);

  const allShifts = safeParseJson<Shift[]>(shiftsRaw ?? '[]', []);
  const payments = safeParseJson<Payment[]>(paymentsRaw ?? '[]', []);
  const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
  const userById = new Map(users.map((u) => [u.id, u]));

  const penaltyLifetime = await Promise.all(
    employeeIds.map(async (id) => [id, await getPenaltyTotals(id)] as const)
  );
  const penaltyPeriod = await Promise.all(
    employeeIds.map(
      async (id) => [id, await getPenaltyTotals(id, periodStart, periodEnd)] as const
    )
  );
  const lifetimePenaltyMap = new Map(penaltyLifetime);
  const periodPenaltyMap = new Map(penaltyPeriod);

  const result = new Map<string, PvzPayrollRow>();

  for (const employeeId of employeeIds) {
    const emp = userById.get(employeeId);
    const empPvzId = emp?.pvzId || pvzId;

    const periodShifts = filterCountableShifts(
      allShifts,
      employeeId,
      empPvzId,
      periodStart,
      periodEnd
    );
    const lifetimeShifts = filterCountableShifts(allShifts, employeeId, empPvzId);

    const periodShiftsEarned = periodShifts.reduce((sum, s) => sum + (s.earnings || 0), 0);
    const lifetimeShiftsEarned = lifetimeShifts.reduce((sum, s) => sum + (s.earnings || 0), 0);

    const periodPenalty = periodPenaltyMap.get(employeeId) ?? {
      totalFines: 0,
      totalBonuses: 0,
      netDeduction: 0,
    };
    const lifetimePenalty = lifetimePenaltyMap.get(employeeId) ?? {
      totalFines: 0,
      totalBonuses: 0,
      netDeduction: 0,
    };

    const periodNetEarned = Math.max(0, periodShiftsEarned - periodPenalty.netDeduction);
    const lifetimeNetEarned = Math.max(0, lifetimeShiftsEarned - lifetimePenalty.netDeduction);

    const periodPayments = payments
      .filter((p) => p.employeeId === employeeId)
      .filter((p) => {
        const paidDate = getPaymentPaidDate(p);
        return paidDate && paidDate >= periodStart && paidDate <= periodEnd;
      });
    const periodPaid = periodPayments.reduce((sum, p) => sum + p.amount, 0);

    const lifetimePaid = payments
      .filter((p) => p.employeeId === employeeId)
      .reduce((sum, p) => sum + p.amount, 0);

    const lifetimeBalance = Math.max(0, lifetimeNetEarned - lifetimePaid);

    result.set(employeeId, {
      employeeId,
      periodAccruals: {
        shiftsEarned: Math.round(periodShiftsEarned),
        totalFines: Math.round(periodPenalty.totalFines),
        totalBonuses: Math.round(periodPenalty.totalBonuses),
        netEarned: Math.round(periodNetEarned),
        totalPaid: Math.round(periodPaid),
        balance: Math.round(Math.max(0, periodNetEarned - periodPaid)),
      },
      lifetimeBalance: Math.round(lifetimeBalance),
      shiftsCount: periodShifts.length,
    });
  }

  return result;
}

/**
 * Расчёт начислений сотрудника: смены − штрафы + бонусы
 */
export async function calculateEmployeeAccruals(
  employeeId: string,
  pvzId: string,
  options?: AccrualsOptions
): Promise<EmployeeAccruals> {
  const { periodStart, periodEnd } = options || {};

  await syncShiftStatusesInStorage();

  const shiftsRaw = await StorageService.getItem(SecureStoreKeys.shifts);
  const allShifts = safeParseJson<Shift[]>(shiftsRaw ?? '[]', []);
  const matchedShifts = await filterShiftsForEmployee(allShifts, employeeId, {
    pvzId: pvzId || undefined,
    periodStart,
    periodEnd,
  });
  const employeeShifts = matchedShifts.filter(isShiftCountableForAccruals);

  const shiftsEarned = employeeShifts.reduce((sum, s) => sum + (s.earnings || 0), 0);
  const { totalFines, totalBonuses, netDeduction } = await getPenaltyTotals(
    employeeId,
    periodStart,
    periodEnd
  );
  const netEarned = Math.max(0, shiftsEarned - netDeduction);

  const payments = await getEmployeePayments(employeeId);
  let relevantPayments = payments;
  if (periodStart && periodEnd) {
    relevantPayments = payments.filter((p) => {
      const paidDate = getPaymentPaidDate(p);
      if (!paidDate) return false;
      return paidDate >= periodStart && paidDate <= periodEnd;
    });
  }
  const totalPaid = relevantPayments.reduce((sum, p) => sum + p.amount, 0);

  return {
    shiftsEarned: Math.round(shiftsEarned),
    totalFines: Math.round(totalFines),
    totalBonuses: Math.round(totalBonuses),
    netEarned: Math.round(netEarned),
    totalPaid: Math.round(totalPaid),
    balance: Math.round(Math.max(0, netEarned - totalPaid)),
  };
}

// ============ ВЫПЛАТЫ ============

export async function getPayments(pvzId: string): Promise<Payment[]> {
  try {
    const stored = await StorageService.getItem(getPaymentsKey(pvzId));
    const local = safeParseJson<Payment[]>(stored ?? '[]', []);
    const remote = await fetchPaymentsFromRemote();

    if (!remote) {
      return local;
    }

    const resolvedPvzId = await resolvePvzId(pvzId);
    const remoteForPvz = remote.filter(
      (p) => p.pvzId === resolvedPvzId || p.pvzId === pvzId
    );

    if (remoteForPvz.length === 0) {
      return local;
    }

    const merged = mergePayments(
      local,
      remoteForPvz.map((p) => ({ ...p, pvzId }))
    );
    await StorageService.setItem(getPaymentsKey(pvzId), JSON.stringify(merged));
    return merged;
  } catch (error) {
    if (__DEV__) console.error('Ошибка загрузки выплат:', error);
    return [];
  }
}

export async function getPaymentsByPeriod(
  pvzId: string, 
  startDate: string, 
  endDate: string
): Promise<Payment[]> {
  const all = await getPayments(pvzId);
  return all.filter(p => {
    const paidDate = getPaymentPaidDate(p);
    return paidDate >= startDate && paidDate <= endDate;
  });
}

export async function getEmployeePayments(employeeId: string): Promise<Payment[]> {
  try {
    const usersRaw = await StorageService.getItem(SecureStoreKeys.pvzUsers);
    const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
    const employee = await findEmployeeRecord(users, employeeId);
    const aliases = await collectEmployeeIdAliases(employeeId);

    if (employee?.pvzId) {
      const pvzPayments = await getPayments(employee.pvzId);
      return pvzPayments.filter((payment) => aliases.has(payment.employeeId));
    }

    const stored = await StorageService.getItem(getEmployeePaymentsKey(employeeId));
    return safeParseJson<Payment[]>(stored ?? '[]', []);
  } catch (error) {
    if (__DEV__) console.error('Ошибка загрузки выплат сотрудника:', error);
    return [];
  }
}

/** Обновить локальный кэш выплат по ПВЗ (для Realtime). */
export async function refreshPaymentsCache(pvzId: string): Promise<Payment[]> {
  const stored = await StorageService.getItem(getPaymentsKey(pvzId));
  const local = safeParseJson<Payment[]>(stored ?? '[]', []);
  const remote = await fetchPaymentsFromRemote();

  if (!remote) {
    return local;
  }

  const resolvedPvzId = await resolvePvzId(pvzId);
  const remoteForPvz = remote.filter(
    (payment) => payment.pvzId === resolvedPvzId || payment.pvzId === pvzId
  );

  const merged = mergePayments(
    local,
    remoteForPvz.map((payment) => ({ ...payment, pvzId }))
  );
  await StorageService.setItem(getPaymentsKey(pvzId), JSON.stringify(merged));

  const byEmployee = new Map<string, Payment[]>();
  merged.forEach((payment) => {
    const list = byEmployee.get(payment.employeeId) || [];
    list.push(payment);
    byEmployee.set(payment.employeeId, list);
  });

  for (const [employeeId, payments] of byEmployee.entries()) {
    await StorageService.setItem(getEmployeePaymentsKey(employeeId), JSON.stringify(payments));
    DataService.emitChange(`payments_employee_${employeeId}`);
    await updateEmployeeBalance(employeeId, pvzId);
  }

  DataService.emitChange(`payments_${pvzId}`);
  DataService.emitChange('employee_balance');
  return merged;
}

/** Обновить локальный кэш штрафов/бонусов из snapshot владельца. */
export async function refreshPenaltiesCache(pvzIds: string[]): Promise<void> {
  const { pullPvzFinanceFromServer } = await import('./data/financeDataService');
  await Promise.all(pvzIds.map((pvzId) => pullPvzFinanceFromServer(pvzId)));
}

export async function addPayment(
  pvzId: string,
  payment: Omit<Payment, 'id' | 'status' | 'paidAt'>
): Promise<Payment> {
  const newPayment: Payment = {
    ...payment,
    id: generateUuidV4(),
    status: 'completed',
    paidAt: new Date().toISOString(),
  };
  
  const synced = await upsertPaymentToRemote(newPayment);
  if (synced) {
    newPayment.id = synced.id;
    if (synced.pvzId) newPayment.pvzId = synced.pvzId;
  }

  const allPayments = await getPayments(pvzId);
  allPayments.push(newPayment);
  await StorageService.setItem(getPaymentsKey(pvzId), JSON.stringify(allPayments));
  
  const employeePayments = await getEmployeePayments(payment.employeeId);
  employeePayments.push(newPayment);
  await StorageService.setItem(getEmployeePaymentsKey(payment.employeeId), JSON.stringify(employeePayments));
  
  await updateEmployeeBalance(payment.employeeId, pvzId);

  DataService.emitChange(`payments_${pvzId}`);
  DataService.emitChange(`payments_employee_${payment.employeeId}`);
  DataService.emitChange('employee_balance');

  if (payment.type === 'salary') {
    await reconcileShiftPaymentsForPvz(pvzId);
  }
  
  return newPayment;
}

export async function getPaidShiftSlotKeysForPvz(pvzId: string): Promise<Set<string>> {
  const { normalizeDateKey } = await import('../utils/dateHelpers');
  const { readLocalShifts } = await import('./data/shiftDataService');

  const equivalentPvzIds = await getPvzEquivalentIds(pvzId);
  const belongsToPvz = (shiftPvzId?: string) =>
    !shiftPvzId || equivalentPvzIds.has(shiftPvzId);

  const allShifts = await readLocalShifts();
  const payments = await getPayments(pvzId);
  const employeeIds = new Set<string>();

  for (const shift of allShifts) {
    if (!belongsToPvz(shift.pvzId)) continue;
    if (shift.employeeId) employeeIds.add(shift.employeeId);
  }
  for (const payment of payments) {
    if (payment.employeeId) employeeIds.add(payment.employeeId);
  }

  const paidSlots = new Set<string>();
  const processedAliasKeys = new Set<string>();

  for (const employeeId of employeeIds) {
    const aliases = await collectEmployeeIdAliases(employeeId);
    const aliasKey = [...aliases].sort().join('|');
    if (processedAliasKeys.has(aliasKey)) continue;
    processedAliasKeys.add(aliasKey);

    const empShifts: Shift[] = [];
    for (const shift of allShifts) {
      if (!aliases.has(shift.employeeId)) continue;
      if (!belongsToPvz(shift.pvzId)) continue;
      if (!isShiftCountableForAccruals(shift)) continue;
      empShifts.push(shift);
    }
    empShifts.sort((a, b) =>
      normalizeDateKey(a.date).localeCompare(normalizeDateKey(b.date))
    );

    const salaryPayments = payments
      .filter((p) => aliases.has(p.employeeId) && p.type === 'salary')
      .sort((a, b) => getPaymentPaidDate(a).localeCompare(getPaymentPaidDate(b)));

    let pool = salaryPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    for (const shift of empShifts) {
      const earnings = shift.earnings || 0;
      if (earnings <= 0) continue;
      if (pool >= earnings) {
        pool -= earnings;
        for (const id of aliases) {
          paidSlots.add(`${id}|${normalizeDateKey(shift.date)}`);
        }
      }
    }
  }

  return paidSlots;
}

export async function isAssignmentPaidByPayments(
  pvzId: string,
  employeeId: string,
  date: string,
  paidSlots?: Set<string>
): Promise<boolean> {
  const slots = paidSlots ?? (await getPaidShiftSlotKeysForPvz(pvzId));
  const aliases = await collectEmployeeIdAliases(employeeId);
  const { normalizeDateKey } = await import('../utils/dateHelpers');
  const dateKey = normalizeDateKey(date);
  for (const id of aliases) {
    if (slots.has(`${id}|${dateKey}`)) return true;
  }
  return false;
}

/**
 * Сопоставляет выплаты (FIFO) со сменами и обновляет paymentStatus в shifts + расписании.
 */
export async function reconcileShiftPaymentsForPvz(pvzId: string): Promise<void> {
  if (!pvzId) return;

  const { coalesceShiftsPreferPaid } = await import('../utils/scheduleHelpers');
  const { normalizeDateKey } = await import('../utils/dateHelpers');
  const { writeLocalShifts, readLocalShifts } = await import('./data/shiftDataService');
  const { syncScheduleFromShifts } = await import('./data/scheduleDataService');

  const equivalentPvzIds = await getPvzEquivalentIds(pvzId);
  const belongsToPvz = (shiftPvzId?: string) =>
    !shiftPvzId || equivalentPvzIds.has(shiftPvzId);

  const allShifts = await readLocalShifts();
  const payments = await getPayments(pvzId);
  const employeeIds = new Set<string>();

  for (const shift of allShifts) {
    if (!belongsToPvz(shift.pvzId)) continue;
    if (shift.employeeId) employeeIds.add(shift.employeeId);
  }
  for (const payment of payments) {
    if (payment.employeeId) employeeIds.add(payment.employeeId);
  }

  const paidIds = new Set<string>();
  const processedAliasKeys = new Set<string>();

  for (const employeeId of employeeIds) {
    const aliases = await collectEmployeeIdAliases(employeeId);
    const aliasKey = [...aliases].sort().join('|');
    if (processedAliasKeys.has(aliasKey)) continue;
    processedAliasKeys.add(aliasKey);

    const empShifts: Shift[] = [];
    for (const shift of allShifts) {
      if (!aliases.has(shift.employeeId)) continue;
      if (!belongsToPvz(shift.pvzId)) continue;
      if (!isShiftCountableForAccruals(shift)) continue;
      empShifts.push(shift);
    }
    empShifts.sort((a, b) =>
      normalizeDateKey(a.date).localeCompare(normalizeDateKey(b.date))
    );

    const salaryPayments = payments
      .filter((p) => aliases.has(p.employeeId) && p.type === 'salary')
      .sort((a, b) => getPaymentPaidDate(a).localeCompare(getPaymentPaidDate(b)));

    let pool = salaryPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    for (const shift of empShifts) {
      const earnings = shift.earnings || 0;
      if (earnings <= 0) continue;
      if (pool >= earnings) {
        pool -= earnings;
        paidIds.add(shift.id);
      }
    }
  }

  let changed = false;
  const updated = allShifts.map((shift) => {
    const shouldBePaid = paidIds.has(shift.id);
    const isPaid = shift.paymentStatus === 'paid' || shift.status === 'paid';

    if (shouldBePaid && !isPaid) {
      changed = true;
      return { ...shift, paymentStatus: 'paid' as const, status: 'paid' as const };
    }

    if (!shouldBePaid && isPaid) {
      changed = true;
      const { status, paymentStatus } = getShiftStatus({
        ...shift,
        paymentStatus: 'pending',
        status: shift.status === 'paid' ? 'completed' : shift.status,
      });
      return { ...shift, paymentStatus, status };
    }

    return shift;
  });

  const coalesced = coalesceShiftsPreferPaid(changed ? updated : allShifts);
  if (changed) {
    await writeLocalShifts(coalesced);
    DataService.emitChange('shifts');
  }

  await syncScheduleFromShifts(pvzId);
  DataService.emitChange(`schedule_assignments_${pvzId}`);
}

/** @deprecated Используйте reconcileShiftPaymentsForPvz */
export async function markShiftsAsPaidForPayment(
  pvzId: string,
  _employeeId: string,
  _amount: number
): Promise<void> {
  await reconcileShiftPaymentsForPvz(pvzId);
}

export async function addPenalty(
  employeeId: string,
  penalty: {
    id: string;
    employeeName: string;
    amount: number;
    reason: string;
    date: string;
    createdAt: string;
    createdBy: string;
  },
  pvzId: string
): Promise<void> {
  const existingRaw = await StorageService.getItem(`penalties_${employeeId}`);
  const existing = safeParseJson<SyncPenalty[]>(existingRaw ?? '[]', []);

  const synced = await upsertPenaltyToRemote({ ...penalty, employeeId, pvzId });
  const saved: SyncPenalty = synced ?? { ...penalty, employeeId, pvzId };

  const merged = mergePenalties(existing, [saved]);
  await StorageService.setItem(`penalties_${employeeId}`, JSON.stringify(merged));

  DataService.emitChange(`penalties_${employeeId}`);
  if (pvzId) {
    DataService.emitChange(`penalties_${pvzId}`);
  }
}

export async function removePenalty(
  employeeId: string,
  penaltyId: string,
  pvzId: string
): Promise<void> {
  const existingRaw = await StorageService.getItem(`penalties_${employeeId}`);
  const existing = safeParseJson<SyncPenalty[]>(existingRaw ?? '[]', []);
  const filtered = existing.filter((p) => p.id !== penaltyId);
  await StorageService.setItem(`penalties_${employeeId}`, JSON.stringify(filtered));

  await deletePenaltyFromRemote(pvzId, penaltyId);

  DataService.emitChange(`penalties_${employeeId}`);
  DataService.emitChange(`penalties_${pvzId}`);
  await updateEmployeeBalance(employeeId, pvzId);
  DataService.emitChange('employee_balance');
}

/** Пересчёт баланса сотрудника (при каждом запросе или после изменений) */
export async function updateEmployeeBalance(employeeId: string, pvzId: string): Promise<EmployeeBalance> {
  const accruals = await calculateEmployeeAccruals(employeeId, pvzId);

  const usersRaw = await StorageService.getItem(SecureStoreKeys.pvzUsers);
  const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
  const employee = await findEmployeeRecord(users, employeeId);

  const balanceData: EmployeeBalance = {
    employeeId,
    employeeName: employee?.name || '',
    totalEarned: accruals.netEarned,
    totalPaid: accruals.totalPaid,
    balance: accruals.balance,
    lastUpdated: new Date().toISOString(),
  };

  await StorageService.setItem(getBalanceKey(employeeId), JSON.stringify(balanceData));

  return balanceData;
}

/** Получить баланс сотрудника (всегда актуальный) */
export async function getEmployeeBalance(employeeId: string): Promise<EmployeeBalance | null> {
  try {
    const usersRaw = await StorageService.getItem(SecureStoreKeys.pvzUsers);
    const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
    const employee = await findEmployeeRecord(users, employeeId);
    
    if (!employee) return null;
    
    return await updateEmployeeBalance(employee.id, employee.pvzId || '');
  } catch (error) {
    if (__DEV__) console.error('Ошибка загрузки баланса:', error);
    return null;
  }
}

// ============ ЗАПРОСЫ НА АВАНС ============

export async function getAdvanceRequests(
  pvzId: string,
  options?: { refresh?: boolean }
): Promise<AdvanceRequest[]> {
  try {
    if (options?.refresh) {
      const { pullPvzFinanceFromServer } = await import('./data/financeDataService');
      await pullPvzFinanceFromServer(pvzId);
    }

    const stored = await StorageService.getItem(getAdvanceRequestsKey(pvzId));
    return safeParseJson<AdvanceRequest[]>(stored ?? '[]', []);
  } catch (error) {
    console.error('Ошибка загрузки запросов:', error);
    return [];
  }
}

export async function getEmployeeAdvanceRequests(employeeId: string): Promise<AdvanceRequest[]> {
  try {
    const usersRaw = await StorageService.getItem(SecureStoreKeys.pvzUsers);
    const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
    const employee = await findEmployeeRecord(users, employeeId);
    const aliases = await collectEmployeeIdAliases(employeeId);

    const pvzIds = new Set<string>();
    if (employee?.pvzId) pvzIds.add(employee.pvzId);
    if (Array.isArray(employee?.pvzIds)) {
      employee.pvzIds.forEach((id) => pvzIds.add(id));
    }

    if (pvzIds.size > 0) {
      const all: AdvanceRequest[] = [];
      for (const id of pvzIds) {
        const pvzRequests = await getAdvanceRequests(id);
        all.push(...pvzRequests.filter((request) => aliases.has(request.employeeId)));
      }
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      await StorageService.setItem(
        getEmployeeAdvanceRequestsKey(employeeId),
        JSON.stringify(all)
      );
      return all;
    }

    const stored = await StorageService.getItem(getEmployeeAdvanceRequestsKey(employeeId));
    return safeParseJson<AdvanceRequest[]>(stored ?? '[]', []);
  } catch (error) {
    console.error('Ошибка загрузки запросов сотрудника:', error);
    return [];
  }
}

/** Обновить локальный кэш авансов по ПВЗ (из snapshot владельца). */
export async function refreshAdvanceRequestsCache(pvzId: string): Promise<AdvanceRequest[]> {
  const { pullPvzFinanceFromServer } = await import('./data/financeDataService');
  await pullPvzFinanceFromServer(pvzId);
  return getAdvanceRequests(pvzId);
}

export async function createAdvanceRequest(
  pvzId: string,
  employeeId: string,
  employeeName: string,
  amount: number,
  periodStart: string,
  periodEnd: string,
  reason?: string
): Promise<AdvanceRequest> {
  const newRequest: AdvanceRequest = {
    id: generateUuidV4(),
    employeeId,
    employeeName,
    amount,
    periodStart,
    periodEnd,
    reason,
    status: 'pending',
    createdAt: new Date().toISOString(),
    pvzId,
  };
  
  const synced = await upsertAdvanceRequestToRemote(newRequest);
  const saved: AdvanceRequest = synced ?? newRequest;

  const allRequests = mergeAdvanceRequests(await getAdvanceRequests(pvzId), [saved]);
  await StorageService.setItem(getAdvanceRequestsKey(pvzId), JSON.stringify(allRequests));

  const employeeRequests = mergeAdvanceRequests(
    await getEmployeeAdvanceRequests(employeeId),
    [saved]
  );
  await StorageService.setItem(
    getEmployeeAdvanceRequestsKey(employeeId),
    JSON.stringify(employeeRequests)
  );

  DataService.emitChange(`advance_requests_${pvzId}`);
  DataService.emitChange(`advance_requests_employee_${employeeId}`);

  return saved;
}

export async function updateAdvanceRequestStatus(
  pvzId: string,
  requestId: string,
  status: 'approved' | 'rejected',
  reviewedBy: string,
  reviewedByName: string
): Promise<AdvanceRequest | null> {
  const allRequests = await getAdvanceRequests(pvzId);
  const requestIndex = allRequests.findIndex(r => r.id === requestId);
  
  if (requestIndex === -1) return null;
  
  allRequests[requestIndex].status = status;
  allRequests[requestIndex].reviewedAt = new Date().toISOString();
  allRequests[requestIndex].reviewedBy = reviewedBy;
  allRequests[requestIndex].reviewedByName = reviewedByName;
  
  await StorageService.setItem(getAdvanceRequestsKey(pvzId), JSON.stringify(allRequests));

  const updated = allRequests[requestIndex];
  await upsertAdvanceRequestToRemote(updated);

  const employeeRequests = mergeAdvanceRequests(
    await getEmployeeAdvanceRequests(updated.employeeId),
    [updated]
  );
  await StorageService.setItem(
    getEmployeeAdvanceRequestsKey(updated.employeeId),
    JSON.stringify(employeeRequests)
  );

  DataService.emitChange(`advance_requests_${pvzId}`);
  DataService.emitChange(`advance_requests_employee_${updated.employeeId}`);

  return updated;
}

// ============ СВОДКИ И СТАТИСТИКА ============

export async function getPeriodFinanceSummary(
  pvzId: string,
  periodStart: string,
  periodEnd: string
): Promise<PeriodFinanceSummary> {
  const usersRaw = await StorageService.getItem(SecureStoreKeys.pvzUsers);
  const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
  const employees = users.filter((u: any) => 
    u.role !== 'owner' && u.status === 'active' && u.pvzId === pvzId
  );
  
  await syncShiftStatusesInStorage();

  const shiftsRaw = await StorageService.getItem(SecureStoreKeys.shifts);
  const allShifts = safeParseJson<Shift[]>(shiftsRaw ?? '[]', []);

  let totalEarned = 0;
  for (const emp of employees) {
    const accruals = await calculateEmployeeAccruals(emp.id, pvzId, { periodStart, periodEnd });
    totalEarned += accruals.netEarned;
  }
  
  const payments = await getPaymentsByPeriod(pvzId, periodStart, periodEnd);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  
  return {
    periodStart,
    periodEnd,
    totalEarned,
    totalPaid,
    totalBalance: totalEarned - totalPaid,
    employeesCount: employees.length,
    paymentsCount: payments.length,
  };
}

export async function getEmployeePeriodDetail(
  employeeId: string,
  pvzId: string,
  periodStart: string,
  periodEnd: string
): Promise<EmployeePeriodDetail | null> {
  const usersRaw = await StorageService.getItem(SecureStoreKeys.pvzUsers);
  const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
  const employee = users.find((u: any) => u.id === employeeId);
  
  if (!employee) return null;
  
  const accruals = await calculateEmployeeAccruals(employeeId, pvzId, { periodStart, periodEnd });

  const shiftsRaw = await StorageService.getItem(SecureStoreKeys.shifts);
  const allShifts = safeParseJson<Shift[]>(shiftsRaw ?? '[]', []);
  const periodShifts = filterCountableShifts(allShifts, employeeId, pvzId, periodStart, periodEnd);

  const allPayments = await getEmployeePayments(employeeId);
  const periodPayments = allPayments.filter(p => {
    const paidDate = getPaymentPaidDate(p);
    return paidDate >= periodStart && paidDate <= periodEnd;
  });
  const totalPaid = periodPayments.reduce((sum, p) => sum + p.amount, 0);

  return {
    employeeId,
    employeeName: employee.name,
    shifts: periodShifts.map(s => ({
      id: s.id,
      date: s.date,
      shiftType: s.shiftType || (s.customStart ? 'hourly' : 'full'),
      earnings: s.earnings || 0,
    })),
    payments: periodPayments.map(p => ({
      id: p.id,
      amount: p.amount,
      type: p.type,
      paidAt: p.paidAt,
      note: p.note,
    })),
    totalEarned: accruals.netEarned,
    totalPaid,
    balance: accruals.netEarned - totalPaid,
  };
}
