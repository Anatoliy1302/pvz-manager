import { getApiUrl } from '../config/api';
import { fetchWithRaceTimeout } from './fetchWithRaceTimeout';
import { normalizeEmail } from '../src/utils/loginIdentifier';

const TIMEOUT_MS = 30_000;

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const data = (await response.json()) as unknown;
    if (data && typeof data === 'object') return data as Record<string, unknown>;
  } catch {
    // ignore
  }
  return {};
}

/** DELETE /api/account — удаление по JWT (сотрудник / админ / владелец с сессией). */
export async function deleteAccountWithToken(accessToken: string): Promise<void> {
  const response = await fetchWithRaceTimeout(
    `${getApiUrl()}/api/account`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    },
    TIMEOUT_MS
  );

  const payload = await readJson(response);
  if (!response.ok) {
    const message =
      (typeof payload.error === 'string' && payload.error) || `HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!payload.ok) {
    throw new Error('Не удалось удалить аккаунт');
  }
}

/** POST /api/account/delete-by-pin — удаление владельца без активной сессии. */
export async function deleteOwnerAccountByPin(
  email: string,
  userId: string,
  pin: string
): Promise<void> {
  const response = await fetchWithRaceTimeout(
    `${getApiUrl()}/api/account/delete-by-pin`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: normalizeEmail(email),
        userId,
        pin,
      }),
    },
    TIMEOUT_MS
  );

  const payload = await readJson(response);
  if (!response.ok) {
    const message =
      (typeof payload.error === 'string' && payload.error) || `HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!payload.ok) {
    throw new Error('Не удалось удалить аккаунт');
  }
}
