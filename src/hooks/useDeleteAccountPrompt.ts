import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { AccountDeletionError } from '../services/accountDeletionService';

export function useDeleteAccountPrompt() {
  const { t } = useTranslation();
  const { user, deleteAccount } = useAuth();
  const [deletingAccount, setDeletingAccount] = useState(false);

  const promptDeleteAccount = useCallback(() => {
    const isOwner = user?.role === 'owner';
    Alert.alert(
      t('alerts.confirm.deleteAccountTitle'),
      t(isOwner ? 'alerts.confirm.deleteAccountMessageOwner' : 'alerts.confirm.deleteAccountMessage'),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('alerts.confirm.deleteAccount'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingAccount(true);
              try {
                await deleteAccount();
              } catch (error) {
                const message =
                  error instanceof AccountDeletionError
                    ? error.message
                    : t('alerts.network.deleteAccountFailed');
                Alert.alert(t('common.error.generic'), message);
              } finally {
                setDeletingAccount(false);
              }
            })();
          },
        },
      ]
    );
  }, [deleteAccount, t, user?.role]);

  return { promptDeleteAccount, deletingAccount };
}
