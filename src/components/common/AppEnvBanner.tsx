import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getAppEnv } from '../../utils/appEnv';

export default function AppEnvBanner() {
  const { t } = useTranslation();
  const env = getAppEnv();

  if (env === 'production') {
    return null;
  }

  const label =
    env === 'staging' ? t('common.env.staging') : t('common.env.development');

  return (
    <View
      style={{
        backgroundColor: env === 'staging' ? '#FEF3C7' : '#E0E7FF',
        paddingVertical: 6,
        paddingHorizontal: 12,
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: env === 'staging' ? '#92400E' : '#3730A3',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
