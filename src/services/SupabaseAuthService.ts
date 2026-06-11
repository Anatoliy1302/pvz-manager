import { supabase } from '../../lib/supabase';
import * as SecureStore from 'expo-secure-store';
import DataService from './DataService';
import SmsService from './SmsService';
import { User, UserRole, EmployeePermissions, defaultPermissions } from '../types/user';
import { toE164Phone } from '../utils/phoneHelpers';

/**
 * false — локальная заглушка SMS (удобно для разработки).
 * true  — реальный Supabase Phone OTP (Twilio и др.).
 * Включить в проде: EXPO_PUBLIC_USE_SUPABASE_PHONE_OTP=true в .env
 */
export const USE_SUPABASE_PHONE_OTP =
  process.env.EXPO_PUBLIC_USE_SUPABASE_PHONE_OTP === 'true';

export function usesSupabasePhoneOtp(): boolean {
  return USE_SUPABASE_PHONE_OTP;
}

export function getOtpCodeLength(): number {
  return USE_SUPABASE_PHONE_OTP ? 6 : 4;
}

export interface AuthProfilePayload {
  name: string;
  phone: string;
  role: UserRole;
  pvzId?: string;
  pvzIds?: string[];
  permissionLevel?: 'full' | 'restricted';
  permissions?: EmployeePermissions;
  status?: 'active' | 'pending' | 'blocked';
}

export function formatSupabaseAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('phone provider') && lower.includes('disabled')) {
    return (
      'В Supabase отключён вход по телефону. Включите: Dashboard → Authentication → ' +
      'Sign In / Providers → Phone → Enable Phone provider и настройте SMS (Twilio и др.).'
    );
  }
  if (lower.includes('email logins are disabled')) {
    return 'Вход по email отключён — приложение использует только SMS (Phone OTP).';
  }
  if (lower.includes('token has expired') || lower.includes('otp_expired')) {
    return 'Код из SMS истёк. Запросите новый.';
  }
  if (lower.includes('invalid otp') || lower.includes('invalid token')) {
    return 'Неверный код из SMS.';
  }
  return message;
}

/** Ошибка настройки Supabase — можно войти локально без облака. */
export function isSupabaseProviderConfigError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('phone provider') ||
    message.includes('sms provider') ||
    message.includes('signup is disabled') ||
    message.includes('email provider is disabled')
  );
}

function mapProfileRow(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    email: (row.email as string) || '',
    role: row.role as UserRole,
    status: (row.status as User['status']) || 'active',
    pvzId: (row.pvz_id as string) || undefined,
    pvzIds: (row.pvz_ids as string[]) || undefined,
    permissionLevel: (row.permission_level as User['permissionLevel']) || undefined,
    permissions: (row.permissions as EmployeePermissions) || { ...defaultPermissions },
    createdAt: (row.created_at as string) || new Date().toISOString(),
  };
}

export async function upsertProfile(userId: string, profile: AuthProfilePayload): Promise<void> {
  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      name: profile.name,
      phone: profile.phone,
      email: null,
      role: profile.role,
      pvz_id: profile.pvzId || null,
      pvz_ids: profile.pvzIds || [],
      permission_level: profile.permissionLevel || null,
      permissions: profile.permissions || defaultPermissions,
      status: profile.status || 'active',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchProfileUser(userId: string): Promise<User | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapProfileRow(data as Record<string, unknown>) : null;
}

export interface SendPhoneOtpResult {
  /** Код для экрана-заглушки (только в режиме разработки). */
  devCode?: string;
}

/** Отправить SMS-код (заглушка или Supabase Phone OTP). */
export async function sendPhoneOtp(cleanPhone: string): Promise<SendPhoneOtpResult> {
  if (!USE_SUPABASE_PHONE_OTP) {
    const code = SmsService.generateCode();
    await SmsService.sendSms(cleanPhone, code);
    return { devCode: code };
  }

  const phone = toE164Phone(cleanPhone);
  const { error } = await supabase.auth.signInWithOtp({ phone });

  if (error) {
    throw new Error(formatSupabaseAuthError(error.message));
  }

  return {};
}

/** Подтвердить код из SMS. В режиме Supabase создаёт сессию. */
export async function verifyPhoneOtp(cleanPhone: string, token: string): Promise<string> {
  if (!USE_SUPABASE_PHONE_OTP) {
    const isValid = await SmsService.verifyCode(cleanPhone, token.trim());
    if (!isValid) {
      throw new Error('Неверный или истёкший код');
    }
    await SmsService.clearCode(cleanPhone);
    return '';
  }

  const phone = toE164Phone(cleanPhone);
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token: token.trim(),
    type: 'sms',
  });

  if (error) {
    throw new Error(formatSupabaseAuthError(error.message));
  }

  const userId = data.user?.id || data.session?.user?.id;
  if (!userId) {
    throw new Error('Supabase не вернул ID пользователя после проверки SMS');
  }

  return userId;
}

/**
 * Привязать активную Supabase-сессию к профилю приложения.
 * Вызывается после успешного OTP и локального выбора роли/ПВЗ.
 */
export async function linkSupabaseProfile(profile: AuthProfilePayload): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    return null;
  }

  await upsertProfile(session.user.id, profile);
  return session.user.id;
}

/** Перенос локального id на UUID Supabase (смены, ПВЗ, pvz_users). */
export async function migrateLocalUserId(oldId: string, newId: string, role: UserRole): Promise<void> {
  const { setUserIdMapping } = await import('../utils/supabaseHelpers');
  await setUserIdMapping(oldId, newId);

  const usersRaw = await SecureStore.getItemAsync('pvz_users');
  if (usersRaw) {
    const users = JSON.parse(usersRaw);
    const updated = users.map((u: User) => (u.id === oldId ? { ...u, id: newId } : u));
    await SecureStore.setItemAsync('pvz_users', JSON.stringify(updated));
  }

  if (role === 'owner') {
    const pvzs = await DataService.getPvzs();
    for (const p of pvzs) {
      if (p.ownerId === oldId) {
        await DataService.savePvz({ ...p, ownerId: newId });
      }
    }
  }

  const shiftsRaw = await SecureStore.getItemAsync('shifts');
  if (shiftsRaw) {
    const shifts = JSON.parse(shiftsRaw);
    const updatedShifts = shifts.map((s: { employeeId?: string }) =>
      s.employeeId === oldId ? { ...s, employeeId: newId } : s
    );
    await SecureStore.setItemAsync('shifts', JSON.stringify(updatedShifts));
  }

  const shiftRequestsRaw = await SecureStore.getItemAsync('all_shift_requests');
  if (shiftRequestsRaw) {
    const requests = JSON.parse(shiftRequestsRaw);
    const updatedRequests = requests.map((r: { employeeId?: string }) =>
      r.employeeId === oldId ? { ...r, employeeId: newId } : r
    );
    await SecureStore.setItemAsync('all_shift_requests', JSON.stringify(updatedRequests));
  }

  const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
  if (allInvitationsRaw) {
    const invitations = JSON.parse(allInvitationsRaw);
    const updatedInvitations = invitations.map((inv: { invitedBy?: string }) =>
      inv.invitedBy === oldId ? { ...inv, invitedBy: newId } : inv
    );
    await SecureStore.setItemAsync('all_invitations', JSON.stringify(updatedInvitations));
  }

  const ownerInvitationsRaw = await SecureStore.getItemAsync(`invitations_${oldId}`);
  if (ownerInvitationsRaw) {
    await SecureStore.setItemAsync(`invitations_${newId}`, ownerInvitationsRaw);
    await SecureStore.deleteItemAsync(`invitations_${oldId}`);
  }
}

export async function hasSupabaseSession(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return !!session?.user?.id;
}

export async function restoreSupabaseSession(): Promise<User | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user?.id) {
    return null;
  }

  return fetchProfileUser(session.user.id);
}

export async function signOutSupabase(): Promise<void> {
  await supabase.auth.signOut();
}

export function subscribeToAuthChanges(onChange: () => void): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(() => {
    onChange();
  });
  return () => subscription.unsubscribe();
}
