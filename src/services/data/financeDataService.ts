import StorageService from '../StorageService';
import { getToken } from '../../../lib/authSessionStore';
import { fetchPvzFinance } from '../../../lib/pvzFinanceService';
import { mergePayments } from '../SupabasePaymentService';
import { mergePenalties } from '../SupabasePenaltyService';
import { mergeAdvanceRequests } from '../SupabaseAdvanceRequestService';
import { Payment, AdvanceRequest } from '../../types/payment';
import { SyncPenalty } from '../SupabasePenaltyService';
import { safeParseJson } from '../../utils/safeJson';
import DataService from '../DataService';
import { userBelongsToPvz } from '../../utils/chatHelpers';
import { User } from '../../types/user';

/** Pull shared payments, penalties and advance requests from owner snapshot. */
export async function pullPvzFinanceFromServer(pvzId: string): Promise<void> {
  if (!(await getToken())) return;

  try {
    const remote = await fetchPvzFinance(pvzId);

    const paymentsKey = `payments_${pvzId}`;
    const localPayments = safeParseJson<Payment[]>(
      (await StorageService.getItem(paymentsKey)) ?? '[]',
      []
    );
    const mergedPayments = mergePayments(
      localPayments,
      remote.payments.map((p) => ({ ...p, pvzId }))
    );
    await StorageService.setItem(paymentsKey, JSON.stringify(mergedPayments));

    const users = await DataService.getUsers();
    const pvzs = await DataService.getPvzs();
    const pvz = pvzs.find((p) => p.id === pvzId);
    const pvzStaff: User[] = pvz
      ? users.filter(
          (u) => u.role !== 'owner' && u.status === 'active' && userBelongsToPvz(u, pvz)
        )
      : users.filter(
          (u) => u.role !== 'owner' && u.status === 'active' && u.pvzId === pvzId
        );

    await Promise.all(
      pvzStaff.map(async (employee) => {
        const remoteForEmployee = remote.penalties.filter(
          (p) => p.employeeId === employee.id
        );
        const key = `penalties_${employee.id}`;
        const local = safeParseJson<SyncPenalty[]>(
          (await StorageService.getItem(key)) ?? '[]',
          []
        );
        const localOtherPvz = local.filter((p) => p.pvzId && p.pvzId !== pvzId);
        const merged = mergePenalties(
          localOtherPvz,
          remoteForEmployee.map((p) => ({
            ...p,
            employeeName: employee.name || p.employeeName,
            pvzId: p.pvzId || pvzId,
          }))
        );
        await StorageService.setItem(key, JSON.stringify(merged));
        DataService.emitChange?.(key);
      })
    );

    const advancesKey = `advance_requests_${pvzId}`;
    const localAdvances = safeParseJson<AdvanceRequest[]>(
      (await StorageService.getItem(advancesKey)) ?? '[]',
      []
    );
    const mergedAdvances = mergeAdvanceRequests(
      localAdvances,
      remote.advance_requests.map((r) => ({ ...r, pvzId }))
    );
    await StorageService.setItem(advancesKey, JSON.stringify(mergedAdvances));

    const byEmployee = new Map<string, AdvanceRequest[]>();
    for (const request of mergedAdvances) {
      const list = byEmployee.get(request.employeeId) ?? [];
      list.push(request);
      byEmployee.set(request.employeeId, list);
    }

    for (const [employeeId, requests] of byEmployee.entries()) {
      const empKey = `advance_requests_employee_${employeeId}`;
      await StorageService.setItem(empKey, JSON.stringify(requests));
      DataService.emitChange?.(empKey);
    }

    DataService.emitChange?.(paymentsKey);
    DataService.emitChange?.(advancesKey);
    DataService.emitChange?.(`penalties_${pvzId}`);
  } catch (error) {
    if (__DEV__) {
      console.warn('[Finance] pullPvzFinanceFromServer:', error);
    }
  }
}
