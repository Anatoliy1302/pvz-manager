import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import PulsingLogo from '../../../components/common/PulsingLogo';
import { colors } from '../../../constants/colors';
import type { OnboardingSlide } from '../onboardingSlides';
import { ONBOARDING_ACCENT } from '../onboardingSlides';
import { useOnboardingStyles } from '../useOnboardingStyles';

interface OnboardingSlideContentProps {
  slide: OnboardingSlide;
}

export default function OnboardingSlideContent({ slide }: OnboardingSlideContentProps) {
  const { t } = useTranslation();
  const styles = useOnboardingStyles();

  switch (slide.type) {
    case 'welcome':
      return (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            style={styles.welcomeHero}
          >
            <View style={styles.welcomeIconWrap}>
              <PulsingLogo size={72}>
                {slide.icon ? <slide.icon size={38} color="#FFFFFF" /> : null}
              </PulsingLogo>
            </View>
            <Text style={styles.welcomeTitle}>{t(slide.titleKey)}</Text>
            {slide.subtitleKey ? (
              <Text style={styles.welcomeSubtitle}>{t(slide.subtitleKey)}</Text>
            ) : null}
          </LinearGradient>
          <Text style={styles.welcomeHint}>{t('onboarding.swipeHint')}</Text>
        </ScrollView>
      );

    case 'roles':
      return (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.slideTitle}>{t(slide.titleKey)}</Text>
          {slide.subtitleKey ? (
            <Text style={styles.slideSubtitle}>{t(slide.subtitleKey)}</Text>
          ) : null}
          <View style={styles.rolesList}>
            {slide.roles?.map((role) => (
              <View key={role.id} style={styles.roleCard}>
                <View
                  style={[
                    styles.roleIconWrap,
                    { backgroundColor: `${ONBOARDING_ACCENT}18` },
                  ]}
                >
                  <role.icon size={24} color={ONBOARDING_ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.roleTitle}>{t(role.titleKey)}</Text>
                  <Text style={styles.roleDescription}>{t(role.descriptionKey)}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      );

    case 'feature': {
      const accent = slide.accent || ONBOARDING_ACCENT;
      const Icon = slide.icon;
      return (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {Icon ? (
            <View style={[styles.featureIconWrap, { backgroundColor: `${accent}18` }]}>
              <Icon size={40} color={accent} />
            </View>
          ) : null}
          <Text style={styles.slideTitle}>{t(slide.titleKey)}</Text>
          {slide.subtitleKey ? (
            <Text style={styles.slideSubtitle}>{t(slide.subtitleKey)}</Text>
          ) : null}
          <View style={styles.bulletsList}>
            {slide.bulletKeys?.map((bulletKey) => (
              <View key={bulletKey} style={styles.bulletRow}>
                <View style={[styles.bulletDot, { backgroundColor: accent }]} />
                <Text style={styles.bulletText}>{t(bulletKey)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      );
    }

    case 'start':
      return (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.slideTitle}>{t(slide.titleKey)}</Text>
          {slide.subtitleKey ? (
            <Text style={styles.slideSubtitle}>{t(slide.subtitleKey)}</Text>
          ) : null}
          <View style={styles.stepsList}>
            {slide.steps?.map((step, index) => (
              <View key={step.titleKey} style={styles.stepCard}>
                <LinearGradient
                  colors={[colors.primary, colors.primaryDark]}
                  style={styles.stepNumber}
                >
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{t(step.titleKey)}</Text>
                  <Text style={styles.stepDescription}>{t(step.descriptionKey)}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      );

    default:
      return null;
  }
}
