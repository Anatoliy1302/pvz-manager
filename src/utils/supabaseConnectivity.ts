import NetInfo from '@react-native-community/netinfo';
import { getApiUrl } from '../../config/api';
import { pingApiHealth } from '../../lib/authApi';

export interface SupabaseReachabilityResult {
  ok: boolean;
  host: string;
  isConnected: boolean | null;
  error?: string;
}

function getApiHost(): string {
  return getApiUrl().replace(/^https?:\/\//, '').split('/')[0];
}

/** Проверка сети и доступности VPS API. */
export async function checkSupabaseReachability(): Promise<SupabaseReachabilityResult> {
  const host = getApiHost();
  const net = await NetInfo.fetch();

  if (net.isConnected === false) {
    return {
      ok: false,
      host,
      isConnected: false,
      error: 'offline',
    };
  }

  const ok = await pingApiHealth();
  return {
    ok,
    host,
    isConnected: net.isConnected,
    ...(ok ? {} : { error: 'health_check_failed' }),
  };
}

export function getSupabaseHostForDisplay(): string {
  return getApiHost() || 'api';
}
