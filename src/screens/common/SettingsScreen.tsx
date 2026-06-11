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
import { Bell, Moon, Volume2, Vibrate, ScanFace, Lock, ChevronRight, Languages, Check } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNotificationSettings } from '../../hooks/useNotificationSettings';
import { useAuth } from '../../context/AuthContext';
import { useBiometricSettings } from '../../hooks/useBiometricSettings';
import { getNotificationSettingsKey } from '../../utils/notificationSettingsHelpers';
import type { AppLanguage } from '../../i18n/types';

const LANGUAGE_OPTIONS: { code: AppLanguage; labelKey: string }[] = [
  { code: 'ru', labelKey: 'common.language.russian' },
  { code: 'en', labelKey: 'common.language.english' },
];

export default function SettingsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { colors, theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { user } = useAuth();
  const settingsKey = getNotificationSettingsKey(user?.role);
  const {
    pushEnabled,
    soundEnabled,
    vibrationEnabled,
    loading: notificationsLoading,
    setPushEnabled,
    setSoundEnabled,
    setVibrationEnabled,
  } = useNotificationSettings(settingsKey);
  const {
    available: biometricAvailable,
    enabled: biometricEnabled,
    label: biometricLabel,
    usesDeviceAuth: biometricUsesDeviceAuth,
    toggling: biometricToggling,
    setBiometricEnabled,
  } = useBiometricSettings(user?.phone);

  const styles = createStyles(colors);

  return (
    <ThemedSafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenHeader title={t('settings.title')} onBack={() => navigation.goBack()} />

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('common.language.section')}</Text>
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = language === option.code;
            return (
              <TouchableOpacity
                key={option.code}
                style={[styles.linkItem, selected && styles.selectedItem]}
                onPress={() => setLanguage(option.code)}
                activeOpacity={0.7}
              >
                <View style={styles.settingLeft}>
                  <Languages size={20} color={colors.primary} />
                  <Text style={styles.settingText}>{t(option.labelKey)}</Text>
                </View>
                {selected ? (
                  <Check size={20} color={colors.primary} />
                ) : (
                  <ChevronRight size={18} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            );
          })}
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
          {biometricAvailable && (
            <>
              <View style={styles.settingItem}>
                <View style={styles.settingLeft}>
                  <ScanFace size={20} color={colors.primary} />
                  <Text style={styles.settingText}>
                    {t('settings.security.biometricLogin', { label: biometricLabel })}
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={setBiometricEnabled}
                  disabled={biometricToggling}
                  trackColor={{ false: colors.border, true: colors.primary }}
                />
              </View>
              {biometricUsesDeviceAuth && (
                <Text style={styles.biometricHint}>{t('settings.security.biometricHint')}</Text>
              )}
            </>
          )}
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
    selectedItem: {
      borderWidth: 1,
      borderColor: colors.primary,
    },
    biometricHint: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 17,
      marginTop: -4,
      marginBottom: 4,
      paddingHorizontal: 4,
    },
  });
