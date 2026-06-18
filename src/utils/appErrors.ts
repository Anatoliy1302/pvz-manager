import { t } from '../i18n';
import {
  AuthRequestTimeoutError,
  NetworkError,
  isRetryableFetchError,
} from '../../lib/supabaseAuthDirect';
import { formatSupabaseAuthError, isAuthNetworkOrTimeoutError } from '../services/SupabaseAuthService';

export type AppErrorKind = 'network' | 'supabase' | 'validation' | 'unknown';

export class ValidationError extends Error {
  readonly kind = 'validation' as const;
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super('validation_error');
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

interface SupabaseLikeError {
  code?: string;
  message?: string;
  status?: number;
  details?: string;
}

function asSupabaseError(error: unknown): SupabaseLikeError | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as SupabaseLikeError;
  if (typeof candidate.message === 'string' && (candidate.code || candidate.status)) {
    return candidate;
  }
  return null;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isNetworkError(error: unknown): boolean {
  if (isAuthNetworkOrTimeoutError(error)) return true;
  if (error instanceof NetworkError || error instanceof AuthRequestTimeoutError) return true;
  if (error instanceof Error && isRetryableFetchError(error)) return true;

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('network_error') ||
    message.includes('offline') ||
    message.includes('internet') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('etimedout')
  );
}

export function resolveSupabaseError(error: unknown): string {
  const supabaseError = asSupabaseError(error);
  if (!supabaseError) {
    if (error instanceof Error) {
      const authMessage = formatSupabaseAuthError(error.message);
      if (authMessage !== error.message) return authMessage;
    }
    return t('alerts.supabase.generic');
  }

  const code = supabaseError.code ?? '';
  const message = (supabaseError.message ?? '').toLowerCase();

  if (
    code === 'PGRST301' ||
    message.includes('jwt expired') ||
    message.includes('invalid jwt') ||
    supabaseError.status === 401
  ) {
    return t('alerts.supabase.sessionExpired');
  }

  if (code === '42501' || message.includes('permission denied') || supabaseError.status === 403) {
    return t('alerts.supabase.permissionDenied');
  }

  if (code === 'PGRST116' || message.includes('0 rows') || supabaseError.status === 404) {
    return t('alerts.supabase.notFound');
  }

  if (code === '23505' || message.includes('duplicate key')) {
    return t('alerts.supabase.conflict');
  }

  if (code === '23503' || message.includes('foreign key')) {
    return t('alerts.supabase.relationError');
  }

  if (code === '22P02' || message.includes('invalid input syntax')) {
    return t('alerts.supabase.invalidData');
  }

  if (message.includes('rate limit') || message.includes('too many requests')) {
    return t('alerts.auth.rateLimit');
  }

  const authMessage = formatSupabaseAuthError(supabaseError.message ?? '');
  if (authMessage !== supabaseError.message) {
    return authMessage;
  }

  return t('alerts.supabase.generic');
}

export function classifyError(error: unknown): AppErrorKind {
  if (isValidationError(error)) return 'validation';
  if (isNetworkError(error)) return 'network';
  if (asSupabaseError(error)) return 'supabase';
  if (error instanceof Error) {
    const authMessage = formatSupabaseAuthError(error.message);
    if (authMessage !== error.message) return 'supabase';
  }
  return 'unknown';
}

export function resolveUserMessage(
  error: unknown,
  fallbackKey = 'alerts.network.saveFailed'
): string {
  if (isValidationError(error)) {
    const first = Object.values(error.fields)[0];
    return first ?? t('alerts.validation.fillAll');
  }

  if (isNetworkError(error)) {
    return t('alerts.network.offline');
  }

  const kind = classifyError(error);
  if (kind === 'supabase') {
    return resolveSupabaseError(error);
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return t(fallbackKey);
}
