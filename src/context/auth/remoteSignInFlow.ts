import { User, UserRole, Pvz } from '../../types/user';
import { normalizeEmail } from '../../utils/loginIdentifier';
import { t } from '../../i18n';
import {
  linkSupabaseProfile,
  migrateLocalUserId,
  isSupabaseProviderConfigError,
  ensureSupabaseClientSession,
  getSupabaseSessionUserId,
  getCachedSessionUserId,
  resolveAuthAccessToken,
  AuthProfilePayload,
} from '../../services/SupabaseAuthService';
import { fetchOwnerPvzsForSessionUser } from '../../services/SupabasePvzService';
import DataService from '../../services/DataService';
import { userMemory } from './userMemoryStore';
import { ensureLocalOwnerRecord, resolveOwnerPvzsForLogin } from './ownerOps';

export type OwnerPostOtpRoute = 'pin' | 'selectPvz' | 'createPvz';

export interface OwnerPostOtpResolution {
  route: OwnerPostOtpRoute;
  pvzList: Pvz[];
  ownerId: string | null;
}

/** Маршрут после email OTP: PIN, выбор ПВЗ или создание нового. */
export async function resolveOwnerRouteAfterEmailOtp(
  normalizedEmail: string,
  hasLocalPin: boolean,
  sessionUserIdOverride?: string | null,
  sessionAccessTokenOverride?: string | null
): Promise<OwnerPostOtpResolution> {
  const email = normalizeEmail(normalizedEmail);
  const { pvzList, ownerId, localOwner } = await resolveOwnerPvzsForLogin(
    email,
    sessionUserIdOverride,
    sessionAccessTokenOverride
  );

  if (pvzList.length > 0) {
    const resolvedOwnerId = ownerId ?? pvzList[0].ownerId;
    if (resolvedOwnerId) {
      await ensureLocalOwnerRecord(email, resolvedOwnerId, pvzList[0].id);
    }
    return { route: 'selectPvz', pvzList, ownerId: resolvedOwnerId };
  }

  const sessionOwnerId =
    ownerId ??
    sessionUserIdOverride ??
    getCachedSessionUserId() ??
    (await getSupabaseSessionUserId());

  if (sessionOwnerId) {
    const accessToken = sessionAccessTokenOverride ?? (await resolveAuthAccessToken());
    const remoteRetry = await fetchOwnerPvzsForSessionUser(
      sessionOwnerId,
      accessToken ?? undefined
    );
    if (remoteRetry.length > 0) {
      await ensureLocalOwnerRecord(email, sessionOwnerId, remoteRetry[0].id);
      for (const pvz of remoteRetry) {
        await DataService.savePvz(pvz);
      }
      return { route: 'selectPvz', pvzList: remoteRetry, ownerId: sessionOwnerId };
    }
  }

  if (localOwner && hasLocalPin) {
    return { route: 'pin', pvzList, ownerId: localOwner.id };
  }

  if (localOwner) {
    return { route: 'pin', pvzList: [], ownerId: localOwner.id };
  }

  return { route: 'createPvz', pvzList: [], ownerId: sessionOwnerId ?? null };
}

export async function linkRemoteProfile(sessionUser: User, loginKey: string): Promise<User> {
  if (!(await ensureSupabaseClientSession())) {
    return sessionUser;
  }

  try {
    const oldId = sessionUser.id;
    const isOwner = sessionUser.role === 'owner';
    const profile: AuthProfilePayload = {
      name: sessionUser.name,
      phone: isOwner ? '' : loginKey.replace(/[^0-9]/g, ''),
      email: isOwner ? normalizeEmail(loginKey) : sessionUser.email || undefined,
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
