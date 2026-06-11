// Перенаправление на актуальный экран заявок
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { colors } from '../../constants/colors';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';

export default function MyRequestsScreen({ navigation }: any) {
  useEffect(() => {
    navigation.replace('Requests');
  }, [navigation]);

  return (
    <ThemedSafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </ThemedSafeAreaView>
  );
}
