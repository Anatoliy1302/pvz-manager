import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PinMode } from '../loginTypes';
import LoginContinueButton from './LoginContinueButton';
import LoginPinInput from './LoginPinInput';
import LoginStepHeader from './LoginStepHeader';
import { useLoginStyles } from '../useLoginStyles';
import { colors } from '../../../constants/colors';

interface LoginPinStepProps {
  pinMode: PinMode;
  pinCode: string;
  loading: boolean;
  pinError?: boolean;
  titleStyle?: object;
  subtitleStyle?: object;
  onChangePin: (value: string) => void;
  onSubmit: () => void;
  onForgotPin?: () => void;
}

export default function LoginPinStep({
  pinMode,
  pinCode,
  loading,
  pinError = false,
  titleStyle,
  subtitleStyle,
  onChangePin,
  onSubmit,
  onForgotPin,
}: LoginPinStepProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();
  const isComplete = pinCode.length === 4;

  return (
    <View style={loginStyles.stepContainer}>
      <LoginStepHeader
        title={pinMode === 'entry' ? t('auth.pin.entryTitle') : t('auth.pin.setupTitle')}
        subtitle={
          pinMode === 'entry' ? t('auth.pin.entrySubtitle') : t('auth.pin.setupSubtitle')
        }
        titleStyle={titleStyle}
        subtitleStyle={subtitleStyle}
      />

      <LoginPinInput
        pinCode={pinCode}
        onChangePin={onChangePin}
        disabled={loading}
        hasError={pinError}
      />

      {pinMode === 'entry' && onForgotPin && (
        <TouchableOpacity
          onPress={onForgotPin}
          disabled={loading}
          style={{ marginBottom: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('auth.pin.forgot')}
          testID="login-forgot-pin"
        >
          <Text style={{ color: colors.primary, textAlign: 'center', fontSize: 14 }}>
            {t('auth.pin.forgot')}
          </Text>
        </TouchableOpacity>
      )}

      <LoginContinueButton
        label={
          loading
            ? t('common.loading.signingIn')
            : pinMode === 'entry'
              ? t('auth.quickLogin.submit')
              : t('common.actions.done')
        }
        enabled={isComplete}
        loading={loading}
        onPress={onSubmit}
      />
    </View>
  );
}
