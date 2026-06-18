import { SmtpClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts';

const TOPIC_LABELS: Record<string, string> = {
  bug: 'Ошибка в приложении',
  feature: 'Предложение / что добавить',
  other: 'Другое',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  employee: 'Сотрудник',
};

interface SupportRecord {
  id?: string;
  topic?: string;
  message?: string;
  user_name?: string | null;
  user_role?: string | null;
  user_phone?: string | null;
  pvz_id?: string | null;
  pvz_name?: string | null;
  app_version?: string | null;
  platform?: string | null;
  created_at?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getTopicLabel(topic?: string): string {
  if (!topic) return 'Обращение';
  return TOPIC_LABELS[topic] ?? topic;
}

function getRoleLabel(role?: string | null): string {
  if (!role) return '—';
  return ROLE_LABELS[role] ?? role;
}

function buildEmailHtml(record: SupportRecord): string {
  const topicLabel = getTopicLabel(record.topic);
  const formattedDate = record.created_at
    ? new Date(record.created_at).toLocaleString('ru-RU')
    : new Date().toLocaleString('ru-RU');
  const message = escapeHtml((record.message ?? '').trim() || '—');

  return `
    <h2>Новое обращение в поддержку</h2>
    <p><strong>Тема:</strong> ${escapeHtml(topicLabel)}</p>
    <p><strong>От:</strong> ${escapeHtml(record.user_name ?? '—')}</p>
    <p><strong>Роль:</strong> ${escapeHtml(getRoleLabel(record.user_role))}</p>
    <p><strong>Телефон:</strong> ${escapeHtml(record.user_phone ?? '—')}</p>
    <p><strong>ПВЗ:</strong> ${escapeHtml(record.pvz_name ?? '—')}</p>
    <p><strong>Версия:</strong> ${escapeHtml(record.app_version ?? '—')}</p>
    <p><strong>Платформа:</strong> ${escapeHtml(record.platform ?? '—')}</p>
    <p><strong>Время:</strong> ${escapeHtml(formattedDate)}</p>
    <hr/>
    <p><strong>Сообщение:</strong></p>
    <p style="white-space:pre-wrap">${message}</p>
  `;
}

async function sendSupportEmail(record: SupportRecord): Promise<void> {
  const smtpUser = Deno.env.get('SMTP_USER') ?? 'noreply@pvzpersonal.ru';
  const smtpPassword = Deno.env.get('SMTP_PASSWORD');
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.mail.ru';
  const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '465');
  const emailTo = Deno.env.get('SUPPORT_EMAIL_TO') ?? smtpUser;

  if (!smtpPassword) {
    throw new Error('SMTP_PASSWORD не задан. Выполните: supabase secrets set SMTP_PASSWORD=...');
  }

  const topicLabel = getTopicLabel(record.topic);
  const client = new SmtpClient();

  await client.connectTLS({
    hostname: smtpHost,
    port: smtpPort,
    username: smtpUser,
    password: smtpPassword,
  });

  await client.send({
    from: smtpUser,
    to: emailTo,
    subject: `[Персонал ПВЗ] ${topicLabel}`,
    html: buildEmailHtml(record),
  });

  await client.close();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const expectedSecret = Deno.env.get('WEBHOOK_SECRET');
  if (!expectedSecret) {
    return new Response(JSON.stringify({ error: 'WEBHOOK_SECRET не настроен' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const receivedSecret = req.headers.get('x-webhook-secret');
  if (receivedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = await req.json();

    if (payload?.type !== 'INSERT' || !payload?.record) {
      return new Response(JSON.stringify({ message: 'Ignored' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const record = payload.record as SupportRecord;
    await sendSupportEmail(record);

    console.log(`Email sent for support message ${record.id ?? 'unknown'}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Support notification error:', message);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
