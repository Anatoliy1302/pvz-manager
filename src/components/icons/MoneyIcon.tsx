// src/components/icons/MoneyIcon.tsx
import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

export default function MoneyIcon({ size = 24, color = "#000000" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 6v12" />
      <Path d="M8 12h8" />
    </Svg>
  );
}