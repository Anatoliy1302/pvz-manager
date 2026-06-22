import { apiRequest } from './apiClient';

export async function upsertPushToken(token: string): Promise<void> {
  await apiRequest('/api/push-tokens', {
    method: 'PUT',
    body: JSON.stringify({ token }),
  });
}

export async function fetchPushToken(userId: string): Promise<string | null> {
  const result = await apiRequest<{ token: string | null }>(`/api/push-tokens/${userId}`);
  return result?.token ?? null;
}

export async function deletePushToken(userId: string): Promise<void> {
  await apiRequest(`/api/push-tokens/${userId}`, { method: 'DELETE' });
}
