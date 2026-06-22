import { Pvz, User } from '../types/user';
import { getGeneralChatId, getPvzMemberIds } from '../utils/chatHelpers';
import { formatTimeFromDate } from '../utils/supabaseHelpers';
import { getToken } from '../../lib/authSessionStore';
import * as chatApi from '../../lib/chatService';

export interface ChatMessage {
  id: string;
  text: string;
  userId: string;
  userName: string;
  time: string;
  isOwn: boolean;
  status: 'sent' | 'delivered' | 'read';
}

export interface ChatRoomSummary {
  id: string;
  name: string;
  type: 'general' | 'private';
  avatar: string;
  lastMessage: string;
  lastMessageTime: string;
  lastMessageUserId?: string;
  unreadCount: number;
  pvzId?: string;
  participants?: string[];
  participantNames?: string[];
}

export interface IncomingChatPayload {
  id?: string;
  userId: string;
  userName: string;
  text: string;
  createdAt?: string;
}

const POLL_INTERVAL_MS = 4_000;
const pollCursors = new Map<string, string>();

export async function isChatAvailable(): Promise<boolean> {
  return Boolean(await getToken());
}

export async function ensureGeneralRoom(localPvzId: string, pvzName: string): Promise<string | null> {
  if (!(await isChatAvailable())) return null;
  try {
    const label = pvzName ? `Общий чат · ${pvzName}` : 'Общий чат ПВЗ';
    return await chatApi.ensureGeneralChatRoom(localPvzId, label);
  } catch (error) {
    if (__DEV__) console.warn('[Chat] ensureGeneralRoom:', error);
    return getGeneralChatId(localPvzId);
  }
}

export async function ensurePrivateRoom(
  userIdA: string,
  userIdB: string,
  localPvzId: string,
  nameA: string,
  nameB: string
): Promise<string | null> {
  if (!(await isChatAvailable())) return null;
  try {
    return await chatApi.ensurePrivateChatRoom({
      pvzId: localPvzId,
      otherUserId: userIdB,
      otherUserName: nameB,
      myName: nameA,
    });
  } catch (error) {
    if (__DEV__) console.warn('[Chat] ensurePrivateRoom:', error);
    return `private_${[userIdA, userIdB].sort().join('_')}_${localPvzId}`;
  }
}

export async function syncPvzMembersToGeneralRoom(
  roomId: string,
  users: User[],
  pvz: Pvz
): Promise<void> {
  if (!(await isChatAvailable())) return;
  try {
    const memberIds = getPvzMemberIds(users, pvz);
    if (memberIds.length === 0) return;
    await chatApi.syncChatRoomMembers(roomId, memberIds);
  } catch (error) {
    if (__DEV__) console.warn('[Chat] syncPvzMembersToGeneralRoom:', error);
  }
}

function mapRoom(row: chatApi.ApiChatRoom): ChatRoomSummary {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    avatar: row.avatar ?? (row.type === 'general' ? '🏪' : '👤'),
    lastMessage: row.last_message ?? '',
    lastMessageTime: row.last_message_time ?? '',
    lastMessageUserId: row.last_message_user_id,
    unreadCount: row.unread_count ?? 0,
    pvzId: row.pvz_id,
    participants: row.participants,
    participantNames: row.participant_names,
  };
}

function mapMessage(row: chatApi.ApiRoomMessage, currentUserId: string): ChatMessage {
  return {
    id: row.id,
    text: row.text,
    userId: row.user_id,
    userName: row.user_name,
    time: formatTimeFromDate(row.created_at),
    isOwn: row.user_id === currentUserId,
    status: 'sent',
  };
}

export async function loadRooms(
  _userId: string,
  localPvzId: string,
  pvzName: string,
  _users: User[] = []
): Promise<ChatRoomSummary[] | null> {
  if (!(await isChatAvailable())) return null;

  try {
    const label = pvzName ? `Общий чат · ${pvzName}` : 'Общий чат ПВЗ';
    await chatApi.ensureGeneralChatRoom(localPvzId, label);
    const rows = await chatApi.fetchChatRooms(localPvzId);
    return rows.map(mapRoom);
  } catch (error) {
    if (__DEV__) console.warn('[Chat] loadRooms:', error);
    return null;
  }
}

export async function loadMessages(
  roomId: string,
  currentUserId: string
): Promise<ChatMessage[] | null> {
  if (!(await isChatAvailable())) return null;

  try {
    const rows = await chatApi.fetchRoomMessages(roomId);
    if (rows.length > 0) {
      pollCursors.set(roomId, rows[rows.length - 1].created_at);
    }
    return rows.map((row) => mapMessage(row, currentUserId));
  } catch (error) {
    if (__DEV__) console.warn('[Chat] loadMessages:', error);
    return null;
  }
}

export async function sendMessage(
  roomId: string,
  text: string,
  userId: string,
  userName: string,
  _options?: { notifyUserIds?: string[] }
): Promise<ChatMessage | null> {
  if (!(await isChatAvailable())) return null;

  try {
    const row = await chatApi.sendRoomMessage(roomId, text, userName);
    pollCursors.set(roomId, row.created_at);
    return mapMessage(row, userId);
  } catch (error) {
    if (__DEV__) console.warn('[Chat] sendMessage:', error);
    return null;
  }
}

export async function markRoomRead(roomId: string, _userId: string): Promise<void> {
  if (!(await isChatAvailable())) return;
  try {
    await chatApi.markRoomRead(roomId);
  } catch (error) {
    if (__DEV__) console.warn('[Chat] markRoomRead:', error);
  }
}

export async function deleteRoom(roomId: string): Promise<boolean> {
  if (!(await isChatAvailable())) return false;
  try {
    await chatApi.deleteChatRoom(roomId);
    pollCursors.delete(roomId);
    return true;
  } catch (error) {
    if (__DEV__) console.warn('[Chat] deleteRoom:', error);
    return false;
  }
}

export function subscribeRoomMessages(
  roomId: string,
  onChange: (incoming: IncomingChatPayload) => void
): () => void {
  let cancelled = false;

  const poll = async () => {
    if (cancelled) return;
    try {
      const after = pollCursors.get(roomId);
      const rows = await chatApi.fetchRoomMessages(roomId, after ? { after } : undefined);
      for (const row of rows) {
        pollCursors.set(roomId, row.created_at);
        onChange({
          id: row.id,
          userId: row.user_id,
          userName: row.user_name,
          text: row.text,
          createdAt: row.created_at,
        });
      }
    } catch {
      /* ignore transient network errors */
    }
  };

  void poll();
  const timer = setInterval(poll, POLL_INTERVAL_MS);
  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}

export function subscribeChatMembers(_userId: string, onChange: () => void): () => void {
  const timer = setInterval(onChange, POLL_INTERVAL_MS * 3);
  return () => clearInterval(timer);
}
