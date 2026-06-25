// src/screens/onboarding/OnboardingScreen.tsx
import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { FLAT_LIST_PERF } from '../../constants/flatListPerf';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { ChevronRight, LogIn } from 'lucide-react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useThemedScreen } from '../../hooks/useThemedScreen';
import { colors } from '../../constants/colors';
import { ONBOARDING_SLIDES, type OnboardingSlide } from './onboardingSlides';
import { useOnboardingStyles } from './useOnboardingStyles';
import OnboardingSlideContent from './components/OnboardingSlideContent';
import OnboardingPagination from './components/OnboardingPagination';
import GdprConsentBanner from '../../components/legal/GdprConsentBanner';
import type { RootStackScreenProps } from '../../navigation/types';

const { width } = Dimensions.get('window');

type OnboardingScreenProps = RootStackScreenProps<'Onboarding'>;

export default function OnboardingScreen({ navigation }: OnboardingScreenProps) {
  const { t } = useTranslation();
  const { theme } = useThemedScreen();
  const styles = useOnboardingStyles();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<OnboardingSlide>>(null);

  const isLastSlide = currentIndex === ONBOARDING_SLIDES.length - 1;

  const handleFinish = useCallback(async () => {
    await SecureStore.setItemAsync('onboarding_completed', 'true');
    navigation.replace('Login');
  }, [navigation]);

  const goToIndex = useCallback((index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setCurrentIndex(index);
  }, []);

  const handleNext = () => {
    if (isLastSlide) {
      handleFinish();
      return;
    }
    goToIndex(currentIndex + 1);
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  const renderItem = ({ item }: { item: OnboardingSlide }) => (
    <View style={styles.slide}>
      <OnboardingSlideContent slide={item} />
    </View>
  );

  return (
    <ThemedSafeAreaView style={styles.container}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />

      <View style={styles.topBar}>
        <Text style={styles.slideCounter}>
          {currentIndex + 1} / {ONBOARDING_SLIDES.length}
        </Text>
        {!isLastSlide ? (
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleFinish}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.skipA11y')}
          >
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipButton} />
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={ONBOARDING_SLIDES}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
          }, 100);
        }}
        {...FLAT_LIST_PERF}
      />

      <View style={styles.footer}>
        <OnboardingPagination count={ONBOARDING_SLIDES.length} activeIndex={currentIndex} />

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleNext}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={isLastSlide ? t('onboarding.loginA11y') : t('onboarding.nextA11y')}
        >
          <LinearGradient
            colors={
              isLastSlide
                ? [colors.success, '#1E7E34']
                : [colors.primary, colors.primaryDark]
            }
            style={isLastSlide ? styles.finishGradient : styles.primaryGradient}
          >
            {isLastSlide ? (
              <>
                <LogIn size={20} color="#FFFFFF" />
                <Text style={styles.primaryText}>{t('onboarding.login')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.primaryText}>{t('onboarding.next')}</Text>
                <ChevronRight size={20} color="#FFFFFF" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {isLastSlide ? (
          <GdprConsentBanner style={styles.privacyNote} />
        ) : null}
      </View>
    </ThemedSafeAreaView>
  );
}
