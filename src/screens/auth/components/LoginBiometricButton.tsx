import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Fingerprint, ScanFace } from 'lucide-react-native';
import { colors } from '../../../constants/colors';
import { useLoginStyles } from '../useLoginStyles';

interface LoginBiometricButtonProps {
  label: string;
  isFaceId: boolean;
  usesDeviceAuth: boolean;
  loading: boolean;
  showDivider?: boolean;
  onPress: () => void;
}

export default function LoginBiometricButton({
  label,
  isFaceId,
  usesDeviceAuth,
  loading,
  showDivider = true,
  onPress,
}: LoginBiometricButtonProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();
  const BiometricIcon = isFaceId || usesDeviceAuth ? ScanFace : Fingerprint;

  return (
    <>
      <TouchableOpacity
        style={loginStyles.biometricButton}
        onPress={onPress}
        disabled={loading}
        activeOpacity={0.85}
      >
        <View style={loginStyles.biometricIconWrap}>
          <BiometricIcon size={32} color={colors.primary} />
        </View>
        <Text style={loginStyles.biometricButtonText}>
          {t('auth.pin.biometricLogin', { label })}
        </Text>
        {usesDeviceAuth && (
          <Text style={loginStyles.biometricHintText}>{t('auth.pin.expoGoDeviceAuthHint')}</Text>
        )}
      </TouchableOpacity>
      {showDivider && <Text style={loginStyles.orDividerText}>{t('auth.pin.orEnterPin')}</Text>}
    </>
  );
}
