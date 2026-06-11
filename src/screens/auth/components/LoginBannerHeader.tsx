import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react-native';
import AnimatedBanner from '../../../components/common/AnimatedBanner';
import PulsingLogo from '../../../components/common/PulsingLogo';
import { useLoginStyles } from '../useLoginStyles';

export default function LoginBannerHeader() {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();

  return (
    <AnimatedBanner height={190} delay={0} style={loginStyles.loginBanner}>
      <View style={loginStyles.loginBannerContent}>
        <PulsingLogo size={64} style={loginStyles.loginBannerIcon}>
          <Package size={34} color="#FFFFFF" />
        </PulsingLogo>
        <Text style={loginStyles.loginBannerTitle}>{t('auth.banner.title')}</Text>
        <Text style={loginStyles.loginBannerSubtitle}>{t('auth.banner.subtitle')}</Text>
      </View>
    </AnimatedBanner>
  );
}
