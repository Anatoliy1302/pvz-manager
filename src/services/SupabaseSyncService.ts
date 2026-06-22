import * as SecureStore from 'expo-secure-store';
import { User, Shift, Pvz } from '../types/user';
import DataService from './DataService';
import { getToken } from '../../lib/authSessionStore';
import { pushSync, pullSync } from '../../lib/syncService';
import { ensurePvzSynced } from './SupabasePvzService';
import { upsertShiftToSupabase } from './SupabaseShiftService';
import {
  fetchInvitationsFromSupabase,
  mergeInvitations,
  upsertInvitationToSupabase,
  SyncInvitation,
} from './SupabaseInvitationService';
import {
  fetchShiftRequestsFromSupabase,
  mergeShiftRequests,
  upsertShiftRequestToSupabase,
} from './SupabaseShiftRequestService';
import {
  upsertPaymentToSupabase,
} from './SupabasePaymentService';
import {
  upsertPenaltyToSupabase,
  SyncPenalty,
} from './SupabasePenaltyService';
import {
  fetchNotificationsFromSupabase,
  mergeNotifications,
} from './SupabaseNotificationService';
import {
  upsertAdvanceRequestToSupabase,
} from './SupabaseAdvanceRequestService';
import { syncPvzSalarySettings } from './SupabaseSalarySettingsService';
import {
  mergeRemoteProfilesIntoLocal,
  pushLocalProfilesToSupabase,
} from './SupabaseProfileSyncService';
import StorageService from './StorageService';
import { Payment, AdvanceRequest } from '../types/payment';
import { safeParseJson } from '../utils/safeJson';
import type { NotificationRecord } from './NotificationService';
import type { ShiftRequest } from './data/dataTypes';
import { rebuildPendingEmployeesFromInvitations, pushPendingInvitationsToApi } from '../context/auth/employeeOps';

export interface SyncResult {
  success: boolean;
  errors: string[];
}

async function runStep(label: string, fn: () => Promise<string | null | void>): Promise<void> {
  try {
    const error = await fn();
    if (typeof error === 'string' && error) {
      throw new Error(error);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}: ${message}`);
  }
}

/** Синхронизация локальных данных с API после входа. */
export async function syncSupabaseOnLogin(sessionUser: User): Promise<SyncResult> {
  const errors: string[] = [];

  if (!(await getToken())) {
    return { success: true, errors: [] };
  }

  try {
    const remote = await pullSync();

    if (remote.snapshot && typeof remote.snapshot === 'object') {
      const { hydrateLocalFromSnapshot } = await import('../../lib/syncPersistence');
      await hydrateLocalFromSnapshot(remote.snapshot as Record<string, unknown>);
    }

    const pvzListAfterHydrate =
      sessionUser.role === 'owner'
        ? await DataService.getPvzsByOwner(sessionUser.id)
        : await DataService.getPvzs();
    const { pullPvzScheduleFromServer } = await import('./data/scheduleDataService');
    const { pullPvzSalaryFromServer } = await import('./SupabaseSalarySettingsService');
    const { pullPvzFinanceFromServer } = await import('./data/financeDataService');
    await Promise.all(
      pvzListAfterHydrate.map(async (p) => {
        await pullPvzScheduleFromServer(p.id);
        await pullPvzSalaryFromServer(p.id);
        await pullPvzFinanceFromServer(p.id);
      })
    );

    if (Array.isArray(remote.pvz)) {
      for (const raw of remote.pvz as Array<Record<string, unknown>>) {
        const item: Pvz = {
          id: String(raw.id),
          name: String(raw.name ?? ''),
          address: String(raw.address ?? ''),
          workStart: String(raw.work_start ?? raw.workStart ?? '09:00'),
          workEnd: String(raw.work_end ?? raw.workEnd ?? '21:00'),
          workingHours: String(raw.working_hours ?? raw.workingHours ?? '09:00 - 21:00'),
          phone: String(raw.phone ?? ''),
          ownerId: String(raw.owner_id ?? raw.ownerId ?? sessionUser.id),
          ownerInn: raw.owner_inn ? String(raw.owner_inn) : undefined,
        };
        await DataService.savePvz(item);
      }
    }
    if (Array.isArray(remote.shifts) && remote.shifts.length > 0) {
      const localShifts = safeParseJson<Shift[]>(
        (await SecureStore.getItemAsync('shifts')) ?? '[]',
        []
      );
      const remoteShifts = (remote.shifts as Array<Record<string, unknown>>).map((row) => {
        if (row.employeeId && row.startTime) return row as Shift;
        const startIso = String(row.start_time ?? '');
        return {
          id: String(row.id),
          employeeId: String(row.user_id ?? row.employeeId ?? ''),
          employeeName: String(row.employee_name ?? row.employeeName ?? ''),
          date: String(row.date ?? startIso.slice(0, 10)),
          startTime: row.startTime ? String(row.startTime) : startIso.slice(11, 16),
          endTime: row.end_time ? String(row.end_time).slice(11, 16) : '',
          status: (row.status as Shift['status']) || 'planned',
          paymentStatus: (row.payment_status as Shift['paymentStatus']) || 'pending',
          shiftType: row.shift_type as Shift['shiftType'],
          totalHours: row.total_hours != null ? Number(row.total_hours) : undefined,
          earnings: row.earnings != null ? Number(row.earnings) : undefined,
          pvzId: String(row.pvz_id ?? row.pvzId ?? ''),
        } satisfies Shift;
      });
      const byId = new Map<string, Shift>();
      for (const shift of localShifts) byId.set(shift.id, shift);
      for (const shift of remoteShifts) byId.set(shift.id, shift);
      await SecureStore.setItemAsync('shifts', JSON.stringify([...byId.values()]));
      DataService.emitChange?.('shifts');
    }

    const localPvz =
      sessionUser.role === 'owner'
        ? await DataService.getPvzsByOwner(sessionUser.id)
        : await DataService.getPvzs();
    const localShifts = safeParseJson<Shift[]>(
      (await SecureStore.getItemAsync('shifts')) ?? '[]',
      []
    );

    const { collectLocalSnapshotPayload } = await import('../../lib/syncPersistence');
    const { mergeDeepSnapshot } = await import('../../lib/snapshotMerge');
    const snapshotPayload = await import('../../lib/snapshotSync').then((m) =>
      m.readSnapshotPayload()
    );
    const localPayload = await collectLocalSnapshotPayload(sessionUser);
    const pushResult = await pushSync(
      mergeDeepSnapshot(snapshotPayload, {
        ...localPayload,
        pvz: localPvz,
        shifts: localShifts,
      })
    );
    if (pushResult.errors?.length) {
      errors.push(...pushResult.errors);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
  }

  if (!(await getToken())) {
    return { success: errors.length === 0, errors };
  }

  const steps: Array<[string, () => Promise<string | null | void>]> = [
    ['ПВЗ', () => syncPvzRecords(sessionUser)],
    ['Смены', () => syncShiftsUp()],
    ['Приглашения', () => syncInvitations(sessionUser)],
    ['Заявки на смены', () => syncShiftRequests()],
    ['Выплаты', () => syncPayments()],
    ['Штрафы', () => syncPenalties()],
    ['Авансы', () => syncAdvanceRequests()],
    ['Настройки зарплаты', () => syncSalarySettings(sessionUser)],
    ['Уведомления', () => syncNotifications()],
    ['Профили сотрудников', () => syncProfiles(sessionUser)],
    ['Обновление кэша', () => refreshCaches(sessionUser)],
  ];

  for (const [label, step] of steps) {
    try {
      await runStep(label, step);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('syncSupabaseOnLogin:', message);
      errors.push(message);
    }
  }

  return { success: errors.length === 0, errors };
}

async function syncPvzRecords(sessionUser: User): Promise<void> {
  if (sessionUser.role === 'owner') {
    const pvzs = await DataService.getPvzsByOwner(sessionUser.id);
    await Promise.all(
      pvzs.map(async (p) => {
        const resolvedId = await ensurePvzSynced(p);
        if (resolvedId !== p.id) {
          await DataService.savePvz({ ...p, id: resolvedId });
        }
      })
    );
    return;
  }

  const storedPvz = await SecureStore.getItemAsync('pvz');
  const pvz = storedPvz
    ? safeParseJson<Pvz | null>(storedPvz, null)
    : sessionUser.pvzId
      ? await DataService.getPvzById(sessionUser.pvzId)
      : null;

  if (pvz) {
    const resolvedId = await ensurePvzSynced(pvz);
    if (resolvedId !== pvz.id) {
      const updated = { ...pvz, id: resolvedId };
      await DataService.savePvz(updated);
      await SecureStore.setItemAsync('pvz', JSON.stringify(updated));
    }
  }
}

async function syncShiftsUp(): Promise<void> {
  const localShifts = await SecureStore.getItemAsync('shifts');
  if (!localShifts) return;

  const shifts = safeParseJson<Shift[]>(localShifts, []);
  await Promise.all(
    shifts
      .filter((shift) => shift.status !== 'planned')
      .map((shift) => upsertShiftToSupabase(shift))
  );
}

async function syncProfiles(sessionUser: User): Promise<string | null> {
  const pushError = await pushLocalProfilesToSupabase(sessionUser);
  if (pushError) return pushError;

  const pvzIds =
    sessionUser.role === 'owner'
      ? (await DataService.getPvzsByOwner(sessionUser.id)).map((p) => p.id)
      : sessionUser.pvzIds?.length
        ? sessionUser.pvzIds
        : sessionUser.pvzId
          ? [sessionUser.pvzId]
          : [];

  return mergeRemoteProfilesIntoLocal(pvzIds);
}

async function refreshCaches(sessionUser: User): Promise<void> {
  const tasks: Promise<unknown>[] = [
    DataService.refreshShiftsCache(),
    DataService.refreshShiftRequestsCache(),
  ];
  if (sessionUser.role === 'owner' || sessionUser.role === 'admin') {
    tasks.push(DataService.getInvitations(sessionUser.id));
  }
  await Promise.all(tasks);
}

async function syncInvitations(sessionUser: User): Promise<void> {
  if (sessionUser.role === 'owner' || sessionUser.role === 'admin') {
    await pushPendingInvitationsToApi(sessionUser.id);
  }

  const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
  let allInvitations = safeParseJson<SyncInvitation[]>(allInvitationsRaw ?? '[]', []);

  const upsertResults = await Promise.all(
    allInvitations.map(async (invitation) => {
      const synced = await upsertInvitationToSupabase(invitation);
      return { invitation, synced };
    })
  );

  for (const { invitation, synced } of upsertResults) {
    if (synced && synced.id !== invitation.id) {
      allInvitations = allInvitations.map((inv) =>
        inv.id === invitation.id ? { ...inv, id: synced.id, pvzId: synced.pvzId } : inv
      );
    }
  }

  const remote = await fetchInvitationsFromSupabase();
  if (remote) {
    const merged = mergeInvitations(allInvitations, remote);
    await SecureStore.setItemAsync('all_invitations', JSON.stringify(merged));

    if (sessionUser.role === 'owner' || sessionUser.role === 'admin') {
      const ownerInvitations = merged.filter(
        (inv) => inv.invitedBy === sessionUser.id && inv.status === 'pending'
      );
      await SecureStore.setItemAsync(
        `invitations_${sessionUser.id}`,
        JSON.stringify(ownerInvitations)
      );
      DataService.emitChange(`invitations_${sessionUser.id}`);
      await rebuildPendingEmployeesFromInvitations(sessionUser.id);
    }
  } else if (allInvitations.length > 0) {
    await SecureStore.setItemAsync('all_invitations', JSON.stringify(allInvitations));
    throw new Error('Не удалось загрузить приглашения из облака');
  }
}

async function syncShiftRequests(): Promise<void> {
  const stored = await SecureStore.getItemAsync('all_shift_requests');
  let local = safeParseJson<ShiftRequest[]>(stored ?? '[]', []);

  const upsertResults = await Promise.all(
    local.map(async (request) => {
      const synced = await upsertShiftRequestToSupabase(request);
      return { request, synced };
    })
  );

  for (const { request, synced } of upsertResults) {
    if (synced && synced.id !== request.id) {
      local = local.map((r) =>
        r.id === request.id ? { ...r, id: synced.id, pvzId: synced.pvzId } : r
      );
    }
  }

  const remote = await fetchShiftRequestsFromSupabase();
  if (remote) {
    const merged = mergeShiftRequests(local, remote);
    await SecureStore.setItemAsync('all_shift_requests', JSON.stringify(merged));
    DataService.emitChange('all_shift_requests');
  } else if (local.length > 0) {
    await SecureStore.setItemAsync('all_shift_requests', JSON.stringify(local));
    throw new Error('Не удалось загрузить заявки из облака');
  }
}

async function syncPayments(): Promise<void> {
  const pvzs = await DataService.getPvzs();

  await Promise.all(
    pvzs.map(async (pvz) => {
      const key = `payments_${pvz.id}`;
      const stored = await StorageService.getItem(key);
      const local = safeParseJson<Payment[]>(stored ?? '[]', []);

      await Promise.all(
        local.map((payment) => upsertPaymentToSupabase({ ...payment, pvzId: pvz.id }))
      );

      const { pullPvzFinanceFromServer } = await import('./data/financeDataService');
      await pullPvzFinanceFromServer(pvz.id);
    })
  );
}

async function syncPenalties(): Promise<void> {
  const users = await DataService.getUsers();
  const employeeIds = users
    .filter((u) => u.role === 'employee' && u.status === 'active')
    .map((u) => u.id);

  await Promise.all(
    employeeIds.map(async (employeeId) => {
      const key = `penalties_${employeeId}`;
      const stored = await StorageService.getItem(key);
      const local = safeParseJson<SyncPenalty[]>(stored ?? '[]', []);
      const employee = users.find((u) => u.id === employeeId);
      const pvzId = employee?.pvzId;

      await Promise.all(
        local.map((penalty) =>
          upsertPenaltyToSupabase({ ...penalty, pvzId: penalty.pvzId || pvzId })
        )
      );
    })
  );

  const pvzs = await DataService.getPvzs();
  const { pullPvzFinanceFromServer } = await import('./data/financeDataService');
  await Promise.all(pvzs.map((pvz) => pullPvzFinanceFromServer(pvz.id)));
}

async function syncAdvanceRequests(): Promise<void> {
  const pvzs = await DataService.getPvzs();

  await Promise.all(
    pvzs.map(async (pvz) => {
      const key = `advance_requests_${pvz.id}`;
      const stored = await StorageService.getItem(key);
      let local = safeParseJson<AdvanceRequest[]>(stored ?? '[]', []);

      const upsertResults = await Promise.all(
        local.map(async (request) => {
          const synced = await upsertAdvanceRequestToSupabase({ ...request, pvzId: pvz.id });
          return { request, synced };
        })
      );

      for (const { request, synced } of upsertResults) {
        if (synced && synced.id !== request.id) {
          local = local.map((item) =>
            item.id === request.id ? { ...item, id: synced.id, pvzId: synced.pvzId } : item
          );
        }
      }
    })
  );

  const { pullPvzFinanceFromServer } = await import('./data/financeDataService');
  await Promise.all(pvzs.map((pvz) => pullPvzFinanceFromServer(pvz.id)));
}

async function syncSalarySettings(sessionUser: User): Promise<void> {
  if (sessionUser.role !== 'owner' && sessionUser.role !== 'admin') {
    if (sessionUser.pvzId) {
      await syncPvzSalarySettings(sessionUser.pvzId);
    }
    return;
  }

  const pvzs =
    sessionUser.role === 'owner'
      ? await DataService.getPvzsByOwner(sessionUser.id)
      : await DataService.getPvzs();

  await Promise.all(pvzs.map((pvz) => syncPvzSalarySettings(pvz.id)));
}

async function syncNotifications(): Promise<void> {
  const remote = await fetchNotificationsFromSupabase();
  if (!remote) {
    throw new Error('Не удалось загрузить уведомления из облака');
  }

  const stored = await StorageService.getItem('notifications');
  const local = safeParseJson<NotificationRecord[]>(stored ?? '[]', []);
  const merged = mergeNotifications(local, remote);
  await StorageService.setItem('notifications', JSON.stringify(merged));
}
