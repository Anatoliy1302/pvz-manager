import React, { useEffect, useRef } from 'react';

import {

  ScrollView,

  KeyboardAvoidingView,

  Platform,

  TouchableWithoutFeedback,

  Keyboard,

  View,

  Text,

  TextInput,

  TouchableOpacity,

} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from 'react-i18next';

import { Mail, Lock } from 'lucide-react-native';

import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';

import { useThemedScreen } from '../../hooks/useThemedScreen';

import { useLoginStyles } from './useLoginStyles';

import { useLoginFlow } from './useLoginFlow';
import { isStaffRole } from '../../types/user';

import LoginLoadingView from './components/LoginLoadingView';

import LoginContinueButton from './components/LoginContinueButton';

import LoginStepBackButton from './components/LoginStepBackButton';

import LoginStepHeader from './components/LoginStepHeader';

import LoginPinInput from './components/LoginPinInput';

import LoginCreatePvzStep from './components/LoginCreatePvzStep';
import LoginRoleSelectionStep from './components/LoginRoleSelectionStep';
import LoginPhoneStep from './components/LoginPhoneStep';
import LoginSmsStep from './components/LoginSmsStep';
import LoginSelectPvzStep from './components/LoginSelectPvzStep';
import LoginQuickLoginStep from './components/LoginQuickLoginStep';
import LanguagePicker from '../../components/common/LanguagePicker';

import AppEnvBanner from '../../components/common/AppEnvBanner';

import LegalConsentCheckbox from '../../components/legal/LegalConsentCheckbox';

import { colors } from '../../constants/colors';



export default function LoginScreen(_props: { navigation: unknown }) {

  const { t } = useTranslation();

  const { ui, screen } = useThemedScreen();

  const { styles: loginStyles } = useLoginStyles();

  const flow = useLoginFlow();

  const insets = useSafeAreaInsets();

  const otpInputRef = useRef<TextInput>(null);



  useEffect(() => {

    if (flow.step !== 'otp_reset' && flow.step !== 'register_otp') return;

    const focusTimer = setTimeout(() => otpInputRef.current?.focus(), 350);

    return () => clearTimeout(focusTimer);

  }, [flow.step]);



  const inputBoxStyle = [

    loginStyles.phoneInputContainer,

    { backgroundColor: ui.input.backgroundColor, borderColor: screen.border },

  ];



  const renderEmailStep = () => {

    const isRegister = flow.flowMode === 'register';



    return (

      <View style={loginStyles.stepContainer}>

        <LoginStepHeader

          title={

            isRegister ? t('auth.login.registerEmailTitle') : t('auth.login.emailTitle')

          }

          subtitle={

            isRegister

              ? t('auth.login.registerEmailSubtitle')

              : t('auth.login.emailSubtitle')

          }

          titleStyle={ui.title}

          subtitleStyle={ui.subtitle}

        />



        <View style={inputBoxStyle}>

          <Mail size={20} color={colors.gray} />

          <TextInput

            style={[loginStyles.phoneInput, { color: screen.text }]}

            placeholder={t('auth.email.placeholder')}

            value={flow.email}

            onChangeText={flow.handleEmailChange}

            keyboardType="email-address"

            autoCapitalize="none"

            autoCorrect={false}

            placeholderTextColor={colors.grayLighter}

            accessibilityLabel={t('auth.email.placeholder')}

            testID="login-email-input"

          />

        </View>



        {flow.authErrorMessage ? (

          <Text style={loginStyles.otpErrorText}>{flow.authErrorMessage}</Text>

        ) : null}



        {flow.requiresLegalConsent ? (
          <LegalConsentCheckbox
            checked={flow.legalAccepted}
            onToggle={flow.setLegalAccepted}
            style={loginStyles.legalNote}
          />
        ) : null}



        <LoginContinueButton

          label={

            flow.loading

              ? t('common.loading.checking')

              : isRegister

                ? t('auth.login.sendRegisterCode')

                : t('auth.login.next')

          }

          enabled={flow.isValidEmail() && flow.canProceedWithLegal}

          loading={flow.loading}

          onPress={flow.submitEmailStep}

        />



        <TouchableOpacity

          onPress={isRegister ? flow.switchToLogin : flow.switchToRegister}

          disabled={flow.loading}

          style={loginStyles.resendButton}

          accessibilityRole="button"

          accessibilityLabel={

            isRegister ? t('auth.login.switchToLogin') : t('auth.login.switchToRegister')

          }

          testID="login-switch-flow"

        >

          <Text style={loginStyles.resendText}>

            {isRegister ? t('auth.login.switchToLogin') : t('auth.login.switchToRegister')}

          </Text>

        </TouchableOpacity>

      </View>

    );

  };



  const renderPinStep = () => (

    <View style={loginStyles.stepContainer}>

      <LoginStepBackButton onPress={flow.handleBack} />



      <LoginStepHeader

        title={t('auth.pin.entryTitle')}

        subtitle={t('auth.login.pinSubtitle', { email: flow.loginEmail })}

        titleStyle={ui.title}

        subtitleStyle={ui.subtitle}

      />



      <LoginPinInput

        pinCode={flow.pinCode}

        onChangePin={flow.handlePinChange}

        disabled={flow.loading}

        hasError={flow.pinError}

      />



      {flow.authErrorMessage ? (

        <Text style={loginStyles.otpErrorText}>{flow.authErrorMessage}</Text>

      ) : null}



      <TouchableOpacity

        onPress={flow.handleForgotPin}

        disabled={flow.loading}

        style={{ marginBottom: 12 }}

        accessibilityRole="button"

        accessibilityLabel={t('auth.pin.forgot')}

        testID="login-forgot-pin"

      >

        <Text style={{ color: colors.primary, textAlign: 'center', fontSize: 14 }}>

          {t('auth.pin.forgot')}

        </Text>

      </TouchableOpacity>



      <LoginContinueButton

        label={flow.loading ? t('common.loading.signingIn') : t('auth.quickLogin.submit')}

        enabled={flow.pinCode.length >= flow.pinLength}

        loading={flow.loading}

        onPress={flow.verifyPin}

      />

    </View>

  );



  const renderOtpStep = (options: {

    title: string;

    onVerify: () => void;

    onResend: () => void;

    showBack: boolean;

  }) => (

    <View style={loginStyles.stepContainer}>

      {options.showBack ? <LoginStepBackButton onPress={flow.handleBack} /> : null}



      <LoginStepHeader

        title={options.title}

        subtitle={t('auth.emailOtp.subtitle', {

          length: flow.otpLength,

          email: flow.loginEmail,

        })}

        titleStyle={ui.title}

        subtitleStyle={ui.subtitle}

      />



      <View style={inputBoxStyle}>

        <Lock size={20} color={colors.gray} />

        <TextInput

          ref={otpInputRef}

          style={[loginStyles.phoneInput, { color: screen.text, letterSpacing: 4 }]}

          placeholder={t('auth.emailOtp.placeholder')}

          value={flow.otpCode}

          onChangeText={flow.handleOtpChange}

          keyboardType="number-pad"

          textContentType="oneTimeCode"

          autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}

          maxLength={flow.otpLength}

          placeholderTextColor={colors.grayLighter}

          autoFocus

        />

      </View>



      {flow.loading ? (

        <Text style={[loginStyles.resendText, { marginBottom: 8 }]}>

          {t('auth.otpDelivery.sending')}

        </Text>

      ) : null}



      {flow.authErrorMessage ? (

        <Text style={loginStyles.otpErrorText}>{flow.authErrorMessage}</Text>

      ) : null}



      <LoginContinueButton

        label={flow.loading ? t('common.loading.checking') : t('auth.login.verifyOtp')}

        enabled={flow.otpCode.length >= flow.otpLength}

        loading={flow.loading}

        onPress={options.onVerify}

      />



      <TouchableOpacity

        style={loginStyles.resendButton}

        onPress={options.onResend}

        disabled={flow.loading || flow.otpTimer > 0}

        accessibilityRole="button"

        accessibilityLabel={

          flow.otpTimer > 0

            ? t('auth.otpDelivery.resendAfter', { seconds: flow.otpTimer })

            : t('auth.emailOtp.resend')

        }

        accessibilityState={{ disabled: flow.loading || flow.otpTimer > 0 }}

        testID="login-resend-otp"

      >

        <Text style={loginStyles.resendText}>

          {flow.otpTimer > 0

            ? t('auth.otpDelivery.resendAfter', { seconds: flow.otpTimer })

            : t('auth.emailOtp.resend')}

        </Text>

      </TouchableOpacity>

    </View>

  );



  const renderNewPinStep = () => {

    const isConfirm = flow.newPinPhase === 'confirm';

    const activePin = isConfirm ? flow.newPinConfirm : flow.newPin;



    return (

      <View style={loginStyles.stepContainer}>

        <LoginStepBackButton onPress={flow.handleBack} />



        <LoginStepHeader

          title={isConfirm ? t('auth.login.confirmPinTitle') : t('auth.pin.setupTitle')}

          subtitle={

            isConfirm ? t('auth.login.confirmPinSubtitle') : t('auth.pin.setupSubtitle')

          }

          titleStyle={ui.title}

          subtitleStyle={ui.subtitle}

        />



        <LoginPinInput

          pinCode={activePin}

          onChangePin={flow.handleNewPinChange}

          disabled={flow.loading}

        />



        <LoginContinueButton

          label={

            flow.loading

              ? t('common.loading.signingIn')

              : isConfirm
                ? flow.isRegisterFlow
                  ? t('auth.login.savePinAndContinue')
                  : t('auth.login.savePinAndEnter')
                : t('common.actions.continue')

          }

          enabled={activePin.length >= flow.pinLength}

          loading={flow.loading}

          onPress={flow.resetPin}

        />

      </View>

    );

  };



  const renderCreatePvzStep = () => (

    <View style={loginStyles.stepContainer}>

      <LoginStepBackButton onPress={flow.handleBack} />

      <LoginCreatePvzStep

        name={flow.pvzName}

        address={flow.pvzAddress}

        loading={flow.loading}

        titleStyle={ui.title}

        subtitleStyle={ui.subtitle}

        inputBackground={ui.input.backgroundColor}

        inputBorder={screen.border}

        textColor={screen.text}

        onChangeName={flow.handlePvzNameChange}

        onChangeAddress={flow.handlePvzAddressChange}

        onSubmit={flow.createPvz}

      />

    </View>

  );



  const renderRoleStep = () => (
    <LoginRoleSelectionStep
      selectedRole={flow.selectedRole}
      titleStyle={ui.title}
      subtitleStyle={ui.subtitle}
      cardBackground={ui.input.backgroundColor}
      cardBorder={screen.border}
      onSelectRole={flow.handleSelectRole}
      onContinue={flow.submitRoleStep}
    />
  );

  const renderPhoneStep = () => (
    <LoginPhoneStep
      phone={flow.phone}
      loading={flow.loading}
      isValid={flow.phone.replace(/\D/g, '').length >= 11 && flow.canProceedWithLegal}
      titleStyle={ui.title}
      subtitleStyle={ui.subtitle}
      inputBackground={ui.input.backgroundColor}
      inputBorder={screen.border}
      textColor={screen.text}
      legalConsent={
        flow.requiresLegalConsent ? (
          <LegalConsentCheckbox
            checked={flow.legalAccepted}
            onToggle={flow.setLegalAccepted}
            style={loginStyles.legalNote}
          />
        ) : null
      }
      onBack={flow.handleBack}
      onChangePhone={flow.handlePhoneChange}
      onContinue={flow.submitPhoneStep}
    />
  );

  const renderStaffSmsStep = () => (
    <LoginSmsStep
      otpChannel="sms"
      contactDisplay={flow.phoneDisplay}
      smsCode={flow.otpCode}
      smsTimer={flow.otpTimer}
      otpSendStatus={flow.otpSendStatus}
      rateLimitWaitMinutes={flow.rateLimitWaitMinutes}
      loading={flow.loading}
      authErrorMessage={flow.authErrorMessage}
      titleStyle={ui.title}
      subtitleStyle={ui.subtitle}
      onBack={flow.handleBack}
      onChangeCode={flow.handleOtpChange}
      onVerify={flow.verifyStaffSms}
      onResend={flow.resendStaffSms}
    />
  );

  const renderSelectPvzStep = () => (
    <LoginSelectPvzStep
      selectedRole={flow.selectedRole}
      selectedPvzId={flow.selectedPvzId}
      pvzList={[]}
      invitations={flow.staffInvitations}
      titleStyle={ui.title}
      subtitleStyle={ui.subtitle}
      onSelectPvz={flow.handleSelectPvz}
      onContinue={flow.completeStaffPvzSelection}
    />
  );

  const renderQuickLoginStep = () => (
    <LoginQuickLoginStep
      savedProfileName={flow.savedProfileName}
      selectedRole={flow.selectedRole}
      loginDisplay={flow.loginDisplay}
      pinCode={flow.pinCode}
      loading={flow.loading}
      titleStyle={ui.title}
      subtitleStyle={ui.subtitle}
      requiresLegalConsent={flow.requiresLegalConsent}
      legalAccepted={flow.legalAccepted}
      onLegalAcceptedChange={flow.setLegalAccepted}
      canProceedWithLegal={flow.canProceedWithLegal}
      onChangePin={flow.handlePinChange}
      onSubmit={flow.verifyPin}
      onBack={flow.handleBack}
      onSwitchAccount={flow.switchAccount}
      onForgotPin={isStaffRole(flow.selectedRole) ? flow.handleStaffForgotPin : undefined}
    />
  );

  const renderStep = () => {
    switch (flow.step) {
      case 'role':
        return renderRoleStep();
      case 'quick_login':
        return renderQuickLoginStep();
      case 'phone':
        return renderPhoneStep();
      case 'sms':
        return renderStaffSmsStep();
      case 'select_pvz':
        return renderSelectPvzStep();
      case 'email':
        return renderEmailStep();

      case 'pin':

        return renderPinStep();

      case 'otp_reset':

        return renderOtpStep({

          title: t('auth.login.otpResetTitle'),

          onVerify: flow.verifyOtp,

          onResend: flow.sendOtpForReset,

          showBack: true,

        });

      case 'register_otp':

        return renderOtpStep({

          title: t('auth.login.registerOtpTitle'),

          onVerify: flow.verifyRegisterOtp,

          onResend: flow.sendRegisterOtp,

          showBack: true,

        });

      case 'new_pin':

        return renderNewPinStep();

      case 'create_pvz':

        return renderCreatePvzStep();

      default:
        return renderRoleStep();
    }
  };



  if (flow.checkingSavedProfile) {

    return <LoginLoadingView subtitleStyle={ui.subtitle} />;

  }



  return (

    <ThemedSafeAreaView style={loginStyles.container} edges={['top', 'left', 'right', 'bottom']}>

      <AppEnvBanner />

      <View style={loginStyles.languageBar}>

        <LanguagePicker variant="compact" />

      </View>

      <KeyboardAvoidingView

        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}

        style={loginStyles.keyboardView}

      >

        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>

          <ScrollView

            contentContainerStyle={[

              loginStyles.scrollContent,

              { paddingBottom: Math.max(24, insets.bottom + 16) },

            ]}

            showsVerticalScrollIndicator={false}

            keyboardShouldPersistTaps="handled"

          >

            {renderStep()}

          </ScrollView>

        </TouchableWithoutFeedback>

      </KeyboardAvoidingView>

    </ThemedSafeAreaView>

  );

}


