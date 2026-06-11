// src/components/common/LoadingSpinner.tsx
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../constants/colors';

interface LoadingSpinnerProps {
  visible: boolean;
  text?: string;
  transparent?: boolean;
}

export default function LoadingSpinner({
  visible,
  text,
  transparent = true,
}: LoadingSpinnerProps) {
  const { t } = useTranslation();
  const displayText = text ?? t('common.loading.default');

  if (!visible) return null;

  return (
    <Modal transparent={transparent} animationType="fade" visible={visible}>
      <View style={styles.overlay}>
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.spinnerContainer}
        >
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.text}>{displayText}</Text>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerContainer: {
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  text: {
    marginTop: 12,
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});
