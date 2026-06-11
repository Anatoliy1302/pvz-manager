import React from 'react';
import { TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Phone } from 'lucide-react-native';
import { colors } from '../../../constants/colors';
import LoginContinueButton from './LoginContinueButton';
import LoginStepBackButton from './LoginStepBackButton';
import LoginStepHeader from './LoginStepHeader';
import { useLoginStyles } from '../useLoginStyles';

interface LoginPhoneStepProps {
  phone: string;
  loading: boolean;
  isValid: boolean;
  titleStyle?: object;
  subtitleStyle?: object;
  inputBackground: string;
  inputBorder: string;
  textColor: string;
  onBack: () => void;
  onChangePhone: (value: string) => void;
  onContinue: () => void;
}

export default function LoginPhoneStep({
  phone,
  loading,
  isValid,
  titleStyle,
  subtitleStyle,
  inputBackground,
  inputBorder,
  textColor,
  onBack,
  onChangePhone,
  onContinue,
}: LoginPhoneStepProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();

  return (
    <View style={loginStyles.stepContainer}>
      <LoginStepBackButton onPress={onBack} />

      <LoginStepHeader
        title={t('auth.phone.title')}
        subtitle={t('auth.phone.subtitle')}
        titleStyle={titleStyle}
        subtitleStyle={subtitleStyle}
      />

      <View
        style={[
          loginStyles.phoneInputContainer,
          { backgroundColor: inputBackground, borderColor: inputBorder },
        ]}
      >
        <Phone size={20} color={colors.gray} />
        <TextInput
          style={[loginStyles.phoneInput, { color: textColor }]}
          placeholder={t('auth.phone.placeholder')}
          value={phone}
          onChangeText={onChangePhone}
          keyboardType="phone-pad"
          placeholderTextColor={colors.grayLighter}
          maxLength={18}
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
