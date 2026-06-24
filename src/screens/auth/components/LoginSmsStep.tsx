import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getPhoneOtpCodeLength, DEMO_MODE, DEMO_OTP_CODE } from '../../../services/AuthService';
import { colors } from '../../../constants/colors';
import LoginContinueButton from './LoginContinueButton';
import LoginStepBackButton from './LoginStepBackButton';
import LoginStepHeader from './LoginStepHeader';
import { useLoginStyles } from '../useLoginStyles';
import { useDemoOtpAutofill } from '../useDemoOtpAutofill';
import type { OtpChannel, OtpSendStatus } from '../loginTypes';

interface LoginSmsStepProps {
  otpChannel: OtpChannel;
  contactDisplay: string;
  smsCode: string;
  smsTimer: number;
  otpSendStatus: OtpSendStatus;
  rateLimitWaitMinutes: number;
  loading: boolean;
  authErrorMessage?: string;
  titleStyle?: object;
  subtitleStyle?: object;
  onBack: () => void;
  onChangeCode: (value: string) => void;
  onVerify: (code?: string) => void;
  onResend: () => void;
}

function OtpDeliveryCard({
  otpChannel,
  contactDisplay,
  otpSendStatus,
  rateLimitWaitMinutes,
  smsTimer,
}: {
  otpChannel: OtpChannel;
  contactDisplay: string;
  otpSendStatus: OtpSendStatus;
  rateLimitWaitMinutes: number;
  smsTimer: number;
}) {
  const { t } = useTranslation();
  const { styles: loginStyles, screen } = useLoginStyles();
  const isEmail = otpChannel === 'email';

  if (otpSendStatus === 'idle' || otpSendStatus === 'failed') {
    return null;
  }

  const isRateLimited = otpSendStatus === 'rate_limited';
  const isUncertain = otpSendStatus === 'uncertain';
  const isSending = otpSendStatus === 'sending';
  const isSent = otpSendStatus === 'sent';
  const showHints = !isRateLimited && !isSending && (isSent || isUncertain);

  const title = isSending
    ? t('auth.otpDelivery.sending')
    : isRateLimited
      ? t('auth.otpDelivery.rateLimited', { minutes: rateLimitWaitMinutes })
      : isUncertain
        ? t('auth.otpDelivery.uncertain')
        : isEmail
          ? t('auth.otpDelivery.sentEmail', { contact: contactDisplay })
          : t('auth.otpDelivery.sentSms', { contact: contactDisplay });

  return (
    <View
      style={[
        loginStyles.otpDeliveryCard,
        {
          backgroundColor: isRateLimited ? '#FEF2F2' : screen.card,
          borderColor: isRateLimited ? '#FECACA' : screen.border,
        },
      ]}
    >
      <Text
        style={[
          loginStyles.otpDeliveryTitle,
          { color: isRateLimited ? colors.danger : screen.text },
        ]}
      >
        {title}
      </Text>
      {showHints ? (
        <>
          <Text style={[loginStyles.otpDeliveryHint, { color: screen.textSecondary }]}>
            {t('auth.otpDelivery.eta')}
          </Text>
          {isEmail ? (
            <Text style={[loginStyles.otpDeliveryHint, { color: screen.textSecondary }]}>
              {t('auth.otpDelivery.spamHint')}
            </Text>
          ) : null}
          <Text style={[loginStyles.otpDeliveryHint, { color: screen.textSecondary }]}>
            {isEmail ? t('auth.otpDelivery.useLatest') : t('auth.otpDelivery.useLatestSms')}
          </Text>
        </>
      ) : null}
      {smsTimer > 0 && !isRateLimited ? (
        <Text style={[loginStyles.otpDeliveryTimer, { color: screen.textSecondary }]}>
          {t('auth.otpDelivery.resendAfter', { seconds: smsTimer })}
        </Text>
      ) : null}
    </View>
  );
}

export default function LoginSmsStep({
  otpChannel,
  contactDisplay,
  smsCode,
  smsTimer,
  otpSendStatus,
  rateLimitWaitMinutes,
  loading,
  authErrorMessage,
  titleStyle,
  subtitleStyle,
  onBack,
  onChangeCode,
  onVerify,
  onResend,
}: LoginSmsStepProps) {
  const { t } = useTranslation();
  const { styles: loginStyles, ui, screen } = useLoginStyles();
  const otpLength = getPhoneOtpCodeLength();
  const isComplete = smsCode.length === otpLength;
  const isEmail = otpChannel === 'email';
  const showDemoHint = DEMO_MODE && !isEmail && otpSendStatus !== 'idle' && otpSendStatus !== 'failed';

  const subtitle = isEmail
    ? t('auth.emailOtp.subtitle', { length: otpLength, email: contactDisplay })
    : t('auth.sms.subtitle', { length: otpLength, phone: contactDisplay });

  useDemoOtpAutofill({
    otpSendStatus,
    loading,
    smsCode,
    onChangeCode,
    onVerify,
  });

  return (
    <View style={loginStyles.stepContainer}>
      <LoginStepBackButton onPress={onBack} />

      <LoginStepHeader
        title={isEmail ? t('auth.emailOtp.title') : t('auth.sms.title')}
        subtitle={subtitle}
        titleStyle={titleStyle}
        subtitleStyle={subtitleStyle}
      />

      <OtpDeliveryCard
        otpChannel={otpChannel}
        contactDisplay={contactDisplay}
        otpSendStatus={otpSendStatus}
        rateLimitWaitMinutes={rateLimitWaitMinutes}
        smsTimer={smsTimer}
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
          autoFocus
          placeholder={'0'.repeat(otpLength)}
          placeholderTextColor={colors.grayLighter}
          accessibilityLabel={
            isEmail ? t('auth.emailOtp.title') : t('auth.sms.title')
          }
          testID="login-otp-input"
        />
      </View>

      {authErrorMessage ? (
        <Text style={loginStyles.otpErrorText}>{authErrorMessage}</Text>
      ) : null}

      {showDemoHint ? (
        <Text style={[loginStyles.otpDeliveryHint, { color: screen.textSecondary, textAlign: 'center' }]}>
          {t('auth.sms.demoHint', { code: DEMO_OTP_CODE })}
        </Text>
      ) : null}

      <LoginContinueButton
        label={loading ? t('common.loading.checking') : t('common.actions.confirm')}
        enabled={isComplete && otpSendStatus !== 'rate_limited'}
        loading={loading}
        onPress={() => onVerify()}
      />

      <TouchableOpacity
        style={loginStyles.resendButton}
        onPress={onResend}
        disabled={loading || smsTimer > 0 || otpSendStatus === 'rate_limited'}
        accessibilityRole="button"
        accessibilityLabel={
          smsTimer > 0
            ? t('auth.sms.resendTimer', { seconds: smsTimer })
            : isEmail
              ? t('auth.emailOtp.resend')
              : t('auth.sms.resend')
        }
        accessibilityState={{
          disabled: loading || smsTimer > 0 || otpSendStatus === 'rate_limited',
        }}
        testID="login-resend-otp"
      >
        <Text style={[loginStyles.resendText, smsTimer > 0 && loginStyles.resendTextDisabled]}>
          {smsTimer > 0
            ? t('auth.sms.resendTimer', { seconds: smsTimer })
            : isEmail
              ? t('auth.emailOtp.resend')
              : t('auth.sms.resend')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
