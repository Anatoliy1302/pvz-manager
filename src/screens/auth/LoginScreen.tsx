// src/screens/auth/LoginScreen.tsx
import React from 'react';
import {
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useLoginStyles } from './useLoginStyles';
import { useLoginFlow } from './useLoginFlow';
import LoginLoadingView from './components/LoginLoadingView';
import LoginRoleSelectionStep from './components/LoginRoleSelectionStep';
import LoginEmailStep from './components/LoginEmailStep';
import LoginPhoneStep from './components/LoginPhoneStep';
import LoginSmsStep from './components/LoginSmsStep';
import LoginPinStep from './components/LoginPinStep';
import LoginQuickLoginStep from './components/LoginQuickLoginStep';
import LoginCreatePvzStep from './components/LoginCreatePvzStep';
import LoginSelectPvzStep from './components/LoginSelectPvzStep';
import LanguagePicker from '../../components/common/LanguagePicker';
import AppEnvBanner from '../../components/common/AppEnvBanner';
import GdprConsentBanner from '../../components/legal/GdprConsentBanner';

export default function LoginScreen(_props: { navigation: unknown }) {
  const { ui, screen } = useThemedScreen();
  const { styles: loginStyles } = useLoginStyles();
  const flow = useLoginFlow();
  const insets = useSafeAreaInsets();

  const renderStep = () => {
    switch (flow.step) {
      case 'quickLogin':
        return (
          <LoginQuickLoginStep
            savedProfileName={flow.savedProfileName}
            selectedRole={flow.selectedRole}
            loginDisplay={flow.loginDisplay}
            pinCode={flow.pinCode}
            loading={flow.loading}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            onChangePin={flow.handlePinCodeChange}
            onSubmit={flow.handlePinSubmit}
            onSwitchAccount={flow.handleSwitchAccount}
          />
        );
      case 'role':
        return (
          <LoginRoleSelectionStep
            selectedRole={flow.selectedRole}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            cardBackground={screen.card}
            cardBorder={screen.border}
            onSelectRole={flow.setSelectedRole}
            onContinue={flow.handleRoleContinue}
          />
        );
      case 'email':
        return (
          <LoginEmailStep
            email={flow.email}
            loading={flow.loading}
            isValid={flow.isValidEmail()}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            inputBackground={ui.input.backgroundColor}
            inputBorder={screen.border}
            textColor={screen.text}
            onBack={() => flow.setStep('role')}
            onChangeEmail={flow.handleEmailChange}
            onContinue={flow.handleEmailContinue}
          />
        );
      case 'phone':
        return (
          <LoginPhoneStep
            phone={flow.phone}
            loading={flow.loading}
            isValid={flow.isValidPhone()}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            inputBackground={ui.input.backgroundColor}
            inputBorder={screen.border}
            textColor={screen.text}
            onBack={() => flow.setStep('role')}
            onChangePhone={flow.setPhone}
            onContinue={flow.handlePhoneContinue}
          />
        );
      case 'sms':
        return (
          <LoginSmsStep
            otpChannel={flow.otpChannel}
            contactDisplay={flow.otpContactDisplay}
            smsCode={flow.smsCode}
            smsTimer={flow.smsTimer}
            otpSendStatus={flow.otpSendStatus}
            rateLimitWaitMinutes={flow.rateLimitWaitMinutes}
            loading={flow.loading}
            authErrorMessage={flow.authErrorMessage}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            onBack={() => flow.setStep(flow.otpChannel === 'email' ? 'email' : 'phone')}
            onChangeCode={flow.handleSmsCodeChange}
            onVerify={flow.handleVerifyOtp}
            onResend={flow.handleSendOtp}
          />
        );
      case 'pin':
        return (
          <LoginPinStep
            pinMode={flow.pinMode}
            pinCode={flow.pinCode}
            loading={flow.loading}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            onChangePin={flow.handlePinCodeChange}
            onSubmit={flow.handlePinSubmit}
            pinError={flow.pinError}
            onForgotPin={flow.pinMode === 'entry' ? flow.handleForgotPin : undefined}
          />
        );
      case 'createPvz':
        return (
          <LoginCreatePvzStep
            name={flow.newPvzName}
            address={flow.newPvzAddress}
            loading={flow.loading}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            inputBackground={ui.input.backgroundColor}
            inputBorder={screen.border}
            textColor={screen.text}
            onChangeName={flow.setNewPvzName}
            onChangeAddress={flow.setNewPvzAddress}
            onSubmit={flow.handleCreatePvz}
          />
        );
      case 'selectPvz':
        return (
          <LoginSelectPvzStep
            selectedRole={flow.selectedRole}
            selectedPvzId={flow.selectedPvzId}
            pvzList={flow.pvzList}
            invitations={flow.invitations}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            onSelectPvz={(pvzId, invitationId) => {
              flow.setSelectedPvzId(pvzId);
              if (invitationId) flow.setSelectedInvitationId(invitationId);
            }}
            onContinue={flow.handleSelectPvzContinue}
            onCreateNew={flow.selectedRole === 'owner' ? () => flow.setStep('createPvz') : undefined}
          />
        );
      default:
        return null;
    }
  };

  const showLegalNote =
    flow.step === 'role' ||
    flow.step === 'email' ||
    flow.step === 'phone' ||
    flow.step === 'sms';

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
              (flow.step === 'role' || flow.step === 'quickLogin') && loginStyles.scrollContentRole,
              flow.step === 'quickLogin' && {
                paddingBottom: Math.max(
                  Platform.OS === 'android' ? 48 : 32,
                  insets.bottom + 20,
                ),
              },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {renderStep()}
            {showLegalNote ? (
              <GdprConsentBanner
                style={loginStyles.legalNote}
              />
            ) : null}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </ThemedSafeAreaView>
  );
}
