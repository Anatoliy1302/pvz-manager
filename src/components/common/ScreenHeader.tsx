import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '../../constants/colors';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function ScreenHeader({ title, onBack, right, style }: ScreenHeaderProps) {
  return (
    <LinearGradient colors={[colors.primary, colors.primaryDark]} style={[styles.header, style]}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.sideSlot} accessibilityLabel="Назад">
          <ChevronLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
      ) : (
        <View style={styles.sideSlot} />
      )}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.sideSlot, styles.rightSlot]}>{right}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  sideSlot: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightSlot: {
    minWidth: 40,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
