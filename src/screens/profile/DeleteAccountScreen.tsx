/**
 * Account deletion — PIN confirmation for owners, JWT for staff.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useDeleteAccountFlow } from '../../hooks/useDeleteAccountFlow';
import LoginContinueButton from '../auth/components/LoginContinueButton';
import LoginStepBackButton from '../auth/components/LoginStepBackButton';
import LoginPinInput from '../auth/components/LoginPinInput';
import { useLoginStyles } from '../auth/useLoginStyles';
import { colors as staticColors } from '../../constants/colors';

export default function DeleteAccountScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { t } = useTranslation();
  const { screen } = useThemedScreen();
  const { styles: loginStyles } = useLoginStyles();
  const flow = useDeleteAccountFlow();
  const styles = createStyles(screen);

  const renderIntro = () => (
    <>
      <Text style={[styles.title, { color: screen.text }]}>{t('screens.deleteAccount.title')}</Text>
      <Text style={[styles.body, { color: screen.textSecondary }]}>
        {flow.isOwner
          ? t('screens.deleteAccount.descriptionOwnerPin')
          : t('screens.deleteAccount.description')}
      </Text>
      <Text style={[styles.warning, { color: staticColors.danger }]}>
        {t('screens.deleteAccount.warning')}
      </Text>
      <LoginContinueButton
        label={t('screens.deleteAccount.continue')}
        enabled
        loading={flow.loading}
        onPress={flow.proceedFromIntro}
      />
    </>
  );

  const renderPinStep = () => (
    <>
      <LoginStepBackButton onPress={flow.handleBack} />
      <Text style={[styles.title, { color: screen.text }]}>{t('screens.deleteAccount.pinTitle')}</Text>
      <Text style={[styles.body, { color: screen.textSecondary }]}>
        {t('screens.deleteAccount.pinSubtitle', { email: flow.ownerEmail })}
      </Text>
      <LoginPinInput
        pinCode={flow.pinCode}
        onChangePin={flow.handlePinChange}
        disabled={flow.loading}
        hasError={flow.pinError}
      />
      {flow.errorMessage ? (
        <Text style={loginStyles.otpErrorText}>{flow.errorMessage}</Text>
      ) : null}
      <TouchableOpacity
        style={[styles.deleteButton, flow.pinCode.length < flow.pinLength && styles.deleteButtonDisabled]}
        onPress={flow.confirmOwnerDelete}
        disabled={flow.loading || flow.pinCode.length < flow.pinLength}
        activeOpacity={0.8}
        testID="delete-account-confirm-button"
      >
        {flow.loading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Trash2 size={20} color="#FFFFFF" />
            <Text style={styles.deleteButtonText}>{t('screens.deleteAccount.confirmDelete')}</Text>
          </>
        )}
      </TouchableOpacity>
    </>
  );

  return (
    <ThemedSafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenHeader title={t('settings.security.deleteAccount')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {flow.step === 'intro' && renderIntro()}
        {flow.step === 'pin' && renderPinStep()}
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
    warning: { fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: 8, marginBottom: 8 },
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
    deleteButtonDisabled: { opacity: 0.5 },
    deleteButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  });
