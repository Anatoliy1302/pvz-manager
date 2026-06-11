import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { User, Pvz } from '../types/user';
import DataService from '../services/DataService';
import * as SupabaseChat from '../services/SupabaseChatService';
import notificationService from '../services/NotificationService';
import { getActiveChatRoomId } from '../utils/chatNavigationState';
import { getGeneralChatId, getMessagesStorageKey } from '../utils/chatHelpers';

interface ChatRoomMeta {
  id: string;
  name: string;
}

async function readLocalChats(userId: string): Promise<ChatRoomMeta[]> {
  const raw = await SecureStore.getItemAsync(`chats_${userId}`);
  if (!raw) return [];
  const chats = JSON.parse(raw) as ChatRoomMeta[];
  return chats.map((c) => ({ id: c.id, name: c.name }));
}

export function useChatNotifications(user: User | null, pvz: Pvz | null): void {
  const userId = user?.id;
  const pvzId = pvz?.id || user?.pvzId;
  const [supabaseEnabled, setSupabaseEnabled] = useState(false);
  const [rooms, setRooms] = useState<ChatRoomMeta[]>([]);
  const roomNamesRef = useRef<Record<string, string>>({});
  const lastNotifiedRef = useRef<Record<string, string>>({});

  const refreshRooms = useCallback(async () => {
    if (!userId || !pvzId) return;

    if (supabaseEnabled && pvz) {
      const users = await DataService.getUsers();
      const remote = await SupabaseChat.loadRooms(userId, pvzId, pvz.name, users);
      if (remote) {
        const meta = remote.map((r) => ({ id: r.id, name: r.name }));
        setRooms(meta);
        roomNamesRef.current = Object.fromEntries(meta.map((r) => [r.id, r.name]));
        return;
      }
    }

    const local = await readLocalChats(userId);
    const generalId = getGeneralChatId(pvzId);
    if (!local.some((c) => c.id === generalId)) {
      local.unshift({
        id: generalId,
        name: pvz?.name ? `Общий чат · ${pvz.name}` : 'Общий чат ПВЗ',
      });
    }
    setRooms(local);
    roomNamesRef.current = Object.fromEntries(local.map((r) => [r.id, r.name]));
  }, [userId, pvzId, pvz, supabaseEnabled]);

  useEffect(() => {
    SupabaseChat.isChatAvailable().then(setSupabaseEnabled);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refreshRooms();
  }, [userId, refreshRooms]);

  const roomIdsKey = rooms.map((r) => r.id).join('|');

  useEffect(() => {
    if (!userId || rooms.length === 0) return;

    const notifyIncoming = async (
      roomId: string,
      senderId: string,
      senderName: string,
      text: string,
      messageKey?: string
    ) => {
      if (!senderId || senderId === userId) return;
      if (getActiveChatRoomId() === roomId) return;

      const dedupeKey = messageKey || `${senderId}:${text}`;
      if (lastNotifiedRef.current[roomId] === dedupeKey) return;
      lastNotifiedRef.current[roomId] = dedupeKey;

      await notificationService.notifyChatMessageForUser(
        userId,
        senderName,
        text,
        roomId,
        roomNamesRef.current[roomId]
      );
    };

    if (supabaseEnabled) {
      const unsubs = rooms.map((room) =>
        SupabaseChat.subscribeRoomMessages(room.id, (incoming) => {
          if (!incoming) {
            refreshRooms();
            return;
          }
          notifyIncoming(
            room.id,
            incoming.userId,
            incoming.userName,
            incoming.text,
            `${incoming.userId}:${incoming.text}`
          );
        })
      );
      const memberUnsub = SupabaseChat.subscribeChatMembers(userId, refreshRooms);
      return () => {
        unsubs.forEach((u) => u());
        memberUnsub();
      };
    }

    const unsubs = rooms.map((room) =>
      DataService.subscribe(`chat_messages_${room.id}`, async () => {
        if (getActiveChatRoomId() === room.id) return;
        try {
          const raw = await SecureStore.getItemAsync(getMessagesStorageKey(room.id));
          const messages = raw ? JSON.parse(raw) : [];
          const last = messages[messages.length - 1];
          if (last?.userId && last.userId !== userId && last.text) {
            await notifyIncoming(
              room.id,
              last.userId,
              last.userName || 'Пользователь',
              last.text,
              last.id
            );
          }
        } catch {
          /* ignore */
        }
        refreshRooms();
      })
    );
    const listUnsub = DataService.subscribe(`chat_list_${userId}`, refreshRooms);
    return () => {
      unsubs.forEach((u) => u());
      listUnsub();
    };
  }, [userId, supabaseEnabled, roomIdsKey, refreshRooms, rooms]);

  useEffect(() => {
    if (!userId) return;

    notificationService.deliverPendingStaffAlerts(userId);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        notificationService.deliverPendingStaffAlerts(userId);
        refreshRooms();
      }
    });
    return () => sub.remove();
  }, [userId, refreshRooms]);
}
