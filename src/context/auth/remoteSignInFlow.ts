import { User, UserRole } from '../../types/user';
import { t } from '../../i18n';
import {
  linkSupabaseProfile,
  migrateLocalUserId,
  isSupabaseProviderConfigError,
  hasSupabaseSession,
  AuthProfilePayload,
} from '../../services/SupabaseAuthService';
import { userMemory } from './userMemoryStore';

export async function linkRemoteProfile(sessionUser: User, cleanPhone: string): Promise<User> {
  if (!(await hasSupabaseSession())) {
    return sessionUser;
  }

  try {
    const oldId = sessionUser.id;
    const profile: AuthProfilePayload = {
      name: sessionUser.name,
      phone: cleanPhone,
      role: sessionUser.role,
      pvzId: sessionUser.pvzId,
      pvzIds: sessionUser.pvzIds,
      permissionLevel: sessionUser.permissionLevel,
      permissions: sessionUser.permissions,
      status: sessionUser.status,
    };

    const supabaseUserId = await linkSupabaseProfile(profile);

    if (supabaseUserId && oldId !== supabaseUserId) {
      await migrateLocalUserId(oldId, supabaseUserId, sessionUser.role as UserRole);
      await userMemory.replaceUserId(oldId, supabaseUserId);
      return { ...sessionUser, id: supabaseUserId };
    }
  } catch (supabaseError) {
    if (isSupabaseProviderConfigError(supabaseError)) {
      console.warn('Supabase Auth: провайдер не настроен, вход только локально.');
      return sessionUser;
    }
    console.error('Supabase Auth:', supabaseError);
    throw supabaseError instanceof Error
      ? supabaseError
      : new Error(t('alerts.auth.linkProfileFailed'));
  }

  return sessionUser;
}
