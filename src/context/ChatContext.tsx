import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import DataService from '../services/DataService';
import * as SupabaseChat from '../services/SupabaseChatService';
import notificationService from '../services/NotificationService';
import {
  chatListEventKey,
  chatMessagesEventKey,
  deleteChatMessages,
  loadLocalChatRooms,
  LocalChatMessage,
  LocalChatRoom,
  markLocalChatAsRead,
  readChatMessages,
  readUserChats,
  saveLocalChatMessage,
  writeUserChats,
} from '../services/data/chatDataService';
import { getPrivateChatId, getPvzMemberIds } from '../utils/chatHelpers';
import { setActiveChatRoomId } from '../utils/chatNavigationState';
import { generateSecureId } from '../utils/generateSecureId';
import { formatTimeFromDate } from '../utils/supabaseHelpers';
import { User } from '../types/user';

export type ChatRoom = LocalChatRoom;
export type ChatMessage = LocalChatMessage;

interface ChatContextData {
  chats: ChatRoom[];
  activeChat: ChatRoom | null;
  messages: ChatMessage[];
  allUsers: User[];
  loadingChats: boolean;
  loadingMessages: boolean;
  sending: boolean;
  supabaseEnabled: boolean;
  totalUnreadCount: number;
  pvzId: string;
  setActiveChat: (chat: ChatRoom | null) => void;
  loadChats: () => Promise<void>;
  sendMessage: (text: string) => Promise<boolean>;
  deleteChat: (chatId: string) => Promise<boolean>;
  createPrivateChat: (contact: User) => Promise<ChatRoom | null>;
}

const ChatContext = createContext<ChatContextData | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, pvz } = useAuth();

  const [activeChat, setActiveChat] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chats, setChats] = useState<ChatRoom[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [supabaseEnabled, setSupabaseEnabled] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const activeChatIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | undefined>(user?.id);
  const loadChatsRef = useRef<() => Promise<void>>(async () => {});
  const loadMessagesRef = useRef<() => Promise<void>>(async () => {});
  const lastNotifiedRef = useRef<Record<string, string>>({});
  const roomNamesRef = useRef<Record<string, string>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const pvzId = pvz?.id || user?.pvzId || '';

  useEffect(() => {
    activeChatIdRef.current = activeChat?.id ?? null;
    setActiveChatRoomId(activeChat?.id ?? null);
  }, [activeChat?.id]);

  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    if (user) return;

    setActiveChat(null);
    setMessages([]);
    setChats([]);
    setAllUsers([]);
    setSupabaseEnabled(false);
    activeChatIdRef.current = null;
    setActiveChatRoomId(null);
    lastNotifiedRef.current = {};
  }, [user]);

  useEffect(() => {
    if (!user?.id) {
      setSupabaseEnabled(false);
      return;
    }
    SupabaseChat.isChatAvailable().then(setSupabaseEnabled);
  }, [user?.id]);

  useEffect(() => {
    roomNamesRef.current = Object.fromEntries(chats.map((room) => [room.id, room.name]));
    const roomIds = new Set(chats.map((room) => room.id));
    for (const roomId of Object.keys(lastNotifiedRef.current)) {
      if (!roomIds.has(roomId)) {
        delete lastNotifiedRef.current[roomId];
      }
    }
  }, [chats]);

  const totalUnreadCount = useMemo(
    () => chats.reduce((sum, room) => sum + (room.unreadCount || 0), 0),
    [chats]
  );

  const updateRoomPreview = useCallback(
    (roomId: string, text: string, senderId: string, time: string, unreadCount?: number) => {
      setChats((prev) =>
        prev.map((room) =>
          room.id === roomId
            ? {
                ...room,
                lastMessage: text,
                lastMessageTime: time,
                lastMessageUserId: senderId,
                unreadCount: unreadCount ?? room.unreadCount,
              }
            : room
        )
      );
    },
    []
  );

  const notifyIncoming = useCallback(
    async (
      roomId: string,
      senderId: string,
      senderName: string,
      text: string,
      messageKey?: string
    ) => {
      const currentUserId = userIdRef.current;
      if (!currentUserId || !senderId || senderId === currentUserId) return;
      if (roomId === activeChatIdRef.current) return;

      const dedupeKey = messageKey || `${senderId}:${text}`;
      if (lastNotifiedRef.current[roomId] === dedupeKey) return;
      lastNotifiedRef.current[roomId] = dedupeKey;

      await notificationService.notifyChatMessageForUser(
        currentUserId,
        senderName,
        text,
        roomId,
        roomNamesRef.current[roomId]
      );
    },
    []
  );

  const loadChats = useCallback(async () => {
    if (!user?.id || !pvzId) return;

    setLoadingChats(true);
    try {
      const users = await DataService.getUsers();
      if (!mountedRef.current) return;
      setAllUsers(users);

      if (supabaseEnabled && pvz) {
        const generalRoomId = await SupabaseChat.ensureGeneralRoom(pvzId, pvz.name);
        if (!mountedRef.current) return;
        if (generalRoomId) {
          await SupabaseChat.syncPvzMembersToGeneralRoom(generalRoomId, users, pvz);
        }
        const remoteRooms = await SupabaseChat.loadRooms(user.id, pvzId, pvz.name, users);
        if (!mountedRef.current) return;
        if (remoteRooms) {
          setChats(remoteRooms);
          return;
        }
      }

      const localRooms = await loadLocalChatRooms(user.id, pvzId, pvz, t);
      if (!mountedRef.current) return;
      setChats(localRooms);
    } catch (error) {
      console.error('Ошибка загрузки чатов:', error);
    } finally {
      if (mountedRef.current) {
        setLoadingChats(false);
      }
    }
  }, [user?.id, pvzId, pvz, supabaseEnabled, t]);

  const loadMessages = useCallback(async () => {
    if (!activeChat || !user?.id) return;

    setLoadingMessages(true);
    try {
      if (supabaseEnabled) {
        const remoteMessages = await SupabaseChat.loadMessages(activeChat.id, user.id);
        if (!mountedRef.current) return;
        if (remoteMessages) {
          setMessages(remoteMessages);
          await SupabaseChat.markRoomRead(activeChat.id, user.id);
          setChats((prev) =>
            prev.map((room) =>
              room.id === activeChat.id ? { ...room, unreadCount: 0 } : room
            )
          );
          return;
        }
      }

      const savedMessages = await readChatMessages(activeChat.id);
      if (!mountedRef.current) return;
      setMessages(
        savedMessages.map((msg) => ({
          ...msg,
          isOwn: msg.userId === user.id,
        }))
      );
      await markLocalChatAsRead(user.id, activeChat.id);
      setChats((prev) =>
        prev.map((room) => (room.id === activeChat.id ? { ...room, unreadCount: 0 } : room))
      );
    } catch (error) {
      console.error('Ошибка загрузки сообщений:', error);
    } finally {
      if (mountedRef.current) {
        setLoadingMessages(false);
      }
    }
  }, [activeChat, user?.id, supabaseEnabled]);

  const getMessageRecipients = useCallback(async (): Promise<string[]> => {
    if (!activeChat || !user?.id) return [];
    const users = await DataService.getUsers();

    if (activeChat.type === 'general' && pvz) {
      return getPvzMemberIds(users, pvz, user.id);
    }
    if (activeChat.type === 'private') {
      const recipientId = activeChat.participants?.find((id) => id !== user.id);
      return recipientId ? [recipientId] : [];
    }
    return [];
  }, [activeChat, pvz, user?.id]);

  const notifyMessageRecipients = useCallback(
    async (text: string) => {
      if (!activeChat || !user?.id) return;
      const recipientIds = await getMessageRecipients();
      if (recipientIds.length === 0) return;

      await notificationService.notifyChatRecipients({
        recipientUserIds: recipientIds,
        senderId: user.id,
        senderName: user.name || t('screens.chat.user'),
        text,
        chatId: activeChat.id,
        chatName: activeChat.name,
      });
    },
    [activeChat, getMessageRecipients, t, user?.id, user?.name]
  );

  const handleIncomingMessage = useCallback(
    (roomId: string, incoming?: SupabaseChat.IncomingChatPayload) => {
      const currentUserId = userIdRef.current;
      if (!currentUserId || !incoming?.userId || !incoming.text) return;
      if (incoming.userId === currentUserId) return;

      const messageTime = incoming.createdAt
        ? formatTimeFromDate(incoming.createdAt)
        : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const incomingMessage: ChatMessage = {
        id: incoming.id || generateSecureId(),
        text: incoming.text,
        userId: incoming.userId,
        userName: incoming.userName,
        time: messageTime,
        isOwn: false,
        status: 'delivered',
      };

      if (roomId === activeChatIdRef.current) {
        setMessages((prev) => {
          if (incoming.id && prev.some((msg) => msg.id === incoming.id)) return prev;
          return [...prev, incomingMessage];
        });
        void SupabaseChat.markRoomRead(roomId, currentUserId);
        updateRoomPreview(roomId, incoming.text, incoming.userId, messageTime, 0);
        return;
      }

      setChats((prev) =>
        prev.map((room) =>
          room.id === roomId
            ? {
                ...room,
                unreadCount: room.unreadCount + 1,
                lastMessage: incoming.text,
                lastMessageUserId: incoming.userId,
                lastMessageTime: messageTime,
              }
            : room
        )
      );

      void notifyIncoming(
        roomId,
        incoming.userId,
        incoming.userName,
        incoming.text,
        incoming.id || `${incoming.userId}:${incoming.text}`
      );
    },
    [notifyIncoming, updateRoomPreview]
  );

  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      if (!text.trim() || !activeChat || !user?.id || sending) return false;

      const trimmed = text.trim();
      const optimisticId = generateSecureId();
      const optimisticTime = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const optimisticMessage: ChatMessage = {
        id: optimisticId,
        text: trimmed,
        userId: user.id,
        userName: user.name || t('screens.chat.me'),
        time: optimisticTime,
        isOwn: true,
        status: 'sent',
      };

      setSending(true);
      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        if (supabaseEnabled) {
          const users = await DataService.getUsers();
          let notifyIds: string[] = [];

          if (activeChat.type === 'general' && pvz) {
            notifyIds = getPvzMemberIds(users, pvz, user.id);
          } else if (activeChat.type === 'private') {
            const recipientId = activeChat.participants?.find((id) => id !== user.id);
            if (recipientId) notifyIds = [recipientId];
          }

          const sent = await SupabaseChat.sendMessage(
            activeChat.id,
            trimmed,
            user.id,
            user.name || t('screens.chat.me'),
            { notifyUserIds: notifyIds }
          );

          if (sent) {
            setMessages((prev) => prev.map((msg) => (msg.id === optimisticId ? sent : msg)));
            updateRoomPreview(activeChat.id, trimmed, user.id, sent.time, 0);
            void notifyMessageRecipients(trimmed);
            return true;
          }

          setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
          return false;
        }

        const recipientIds = await saveLocalChatMessage({
          activeChat,
          newMessage: optimisticMessage,
          userId: user.id,
          pvz,
          senderName: user.name || t('screens.chat.user'),
        });
        updateRoomPreview(activeChat.id, trimmed, user.id, optimisticTime, 0);
        if (recipientIds.length > 0) {
          await notificationService.notifyChatRecipients({
            recipientUserIds: recipientIds,
            senderId: user.id,
            senderName: user.name || t('screens.chat.user'),
            text: trimmed,
            chatId: activeChat.id,
            chatName: activeChat.name,
          });
        }
        return true;
      } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
        return false;
      } finally {
        setSending(false);
      }
    },
    [
      activeChat,
      notifyMessageRecipients,
      pvz,
      sending,
      supabaseEnabled,
      t,
      updateRoomPreview,
      user?.id,
      user?.name,
    ]
  );

  const deleteChat = useCallback(
    async (chatId: string): Promise<boolean> => {
      if (!user?.id) return false;

      try {
        const chatToDelete = chats.find((c) => c.id === chatId);

        if (supabaseEnabled) {
          await SupabaseChat.deleteRoom(chatId);
        } else {
          await deleteChatMessages(chatId);
        }

        const savedChats = await readUserChats(user.id);
        await writeUserChats(
          user.id,
          savedChats.filter((c) => c.id !== chatId)
        );

        if (chatToDelete?.type === 'private') {
          const recipientId = chatToDelete.participants?.find((id) => id !== user.id);
          if (recipientId) {
            const recipientChats = await readUserChats(recipientId);
            await writeUserChats(
              recipientId,
              recipientChats.filter((c) => c.id !== chatId)
            );
          }
        }

        DataService.emitChange(chatMessagesEventKey(chatId));
        await loadChats();

        if (activeChat?.id === chatId) {
          setActiveChat(null);
          setMessages([]);
        }
        return true;
      } catch (error) {
        console.error('Ошибка удаления чата:', error);
        return false;
      }
    },
    [activeChat?.id, chats, loadChats, supabaseEnabled, user?.id]
  );

  const createPrivateChat = useCallback(
    async (contact: User): Promise<ChatRoom | null> => {
      if (!user?.id || !pvzId) return null;

      const chatId = getPrivateChatId(user.id, contact.id);

      try {
        if (supabaseEnabled) {
          const roomId = await SupabaseChat.ensurePrivateRoom(
            user.id,
            contact.id,
            pvzId,
            user.name || t('screens.chat.user'),
            contact.name
          );
          if (roomId) {
            const newChat: ChatRoom = {
              id: roomId,
              name: contact.name,
              type: 'private',
              avatar: '👤',
              lastMessage: '',
              lastMessageTime: '',
              unreadCount: 0,
              pvzId,
              participants: [user.id, contact.id],
              participantNames: [user.name || '', contact.name],
            };
            await loadChats();
            setActiveChat(newChat);
            return newChat;
          }
        }

        const savedChats = await readUserChats(user.id);
        const existingChat = savedChats.find((c) => c.id === chatId);

        const newChat: ChatRoom = existingChat || {
          id: chatId,
          name: contact.name,
          type: 'private',
          avatar: '👤',
          lastMessage: '',
          lastMessageTime: '',
          unreadCount: 0,
          pvzId,
          participants: [user.id, contact.id],
          participantNames: [user.name || '', contact.name],
        };

        if (!existingChat) {
          savedChats.push(newChat);
          await writeUserChats(user.id, savedChats);

          const recipientChats = await readUserChats(contact.id);
          if (!recipientChats.some((c) => c.id === chatId)) {
            recipientChats.push({
              ...newChat,
              name: user.name || t('screens.chat.user'),
              participantNames: [user.name || '', contact.name],
            });
            await writeUserChats(contact.id, recipientChats);
          }
        }

        await loadChats();
        setActiveChat(newChat);
        return newChat;
      } catch (error) {
        console.error('Ошибка создания чата:', error);
        return null;
      }
    },
    [loadChats, pvzId, supabaseEnabled, t, user?.id, user?.name]
  );

  useEffect(() => {
    loadChatsRef.current = loadChats;
  }, [loadChats]);

  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  useEffect(() => {
    if (!user?.id) return;
    void loadChats();
    void notificationService.deliverPendingStaffAlerts(user.id);
  }, [loadChats, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (supabaseEnabled) {
      return SupabaseChat.subscribeChatMembers(user.id, loadChats);
    }
    return DataService.subscribe(chatListEventKey(user.id), loadChats);
  }, [user?.id, loadChats, supabaseEnabled]);

  useEffect(() => {
    if (!activeChat) return;
    void loadMessages();
    if (!supabaseEnabled) {
      return DataService.subscribe(chatMessagesEventKey(activeChat.id), () => {
        if (mountedRef.current) void loadMessages();
      });
    }
  }, [activeChat, loadMessages, supabaseEnabled]);

  const chatRoomIds = useMemo(() => chats.map((c) => c.id).join('|'), [chats]);

  useEffect(() => {
    if (!user?.id || !chatRoomIds) return;

    const roomIds = chatRoomIds.split('|').filter(Boolean);
    if (roomIds.length === 0) return;

    if (supabaseEnabled) {
      const unsubs = roomIds.map((roomId) =>
        SupabaseChat.subscribeRoomMessages(roomId, (incoming) => {
          handleIncomingMessage(roomId, incoming);
        })
      );
      return () => unsubs.forEach((unsub) => unsub());
    }

    const unsubs = roomIds.map((roomId) =>
      DataService.subscribe(chatMessagesEventKey(roomId), async () => {
        if (activeChatIdRef.current === roomId) {
          void loadMessagesRef.current();
          return;
        }

        try {
          const savedMessages = await readChatMessages(roomId);
          const last = savedMessages[savedMessages.length - 1];
          if (last?.userId && last.userId !== userIdRef.current && last.text) {
            await notifyIncoming(
              roomId,
              last.userId,
              last.userName || t('screens.chat.user'),
              last.text,
              last.id
            );
            setChats((prev) =>
              prev.map((room) =>
                room.id === roomId
                  ? {
                      ...room,
                      unreadCount: room.unreadCount + 1,
                      lastMessage: last.text,
                      lastMessageUserId: last.userId,
                      lastMessageTime: last.time,
                    }
                  : room
              )
            );
          }
        } catch {
          /* ignore */
        }
      })
    );
    return () => unsubs.forEach((unsub) => unsub());
  }, [supabaseEnabled, user?.id, chatRoomIds, handleIncomingMessage, notifyIncoming, t]);

  useEffect(() => {
    if (!user?.id) return;

    void notificationService.deliverPendingStaffAlerts(user.id);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void notificationService.deliverPendingStaffAlerts(user.id);
        void loadChatsRef.current();
      }
    });
    return () => sub.remove();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setChats([]);
      setMessages([]);
      setActiveChat(null);
      setActiveChatRoomId(null);
    }
  }, [user?.id]);

  const emptyValue = useMemo<ChatContextData>(
    () => ({
      chats: [],
      activeChat: null,
      messages: [],
      allUsers: [],
      loadingChats: false,
      loadingMessages: false,
      sending: false,
      supabaseEnabled: false,
      totalUnreadCount: 0,
      pvzId: '',
      setActiveChat: () => {},
      loadChats: async () => {},
      sendMessage: async () => false,
      deleteChat: async () => false,
      createPrivateChat: async () => null,
    }),
    []
  );

  const value = useMemo<ChatContextData>(
    () => ({
      chats,
      activeChat,
      messages,
      allUsers,
      loadingChats,
      loadingMessages,
      sending,
      supabaseEnabled,
      totalUnreadCount,
      pvzId,
      setActiveChat,
      loadChats,
      sendMessage,
      deleteChat,
      createPrivateChat,
    }),
    [
      chats,
      activeChat,
      messages,
      allUsers,
      loadingChats,
      loadingMessages,
      sending,
      supabaseEnabled,
      totalUnreadCount,
      pvzId,
      loadChats,
      sendMessage,
      deleteChat,
      createPrivateChat,
    ]
  );

  return (
    <ChatContext.Provider value={user?.id ? value : emptyValue}>{children}</ChatContext.Provider>
  );
}

export function useChat(): ChatContextData {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within ChatProvider');
  }
  return context;
}

export function useChatOptional(): ChatContextData | null {
  return useContext(ChatContext);
}
