import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';

interface FormFieldErrorProps {
  message?: string;
}

export default function FormFieldError({ message }: FormFieldErrorProps) {
  if (!message) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 4,
  },
  text: {
    fontSize: 12,
    color: colors.danger,
  },
});
