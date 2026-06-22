import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

const SMS_AERO_BASE = 'https://gate.smsaero.ru/v2/sms/send';
const SMS_AERO_TIMEOUT_MS = 4_000;

interface SmsAeroResponse {
  success?: boolean;
  message?: string;
  data?: unknown;
}

interface HookPayload {
  user?: { phone?: string };
  sms?: { otp?: string };
  phone?: string;
  code?: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** +79991234567 / 89991234567 → 79991234567 для SMS Aero */
function normalizePhoneForSmsAero(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `7${digits}`;
  }
  return digits;
}

function extractPhoneAndCode(payload: HookPayload): { phone: string; code: string } {
  const phone = payload.user?.phone ?? payload.phone ?? '';
  const code = payload.sms?.otp ?? payload.code ?? '';

  if (!phone || !code) {
    throw new Error('Missing phone or OTP code in request body');
  }

  return { phone, code };
}

async function sendViaSmsAero(phone: string, text: string): Promise<SmsAeroResponse> {
  const login = Deno.env.get('SMS_AERO_LOGIN') ?? Deno.env.get('SMS_AERO_EMAIL');
  const secret =
    Deno.env.get('SMS_AERO_SECRET') ??
    Deno.env.get('SMS_AERO_API_KEY');
  // «SMS Aero» — встроенная подпись без модерации; кастомное имя — после одобрения в кабинете (≤11 символов).
  const sign = Deno.env.get('SMS_AERO_SIGN') ?? 'SMS Aero';

  if (!login || !secret) {
    throw new Error(
      'SMS_AERO_LOGIN/SMS_AERO_SECRET (или SMS_AERO_EMAIL/SMS_AERO_API_KEY) must be set in function secrets',
    );
  }

  const number = normalizePhoneForSmsAero(phone);
  const credentials = btoa(`${login}:${secret}`);

  const payload = {
    number,
    text,
    sign,
    channel: 'DIRECT',
  };

  const response = await Promise.race([
    fetch(SMS_AERO_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    }),
    sleep(SMS_AERO_TIMEOUT_MS).then(() => {
      throw new Error(`SMS Aero timeout after ${SMS_AERO_TIMEOUT_MS}ms`);
    }),
  ]);

  const result = (await response.json()) as SmsAeroResponse;
  console.log(
    `[send-sms] SMS Aero ${response.status}: ${JSON.stringify(result).slice(0, 300)}`
  );

  if (!response.ok || result.success === false) {
    const detail = result.message ?? `SMS Aero HTTP ${response.status}`;
    if (/validation/i.test(detail)) {
      throw new Error(
        `${detail} — проверьте SMS_AERO_SIGN («${sign}») в кабинете SMS Aero и одобрение отправителя`
      );
    }
    throw new Error(detail);
  }

  return result;
}

function verifySupabaseHook(payload: string, headers: Headers): HookPayload {
  const hookSecret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  if (!hookSecret) {
    throw new Error('SEND_SMS_HOOK_SECRET is not configured');
  }

  const base64Secret = hookSecret.replace(/^v1,whsec_/, '');
  const wh = new Webhook(base64Secret);
  return wh.verify(payload, Object.fromEntries(headers)) as HookPayload;
}

function hookErrorResponse(message: string, httpCode = 500): Response {
  return jsonResponse(
    {
      error: {
        http_code: httpCode,
        message: `Failed to send SMS: ${message}`,
      },
    },
    httpCode
  );
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();

  if (req.method !== 'POST') {
    if (req.method === 'GET') {
      return jsonResponse({ ok: true, service: 'send-sms' }, 200);
    }
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const rawBody = await req.text();

  try {
    let payload: HookPayload;

    const isHookRequest = req.headers.has('webhook-id') || req.headers.has('webhook-signature');

    if (isHookRequest) {
      payload = verifySupabaseHook(rawBody, req.headers);
    } else {
      payload = JSON.parse(rawBody) as HookPayload;
    }

    const { phone, code } = extractPhoneAndCode(payload);
    const masked = normalizePhoneForSmsAero(phone).replace(/(\d{4})\d+(\d{2})/, '$1***$2');
    console.log(`[send-sms][${requestId}] send ${masked}, token ${code.slice(0, 3)}***`);

    const text =
      Deno.env.get('SMS_AERO_MESSAGE_TEMPLATE')?.replace('{code}', code) ??
      `Код подтверждения PVZ Personal: ${code}`;

    await sendViaSmsAero(phone, text);

    console.log(`[send-sms][${requestId}] OK in ${Date.now() - startedAt}ms`);
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[send-sms][${requestId}] FAIL in ${Date.now() - startedAt}ms: ${message}`);
    return hookErrorResponse(message);
  }
});
