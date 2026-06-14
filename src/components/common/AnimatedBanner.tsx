import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
  Easing,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SHEEN_CYCLE_MS = 5200;
const SHIMMER_CYCLE_MS = 6800;

type GradientColors = readonly [string, string, ...string[]];

interface AnimatedBannerProps {
  children: React.ReactNode;
  gradientColors?: GradientColors;
  onPress?: () => void;
  style?: any;
  delay?: number;
  height?: number;
}

function AnimatedGradientBackground({
  gradientColors,
}: {
  gradientColors: GradientColors;
}) {
  const sheenScale = Platform.OS === 'android' ? 0.72 : 1;
  const [sheenPhase, setSheenPhase] = useState(0);
  const [shimmerPhase, setShimmerPhase] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(Date.now());
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    startRef.current = Date.now();

    const tick = (now: number) => {
      if (now - lastUpdateRef.current >= 32) {
        const elapsed = now - startRef.current;
        setSheenPhase((elapsed % SHEEN_CYCLE_MS) / SHEEN_CYCLE_MS);
        setShimmerPhase((elapsed % SHIMMER_CYCLE_MS) / SHIMMER_CYCLE_MS);
        lastUpdateRef.current = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const sheen1Opacity = (0.18 + Math.sin(sheenPhase * Math.PI * 2) * 0.14) * sheenScale;
  const sheen2Opacity = (0.14 + Math.sin(sheenPhase * Math.PI * 2 + Math.PI) * 0.12) * sheenScale;

  const shimmerWindow = 0.28;
  const shimmerStart = 0.62;
  const shimmerLocal =
    shimmerPhase >= shimmerStart && shimmerPhase <= shimmerStart + shimmerWindow
      ? (shimmerPhase - shimmerStart) / shimmerWindow
      : -1;
  const shimmerOpacity =
    shimmerLocal >= 0 ? Math.sin(shimmerLocal * Math.PI) * 0.35 * sheenScale : 0;
  const shimmerX =
    shimmerLocal >= 0 ? -SCREEN_WIDTH * 0.3 + shimmerLocal * SCREEN_WIDTH * 1.6 : -SCREEN_WIDTH;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={gradientColors}
        locations={[0, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.sheenLayer, { opacity: sheen1Opacity }]}>
        <LinearGradient
          colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={[styles.sheenLayer, { opacity: sheen2Opacity }]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {shimmerOpacity > 0.01 && (
        <View
          style={[
            styles.shimmer,
            {
              opacity: shimmerOpacity,
              transform: [{ translateX: shimmerX }, { rotate: '14deg' }],
            },
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.55)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.shimmerGradient}
          />
        </View>
      )}

      <View style={styles.glassHighlight} />
    </View>
  );
}

export default function AnimatedBanner({
  children,
  gradientColors,
  onPress,
  style,
  delay = 0,
  height: customHeight,
}: AnimatedBannerProps) {
  const { colors: themeColors } = useTheme();
  const resolvedGradient =
    gradientColors ??
    ([themeColors.primary, themeColors.primaryDark] as GradientColors);
  const bannerHeight = customHeight ?? 160;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const scaleAnim = useRef(new Animated.Value(0.97)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 480,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 68,
        friction: 9,
        delay,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 68,
        friction: 9,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, fadeAnim, scaleAnim, slideAnim]);

  const content = (
    <View style={[styles.banner, style, { minHeight: bannerHeight }]}>
      <AnimatedGradientBackground gradientColors={resolvedGradient} />
      <View style={styles.contentLayer}>{children}</View>
    </View>
  );

  const animatedStyle = {
    opacity: fadeAnim,
    transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
  };

  if (onPress) {
    return (
      <Animated.View style={animatedStyle}>
        <TouchableOpacity onPress={onPress} activeOpacity={0.96}>
          {content}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return <Animated.View style={animatedStyle}>{content}</Animated.View>;
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 24,
    padding: 20,
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: Platform.OS === 'ios' ? 0.26 : 0.12,
    shadowRadius: 16,
    elevation: Platform.OS === 'android' ? 4 : 8,
    overflow: 'hidden',
    position: 'relative',
  },
  contentLayer: {
    position: 'relative',
    zIndex: 2,
  },
  sheenLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  glassHighlight: {
    position: 'absolute',
    top: 0,
    left: 22,
    right: 22,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.32)',
    borderRadius: 1,
    zIndex: 1,
  },
  shimmer: {
    position: 'absolute',
    top: -36,
    left: 0,
    width: 96,
    height: '170%',
    zIndex: 1,
  },
  shimmerGradient: {
    flex: 1,
  },
});
