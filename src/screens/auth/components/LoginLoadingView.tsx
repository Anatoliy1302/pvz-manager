import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import ThemedSafeAreaView from '../../../components/common/ThemedSafeAreaView';
import { useLoginStyles } from '../useLoginStyles';

interface LoginLoadingViewProps {
  subtitleStyle?: object;
}

export default function LoginLoadingView({ subtitleStyle }: LoginLoadingViewProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();

  return (
    <ThemedSafeAreaView style={loginStyles.container}>
      <View style={loginStyles.loadingContainer}>
        <Text style={[loginStyles.loadingText, subtitleStyle]}>{t('common.loading.default')}</Text>
      </View>
    </ThemedSafeAreaView>
  );
}
