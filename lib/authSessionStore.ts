import { secureStorageAdapter } from '../src/utils/secureStorageAdapter';
import { safeParseJson } from '../src/utils/safeJson';
import { AUTH_STORAGE_KEY } from '../config/api';
import type { AuthSession } from './authApi';

export type StoredAuthSession = {
  access_token: string;
  refresh_token?: string;
  user?: { id: string; email?: string };
};

let accessTokenCache: string | null = null;
let memorySession: AuthSession | null = null;
let cacheAt = 0;
const CACHE_MS = 3_000;

export function clearAuthSessionCache(): void {
  accessTokenCache = null;
  memorySession = null;
  cacheAt = 0;
}

/** In-memory session until persistAuthSession completes (same app launch). */
export function cacheMemoryAuthSession(session: AuthSession): void {
  memorySession = session;
  accessTokenCache = session.accessToken;
  cacheAt = Date.now();
}

export async function readStoredAuthSession(): Promise<StoredAuthSession | null> {
  const raw = await secureStorageAdapter.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  const parsed = safeParseJson<StoredAuthSession>(raw, {});
  if (!parsed.access_token) return null;
  return parsed;
}

export async function readStoredAccessToken(): Promise<string | null> {
  if (accessTokenCache && Date.now() - cacheAt < CACHE_MS) {
    return accessTokenCache;
  }
  if (memorySession?.accessToken) {
    accessTokenCache = memorySession.accessToken;
    cacheAt = Date.now();
    return memorySession.accessToken;
  }
  const stored = await readStoredAuthSession();
  const token = stored?.access_token ?? null;
  accessTokenCache = token;
  cacheAt = Date.now();
  return token;
}

export async function hasStoredAccessToken(): Promise<boolean> {
  return Boolean(await readStoredAccessToken());
}

/** Alias для apiClient. */
export const getToken = readStoredAccessToken;

export async function persistAuthSession(
  session: AuthSession,
  email?: string
): Promise<void> {
  cacheMemoryAuthSession(session);
  const payload: StoredAuthSession = {
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    user: {
      id: session.userId,
      email,
    },
  };
  await secureStorageAdapter.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
}

export async function clearAuthSession(): Promise<void> {
  await secureStorageAdapter.removeItem(AUTH_STORAGE_KEY);
  clearAuthSessionCache();
}
