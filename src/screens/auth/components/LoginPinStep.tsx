import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PinMode } from '../loginTypes';
import LoginBiometricButton from './LoginBiometricButton';
import LoginContinueButton from './LoginContinueButton';
import LoginPinInput from './LoginPinInput';
import LoginStepHeader from './LoginStepHeader';
import { useLoginStyles } from '../useLoginStyles';

interface LoginPinStepProps {
  pinMode: PinMode;
  pinCode: string;
  loading: boolean;
  titleStyle?: object;
  subtitleStyle?: object;
  showBiometric?: boolean;
  biometricLabel?: string;
  biometricIsFaceId?: boolean;
  biometricUsesDeviceAuth?: boolean;
  autoFocusPin?: boolean;
  onChangePin: (value: string) => void;
  onSubmit: () => void;
  onBiometricPress?: () => void;
}

export default function LoginPinStep({
  pinMode,
  pinCode,
  loading,
  titleStyle,
  subtitleStyle,
  showBiometric = false,
  biometricLabel,
  biometricIsFaceId = false,
  biometricUsesDeviceAuth = false,
  autoFocusPin,
  onChangePin,
  onSubmit,
  onBiometricPress,
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

      {showBiometric && onBiometricPress && (
        <LoginBiometricButton
          label={biometricLabel ?? t('auth.pin.biometric')}
          isFaceId={biometricIsFaceId}
          usesDeviceAuth={biometricUsesDeviceAuth}
          loading={loading}
          onPress={onBiometricPress}
        />
      )}

      <LoginPinInput pinCode={pinCode} onChangePin={onChangePin} autoFocus={autoFocusPin} />

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
