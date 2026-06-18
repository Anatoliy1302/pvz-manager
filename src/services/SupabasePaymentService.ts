import { supabase } from '../../lib/supabase';
import { fetchAllFromQuery } from '../../lib/supabasePagination';
import { supabaseRestGetAll } from '../../lib/supabaseRest';
import { Payment, PaymentType } from '../types/payment';
import { isUuid, mergeById, resolvePvzId, resolveUserId } from '../utils/supabaseHelpers';
import { safeParseJson } from '../utils/safeJson';
import { PAYMENT_COLUMNS } from './supabase/selectColumns';
import {
  getAuthAccessToken,
  ensureSupabaseClientSession,
  warmSupabaseClientSession,
} from './SupabaseAuthService';

const PAYMENT_META_PREFIX = '__meta__:';
const PAYMENTS_CACHE_TTL_MS = 45_000;

let paymentsCache: { at: number; data: Payment[] } | null = null;
let paymentsFetchInFlight: Promise<Payment[] | null> | null = null;

function encodePaymentNote(type: PaymentType, note?: string): string {
  return `${PAYMENT_META_PREFIX}${JSON.stringify({ type, note: note || '' })}`;
}

function decodePaymentNote(rawNote: string | null): { type: PaymentType; note?: string } {
  if (!rawNote?.startsWith(PAYMENT_META_PREFIX)) {
    return { type: 'salary', note: rawNote || undefined };
  }
  try {
    const parsed = safeParseJson<{ type?: PaymentType; note?: string }>(
      rawNote.slice(PAYMENT_META_PREFIX.length),
      {}
    );
    return {
      type: (parsed.type as PaymentType) || 'salary',
      note: parsed.note || undefined,
    };
  } catch {
    return { type: 'salary', note: rawNote };
  }
}

function rowToPayment(row: Record<string, unknown>): Payment {
  const meta = decodePaymentNote(row.note as string | null);
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    employeeName: '',
    amount: Number(row.amount),
    type: meta.type,
    periodStart: (row.period_start as string) || '',
    periodEnd: (row.period_end as string) || '',
    paidAt: (row.created_at as string) || new Date().toISOString(),
    note: meta.note,
    createdBy: '',
    createdByName: '',
    status: (row.status as Payment['status']) || 'completed',
    pvzId: row.pvz_id as string,
  };
}

async function paymentToRow(payment: Payment): Promise<Record<string, unknown> | null> {
  const pvzId = await resolvePvzId(payment.pvzId);
  const employeeId = await resolveUserId(payment.employeeId);
  if (!employeeId || !isUuid(pvzId)) return null;

  const row: Record<string, unknown> = {
    pvz_id: pvzId,
    employee_id: employeeId,
    amount: payment.amount,
    period_start: payment.periodStart || null,
    period_end: payment.periodEnd || null,
    status: payment.status || 'completed',
    note: encodePaymentNote(payment.type, payment.note),
  };

  if (payment.id && isUuid(payment.id)) {
    row.id = payment.id;
  }

  return row;
}

function cachePayments(data: Payment[]): Payment[] {
  paymentsCache = { at: Date.now(), data };
  return data;
}

async function fetchPaymentsViaRest(accessToken: string): Promise<Payment[] | null> {
  const rows = await supabaseRestGetAll<Record<string, unknown>>(
    'payments',
    `select=${PAYMENT_COLUMNS}&order=created_at.desc`,
    accessToken
  );
  if (rows === null) return null;
  return rows.map((row) => rowToPayment(row));
}

async function fetchPaymentsRemote(): Promise<Payment[] | null> {
  const accessToken = await getAuthAccessToken();
  if (!accessToken) return null;

  const viaRest = await fetchPaymentsViaRest(accessToken);
  if (viaRest) {
    warmSupabaseClientSession();
    return viaRest;
  }

  if (!(await ensureSupabaseClientSession())) return null;

  const data = await fetchAllFromQuery<Record<string, unknown>>(() =>
    supabase.from('payments').select(PAYMENT_COLUMNS).order('created_at', { ascending: false })
  );

  if (!data) {
    console.warn('fetchPaymentsFromSupabase: paginated fetch failed');
    return null;
  }

  return data.map((row) => rowToPayment(row));
}

export function invalidatePaymentsCache(): void {
  paymentsCache = null;
}

export async function fetchPaymentsFromSupabase(): Promise<Payment[] | null> {
  const now = Date.now();
  if (paymentsCache && now - paymentsCache.at < PAYMENTS_CACHE_TTL_MS) {
    return paymentsCache.data;
  }

  if (paymentsFetchInFlight) {
    return paymentsFetchInFlight;
  }

  paymentsFetchInFlight = fetchPaymentsRemote()
    .then((data) => (data ? cachePayments(data) : null))
    .finally(() => {
      paymentsFetchInFlight = null;
    });

  return paymentsFetchInFlight;
}

export async function upsertPaymentToSupabase(payment: Payment): Promise<Payment | null> {
  if (!(await ensureSupabaseClientSession())) return null;

  const row = await paymentToRow(payment);
  if (!row) return null;

  const { data, error } = await supabase
    .from('payments')
    .upsert(row, { onConflict: 'id' })
    .select(PAYMENT_COLUMNS)
    .single();

  if (error) {
    const { data: inserted, error: insertError } = await supabase
      .from('payments')
      .insert(row)
      .select(PAYMENT_COLUMNS)
      .single();

    if (insertError) {
      console.warn('upsertPaymentToSupabase:', insertError.message);
      return null;
    }
    invalidatePaymentsCache();
    const synced = rowToPayment(inserted as Record<string, unknown>);
    return { ...payment, ...synced, employeeName: payment.employeeName };
  }

  invalidatePaymentsCache();
  const synced = rowToPayment(data as Record<string, unknown>);
  return { ...payment, ...synced, employeeName: payment.employeeName };
}

export function mergePayments(local: Payment[], remote: Payment[]): Payment[] {
  const merged = mergeById(local, remote);
  return merged.map((payment) => {
    const localMatch = local.find((l) => l.id === payment.id);
    if (localMatch?.employeeName) {
      return { ...payment, employeeName: localMatch.employeeName, createdBy: localMatch.createdBy, createdByName: localMatch.createdByName };
    }
    return payment;
  });
}
