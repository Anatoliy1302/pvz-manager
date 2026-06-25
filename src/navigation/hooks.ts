import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootStackNavigationProp, RootStackParamList } from './types';

export function useAppNavigation(): RootStackNavigationProp {
  return useNavigation<RootStackNavigationProp>();
}

export function useAppRoute<T extends keyof RootStackParamList>(): RouteProp<
  RootStackParamList,
  T
> {
  return useRoute<RouteProp<RootStackParamList, T>>();
}
