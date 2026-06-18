/**
 * Deploy enterprise-api Edge Function (REST API для Enterprise-клиентов).
 *
 * Required Supabase secrets (уже должны быть):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY
 *
 * Optional:
 *   ENTERPRISE_API_RATE_LIMIT — запросов в минуту на владельца (по умолчанию 100)
 *
 * Before deploy:
 *   node supabase/setup/apply-migration-17100000.mjs
 *
 * Run: node supabase/setup/deploy-enterprise-api.mjs
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
  'enterprise-api',
  '--project-ref',
  PROJECT_REF,
  '--no-verify-jwt',
]);

const base = `https://${PROJECT_REF}.supabase.co/functions/v1/enterprise-api`;

console.log('\nEnterprise API deployed.');
console.log(`Base URL: ${base}`);
console.log(`GET  ${base}/shifts?from_date=2026-01-01&to_date=2026-01-31`);
console.log(`GET  ${base}/salary?from_date=2026-01-01&to_date=2026-01-31`);
console.log(`GET  ${base}/pvz`);
console.log(`POST ${base}/export`);
console.log(`POST ${base}/keys  (JWT only — создать API-ключ)`);
console.log('\nAuth: Authorization: Bearer <JWT> или X-API-Key: pvz_ent_...');
console.log('Документация: ENTERPRISE_API.md');
