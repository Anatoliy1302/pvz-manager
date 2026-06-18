import { Platform } from 'react-native';

/** Общие параметры производительности для FlatList со списками данных. */
export const FLAT_LIST_PERF = {
  windowSize: 5,
  maxToRenderPerBatch: 10,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: Platform.OS === 'android',
} as const;
