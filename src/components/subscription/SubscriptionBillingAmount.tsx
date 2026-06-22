import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

interface SubscriptionBillingAmountProps {
  amount: string;
  textColor: string;
  accentColor: string;
  period?: 'month' | 'year';
  savingsPercent?: number;
}

/** Prominent billed amount for App Store Guideline 3.1.2 (subscription pricing). */
export default function SubscriptionBillingAmount({
  amount,
  textColor,
  accentColor,
  period = 'month',
  savingsPercent,
}: SubscriptionBillingAmountProps) {
  const { t } = useTranslation();

  const billingKey = period === 'year' ? 'subscription.billingAmountYear' : 'subscription.billingAmountMonth';
  const noteKey =
    period === 'year' ? 'subscription.billingAmountNoteYear' : 'subscription.billingAmountNoteMonth';

  return (
    <View style={styles.container} accessibilityRole="text">
      <Text style={[styles.billingLabel, { color: textColor }]}>
        {t('subscription.billingAmountLabel')}
      </Text>
      <Text style={[styles.billingAmount, { color: accentColor }]}>
        {t(billingKey, { amount })}
      </Text>
      <Text style={[styles.billingNote, { color: textColor }]}>
        {period === 'year' && savingsPercent != null
          ? t(noteKey, { percent: savingsPercent })
          : t(noteKey)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginVertical: 8, gap: 4 },
  billingLabel: { fontSize: 14, fontWeight: '600' },
  billingAmount: { fontSize: 32, fontWeight: '800', textAlign: 'center' },
  billingNote: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
