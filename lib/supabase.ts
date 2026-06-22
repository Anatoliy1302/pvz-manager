import { Platform } from 'react-native';
import { setupURLPolyfill } from 'react-native-url-polyfill';
import { getApiUrl } from '../config/api';
import { pingApiHealth } from './authApi';

if (Platform.OS !== 'web') {
  setupURLPolyfill();
}

type QueryResult = { data: unknown; error: null; count?: number | null };

function createQueryBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  const emptyResult = async (): Promise<QueryResult> => ({ data: null, error: null });
  const emptyList = async (): Promise<QueryResult> => ({ data: [], error: null });

  builder.select = chain;
  builder.insert = chain;
  builder.update = chain;
  builder.upsert = chain;
  builder.delete = chain;
  builder.eq = chain;
  builder.neq = chain;
  builder.in = chain;
  builder.is = chain;
  builder.or = chain;
  builder.order = chain;
  builder.limit = chain;
  builder.range = chain;
  builder.single = emptyResult;
  builder.maybeSingle = emptyResult;
  builder.then = (resolve: (value: QueryResult) => void) =>
    Promise.resolve(emptyList()).then(resolve);

  return builder;
}

/** Заглушка Supabase-клиента — данные пока локально, auth через custom API. */
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    setSession: async () => ({ data: { session: null }, error: null }),
    refreshSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: () => undefined } },
    }),
  },
  from: () => createQueryBuilder(),
  rpc: async () => ({ data: null, error: null }),
  channel: () => ({
    on: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }),
    subscribe: () => ({ unsubscribe: () => undefined }),
  }),
  removeChannel: async () => undefined,
};

export function getSupabaseProjectHost(): string {
  return getApiUrl().replace(/^https?:\/\//, '').split('/')[0];
}

export function getSupabaseAuthStorageKey(): string {
  return 'pvz_auth_session';
}

export async function pingSupabaseAuth(): Promise<boolean> {
  return pingApiHealth();
}

export function getSupabaseEnvDiagnostics(): {
  urlConfigured: boolean;
  keyConfigured: boolean;
  host: string;
} {
  return {
    urlConfigured: true,
    keyConfigured: true,
    host: getSupabaseProjectHost(),
  };
}
