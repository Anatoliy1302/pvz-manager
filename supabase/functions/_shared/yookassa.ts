export type PaymentKind = 'initial' | 'renewal' | 'autopay';

/** Товар «Подписка Pro» — 30 дней (настраивается в кабинете ЮKassa) */
export const PRO_SUBSCRIPTION_PRODUCT_ID = 'subscription_pro';
export const PRO_SUBSCRIPTION_PRODUCT_NAME = 'Подписка Pro';
export const PRO_SUBSCRIPTION_PERIOD_DAYS = 30;

const YOOKASSA_API = 'https://api.yookassa.ru/v3';

export interface YooKassaAmount {
  value: string;
  currency: string;
}

export interface YooKassaPaymentMethod {
  id: string;
  saved?: boolean;
  type?: string;
}

export interface YooKassaPayment {
  id: string;
  status: string;
  paid: boolean;
  test?: boolean;
  amount: YooKassaAmount;
  metadata?: Record<string, string>;
  payment_method?: YooKassaPaymentMethod;
  confirmation?: {
    type: string;
    confirmation_url?: string;
    return_url?: string;
  };
}

export interface CreatePaymentParams {
  amountRub: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
  idempotenceKey: string;
  test?: boolean;
  /** ЮKassa: сохранить способ оплаты для автоплатежей (вместо параметра recurring) */
  savePaymentMethod?: boolean;
}

export interface CreateAutopaymentParams {
  amountRub: number;
  description: string;
  paymentMethodId: string;
  metadata: Record<string, string>;
  idempotenceKey: string;
}

/** true, 1, yes — тестовый режим ЮKassa (разработка) */
export function isYooKassaTestMode(): boolean {
  const value = Deno.env.get('YOOKASSA_TEST_MODE')?.trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

export function isYooKassaAutopayEnabled(): boolean {
  const value = Deno.env.get('YOOKASSA_AUTOPAY_ENABLED')?.trim().toLowerCase();
  if (value === 'false' || value === '0' || value === 'no') return false;
  return true;
}

export function buildSubscriptionMetadata(
  userId: string,
  pvzCount: number,
  pricePerPvz: number,
  paymentKind: PaymentKind
): Record<string, string> {
  return {
    user_id: userId,
    tier: 'pro',
    product_id: PRO_SUBSCRIPTION_PRODUCT_ID,
    product_name: PRO_SUBSCRIPTION_PRODUCT_NAME,
    period_days: String(PRO_SUBSCRIPTION_PERIOD_DAYS),
    recurring: 'true',
    payment_kind: paymentKind,
    pvz_count: String(pvzCount),
    price_per_pvz: String(pricePerPvz),
  };
}

function getCredentials(): { shopId: string; secretKey: string } {
  const shopId = Deno.env.get('YOOKASSA_SHOP_ID');
  const secretKey = Deno.env.get('YOOKASSA_SECRET_KEY');

  if (!shopId || !secretKey) {
    throw new Error('YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY must be set in function secrets');
  }

  return { shopId, secretKey };
}

function authHeader(): string {
  const { shopId, secretKey } = getCredentials();
  return `Basic ${btoa(`${shopId}:${secretKey}`)}`;
}

function formatAmount(rub: number): string {
  return rub.toFixed(2);
}

async function postPayment(
  payload: Record<string, unknown>,
  idempotenceKey: string
): Promise<YooKassaPayment> {
  const response = await fetch(`${YOOKASSA_API}/payments`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotenceKey,
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as YooKassaPayment & { description?: string; code?: string };

  if (!response.ok) {
    const message = body.description ?? `YooKassa HTTP ${response.status}`;
    throw new Error(message);
  }

  return body;
}

export async function createYooKassaPayment(params: CreatePaymentParams): Promise<YooKassaPayment> {
  const payload: Record<string, unknown> = {
    amount: {
      value: formatAmount(params.amountRub),
      currency: 'RUB',
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: params.returnUrl,
    },
    description: params.description,
    metadata: params.metadata,
  };

  if (params.savePaymentMethod) {
    payload.save_payment_method = true;
  }

  if (params.test) {
    payload.test = true;
  }

  return postPayment(payload, params.idempotenceKey);
}

/** Безакцептное списание по сохранённому способу оплаты */
export async function createYooKassaAutopayment(
  params: CreateAutopaymentParams
): Promise<YooKassaPayment> {
  return postPayment(
    {
      amount: {
        value: formatAmount(params.amountRub),
        currency: 'RUB',
      },
      capture: true,
      payment_method_id: params.paymentMethodId,
      description: params.description,
      metadata: params.metadata,
    },
    params.idempotenceKey
  );
}

export async function fetchYooKassaPayment(paymentId: string): Promise<YooKassaPayment> {
  const response = await fetch(`${YOOKASSA_API}/payments/${paymentId}`, {
    method: 'GET',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
  });

  const body = (await response.json()) as YooKassaPayment & { description?: string };

  if (!response.ok) {
    const message = body.description ?? `YooKassa HTTP ${response.status}`;
    throw new Error(message);
  }

  return body;
}
