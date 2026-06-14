import { supabase } from '../../lib/supabase';
import { Pvz, User } from '../types/user';
import {
  getGeneralChatId,
  getPrivateChatId,
  getPvzMemberIds,
} from '../utils/chatHelpers';
import { formatTimeFromDate, isUuid, resolvePvzId } from '../utils/supabaseHelpers';
import { hasSupabaseSession } from './SupabaseAuthService';

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

export async function isChatAvailable(): Promise<boolean> {
  return hasSupabaseSession();
}

async function resolvedPvzUuid(localPvzId: string): Promise<string | null> {
  const id = await resolvePvzId(localPvzId);
  return isUuid(id) ? id : null;
}

export async function ensureGeneralRoom(
  localPvzId: string,
  pvzName: string
): Promise<string | null> {
  const pvzUuid = await resolvedPvzUuid(localPvzId);
  if (!pvzUuid) return null;

  const roomId = getGeneralChatId(pvzUuid);
  const { error } = await supabase.from('chat_rooms').upsert(
    {
      id: roomId,
      pvz_id: pvzUuid,
      type: 'general',
      name: pvzName ? `Общий чат · ${pvzName}` : 'Общий чат ПВЗ',
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.warn('ensureGeneralRoom:', error.message);
    return null;
  }

  return roomId;
}

export async function ensurePrivateRoom(
  userIdA: string,
  userIdB: string,
  localPvzId: string,
  nameA: string,
  nameB: string
): Promise<string | null> {
  const pvzUuid = await resolvedPvzUuid(localPvzId);
  if (!pvzUuid) return null;

  const roomId = getPrivateChatId(userIdA, userIdB);
  const { error } = await supabase.from('chat_rooms').upsert(
    {
      id: roomId,
      pvz_id: pvzUuid,
      type: 'private',
      name: `${nameA} · ${nameB}`,
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.warn('ensurePrivateRoom:', error.message);
    return null;
  }

  await ensureMember(roomId, userIdA);
  await ensureMember(roomId, userIdB);
  return roomId;
}

async function ensureMember(roomId: string, userId: string): Promise<void> {
  await supabase.from('chat_members').upsert(
    { room_id: roomId, user_id: userId, unread_count: 0 },
    { onConflict: 'room_id,user_id' }
  );
}

export async function syncPvzMembersToGeneralRoom(
  roomId: string,
  users: User[],
  pvz: Pvz
): Promise<void> {
  const memberIds = getPvzMemberIds(users, pvz);
  for (const memberId of memberIds) {
    await ensureMember(roomId, memberId);
  }
}

function privateRoomDisplayName(
  roomId: string,
  userId: string,
  users: User[]
): string {
  const suffix = roomId.replace('private_', '');
  const parts = suffix.split('_');
  if (parts.length < 2) return 'Личный чат';
  const otherId = parts[0] === userId ? parts.slice(1).join('_') : parts[0];
  const other = users.find((u) => u.id === otherId);
  return other?.name || 'Личный чат';
}

export async function loadRooms(
  userId: string,
  localPvzId: string,
  pvzName: string,
  users: User[] = []
): Promise<ChatRoomSummary[] | null> {
  if (!(await isChatAvailable())) return null;

  const pvzUuid = await resolvedPvzUuid(localPvzId);
  if (!pvzUuid) return null;

  const generalRoomId = await ensureGeneralRoom(localPvzId, pvzName);
  if (!generalRoomId) return null;

  await ensureMember(generalRoomId, userId);

  const { data: memberships, error } = await supabase
    .from('chat_members')
    .select('unread_count, room:chat_rooms(id, type, name, pvz_id)')
    .eq('user_id', userId);

  if (error) {
    console.warn('loadRooms:', error.message);
    return null;
  }

  type RoomRow = {
    id: string;
    type: 'general' | 'private';
    name: string;
    pvz_id: string;
    unread_count: number;
  };

  const pvzRooms: RoomRow[] = [];

  for (const row of memberships || []) {
    const rawRoom = row.room as
      | { id: string; type: 'general' | 'private'; name: string; pvz_id: string }
      | { id: string; type: 'general' | 'private'; name: string; pvz_id: string }[]
      | null;
    const room = Array.isArray(rawRoom) ? rawRoom[0] : rawRoom;
    if (!room || room.pvz_id !== pvzUuid) continue;

    pvzRooms.push({
      ...room,
      unread_count: row.unread_count || 0,
    });
  }

  const lastMsgByRoom = new Map<
    string,
    { text: string; user_id: string; created_at: string }
  >();

  if (pvzRooms.length > 0) {
    const { data: lastMessages, error: lastMsgError } = await supabase.rpc(
      'get_chat_room_last_messages',
      { p_room_ids: pvzRooms.map((room) => room.id) }
    );

    if (lastMsgError) {
      console.warn('loadRooms last messages:', lastMsgError.message);
    } else {
      for (const msg of lastMessages || []) {
        lastMsgByRoom.set(msg.room_id, msg);
      }
    }
  }

  const rooms: ChatRoomSummary[] = [];

  for (const room of pvzRooms) {
    const lastMsg = lastMsgByRoom.get(room.id);

    const isPrivate = room.type === 'private';
    const participantIds = isPrivate ? room.id.replace('private_', '').split('_') : undefined;
    const displayName = isPrivate
      ? privateRoomDisplayName(room.id, userId, users)
      : pvzName
        ? `Общий чат · ${pvzName}`
        : room.name;

    rooms.push({
      id: room.id,
      name: displayName,
      type: room.type,
      avatar: room.type === 'general' ? '🏪' : '👤',
      lastMessage: lastMsg?.text || (room.type === 'general' ? 'Добро пожаловать!' : ''),
      lastMessageTime: lastMsg?.created_at ? formatTimeFromDate(lastMsg.created_at) : '',
      lastMessageUserId: lastMsg?.user_id,
      unreadCount: room.unread_count,
      pvzId: localPvzId,
      participants: participantIds,
    });
  }

  const hasGeneral = rooms.some((r) => r.type === 'general');
  if (!hasGeneral) {
    rooms.unshift({
      id: generalRoomId,
      name: pvzName ? `Общий чат · ${pvzName}` : 'Общий чат ПВЗ',
      type: 'general',
      avatar: '🏪',
      lastMessage: 'Добро пожаловать!',
      lastMessageTime: '',
      unreadCount: 0,
      pvzId: localPvzId,
    });
  }

  return rooms.sort((a, b) => {
    if (a.type === 'general') return -1;
    if (b.type === 'general') return 1;
    return 0;
  });
}

export async function loadMessages(
  roomId: string,
  currentUserId: string
): Promise<ChatMessage[] | null> {
  if (!(await isChatAvailable())) return null;

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('loadMessages:', error.message);
    return null;
  }

  return (data || []).map((row) => ({
    id: row.id,
    text: row.text,
    userId: row.user_id,
    userName: row.user_name,
    time: formatTimeFromDate(row.created_at),
    isOwn: row.user_id === currentUserId,
    status: 'sent' as const,
  }));
}

export async function sendMessage(
  roomId: string,
  text: string,
  userId: string,
  userName: string,
  options?: { notifyUserIds?: string[] }
): Promise<ChatMessage | null> {
  if (!(await isChatAvailable())) return null;

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      room_id: roomId,
      user_id: userId,
      user_name: userName,
      text,
    })
    .select('*')
    .single();

  if (error) {
    console.warn('sendMessage:', error.message);
    return null;
  }

  const notifyIds = options?.notifyUserIds || [];
  for (const targetId of notifyIds) {
    if (targetId === userId) continue;
    const { error: unreadError } = await supabase.rpc('increment_chat_unread', {
      p_room_id: roomId,
      p_target_user_id: targetId,
    });
    if (unreadError) {
      console.warn('increment_chat_unread:', unreadError.message);
    }
  }

  return {
    id: data.id,
    text: data.text,
    userId: data.user_id,
    userName: data.user_name,
    time: formatTimeFromDate(data.created_at),
    isOwn: true,
    status: 'sent',
  };
}

export async function markRoomRead(roomId: string, userId: string): Promise<void> {
  if (!(await isChatAvailable())) return;

  await supabase
    .from('chat_members')
    .upsert(
      { room_id: roomId, user_id: userId, unread_count: 0, last_read_at: new Date().toISOString() },
      { onConflict: 'room_id,user_id' }
    );
}

export async function deleteRoom(roomId: string): Promise<boolean> {
  if (!(await isChatAvailable())) return false;

  const { error } = await supabase.from('chat_rooms').delete().eq('id', roomId);
  if (error) {
    console.warn('deleteRoom:', error.message);
    return false;
  }
  return true;
}

export interface IncomingChatPayload {
  id?: string;
  userId: string;
  userName: string;
  text: string;
  createdAt?: string;
}

export function subscribeRoomMessages(
  roomId: string,
  onMessage: (incoming?: IncomingChatPayload) => void
): () => void {
  const channel = supabase
    .channel(`chat-${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
      (payload) => {
        const row = payload.new as {
          id?: string;
          user_id?: string;
          user_name?: string;
          text?: string;
          created_at?: string;
        };
        if (row?.user_id && row?.text) {
          onMessage({
            id: row.id,
            userId: row.user_id,
            userName: row.user_name || 'Пользователь',
            text: row.text,
            createdAt: row.created_at,
          });
        } else {
          onMessage();
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeChatMembers(userId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`chat-members-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chat_members', filter: `user_id=eq.${userId}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
