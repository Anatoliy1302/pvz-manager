// Редирект: запрос аванса объединён с экраном «Мои финансы»
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';

export default function AdvanceRequestScreen({ navigation }: { navigation: { replace: (name: string, params?: object) => void } }) {
  useEffect(() => {
    navigation.replace('EmployeeFinance', { openAdvanceModal: true });
  }, [navigation]);

  return (
    <ThemedSafeAreaView>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    </ThemedSafeAreaView>
  );
}
