import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getOtpCodeLength, usesSupabasePhoneOtp } from '../../../services/SupabaseAuthService';
import { colors } from '../../../constants/colors';
import LoginContinueButton from './LoginContinueButton';
import LoginStepBackButton from './LoginStepBackButton';
import LoginStepHeader from './LoginStepHeader';
import { useLoginStyles } from '../useLoginStyles';

interface LoginSmsStepProps {
  phone: string;
  smsCode: string;
  smsTimer: number;
  loading: boolean;
  titleStyle?: object;
  subtitleStyle?: object;
  onBack: () => void;
  onChangeCode: (value: string) => void;
  onVerify: () => void;
  onResend: () => void;
}

export default function LoginSmsStep({
  phone,
  smsCode,
  smsTimer,
  loading,
  titleStyle,
  subtitleStyle,
  onBack,
  onChangeCode,
  onVerify,
  onResend,
}: LoginSmsStepProps) {
  const { t } = useTranslation();
  const { styles: loginStyles, ui, screen } = useLoginStyles();
  const otpLength = getOtpCodeLength();
  const isComplete = smsCode.length === otpLength;

  return (
    <View style={loginStyles.stepContainer}>
      <LoginStepBackButton onPress={onBack} />

      <LoginStepHeader
        title={t('auth.sms.title')}
        subtitle={
          usesSupabasePhoneOtp()
            ? t('auth.sms.subtitle', { length: otpLength, phone })
            : t('auth.sms.subtitleStub', { length: otpLength, phone })
        }
        titleStyle={titleStyle}
        subtitleStyle={subtitleStyle}
      />

      <View style={loginStyles.smsInputContainer}>
        <TextInput
          style={[
            loginStyles.smsInput,
            {
              backgroundColor: ui.input.backgroundColor,
              borderColor: screen.border,
              color: screen.text,
            },
          ]}
          value={smsCode}
          onChangeText={onChangeCode}
          keyboardType="numeric"
          maxLength={otpLength}
          placeholder={'0'.repeat(otpLength)}
          placeholderTextColor={colors.grayLighter}
        />
      </View>

      <LoginContinueButton
        label={loading ? t('common.loading.checking') : t('common.actions.confirm')}
        enabled={isComplete}
        loading={loading}
        onPress={onVerify}
      />

      <TouchableOpacity
        style={loginStyles.resendButton}
        onPress={onResend}
        disabled={loading || smsTimer > 0}
      >
        <Text style={[loginStyles.resendText, smsTimer > 0 && loginStyles.resendTextDisabled]}>
          {smsTimer > 0
            ? t('auth.sms.resendTimer', { seconds: smsTimer })
            : t('auth.sms.resend')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
