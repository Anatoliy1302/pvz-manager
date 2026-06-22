import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react-native';
import { colors } from '../../../constants/colors';
import LoginContinueButton from './LoginContinueButton';
import LoginStepHeader from './LoginStepHeader';
import { useLoginStyles } from '../useLoginStyles';

const MIN_PASSWORD_LENGTH = 6;

interface LoginOwnerPasswordStepProps {
  password: string;
  loading: boolean;
  authErrorMessage?: string;
  titleStyle?: object;
  subtitleStyle?: object;
  inputBackground: string;
  inputBorder: string;
  textColor: string;
  onChangePassword: (value: string) => void;
  onSubmit: () => void;
}

export default function LoginOwnerPasswordStep({
  password,
  loading,
  authErrorMessage,
  titleStyle,
  subtitleStyle,
  inputBackground,
  inputBorder,
  textColor,
  onChangePassword,
  onSubmit,
}: LoginOwnerPasswordStepProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();
  const [showPassword, setShowPassword] = useState(false);
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH;

  return (
    <View style={loginStyles.stepContainer}>
      <LoginStepHeader
        title={t('auth.ownerPassword.title')}
        subtitle={t('auth.ownerPassword.subtitle')}
        titleStyle={titleStyle}
        subtitleStyle={subtitleStyle}
      />

      <View
        style={[
          loginStyles.phoneInputContainer,
          { backgroundColor: inputBackground, borderColor: inputBorder },
        ]}
      >
        <Lock size={20} color={colors.gray} />
        <TextInput
          style={[loginStyles.phoneInput, { color: textColor }]}
          placeholder={t('auth.email.passwordPlaceholder')}
          value={password}
          onChangeText={onChangePassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.grayLighter}
        />
        <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
          <Text style={{ color: colors.primary, fontSize: 13 }}>
            {showPassword ? t('auth.email.hidePassword') : t('auth.email.showPassword')}
          </Text>
        </TouchableOpacity>
      </View>

      {authErrorMessage ? (
        <Text style={loginStyles.otpErrorText}>{authErrorMessage}</Text>
      ) : null}

      <LoginContinueButton
        label={loading ? t('common.loading.checking') : t('auth.ownerPassword.submit')}
        enabled={canSubmit}
        loading={loading}
        onPress={onSubmit}
      />
    </View>
  );
}
