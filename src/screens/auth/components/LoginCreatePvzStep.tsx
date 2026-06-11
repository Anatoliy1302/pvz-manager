import React from 'react';
import { TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react-native';
import { colors } from '../../../constants/colors';
import LoginContinueButton from './LoginContinueButton';
import LoginStepHeader from './LoginStepHeader';
import { useLoginStyles } from '../useLoginStyles';

interface LoginCreatePvzStepProps {
  name: string;
  address: string;
  loading: boolean;
  titleStyle?: object;
  subtitleStyle?: object;
  inputBackground: string;
  inputBorder: string;
  textColor: string;
  onChangeName: (value: string) => void;
  onChangeAddress: (value: string) => void;
  onSubmit: () => void;
}

export default function LoginCreatePvzStep({
  name,
  address,
  loading,
  titleStyle,
  subtitleStyle,
  inputBackground,
  inputBorder,
  textColor,
  onChangeName,
  onChangeAddress,
  onSubmit,
}: LoginCreatePvzStepProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();
  const canSubmit = name.trim().length > 0 && address.trim().length > 0;

  return (
    <View style={loginStyles.stepContainer}>
      <LoginStepHeader
        title={t('auth.createPvz.title')}
        subtitle={t('auth.createPvz.subtitle')}
        titleStyle={titleStyle}
        subtitleStyle={subtitleStyle}
      />

      <View
        style={[
          loginStyles.inputContainer,
          { backgroundColor: inputBackground, borderColor: inputBorder },
        ]}
      >
        <Building2 size={20} color={colors.gray} />
        <TextInput
          style={[loginStyles.input, { color: textColor }]}
          placeholder={t('auth.createPvz.namePlaceholder')}
          value={name}
          onChangeText={onChangeName}
          placeholderTextColor={colors.grayLighter}
        />
      </View>

      <View
        style={[
          loginStyles.inputContainer,
          { backgroundColor: inputBackground, borderColor: inputBorder },
        ]}
      >
        <Building2 size={20} color={colors.gray} />
        <TextInput
          style={[loginStyles.input, { color: textColor }]}
          placeholder={t('auth.createPvz.addressPlaceholder')}
          value={address}
          onChangeText={onChangeAddress}
          placeholderTextColor={colors.grayLighter}
        />
      </View>

      <LoginContinueButton
        label={loading ? t('common.loading.creating') : t('auth.createPvz.submit')}
        enabled={canSubmit}
        loading={loading}
        onPress={onSubmit}
      />
    </View>
  );
}
