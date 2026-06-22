import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

// Supabase Auth Hook ~5 сек. Отправка синхронная; при ошибке — корректный HTTP-код.
const API_FETCH_TIMEOUT_MS = 4_000;

const NOTISEND_API = 'https://api.notisend.ru/v1/email/messages';
const SUBJECT = 'Код для входа в PVZ Personal';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type SmtpTlsConn = Deno.TlsConn;

interface EmailData {
  token?: string;
  email_action_type?: string;
}

interface HookPayload {
  user?: { email?: string };
  email_data?: EmailData;
}

class NotiSendApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(`NotiSend API ${status}: ${body.slice(0, 300)}`);
    this.name = 'NotiSendApiError';
  }
}

class EmailRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds?: number) {
    super('too many messages');
    this.name = 'EmailRateLimitError';
  }
}

function parseRetryAfterSeconds(text: string): number | undefined {
  const match = text.match(/try again in (\d+) seconds/i);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

const DEFAULT_RATE_LIMIT_SECONDS = 900;

function detectRateLimit(error: unknown): number | undefined {
  if (error instanceof NotiSendApiError && error.status === 429) {
    return error.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_SECONDS;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/too many messages/i.test(message)) {
    return parseRetryAfterSeconds(message) ?? DEFAULT_RATE_LIMIT_SECONDS;
  }
  return undefined;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildOtpHtml(token: string): string {
  return `<h2>Код для входа в PVZ Personal</h2>
<p>Введите этот код в приложении:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:24px 0">${token}</p>
<p>Код действителен 1 час. Никому не сообщайте его.</p>`;
}

function buildPlainText(token: string): string {
  return `Код для входа в PVZ Personal: ${token}\n\nКод действителен 1 час. Никому не сообщайте его.`;
}

function toBase64(value: string): string {
  const bytes = textEncoder.encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function encodeMimeSubject(subject: string): string {
  return `=?UTF-8?B?${toBase64(subject)}?=`;
}

async function smtpWrite(conn: SmtpTlsConn, data: string): Promise<void> {
  const bytes = textEncoder.encode(data);
  let offset = 0;
  while (offset < bytes.length) {
    const written = await conn.write(bytes.subarray(offset));
    if (written === 0) {
      throw new Error('SMTP write blocked');
    }
    offset += written;
  }
}

async function smtpReadResponse(conn: SmtpTlsConn): Promise<{ code: number; message: string }> {
  let buffer = '';
  const readBuf = new Uint8Array(4096);

  while (true) {
    while (!buffer.includes('\n')) {
      const n = await conn.read(readBuf);
      if (n === null) {
        throw new Error('SMTP connection closed');
      }
      buffer += textDecoder.decode(readBuf.subarray(0, n));
    }

    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';

    for (const line of parts) {
      if (!line) continue;
      const code = Number.parseInt(line.slice(0, 3), 10);
      const isComplete = line.length >= 4 && line[3] === ' ';
      if (!isComplete) continue;
      if (Number.isNaN(code) || code >= 400) {
        throw new Error(`SMTP ${line}`);
      }
      return { code, message: line };
    }
  }
}

async function smtpCommand(conn: SmtpTlsConn, command: string): Promise<{ code: number; message: string }> {
  await smtpWrite(conn, `${command}\r\n`);
  return smtpReadResponse(conn);
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaNotiSendApi(to: string, token: string): Promise<void> {
  const apiKey =
    Deno.env.get('NOTISEND_API_KEY') ?? Deno.env.get('NOTISEND_SMTP_PASSWORD');
  const fromEmail =
    Deno.env.get('NOTISEND_FROM_EMAIL') ?? 'noreply@pvzpersonal.ru';

  if (!apiKey) {
    throw new Error('NOTISEND_API_KEY / NOTISEND_SMTP_PASSWORD не задан в secrets');
  }

  const response = await fetchWithTimeout(
    NOTISEND_API,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        from_email: fromEmail,
        from_name: Deno.env.get('NOTISEND_FROM_NAME') ?? 'PVZ Personal',
        subject: SUBJECT,
        html: buildOtpHtml(token),
        text: buildPlainText(token),
      }),
    },
    API_FETCH_TIMEOUT_MS,
  );

  const text = await response.text();
  console.log(`[send-auth-email] NotiSend API ${response.status}: ${text.slice(0, 200)}`);

  if (!response.ok) {
    throw new NotiSendApiError(
      response.status,
      text,
      response.status === 429 ? parseRetryAfterSeconds(text) : undefined,
    );
  }

  let messageId: number | undefined;
  try {
    const parsed = JSON.parse(text) as { id?: number; status?: string };
    messageId = parsed.id;
    if (parsed.status === 'soft_bounced' || parsed.status === 'hard_bounced') {
      throw new Error(`delivery_${parsed.status}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('delivery_')) {
      throw error;
    }
  }

  if (messageId) {
    const pollDelivery = async (): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      try {
        const statusRes = await fetchWithTimeout(
          `${NOTISEND_API}/${messageId}`,
          { headers: { Authorization: `Bearer ${apiKey}` } },
          2_000,
        );
        const statusText = await statusRes.text();
        const delivery = JSON.parse(statusText) as { status?: string };
        console.log(
          `[send-auth-email] NotiSend delivery id=${messageId} status=${delivery.status ?? 'unknown'}`,
        );
        if (delivery.status === 'soft_bounced' || delivery.status === 'hard_bounced') {
          console.error(`[send-auth-email] delivery_${delivery.status} id=${messageId}`);
        }
      } catch (error) {
        console.warn(
          `[send-auth-email] delivery poll skipped: ${error instanceof Error ? error.message : error}`,
        );
      }
    };

  if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
      EdgeRuntime.waitUntil(pollDelivery());
    } else {
      void pollDelivery();
    }
  }
}

async function sendViaNotiSendSmtp(to: string, token: string): Promise<void> {
  const smtpUser = Deno.env.get('NOTISEND_SMTP_USER');
  const smtpPassword =
    Deno.env.get('NOTISEND_SMTP_PASSWORD') ?? Deno.env.get('NOTISEND_API_KEY');
  const smtpHost = Deno.env.get('NOTISEND_SMTP_HOST') ?? 'smtp.msndr.net';
  const smtpPort = Number(Deno.env.get('NOTISEND_SMTP_PORT') ?? '465');
  const fromEmail =
    Deno.env.get('NOTISEND_FROM_EMAIL') ?? 'noreply@pvzpersonal.ru';
  const fromName = Deno.env.get('NOTISEND_FROM_NAME') ?? 'PVZ Personal';

  if (!smtpUser || !smtpPassword) {
    throw new Error('NOTISEND_SMTP_USER / NOTISEND_SMTP_PASSWORD не заданы');
  }

  const conn = await Deno.connectTls({ hostname: smtpHost, port: smtpPort });

  try {
    await smtpReadResponse(conn);
    await smtpCommand(conn, `EHLO ${smtpHost}`);
    await smtpCommand(conn, 'AUTH LOGIN');
    await smtpCommand(conn, toBase64(smtpUser));
    await smtpCommand(conn, toBase64(smtpPassword));
    await smtpCommand(conn, `MAIL FROM:<${fromEmail}>`);
    await smtpCommand(conn, `RCPT TO:<${to}>`);
    await smtpCommand(conn, 'DATA');

    const boundary = `----=_Part_${crypto.randomUUID()}`;
    const html = buildOtpHtml(token);
    const plain = buildPlainText(token);
    const mimeBody = [
      `From: ${fromName} <${fromEmail}>`,
      `To: ${to}`,
      `Subject: ${encodeMimeSubject(SUBJECT)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      toBase64(plain),
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      toBase64(html),
      `--${boundary}--`,
      '',
    ].join('\r\n');

    await smtpWrite(conn, `${mimeBody}\r\n.\r\n`);
    await smtpReadResponse(conn);
    await smtpCommand(conn, 'QUIT');
    console.log(`[send-auth-email] SMTP OK → ${to}`);
  } finally {
    try {
      conn.close();
    } catch {
      // ignore close errors
    }
  }
}

/** NotiSend API первым (быстрее hook timeout); SMTP — запасной канал. */
async function sendOtpEmail(to: string, token: string): Promise<void> {
  let apiError: unknown;

  try {
    await sendViaNotiSendApi(to, token);
    return;
  } catch (error) {
    apiError = error;
    const retryAfter = detectRateLimit(error);
    if (retryAfter !== undefined) {
      throw new EmailRateLimitError(retryAfter);
    }
    const message = error instanceof Error ? error.message : String(error);
  const isDeliveryBounce = message.startsWith('delivery_');
    console.warn(
      `[send-auth-email] API failed${isDeliveryBounce ? ' (mail provider rejected)' : ''}: ${message}`,
    );
  }

  try {
    await sendViaNotiSendSmtp(to, token);
  } catch (error) {
    const retryAfter = detectRateLimit(error) ?? detectRateLimit(apiError);
    if (retryAfter !== undefined) {
      throw new EmailRateLimitError(retryAfter);
    }
    throw error;
  }
}

function verifySupabaseHook(payload: string, headers: Headers): HookPayload {
  const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET');
  if (!hookSecret) {
    throw new Error('SEND_EMAIL_HOOK_SECRET is not configured');
  }

  const base64Secret = hookSecret.replace(/^v1,whsec_/, '');
  const wh = new Webhook(base64Secret);
  return wh.verify(payload, Object.fromEntries(headers)) as HookPayload;
}

function extractEmailAndToken(payload: HookPayload): {
  email: string;
  token: string;
} {
  const email = payload.user?.email ?? '';
  const token = payload.email_data?.token ?? '';

  if (!email || !token) {
    throw new Error('Missing email or OTP token in hook payload');
  }

  return { email, token };
}

function hookErrorResponse(message: string, httpCode = 500): Response {
  return jsonResponse(
    {
      error: {
        http_code: httpCode,
        message: `Failed to send email: ${message}`,
      },
    },
    httpCode,
  );
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();

  if (req.method !== 'POST') {
    if (req.method === 'GET') {
      return jsonResponse({ ok: true, service: 'send-auth-email' }, 200);
    }
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const rawBody = await req.text();

  try {
    let payload: HookPayload;
    const isHookRequest =
      req.headers.has('webhook-id') || req.headers.has('webhook-signature');

    if (isHookRequest) {
      payload = verifySupabaseHook(rawBody, req.headers);
    } else {
      payload = JSON.parse(rawBody) as HookPayload;
    }

    const { email, token } = extractEmailAndToken(payload);
    const actionType = payload.email_data?.email_action_type ?? 'unknown';
    console.log(
      `[send-auth-email][${requestId}] send ${email}, type ${actionType}, token ${token.slice(0, 3)}***`,
    );

    await sendOtpEmail(email, token);

    console.log(
      `[send-auth-email][${requestId}] OK in ${Date.now() - startedAt}ms`,
    );
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[send-auth-email][${requestId}] FAIL in ${Date.now() - startedAt}ms: ${message}`,
    );

    if (error instanceof EmailRateLimitError) {
      const waitMin = error.retryAfterSeconds
        ? Math.ceil(error.retryAfterSeconds / 60)
        : 15;
      return hookErrorResponse(
        `Too many messages. Try again in ${waitMin} minutes.`,
        429,
      );
    }

    return hookErrorResponse(message);
  }
});
