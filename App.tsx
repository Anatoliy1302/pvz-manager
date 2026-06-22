import React, { useEffect, useMemo } from 'react';
import { InteractionManager, LogBox } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme, Theme as NavTheme } from '@react-navigation/native';
import { navigationRef } from './src/navigation/navigationRef';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import './src/i18n';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { LanguageProvider } from './src/context/LanguageContext';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/common/ErrorBoundary';
import PaymentReturnHandler from './src/components/common/PaymentReturnHandler';
import OfflineBanner from './src/components/common/OfflineBanner';
import { ToastProvider } from './src/components/common/Toast';
import { ErrorHandlerProvider } from './src/context/ErrorHandlerContext';
import { QueryProvider } from './src/providers/QueryProvider';
import { PAYMENT_DEEP_LINK_SCHEME } from './src/constants/paymentDeepLink';
import SyncStatusBanner from './src/components/common/SyncStatusBanner';
import notificationService from './src/services/NotificationService';
import analyticsService from './src/services/AnalyticsService';
import { AnalyticsEvents } from './src/services/analytics/events';
import { runFullMigration } from './src/utils/migrationHelpers';
import * as SecureStore from 'expo-secure-store';

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications) functionality',
  '`expo-notifications` functionality is not fully supported in Expo Go',
  'Value being stored in SecureStore is larger than 2048 bytes',
]);

const linking = {
  prefixes: [`${PAYMENT_DEEP_LINK_SCHEME}://`],
  config: {
    screens: {
      Subscription: 'payment/success',
      DeleteAccount: 'account/delete',
    },
  },
};

function RootNavigation() {
  const { theme, colors } = useTheme();

  const navigationTheme: NavTheme = useMemo(() => {
    const base = theme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.card,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [theme, colors]);

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <OfflineBanner />
      <SyncStatusBanner />
      <NavigationContainer
        ref={navigationRef}
        theme={navigationTheme}
        linking={linking}
        onStateChange={() => {
          if (!navigationRef.isReady()) return;
          const route = navigationRef.getCurrentRoute();
          const screenName = route?.name;
          if (!screenName) return;
          analyticsService.setCurrentScreen(screenName);
          analyticsService.track(AnalyticsEvents.SCREEN_VIEW, { screen: screenName });
        }}
      >
        <AppNavigator />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  useEffect(() => {
    analyticsService.setAuthFlushPaused(true);

    const task = InteractionManager.runAfterInteractions(() => {
      void notificationService.initialize();
      analyticsService.track(AnalyticsEvents.APP_OPEN);

      const runMigrations = async () => {
        try {
          const userRaw = await SecureStore.getItemAsync('user');
          const pvzRaw = await SecureStore.getItemAsync('pvz');
          if (userRaw) {
            const user = JSON.parse(userRaw);
            const pvz = pvzRaw ? JSON.parse(pvzRaw) : null;
            await runFullMigration(user.id, pvz?.id);
          }
        } catch (error) {
          console.error('Ошибка миграции при запуске:', error);
        }
      };

      void runMigrations();

      setTimeout(() => {
        analyticsService.setAuthFlushPaused(false);
      }, 4_000);
    });

    return () => {
      task.cancel();
      analyticsService.setAuthFlushPaused(false);
    };
  }, []);

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <LanguageProvider>
          <ThemeProvider>
            <ErrorBoundary>
              <ToastProvider>
                <ErrorHandlerProvider>
                  <AuthProvider>
                    <PaymentReturnHandler />
                    <RootNavigation />
                  </AuthProvider>
                </ErrorHandlerProvider>
              </ToastProvider>
            </ErrorBoundary>
          </ThemeProvider>
        </LanguageProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}

