import React from 'react';
import { Text, StyleSheet } from 'react-native';
import LegalConsentNote from '../common/LegalConsentNote';

/**
 * GDPR / KVKK consent mechanism — shown on login and onboarding.
 * User must acknowledge privacy policy before continuing.
 */
export default function GdprConsentBanner({
  style,
}: {
  style?: React.ComponentProps<typeof LegalConsentNote>['style'];
}) {
  return (
    <LegalConsentNote
      style={style}
      containerStyle={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8 },
});
