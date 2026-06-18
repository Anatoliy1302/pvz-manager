import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react-native';
import { colors } from '../../../constants/colors';
import { LoginRoleOption } from '../loginTypes';
import { useLoginStyles } from '../useLoginStyles';

interface LoginRoleCardProps {
  option: LoginRoleOption;
  isActive: boolean;
  cardBackground: string;
  cardBorder: string;
  onSelect: () => void;
}

export default function LoginRoleCard({
  option,
  isActive,
  cardBackground,
  cardBorder,
  onSelect,
}: LoginRoleCardProps) {
  const { t } = useTranslation();
  const { styles: loginStyles } = useLoginStyles();
  const Icon = option.icon;

  return (
    <TouchableOpacity
      style={[
        loginStyles.roleOption,
        !isActive && { backgroundColor: cardBackground, borderColor: cardBorder },
        isActive && loginStyles.roleOptionActive,
      ]}
      onPress={onSelect}
      activeOpacity={0.85}
    >
      <View style={[loginStyles.roleIcon, !isActive && loginStyles.roleIconInactive]}>
        <Icon size={28} color={isActive ? '#FFFFFF' : colors.primary} />
      </View>
      <View style={loginStyles.roleTextBlock}>
        <Text style={[loginStyles.roleTitle, isActive && loginStyles.roleTextActive]} numberOfLines={1}>
          {t(option.titleKey)}
        </Text>
        <Text
          style={[loginStyles.roleDescription, isActive && loginStyles.roleTextActive]}
          numberOfLines={2}
        >
          {t(option.descriptionKey)}
        </Text>
      </View>
      <View style={[loginStyles.roleCheck, isActive && loginStyles.roleCheckActive]}>
        {isActive && <Check size={16} color="#FFFFFF" />}
      </View>
    </TouchableOpacity>
  );
}
