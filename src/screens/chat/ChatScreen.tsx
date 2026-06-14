// src/screens/chat/ChatScreen.tsx
import React, { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
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
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useAuth } from '../../context/AuthContext';
import { ChatRoom, useChat } from '../../context/ChatContext';
import { colors } from '../../constants/colors';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useScreenToast } from '../../hooks/useScreenToast';
import ScreenHeader from '../../components/common/ScreenHeader';
import { User } from '../../types/user';
import { getPvzChatContacts, getRoleLabel } from '../../utils/chatHelpers';
import notificationService from '../../services/NotificationService';
import {
  Send,
  X,
  Trash2,
  ChevronLeft,
  Plus,
  MessageCircle,
} from 'lucide-react-native';

export default function ChatScreen() {
  const { t } = useTranslation();
  const { user, pvz } = useAuth();
  const { screen, ui } = useThemedScreen();
  const { showError } = useScreenToast();
  const {
    chats,
    activeChat,
    messages,
    allUsers,
    loadingChats,
    loadingMessages,
    sending,
    pvzId,
    setActiveChat,
    sendMessage: sendChatMessage,
    deleteChat: deleteChatRoom,
    createPrivateChat,
    loadChats,
  } = useChat();

  const [message, setMessage] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [selectedUserForChat, setSelectedUserForChat] = useState<User | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useFocusEffect(
    useCallback(() => {
      void loadChats();
      if (user?.id) {
        void notificationService.deliverPendingStaffAlerts(user.id);
      }
    }, [loadChats, user?.id])
  );

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
            const ok = await deleteChatRoom(chatId);
            if (!ok) showError(t('alerts.network.deleteChatFailed'));
          },
        },
      ]
    );
  };

  const sendMessage = async () => {
    if (!message.trim() || sending) return;
    const text = message.trim();
    setMessage('');
    const ok = await sendChatMessage(text);
    if (!ok) {
      setMessage(text);
      showError(t('alerts.network.sendMessageFailed'));
      return;
    }
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const handleCreatePrivateChat = async () => {
    if (!selectedUserForChat) return;
    const created = await createPrivateChat(selectedUserForChat);
    setSelectedUserForChat(null);
    setShowNewChatModal(false);
    if (!created) showError(t('alerts.network.createChatFailed'));
  };

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

  const renderMessage = ({ item }: { item: (typeof messages)[number] }) => (
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
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            loadingMessages ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : null
          }
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
              style={[styles.sendButton, (!message.trim() || sending) && styles.sendButtonDisabled]}
              onPress={sendMessage}
              disabled={!message.trim() || sending}
            >
              {sending ? (
                <View style={styles.sendGradient}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
              ) : (
                <LinearGradient
                  colors={[colors.primary, colors.primaryDark]}
                  style={styles.sendGradient}
                >
                  <Send size={18} color="#FFFFFF" />
                </LinearGradient>
              )}
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
          loadingChats ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <MessageCircle size={48} color={colors.grayLighter} />
              <Text style={[styles.emptyText, { color: screen.textSecondary }]}>
                {t('screens.chat.emptyNoChats')}
              </Text>
            </View>
          )
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
              onPress={handleCreatePrivateChat}
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
  messageBubbleOther: { borderBottomLeftRadius: 4 },
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
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
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
