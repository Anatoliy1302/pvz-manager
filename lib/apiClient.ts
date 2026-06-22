import { getApiUrl } from '../config/api';
import { getToken } from './authSessionStore';
import { fetchWithRaceTimeout } from './fetchWithRaceTimeout';

export { getToken };

const API_TIMEOUT_MS = 30_000;

export class ApiClientError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.body = body;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string> | undefined) ?? {}),
  };

  const response = await fetchWithRaceTimeout(
    `${getApiUrl()}${path}`,
    { ...options, headers },
    API_TIMEOUT_MS
  );

  const body = await readJson(response);
  if (!response.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : null) ?? `API error: ${response.status}`;
    throw new ApiClientError(message, response.status, body);
  }

  return body as T;
}
