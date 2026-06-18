import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useErrorHandler } from '../../context/ErrorHandlerContext';
import { colors } from '../../constants/colors';

export default function OfflineBanner() {
  const { t } = useTranslation();
  const { isOffline } = useErrorHandler();

  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{t('alerts.network.offline')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
});
