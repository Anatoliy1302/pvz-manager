import React from 'react';
import { Text, View } from 'react-native';
import { useLoginStyles } from '../useLoginStyles';

interface LoginStepHeaderProps {
  title: string;
  subtitle: string;
  titleStyle?: object;
  subtitleStyle?: object;
}

export default function LoginStepHeader({
  title,
  subtitle,
  titleStyle,
  subtitleStyle,
}: LoginStepHeaderProps) {
  const { styles: loginStyles } = useLoginStyles();

  return (
    <View>
      <Text style={[loginStyles.title, titleStyle]}>{title}</Text>
      <Text style={[loginStyles.subtitle, subtitleStyle]}>{subtitle}</Text>
    </View>
  );
}
