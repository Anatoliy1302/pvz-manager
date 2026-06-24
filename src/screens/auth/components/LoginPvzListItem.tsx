import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Building2, Check } from 'lucide-react-native';
import { colors } from '../../../constants/colors';
import { useLoginStyles } from '../useLoginStyles';

interface LoginPvzListItemProps {
  name: string;
  subtitle: string;
  isActive: boolean;
  onPress: () => void;
}

export default function LoginPvzListItem({
  name,
  subtitle,
  isActive,
  onPress,
}: LoginPvzListItemProps) {
  const { styles: loginStyles, screen } = useLoginStyles();

  return (
    <TouchableOpacity
      style={[
        loginStyles.pvzItem,
        !isActive && { backgroundColor: screen.card, borderColor: screen.border },
        isActive && loginStyles.pvzItemActive,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${subtitle}`}
      accessibilityState={{ selected: isActive }}
      testID={`login-pvz-item-${name}`}
    >
      <Building2 size={20} color={isActive ? '#FFFFFF' : colors.primary} />
      <View style={loginStyles.pvzItemInfo}>
        <Text style={[loginStyles.pvzItemName, isActive && loginStyles.pvzItemTextActive]}>
          {name}
        </Text>
        <Text style={[loginStyles.pvzItemAddress, isActive && loginStyles.pvzItemTextActive]}>
          {subtitle}
        </Text>
      </View>
      {isActive && <Check size={20} color="#FFFFFF" />}
    </TouchableOpacity>
  );
}
