import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types/user';
import ThemedSafeAreaView from '../components/common/ThemedSafeAreaView';

export function withRoleGuard<P extends object>(
  Component: React.ComponentType<P>,
  allowedRoles: UserRole[]
) {
  return function RoleGuardedScreen(props: P) {
    const { user } = useAuth();

    if (!user || !allowedRoles.includes(user.role)) {
      return (
        <ThemedSafeAreaView style={styles.container}>
          <Text style={styles.title}>Нет доступа</Text>
          <Text style={styles.subtitle}>У вашей роли нет прав для этого раздела.</Text>
        </ThemedSafeAreaView>
      );
    }

    return <Component {...props} />;
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
