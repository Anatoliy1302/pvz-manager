import React from 'react';
import { TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react-native';
import { colors } from '../../../constants/colors';
import LoginContinueButton from './LoginContinueButton';
import LoginStepBackButton from './LoginStepBackButton';
import LoginStepHeader from './LoginStepHeader';
import { useLoginStyles } from '../useLoginStyles';

interface LoginEmailStepProps {
  email: string;
  loading: boolean;
  isValid: boolean;
  titleStyle?: object;
  subtitleStyle?: object;
  inputBackground: string;
  inputBorder: string;
  textColor: string;
  onBack: () => void;
  onChangeEmail: (value: string) => void;
  onContinue: () => void;
}

export default function LoginEmailStep({
  email,
  loading,
  isValid,
  titleStyle,
  subtitleStyle,
  inputBackground,
  inputBorder,
  textColor,
  onBack,
  onChangeEmail,
  onContinue,
}: LoginEmailStepProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();

  return (
    <View style={loginStyles.stepContainer}>
      <LoginStepBackButton onPress={onBack} />

      <LoginStepHeader
        title={t('auth.email.title')}
        subtitle={t('auth.email.subtitle')}
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
        />
      </View>

      <LoginContinueButton
        label={loading ? t('common.loading.checking') : t('common.actions.continue')}
        enabled={isValid}
        loading={loading}
        onPress={onContinue}
      />
    </View>
  );
}
