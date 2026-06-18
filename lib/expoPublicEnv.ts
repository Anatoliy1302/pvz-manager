/**
 * Читает EXPO_PUBLIC_* из process.env (Metro) или extra (EAS / app.config.js).
 */
import Constants from 'expo-constants';

type Extra = Record<string, unknown> | undefined;

function readExtra(key: string): string | undefined {
  const extra = Constants.expoConfig?.extra as Extra;
  const value = extra?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function getExpoPublicEnv(key: string): string | undefined {
  const fromProcess = process.env[key];
  if (typeof fromProcess === 'string' && fromProcess.length > 0) {
    return fromProcess.trim();
  }
  return readExtra(key);
}

export function requireExpoPublicEnv(key: string): string {
  const value = getExpoPublicEnv(key);
  if (!value) {
    throw new Error(`Missing ${key}. Add it to .env and restart Metro (npx expo start -c).`);
  }
  return value;
}

export function isValidSupabasePublishableKey(key: string): boolean {
  return key.startsWith('sb_publishable_') || (key.startsWith('eyJ') && key.length > 80);
}
