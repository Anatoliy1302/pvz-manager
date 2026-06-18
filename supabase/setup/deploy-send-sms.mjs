/**
 * Deploy send-sms Edge Function (SMS Aero hook for Supabase Auth).
 *
 * Required secrets:
 *   SMS_AERO_LOGIN   — email в личном кабинете SMS Aero
 *   SMS_AERO_SECRET  — API-ключ из кабинета
 *   SEND_SMS_HOOK_SECRET — секрет из Dashboard → Auth → Hooks → Send SMS
 *
 * Optional:
 *   SMS_AERO_SIGN — имя отправителя (по умолчанию "SMS Aero")
 *   SMS_AERO_MESSAGE_TEMPLATE — шаблон текста, {code} = OTP
 *
 * Run: node supabase/setup/deploy-send-sms.mjs
 */
import { spawnSync } from 'child_process';

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

run('npx', ['supabase', 'functions', 'deploy', 'send-sms', '--project-ref', PROJECT_REF, '--no-verify-jwt']);

console.log('\nsend-sms deployed.');
console.log('Next: Dashboard → Authentication → Hooks → Send SMS');
console.log(`URL: https://${PROJECT_REF}.supabase.co/functions/v1/send-sms`);
