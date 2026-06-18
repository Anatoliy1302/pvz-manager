/**
 * Email OTP для владельца: 6 цифр, без magic link.
 *
 * Важно: при mailer_autoconfirm=false новые пользователи получают шаблон
 * «Confirm signup» со ссылкой, а не код. Включаем autoconfirm — подтверждение
 * через verifyOtp в приложении.
 *
 * Run: node supabase/setup/apply-email-otp-template.mjs
 */
import fs from 'fs';
import path from 'path';

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';
const OTP_LENGTH = 6;

function loadAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }

  const mcpPath = path.resolve(process.cwd(), '.cursor/mcp.json');
  if (fs.existsSync(mcpPath)) {
    const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    const token = mcp?.mcpServers?.supabase?.env?.SUPABASE_ACCESS_TOKEN;
    if (token) return token.trim();
  }

  throw new Error(
    'SUPABASE_ACCESS_TOKEN не найден. Задайте переменную окружения или настройте .cursor/mcp.json'
  );
}

function loadTemplate(relativePath) {
  const templatePath = path.resolve(process.cwd(), relativePath);
  return fs.readFileSync(templatePath, 'utf8').trim();
}

function assertOtpOnlyTemplate(html, label) {
  const forbidden = ['ConfirmationURL', 'TokenHash', 'RedirectTo', 'href='];
  const found = forbidden.filter((needle) => html.includes(needle));
  if (found.length > 0) {
    throw new Error(`${label}: шаблон содержит magic link: ${found.join(', ')}`);
  }
  if (!html.includes('{{ .Token }}')) {
    throw new Error(`${label}: шаблон должен содержать {{ .Token }}`);
  }
}

const token = loadAccessToken();
const magicLinkContent = loadTemplate('supabase/templates/magic-link-otp.html');
const confirmationContent = loadTemplate('supabase/templates/confirmation-otp.html');
assertOtpOnlyTemplate(magicLinkContent, 'magic_link');
assertOtpOnlyTemplate(confirmationContent, 'confirmation');

const payload = {
  mailer_autoconfirm: true,
  mailer_otp_length: OTP_LENGTH,
  mailer_otp_exp: 3600,
  mailer_subjects_magic_link: 'Код для входа в PVZ Personal',
  mailer_templates_magic_link_content: magicLinkContent,
  mailer_subjects_confirmation: 'Код для входа в PVZ Personal',
  mailer_templates_confirmation_content: confirmationContent,
};

const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
if (!response.ok) {
  console.error('Supabase Auth config update failed:', response.status, text.slice(0, 500));
  process.exit(1);
}

const result = JSON.parse(text);

function checkTemplate(name, html) {
  return {
    usesToken: html.includes('{{ .Token }}'),
    usesLink: html.includes('ConfirmationURL'),
  };
}

const magic = checkTemplate('magic_link', result.mailer_templates_magic_link_content ?? '');
const confirm = checkTemplate('confirmation', result.mailer_templates_confirmation_content ?? '');

console.log('Email OTP config applied.');
console.log(`  mailer_autoconfirm: ${result.mailer_autoconfirm}`);
console.log(`  mailer_otp_length: ${result.mailer_otp_length}`);
console.log(`  magic_link: Token=${magic.usesToken}, Link=${magic.usesLink}`);
console.log(`  confirmation: Token=${confirm.usesToken}, Link=${confirm.usesLink}`);
