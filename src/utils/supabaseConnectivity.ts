import NetInfo from '@react-native-community/netinfo';
import { directPingAuthHealth } from '../../lib/supabaseAuthDirect';
import {
  getExpoPublicEnv,
  requireExpoPublicEnv,
} from '../../lib/expoPublicEnv';

export interface SupabaseReachabilityResult {
  ok: boolean;
  host: string;
  isConnected: boolean | null;
  error?: string;
}

function getSupabaseHost(): string {
  const url = getExpoPublicEnv('EXPO_PUBLIC_SUPABASE_URL') ?? '';
  return url.replace(/^https:\/\//, '').split('/')[0];
}

/** Проверка сети и доступности Supabase Auth с устройства. */
export async function checkSupabaseReachability(): Promise<SupabaseReachabilityResult> {
  const host = getSupabaseHost();
  const net = await NetInfo.fetch();

  if (net.isConnected === false) {
    return {
      ok: false,
      host,
      isConnected: false,
      error: 'offline',
    };
  }

  try {
    requireExpoPublicEnv('EXPO_PUBLIC_SUPABASE_URL');
    requireExpoPublicEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  } catch (error) {
    return {
      ok: false,
      host,
      isConnected: net.isConnected,
      error: error instanceof Error ? error.message : 'missing_env',
    };
  }

  const ok = await directPingAuthHealth();
  return {
    ok,
    host,
    isConnected: net.isConnected,
    ...(ok ? {} : { error: 'health_check_failed' }),
  };
}

export function getSupabaseHostForDisplay(): string {
  return getSupabaseHost() || 'supabase.co';
}
