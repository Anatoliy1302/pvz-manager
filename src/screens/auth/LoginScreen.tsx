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
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { useLoginStyles } from './useLoginStyles';
import { useLoginFlow } from './useLoginFlow';
import LoginLoadingView from './components/LoginLoadingView';
import LoginRoleSelectionStep from './components/LoginRoleSelectionStep';
import LoginPhoneStep from './components/LoginPhoneStep';
import LoginSmsStep from './components/LoginSmsStep';
import LoginPinStep from './components/LoginPinStep';
import LoginQuickLoginStep from './components/LoginQuickLoginStep';
import LoginCreatePvzStep from './components/LoginCreatePvzStep';
import LoginSelectPvzStep from './components/LoginSelectPvzStep';
import LanguagePicker from '../../components/common/LanguagePicker';

export default function LoginScreen(_props: { navigation: unknown }) {
  const { ui, screen } = useThemedScreen();
  const { styles: loginStyles } = useLoginStyles();
  const flow = useLoginFlow();

  const renderStep = () => {
    switch (flow.step) {
      case 'quickLogin':
        return (
          <LoginQuickLoginStep
            savedProfileName={flow.savedProfileName}
            selectedRole={flow.selectedRole}
            phone={flow.phone}
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
            onContinue={() => flow.selectedRole && flow.setStep('phone')}
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
            phone={flow.phone}
            smsCode={flow.smsCode}
            smsTimer={flow.smsTimer}
            loading={flow.loading}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            onBack={() => flow.setStep('phone')}
            onChangeCode={flow.handleSmsCodeChange}
            onVerify={flow.handleVerifySms}
            onResend={flow.handleSendSms}
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

  if (flow.checkingSavedProfile) {
    return <LoginLoadingView subtitleStyle={ui.subtitle} />;
  }

  return (
    <ThemedSafeAreaView style={loginStyles.container} edges={['top', 'left', 'right']}>
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
