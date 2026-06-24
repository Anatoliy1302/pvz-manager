#!/usr/bin/env node
/**
 * Удаляет секретные/артефактные файлы из всей истории git.
 *
 * Использование:
 *   node scripts/purge-env-from-git-history.mjs           # dry-run
 *   node scripts/purge-env-from-git-history.mjs --apply   # переписать историю
 *   node scripts/purge-env-from-git-history.mjs --apply --builds
 *
 * Требует git-filter-repo: pip install git-filter-repo
 * После --apply: git push --force-with-lease origin --all (согласуйте с командой).
 */
import { execSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const includeBuilds = args.has('--builds');

const PATHS = ['.env'];
if (includeBuilds) {
  PATHS.push('builds');
}

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
}

function historyHits(path) {
  try {
    return run(`git log --all --oneline -- ${path}`);
  } catch {
    return '';
  }
}

const report = [];
for (const path of PATHS) {
  const hits = historyHits(path);
  if (hits) {
    report.push({ path, hits });
  }
}

if (report.length === 0) {
  console.log('OK: в истории git не найдено:', PATHS.join(', '));
  process.exit(0);
}

console.log('В истории git найдены чувствительные пути:\n');
for (const { path, hits } of report) {
  console.log(`--- ${path} ---\n${hits}\n`);
}

if (!apply) {
  console.log('Dry-run. Для переписывания истории:');
  console.log('  node scripts/purge-env-from-git-history.mjs --apply');
  if (!includeBuilds) {
    console.log('  node scripts/purge-env-from-git-history.mjs --apply --builds');
  }
  process.exit(0);
}

try {
  run('git filter-repo --version');
} catch {
  console.error('Установите: pip install git-filter-repo');
  process.exit(1);
}

const invertPaths = PATHS.map((p) => `--path ${p}`).join(' ');
console.log(`Запуск: git filter-repo ${invertPaths} --invert-paths --force\n`);

try {
  execSync(`git filter-repo ${invertPaths} --invert-paths --force`, { stdio: 'inherit' });
  console.log('\nГотово. Выполните: git push --force-with-lease origin --all');
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
