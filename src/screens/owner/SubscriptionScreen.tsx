// src/screens/owner/SubscriptionScreen.tsx
// Экран управления подпиской: отображение тарифов, кнопка "Купить Pro",
// восстановление покупок

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import ScreenHeader from '../../components/common/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { colors } from '../../constants/colors';
import { Crown, Check, RefreshCw, Shield, Sparkles, XCircle } from 'lucide-react-native';
import { PLAN_PRICING, formatPlanPrice, getProAmountRub, hasProAccess } from '../../services/subscriptionService';
import type { BillingPeriod } from '../../constants/subscription';
import { PAYMENT_RETURN_URL } from '../../constants/paymentDeepLink';
import {
  createProPayment,
  cancelSubscription,
  syncProPayment,
  SubscriptionPaymentError,
} from '../../services/subscriptionPaymentService';
import LegalConsentNote from '../../components/common/LegalConsentNote';
import SubscriptionPaywallLegalLinks from '../../components/subscription/SubscriptionPaywallLegalLinks';
import SubscriptionBillingAmount from '../../components/subscription/SubscriptionBillingAmount';
import { getSubscriptionStatus } from '../../subscription/subscriptionStatus';
import { resolveAuthAccessToken } from '../../services/SupabaseAuthService';

const PLANS = [
  {
    id: 'free',
    nameKey: 'subscription.plans.free.name',
    priceKey: 'subscription.plans.free.price',
    color: colors.gray,
    features: [
      { labelKey: 'subscription.plans.free.feature1', included: true },
      { labelKey: 'subscription.plans.free.feature2', included: true },
      { labelKey: 'subscription.plans.free.feature3', included: true },
      { labelKey: 'subscription.plans.free.feature4', included: true },
      { labelKey: 'subscription.plans.free.feature5', included: true },
      { labelKey: 'subscription.plans.free.feature6', included: false },
    ] as { labelKey: string; included: boolean }[],
  },
  {
    id: 'pro',
    nameKey: 'subscription.plans.pro.name',
    priceMonthKey: 'subscription.plans.pro.priceMonth',
    priceYearKey: 'subscription.plans.pro.priceYear',
    color: colors.primary,
    recommended: true,
    features: [
      { labelKey: 'subscription.plans.pro.feature1', included: true },
      { labelKey: 'subscription.plans.pro.feature2', included: true },
      { labelKey: 'subscription.plans.pro.feature3', included: true },
      { labelKey: 'subscription.plans.pro.feature4', included: true },
      { labelKey: 'subscription.plans.pro.feature5', included: true },
      { labelKey: 'subscription.plans.pro.feature6', included: true },
    ] as { labelKey: string; included: boolean }[],
  },
  {
    id: 'enterprise',
    nameKey: 'subscription.plans.enterprise.name',
    priceKey: 'subscription.plans.enterprise.price',
    color: '#FFD700',
    features: [
      { labelKey: 'subscription.plans.enterprise.feature1', included: true },
      { labelKey: 'subscription.plans.enterprise.feature2', included: true },
      { labelKey: 'subscription.plans.enterprise.feature3', included: true },
      { labelKey: 'subscription.plans.enterprise.feature4', included: true },
      { labelKey: 'subscription.plans.enterprise.feature5', included: true },
      { labelKey: 'subscription.plans.enterprise.feature6', included: true },
    ] as { labelKey: string; included: boolean }[],
  },
];

export default function SubscriptionScreen({ navigation }: any) {
  const { t, i18n } = useTranslation();
  const { subscription: currentSub, user, refreshSubscription } = useAuth();
  const { isTrialActive, isEarlyAdopterActive, isRenewalReminderDue, daysUntilSubscriptionEnds, subscriptionAutopayEnabled } = useSubscription();
  const { ui, screen } = useThemedScreen();
  const styles = createStyles(screen);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('month');
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === 'owner') {
      void resolveAuthAccessToken();
    }
  }, [user?.id, user?.role]);

  const locale = i18n.language.startsWith('en') ? 'en' : 'ru';
  const currentTier = currentSub?.tier ?? 'free';
  const currentStatus = currentSub?.status ?? 'active';
  const subscriptionStatus = getSubscriptionStatus(currentSub);
  const proAmountRub = getProAmountRub(billingPeriod, isEarlyAdopterActive);
  const proDisplayPrice = formatPlanPrice(proAmountRub, locale);
  const standardProPrice = formatPlanPrice(PLAN_PRICING.pro.monthlyRub, locale);
  const enterpriseMinMonthly = formatPlanPrice(PLAN_PRICING.enterprise.minMonthlyRub, locale);

  const trialDaysLeft =
    isTrialActive && currentSub?.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(currentSub.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
        )
      : 0;

  const isPaidPro =
    currentSub?.tier === 'pro' &&
    Boolean(currentSub?.hasSuccessfulPayment) &&
    !isTrialActive;

  const startProPayment = async (paymentKind?: 'initial' | 'renewal') => {
    if (!user?.id) {
      Alert.alert(t('common.error.title'), t('subscription.paymentAuthRequired'));
      return;
    }

    const accessToken = await resolveAuthAccessToken();
    if (!accessToken) {
      Alert.alert(t('common.error.title'), t('subscription.paymentReauthRequired'));
      return;
    }

    setLoading(true);
    try {
      const payment = await createProPayment(PAYMENT_RETURN_URL, paymentKind, billingPeriod);
      setLastPaymentId(payment.paymentId);
      await Linking.openURL(payment.confirmationUrl);

      Alert.alert(
        t('subscription.paymentOpenedTitle'),
        t('subscription.paymentOpenedMessage', {
          amount: formatPlanPrice(payment.amountRub, locale),
        }),
        [
          { text: t('common.actions.cancel'), style: 'cancel' },
          {
            text: t('subscription.checkPayment'),
            onPress: () => {
              void (async () => {
                try {
                  await syncProPayment(lastPaymentId ?? undefined);
                } catch {
                  // webhook may have already processed payment
                }
                await refreshSubscription();
              })();
            },
          },
        ]
      );
    } catch (error: unknown) {
      const message =
        error instanceof SubscriptionPaymentError
          ? error.code === 'reauth_required'
            ? t('subscription.paymentReauthRequired')
            : error.message
          : error instanceof Error
            ? error.message
            : t('subscription.paymentError');
      Alert.alert(t('common.error.title'), message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = () => startProPayment('initial');
  const handleRenew = () => startProPayment('renewal');

  const handleEnterpriseContact = () => {
    Alert.alert(
      t('subscription.contactUs'),
      t('subscription.enterpriseContactHint'),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('screens.profile.support'),
          onPress: () => navigation.navigate('Support'),
        },
      ],
    );
  };

  const isSubscriptionCanceled = currentStatus === 'canceled';
  const canCancelSubscription = isPaidPro && currentStatus === 'active';

  const handleCancelSubscription = () => {
    Alert.alert(
      t('subscription.cancelConfirmTitle'),
      t('subscription.cancelConfirmMessage'),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('subscription.cancelSubscription'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setCanceling(true);
              try {
                const result = await cancelSubscription();
                await refreshSubscription();
                const endsAt = result.subscriptionPeriodEndsAt
                  ? new Date(result.subscriptionPeriodEndsAt).toLocaleDateString(
                      locale === 'ru' ? 'ru-RU' : 'en-US'
                    )
                  : null;
                Alert.alert(
                  t('subscription.cancelSuccessTitle'),
                  endsAt
                    ? t('subscription.cancelSuccessMessage', { date: endsAt })
                    : t('subscription.cancelSuccessMessageNoDate')
                );
              } catch (error: unknown) {
                const message =
                  error instanceof SubscriptionPaymentError
                    ? error.code === 'reauth_required'
                      ? t('subscription.paymentReauthRequired')
                      : error.message
                    : error instanceof Error
                      ? error.message
                      : t('subscription.cancelError');
                Alert.alert(t('common.error.title'), message);
              } finally {
                setCanceling(false);
              }
            })();
          },
        },
      ]
    );
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      try {
        await syncProPayment(lastPaymentId ?? undefined);
      } catch {
        // ignore — still refresh from sync
      }
      const sub = await refreshSubscription();
      if (sub && (sub.tier === 'pro' || sub.tier === 'enterprise')) {
        Alert.alert(t('subscription.restoreSuccess'));
      } else {
        Alert.alert(t('subscription.restorePending'));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('subscription.paymentError');
      Alert.alert(t('common.error.title'), message);
    } finally {
      setRestoring(false);
    }
  };

  const isCurrentPlan = (planId: string) => {
    if (planId === 'pro' && isPaidPro && isRenewalReminderDue && currentStatus === 'active') {
      return false;
    }
    if (planId === currentTier && isPaidPro && isSubscriptionCanceled && currentSub && hasProAccess(currentSub)) {
      return true;
    }
    return planId === currentTier && currentStatus === 'active';
  };

  const renderPlanCard = (plan: typeof PLANS[0]) => {
    const active = isCurrentPlan(plan.id);
    const isProPlan = plan.id === 'pro';
    const isEnterprisePlan = plan.id === 'enterprise';

    return (
      <View
        key={plan.id}
        style={[
          styles.planCard,
          ui.card,
          active && styles.planCardActive,
          (plan as any).recommended && styles.planCardPopular,
        ]}
      >
        {(plan as any).recommended && (
          <View style={styles.popularBadge}>
            <Crown size={14} color="#FFFFFF" />
            <Text style={styles.popularBadgeText}>{t('subscription.recommended')}</Text>
          </View>
        )}

        <Text style={[styles.planName, { color: screen.text }, active && { color: plan.color }]}>
          {t(plan.nameKey)}
        </Text>
        <Text style={[styles.planPrice, isProPlan && styles.planBillingAmount, { color: screen.textSecondary }, active && { color: plan.color }]}>
          {isEnterprisePlan
            ? t('subscription.enterprisePriceFrom', { price: enterpriseMinMonthly })
            : isProPlan
              ? t(
                  billingPeriod === 'year'
                    ? (plan as any).priceYearKey
                    : (plan as any).priceMonthKey,
                  { price: proDisplayPrice }
                )
              : t((plan as any).priceKey)}
        </Text>
        {isProPlan && (
          <SubscriptionBillingAmount
            amount={proDisplayPrice}
            textColor={screen.text}
            accentColor={colors.primary}
            period={billingPeriod}
            savingsPercent={PLAN_PRICING.pro.yearlySavingsPercent}
          />
        )}
        {plan.id === 'pro' && isEarlyAdopterActive && (
          <Text style={[styles.planPriceNote, { color: colors.primary }]}>
            {t('subscription.earlyAdopterNote', {
              price: proDisplayPrice,
              standardPrice: standardProPrice,
            })}
          </Text>
        )}
        {plan.id === 'pro' && !isEarlyAdopterActive && (
          <Text style={[styles.planPriceNote, { color: screen.textSecondary }]}>
            {billingPeriod === 'year'
              ? t('subscription.proPriceNoteYear')
              : t('subscription.proPriceNoteMonth')}
          </Text>
        )}
        {plan.id === 'enterprise' && (
          <Text style={[styles.planPriceNote, { color: screen.textSecondary }]}>
            {t('subscription.enterprisePriceNote')}
          </Text>
        )}

        <View style={styles.featureList}>
          {plan.features.map((feature, idx) => (
            <View key={idx} style={styles.featureRow}>
              <View
                style={[
                  styles.featureCheck,
                  feature.included ? styles.featureCheckIncluded : styles.featureCheckExcluded,
                ]}
              >
                {feature.included && <Check size={12} color="#FFFFFF" />}
              </View>
              <Text
                style={[
                  styles.featureText,
                  { color: screen.text },
                  !feature.included && styles.featureTextExcluded,
                ]}
              >
                {t(feature.labelKey)}
              </Text>
            </View>
          ))}
        </View>

        {active ? (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>{t('subscription.currentPlan')}</Text>
          </View>
        ) : isProPlan && isPaidPro && isRenewalReminderDue ? (
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={handleRenew}
            disabled={loading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={styles.upgradeGradient}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <RefreshCw size={18} color="#FFFFFF" />
                  <Text style={styles.upgradeText}>{t('subscription.renewPro')}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        ) : isProPlan ? (
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={handleUpgrade}
            disabled={loading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={styles.upgradeGradient}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Crown size={18} color="#FFFFFF" />
                  <Text style={styles.upgradeText}>{t('subscription.payPro')}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        ) : isEnterprisePlan ? (
          <TouchableOpacity
            style={[styles.contactButton, { borderColor: plan.color }]}
            onPress={handleEnterpriseContact}
            activeOpacity={0.8}
          >
            <Text style={[styles.contactButtonText, { color: plan.color }]}>
              {t('subscription.contactUs')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <ThemedSafeAreaView style={styles.container}>
      <ScreenHeader title={t('subscription.title')} onBack={() => navigation.goBack()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={[styles.subtitle, { color: screen.textSecondary }]}>
          {t('subscription.subtitle')}
        </Text>

        {isTrialActive && (
          <View style={[styles.trialBanner, ui.card]}>
            <Sparkles size={20} color={colors.primary} />
            <Text style={[styles.trialBannerText, { color: screen.text }]}>
              {t('subscription.trialBanner', { days: trialDaysLeft })}
            </Text>
          </View>
        )}

        {isSubscriptionCanceled && currentSub && hasProAccess(currentSub) && (
          <View style={[styles.canceledBanner, ui.card]}>
            <XCircle size={20} color="#FF9800" />
            <Text style={[styles.canceledBannerText, { color: screen.text }]}>
              {currentSub.subscriptionPeriodEndsAt
                ? t('subscription.canceledAccessUntil', {
                    date: new Date(currentSub.subscriptionPeriodEndsAt).toLocaleDateString(
                      locale === 'ru' ? 'ru-RU' : 'en-US'
                    ),
                  })
                : t('subscription.subscriptionCanceled')}
            </Text>
          </View>
        )}

        {isPaidPro && isRenewalReminderDue && (
          <View style={[styles.renewalBanner, ui.card]}>
            <RefreshCw size={20} color="#FF9800" />
            <View style={styles.renewalBannerContent}>
              <Text style={[styles.renewalBannerTitle, { color: screen.text }]}>
                {daysUntilSubscriptionEnds !== null && daysUntilSubscriptionEnds <= 0
                  ? t('subscription.renewalExpiredTitle')
                  : t('subscription.renewalReminderTitle', {
                      days: Math.max(daysUntilSubscriptionEnds ?? 0, 0),
                    })}
              </Text>
              <Text style={[styles.renewalBannerText, { color: screen.textSecondary }]}>
                {subscriptionAutopayEnabled
                  ? t('subscription.renewalAutopayHint')
                  : t('subscription.renewalManualHint')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.renewalBannerButton}
              onPress={handleRenew}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.renewalBannerButtonText}>{t('subscription.renewPro')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.statusCard, ui.card]}>
          <Crown
            size={24}
            color={currentTier === 'free' && !isTrialActive ? colors.gray : colors.primary}
          />
          <View style={styles.statusInfo}>
            <Text style={[styles.statusLabel, { color: screen.textSecondary }]}>
              {t('subscription.currentPlan')}
            </Text>
            <Text style={[styles.statusValue, { color: screen.text }]}>
              {isTrialActive
                ? t('subscription.trialPlanName')
                : t(`subscription.plans.${currentTier}.name`)}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              currentStatus === 'active'
                ? styles.statusActive
                : isSubscriptionCanceled && currentSub && hasProAccess(currentSub)
                  ? styles.statusCanceled
                  : styles.statusInactive,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                currentStatus === 'active'
                  ? styles.statusActiveText
                  : isSubscriptionCanceled && currentSub && hasProAccess(currentSub)
                    ? styles.statusCanceledText
                    : styles.statusInactiveText,
              ]}
            >
              {subscriptionStatus === 'active'
                ? t('subscription.subscriptionActive')
                : isSubscriptionCanceled
                  ? t('subscription.subscriptionCanceled')
                  : t('subscription.subscriptionInactive')}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: screen.text }]}>
          {t('subscription.choosePlan')}
        </Text>

        <View style={[styles.billingToggle, ui.card]}>
          <TouchableOpacity
            style={[
              styles.billingOption,
              billingPeriod === 'month' && styles.billingOptionActive,
            ]}
            onPress={() => setBillingPeriod('month')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.billingOptionText,
                { color: billingPeriod === 'month' ? '#FFFFFF' : screen.text },
              ]}
            >
              {t('subscription.billingMonth')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.billingOption,
              billingPeriod === 'year' && styles.billingOptionActive,
            ]}
            onPress={() => setBillingPeriod('year')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.billingOptionText,
                { color: billingPeriod === 'year' ? '#FFFFFF' : screen.text },
              ]}
            >
              {t('subscription.billingYear')}
            </Text>
            <Text
              style={[
                styles.billingSavings,
                { color: billingPeriod === 'year' ? '#FFFFFF' : colors.primary },
              ]}
            >
              {t('subscription.yearlySavings', {
                percent: PLAN_PRICING.pro.yearlySavingsPercent,
              })}
            </Text>
          </TouchableOpacity>
        </View>

        {PLANS.filter((p) => p.id !== 'enterprise').map(renderPlanCard)}
        <Text style={[styles.enterpriseSectionTitle, { color: screen.textSecondary }]}>
          {t('subscription.contactUs')}
        </Text>
        {PLANS.filter((p) => p.id === 'enterprise').map(renderPlanCard)}

        {canCancelSubscription && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelSubscription}
            disabled={canceling}
            activeOpacity={0.7}
          >
            {canceling ? (
              <ActivityIndicator size="small" color="#E53935" />
            ) : (
              <>
                <XCircle size={16} color="#E53935" />
                <Text style={styles.cancelText}>{t('subscription.cancelSubscription')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={restoring}
          activeOpacity={0.7}
        >
          <RefreshCw size={16} color={colors.primary} />
          <Text style={styles.restoreText}>
            {restoring ? t('common.loading.default') : t('subscription.restore')}
          </Text>
        </TouchableOpacity>

        <View style={styles.securityNote}>
          <Shield size={14} color={screen.textSecondary} />
          <Text style={[styles.securityText, { color: screen.textSecondary }]}>
            {t('subscription.securityNote')}
          </Text>
        </View>

        <Text style={[styles.autopayNote, { color: screen.textSecondary }]}>
          {t('subscription.autopayNote')}
        </Text>

        <SubscriptionPaywallLegalLinks textColor={screen.textSecondary} />

        <LegalConsentNote
          style={[styles.legalNote, { color: screen.textSecondary }]}
          containerStyle={styles.legalNoteContainer}
        />
      </ScrollView>
    </ThemedSafeAreaView>
  );
}

const createStyles = (screen: ReturnType<typeof useThemedScreen>['screen']) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 16, paddingBottom: 40 },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 16,
    },
    trialBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    trialBannerText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
    },
    renewalBanner: {
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: '#FF9800',
      gap: 10,
    },
    renewalBannerContent: {
      gap: 4,
    },
    renewalBannerTitle: {
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
    },
    renewalBannerText: {
      fontSize: 13,
      lineHeight: 18,
    },
    renewalBannerButton: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
    },
    renewalBannerButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    canceledBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: '#FF9800',
    },
    canceledBannerText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
    },
    cancelButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      marginBottom: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#FFCDD2',
      backgroundColor: '#FFEBEE',
    },
    cancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#E53935',
    },

    statusCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      gap: 12,
      borderWidth: 1,
      borderColor: screen.border,
    },
    statusInfo: { flex: 1 },
    statusLabel: { fontSize: 12 },
    statusValue: { fontSize: 16, fontWeight: '600', marginTop: 2 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statusActive: { backgroundColor: '#E8F5E9' },
    statusInactive: { backgroundColor: '#FFF3E0' },
    statusCanceled: { backgroundColor: '#FFF3E0' },
    statusBadgeText: { fontSize: 11, fontWeight: '500' },
    statusActiveText: { color: '#4CAF50' },
    statusInactiveText: { color: '#FF9800' },
    statusCanceledText: { color: '#FF9800' },

    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 12,
    },
    enterpriseSectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 8,
      marginTop: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    billingToggle: {
      flexDirection: 'row',
      borderRadius: 14,
      padding: 4,
      marginBottom: 16,
      gap: 4,
      borderWidth: 1,
      borderColor: screen.border,
    },
    billingOption: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      gap: 2,
    },
    billingOptionActive: {
      backgroundColor: colors.primary,
    },
    billingOptionText: {
      fontSize: 14,
      fontWeight: '600',
    },
    billingSavings: {
      fontSize: 10,
      fontWeight: '600',
    },

    planCard: {
      borderRadius: 20,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1.5,
      position: 'relative',
      overflow: 'hidden',
    },
    planCardActive: {
      borderColor: colors.primary,
    },
    planCardPopular: {
      borderColor: colors.primary,
    },
    popularBadge: {
      position: 'absolute',
      top: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    popularBadgeText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
    planName: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
    planPrice: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
    planBillingAmount: { fontSize: 28, fontWeight: '800', marginBottom: 2 },
    billingAmountLabel: { fontSize: 20, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
    planPriceNote: { fontSize: 12, marginBottom: 16, lineHeight: 16 },

    featureList: { gap: 10, marginBottom: 16 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    featureCheck: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    featureCheckIncluded: { backgroundColor: colors.primary },
    featureCheckExcluded: { backgroundColor: '#E8E8E8' },
    featureText: { fontSize: 14, flex: 1 },
    featureTextExcluded: { color: '#BBBBBB' },

    activeBadge: {
      alignItems: 'center',
      paddingVertical: 10,
      backgroundColor: '#E8F5E9',
      borderRadius: 12,
    },
    activeBadgeText: { fontSize: 14, fontWeight: '600', color: '#4CAF50' },

    upgradeButton: { borderRadius: 30, overflow: 'hidden' },
    upgradeGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
    },
    upgradeText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },

    contactButton: {
      borderWidth: 1.5,
      borderRadius: 30,
      paddingVertical: 14,
      alignItems: 'center',
    },
    contactButtonText: { fontSize: 15, fontWeight: '600' },

    restoreButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      marginBottom: 16,
    },
    restoreText: { fontSize: 14, color: colors.primary, fontWeight: '500' },

    securityNote: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 20,
    },
    securityText: { fontSize: 11, textAlign: 'center', flex: 1 },
    autopayNote: {
      fontSize: 11,
      textAlign: 'center',
      lineHeight: 16,
      marginBottom: 8,
      paddingHorizontal: 8,
    },
    legalNote: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
    legalNoteContainer: { marginBottom: 20, paddingHorizontal: 4 },
  });
