/**
 * Deploy create-payment and payment-webhook Edge Functions (ЮKassa).
 *
 * Required Supabase secrets:
 *   YOOKASSA_SHOP_ID      — идентификатор магазина в ЮKassa
 *   YOOKASSA_SECRET_KEY   — секретный ключ API
 *
 * Optional:
 *   YOOKASSA_RETURN_URL   — URL возврата после оплаты (pvzpersonal://payment/success)
 *   YOOKASSA_TEST_MODE    — true/1/yes для разработки (тестовые платежи, test=true в API)
 *   YOOKASSA_AUTOPAY_ENABLED — true/1/yes для автосписания (save_payment_method + cron)
 *   SUBSCRIPTION_CRON_SECRET — Bearer-токен для process-subscription-renewals
 *
 * Cron (ежедневно):
 *   POST https://<project-ref>.supabase.co/functions/v1/process-subscription-renewals
 *   Authorization: Bearer <SUBSCRIPTION_CRON_SECRET>
 *
 * Test mode:
 *   - Используйте shop_id и secret_key тестового магазина из кабинета ЮKassa
 *   - YOOKASSA_TEST_MODE=true — webhook активирует подписку по тестовым платежам
 *   - YOOKASSA_TEST_MODE=false (prod) — тестовые платежи игнорируются
 *
 * After deploy:
 *   1. Apply migration: node supabase/setup/apply-migration-16130000.mjs
 *   2. Set secrets: npx supabase secrets set YOOKASSA_SHOP_ID=... YOOKASSA_SECRET_KEY=... YOOKASSA_TEST_MODE=true
 *   3. In ЮKassa → Интеграция → HTTP-уведомления:
 *      URL: https://<project-ref>.supabase.co/functions/v1/payment-webhook
 *      События: payment.succeeded
 *
 * Run: node supabase/setup/deploy-payments.mjs
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

run('npx', [
  'supabase',
  'functions',
  'deploy',
  'create-payment',
  '--project-ref',
  PROJECT_REF,
]);

run('npx', [
  'supabase',
  'functions',
  'deploy',
  'payment-webhook',
  '--project-ref',
  PROJECT_REF,
  '--no-verify-jwt',
]);

run('npx', [
  'supabase',
  'functions',
  'deploy',
  'process-subscription-renewals',
  '--project-ref',
  PROJECT_REF,
  '--no-verify-jwt',
]);

run('npx', [
  'supabase',
  'functions',
  'deploy',
  'cancel-subscription',
  '--project-ref',
  PROJECT_REF,
]);

run('npx', [
  'supabase',
  'functions',
  'deploy',
  'delete-account',
  '--project-ref',
  PROJECT_REF,
  '--no-verify-jwt',
]);

run('npx', [
  'supabase',
  'functions',
  'deploy',
  'delete-owner-by-pin',
  '--project-ref',
  PROJECT_REF,
  '--no-verify-jwt',
]);

console.log('\nPayment functions deployed.');
console.log(`create-payment:  https://${PROJECT_REF}.supabase.co/functions/v1/create-payment`);
console.log(`payment-webhook: https://${PROJECT_REF}.supabase.co/functions/v1/payment-webhook`);
console.log(
  `process-subscription-renewals: https://${PROJECT_REF}.supabase.co/functions/v1/process-subscription-renewals`
);
console.log(`cancel-subscription: https://${PROJECT_REF}.supabase.co/functions/v1/cancel-subscription`);
console.log(`delete-account: https://${PROJECT_REF}.supabase.co/functions/v1/delete-account`);
console.log(`delete-owner-by-pin: https://${PROJECT_REF}.supabase.co/functions/v1/delete-owner-by-pin`);
console.log('\nNext: configure YooKassa webhook URL in merchant dashboard.');
console.log('Set SUBSCRIPTION_CRON_SECRET and schedule daily POST to process-subscription-renewals.');
