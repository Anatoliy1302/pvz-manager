import { apiRequest } from './apiClient';
import type { EmployeeSalarySettings } from '../src/types/salary';
import type { Payment, AdvanceRequest } from '../src/types/payment';
import type { SyncPenalty } from '../src/services/SupabasePenaltyService';
import type { PvzSalaryBundle } from '../src/services/SupabaseSalarySettingsService';

export type PvzSalaryPayload = {
  bundle: PvzSalaryBundle;
  employeeSettings: Record<string, EmployeeSalarySettings>;
};

export type PvzFinancePayload = {
  payments: Payment[];
  penalties: SyncPenalty[];
  advance_requests: AdvanceRequest[];
};

export async function fetchPvzSalary(pvzId: string): Promise<PvzSalaryPayload> {
  const result = await apiRequest<PvzSalaryPayload>(
    `/api/pvz/${encodeURIComponent(pvzId)}/salary`
  );
  return {
    bundle: result?.bundle ?? { global: null, formulas: [], employeeRates: {} },
    employeeSettings: result?.employeeSettings ?? {},
  };
}

export async function updatePvzSalary(
  pvzId: string,
  payload: Partial<PvzSalaryPayload>
): Promise<void> {
  await apiRequest(`/api/pvz/${encodeURIComponent(pvzId)}/salary`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function fetchPvzFinance(pvzId: string): Promise<PvzFinancePayload> {
  const result = await apiRequest<PvzFinancePayload>(
    `/api/pvz/${encodeURIComponent(pvzId)}/finance`
  );
  return {
    payments: result?.payments ?? [],
    penalties: result?.penalties ?? [],
    advance_requests: result?.advance_requests ?? [],
  };
}

export async function upsertPvzPayment(pvzId: string, payment: Payment): Promise<Payment> {
  const result = await apiRequest<{ payment?: Payment }>(
    `/api/pvz/${encodeURIComponent(pvzId)}/payments`,
    {
      method: 'PUT',
      body: JSON.stringify(payment),
    }
  );
  return result?.payment ?? payment;
}

export async function upsertPvzPenalty(
  pvzId: string,
  penalty: SyncPenalty
): Promise<SyncPenalty> {
  const result = await apiRequest<{ penalty?: SyncPenalty }>(
    `/api/pvz/${encodeURIComponent(pvzId)}/penalties`,
    {
      method: 'PUT',
      body: JSON.stringify(penalty),
    }
  );
  return result?.penalty ?? penalty;
}

export async function deletePvzPenalty(pvzId: string, penaltyId: string): Promise<void> {
  await apiRequest(`/api/pvz/${encodeURIComponent(pvzId)}/penalties/${encodeURIComponent(penaltyId)}`, {
    method: 'DELETE',
  });
}

export async function upsertPvzAdvanceRequest(
  pvzId: string,
  request: AdvanceRequest
): Promise<AdvanceRequest> {
  const result = await apiRequest<{ request?: AdvanceRequest }>(
    `/api/pvz/${encodeURIComponent(pvzId)}/advance-requests`,
    {
      method: 'PUT',
      body: JSON.stringify(request),
    }
  );
  return result?.request ?? request;
}
