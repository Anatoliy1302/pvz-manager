import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { AccountDeletionError } from '../services/accountDeletionService';
import PinService from '../services/PinService';
import { normalizeEmail } from '../utils/loginIdentifier';
import { useToast } from '../components/common/Toast';
import { loadOwnerPinLoginSnapshot } from '../utils/ownerPinLoginStore';

const PIN_LENGTH = 4;

export type DeleteAccountStep = 'intro' | 'pin';

export function useDeleteAccountFlow() {
  const { t } = useTranslation();
  const { user, deleteAccount } = useAuth();
  const { showToast } = useToast();

  const isOwner = user?.role === 'owner';
  const [step, setStep] = useState<DeleteAccountStep>('intro');
  const [pinCode, setPinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pinError, setPinError] = useState(false);

  const runDelete = useCallback(
    async (options?: { accessToken?: string; ownerPin?: { email: string; userId: string; pin: string } }) => {
      setLoading(true);
      setErrorMessage('');
      setPinError(false);
      try {
        await deleteAccount(options);
        showToast(t('screens.deleteAccount.success'), 'info');
      } catch (error) {
        const isInvalidPin =
          error instanceof AccountDeletionError && error.code === 'invalid_pin';
        const message = isInvalidPin
          ? t('alerts.validation.wrongPin')
          : error instanceof AccountDeletionError
            ? error.message
            : t('alerts.network.deleteAccountFailed');
        setErrorMessage(message);
        setPinError(isInvalidPin);
        showToast(message, 'error');
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [deleteAccount, showToast, t]
  );

  const confirmStaffDelete = useCallback(() => {
    Alert.alert(
      t('alerts.confirm.deleteAccountTitle'),
      t('alerts.confirm.deleteAccountMessage'),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('alerts.confirm.deleteAccount'),
          style: 'destructive',
          onPress: () => {
            void runDelete();
          },
        },
      ]
    );
  }, [runDelete, t]);

  const proceedFromIntro = useCallback(() => {
    setErrorMessage('');
    setPinError(false);
    setPinCode('');
    if (isOwner) {
      setStep('pin');
      return;
    }
    confirmStaffDelete();
  }, [confirmStaffDelete, isOwner]);

  const confirmOwnerDelete = useCallback(async () => {
    if (pinCode.length < PIN_LENGTH) {
      showToast(t('alerts.validation.invalidPin'), 'error');
      return;
    }

    const email = normalizeEmail(user?.email ?? '');
    if (!email) {
      showToast(t('alerts.validation.invalidEmail'), 'error');
      return;
    }

    const hasPin = await PinService.hasPin(email);
    if (!hasPin) {
      const message = t('screens.deleteAccount.pinNotSet');
      setErrorMessage(message);
      showToast(message, 'error');
      return;
    }

    const userId = user?.id ?? (await loadOwnerPinLoginSnapshot(email))?.ownerId;
    if (!userId) {
      const message = t('screens.deleteAccount.ownerNotFound');
      setErrorMessage(message);
      showToast(message, 'error');
      return;
    }

    await runDelete({
      ownerPin: { email, userId, pin: pinCode },
    });
  }, [pinCode, runDelete, showToast, t, user?.email, user?.id]);

  const handleBack = useCallback(() => {
    setErrorMessage('');
    setPinError(false);
    setPinCode('');
    if (step === 'pin') {
      setStep('intro');
    }
  }, [step]);

  const handlePinChange = useCallback((value: string) => {
    setPinError(false);
    setErrorMessage('');
    setPinCode(value.replace(/\D/g, '').slice(0, PIN_LENGTH));
  }, []);

  return {
    step,
    isOwner,
    pinCode,
    pinLength: PIN_LENGTH,
    loading,
    errorMessage,
    pinError,
    ownerEmail: normalizeEmail(user?.email ?? ''),
    handlePinChange,
    proceedFromIntro,
    confirmOwnerDelete,
    handleBack,
  };
}
