import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { formatPhoneForDisplay } from '../../utils/phoneHelpers';
import { SUPPORT_TOPICS, SupportTopic } from '../../utils/supportHelpers';
import SupportService from '../../services/SupportService';
import { ChevronLeft, Send, LifeBuoy } from 'lucide-react-native';

export default function SupportScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user, pvz } = useAuth();
  const [topic, setTopic] = useState<SupportTopic>('feature');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      await SupportService.submitMessage({
        topic,
        message,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.role,
        userPhone: user?.phone ? formatPhoneForDisplay(user.phone) : undefined,
        pvzId: pvz?.id,
        pvzName: pvz?.name,
      });

      Alert.alert(
        t('screens.support.thanksTitle'),
        t('screens.support.thanksMessage'),
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch {
      Alert.alert(
        t('screens.support.sendFailedTitle'),
        t('screens.support.sendFailedMessage')
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <ThemedSafeAreaView>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ChevronLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('screens.support.title')}</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.introCard}>
            <LifeBuoy size={28} color={colors.primary} />
            <Text style={styles.introTitle}>{t('screens.support.introTitle')}</Text>
            <Text style={styles.introText}>{t('screens.support.introText')}</Text>
          </View>

          <Text style={styles.label}>{t('screens.support.topicLabel')}</Text>
          <View style={styles.topicRow}>
            {SUPPORT_TOPICS.map((item) => {
              const active = topic === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.topicChip, active && styles.topicChipActive]}
                  onPress={() => setTopic(item.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.topicChipText, active && styles.topicChipTextActive]}>
                    {t(`screens.support.topics.${item.id}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>{t('screens.support.messageLabel')}</Text>
          <TextInput
            style={styles.messageInput}
            value={message}
            onChangeText={setMessage}
            placeholder={t('screens.support.messagePlaceholder')}
            placeholderTextColor={colors.grayLight}
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.sendButton, sending && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={sending}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={styles.sendGradient}
            >
              <Send size={20} color="#FFFFFF" />
              <Text style={styles.sendText}>{sending ? t('screens.support.sending') : t('screens.support.submit')}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.hint}>{t('screens.support.hint')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedSafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  content: { flex: 1 },
  contentInner: { padding: 20, paddingBottom: 32 },
  introCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  introTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  introText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 10,
  },
  topicRow: { gap: 8, marginBottom: 20 },
  topicChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
  },
  topicChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  topicChipText: { fontSize: 14, color: '#666', fontWeight: '500' },
  topicChipTextActive: { color: colors.primary, fontWeight: '600' },
  messageInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 14,
    minHeight: 160,
    fontSize: 15,
    color: '#1A1A1A',
    lineHeight: 22,
  },
  sendButton: { borderRadius: 16, overflow: 'hidden', marginBottom: 12, marginTop: 16 },
  sendButtonDisabled: { opacity: 0.7 },
  sendGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  sendText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  hint: { fontSize: 12, color: '#888', lineHeight: 18, textAlign: 'center' },
});
