// src/services/PaymentService.ts
import StorageService from './StorageService';
import DataService from './DataService';
import {
  fetchPaymentsFromSupabase,
  mergePayments,
  upsertPaymentToSupabase,
} from './SupabasePaymentService';
import {
  fetchAdvanceRequestsFromSupabase,
  mergeAdvanceRequests,
  upsertAdvanceRequestToSupabase,
  updateAdvanceRequestInSupabase,
} from './SupabaseAdvanceRequestService';
import { resolvePvzId } from '../utils/supabaseHelpers';
import { generateSecureId } from '../utils/generateSecureId';
import { safeParseJson } from '../utils/safeJson';
import {
  fetchPenaltiesFromSupabase,
  mergePenalties,
  SyncPenalty,
} from './SupabasePenaltyService';
import { 
  Payment, 
  PaymentType, 
  AdvanceRequest, 
  EmployeeBalance,
  PeriodFinanceSummary,
  EmployeePeriodDetail 
} from '../types/payment';
import { Shift, ShiftStatus, User } from '../types/user';
import { getShiftStatus, isShiftCountableForAccruals } from '../utils/shiftStatusHelper';

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

/**
 * Штрафы и бонусы сотрудника (опционально за период)
 */
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
    console.error('Ошибка загрузки штрафов:', error);
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
 * Синхронизирует status в storage для прошедших смен (planned → completed)
 */
export async function syncShiftStatusesInStorage(): Promise<void> {
  const shiftsRaw = await StorageService.getItem('shifts');
  if (!shiftsRaw) return;

  const allShifts = safeParseJson<Shift[]>(shiftsRaw ?? '[]', []);
  let updated = false;

  const synced = allShifts.map(shift => {
    const computed = getShiftStatus(shift);
    if (computed.status === 'paid' && shift.status !== 'paid') {
      updated = true;
      return { ...shift, status: 'paid' as ShiftStatus, paymentStatus: 'paid' as const };
    }
    if (computed.status === 'completed' && shift.status !== 'completed' && shift.status !== 'paid') {
      updated = true;
      return { ...shift, status: 'completed' as ShiftStatus };
    }
    return shift;
  });

  if (updated) {
    await StorageService.setItem('shifts', JSON.stringify(synced));
    DataService.emitChange('shifts');
  }
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

  const shiftsRaw = await StorageService.getItem('shifts');
  const allShifts = safeParseJson<Shift[]>(shiftsRaw ?? '[]', []);
  const employeeShifts = filterCountableShifts(
    allShifts,
    employeeId,
    pvzId || undefined,
    periodStart,
    periodEnd
  );

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
    const remote = await fetchPaymentsFromSupabase();

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
    console.error('Ошибка загрузки выплат:', error);
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
    const usersRaw = await StorageService.getItem('pvz_users');
    const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
    const employee = users.find((user: { id: string; pvzId?: string }) => user.id === employeeId);

    if (employee?.pvzId) {
      const pvzPayments = await getPayments(employee.pvzId);
      return pvzPayments.filter((payment) => payment.employeeId === employeeId);
    }

    const stored = await StorageService.getItem(getEmployeePaymentsKey(employeeId));
    return safeParseJson<Payment[]>(stored ?? '[]', []);
  } catch (error) {
    console.error('Ошибка загрузки выплат сотрудника:', error);
    return [];
  }
}

/** Обновить локальный кэш выплат по ПВЗ (для Realtime). */
export async function refreshPaymentsCache(pvzId: string): Promise<Payment[]> {
  const stored = await StorageService.getItem(getPaymentsKey(pvzId));
  const local = safeParseJson<Payment[]>(stored ?? '[]', []);
  const remote = await fetchPaymentsFromSupabase();

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

/** Обновить локальный кэш штрафов/бонусов (для Realtime). */
export async function refreshPenaltiesCache(pvzIds: string[]): Promise<void> {
  const remote = await fetchPenaltiesFromSupabase();
  if (!remote) return;

  const users = await DataService.getUsers();
  const employeeIds = users
    .filter(
      (u) =>
        u.role === 'employee' &&
        u.status === 'active' &&
        u.pvzId &&
        pvzIds.includes(u.pvzId)
    )
    .map((u) => u.id);

  for (const employeeId of employeeIds) {
    const key = `penalties_${employeeId}`;
    const stored = await StorageService.getItem(key);
    const local = safeParseJson<SyncPenalty[]>(stored ?? '[]', []);
    const employee = users.find((u) => u.id === employeeId);
    const pvzId = employee?.pvzId;

    const remoteForEmployee = remote.filter((p) => p.employeeId === employeeId);
    if (remoteForEmployee.length === 0 && local.length === 0) continue;

    const merged = mergePenalties(
      local,
      remoteForEmployee.map((p) => ({
        ...p,
        employeeName: employee?.name || p.employeeName,
        pvzId: p.pvzId || pvzId,
      }))
    );
    await StorageService.setItem(key, JSON.stringify(merged));
    DataService.emitChange(`penalties_${employeeId}`);

    if (pvzId) {
      await updateEmployeeBalance(employeeId, pvzId);
    }
  }

  for (const pvzId of pvzIds) {
    DataService.emitChange(`penalties_${pvzId}`);
  }
  DataService.emitChange('employee_balance');
}

export async function addPayment(
  pvzId: string,
  payment: Omit<Payment, 'id' | 'status' | 'paidAt'>
): Promise<Payment> {
  const newPayment: Payment = {
    ...payment,
    id: generateSecureId(),
    status: 'completed',
    paidAt: new Date().toISOString(),
  };
  
  const synced = await upsertPaymentToSupabase(newPayment);
  if (synced) {
    newPayment.id = synced.id;
  }

  const allPayments = await getPayments(pvzId);
  allPayments.push(newPayment);
  await StorageService.setItem(getPaymentsKey(pvzId), JSON.stringify(allPayments));
  
  const employeePayments = await getEmployeePayments(payment.employeeId);
  employeePayments.push(newPayment);
  await StorageService.setItem(getEmployeePaymentsKey(payment.employeeId), JSON.stringify(employeePayments));
  
  await updateEmployeeBalance(payment.employeeId, pvzId);
  
  return newPayment;
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
  existing.push({ ...penalty, employeeId });
  await StorageService.setItem(`penalties_${employeeId}`, JSON.stringify(existing));

  const { upsertPenaltyToSupabase } = await import('./SupabasePenaltyService');
  await upsertPenaltyToSupabase({ ...penalty, employeeId, pvzId });

  DataService.emitChange(`penalties_${employeeId}`);
  if (pvzId) {
    DataService.emitChange(`penalties_${pvzId}`);
  }
}

/**
 * Пересчёт баланса сотрудника (вызывается при каждом запросе или после изменений)
 */
export async function updateEmployeeBalance(employeeId: string, pvzId: string): Promise<EmployeeBalance> {
  console.log(`🔄 Пересчёт баланса для ${employeeId}`);

  const accruals = await calculateEmployeeAccruals(employeeId, pvzId);

  const usersRaw = await StorageService.getItem('pvz_users');
  const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
  const employee = users.find((u: { id: string }) => u.id === employeeId);

  const balanceData: EmployeeBalance = {
    employeeId,
    employeeName: employee?.name || '',
    totalEarned: accruals.netEarned,
    totalPaid: accruals.totalPaid,
    balance: accruals.balance,
    lastUpdated: new Date().toISOString(),
  };

  await StorageService.setItem(getBalanceKey(employeeId), JSON.stringify(balanceData));

  console.log(
    `💰 Баланс для ${employeeId}: смены=${accruals.shiftsEarned}, штрафы=${accruals.totalFines}, бонусы=${accruals.totalBonuses}, начислено=${accruals.netEarned}`
  );

  return balanceData;
}

/**
 * Получить баланс сотрудника (всегда актуальный)
 */
export async function getEmployeeBalance(employeeId: string): Promise<EmployeeBalance | null> {
  try {
    const usersRaw = await StorageService.getItem('pvz_users');
    const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
    const employee = users.find((u: any) => u.id === employeeId);
    
    if (!employee) return null;
    
    // Всегда пересчитываем баланс при запросе для актуальности
    return await updateEmployeeBalance(employeeId, employee.pvzId || '');
  } catch (error) {
    console.error('Ошибка загрузки баланса:', error);
    return null;
  }
}

// ============ ЗАПРОСЫ НА АВАНС ============

export async function getAdvanceRequests(pvzId: string): Promise<AdvanceRequest[]> {
  try {
    const stored = await StorageService.getItem(getAdvanceRequestsKey(pvzId));
    const local = safeParseJson<AdvanceRequest[]>(stored ?? '[]', []);
    const remote = await fetchAdvanceRequestsFromSupabase();

    if (!remote) {
      return local;
    }

    const resolvedPvzId = await resolvePvzId(pvzId);
    const remoteForPvz = remote.filter(
      (request) => request.pvzId === resolvedPvzId || request.pvzId === pvzId
    );

    if (remoteForPvz.length === 0) {
      return local;
    }

    const merged = mergeAdvanceRequests(
      local,
      remoteForPvz.map((request) => ({ ...request, pvzId }))
    );
    await StorageService.setItem(getAdvanceRequestsKey(pvzId), JSON.stringify(merged));
    return merged;
  } catch (error) {
    console.error('Ошибка загрузки запросов:', error);
    return [];
  }
}

export async function getEmployeeAdvanceRequests(employeeId: string): Promise<AdvanceRequest[]> {
  try {
    const usersRaw = await StorageService.getItem('pvz_users');
    const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
    const employee = users.find((user: { id: string; pvzId?: string }) => user.id === employeeId);

    if (employee?.pvzId) {
      const pvzRequests = await getAdvanceRequests(employee.pvzId);
      return pvzRequests.filter((request) => request.employeeId === employeeId);
    }

    const stored = await StorageService.getItem(getEmployeeAdvanceRequestsKey(employeeId));
    return safeParseJson<AdvanceRequest[]>(stored ?? '[]', []);
  } catch (error) {
    console.error('Ошибка загрузки запросов сотрудника:', error);
    return [];
  }
}

/** Обновить локальный кэш авансов по ПВЗ (для Realtime). */
export async function refreshAdvanceRequestsCache(pvzId: string): Promise<AdvanceRequest[]> {
  const stored = await StorageService.getItem(getAdvanceRequestsKey(pvzId));
  const local = safeParseJson<AdvanceRequest[]>(stored ?? '[]', []);
  const remote = await fetchAdvanceRequestsFromSupabase();

  if (!remote) {
    return local;
  }

  const resolvedPvzId = await resolvePvzId(pvzId);
  const remoteForPvz = remote.filter(
    (request) => request.pvzId === resolvedPvzId || request.pvzId === pvzId
  );

  const merged = mergeAdvanceRequests(
    local,
    remoteForPvz.map((request) => ({ ...request, pvzId }))
  );
  await StorageService.setItem(getAdvanceRequestsKey(pvzId), JSON.stringify(merged));

  const byEmployee = new Map<string, AdvanceRequest[]>();
  merged.forEach((request) => {
    const list = byEmployee.get(request.employeeId) || [];
    list.push(request);
    byEmployee.set(request.employeeId, list);
  });

  for (const [employeeId, requests] of byEmployee.entries()) {
    await StorageService.setItem(
      getEmployeeAdvanceRequestsKey(employeeId),
      JSON.stringify(requests)
    );
    DataService.emitChange(`advance_requests_employee_${employeeId}`);
  }

  return merged;
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
    id: generateSecureId(),
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
  
  const synced = await upsertAdvanceRequestToSupabase(newRequest);
  if (synced) {
    newRequest.id = synced.id;
  }

  const allRequests = await getAdvanceRequests(pvzId);
  allRequests.push(newRequest);
  await StorageService.setItem(getAdvanceRequestsKey(pvzId), JSON.stringify(allRequests));
  
  const employeeRequests = await getEmployeeAdvanceRequests(employeeId);
  employeeRequests.push(newRequest);
  await StorageService.setItem(getEmployeeAdvanceRequestsKey(employeeId), JSON.stringify(employeeRequests));

  DataService.emitChange(`advance_requests_${pvzId}`);
  DataService.emitChange(`advance_requests_employee_${employeeId}`);

  return newRequest;
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
  await updateAdvanceRequestInSupabase(requestId, updated);
  await upsertAdvanceRequestToSupabase(updated);
  
  const employeeRequests = await getEmployeeAdvanceRequests(updated.employeeId);
  const empIndex = employeeRequests.findIndex(r => r.id === requestId);
  if (empIndex !== -1) {
    employeeRequests[empIndex] = updated;
    await StorageService.setItem(
      getEmployeeAdvanceRequestsKey(updated.employeeId),
      JSON.stringify(employeeRequests)
    );
  }

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
  const usersRaw = await StorageService.getItem('pvz_users');
  const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
  const employees = users.filter((u: any) => 
    u.role !== 'owner' && u.status === 'active' && u.pvzId === pvzId
  );
  
  await syncShiftStatusesInStorage();

  const shiftsRaw = await StorageService.getItem('shifts');
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
  const usersRaw = await StorageService.getItem('pvz_users');
  const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
  const employee = users.find((u: any) => u.id === employeeId);
  
  if (!employee) return null;
  
  const accruals = await calculateEmployeeAccruals(employeeId, pvzId, { periodStart, periodEnd });

  const shiftsRaw = await StorageService.getItem('shifts');
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