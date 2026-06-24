import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UserRole } from '../../../types/user';
import { ROLE_LABEL_KEYS } from '../loginConstants';
import LoginStepBackButton from './LoginStepBackButton';
import LoginContinueButton from './LoginContinueButton';
import LoginPinInput from './LoginPinInput';
import LoginStepHeader from './LoginStepHeader';
import { useLoginStyles } from '../useLoginStyles';

interface LoginQuickLoginStepProps {
  savedProfileName: string;
  selectedRole: UserRole | null;
  loginDisplay: string;
  pinCode: string;
  loading: boolean;
  titleStyle?: object;
  subtitleStyle?: object;
  onBack: () => void;
  onChangePin: (value: string) => void;
  onSubmit: () => void;
  onSwitchAccount: () => void;
  onForgotPin?: () => void;
}

export default function LoginQuickLoginStep({
  savedProfileName,
  selectedRole,
  loginDisplay,
  pinCode,
  loading,
  titleStyle,
  subtitleStyle,
  onBack,
  onChangePin,
  onSubmit,
  onSwitchAccount,
  onForgotPin,
}: LoginQuickLoginStepProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();
  const isComplete = pinCode.length === 4;

  return (
    <View style={loginStyles.quickLoginStepContainer}>
      <LoginStepBackButton onPress={onBack} />

      <View style={loginStyles.quickLoginAvatar}>
        <Text style={loginStyles.quickLoginAvatarText}>
          {(savedProfileName || '?').charAt(0).toUpperCase()}
        </Text>
      </View>

      <LoginStepHeader
        title={t('auth.quickLogin.title')}
        subtitle={savedProfileName}
        titleStyle={titleStyle}
        subtitleStyle={subtitleStyle}
      />

      <Text style={[loginStyles.quickLoginMeta, subtitleStyle]}>
        {selectedRole ? t(ROLE_LABEL_KEYS[selectedRole]) : ''} · {loginDisplay}
      </Text>

      <LoginPinInput
        pinCode={pinCode}
        onChangePin={onChangePin}
        disabled={loading}
      />

      <LoginContinueButton
        label={loading ? t('common.loading.signingIn') : t('auth.quickLogin.submit')}
        enabled={isComplete}
        loading={loading}
        onPress={onSubmit}
      />

      {onForgotPin ? (
        <TouchableOpacity
          onPress={onForgotPin}
          disabled={loading}
          style={loginStyles.switchAccountButton}
          accessibilityRole="button"
          accessibilityLabel={t('auth.pin.forgot')}
          testID="login-forgot-pin"
        >
          <Text style={loginStyles.switchAccountText}>{t('auth.pin.forgot')}</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        onPress={onSwitchAccount}
        style={loginStyles.switchAccountButton}
        accessibilityRole="button"
        accessibilityLabel={t('auth.quickLogin.switchAccount')}
        testID="login-switch-account"
      >
        <Text style={loginStyles.switchAccountText}>{t('auth.quickLogin.switchAccount')}</Text>
      </TouchableOpacity>
    </View>
  );
}
