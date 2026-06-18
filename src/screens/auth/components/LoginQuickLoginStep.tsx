import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UserRole } from '../../../types/user';
import { ROLE_LABEL_KEYS } from '../loginConstants';
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
  onChangePin: (value: string) => void;
  onSubmit: () => void;
  onSwitchAccount: () => void;
}

export default function LoginQuickLoginStep({
  savedProfileName,
  selectedRole,
  loginDisplay,
  pinCode,
  loading,
  titleStyle,
  subtitleStyle,
  onChangePin,
  onSubmit,
  onSwitchAccount,
}: LoginQuickLoginStepProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();
  const isComplete = pinCode.length === 4;

  return (
    <View style={loginStyles.quickLoginStepContainer}>
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

      <TouchableOpacity onPress={onSwitchAccount} style={loginStyles.switchAccountButton}>
        <Text style={loginStyles.switchAccountText}>{t('auth.quickLogin.switchAccount')}</Text>
      </TouchableOpacity>
    </View>
  );
}
