// src/screens/chat/ChatScreen.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { t as i18nT } from '../../i18n';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../context/AuthContext';
import DataService from '../../services/DataService';
import * as SupabaseChat from '../../services/SupabaseChatService';
import notificationService from '../../services/NotificationService';
import { setActiveChatRoomId } from '../../utils/chatNavigationState';
import { colors } from '../../constants/colors';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import ScreenHeader from '../../components/common/ScreenHeader';
import { User } from '../../types/user';
import {
  getGeneralChatId,
  getMessagesStorageKey,
  getPrivateChatId,
  getPvzChatContacts,
  getPvzMemberIds,
  getRoleLabel,
} from '../../utils/chatHelpers';
import {
  Send,
  X,
  Trash2,
  ChevronLeft,
  Plus,
  MessageCircle,
} from 'lucide-react-native';

interface Message {
  id: string;
  text: string;
  userId: string;
  userName: string;
  time: string;
  isOwn: boolean;
  status: 'sent' | 'delivered' | 'read';
}

interface ChatRoom {
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

async function readUserChats(userId: string): Promise<ChatRoom[]> {
  const raw = await SecureStore.getItemAsync(`chats_${userId}`);
  return raw ? JSON.parse(raw) : [];
}

async function writeUserChats(userId: string, chats: ChatRoom[]): Promise<void> {
  await SecureStore.setItemAsync(`chats_${userId}`, JSON.stringify(chats));
  DataService.emitChange(`chat_list_${userId}`);
}

async function migrateLegacyGeneralChat(pvzId: string): Promise<void> {
  const legacyMessages = await SecureStore.getItemAsync('messages_general');
  if (!legacyMessages) return;

  const newKey = getMessagesStorageKey(getGeneralChatId(pvzId));
  const existing = await SecureStore.getItemAsync(newKey);
  if (!existing) {
    await SecureStore.setItemAsync(newKey, legacyMessages);
  }
  await SecureStore.deleteItemAsync('messages_general');
}

async function migrateLegacyGeneralChatEntry(userId: string, pvzId: string): Promise<void> {
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

export default function ChatScreen() {
  const { t } = useTranslation();
  const { user, pvz } = useAuth();
  const { screen, ui } = useThemedScreen();
  const [activeChat, setActiveChat] = useState<ChatRoom | null>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<ChatRoom[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [selectedUserForChat, setSelectedUserForChat] = useState<User | null>(null);
  const [supabaseEnabled, setSupabaseEnabled] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const pvzId = pvz?.id || user?.pvzId || '';

  useEffect(() => {
    SupabaseChat.isChatAvailable().then(setSupabaseEnabled);
  }, [user?.id]);

  const loadChats = useCallback(async () => {
    if (!user?.id || !pvzId) return;

    try {
      const users = await DataService.getUsers();
      setAllUsers(users);

      if (supabaseEnabled && pvz) {
        const generalRoomId = await SupabaseChat.ensureGeneralRoom(pvzId, pvz.name);
        if (generalRoomId) {
          await SupabaseChat.syncPvzMembersToGeneralRoom(generalRoomId, users, pvz);
        }
        const remoteRooms = await SupabaseChat.loadRooms(user.id, pvzId, pvz.name, users);
        if (remoteRooms) {
          setChats(remoteRooms);
          return;
        }
      }

      await migrateLegacyGeneralChat(pvzId);
      await migrateLegacyGeneralChatEntry(user.id, pvzId);

      const savedChats = await readUserChats(user.id);
      const generalChatId = getGeneralChatId(pvzId);
      const messagesKey = getMessagesStorageKey(generalChatId);
      const generalMessagesRaw = await SecureStore.getItemAsync(messagesKey);
      const generalMessages = generalMessagesRaw ? JSON.parse(generalMessagesRaw) : [];
      const lastGeneralMessage = generalMessages[generalMessages.length - 1];

      const savedGeneral = savedChats.find((c) => c.id === generalChatId);

      const generalChat: ChatRoom = {
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
        await writeUserChats(user.id, updated);
      }

      const refreshedChats = await readUserChats(user.id);
      const privateChats = refreshedChats.filter(
        (c) => c.type === 'private' && (!c.pvzId || c.pvzId === pvzId)
      );

      setChats([generalChat, ...privateChats]);
    } catch (error) {
      console.error('Ошибка загрузки чатов:', error);
    }
  }, [user?.id, pvzId, pvz?.name, pvz, supabaseEnabled]);

  const loadMessages = useCallback(async () => {
    if (!activeChat || !user?.id) return;

    try {
      if (supabaseEnabled) {
        const remoteMessages = await SupabaseChat.loadMessages(activeChat.id, user.id);
        if (remoteMessages) {
          setMessages(remoteMessages);
          await SupabaseChat.markRoomRead(activeChat.id, user.id);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          return;
        }
      }

      const messagesKey = getMessagesStorageKey(activeChat.id);
      const messagesRaw = await SecureStore.getItemAsync(messagesKey);
      const savedMessages: Message[] = messagesRaw ? JSON.parse(messagesRaw) : [];

      setMessages(
        savedMessages.map((msg) => ({
          ...msg,
          isOwn: msg.userId === user.id,
        }))
      );

      await markChatAsRead(activeChat.id);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Ошибка загрузки сообщений:', error);
    }
  }, [activeChat, user?.id, supabaseEnabled]);

  const markChatAsRead = async (chatId: string) => {
    if (!user?.id) return;

    try {
      const savedChats = await readUserChats(user.id);
      const updatedChats = savedChats.map((c) =>
        c.id === chatId ? { ...c, unreadCount: 0 } : c
      );
      await writeUserChats(user.id, updatedChats);
      await loadChats();
    } catch (error) {
      console.error('Ошибка обновления чата:', error);
    }
  };

  const upsertChatForUser = async (
    targetUserId: string,
    chat: ChatRoom,
    message: Message,
    incrementUnread: boolean
  ) => {
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
  };

  const getMessageRecipients = async (): Promise<string[]> => {
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
  };

  const notifyMessageRecipients = async (text: string) => {
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
  };

  const handleIncomingMessage = useCallback(
    async (roomId: string) => {
      if (!user?.id) return;
      if (activeChat?.id === roomId) {
        await loadMessages();
      } else {
        await loadChats();
      }
    },
    [user?.id, activeChat?.id, loadMessages, loadChats]
  );

  const saveMessage = async (newMessage: Message) => {
    if (!activeChat || !user?.id || !pvzId) return;

    try {
      const messagesKey = getMessagesStorageKey(activeChat.id);
      const messagesRaw = await SecureStore.getItemAsync(messagesKey);
      const savedMessages = messagesRaw ? JSON.parse(messagesRaw) : [];
      savedMessages.push(newMessage);
      await SecureStore.setItemAsync(messagesKey, JSON.stringify(savedMessages));
      DataService.emitChange(`chat_messages_${activeChat.id}`);

      await upsertChatForUser(user.id, activeChat, newMessage, false);

      const users = await DataService.getUsers();
      const recipientIds: string[] = [];

      if (activeChat.type === 'general') {
        const memberIds = getPvzMemberIds(users, pvz, user.id);
        for (const memberId of memberIds) {
          await upsertChatForUser(memberId, activeChat, newMessage, true);
          recipientIds.push(memberId);
        }
      } else if (activeChat.type === 'private') {
        const recipientId = activeChat.participants?.find((id) => id !== user.id);
        if (recipientId) {
          const recipientChat: ChatRoom = {
            ...activeChat,
            name: user.name,
            participants: activeChat.participants,
            participantNames: activeChat.participantNames,
          };
          await upsertChatForUser(recipientId, recipientChat, newMessage, true);
          recipientIds.push(recipientId);
        }
      }

      await notificationService.notifyChatRecipients({
        recipientUserIds: recipientIds,
        senderId: user.id,
        senderName: user.name || t('screens.chat.user'),
        text: newMessage.text,
        chatId: activeChat.id,
        chatName: activeChat.name,
      });
    } catch (error) {
      console.error('Ошибка сохранения сообщения:', error);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !activeChat || !user?.id) return;

    const text = message.trim();
    setMessage('');

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
        text,
        user.id,
        user.name || t('screens.chat.me'),
        { notifyUserIds: notifyIds }
      );

      if (sent) {
        setMessages((prev) => [...prev, sent]);
        await notifyMessageRecipients(text);
        await loadChats();
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        return;
      }
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      userId: user.id,
      userName: user.name || t('screens.chat.me'),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isOwn: true,
      status: 'sent',
    };

    setMessages((prev) => [...prev, newMessage]);
    await saveMessage(newMessage);
    await loadChats();

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const deleteChat = (chatId: string, chatName: string) => {
    Alert.alert(
      t('alerts.confirm.deleteChatTitle'),
      t('alerts.confirm.deleteChat', { name: chatName }),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('common.actions.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;

            try {
              const chatToDelete = chats.find((c) => c.id === chatId);

              if (supabaseEnabled) {
                await SupabaseChat.deleteRoom(chatId);
              } else {
                await SecureStore.deleteItemAsync(getMessagesStorageKey(chatId));
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

              DataService.emitChange(`chat_messages_${chatId}`);
              await loadChats();

              if (activeChat?.id === chatId) {
                setActiveChat(null);
                setMessages([]);
              }
            } catch {
              Alert.alert(t('common.error.title'), t('alerts.network.deleteChatFailed'));
            }
          },
        },
      ]
    );
  };

  const createPrivateChat = async () => {
    if (!selectedUserForChat || !user?.id || !pvzId) return;

    const chatId = getPrivateChatId(user.id, selectedUserForChat.id);

    try {
      if (supabaseEnabled) {
        const roomId = await SupabaseChat.ensurePrivateRoom(
          user.id,
          selectedUserForChat.id,
          pvzId,
          user.name || t('screens.chat.user'),
          selectedUserForChat.name
        );
        if (roomId) {
          const newChat: ChatRoom = {
            id: roomId,
            name: selectedUserForChat.name,
            type: 'private',
            avatar: '👤',
            lastMessage: '',
            lastMessageTime: '',
            unreadCount: 0,
            pvzId,
            participants: [user.id, selectedUserForChat.id],
            participantNames: [user.name || '', selectedUserForChat.name],
          };
          setSelectedUserForChat(null);
          setShowNewChatModal(false);
          await loadChats();
          setActiveChat(newChat);
          return;
        }
      }

      const savedChats = await readUserChats(user.id);
      const existingChat = savedChats.find((c) => c.id === chatId);

      const newChat: ChatRoom = existingChat || {
        id: chatId,
        name: selectedUserForChat.name,
        type: 'private',
        avatar: '👤',
        lastMessage: '',
        lastMessageTime: '',
        unreadCount: 0,
        pvzId,
        participants: [user.id, selectedUserForChat.id],
        participantNames: [user.name || '', selectedUserForChat.name],
      };

      if (!existingChat) {
        savedChats.push(newChat);
        await writeUserChats(user.id, savedChats);

        const recipientChats = await readUserChats(selectedUserForChat.id);
        if (!recipientChats.some((c) => c.id === chatId)) {
          recipientChats.push({
            ...newChat,
            name: user.name || t('screens.chat.user'),
            participantNames: [user.name || '', selectedUserForChat.name],
          });
          await writeUserChats(selectedUserForChat.id, recipientChats);
        }
      }

      setSelectedUserForChat(null);
      setShowNewChatModal(false);
      await loadChats();
      setActiveChat(newChat);
    } catch (error) {
      console.error('Ошибка создания чата:', error);
      Alert.alert(t('common.error.title'), t('alerts.network.createChatFailed'));
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadChats();
      if (user?.id) {
        notificationService.deliverPendingStaffAlerts(user.id);
      }
    }, [loadChats, user?.id])
  );

  useEffect(() => {
    setActiveChatRoomId(activeChat?.id || null);
    return () => setActiveChatRoomId(null);
  }, [activeChat?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (supabaseEnabled) {
      return SupabaseChat.subscribeChatMembers(user.id, loadChats);
    }
    return DataService.subscribe(`chat_list_${user.id}`, loadChats);
  }, [user?.id, loadChats, supabaseEnabled]);

  useEffect(() => {
    if (!activeChat) return;
    loadMessages();
    if (!supabaseEnabled) {
      return DataService.subscribe(`chat_messages_${activeChat.id}`, loadMessages);
    }
  }, [activeChat, loadMessages, supabaseEnabled]);

  const chatRoomIds = chats.map((c) => c.id).join('|');

  useEffect(() => {
    if (!user?.id || chats.length === 0) return;

    if (supabaseEnabled) {
      const unsubs = chats.map((chat) =>
        SupabaseChat.subscribeRoomMessages(chat.id, () => handleIncomingMessage(chat.id))
      );
      return () => unsubs.forEach((unsub) => unsub());
    }

    const unsubs = chats.map((chat) =>
      DataService.subscribe(`chat_messages_${chat.id}`, () => {
        if (activeChat?.id === chat.id) {
          loadMessages();
        } else {
          loadChats();
        }
      })
    );
    return () => unsubs.forEach((unsub) => unsub());
  }, [supabaseEnabled, user?.id, chatRoomIds, handleIncomingMessage, activeChat?.id, loadMessages, loadChats, chats]);

  const contacts = getPvzChatContacts(allUsers, pvz, user?.id || '');

  const renderChatItem = ({ item }: { item: ChatRoom }) => (
    <TouchableOpacity
      style={[
        styles.chatItem,
        { backgroundColor: screen.card },
        activeChat?.id === item.id && styles.chatItemActive,
      ]}
      onPress={() => setActiveChat(item)}
      onLongPress={() => item.type === 'private' && deleteChat(item.id, item.name)}
    >
      <View style={styles.chatAvatar}>
        <Text style={styles.chatAvatarText}>{item.avatar}</Text>
        {item.unreadCount > 0 && <View style={[styles.unreadDot, { borderColor: screen.card }]} />}
      </View>
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={[styles.chatName, { color: screen.text }]}>{item.name}</Text>
          {item.lastMessageTime ? (
            <Text style={[styles.chatTime, { color: screen.textSecondary }]}>{item.lastMessageTime}</Text>
          ) : null}
        </View>
        <View style={styles.chatFooter}>
          <Text style={[styles.chatLastMessage, { color: screen.textSecondary }]} numberOfLines={1}>
            {item.lastMessageUserId === user?.id
              ? t('screens.chat.youMessage', { message: item.lastMessage })
              : item.lastMessage}
          </Text>
          {item.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
      {item.type === 'private' && (
        <TouchableOpacity
          style={styles.deleteChatButton}
          onPress={() => deleteChat(item.id, item.name)}
        >
          <Trash2 size={16} color={colors.danger} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[styles.messageRow, item.isOwn ? styles.messageRowOwn : styles.messageRowOther]}>
      {!item.isOwn && (
        <View style={styles.messageAvatar}>
          <Text style={styles.messageAvatarText}>{item.userName.charAt(0)}</Text>
        </View>
      )}
      <View
        style={[
          styles.messageBubble,
          item.isOwn ? styles.messageBubbleOwn : [styles.messageBubbleOther, { backgroundColor: screen.card }],
        ]}
      >
        {!item.isOwn && <Text style={styles.messageUserName}>{item.userName}</Text>}
        <Text
          style={[
            styles.messageText,
            item.isOwn ? styles.messageTextOwn : { color: screen.text },
          ]}
        >
          {item.text}
        </Text>
        <Text
          style={[
            styles.messageTime,
            item.isOwn ? styles.messageTimeOwn : { color: screen.textSecondary },
          ]}
        >
          {item.time}
        </Text>
      </View>
    </View>
  );

  if (!pvzId) {
    return (
      <ThemedSafeAreaView>
        <View style={styles.emptyContainer}>
          <MessageCircle size={48} color={colors.grayLighter} />
          <Text style={[styles.emptyText, { color: screen.textSecondary }]}>{t('common.pvz.notSelected')}</Text>
          <Text style={[styles.emptySubtext, { color: screen.textSecondary }]}>{t('screens.chat.chatRequiresPvz')}</Text>
        </View>
      </ThemedSafeAreaView>
    );
  }

  if (activeChat) {
    return (
      <ThemedSafeAreaView>
        <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.activeChatHeader}>
          <TouchableOpacity onPress={() => setActiveChat(null)} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.chatHeaderInfo}>
            <Text style={styles.chatHeaderName}>{activeChat.name}</Text>
            <Text style={styles.chatHeaderStatus}>
              {activeChat.type === 'general' ? t('screens.chat.general') : t('screens.chat.personal')}
            </Text>
          </View>
          {activeChat.type === 'private' ? (
            <TouchableOpacity
              style={styles.deleteChatButton}
              onPress={() => deleteChat(activeChat.id, activeChat.name)}
            >
              <Trash2 size={20} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </LinearGradient>

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={[styles.inputContainer, { backgroundColor: screen.card, borderTopColor: screen.border }]}>
            <TextInput
              style={[styles.input, { color: screen.text }]}
              placeholder={t('screens.chat.messagePlaceholder')}
              value={message}
              onChangeText={setMessage}
              multiline
              placeholderTextColor={colors.grayLighter}
            />
            <TouchableOpacity
              style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
              onPress={sendMessage}
              disabled={!message.trim()}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                style={styles.sendGradient}
              >
                <Send size={18} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </ThemedSafeAreaView>
    );
  }

  return (
    <ThemedSafeAreaView>
      <ScreenHeader
        title={t('screens.chat.title')}
        right={
          <TouchableOpacity onPress={() => setShowNewChatModal(true)} style={styles.newChatButton}>
            <Plus size={24} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      <FlatList
        data={chats}
        renderItem={renderChatItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MessageCircle size={48} color={colors.grayLighter} />
            <Text style={[styles.emptyText, { color: screen.textSecondary }]}>{t('screens.chat.emptyNoChats')}</Text>
          </View>
        }
      />

      <Modal
        visible={showNewChatModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewChatModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, ui.modal]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, ui.title]}>{t('screens.chat.newChat')}</Text>
              <TouchableOpacity onPress={() => setShowNewChatModal(false)}>
                <X size={24} color={colors.gray} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: screen.textSecondary }]}>
              {t('screens.chat.pvzParticipants')}
              {pvz?.name ? t('screens.chat.pvzParticipantsSuffix', { name: pvz.name }) : ''}
            </Text>

            <FlatList
              data={contacts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.userItem,
                    { backgroundColor: ui.input.backgroundColor },
                    selectedUserForChat?.id === item.id && styles.userItemActive,
                  ]}
                  onPress={() => setSelectedUserForChat(item)}
                >
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>{item.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={[styles.userName, { color: screen.text }]}>{item.name}</Text>
                    <Text style={[styles.userRole, { color: screen.textSecondary }]}>{getRoleLabel(item.role)}</Text>
                  </View>
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.usersList}
              ListEmptyComponent={
                <Text style={[styles.modalEmpty, { color: screen.textSecondary }]}>{t('screens.chat.noContacts')}</Text>
              }
            />

            <TouchableOpacity
              style={[styles.createButton, !selectedUserForChat && styles.createButtonDisabled]}
              onPress={createPrivateChat}
              disabled={!selectedUserForChat}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                style={styles.createButtonGradient}
              >
                <MessageCircle size={18} color="#FFFFFF" />
                <Text style={styles.createButtonText}>{t('screens.chat.createChat')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20 },
  headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  newChatButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  chatList: { padding: 16 },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
  },
  chatItemActive: { backgroundColor: colors.primaryLight },
  chatAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    position: 'relative',
  },
  chatAvatarText: { fontSize: 24 },
  unreadDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
  },
  chatInfo: { flex: 1 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatName: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  chatTime: { fontSize: 11 },
  chatFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatLastMessage: { flex: 1, fontSize: 13, marginRight: 8 },
  unreadBadge: {
    backgroundColor: colors.primary,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
  deleteChatButton: { padding: 8, marginLeft: 8 },

  activeChatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chatHeaderInfo: { flex: 1, alignItems: 'center' },
  chatHeaderName: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  chatHeaderStatus: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },

  messagesList: { padding: 16, paddingBottom: 20 },
  messageRow: { flexDirection: 'row', marginBottom: 16 },
  messageRowOwn: { justifyContent: 'flex-end' },
  messageRowOther: { justifyContent: 'flex-start' },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  messageAvatarText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  messageBubble: { maxWidth: '75%', padding: 12, borderRadius: 20 },
  messageBubbleOwn: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  messageBubbleOther: {
    borderBottomLeftRadius: 4,
  },
  messageUserName: { fontSize: 11, fontWeight: '600', color: colors.primary, marginBottom: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  messageTextOwn: { color: '#FFFFFF' },
  messageTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  messageTimeOwn: { color: 'rgba(255,255,255,0.7)' },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  input: { flex: 1, maxHeight: 100, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  sendButton: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', marginLeft: 4 },
  sendButtonDisabled: { opacity: 0.5 },
  sendGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyText: { fontSize: 16, marginTop: 16 },
  emptySubtext: { fontSize: 13, marginTop: 8, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { borderRadius: 24, padding: 20, width: '90%', maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalSubtitle: { fontSize: 14, marginBottom: 16 },
  modalEmpty: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  usersList: { paddingBottom: 16 },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  userItemActive: { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userAvatarText: { fontSize: 18, fontWeight: '600', color: colors.primary },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '500', marginBottom: 2 },
  userRole: { fontSize: 12 },
  createButton: { borderRadius: 30, overflow: 'hidden', marginTop: 16 },
  createButtonDisabled: { opacity: 0.6 },
  createButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  createButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
