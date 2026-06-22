import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { AccountDeletionError } from '../services/accountDeletionService';

type DeleteAccountNavigation = {
  navigate: (screen: 'DeleteAccount') => void;
};

/** @deprecated Prefer navigation to DeleteAccount screen (email + OTP for owners). */
export function useDeleteAccountPrompt() {
  const { t } = useTranslation();
  const navigation = useNavigation<DeleteAccountNavigation>();
  const { user, deleteAccount } = useAuth();

  const promptDeleteAccount = useCallback(() => {
    if (user?.role === 'owner') {
      navigation.navigate('DeleteAccount');
      return;
    }

    Alert.alert(
      t('alerts.confirm.deleteAccountTitle'),
      t('alerts.confirm.deleteAccountMessage'),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('alerts.confirm.deleteAccount'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteAccount();
              } catch (error) {
                const message =
                  error instanceof AccountDeletionError
                    ? error.message
                    : t('alerts.network.deleteAccountFailed');
                Alert.alert(t('common.error.generic'), message);
              }
            })();
          },
        },
      ]
    );
  }, [deleteAccount, navigation, t, user?.role]);

  return { promptDeleteAccount, deletingAccount: false };
}
