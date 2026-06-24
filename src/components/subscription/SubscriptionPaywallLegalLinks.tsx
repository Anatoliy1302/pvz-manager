import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { openLegalDocument } from '../../constants/legal';

interface SubscriptionPaywallLegalLinksProps {
  textColor: string;
}

/**
 * Terms of Use (EULA) and Privacy Policy links on subscription paywall — App Store Guideline 3.1.2.
 */
export default function SubscriptionPaywallLegalLinks({ textColor }: SubscriptionPaywallLegalLinksProps) {
  const { t } = useTranslation();
  const linkStyle = [styles.link, { color: textColor }];

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: textColor }]}>
        {t('subscription.paywallLegal.label')}
      </Text>
      <Text style={[styles.linksRow, { color: textColor }]}>
        <Text
          style={linkStyle}
          onPress={() => openLegalDocument('terms')}
          accessibilityRole="link"
          testID="subscription-terms-link"
        >
          {t('legal.links.terms')}
        </Text>
        <Text style={[styles.separator, { color: textColor }]}>{t('subscription.paywallLegal.separator')}</Text>
        <Text
          style={linkStyle}
          onPress={() => openLegalDocument('privacy')}
          accessibilityRole="link"
          testID="subscription-privacy-link"
        >
          {t('legal.links.privacy')}
        </Text>
        <Text style={[styles.separator, { color: textColor }]}>{t('subscription.paywallLegal.separator')}</Text>
        <Text
          style={linkStyle}
          onPress={() => openLegalDocument('terms')}
          accessibilityRole="link"
          testID="subscription-eula-link"
        >
          {t('subscription.paywallLegal.eula')}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8, marginBottom: 4, gap: 4 },
  label: { fontSize: 12, textAlign: 'center' },
  linksRow: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  separator: { fontSize: 13 },
  link: { textDecorationLine: 'underline', fontWeight: '600' },
});
