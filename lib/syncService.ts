import { apiRequest } from './apiClient';
import type { Pvz, Shift } from '../src/types/user';
import type { ApiChatMessage } from './chatService';

export type SyncPayload = {
  pvz?: Array<Pvz | Record<string, unknown>>;
  shifts?: Array<Shift | Record<string, unknown>>;
  chats?: ApiChatMessage[];
  userId?: string;
  role?: string;
  ownerPinHash?: string;
  email?: string;
  snapshot?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SyncResult = {
  success: boolean;
  errors?: string[];
  data?: SyncPayload;
};

export async function pushSync(payload: SyncPayload): Promise<SyncResult> {
  return apiRequest<SyncResult>('/api/sync', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function pullSync(): Promise<SyncPayload> {
  return apiRequest<SyncPayload>('/api/sync');
}
