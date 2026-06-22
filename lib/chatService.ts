import { apiRequest } from './apiClient';

/** Legacy support ticket (личный чат с поддержкой). */
export type ApiChatMessage = {
  id: string;
  user_id: string;
  message: string;
  is_support: boolean;
  is_read: boolean;
  created_at: string;
};

export type ApiChatRoom = {
  id: string;
  pvz_id: string;
  type: 'general' | 'private';
  name: string;
  avatar?: string;
  last_message: string;
  last_message_time: string;
  last_message_user_id?: string;
  unread_count: number;
  participants?: string[];
  participant_names?: string[];
};

export type ApiRoomMessage = {
  id: string;
  room_id: string;
  user_id: string;
  user_name: string;
  text: string;
  created_at: string;
};

// --- Support (legacy /api/chats) ---

export async function fetchSupportMessages(): Promise<ApiChatMessage[]> {
  const rows = await apiRequest<ApiChatMessage[]>('/api/chats');
  return rows ?? [];
}

export async function sendSupportMessage(
  message: string,
  options?: { isSupport?: boolean }
): Promise<ApiChatMessage> {
  return apiRequest<ApiChatMessage>('/api/chats', {
    method: 'POST',
    body: JSON.stringify({ message, is_support: Boolean(options?.isSupport) }),
  });
}

export async function fetchSupportUnreadCount(): Promise<number> {
  const result = await apiRequest<{ count: number }>('/api/chats/unread');
  return result?.count ?? 0;
}

export async function markSupportRead(): Promise<void> {
  await apiRequest('/api/chats/read', { method: 'POST' });
}

/** @deprecated use fetchSupportMessages */
export const fetchChatMessages = fetchSupportMessages;
/** @deprecated use sendSupportMessage */
export const sendChatMessage = sendSupportMessage;
/** @deprecated use fetchSupportUnreadCount */
export const fetchUnreadChatCount = fetchSupportUnreadCount;

// --- Team chat rooms ---

export async function fetchChatRooms(pvzId: string): Promise<ApiChatRoom[]> {
  const rows = await apiRequest<ApiChatRoom[]>(`/api/chat/rooms?pvz_id=${encodeURIComponent(pvzId)}`);
  return rows ?? [];
}

export async function ensureGeneralChatRoom(pvzId: string, name: string): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/chat/rooms/general', {
    method: 'POST',
    body: JSON.stringify({ pvz_id: pvzId, name }),
  });
  return result.id;
}

export async function ensurePrivateChatRoom(params: {
  pvzId: string;
  otherUserId: string;
  otherUserName: string;
  myName: string;
}): Promise<string> {
  const result = await apiRequest<{ id: string }>('/api/chat/rooms/private', {
    method: 'POST',
    body: JSON.stringify({
      pvz_id: params.pvzId,
      other_user_id: params.otherUserId,
      other_user_name: params.otherUserName,
      my_name: params.myName,
    }),
  });
  return result.id;
}

export async function syncChatRoomMembers(roomId: string, memberIds: string[]): Promise<void> {
  await apiRequest(`/api/chat/rooms/${encodeURIComponent(roomId)}/members/sync`, {
    method: 'POST',
    body: JSON.stringify({ member_ids: memberIds }),
  });
}

export async function fetchRoomMessages(
  roomId: string,
  options?: { after?: string; limit?: number }
): Promise<ApiRoomMessage[]> {
  const params = new URLSearchParams();
  if (options?.after) params.set('after', options.after);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  const rows = await apiRequest<ApiRoomMessage[]>(
    `/api/chat/rooms/${encodeURIComponent(roomId)}/messages${qs ? `?${qs}` : ''}`
  );
  return rows ?? [];
}

export async function sendRoomMessage(
  roomId: string,
  text: string,
  userName: string
): Promise<ApiRoomMessage> {
  return apiRequest<ApiRoomMessage>(`/api/chat/rooms/${encodeURIComponent(roomId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text, user_name: userName }),
  });
}

export async function markRoomRead(roomId: string): Promise<void> {
  await apiRequest(`/api/chat/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST' });
}

export async function deleteChatRoom(roomId: string): Promise<void> {
  await apiRequest(`/api/chat/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' });
}

export async function fetchTeamChatUnreadTotal(pvzId: string): Promise<number> {
  const result = await apiRequest<{ count: number }>(
    `/api/chat/unread-total?pvz_id=${encodeURIComponent(pvzId)}`
  );
  return result?.count ?? 0;
}
