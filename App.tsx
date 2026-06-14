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
import { ToastProvider } from './src/components/common/Toast';
import SyncStatusBanner from './src/components/common/SyncStatusBanner';
import notificationService from './src/services/NotificationService';
import { runFullMigration } from './src/utils/migrationHelpers';
import * as SecureStore from 'expo-secure-store';

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications) functionality',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

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
      <SyncStatusBanner />
      <NavigationContainer ref={navigationRef} theme={navigationTheme}>
        <AppNavigator />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void notificationService.initialize();

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
    });

    return () => task.cancel();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <LanguageProvider>
          <ThemeProvider>
            <ToastProvider>
              <AuthProvider>
                <RootNavigation />
              </AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
"// test comment" 
