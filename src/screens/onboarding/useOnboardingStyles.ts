import { Dimensions, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { useThemedScreen } from '../../hooks/useThemedScreen';

const { width, height } = Dimensions.get('window');

export function useOnboardingStyles() {
  const { colors, screen } = useThemedScreen();

  return useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: screen.background,
        },
        topBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 4,
          minHeight: 44,
        },
        slideCounter: {
          fontSize: 13,
          fontWeight: '600',
          color: screen.textSecondary,
        },
        skipButton: {
          paddingVertical: 8,
          paddingHorizontal: 4,
        },
        skipText: {
          fontSize: 15,
          fontWeight: '500',
          color: colors.primary,
        },
        slide: {
          width,
          flex: 1,
          paddingHorizontal: 24,
        },
        welcomeHero: {
          marginHorizontal: -24,
          paddingTop: 12,
          paddingBottom: 36,
          paddingHorizontal: 24,
          alignItems: 'center',
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
          marginBottom: 28,
        },
        welcomeIconWrap: {
          marginBottom: 20,
        },
        welcomeTitle: {
          fontSize: 28,
          fontWeight: '800',
          color: '#FFFFFF',
          textAlign: 'center',
          letterSpacing: 0.3,
        },
        welcomeSubtitle: {
          fontSize: 15,
          color: 'rgba(255,255,255,0.88)',
          textAlign: 'center',
          lineHeight: 22,
          marginTop: 10,
          paddingHorizontal: 12,
        },
        welcomeHint: {
          fontSize: 14,
          color: screen.textSecondary,
          textAlign: 'center',
          lineHeight: 21,
          paddingHorizontal: 8,
        },
        slideTitle: {
          fontSize: 24,
          fontWeight: '700',
          color: screen.text,
          textAlign: 'center',
          marginBottom: 8,
        },
        slideSubtitle: {
          fontSize: 15,
          color: screen.textSecondary,
          textAlign: 'center',
          lineHeight: 22,
          marginBottom: 24,
          paddingHorizontal: 4,
        },
        rolesList: {
          gap: 12,
        },
        roleCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 16,
          borderRadius: 16,
          backgroundColor: screen.card,
          borderWidth: 1,
          borderColor: screen.border,
        },
        roleIconWrap: {
          width: 48,
          height: 48,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
        },
        roleTitle: {
          fontSize: 16,
          fontWeight: '600',
          color: screen.text,
          marginBottom: 4,
        },
        roleDescription: {
          fontSize: 13,
          color: screen.textSecondary,
          lineHeight: 18,
        },
        featureIconWrap: {
          width: 88,
          height: 88,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'center',
          marginBottom: 24,
        },
        bulletsList: {
          gap: 14,
        },
        bulletRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
        },
        bulletDot: {
          width: 8,
          height: 8,
          borderRadius: 4,
          marginTop: 7,
        },
        bulletText: {
          flex: 1,
          fontSize: 15,
          color: screen.text,
          lineHeight: 22,
        },
        stepsList: {
          gap: 16,
        },
        stepCard: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 14,
          padding: 16,
          borderRadius: 16,
          backgroundColor: screen.card,
          borderWidth: 1,
          borderColor: screen.border,
        },
        stepNumber: {
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
        },
        stepNumberText: {
          fontSize: 14,
          fontWeight: '700',
          color: '#FFFFFF',
        },
        stepTitle: {
          fontSize: 16,
          fontWeight: '600',
          color: screen.text,
          marginBottom: 4,
        },
        stepDescription: {
          fontSize: 13,
          color: screen.textSecondary,
          lineHeight: 18,
        },
        footer: {
          paddingHorizontal: 24,
          paddingBottom: 28,
          paddingTop: 8,
          gap: 20,
        },
        pagination: {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
        },
        paginationDot: {
          height: 8,
          borderRadius: 4,
          backgroundColor: screen.border,
        },
        paginationDotActive: {
          backgroundColor: colors.primary,
        },
        primaryButton: {
          borderRadius: 16,
          overflow: 'hidden',
        },
        primaryGradient: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 16,
        },
        primaryText: {
          fontSize: 16,
          fontWeight: '700',
          color: '#FFFFFF',
        },
        finishGradient: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 16,
        },
        scrollContent: {
          flexGrow: 1,
          justifyContent: 'center',
          paddingBottom: 16,
          minHeight: height * 0.52,
        },
        spacer: {
          flex: 1,
        },
        privacyNote: {
          fontSize: 12,
          color: screen.textSecondary,
          textAlign: 'center',
          lineHeight: 18,
          marginTop: 4,
        },
      }),
    [colors, screen]
  );
}
