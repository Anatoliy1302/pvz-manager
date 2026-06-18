/** Quick SMTP test — password from .env NOTISEND_SMTP_PASSWORD */
import fs from 'fs';
import nodemailer from 'nodemailer';

function loadEnv(name) {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return match?.[1]?.trim();
}

const pass = loadEnv('NOTISEND_SMTP_PASSWORD');
const user = loadEnv('NOTISEND_SMTP_USER') ?? 'krv_kravec@mail.ru';
const from = loadEnv('NOTISEND_FROM_EMAIL') ?? 'noreply@pvzpersonal.ru';
const to = loadEnv('SUPPORT_EMAIL_TO') ?? 'razrabotka_vl@mail.ru';

if (!pass) {
  console.error('NOTISEND_SMTP_PASSWORD missing');
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host: 'smtp.msndr.net',
  port: 465,
  secure: true,
  auth: { user, pass },
});

try {
  const info = await transport.sendMail({
    from: `"PVZ Personal" <${from}>`,
    to,
    subject: 'PVZ Personal — тест SMTP OTP',
    html: '<p>Если видите это письмо, NotiSend SMTP работает.</p>',
  });
  console.log('SMTP OK:', info.messageId ?? info.response ?? 'sent');
} catch (error) {
  console.error('SMTP FAIL:', error instanceof Error ? error.message : error);
  process.exit(1);
}
