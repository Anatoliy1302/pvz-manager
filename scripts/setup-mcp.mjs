#!/usr/bin/env node
/**
 * Проверка и подготовка MCP (Supabase + Merlin) для Cursor.
 * Секреты берутся из .env — не дублируйте их в репозитории.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const mcpPath = path.join(root, '.cursor', 'mcp.json');
const examplePath = path.join(root, '.cursor', 'mcp.json.example');

const SUPABASE_EXE =
  process.env.SUPABASE_MCP_EXE ??
  'C:\\Users\\Admin\\AppData\\Local\\Programs\\Python\\Python314\\Scripts\\supabase-mcp-server.exe';

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim();
  }
  return out;
}

function probe(command, args, env, label) {
  return new Promise((resolve) => {
    const isCmd = command.toLowerCase().endsWith('.cmd');
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: isCmd,
    });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      child.kill();
      const ok = !/error|failed|No module named/i.test(stderr);
      resolve({ label, ok, stderr: stderr.slice(0, 400) });
    }, 4000);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ label, ok: false, stderr: String(err.message) });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ label, ok: code === 0 || code === null, stderr: stderr.slice(0, 400) });
    });
  });
}

const env = loadEnv(envPath);
const missing = ['SUPABASE_DB_PASSWORD', 'SUPABASE_ACCESS_TOKEN'].filter((k) => !env[k]);
if (missing.length) {
  console.error('В .env не хватает:', missing.join(', '));
  process.exit(1);
}

if (!fs.existsSync(mcpPath)) {
  if (!fs.existsSync(examplePath)) {
    console.error('Нет .cursor/mcp.json — скопируйте mcp.json.example и укажите MERLIN_API_KEY');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
  fs.copyFileSync(examplePath, mcpPath);
  console.log('Создан .cursor/mcp.json из example — впишите MERLIN_API_KEY');
}

if (!fs.existsSync(SUPABASE_EXE)) {
  console.error('supabase-mcp-server не найден. Установите: pip install supabase-mcp-server');
  process.exit(1);
}

console.log('Проверка Supabase MCP...');
const supabase = await probe(
  SUPABASE_EXE,
  [],
  {
    SUPABASE_PROJECT_REF: 'wygpcndnlxfzbbuogqrt',
    SUPABASE_REGION: 'eu-north-1',
    SUPABASE_DB_PASSWORD: env.SUPABASE_DB_PASSWORD,
    SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN,
  },
  'supabase'
);

console.log('Проверка Merlin MCP...');
let merlinKey = process.env.MERLIN_API_KEY;
if ((!merlinKey || merlinKey.includes('your-merlin')) && fs.existsSync(mcpPath)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    merlinKey = cfg?.mcpServers?.merlin?.env?.MERLIN_API_KEY ?? merlinKey;
  } catch {
    /* ignore */
  }
}
if (!merlinKey || merlinKey.includes('your-merlin')) {
  console.warn('MERLIN_API_KEY не задан — Merlin MCP пропущен (ключ: https://merlin.build/dashboard/settings)');
} else {
  const merlin = await probe(
    'C:\\Users\\Admin\\AppData\\Roaming\\npm\\merlin-brain.cmd',
    [],
    { MERLIN_API_KEY: merlinKey },
    'merlin'
  );
  console.log(merlin.ok ? '  Merlin: OK (процесс стартует)' : `  Merlin: ошибка — ${merlin.stderr}`);
}

console.log(supabase.ok ? '  Supabase: OK (процесс стартует)' : `  Supabase: ошибка — ${supabase.stderr}`);
console.log('\nДальше: Cursor → Settings → Tools & MCP → переключите supabase и merlin off/on.');
