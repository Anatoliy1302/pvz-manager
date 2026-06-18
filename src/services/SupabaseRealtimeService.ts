import { supabase } from '../../lib/supabase';

import { User } from '../types/user';

import DataService from './DataService';

import { hasSupabaseSession } from './SupabaseAuthService';

import { debounceAsync } from '../utils/debounceAsync';

import {
  refreshAdvanceRequestsCache,
  refreshPaymentsCache,
  refreshPenaltiesCache,
} from './PaymentService';

import { syncPvzSalarySettings } from './SupabaseSalarySettingsService';

import notificationService from './NotificationService';



const channels: ReturnType<typeof supabase.channel>[] = [];

const loginChannels: ReturnType<typeof supabase.channel>[] = [];



const REALTIME_DEBOUNCE_MS = 400;

const debouncedRefreshShiftRequests = debounceAsync(
  async (user: User) => refreshShiftRequests(user),
  REALTIME_DEBOUNCE_MS
);
const debouncedRefreshInvitations = debounceAsync(
  async (user: User) => refreshInvitations(user),
  REALTIME_DEBOUNCE_MS
);
const debouncedRefreshNotifications = debounceAsync(
  async (user: User) => refreshNotifications(user),
  REALTIME_DEBOUNCE_MS
);
const debouncedRefreshAdvanceRequests = debounceAsync(
  async (pvzIds: string[], user: User) => refreshAdvanceRequests(pvzIds, user),
  REALTIME_DEBOUNCE_MS
);
const debouncedRefreshPayments = debounceAsync(
  async (pvzIds: string[], user: User) => refreshPayments(pvzIds, user),
  REALTIME_DEBOUNCE_MS
);
const debouncedRefreshPenalties = debounceAsync(
  async (pvzIds: string[], user: User) => refreshPenalties(pvzIds, user),
  REALTIME_DEBOUNCE_MS
);
const debouncedRefreshSalarySettings = debounceAsync(
  async (pvzIds: string[], user: User) => refreshSalarySettings(pvzIds, user),
  REALTIME_DEBOUNCE_MS
);
const debouncedRefreshShifts = debounceAsync(
  async (user: User) => refreshShifts(user),
  REALTIME_DEBOUNCE_MS
);

async function getPvzIdsForUser(user: User): Promise<string[]> {

  if (user.role === 'owner') {

    const pvzs = await DataService.getPvzsByOwner(user.id);

    return pvzs.map((pvz) => pvz.id);

  }



  if (user.role === 'admin') {

    const pvzs = await DataService.getPvzsForAdmin(user);

    return pvzs.map((pvz) => pvz.id);

  }



  if (user.pvzId) {

    return [user.pvzId];

  }



  return [];

}



async function refreshAdvanceRequests(pvzIds: string[], user: User): Promise<void> {
  await Promise.all(
    pvzIds.map(async (pvzId) => {
      await refreshAdvanceRequestsCache(pvzId);
      DataService.emitChange(`advance_requests_${pvzId}`);
    })
  );



  if (user.role === 'employee') {

    DataService.emitChange(`advance_requests_employee_${user.id}`);

  }

}



async function refreshPayments(pvzIds: string[], user: User): Promise<void> {
  await Promise.all(pvzIds.map((pvzId) => refreshPaymentsCache(pvzId)));



  if (user.role === 'employee') {

    DataService.emitChange(`payments_employee_${user.id}`);

  }

}



async function refreshPenalties(pvzIds: string[], user: User): Promise<void> {

  await refreshPenaltiesCache(pvzIds);



  if (user.role === 'employee') {

    DataService.emitChange(`penalties_${user.id}`);

  }

}



async function refreshNotifications(user: User): Promise<void> {

  await notificationService.refreshNotificationsCache(user.id);

}



async function refreshSalarySettings(pvzIds: string[], user: User): Promise<void> {
  await Promise.all(
    pvzIds.map(async (pvzId) => {
      await syncPvzSalarySettings(pvzId);
      DataService.emitChange(`salary_settings_${pvzId}`);
      DataService.emitChange(`salary_formulas_${pvzId}`);
    })
  );



  if (user.role === 'employee') {

    DataService.emitChange(`employee_salary_settings_${user.id}`);

  }

}



async function refreshShifts(user: User): Promise<void> {
  await DataService.refreshShiftsCache();
  const pvzIds = await getPvzIdsForUser(user);
  pvzIds.forEach((pvzId) => {
    DataService.emitChange(`schedule_assignments_${pvzId}`);
  });
}

async function refreshShiftRequests(user: User): Promise<void> {

  await DataService.refreshShiftRequestsCache();

  if (user.role === 'employee') {

    DataService.emitChange(`shift_requests_${user.id}`);

  }

}



async function refreshInvitations(user: User): Promise<void> {

  await DataService.refreshInvitationsCache(user);

}



export function stopLoginSupabaseRealtime(): void {

  loginChannels.forEach((channel) => {

    supabase.removeChannel(channel);

  });

  loginChannels.length = 0;

}



/** Realtime приглашений на экране входа (после OTP, до signIn). */

export async function startLoginSupabaseRealtime(): Promise<void> {

  stopLoginSupabaseRealtime();



  if (!(await hasSupabaseSession())) {

    return;

  }



  const invitationsChannel = supabase

    .channel('login-invitations')

    .on(

      'postgres_changes',

      { event: '*', schema: 'public', table: 'invitations' },

      () => {

        DataService.refreshInvitationsForLogin().catch((error) => {

          console.warn('login realtime invitations:', error);

        });

      }

    )

    .subscribe();

  loginChannels.push(invitationsChannel);

}



export function stopSupabaseRealtime(): void {

  stopLoginSupabaseRealtime();

  channels.forEach((channel) => {

    supabase.removeChannel(channel);

  });

  channels.length = 0;

}



export async function startSupabaseRealtime(user: User): Promise<void> {

  stopSupabaseRealtime();



  if (!(await hasSupabaseSession())) {

    return;

  }



  const pvzIds = await getPvzIdsForUser(user);



  const shiftRequestsChannel = supabase

    .channel(`shift-requests-${user.id}`)

    .on(

      'postgres_changes',

      { event: '*', schema: 'public', table: 'shift_requests' },

      () => {

        debouncedRefreshShiftRequests(user).catch((error) => {

          console.warn('realtime shift_requests:', error);

        });

      }

    )

    .subscribe();

  channels.push(shiftRequestsChannel);



  const invitationsChannel = supabase

    .channel(`invitations-${user.id}`)

    .on(

      'postgres_changes',

      { event: '*', schema: 'public', table: 'invitations' },

      () => {

        debouncedRefreshInvitations(user).catch((error) => {

          console.warn('realtime invitations:', error);

        });

      }

    )

    .subscribe();

  channels.push(invitationsChannel);



  const notificationsChannel = supabase

    .channel(`notifications-${user.id}`)

    .on(

      'postgres_changes',

      { event: '*', schema: 'public', table: 'notifications' },

      () => {

        debouncedRefreshNotifications(user).catch((error) => {

          console.warn('realtime notifications:', error);

        });

      }

    )

    .subscribe();

  channels.push(notificationsChannel);



  if (pvzIds.length === 0) {

    return;

  }



  const advanceChannel = supabase

    .channel(`advance-requests-${user.id}`)

    .on(

      'postgres_changes',

      { event: '*', schema: 'public', table: 'advance_requests' },

      () => {

        debouncedRefreshAdvanceRequests(pvzIds, user).catch((error) => {

          console.warn('realtime advance_requests:', error);

        });

      }

    )

    .subscribe();

  channels.push(advanceChannel);



  const paymentsChannel = supabase

    .channel(`payments-${user.id}`)

    .on(

      'postgres_changes',

      { event: '*', schema: 'public', table: 'payments' },

      () => {

        debouncedRefreshPayments(pvzIds, user).catch((error) => {

          console.warn('realtime payments:', error);

        });

      }

    )

    .subscribe();

  channels.push(paymentsChannel);



  const penaltiesChannel = supabase

    .channel(`penalties-${user.id}`)

    .on(

      'postgres_changes',

      { event: '*', schema: 'public', table: 'penalties' },

      () => {

        debouncedRefreshPenalties(pvzIds, user).catch((error) => {

          console.warn('realtime penalties:', error);

        });

      }

    )

    .subscribe();

  channels.push(penaltiesChannel);



  const globalSalaryChannel = supabase

    .channel(`global-salary-${user.id}`)

    .on(

      'postgres_changes',

      { event: '*', schema: 'public', table: 'global_salary_settings' },

      () => {

        debouncedRefreshSalarySettings(pvzIds, user).catch((error) => {

          console.warn('realtime global_salary_settings:', error);

        });

      }

    )

    .subscribe();

  channels.push(globalSalaryChannel);



  const employeeSalaryChannel = supabase

    .channel(`employee-salary-${user.id}`)

    .on(

      'postgres_changes',

      { event: '*', schema: 'public', table: 'employee_salary_settings' },

      () => {

        debouncedRefreshSalarySettings(pvzIds, user).catch((error) => {

          console.warn('realtime employee_salary_settings:', error);

        });

      }

    )

    .subscribe();

  channels.push(employeeSalaryChannel);

  const shiftsChannel = supabase
    .channel(`shifts-${user.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shifts' },
      () => {
        debouncedRefreshShifts(user).catch((error) => {
          console.warn('realtime shifts:', error);
        });
      }
    )
    .subscribe();

  channels.push(shiftsChannel);

}


