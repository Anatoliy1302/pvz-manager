// src/components/common/PremiumGate.tsx
// Компонент проверки подписки: показывает контент для платящих,
// upsell-заглушку для free-пользователей

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Crown, Lock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useSubscription, ProFeature } from '../../hooks/useSubscription';
import { formatPlanPrice } from '../../services/subscriptionService';
import { colors } from '../../constants/colors';
import SubscriptionPaywallLegalLinks from '../subscription/SubscriptionPaywallLegalLinks';
import SubscriptionBillingAmount from '../subscription/SubscriptionBillingAmount';

type RequiredTier = 'pro' | 'enterprise';

interface PremiumGateProps {
  /** Минимальный требуемый тариф */
  requiredTier?: RequiredTier;
  /** Алиас requiredTier (pro | enterprise) */
  requiredPlan?: RequiredTier;
  /** Имя функции для проверки (из useSubscription) */
  feature?: ProFeature;
  /** Контент для платящих пользователей */
  children: React.ReactNode;
  /** Навигация к экрану подписки */
  onUpgrade?: () => void;
  /** Кастомная заглушка вместо стандартной */
  fallback?: React.ReactNode;
  /** Заголовок заглушки */
  title?: string;
  /** Описание заглушки */
  description?: string;
}

export default function PremiumGate({
  requiredTier: requiredTierProp,
  requiredPlan,
  feature,
  children,
  onUpgrade,
  fallback,
  title,
  description,
}: PremiumGateProps) {
  const requiredTier = requiredPlan ?? requiredTierProp ?? 'pro';
  const { t, i18n } = useTranslation();
  const { isPro, canAccessFeature, proPriceRub } = useSubscription();

  const locale = i18n.language.startsWith('en') ? 'en' : 'ru';
  const proPrice = formatPlanPrice(proPriceRub, locale);

  const hasAccess = feature ? canAccessFeature(feature) : isPro;

  if (hasAccess) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  const resolvedTitle = title ?? t('subscription.premiumGate.title');
  const resolvedDescription = description ?? t('subscription.premiumGate.description');

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Lock size={40} color={colors.gray} />
      </View>
      <Text style={styles.title}>{resolvedTitle}</Text>
      <Text style={styles.description}>{resolvedDescription}</Text>
      {onUpgrade && (
        <SubscriptionBillingAmount
          amount={proPrice}
          textColor="#1A1A1A"
          accentColor={colors.primary}
        />
      )}
      {onUpgrade && (
        <Text style={styles.priceDisplay}>
          {t('subscription.premiumGate.priceHint', { price: proPrice })}
        </Text>
      )}
      {onUpgrade && (
        <TouchableOpacity
          style={styles.button}
          onPress={onUpgrade}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('subscription.premiumGate.upgrade')}
          testID="premium-gate-upgrade"
        >
          <Crown size={18} color="#FFFFFF" />
          <Text style={styles.buttonText}>{t('subscription.premiumGate.upgrade')}</Text>
        </TouchableOpacity>
      )}
      {onUpgrade && (
        <SubscriptionPaywallLegalLinks textColor="#666666" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20,
  },
  priceDisplay: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
    marginTop: 4,
    minHeight: 48,
    minWidth: 44,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  legalNote: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
  legalNoteContainer: {
    paddingHorizontal: 8,
  },
});
