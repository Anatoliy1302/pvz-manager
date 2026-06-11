import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { useLoginStyles } from '../useLoginStyles';

interface LoginPinInputProps {
  pinCode: string;
  onChangePin: (value: string) => void;
  autoFocus?: boolean;
}

export default function LoginPinInput({ pinCode, onChangePin, autoFocus }: LoginPinInputProps) {
  const { styles: loginStyles } = useLoginStyles();

  return (
    <>
      <View style={loginStyles.pinContainer}>
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={[loginStyles.pinDot, pinCode.length > index && loginStyles.pinDotFilled]}
          >
            {pinCode.length > index && <View style={loginStyles.pinDotInner} />}
          </View>
        ))}
      </View>

      <View style={loginStyles.pinInputContainer}>
        <TextInput
          style={loginStyles.pinInput}
          value={pinCode}
          onChangeText={onChangePin}
          keyboardType="numeric"
          maxLength={4}
          secureTextEntry
          autoFocus={autoFocus}
        />
      </View>
    </>
  );
}
