import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Lock, Mail } from 'lucide-react-native';
import { colors } from '../../../constants/colors';
import LoginContinueButton from './LoginContinueButton';
import LoginStepBackButton from './LoginStepBackButton';
import LoginStepHeader from './LoginStepHeader';
import { useLoginStyles } from '../useLoginStyles';

export type EmailAuthMode = 'login' | 'register';

interface LoginEmailStepProps {
  email: string;
  password: string;
  authMode: EmailAuthMode;
  useEmailOtp?: boolean;
  loading: boolean;
  isValid: boolean;
  authErrorMessage?: string;
  titleStyle?: object;
  subtitleStyle?: object;
  inputBackground: string;
  inputBorder: string;
  textColor: string;
  onBack: () => void;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onLogin: () => void;
  onForgotPassword: () => void;
  onToggleAuthMode: () => void;
}

const MIN_PASSWORD_LENGTH = 6;

export default function LoginEmailStep({
  email,
  password,
  authMode,
  useEmailOtp = false,
  loading,
  isValid,
  authErrorMessage,
  titleStyle,
  subtitleStyle,
  inputBackground,
  inputBorder,
  textColor,
  onBack,
  onChangeEmail,
  onChangePassword,
  onLogin,
  onForgotPassword,
  onToggleAuthMode,
}: LoginEmailStepProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();
  const [showPassword, setShowPassword] = useState(false);

  const passwordReady = password.length >= MIN_PASSWORD_LENGTH;
  const otpEntry = useEmailOtp || authMode === 'register';
  const canSubmit = otpEntry ? isValid : isValid && passwordReady;

  const title = otpEntry
    ? authMode === 'register'
      ? t('auth.email.registerTitle')
      : t('auth.emailOtp.title')
    : authMode === 'register'
      ? t('auth.email.registerTitle')
      : t('auth.email.title');
  const subtitle = otpEntry
    ? authMode === 'register'
      ? t('auth.email.registerOtpSubtitle')
      : t('auth.email.otpSubtitle')
    : authMode === 'register'
      ? t('auth.email.registerSubtitle')
      : t('auth.email.subtitle');
  const submitLabel = loading
    ? t('common.loading.checking')
    : otpEntry
      ? t('auth.email.sendCode')
      : authMode === 'register'
        ? t('auth.email.register')
        : t('auth.email.signIn');

  return (
    <View style={loginStyles.stepContainer}>
      <LoginStepBackButton onPress={onBack} />

      <LoginStepHeader
        title={title}
        subtitle={subtitle}
        titleStyle={titleStyle}
        subtitleStyle={subtitleStyle}
      />

      <View
        style={[
          loginStyles.phoneInputContainer,
          { backgroundColor: inputBackground, borderColor: inputBorder },
        ]}
      >
        <Mail size={20} color={colors.gray} />
        <TextInput
          style={[loginStyles.phoneInput, { color: textColor }]}
          placeholder={t('auth.email.placeholder')}
          value={email}
          onChangeText={onChangeEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.grayLighter}
          accessibilityLabel={t('auth.email.placeholder')}
          testID="login-email-input"
        />
      </View>

      {!otpEntry ? (
        <View
          style={[
            loginStyles.phoneInputContainer,
            { backgroundColor: inputBackground, borderColor: inputBorder, marginTop: 12 },
          ]}
        >
          <Lock size={20} color={colors.gray} />
          <TextInput
            style={[loginStyles.phoneInput, { color: textColor }]}
            placeholder={t('auth.email.passwordPlaceholder')}
            value={password}
            onChangeText={onChangePassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.grayLighter}
            accessibilityLabel={t('auth.email.passwordPlaceholder')}
            testID="login-password-input"
          />
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              showPassword ? t('auth.email.hidePassword') : t('auth.email.showPassword')
            }
            testID="login-toggle-password"
          >
            <Text style={{ color: colors.primary, fontSize: 13 }}>
              {showPassword ? t('auth.email.hidePassword') : t('auth.email.showPassword')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {authErrorMessage ? (
        <Text style={loginStyles.otpErrorText}>{authErrorMessage}</Text>
      ) : null}

      <LoginContinueButton
        label={submitLabel}
        enabled={canSubmit}
        loading={loading}
        onPress={onLogin}
      />

      {authMode === 'login' && !otpEntry ? (
        <TouchableOpacity
          style={loginStyles.resendButton}
          onPress={onForgotPassword}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={t('auth.email.forgotPassword')}
          testID="login-forgot-password"
        >
          <Text style={loginStyles.resendText}>{t('auth.email.forgotPassword')}</Text>
        </TouchableOpacity>
      ) : null}

      {!otpEntry ? (
        <TouchableOpacity
          style={loginStyles.resendButton}
          onPress={onToggleAuthMode}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={
            authMode === 'login' ? t('auth.email.switchToRegister') : t('auth.email.switchToLogin')
          }
          testID="login-toggle-auth-mode"
        >
          <Text style={loginStyles.resendText}>
            {authMode === 'login' ? t('auth.email.switchToRegister') : t('auth.email.switchToLogin')}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
