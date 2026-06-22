import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';

interface ThemedSafeAreaViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
}

export default function ThemedSafeAreaView({ children, style, edges }: ThemedSafeAreaViewProps) {
  const { colors } = useTheme();
  const backgroundColor = colors?.background ?? '#F8F9FA';

  return (
    <SafeAreaView
      style={[{ flex: 1, backgroundColor }, style]}
      edges={edges}
    >
      {children}
    </SafeAreaView>
  );
}
