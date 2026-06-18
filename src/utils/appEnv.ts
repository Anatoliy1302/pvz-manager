export type AppEnv = 'production' | 'staging' | 'development';

/** production | staging — из EAS/env; development — Expo Go / Metro __DEV__. */
export function getAppEnv(): AppEnv {
  const configured = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (configured === 'staging') return 'staging';
  if (configured === 'production') return 'production';
  if (__DEV__) return 'development';
  return 'production';
}

export function isStagingLikeEnv(): boolean {
  return getAppEnv() !== 'production';
}
