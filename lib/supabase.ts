import { Platform } from 'react-native';
import { setupURLPolyfill } from 'react-native-url-polyfill';
import { createClient } from '@supabase/supabase-js';
import {
  secureStorageAdapter,
  migrateSupabaseAuthFromAsyncStorage,
} from '../src/utils/secureStorageAdapter';
import { directPingAuthHealth } from './supabaseAuthDirect';
import { supabaseFetch } from './supabaseFetch';
import {
  getExpoPublicEnv,
  requireExpoPublicEnv,
  isValidSupabasePublishableKey,
} from './expoPublicEnv';

if (Platform.OS !== 'web') {
  setupURLPolyfill();
}

const supabaseUrl = requireExpoPublicEnv('EXPO_PUBLIC_SUPABASE_URL');
if (!supabaseUrl.startsWith('https://')) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL must use HTTPS in production');
}
const supabasePublishableKey = requireExpoPublicEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

if (!isValidSupabasePublishableKey(supabasePublishableKey)) {
  throw new Error(
    'Supabase: EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY должен быть sb_publishable_... или legacy anon JWT (eyJ...)'
  );
}

const supabaseHost = supabaseUrl.replace(/^https:\/\//, '').split('/')[0];

if (__DEV__) {
  const envSource = process.env.EXPO_PUBLIC_SUPABASE_URL ? 'process.env' : 'expo.extra';
  console.info(`[Supabase] Host: ${supabaseHost} (${envSource})`);
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: supabaseFetch,
  },
});

void migrateSupabaseAuthFromAsyncStorage();

export function getSupabaseProjectHost(): string {
  return supabaseHost;
}

export function getSupabaseAuthStorageKey(): string {
  return `sb-${supabaseHost.split('.')[0]}-auth-token`;
}

/** Быстрая проверка доступности Supabase Auth (для диагностики сети). */
export async function pingSupabaseAuth(): Promise<boolean> {
  return directPingAuthHealth();
}

export function getSupabaseEnvDiagnostics(): {
  urlConfigured: boolean;
  keyConfigured: boolean;
  host: string;
} {
  return {
    urlConfigured: Boolean(getExpoPublicEnv('EXPO_PUBLIC_SUPABASE_URL')),
    keyConfigured: Boolean(getExpoPublicEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')),
    host: supabaseHost,
  };
}
