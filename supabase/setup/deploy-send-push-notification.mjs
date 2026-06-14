/**
 * Deploy send-push-notification Edge Function.
 *
 * Requires Supabase CLI linked to the project.
 *
 * Run: node supabase/setup/deploy-send-push-notification.mjs
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

run('npx', ['supabase', 'functions', 'deploy', 'send-push-notification', '--project-ref', PROJECT_REF]);

console.log('\nsend-push-notification deployed.');
