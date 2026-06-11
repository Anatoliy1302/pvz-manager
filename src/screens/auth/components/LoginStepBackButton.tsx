import React from 'react';
import { TouchableOpacity } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '../../../constants/colors';
import { useLoginStyles } from '../useLoginStyles';

interface LoginStepBackButtonProps {
  onPress: () => void;
}

export default function LoginStepBackButton({ onPress }: LoginStepBackButtonProps) {
  const { styles: loginStyles } = useLoginStyles();

  return (
    <TouchableOpacity onPress={onPress} style={loginStyles.backButton}>
      <ChevronLeft size={24} color={colors.primary} />
    </TouchableOpacity>
  );
}
