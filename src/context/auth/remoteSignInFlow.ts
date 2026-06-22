import { User, UserRole, Pvz } from '../../types/user';
import { normalizeEmail } from '../../utils/loginIdentifier';
import { t } from '../../i18n';
import { login as apiLogin, sendOtp, AuthApiError } from '../../../lib/authApi';
import { persistAuthSession } from '../../../lib/authSessionStore';
import {
  linkSupabaseProfile,
  migrateLocalUserId,
  getCachedSessionUserId,
  getSupabaseSessionUserId,
  resolveAuthAccessToken,
  hasStoredAuthTokens,
  ensureStaffProfileForLogin,
  AuthProfilePayload,
} from '../../services/SupabaseAuthService';
import { isUuid, resolvePvzId } from '../../utils/supabaseHelpers';
import { userMemory } from './userMemoryStore';
import { ensureLocalOwnerRecord, resolveOwnerPvzsForLogin } from './ownerOps';
import { SignInOptions } from './types';

export interface OwnerEmailAuthSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

export type OwnerEmailAuthUserData = {
  name?: string;
};

function mapAuthApiError(error: unknown): Error {
  if (error instanceof AuthApiError && error.httpStatus >= 500) {
    return new Error(t('alerts.network.loginFailed'));
  }
  const err = error as { message?: string; code?: string };
  const message = (err.message ?? '').toLowerCase();
  const code = (err.code ?? '').toLowerCase();

  if (
    message.includes('invalid login credentials') ||
    code === 'invalid_credentials'
  ) {
    return new Error(t('alerts.auth.invalidCredentials'));
  }
  if (message.includes('user already registered') || code === 'user_already_exists') {
    return new Error(t('alerts.auth.emailAlreadyRegistered'));
  }
  if (message.includes('password') && message.includes('least')) {
    return new Error(t('alerts.auth.weakPassword'));
  }
  return new Error(err.message || t('alerts.network.loginFailed'));
}

/** Вход владельца: email + PIN через VPS API. */
export async function signInOwnerWithPassword(
  email: string,
  password: string
): Promise<OwnerEmailAuthSession> {
  try {
    const session = await apiLogin(normalizeEmail(email), password);
    await persistAuthSession(session, email);
    return {
      userId: session.userId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken ?? '',
    };
  } catch (error) {
    throw mapAuthApiError(error);
  }
}

/** Регистрация владельца через OTP (отправка кода). */
export async function signUpOwnerWithEmail(
  email: string,
  _password: string,
  _userData?: OwnerEmailAuthUserData
): Promise<OwnerEmailAuthSession> {
  try {
    await sendOtp(normalizeEmail(email));
    throw new Error(t('auth.emailOtp.checkInbox'));
  } catch (error) {
    throw mapAuthApiError(error);
  }
}

/** Сброс PIN владельца — отправка OTP на email. */
export async function resetOwnerPasswordEmail(email: string): Promise<void> {
  try {
    await sendOtp(normalizeEmail(email));
  } catch {
    throw new Error(t('alerts.auth.passwordResetFailed'));
  }
}

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
  const sessionUserId =
    sessionUserIdOverride ?? getCachedSessionUserId() ?? null;

  let loginResolution = await resolveOwnerPvzsForLogin(
    email,
    sessionUserId,
    sessionAccessTokenOverride
  );

  // После logout локальный кэш пуст — даём REST/RPC время подтянуть ПВЗ из облака.
  if (loginResolution.pvzList.length === 0 && (sessionUserId || sessionAccessTokenOverride)) {
    for (const delayMs of [400, 1200, 2500]) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      loginResolution = await resolveOwnerPvzsForLogin(
        email,
        sessionUserId ?? loginResolution.ownerId,
        sessionAccessTokenOverride ?? (await resolveAuthAccessToken())
      );
      if (loginResolution.pvzList.length > 0) break;
    }
  }

  const { pvzList, ownerId, localOwner } = loginResolution;
  const resolvedOwnerId = ownerId ?? sessionUserId ?? localOwner?.id ?? null;

  if (resolvedOwnerId) {
    await ensureLocalOwnerRecord(email, resolvedOwnerId, pvzList[0]?.id);
  }

  if (pvzList.length > 0) {
    return { route: 'selectPvz', pvzList, ownerId: resolvedOwnerId };
  }

  if (hasLocalPin && resolvedOwnerId) {
    return { route: 'pin', pvzList, ownerId: resolvedOwnerId };
  }

  return { route: 'createPvz', pvzList: [], ownerId: resolvedOwnerId };
}

async function resolveProfilePvzIds(sessionUser: User): Promise<Pick<AuthProfilePayload, 'pvzId' | 'pvzIds'>> {
  let pvzId = sessionUser.pvzId;
  if (pvzId && !isUuid(pvzId)) {
    pvzId = await resolvePvzId(pvzId);
  }
  if (pvzId && !isUuid(pvzId)) {
    pvzId = undefined;
  }

  const pvzIds: string[] = [];
  if (sessionUser.pvzIds?.length) {
    for (const id of sessionUser.pvzIds) {
      const resolved = isUuid(id) ? id : await resolvePvzId(id);
      if (isUuid(resolved)) pvzIds.push(resolved);
    }
  }

  return { pvzId, pvzIds: pvzIds.length ? pvzIds : undefined };
}

export async function linkRemoteProfile(
  sessionUser: User,
  loginKey: string,
  options?: SignInOptions
): Promise<User> {
  const hasAuth =
    Boolean(getCachedSessionUserId()) || (await hasStoredAuthTokens());

  if (!hasAuth) {
    return sessionUser;
  }

  const isOwner = sessionUser.role === 'owner';
  const accessToken = await resolveAuthAccessToken();
  const userId = getCachedSessionUserId();

  if (isOwner && userId && accessToken) {
    const profile: AuthProfilePayload = {
      name: sessionUser.name,
      phone: '',
      email: normalizeEmail(loginKey),
      role: sessionUser.role,
      pvzId: sessionUser.pvzId,
      pvzIds: sessionUser.pvzIds,
      permissionLevel: sessionUser.permissionLevel,
      permissions: sessionUser.permissions,
      status: sessionUser.status,
    };
    void linkSupabaseProfile(profile).catch((restError) => {
      if (__DEV__) {
        console.warn('[Auth] owner profile upsert (background):', restError);
      }
    });
    const oldId = sessionUser.id;
    if (oldId !== userId) {
      await migrateLocalUserId(oldId, userId, sessionUser.role as UserRole);
      await userMemory.replaceUserId(oldId, userId);
      return { ...sessionUser, id: userId };
    }
    return sessionUser;
  }

  if (isOwner) {
    return sessionUser;
  }

  try {
    const oldId = sessionUser.id;
    const resolvedPvz = await resolveProfilePvzIds(sessionUser);
    const profile: AuthProfilePayload = {
      name: sessionUser.name,
      phone: loginKey.replace(/[^0-9]/g, ''),
      email: sessionUser.email || undefined,
      role: sessionUser.role,
      pvzId: resolvedPvz.pvzId,
      pvzIds: resolvedPvz.pvzIds,
      permissionLevel: sessionUser.permissionLevel,
      permissions: sessionUser.permissions,
      status: sessionUser.status,
      invitationId: options?.invitationId,
    };

    let supabaseUserId: string | null = null;

    if (sessionUser.role === 'employee' || sessionUser.role === 'admin') {
      const linked = await ensureStaffProfileForLogin(profile);
      if (!linked && __DEV__) {
        console.warn('[Auth] ensureStaffProfileForLogin failed, falling back to upsertProfile');
        supabaseUserId = await linkSupabaseProfile(profile);
      } else {
        supabaseUserId =
          getCachedSessionUserId() ?? (await getSupabaseSessionUserId());
      }
    } else {
      supabaseUserId = await linkSupabaseProfile(profile);
    }

    if (supabaseUserId && oldId !== supabaseUserId) {
      await migrateLocalUserId(oldId, supabaseUserId, sessionUser.role as UserRole);
      await userMemory.replaceUserId(oldId, supabaseUserId);
      return { ...sessionUser, id: supabaseUserId };
    }
  } catch (linkError) {
    if (__DEV__) {
      console.warn('[Auth] linkRemoteProfile:', linkError);
    }
    return sessionUser;
  }

  return sessionUser;
}
