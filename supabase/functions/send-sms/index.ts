import { Webhook } from 'standardwebhooks';

const SMS_AERO_BASE = 'https://gate.smsaero.ru/v2/sms/send';
const SMS_AERO_TIMEOUT_MS = 12_000;

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined;

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
  const login = Deno.env.get('SMS_AERO_LOGIN');
  const secret = Deno.env.get('SMS_AERO_SECRET');
  const sign = Deno.env.get('SMS_AERO_SIGN') ?? 'SMS Aero';

  if (!login || !secret) {
    throw new Error('SMS_AERO_LOGIN and SMS_AERO_SECRET must be set in function secrets');
  }

  const number = normalizePhoneForSmsAero(phone);
  const credentials = btoa(`${login}:${secret}`);

  const body = new URLSearchParams({
    number,
    text,
    sign,
  });

  const response = await Promise.race([
    fetch(SMS_AERO_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    }),
    sleep(SMS_AERO_TIMEOUT_MS).then(() => {
      throw new Error(`SMS Aero timeout after ${SMS_AERO_TIMEOUT_MS}ms`);
    }),
  ]);

  const result = (await response.json()) as SmsAeroResponse;

  if (!response.ok || result.success === false) {
    throw new Error(result.message ?? `SMS Aero HTTP ${response.status}`);
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
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
    const text =
      Deno.env.get('SMS_AERO_MESSAGE_TEMPLATE')?.replace('{code}', code) ??
      `Код подтверждения Персонал ПВЗ: ${code}`;

    const delivery = sendViaSmsAero(phone, text)
      .then(() => {
        console.log(`SMS sent to ${normalizePhoneForSmsAero(phone)}`);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('send-sms delivery error:', message);
      });

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(delivery);
    } else {
      await delivery;
    }

    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('send-sms error:', message);

    return jsonResponse(
      {
        error: {
          http_code: 500,
          message: `Failed to send SMS: ${message}`,
        },
      },
      500
    );
  }
});
