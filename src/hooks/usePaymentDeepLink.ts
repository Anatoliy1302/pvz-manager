import { useCallback, useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { isPaymentSuccessDeepLink } from '../constants/paymentDeepLink';
import { navigationRef } from '../navigation/navigationRef';
import type { Subscription } from '../services/subscriptionService';

/**
 * Обрабатывает pvzpersonal://payment/success после оплаты в ЮKassa:
 * восстанавливает подписку и открывает экран Subscription.
 */
export function usePaymentDeepLink(): void {
  const { user, refreshSubscription } = useAuth();
  const { t } = useTranslation();
  const lastHandledUrl = useRef<string | null>(null);
  const pendingUrl = useRef<string | null>(null);
  const initialUrlChecked = useRef(false);

  const showRestoreResult = useCallback(
    (sub: Subscription | null) => {
      if (sub?.tier === 'pro' || sub?.tier === 'enterprise') {
        Alert.alert(t('subscription.paymentReturnSuccess'));
        return;
      }
      Alert.alert(t('subscription.restorePending'));
    },
    [t]
  );

  const completePaymentReturn = useCallback(
    async (url: string) => {
      if (!user || user.role !== 'owner') return;

      lastHandledUrl.current = url;

      const sub = await refreshSubscription();

      if (navigationRef.isReady()) {
        navigationRef.navigate('Subscription');
      }

      showRestoreResult(sub);
    },
    [refreshSubscription, showRestoreResult, user]
  );

  const handlePaymentUrl = useCallback(
    (url: string) => {
      if (!isPaymentSuccessDeepLink(url)) return;
      if (lastHandledUrl.current === url) return;

      if (!user) {
        pendingUrl.current = url;
        return;
      }

      void completePaymentReturn(url);
    },
    [completePaymentReturn, user]
  );

  useEffect(() => {
    if (!user || !pendingUrl.current) return;

    const url = pendingUrl.current;
    pendingUrl.current = null;
    void completePaymentReturn(url);
  }, [user, completePaymentReturn]);

  useEffect(() => {
    if (initialUrlChecked.current) return;
    initialUrlChecked.current = true;

    void Linking.getInitialURL().then((url) => {
      if (url) handlePaymentUrl(url);
    });
  }, [handlePaymentUrl]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handlePaymentUrl(url);
    });

    return () => subscription.remove();
  }, [handlePaymentUrl]);
}
