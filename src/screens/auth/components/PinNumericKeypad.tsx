import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Delete } from 'lucide-react-native';
import { useLoginStyles } from '../useLoginStyles';

interface PinNumericKeypadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

export default function PinNumericKeypad({
  onDigit,
  onBackspace,
  disabled = false,
}: PinNumericKeypadProps) {
  const { styles: loginStyles, screen } = useLoginStyles();

  return (
    <View style={loginStyles.pinKeypad}>
      {ROWS.map((row) => (
        <View key={row.join('-')} style={loginStyles.pinKeypadRow}>
          {row.map((digit) => (
            <Pressable
              key={digit}
              style={({ pressed }) => [
                loginStyles.pinKeypadKey,
                pressed && loginStyles.pinKeypadKeyPressed,
                disabled && loginStyles.pinKeypadKeyDisabled,
              ]}
              disabled={disabled}
              onPress={() => onDigit(digit)}
              accessibilityRole="button"
              accessibilityLabel={digit}
            >
              <Text style={loginStyles.pinKeypadKeyText}>{digit}</Text>
            </Pressable>
          ))}
        </View>
      ))}

      <View style={loginStyles.pinKeypadRow}>
        <View style={loginStyles.pinKeypadKeySpacer} />
        <Pressable
          style={({ pressed }) => [
            loginStyles.pinKeypadKey,
            pressed && loginStyles.pinKeypadKeyPressed,
            disabled && loginStyles.pinKeypadKeyDisabled,
          ]}
          disabled={disabled}
          onPress={() => onDigit('0')}
          accessibilityRole="button"
          accessibilityLabel="0"
        >
          <Text style={loginStyles.pinKeypadKeyText}>0</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            loginStyles.pinKeypadKey,
            loginStyles.pinKeypadKeyAction,
            pressed && loginStyles.pinKeypadKeyPressed,
            disabled && loginStyles.pinKeypadKeyDisabled,
          ]}
          disabled={disabled}
          onPress={onBackspace}
          accessibilityRole="button"
          accessibilityLabel="Backspace"
        >
          <Delete size={22} color={screen.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}
