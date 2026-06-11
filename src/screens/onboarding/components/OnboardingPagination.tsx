import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useOnboardingStyles } from '../useOnboardingStyles';
import { useThemedScreen } from '../../../hooks/useThemedScreen';

interface OnboardingPaginationProps {
  count: number;
  activeIndex: number;
}

export default function OnboardingPagination({ count, activeIndex }: OnboardingPaginationProps) {
  const styles = useOnboardingStyles();
  const { colors, screen } = useThemedScreen();
  const animatedWidths = useRef(
    Array.from({ length: count }, (_, index) => new Animated.Value(index === 0 ? 24 : 8))
  ).current;

  useEffect(() => {
    animatedWidths.forEach((value, index) => {
      Animated.spring(value, {
        toValue: activeIndex === index ? 24 : 8,
        useNativeDriver: false,
        friction: 8,
        tension: 80,
      }).start();
    });
  }, [activeIndex, animatedWidths]);

  return (
    <View style={styles.pagination}>
      {Array.from({ length: count }).map((_, index) => (
        <Animated.View
          key={index}
          style={[
            styles.paginationDot,
            {
              width: animatedWidths[index],
              backgroundColor: activeIndex === index ? colors.primary : screen.border,
            },
          ]}
        />
      ))}
    </View>
  );
}
