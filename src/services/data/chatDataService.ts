import * as SecureStore from 'expo-secure-store';
import { t as i18nT } from '../../i18n';
import { Pvz, User } from '../../types/user';
import {
  getGeneralChatId,
  getMessagesStorageKey,
  getPvzMemberIds,
} from '../../utils/chatHelpers';
import { safeParseJson } from '../../utils/safeJson';
import { dataEventBus } from './dataEventBus';
import DataService from '../DataService';

export interface LocalChatMessage {
  id: string;
  text: string;
  userId: string;
  userName: string;
  time: string;
  isOwn: boolean;
  status: 'sent' | 'delivered' | 'read';
}

export interface LocalChatRoom {
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

function chatsStorageKey(userId: string): string {
  return `chats_${userId}`;
}

export function chatListEventKey(userId: string): string {
  return `chat_list_${userId}`;
}

export function chatMessagesEventKey(chatId: string): string {
  return `chat_messages_${chatId}`;
}

export async function readUserChats(userId: string): Promise<LocalChatRoom[]> {
  const raw = await SecureStore.getItemAsync(chatsStorageKey(userId));
  return safeParseJson<LocalChatRoom[]>(raw ?? '[]', []);
}

export async function writeUserChats(userId: string, chats: LocalChatRoom[]): Promise<void> {
  await SecureStore.setItemAsync(chatsStorageKey(userId), JSON.stringify(chats));
  dataEventBus.emitChange(chatListEventKey(userId));
}

export async function readChatMessages(chatId: string): Promise<LocalChatMessage[]> {
  const raw = await SecureStore.getItemAsync(getMessagesStorageKey(chatId));
  return safeParseJson<LocalChatMessage[]>(raw ?? '[]', []);
}

export async function writeChatMessages(chatId: string, messages: LocalChatMessage[]): Promise<void> {
  await SecureStore.setItemAsync(getMessagesStorageKey(chatId), JSON.stringify(messages));
  dataEventBus.emitChange(chatMessagesEventKey(chatId));
}

export async function deleteChatMessages(chatId: string): Promise<void> {
  await SecureStore.deleteItemAsync(getMessagesStorageKey(chatId));
}

export async function migrateLegacyGeneralChat(pvzId: string): Promise<void> {
  const legacyMessages = await SecureStore.getItemAsync('messages_general');
  if (!legacyMessages) return;

  const newKey = getMessagesStorageKey(getGeneralChatId(pvzId));
  const existing = await SecureStore.getItemAsync(newKey);
  if (!existing) {
    await SecureStore.setItemAsync(newKey, legacyMessages);
  }
  await SecureStore.deleteItemAsync('messages_general');
}

export async function migrateLegacyGeneralChatEntry(userId: string, pvzId: string): Promise<void> {
  const chats = await readUserChats(userId);
  const legacy = chats.find((c) => c.id === 'general');
  if (!legacy) return;

  const generalId = getGeneralChatId(pvzId);
  if (chats.some((c) => c.id === generalId)) {
    await writeUserChats(
      userId,
      chats.filter((c) => c.id !== 'general')
    );
    return;
  }

  await writeUserChats(
    userId,
    chats.map((c) =>
      c.id === 'general' ? { ...c, id: generalId, pvzId, name: i18nT('screens.chat.general') } : c
    )
  );
}

export async function upsertChatForUser(
  targetUserId: string,
  chat: LocalChatRoom,
  message: LocalChatMessage,
  incrementUnread: boolean
): Promise<void> {
  const targetChats = await readUserChats(targetUserId);
  const index = targetChats.findIndex((c) => c.id === chat.id);

  if (index === -1) {
    targetChats.push({
      ...chat,
      lastMessage: message.text,
      lastMessageTime: message.time,
      lastMessageUserId: message.userId,
      unreadCount: incrementUnread ? 1 : 0,
    });
  } else {
    targetChats[index] = {
      ...targetChats[index],
      lastMessage: message.text,
      lastMessageTime: message.time,
      lastMessageUserId: message.userId,
      unreadCount: incrementUnread
        ? (targetChats[index].unreadCount || 0) + 1
        : targetChats[index].unreadCount || 0,
    };
  }

  await writeUserChats(targetUserId, targetChats);
}

export async function markLocalChatAsRead(userId: string, chatId: string): Promise<void> {
  const savedChats = await readUserChats(userId);
  const updatedChats = savedChats.map((c) =>
    c.id === chatId ? { ...c, unreadCount: 0 } : c
  );
  await writeUserChats(userId, updatedChats);
}

export async function loadLocalChatRooms(
  userId: string,
  pvzId: string,
  pvz: Pvz | null,
  t: (key: string, options?: Record<string, unknown>) => string
): Promise<LocalChatRoom[]> {
  await migrateLegacyGeneralChat(pvzId);
  await migrateLegacyGeneralChatEntry(userId, pvzId);

  const savedChats = await readUserChats(userId);
  const generalChatId = getGeneralChatId(pvzId);
  const generalMessages = await readChatMessages(generalChatId);
  const lastGeneralMessage = generalMessages[generalMessages.length - 1];
  const savedGeneral = savedChats.find((c) => c.id === generalChatId);

  const generalChat: LocalChatRoom = {
    id: generalChatId,
    name: pvz?.name ? t('screens.chat.generalWithPvz', { name: pvz.name }) : t('screens.chat.general'),
    type: 'general',
    avatar: '🏪',
    lastMessage: lastGeneralMessage?.text || t('screens.chat.welcome'),
    lastMessageTime: lastGeneralMessage?.time || '',
    lastMessageUserId: lastGeneralMessage?.userId,
    unreadCount: savedGeneral?.unreadCount || 0,
    pvzId,
  };

  if (!savedGeneral) {
    const updated = [generalChat, ...savedChats.filter((c) => c.type === 'private')];
    await writeUserChats(userId, updated);
  }

  const refreshedChats = await readUserChats(userId);
  const privateChats = refreshedChats.filter(
    (c) => c.type === 'private' && (!c.pvzId || c.pvzId === pvzId)
  );

  return [generalChat, ...privateChats];
}

export async function saveLocalChatMessage(params: {
  activeChat: LocalChatRoom;
  newMessage: LocalChatMessage;
  userId: string;
  pvz: Pvz | null;
  senderName: string;
}): Promise<string[]> {
  const { activeChat, newMessage, userId, pvz, senderName } = params;
  const savedMessages = await readChatMessages(activeChat.id);
  savedMessages.push(newMessage);
  await writeChatMessages(activeChat.id, savedMessages);

  await upsertChatForUser(userId, activeChat, newMessage, false);

  const users = await DataService.getUsers();
  const recipientIds: string[] = [];

  if (activeChat.type === 'general') {
    const memberIds = getPvzMemberIds(users, pvz, userId);
    for (const memberId of memberIds) {
      await upsertChatForUser(memberId, activeChat, newMessage, true);
      recipientIds.push(memberId);
    }
  } else if (activeChat.type === 'private') {
    const recipientId = activeChat.participants?.find((id) => id !== userId);
    if (recipientId) {
      const recipientChat: LocalChatRoom = {
        ...activeChat,
        name: senderName,
        participants: activeChat.participants,
        participantNames: activeChat.participantNames,
      };
      await upsertChatForUser(recipientId, recipientChat, newMessage, true);
      recipientIds.push(recipientId);
    }
  }

  return recipientIds;
}
