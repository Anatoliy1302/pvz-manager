/**
 * Account deletion screen — Apple App Store Guideline 5.1.1 (account deletion).
 * Permanently delete account and associated data.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useDeleteAccountPrompt } from '../../hooks/useDeleteAccountPrompt';
import { colors as staticColors } from '../../constants/colors';

export default function DeleteAccountScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { t } = useTranslation();
  const { ui, screen } = useThemedScreen();
  const { promptDeleteAccount, deletingAccount } = useDeleteAccountPrompt();
  const styles = createStyles(screen);

  return (
    <ThemedSafeAreaView style={[styles.container, ui.screen]} edges={['top', 'left', 'right']}>
      <ScreenHeader title={t('settings.security.deleteAccount')} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: screen.text }]}>{t('screens.deleteAccount.title')}</Text>
        <Text style={[styles.body, { color: screen.textSecondary }]}>
          {t('screens.deleteAccount.description')}
        </Text>
        <Text style={[styles.warning, { color: staticColors.danger }]}>
          {t('screens.deleteAccount.warning')}
        </Text>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={promptDeleteAccount}
          disabled={deletingAccount}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          testID="delete-account-button"
        >
          {deletingAccount ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Trash2 size={20} color="#FFFFFF" />
              <Text style={styles.deleteButtonText}>{t('settings.security.deleteAccount')}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ThemedSafeAreaView>
  );
}

const createStyles = (screen: ReturnType<typeof useThemedScreen>['screen']) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 20, gap: 12 },
    title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
    body: { fontSize: 15, lineHeight: 22 },
    warning: { fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: 8, marginBottom: 16 },
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: staticColors.danger,
      borderRadius: 14,
      paddingVertical: 16,
      minHeight: 48,
      marginTop: 8,
    },
    deleteButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  });
