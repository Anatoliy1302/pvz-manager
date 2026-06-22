import { Payment, PaymentType } from '../types/payment';

import { isUuid, mergeById, resolvePvzId, resolveUserId } from '../utils/supabaseHelpers';

import { getToken } from '../../lib/authSessionStore';

import {

  readSnapshotArray,

} from '../../lib/snapshotSync';

import { upsertPvzPayment } from '../../lib/pvzFinanceService';

import { generateUuidV4 } from '../utils/generateSecureId';



const SNAPSHOT_KEY = 'payments';

const PAYMENTS_CACHE_TTL_MS = 45_000;



let paymentsCache: { at: number; data: Payment[] } | null = null;

let paymentsFetchInFlight: Promise<Payment[] | null> | null = null;



function cachePayments(data: Payment[]): Payment[] {

  paymentsCache = { at: Date.now(), data };

  return data;

}



export function invalidatePaymentsCache(): void {

  paymentsCache = null;

}



export async function fetchPaymentsFromSupabase(): Promise<Payment[] | null> {

  const now = Date.now();

  if (paymentsCache && now - paymentsCache.at < PAYMENTS_CACHE_TTL_MS) {

    return paymentsCache.data;

  }



  if (!(await getToken())) return null;



  if (paymentsFetchInFlight) {

    return paymentsFetchInFlight;

  }



  paymentsFetchInFlight = readSnapshotArray<Payment>(SNAPSHOT_KEY)

    .then((data) => cachePayments(data))

    .catch(() => null)

    .finally(() => {

      paymentsFetchInFlight = null;

    });



  return paymentsFetchInFlight;

}



export async function upsertPaymentToSupabase(payment: Payment): Promise<Payment | null> {

  if (!(await getToken()) || !payment.pvzId) return null;



  const localPvzId = payment.pvzId;

  const resolvedPvzId = await resolvePvzId(localPvzId);

  const employeeId = (await resolveUserId(payment.employeeId)) || payment.employeeId;



  const payload: Payment = {

    ...payment,

    id: payment.id && isUuid(payment.id) ? payment.id : generateUuidV4(),

    pvzId: resolvedPvzId,

    employeeId,

  };



  try {

    const synced = await upsertPvzPayment(localPvzId, payload);

    invalidatePaymentsCache();

    return { ...synced, pvzId: localPvzId };

  } catch (error) {

    if (__DEV__) {

      console.warn('upsertPaymentToSupabase:', error);

    }

    return null;

  }

}



export function mergePayments(local: Payment[], remote: Payment[]): Payment[] {

  const merged = mergeById(local, remote);

  return merged.map((payment) => {

    const localMatch = local.find((l) => l.id === payment.id);

    if (localMatch?.employeeName) {

      return {

        ...payment,

        employeeName: localMatch.employeeName,

        createdBy: localMatch.createdBy,

        createdByName: localMatch.createdByName,

      };

    }

    return payment;

  });

}

