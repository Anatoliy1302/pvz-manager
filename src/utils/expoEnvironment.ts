import Constants, { ExecutionEnvironment } from 'expo-constants';

/** Запущено ли приложение внутри Expo Go (не собственная сборка). */
export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  Constants.appOwnership === 'expo';
