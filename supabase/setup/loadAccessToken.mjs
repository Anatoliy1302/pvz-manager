import fs from 'fs';
import path from 'path';

/** Personal access token для Management API (Dashboard → Account → Access Tokens). */
export function loadAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }

  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    const match = raw.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  const mcpPaths = [
    path.resolve(process.cwd(), '.cursor/mcp.json'),
    path.join(process.env.USERPROFILE || '', '.cursor/mcp.json'),
  ];
  for (const mcpPath of mcpPaths) {
    if (!fs.existsSync(mcpPath)) continue;
    const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    const token = mcp?.mcpServers?.supabase?.env?.SUPABASE_ACCESS_TOKEN;
    if (token?.trim()) return token.trim();
  }

  return null;
}

export function requireAccessToken() {
  const token = loadAccessToken();
  if (!token) {
    throw new Error(
      'SUPABASE_ACCESS_TOKEN не найден. Добавьте в .env (Dashboard → Account → Access Tokens) ' +
        'или задайте переменную окружения перед запуском скрипта.'
    );
  }
  return token;
}
