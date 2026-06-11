import { useState, useEffect, useCallback } from 'react';
import { Alert, InteractionManager } from 'react-native';
import { useTranslation } from 'react-i18next';
import BiometricService from '../services/BiometricService';
import { cleanPhone } from '../utils/phoneHelpers';

const waitForUiReady = () =>
  new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(resolve, 300);
    });
  });

export const useBiometricSettings = (phone?: string) => {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState('');
  const [usesDeviceAuth, setUsesDeviceAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const cleanedPhone = phone ? cleanPhone(phone) : '';

  useEffect(() => {
    const load = async () => {
      if (!cleanedPhone) {
        setLoading(false);
        return;
      }

      try {
        const capabilities = await BiometricService.getCapabilities();
        setAvailable(capabilities.available);
        setLabel(capabilities.label);
        setUsesDeviceAuth(capabilities.usesDeviceAuth);

        if (capabilities.available) {
          setEnabled(await BiometricService.isEnabled(cleanedPhone));
        }
      } catch (error) {
        console.error('Ошибка загрузки настроек биометрии:', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [cleanedPhone]);

  const setBiometricEnabled = useCallback(
    async (value: boolean) => {
      if (!cleanedPhone || toggling) return;

      setToggling(true);
      try {
        if (value) {
          await waitForUiReady();

          const auth = await BiometricService.authenticate(
            t('auth.biometric.confirm', { label })
          );

          if (!auth.success) {
            if (auth.error !== 'user_cancel' && auth.message) {
              Alert.alert(t('common.error.title'), auth.message);
            }
            return;
          }
        }

        await BiometricService.setEnabled(cleanedPhone, value);
        setEnabled(value);
      } finally {
        setToggling(false);
      }
    },
    [cleanedPhone, label, toggling, t]
  );

  return {
    available,
    enabled,
    label,
    usesDeviceAuth,
    loading,
    toggling,
    setBiometricEnabled,
  };
};
