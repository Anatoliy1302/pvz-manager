import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import ThemedSafeAreaView from '../../../components/common/ThemedSafeAreaView';
import { useLoginStyles } from '../useLoginStyles';
import { colors } from '../../../constants/colors';

interface LoginLoadingViewProps {
  subtitleStyle?: object;
}

export default function LoginLoadingView({ subtitleStyle }: LoginLoadingViewProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();

  return (
    <ThemedSafeAreaView style={loginStyles.container}>
      <View style={loginStyles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
        <Text style={[loginStyles.loadingText, subtitleStyle]}>{t('common.loading.default')}</Text>
      </View>
    </ThemedSafeAreaView>
  );
}
