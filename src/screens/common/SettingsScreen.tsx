import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { Bell, Moon, Volume2, Vibrate, Lock, ChevronRight, Trash2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import LanguagePicker from '../../components/common/LanguagePicker';
import { useNotificationSettings } from '../../hooks/useNotificationSettings';
import { useDeleteAccountPrompt } from '../../hooks/useDeleteAccountPrompt';
import { useAuth } from '../../context/AuthContext';
import {
  getNotificationSettingsKey,
  type NotificationTypeSettings,
} from '../../utils/notificationSettingsHelpers';

const TYPE_KEYS: Array<keyof NotificationTypeSettings> = [
  'shift',
  'schedule',
  'request',
  'swap',
  'chat',
  'system',
];

export default function SettingsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { colors, theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const { promptDeleteAccount, deletingAccount } = useDeleteAccountPrompt();
  const settingsKey = getNotificationSettingsKey(user?.id, user?.role);
  const {
    pushEnabled,
    soundEnabled,
    vibrationEnabled,
    types,
    loading: notificationsLoading,
    setPushEnabled,
    setSoundEnabled,
    setVibrationEnabled,
    setTypeEnabled,
  } = useNotificationSettings(settingsKey);

  const styles = createStyles(colors);

  return (
    <ThemedSafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenHeader title={t('settings.title')} onBack={() => navigation.goBack()} />

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('common.language.section')}</Text>
          <LanguagePicker variant="row" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.notifications.section')}</Text>
          {notificationsLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <>
              <View style={styles.settingItem}>
                <View style={styles.settingLeft}>
                  <Bell size={20} color={colors.primary} />
                  <Text style={styles.settingText}>{t('settings.notifications.push')}</Text>
                </View>
                <Switch
                  value={pushEnabled}
                  onValueChange={setPushEnabled}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              <View style={styles.settingItem}>
                <View style={styles.settingLeft}>
                  <Volume2 size={20} color={colors.primary} />
                  <Text style={styles.settingText}>{t('settings.notifications.sound')}</Text>
                </View>
                <Switch
                  value={soundEnabled}
                  onValueChange={setSoundEnabled}
                  disabled={!pushEnabled}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              <View style={styles.settingItem}>
                <View style={styles.settingLeft}>
                  <Vibrate size={20} color={colors.primary} />
                  <Text style={styles.settingText}>{t('settings.notifications.vibration')}</Text>
                </View>
                <Switch
                  value={vibrationEnabled}
                  onValueChange={setVibrationEnabled}
                  disabled={!pushEnabled}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>

              <Text style={styles.subsectionTitle}>{t('settings.notifications.typesSection')}</Text>
              {TYPE_KEYS.map((typeKey) => (
                <View key={typeKey} style={styles.settingItem}>
                  <Text style={styles.settingText}>{t(`settings.notifications.types.${typeKey}`)}</Text>
                  <Switch
                    value={types[typeKey]}
                    onValueChange={(value) => setTypeEnabled(typeKey, value)}
                    disabled={!pushEnabled}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                </View>
              ))}
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.security.section')}</Text>
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => navigation.navigate('ChangePin')}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <Lock size={20} color={colors.primary} />
              <Text style={styles.settingText}>{t('settings.security.changePin')}</Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dangerItem}
            onPress={promptDeleteAccount}
            disabled={deletingAccount}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('settings.security.deleteAccount')}
          >
            <View style={styles.settingLeft}>
              {deletingAccount ? (
                <ActivityIndicator size="small" color="#E53935" />
              ) : (
                <Trash2 size={20} color="#E53935" />
              )}
              <View style={styles.dangerTextBlock}>
                <Text style={styles.dangerText}>{t('settings.security.deleteAccount')}</Text>
                <Text style={styles.dangerHint}>{t('settings.security.deleteAccountDesc')}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.appearance.section')}</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Moon size={20} color={colors.primary} />
              <Text style={styles.settingText}>{t('settings.appearance.darkTheme')}</Text>
            </View>
            <Switch
              value={theme === 'dark'}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>
      </ScrollView>
    </ThemedSafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, padding: 16 },
    section: { marginBottom: 24 },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 12,
      marginLeft: 4,
    },
    subsectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginTop: 8,
      marginBottom: 8,
      marginLeft: 4,
    },
    loadingRow: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 24,
      alignItems: 'center',
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 8,
    },
    settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    settingText: { fontSize: 15, color: colors.text },
    linkItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 8,
    },
    dangerItem: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: '#FFCDD2',
    },
    dangerTextBlock: { flex: 1, gap: 4 },
    dangerText: { fontSize: 15, fontWeight: '600', color: '#E53935' },
    dangerHint: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
    selectedItem: {
      borderWidth: 1,
      borderColor: colors.primary,
    },
  });
