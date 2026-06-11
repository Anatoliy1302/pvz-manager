import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../../constants/colors';
import { useLoginStyles } from '../useLoginStyles';

interface LoginContinueButtonProps {
  label: string;
  enabled: boolean;
  loading?: boolean;
  onPress: () => void;
}

export default function LoginContinueButton({
  label,
  enabled,
  loading = false,
  onPress,
}: LoginContinueButtonProps) {
  const { styles: loginStyles } = useLoginStyles();

  return (
    <TouchableOpacity
      style={[loginStyles.continueButton, !enabled && loginStyles.continueButtonDisabled]}
      onPress={onPress}
      disabled={!enabled || loading}
    >
      <LinearGradient
        colors={enabled ? [colors.primary, colors.primaryDark] : ['#ccc', '#ccc']}
        style={loginStyles.continueGradient}
      >
        <Text style={loginStyles.continueText}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}
