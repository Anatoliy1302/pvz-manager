import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useLoginStyles } from '../useLoginStyles';
import PinNumericKeypad from './PinNumericKeypad';
import { colors } from '../../../constants/colors';

interface LoginPinInputProps {
  pinCode: string;
  onChangePin: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}

export default function LoginPinInput({
  pinCode,
  onChangePin,
  disabled = false,
  hasError = false,
}: LoginPinInputProps) {
  const { styles: loginStyles } = useLoginStyles();
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hasError) return;

    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [hasError, shakeAnim]);

  const appendDigit = (digit: string) => {
    if (pinCode.length >= 4) return;
    onChangePin(`${pinCode}${digit}`);
  };

  const backspace = () => {
    if (pinCode.length === 0) return;
    onChangePin(pinCode.slice(0, -1));
  };

  return (
    <>
      <Animated.View
        style={[loginStyles.pinContainer, { transform: [{ translateX: shakeAnim }] }]}
      >
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={[
              loginStyles.pinDot,
              pinCode.length > index && loginStyles.pinDotFilled,
              hasError && { borderColor: colors.danger, borderWidth: 2 },
            ]}
          >
            {pinCode.length > index && (
              <View
                style={[
                  loginStyles.pinDotInner,
                  hasError && { backgroundColor: colors.danger },
                ]}
              />
            )}
          </View>
        ))}
      </Animated.View>

      <PinNumericKeypad onDigit={appendDigit} onBackspace={backspace} disabled={disabled} />
    </>
  );
}
