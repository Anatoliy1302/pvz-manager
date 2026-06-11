import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { EmployeePermissions } from '../../types/user';
import EmptyState from './EmptyState';
import ThemedSafeAreaView from './ThemedSafeAreaView';

interface PermissionGateProps {
  permission?: keyof EmployeePermissions;
  anyOf?: (keyof EmployeePermissions)[];
  navigation?: { goBack: () => void; navigate: (screen: string) => void };
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** Для вкладок: кнопка «На главную» вместо «Назад» */
  fallbackScreen?: string;
  /** Пропустить проверку только для владельца */
  allowStaff?: boolean;
}

export default function PermissionGate({
  permission,
  anyOf,
  navigation,
  title,
  description,
  children,
  fallbackScreen,
  allowStaff = true,
}: PermissionGateProps) {
  const { t } = useTranslation();
  const { hasPermission, user } = useAuth();

  const resolvedTitle = title ?? t('common.access.denied');
  const resolvedDescription = description ?? t('common.access.deniedSection');

  if (allowStaff && user?.role === 'owner') {
    return <>{children}</>;
  }

  const allowed = anyOf
    ? anyOf.some((p) => hasPermission(p))
    : permission
      ? hasPermission(permission)
      : true;

  if (!allowed) {
    const handlePress = () => {
      if (fallbackScreen && navigation) {
        navigation.navigate(fallbackScreen);
      } else if (navigation?.goBack) {
        navigation.goBack();
      }
    };

    return (
      <ThemedSafeAreaView style={styles.container}>
        <View style={styles.content}>
          <EmptyState
            icon={Lock}
            title={resolvedTitle}
            description={resolvedDescription}
            buttonText={
              fallbackScreen
                ? t('common.actions.goHome')
                : navigation
                  ? t('common.actions.back')
                  : undefined
            }
            onButtonPress={navigation ? handlePress : undefined}
          />
        </View>
      </ThemedSafeAreaView>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center' },
});
