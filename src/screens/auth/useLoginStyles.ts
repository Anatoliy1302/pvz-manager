import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { colors as palette } from '../../constants/colors';

export function useLoginStyles() {
  const themed = useThemedScreen();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1 },
        loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        loadingText: { fontSize: 16, color: themed.screen.textSecondary },
        keyboardView: { flex: 1 },
        scrollContent: { flexGrow: 1, padding: 20, justifyContent: 'center' },
        scrollContentRole: { justifyContent: 'flex-start', paddingTop: 8, paddingBottom: 32 },
        stepContainer: { flex: 1, justifyContent: 'center', paddingTop: 40 },
        roleStepContainer: { width: '100%', paddingBottom: 8 },

        title: {
          fontSize: 28,
          fontWeight: 'bold',
          color: themed.screen.text,
          marginBottom: 8,
          textAlign: 'center',
        },
        subtitle: {
          fontSize: 15,
          color: themed.screen.textSecondary,
          marginBottom: 32,
          textAlign: 'center',
        },

        loginBanner: { marginBottom: 24 },
        loginBannerContent: { alignItems: 'center', zIndex: 1 },
        loginBannerIcon: { marginBottom: 12 },
        loginBannerTitle: {
          fontSize: 24,
          fontWeight: 'bold',
          color: '#FFFFFF',
          marginBottom: 6,
        },
        loginBannerSubtitle: {
          fontSize: 14,
          color: 'rgba(255,255,255,0.85)',
          textAlign: 'center',
          lineHeight: 20,
          paddingHorizontal: 16,
        },

        roleSectionTitle: {
          fontSize: 22,
          fontWeight: '700',
          color: themed.screen.text,
          marginBottom: 6,
          textAlign: 'center',
        },
        roleSectionSubtitle: {
          fontSize: 14,
          color: themed.screen.textSecondary,
          marginBottom: 20,
          textAlign: 'center',
          lineHeight: 20,
          paddingHorizontal: 8,
        },
        roleCardsList: { gap: 12, marginBottom: 24 },

        backButton: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        },

        roleCard: {
          borderRadius: 18,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 2,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: themed.theme === 'dark' ? 0.2 : 0.05,
          shadowRadius: 8,
          elevation: 2,
        },
        roleCardActive: {
          backgroundColor: palette.primary,
          borderColor: palette.primary,
          shadowColor: palette.primary,
          shadowOpacity: 0.25,
          elevation: 4,
        },
        roleIcon: {
          width: 52,
          height: 52,
          borderRadius: 16,
          backgroundColor: 'rgba(255,255,255,0.22)',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
          flexShrink: 0,
        },
        roleIconInactive: { backgroundColor: themed.colors.primaryLight },
        roleTextBlock: { flex: 1, flexShrink: 1, minWidth: 0, paddingRight: 8 },
        roleTitle: { fontSize: 16, fontWeight: '700', color: themed.screen.text, marginBottom: 4 },
        roleDescription: { fontSize: 13, color: themed.screen.textSecondary, lineHeight: 18 },
        roleTextActive: { color: '#FFFFFF' },
        roleCheck: {
          width: 26,
          height: 26,
          borderRadius: 13,
          borderWidth: 2,
          borderColor: themed.screen.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        },
        roleCheckActive: {
          backgroundColor: 'rgba(255,255,255,0.25)',
          borderColor: '#FFFFFF',
        },

        phoneInputContainer: {
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
          marginBottom: 24,
          borderWidth: 1,
          gap: 12,
        },
        phoneInput: { flex: 1, fontSize: 18 },

        smsInputContainer: { alignItems: 'center', marginBottom: 24 },
        smsInput: {
          borderRadius: 16,
          paddingHorizontal: 20,
          paddingVertical: 14,
          fontSize: 32,
          fontWeight: 'bold',
          textAlign: 'center',
          letterSpacing: 12,
          borderWidth: 1,
          width: 200,
        },

        pinContainer: {
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 16,
          marginBottom: 24,
        },
        pinDot: {
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: themed.theme === 'dark' ? '#3A3A3A' : '#F0F0F0',
          alignItems: 'center',
          justifyContent: 'center',
        },
        pinDotFilled: { backgroundColor: palette.primary },
        pinDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
        pinInputContainer: { opacity: 0, height: 0, marginBottom: 0 },
        pinInput: { height: 0 },

        inputContainer: {
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
          marginBottom: 16,
          borderWidth: 1,
          gap: 12,
        },
        input: { flex: 1, fontSize: 16 },

        pvzList: { maxHeight: 300, marginBottom: 20 },
        pvzItem: {
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 16,
          padding: 16,
          marginBottom: 10,
          borderWidth: 2,
          gap: 12,
        },
        pvzItemActive: { backgroundColor: palette.primary, borderColor: palette.primary },
        pvzItemInfo: { flex: 1 },
        pvzItemName: { fontSize: 16, fontWeight: '600', color: themed.screen.text, marginBottom: 2 },
        pvzItemAddress: { fontSize: 12, color: themed.screen.textSecondary },
        pvzItemTextActive: { color: '#FFFFFF' },

        continueButton: { borderRadius: 30, overflow: 'hidden', marginTop: 10 },
        continueButtonDisabled: { opacity: 0.5 },
        continueGradient: { paddingVertical: 16, alignItems: 'center' },
        continueText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },

        createNewButton: { alignItems: 'center', marginTop: 16 },
        createNewText: { fontSize: 14, color: palette.primary, fontWeight: '500' },
        resendButton: { alignItems: 'center', marginTop: 16 },
        resendText: { fontSize: 14, color: palette.primary, fontWeight: '500' },
        resendTextDisabled: { color: palette.grayLight },

        quickLoginAvatar: {
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: palette.primary,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'center',
          marginBottom: 20,
        },
        quickLoginAvatarText: { fontSize: 28, fontWeight: '700', color: '#FFFFFF' },
        quickLoginMeta: {
          fontSize: 14,
          color: themed.screen.textSecondary,
          textAlign: 'center',
          marginBottom: 28,
          marginTop: -20,
        },
        switchAccountButton: { alignItems: 'center', marginTop: 20, paddingVertical: 8 },
        switchAccountText: { fontSize: 14, color: palette.primary, fontWeight: '500' },

        biometricButton: { alignItems: 'center', marginBottom: 8, paddingVertical: 8 },
        biometricIconWrap: {
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: themed.screen.card,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
          borderWidth: 2,
          borderColor: palette.primary,
        },
        biometricButtonText: { fontSize: 15, fontWeight: '600', color: palette.primary },
        biometricHintText: {
          fontSize: 12,
          color: themed.screen.textSecondary,
          textAlign: 'center',
          marginTop: 8,
          lineHeight: 17,
          paddingHorizontal: 12,
        },
        orDividerText: {
          fontSize: 13,
          color: themed.screen.textSecondary,
          textAlign: 'center',
          marginBottom: 16,
        },
      }),
    [themed.colors, themed.screen, themed.theme]
  );

  return { ...themed, styles };
}
