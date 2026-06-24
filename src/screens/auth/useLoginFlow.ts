import { useState, useEffect, useCallback, useRef, useMemo, type MutableRefObject } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../context/AuthContext';
import { LAST_LOGIN_PROFILE_KEY, type LastLoginProfile } from '../../context/auth/lastLoginProfile';
import {
  sendEmailOtp,
  verifyEmailOtp,
  resolveAuthUserMessage,
  getOtpCodeLength,
  getPhoneOtpCodeLength,
  DEMO_MODE,
  DEMO_OTP_CODE,
  getCachedSessionUserId,
  getSessionUserId,
  resolveAuthAccessToken,
  isOtpSendMaybeDelivered,
  signInWithEmailPin,
  signInStaffWithPhonePin,
  setOwnerPinOnServer,
  resetOwnerPinOnServer,
  sendPhoneOtp,
  verifyPhoneOtpSession,
  prefetchEmployeePhoneAuth,
} from '../../services/AuthService';
import { AuthApiError } from '../../../lib/authApi';
import { checkPendingInvitationForPhone } from '../../services/InvitationSyncService';
import PinService from '../../services/PinService';
import {
  getPinLockStatus,
  recordPinFailure,
  resetPinAttempts,
} from '../../utils/pinRateLimit';
import {
  normalizeEmail,
  isValidEmail,
  loadLastOwnerEmail,
  saveLastOwnerEmail,
  getPinLoginKey,
} from '../../utils/loginIdentifier';
import {
  cleanPhone,
  formatPhoneInput,
  formatPhoneForDisplay,
  isValidPhone,
} from '../../utils/phoneHelpers';
import { safeParseJson } from '../../utils/safeJson';
import { useToast } from '../../components/common/Toast';
import { restoreOwnerForPinLogin } from '../../context/auth/ownerPinLoginRestore';
import { ensureLocalStaffFromSession } from '../../context/auth/staffSessionOps';
import { ensureLocalOwnerRecord, resolveOwnerPvzsForLogin } from '../../context/auth/ownerOps';
import {
  checkOwnerEmailExistsRemotely,
  clearOrphanedOwnerLocalAuth,
} from '../../context/auth/ownerRegistrationCleanup';
import { syncOwnerPinHashToCloud } from '../../services/ownerPinCloudSync';
import { loadUsersFromStorage } from '../../context/auth/userMemoryStore';
import { saveOwnerPinLoginSnapshot } from '../../utils/ownerPinLoginStore';
import { saveStaffPinLoginSnapshot } from '../../utils/staffPinLoginStore';
import DataService from '../../services/DataService';
import { createPvz as createPvzOnApi } from '../../../lib/pvzService';
import { fetchLegalStatus, recordLegalAcceptance } from '../../../lib/legalApi';
import type { Pvz, UserRole } from '../../types/user';
import { isStaffRole } from '../../types/user';
import type {
  AuthFlowMode,
  LoginInvitationItem,
  LoginStep,
  NewPinPhase,
  OtpSendStatus,
} from './loginTypes';

const OTP_RESEND_SECONDS = 30;
const PIN_LENGTH = 4;

type OtpSession = { userId: string; accessToken: string };
type OtpPurpose = 'reset_pin' | 'register' | 'staff_setup';
type PendingStaffInvite = { invitationId: string; pvzId: string };

/** Подтянуть ПВЗ и локальную запись владельца перед signIn. */
async function prepareOwnerBeforeSignIn(
  normalizedEmail: string,
  session: OtpSession
): Promise<void> {
  try {
    const { pvzList, ownerId } = await resolveOwnerPvzsForLogin(
      normalizedEmail,
      session.userId,
      session.accessToken
    );
    const resolvedOwnerId = ownerId ?? session.userId;
    const owner = await ensureLocalOwnerRecord(
      normalizedEmail,
      resolvedOwnerId,
      pvzList[0]?.id
    );
    if (pvzList.length > 0) {
      await Promise.all(pvzList.map((pvz) => DataService.savePvz(pvz)));
      await SecureStore.setItemAsync('pvz', JSON.stringify(pvzList[0]));
      await saveOwnerPinLoginSnapshot(normalizedEmail, {
        ownerId: resolvedOwnerId,
        name: owner.name,
        pvzId: pvzList[0]?.id,
        pvzList,
      });
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[Auth] prepareOwnerBeforeSignIn:', error);
    }
  }
}

async function resolveLoginSession(
  otpSessionRef: MutableRefObject<OtpSession | null>
): Promise<OtpSession | null> {
  if (otpSessionRef.current?.userId && otpSessionRef.current?.accessToken) {
    return otpSessionRef.current;
  }
  const userId = getCachedSessionUserId() ?? (await getSessionUserId());
  const accessToken = await resolveAuthAccessToken();
  if (userId && accessToken) {
    return { userId, accessToken };
  }
  return null;
}

/** Проверка email владельца (profiles/auth.users), без OTP. */
export async function checkOwnerEmailExists(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (await PinService.hasPin(normalized)) {
    return true;
  }

  const usersRaw = await SecureStore.getItemAsync('pvz_users');
  const users = safeParseJson<Array<{ email?: string; role?: string }>>(usersRaw ?? '[]', []);
  if (
    users.some(
      (u) => u.role === 'owner' && u.email && normalizeEmail(u.email) === normalized
    )
  ) {
    return true;
  }

  const remote = await checkOwnerEmailExistsRemotely(normalized);
  if (remote === true) return true;
  if (remote === false) return false;
  return true;
}

/** Проверка PIN (локально в SecureStore; в БД pin не хранится). */
export async function verifyOwnerPin(email: string, pin: string): Promise<boolean> {
  return PinService.verifyPin(normalizeEmail(email), pin);
}

/** Сохранить новый PIN локально. */
export async function saveOwnerPin(email: string, pin: string): Promise<void> {
  const normalized = normalizeEmail(email);
  await PinService.savePin(normalized, pin);
  void syncOwnerPinHashToCloud(normalized).catch(() => undefined);
}

export function useLoginFlow() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<LoginStep>('role');
  const [flowMode, setFlowMode] = useState<AuthFlowMode>('login');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [phone, setPhone] = useState('');
  const [otpSendStatus, setOtpSendStatus] = useState<OtpSendStatus>('idle');
  const [rateLimitWaitMinutes, setRateLimitWaitMinutes] = useState(0);
  const [staffInvitations, setStaffInvitations] = useState<LoginInvitationItem[]>([]);
  const [selectedPvzId, setSelectedPvzId] = useState('');
  const [selectedInvitationId, setSelectedInvitationId] = useState('');
  const [savedProfileName, setSavedProfileName] = useState('');
  const [email, setEmail] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [newPinPhase, setNewPinPhase] = useState<NewPinPhase>('enter');
  const [pvzName, setPvzName] = useState('');
  const [pvzAddress, setPvzAddress] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checkingSavedProfile, setCheckingSavedProfile] = useState(true);
  const [authErrorMessage, setAuthErrorMessage] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinSetupPurpose, setPinSetupPurpose] = useState<OtpPurpose>('reset_pin');
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [legalNeedsAcceptance, setLegalNeedsAcceptance] = useState(true);

  const otpSessionRef = useRef<OtpSession | null>(null);
  const otpPurposeRef = useRef<OtpPurpose>('reset_pin');
  const pendingStaffInviteRef = useRef<PendingStaffInvite | null>(null);
  const staffOtpSessionRef = useRef<{
    userId: string;
    pvzId?: string;
    name?: string;
  } | null>(null);
  const loginEmailRef = useRef('');

  const normalizedLoginEmail = () => normalizeEmail(loginEmailRef.current || email);

  const staffPinKey = () => getPinLoginKey(selectedRole, phone, email);

  const loginDisplay = useMemo(() => {
    if (selectedRole === 'owner') {
      return normalizedLoginEmail();
    }
    const normalized = cleanPhone(phone);
    return normalized.length === 11 ? formatPhoneForDisplay(normalized) : phone;
  }, [selectedRole, phone, email]);

  const requiresLegalConsent = useMemo(() => {
    if (step === 'phone' && selectedRole && selectedRole !== 'owner') {
      return legalNeedsAcceptance;
    }
    if (step === 'email') {
      if (flowMode === 'register') return true;
      return legalNeedsAcceptance;
    }
    if (step === 'quick_login') {
      return legalNeedsAcceptance;
    }
    return false;
  }, [step, selectedRole, flowMode, legalNeedsAcceptance]);

  const canProceedWithLegal = !requiresLegalConsent || legalAccepted;

  useEffect(() => {
    setLegalAccepted(false);
  }, [step, email, phone, selectedRole, flowMode]);

  useEffect(() => {
    if (step !== 'email' || flowMode !== 'login') return;
    if (!isValidEmail(email)) {
      setLegalNeedsAcceptance(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchLegalStatus({ email: normalizeEmail(email) });
        if (!cancelled) setLegalNeedsAcceptance(!status.accepted);
      } catch {
        if (!cancelled) setLegalNeedsAcceptance(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, flowMode, email]);

  useEffect(() => {
    if (step !== 'phone' || !selectedRole || selectedRole === 'owner') return;
    const normalized = cleanPhone(phone);
    if (normalized.length !== 11) {
      setLegalNeedsAcceptance(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchLegalStatus({ phone: normalized });
        if (!cancelled) setLegalNeedsAcceptance(!status.accepted);
      } catch {
        if (!cancelled) setLegalNeedsAcceptance(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, selectedRole, phone]);

  useEffect(() => {
    if (step !== 'quick_login') return;

    let cancelled = false;
    void (async () => {
      try {
        if (selectedRole === 'owner' && isValidEmail(email)) {
          const status = await fetchLegalStatus({ email: normalizeEmail(email) });
          if (!cancelled) setLegalNeedsAcceptance(!status.accepted);
          return;
        }
        if (isStaffRole(selectedRole)) {
          const normalized = cleanPhone(phone);
          if (normalized.length !== 11) {
            if (!cancelled) setLegalNeedsAcceptance(true);
            return;
          }
          const status = await fetchLegalStatus({ phone: normalized });
          if (!cancelled) setLegalNeedsAcceptance(!status.accepted);
          return;
        }
        if (!cancelled) setLegalNeedsAcceptance(true);
      } catch {
        if (!cancelled) setLegalNeedsAcceptance(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, selectedRole, email, phone]);

  const persistLegalAcceptanceIfNeeded = useCallback(
    async (params: { email?: string; phone?: string }) => {
      if (!requiresLegalConsent) return;
      await recordLegalAcceptance(params);
      if (params.email || params.phone) setLegalNeedsAcceptance(false);
    },
    [requiresLegalConsent]
  );

  const ensureLegalAccepted = useCallback((): boolean => {
    if (!requiresLegalConsent || legalAccepted) return true;
    showToast(t('legal.consentCheckbox.required'), 'error');
    return false;
  }, [requiresLegalConsent, legalAccepted, showToast, t]);

  useEffect(() => {
    void (async () => {
      prefetchEmployeePhoneAuth();
      const last = await loadLastOwnerEmail();
      if (last) {
        setEmail(last);
      }

      const profileRaw = await SecureStore.getItemAsync(LAST_LOGIN_PROFILE_KEY);
      const profile = safeParseJson<LastLoginProfile | null>(profileRaw, null);
      if (profile?.role === 'owner' && profile.email) {
        const normalized = normalizeEmail(profile.email);
        const hasPin = await PinService.hasPin(normalized);
        if (hasPin) {
          setSelectedRole('owner');
          setSavedProfileName(profile.name);
          setEmail(normalized);
          loginEmailRef.current = normalized;
          setStep('quick_login');
          setCheckingSavedProfile(false);
          return;
        }
      }

      if (profile?.role && isStaffRole(profile.role) && profile.phone) {
        const normalizedPhone = cleanPhone(profile.phone);
        if (normalizedPhone.length === 11 && (await PinService.hasPin(normalizedPhone))) {
          setSelectedRole(profile.role);
          setSavedProfileName(profile.name);
          setPhone(formatPhoneInput(normalizedPhone));
          setStep('quick_login');
          setCheckingSavedProfile(false);
          return;
        }
      }

      setStep('role');
      setCheckingSavedProfile(false);
    })();
  }, []);

  useEffect(() => {
    if (otpTimer <= 0) return;
    const id = setInterval(() => {
      setOtpTimer((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [otpTimer]);

  const finishLogin = useCallback(async () => {
    const key = normalizedLoginEmail();
    const session = await resolveLoginSession(otpSessionRef);

    if (session) {
      otpSessionRef.current = session;
      await ensureLocalOwnerRecord(key, session.userId);
      await prepareOwnerBeforeSignIn(key, session);
    } else {
      await restoreOwnerForPinLogin(key);
    }

    await saveLastOwnerEmail(key);
    await signIn(key, 'owner', { loginMethod: 'email' });
  }, [signIn]);

  const promptStaffPinSetupIfNeeded = useCallback(
    async (invitationId: string, pvzId: string): Promise<boolean> => {
      const normalized = cleanPhone(phone);
      if (normalized.length !== 11) return false;
      if (await PinService.hasPin(normalized)) return false;

      pendingStaffInviteRef.current = { invitationId, pvzId };
      otpPurposeRef.current = 'staff_setup';
      setPinSetupPurpose('staff_setup');
      setNewPin('');
      setNewPinConfirm('');
      setNewPinPhase('enter');
      setStep('new_pin');
      return true;
    },
    [phone]
  );

  const finishStaffLogin = useCallback(
    async (invitationId: string, pvzId: string) => {
      const normalized = cleanPhone(phone);
      const role = selectedRole;
      if (!role || role === 'owner') return;

      if (!(await PinService.hasPin(normalized))) {
        if (await promptStaffPinSetupIfNeeded(invitationId, pvzId)) return;
      }

      await signIn(normalized, role, {
        loginMethod: 'phone',
        invitationId,
        pvzId,
      });
    },
    [phone, promptStaffPinSetupIfNeeded, selectedRole, signIn]
  );

  const finishReturningStaffLogin = useCallback(
    async (pvzId?: string, name?: string) => {
      const normalized = cleanPhone(phone);
      const role = selectedRole;
      if (!role || role === 'owner') return;

      if (!(await PinService.hasPin(normalized))) {
        if (await promptStaffPinSetupIfNeeded('returning', pvzId ?? '')) return;
      }

      await signIn(normalized, role, {
        loginMethod: 'phone',
        pvzId,
        staffName: name,
      });
    },
    [phone, promptStaffPinSetupIfNeeded, selectedRole, signIn]
  );

  const mapInvitations = useCallback(
    (
      items: Array<{
        id: string;
        pvzId: string;
        pvzName?: string;
        invitedByName?: string;
      }>
    ): LoginInvitationItem[] =>
      items.map((item) => ({
        id: item.id,
        pvzId: item.pvzId,
        pvzName: item.pvzName ?? t('auth.pvzSelect.inviteFromOwner'),
        invitedByName: item.invitedByName,
      })),
    [t]
  );

  const resolveStaffInvitations = useCallback(async () => {
    const normalized = cleanPhone(phone);
    const role = selectedRole;
    if (!role || role === 'owner') return [] as LoginInvitationItem[];

    const local = await DataService.getLocalPendingInvitationsForLoginPhone(normalized, role);
    if (local.length > 0) {
      return mapInvitations(
        local.map((inv) => ({
          id: inv.id,
          pvzId: inv.pvzId,
          pvzName: inv.pvzName,
          invitedByName: inv.invitedByName,
        }))
      );
    }

    const remote = await DataService.getPendingInvitationsForLoginPhone(normalized, role);
    if (remote.length > 0) {
      return mapInvitations(
        remote.map((inv) => ({
          id: inv.id,
          pvzId: inv.pvzId,
          pvzName: inv.pvzName,
          invitedByName: inv.invitedByName,
        }))
      );
    }

    return staffInvitations;
  }, [mapInvitations, phone, selectedRole, staffInvitations]);

  const submitRoleStep = useCallback(() => {
    if (!selectedRole) {
      showToast(t('auth.role.sectionSubtitle'), 'error');
      return;
    }
    setAuthErrorMessage('');
    if (selectedRole === 'owner') {
      setStep('email');
      return;
    }
    void (async () => {
      const profileRaw = await SecureStore.getItemAsync(LAST_LOGIN_PROFILE_KEY);
      const profile = safeParseJson<LastLoginProfile | null>(profileRaw, null);
      if (
        profile?.phone &&
        isStaffRole(profile.role) &&
        profile.role === selectedRole
      ) {
        const normalizedPhone = cleanPhone(profile.phone);
        if (normalizedPhone.length === 11 && (await PinService.hasPin(normalizedPhone))) {
          setPhone(formatPhoneInput(normalizedPhone));
          setSavedProfileName(profile.name);
          setStep('quick_login');
          return;
        }
      }
      setPhone('');
      setOtpSendStatus('idle');
      setStep('phone');
    })();
  }, [selectedRole, showToast, t]);

  const submitPhoneStep = useCallback(async () => {
    const normalized = cleanPhone(phone);
    if (!selectedRole || selectedRole === 'owner') return;
    if (!isValidPhone(normalized)) {
      showToast(t('alerts.validation.invalidPhone'), 'error');
      return;
    }
    if (!ensureLegalAccepted()) return;

    if (await PinService.hasPin(normalized)) {
      setStep('quick_login');
      return;
    }

    setLoading(true);
    setAuthErrorMessage('');
    try {
      await persistLegalAcceptanceIfNeeded({ phone: normalized });

      const localInvites = await DataService.getLocalPendingInvitationsForLoginPhone(
        normalized,
        selectedRole
      );

      let hasRemoteInvite = localInvites.length > 0;
      if (!hasRemoteInvite) {
        try {
          hasRemoteInvite = await checkPendingInvitationForPhone(normalized, selectedRole);
        } catch (checkError) {
          if (localInvites.length === 0) {
            const message = resolveAuthUserMessage(checkError, 'alerts.network.loginFailed');
            setAuthErrorMessage(message);
            showToast(message, 'error');
            return;
          }
        }
      }

      if (!hasRemoteInvite && localInvites.length === 0) {
        const message = t('alerts.auth.phoneNotFound');
        setAuthErrorMessage(message);
        showToast(message, 'error');
        return;
      }

      setOtpSendStatus('sending');
      if (DEMO_MODE) {
        setOtpSendStatus('sent');
        setOtpTimer(OTP_RESEND_SECONDS);
        setOtpCode('');
        setStep('sms');
        showToast(t('auth.sms.demoHint', { code: DEMO_OTP_CODE }), 'info');
        return;
      }

      await sendPhoneOtp(normalized, selectedRole);
      setOtpSendStatus('sent');
      setOtpTimer(OTP_RESEND_SECONDS);
      setOtpCode('');
      setStep('sms');
      showToast(t('auth.sms.checkPhone'), 'info');
    } catch (error: unknown) {
      setOtpSendStatus('failed');
      const message = resolveAuthUserMessage(error, 'alerts.network.smsFailed');
      setAuthErrorMessage(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [phone, selectedRole, showToast, t, ensureLegalAccepted, persistLegalAcceptanceIfNeeded]);

  const resendStaffSms = useCallback(async () => {
    await submitPhoneStep();
  }, [submitPhoneStep]);

  const verifyStaffSms = useCallback(async () => {
    const normalized = cleanPhone(phone);
    const role = selectedRole;
    if (!role || role === 'owner') return;

    const otpLength = getPhoneOtpCodeLength();
    if (otpCode.length < otpLength) {
      showToast(t('alerts.validation.invalidOtp', { length: otpLength }), 'error');
      return;
    }

    setLoading(true);
    setAuthErrorMessage('');
    try {
      let invitations: LoginInvitationItem[] = [];
      let staffSession: Awaited<ReturnType<typeof verifyPhoneOtpSession>> | null = null;

      if (DEMO_MODE) {
        if (otpCode !== DEMO_OTP_CODE) {
          showToast(t('alerts.validation.invalidOtp', { length: otpLength }), 'error');
          return;
        }
      } else {
        staffSession = await verifyPhoneOtpSession(normalized, otpCode, role);
        staffOtpSessionRef.current = {
          userId: staffSession.userId,
          pvzId: staffSession.staffUser?.pvzId,
          name: staffSession.staffUser?.name,
        };
        if (staffSession.invitations?.length) {
          invitations = mapInvitations(staffSession.invitations);
          setStaffInvitations(invitations);

          const allRaw = await SecureStore.getItemAsync('all_invitations');
          const all = safeParseJson<
            Array<{
              id: string;
              phone: string;
              name: string;
              role: string;
              pvzId: string;
              pvzName?: string;
              status: string;
              createdAt?: string;
              invitedBy?: string;
            }>
          >(allRaw ?? '[]', []);
          for (const inv of staffSession.invitations) {
            const exists = all.some((item) => item.id === inv.id);
            if (!exists) {
              all.push({
                id: inv.id,
                phone: inv.phone,
                name: inv.name,
                role: inv.role,
                pvzId: inv.pvzId,
                pvzName: inv.pvzName ?? 'ПВЗ',
                status: inv.status ?? 'pending',
                createdAt: new Date().toISOString(),
                invitedBy: inv.invitedBy,
              });
            }
          }
          await SecureStore.setItemAsync('all_invitations', JSON.stringify(all));
        }
      }

      if (invitations.length === 0) {
        invitations = await resolveStaffInvitations();
      }

      if (invitations.length === 0 && staffSession?.staffUser) {
        const pvzId = staffSession.staffUser.pvzId ?? '';
        if (await promptStaffPinSetupIfNeeded('returning', pvzId)) {
          return;
        }
        await finishReturningStaffLogin(pvzId, staffSession.staffUser.name);
        return;
      }

      if (invitations.length === 0) {
        const message = t('alerts.auth.invitationRevoked');
        setAuthErrorMessage(message);
        showToast(message, 'error');
        return;
      }

      if (invitations.length === 1) {
        if (await promptStaffPinSetupIfNeeded(invitations[0].id, invitations[0].pvzId)) {
          return;
        }
        await finishStaffLogin(invitations[0].id, invitations[0].pvzId);
        return;
      }

      setSelectedPvzId(invitations[0].pvzId);
      setSelectedInvitationId(invitations[0].id);
      setStaffInvitations(invitations);
      setStep('select_pvz');
    } catch (error: unknown) {
      const message = resolveAuthUserMessage(error, 'alerts.network.verifyFailed');
      setAuthErrorMessage(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [
    finishReturningStaffLogin,
    finishStaffLogin,
    mapInvitations,
    otpCode,
    phone,
    promptStaffPinSetupIfNeeded,
    resolveStaffInvitations,
    selectedRole,
    showToast,
    t,
  ]);

  const completeStaffPvzSelection = useCallback(async () => {
    if (!selectedInvitationId || !selectedPvzId) {
      showToast(t('auth.pvzSelect.title'), 'error');
      return;
    }
    setLoading(true);
    try {
      if (await promptStaffPinSetupIfNeeded(selectedInvitationId, selectedPvzId)) {
        return;
      }
      await finishStaffLogin(selectedInvitationId, selectedPvzId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('alerts.network.loginFailed');
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [finishStaffLogin, promptStaffPinSetupIfNeeded, selectedInvitationId, selectedPvzId, showToast, t]);

  const handleStaffForgotPin = useCallback(async () => {
    const pinKey = staffPinKey();
    if (pinKey) {
      await PinService.clearPin(pinKey);
      await resetPinAttempts(pinKey);
    }
    setPinCode('');
    setPinError(false);
    setAuthErrorMessage('');
    setStep('phone');
  }, [staffPinKey]);

  const switchAccount = useCallback(() => {
    setStep('role');
    setSelectedRole(null);
    setPhone('');
    setPinCode('');
    setOtpCode('');
    setAuthErrorMessage('');
    setFlowMode('login');
  }, []);

  /** Шаг 1 (вход): проверка email → переход на PIN. */
  const checkEmail = useCallback(async () => {
    if (!isValidEmail(email)) {
      showToast(t('alerts.validation.invalidEmail'), 'error');
      return;
    }
    if (!ensureLegalAccepted()) return;

    const normalized = normalizeEmail(email);
    setLoading(true);
    setAuthErrorMessage('');
    try {
      try {
        await persistLegalAcceptanceIfNeeded({ email: normalized });
      } catch {
        // не блокируем вход из-за accept-legal
      }

      const exists = await checkOwnerEmailExists(normalized);
      if (!exists) {
        const message = t('alerts.auth.emailNotFound');
        setAuthErrorMessage(message);
        showToast(message, 'error');
        return;
      }
      loginEmailRef.current = normalized;
      setEmail(normalized);
      setPinCode('');
      setPinError(false);
      try {
        await restoreOwnerForPinLogin(normalized);
      } catch {
        // PVZ подтянутся после PIN; не блокируем переход на экран PIN
      }
      setStep('pin');
    } catch (error: unknown) {
      const message = resolveAuthUserMessage(error, 'alerts.network.serverUnavailable');
      setAuthErrorMessage(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [email, showToast, t, ensureLegalAccepted, persistLegalAcceptanceIfNeeded]);

  /** Шаг 1 (регистрация): email → OTP. */
  const startRegister = useCallback(async () => {
    if (!isValidEmail(email)) {
      showToast(t('alerts.validation.invalidEmail'), 'error');
      return;
    }
    if (!ensureLegalAccepted()) return;

    const normalized = normalizeEmail(email);
    setLoading(true);
    setAuthErrorMessage('');
    try {
      await persistLegalAcceptanceIfNeeded({ email: normalized });

      await clearOrphanedOwnerLocalAuth(normalized);

      loginEmailRef.current = normalized;
      setEmail(normalized);
      setOtpCode('');
      otpPurposeRef.current = 'register';
      setPinSetupPurpose('register');
      setStep('register_otp');

      if (DEMO_MODE) {
        setOtpTimer(OTP_RESEND_SECONDS);
        showToast(t('auth.sms.demoHint', { code: DEMO_OTP_CODE }), 'info');
        return;
      }

      await sendEmailOtp(normalized, { forRegistration: true });
      setOtpTimer(OTP_RESEND_SECONDS);
      showToast(t('auth.emailOtp.checkInbox'), 'info');
    } catch (error: unknown) {
      if (isOtpSendMaybeDelivered(error)) {
        setOtpTimer(OTP_RESEND_SECONDS);
        showToast(t('auth.emailOtp.checkInbox'), 'info');
        return;
      }
      const message = resolveAuthUserMessage(error, 'alerts.network.emailFailed');
      setAuthErrorMessage(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [email, showToast, t, ensureLegalAccepted, persistLegalAcceptanceIfNeeded]);

  const submitEmailStep = useCallback(async () => {
    if (flowMode === 'register') {
      await startRegister();
    } else {
      await checkEmail();
    }
  }, [checkEmail, flowMode, startRegister]);

  const sendRegisterOtp = useCallback(async () => {
    const key = normalizedLoginEmail();
    if (!isValidEmail(key)) {
      showToast(t('alerts.validation.invalidEmail'), 'error');
      return;
    }
    if (otpTimer > 0 && step === 'register_otp') return;

    setLoading(true);
    setAuthErrorMessage('');
    setOtpCode('');

    try {
      if (DEMO_MODE) {
        setOtpTimer(OTP_RESEND_SECONDS);
        showToast(t('auth.sms.demoHint', { code: DEMO_OTP_CODE }), 'info');
        return;
      }
      await sendEmailOtp(key, { forRegistration: true });
      setOtpTimer(OTP_RESEND_SECONDS);
      showToast(t('auth.emailOtp.checkInbox'), 'info');
    } catch (error: unknown) {
      if (isOtpSendMaybeDelivered(error)) {
        setOtpTimer(OTP_RESEND_SECONDS);
        showToast(t('auth.emailOtp.checkInbox'), 'info');
        return;
      }
      const message = resolveAuthUserMessage(error, 'alerts.network.emailFailed');
      setAuthErrorMessage(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [otpTimer, showToast, step, t]);

  /** Забыли PIN / подтверждение сессии: отправка OTP на email. */
  const sendOtpForReset = useCallback(async () => {
    const key = normalizedLoginEmail();
    if (!isValidEmail(key)) {
      showToast(t('alerts.validation.invalidEmail'), 'error');
      return;
    }
    if (otpTimer > 0 && step === 'otp_reset') return;

    setLoading(true);
    setAuthErrorMessage('');
    setOtpCode('');
    setStep('otp_reset');

    try {
      if (DEMO_MODE) {
        setOtpTimer(OTP_RESEND_SECONDS);
        showToast(t('auth.sms.demoHint', { code: DEMO_OTP_CODE }), 'info');
        return;
      }
      await sendEmailOtp(key, { forPinReset: true });
      setOtpTimer(OTP_RESEND_SECONDS);
      showToast(t('auth.emailOtp.checkInbox'), 'info');
    } catch (error: unknown) {
      if (isOtpSendMaybeDelivered(error)) {
        setOtpTimer(OTP_RESEND_SECONDS);
        showToast(t('auth.emailOtp.checkInbox'), 'info');
        return;
      }
      const message = resolveAuthUserMessage(error, 'alerts.network.emailFailed');
      setAuthErrorMessage(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [otpTimer, showToast, step, t]);

  const handleForgotPin = useCallback(() => {
    otpPurposeRef.current = 'reset_pin';
    setPinSetupPurpose('reset_pin');
    void sendOtpForReset();
  }, [sendOtpForReset]);

  /** Шаг 2: проверка PIN → вход. */
  const verifyPin = useCallback(async () => {
    const staffRole = selectedRole;
    if (isStaffRole(staffRole)) {
      const pinKey = staffPinKey();
      if (!pinKey || pinKey.length !== 11) {
        showToast(t('alerts.validation.invalidPhone'), 'error');
        return;
      }
      if (pinCode.length < PIN_LENGTH) {
        showToast(t('alerts.validation.invalidPin'), 'error');
        return;
      }
      if (!ensureLegalAccepted()) return;

      setLoading(true);
      setPinError(false);
      setAuthErrorMessage('');
      try {
        const lockStatus = await getPinLockStatus(pinKey);
        if (lockStatus.locked) {
          const seconds = Math.ceil(lockStatus.retryAfterMs / 1000);
          Alert.alert(t('common.error.title'), t('auth.pin.locked', { seconds }));
          return;
        }

        const valid = await PinService.verifyPin(pinKey, pinCode);
        if (!valid) {
          const afterFail = await recordPinFailure(pinKey);
          setPinError(true);
          setPinCode('');
          if (afterFail.locked) {
            const seconds = Math.ceil(afterFail.retryAfterMs / 1000);
            Alert.alert(t('common.error.title'), t('auth.pin.locked', { seconds }));
          } else {
            showToast(t('alerts.validation.wrongPin'), 'error');
          }
          return;
        }

        await resetPinAttempts(pinKey);
        try {
          await persistLegalAcceptanceIfNeeded({ phone: pinKey });
        } catch {
          // не блокируем вход из-за accept-legal
        }
        await loadUsersFromStorage();

        let staffSession: Awaited<ReturnType<typeof signInStaffWithPhonePin>> | null = null;
        try {
          staffSession = await signInStaffWithPhonePin(pinKey, pinCode, staffRole);
        } catch (loginError) {
          if (loginError instanceof AuthApiError) {
            const msg = loginError.message.toLowerCase();
            if (loginError.httpStatus === 400 && msg.includes('pin not set')) {
              showToast(t('auth.staff.pinNeedsSms'), 'info');
              setStep('phone');
              return;
            }
            if (loginError.httpStatus === 404) {
              const hasInvite = await checkPendingInvitationForPhone(pinKey, staffRole).catch(
                () => false
              );
              if (hasInvite) {
                showToast(t('auth.staff.pinNeedsSms'), 'info');
                setStep('phone');
                return;
              }
              showToast(t('alerts.auth.phoneNotFound'), 'error');
              return;
            }
          }
          throw loginError;
        }

        await ensureLocalStaffFromSession(
          pinKey,
          staffRole,
          {
            userId: staffSession.userId,
            name: staffSession.staffUser?.name ?? savedProfileName,
            pvzId: staffSession.staffUser?.pvzId,
          }
        );
        await saveStaffPinLoginSnapshot(pinKey, {
          userId: staffSession.userId,
          name: staffSession.staffUser?.name ?? savedProfileName,
          role: staffRole,
          pvzId: staffSession.staffUser?.pvzId,
        });
        await signIn(pinKey, staffRole, {
          loginMethod: 'phone',
          pvzId: staffSession.staffUser?.pvzId,
          staffName: staffSession.staffUser?.name,
        });
      } catch (error: unknown) {
        const message = resolveAuthUserMessage(error, 'alerts.network.loginFailed');
        setAuthErrorMessage(message);
        showToast(message, 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    const key = normalizedLoginEmail();
    if (pinCode.length < PIN_LENGTH) {
      showToast(t('alerts.validation.invalidPin'), 'error');
      return;
    }
    if (!ensureLegalAccepted()) return;

    setLoading(true);
    setPinError(false);
    setAuthErrorMessage('');

    try {
      const lockStatus = await getPinLockStatus(key);
      if (lockStatus.locked) {
        const seconds = Math.ceil(lockStatus.retryAfterMs / 1000);
        Alert.alert(t('common.error.title'), t('auth.pin.locked', { seconds }));
        return;
      }

      const hasPin = await PinService.hasPin(key);
      if (!hasPin) {
        const message = t('auth.login.pinNotSet');
        setAuthErrorMessage(message);
        showToast(message, 'info');
        return;
      }

      let session: OtpSession | null = null;
      if (!DEMO_MODE) {
        try {
          const remoteSession = await signInWithEmailPin(key, pinCode);
          session = {
            userId: remoteSession.userId,
            accessToken: remoteSession.accessToken,
          };
          otpSessionRef.current = session;
        } catch (loginError) {
          const localValid = await verifyOwnerPin(key, pinCode);
          if (!localValid) {
            const afterFail = await recordPinFailure(key);
            setPinError(true);
            setPinCode('');
            if (afterFail.locked) {
              const seconds = Math.ceil(afterFail.retryAfterMs / 1000);
              Alert.alert(t('common.error.title'), t('auth.pin.locked', { seconds }));
            } else {
              const message = resolveAuthUserMessage(loginError, 'alerts.validation.wrongPin');
              showToast(message, 'error');
            }
            return;
          }

          const isNetworkError =
            loginError instanceof AuthApiError &&
            (loginError.httpStatus >= 500 || loginError.httpStatus === 0);
          const message = isNetworkError
            ? t('alerts.network.loginFailed')
            : resolveAuthUserMessage(loginError, 'alerts.validation.wrongPin');
          setAuthErrorMessage(message);
          showToast(message, 'error');
          return;
        }
      } else {
        const valid = await verifyOwnerPin(key, pinCode);
        if (!valid) {
          const afterFail = await recordPinFailure(key);
          setPinError(true);
          setPinCode('');
          if (afterFail.locked) {
            const seconds = Math.ceil(afterFail.retryAfterMs / 1000);
            Alert.alert(t('common.error.title'), t('auth.pin.locked', { seconds }));
          } else {
            showToast(t('alerts.validation.wrongPin'), 'error');
          }
          return;
        }
      }

      await resetPinAttempts(key);

      try {
        await persistLegalAcceptanceIfNeeded({ email: key });
      } catch {
        // не блокируем вход из-за accept-legal
      }

      if (!otpSessionRef.current) {
        await restoreOwnerForPinLogin(key);
      }

      await finishLogin();
    } catch (error: unknown) {
      let message = error instanceof Error ? error.message : t('alerts.network.loginFailed');
      if (message === t('alerts.auth.emailNotFound')) {
        message = t('auth.login.pinProfileMissing');
      }
      setAuthErrorMessage(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [
    ensureLegalAccepted,
    finishLogin,
    persistLegalAcceptanceIfNeeded,
    pinCode,
    selectedRole,
    showToast,
    signIn,
    staffPinKey,
    savedProfileName,
    t,
  ]);

  /** Проверка OTP для сброса PIN. */
  const verifyOtp = useCallback(async () => {
    const key = normalizedLoginEmail();
    const otpLength = getOtpCodeLength();
    if (otpCode.length < otpLength) {
      showToast(t('alerts.validation.invalidOtp', { length: otpLength }), 'error');
      return;
    }

    setLoading(true);
    setAuthErrorMessage('');
    try {
      const session = await verifyEmailOtp(key, otpCode, { forPinReset: true });
      otpSessionRef.current = session;
      otpPurposeRef.current = 'reset_pin';
      setPinSetupPurpose('reset_pin');
      setNewPin('');
      setNewPinConfirm('');
      setNewPinPhase('enter');
      setStep('new_pin');
      showToast(t('auth.login.otpVerified'), 'info');
    } catch (error: unknown) {
      const message = resolveAuthUserMessage(error, 'alerts.network.verifyFailed');
      setAuthErrorMessage(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [otpCode, showToast, t]);

  /** Проверка OTP при регистрации. */
  const verifyRegisterOtp = useCallback(async () => {
    const key = normalizedLoginEmail();
    const otpLength = getOtpCodeLength();
    if (otpCode.length < otpLength) {
      showToast(t('alerts.validation.invalidOtp', { length: otpLength }), 'error');
      return;
    }

    setLoading(true);
    setAuthErrorMessage('');
    try {
      const session = await verifyEmailOtp(key, otpCode, { forRegistration: true });
      otpSessionRef.current = session;
      otpPurposeRef.current = 'register';
      setPinSetupPurpose('register');
      setNewPin('');
      setNewPinConfirm('');
      setNewPinPhase('enter');
      setPvzName('');
      setPvzAddress('');
      setStep('new_pin');
      showToast(t('auth.login.otpVerified'), 'info');
    } catch (error: unknown) {
      const message = resolveAuthUserMessage(error, 'alerts.network.verifyFailed');
      setAuthErrorMessage(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [otpCode, showToast, t]);

  /** Установка PIN (сброс или регистрация) и вход / создание ПВЗ. */
  const resetPin = useCallback(async () => {
    const key = normalizedLoginEmail();

    if (newPinPhase === 'enter') {
      if (newPin.length < PIN_LENGTH) {
        showToast(t('alerts.validation.invalidPin'), 'error');
        return;
      }
      setNewPinPhase('confirm');
      setNewPinConfirm('');
      return;
    }

    if (newPinConfirm.length < PIN_LENGTH) {
      showToast(t('alerts.validation.invalidPin'), 'error');
      return;
    }
    if (newPin !== newPinConfirm) {
      showToast(t('auth.login.pinMismatch'), 'error');
      setNewPinConfirm('');
      return;
    }

    setLoading(true);
    try {
      if (otpPurposeRef.current === 'staff_setup') {
        const pinKey = cleanPhone(phone);
        if (pinKey.length !== 11) {
          showToast(t('alerts.validation.invalidPhone'), 'error');
          return;
        }
        await PinService.savePin(pinKey, newPin);
        await resetPinAttempts(pinKey);
        const setupToken =
          otpSessionRef.current?.accessToken ?? (await resolveAuthAccessToken());
        if (setupToken) {
          try {
            await setOwnerPinOnServer(newPin, setupToken);
          } catch (pinSyncError) {
            if (__DEV__) {
              console.warn('[Auth] staff setPin on server:', pinSyncError);
            }
          }
        }
        if (staffOtpSessionRef.current && selectedRole && isStaffRole(selectedRole)) {
          await saveStaffPinLoginSnapshot(pinKey, {
            userId: staffOtpSessionRef.current.userId,
            name: staffOtpSessionRef.current.name ?? savedProfileName,
            role: selectedRole,
            pvzId: staffOtpSessionRef.current.pvzId,
          });
        }
        let pending = pendingStaffInviteRef.current;
        if (!pending && staffOtpSessionRef.current) {
          pending = {
            invitationId: 'returning',
            pvzId: staffOtpSessionRef.current.pvzId ?? '',
          };
        }
        if (!pending) {
          showToast(t('alerts.network.loginFailed'), 'error');
          return;
        }
        try {
          if (pending.invitationId === 'returning') {
            await finishReturningStaffLogin(
              pending.pvzId,
              staffOtpSessionRef.current?.name
            );
          } else {
            await finishStaffLogin(pending.invitationId, pending.pvzId);
          }
          pendingStaffInviteRef.current = null;
        } catch (loginError: unknown) {
          pendingStaffInviteRef.current = pending;
          throw loginError;
        }
        return;
      }

      if (otpPurposeRef.current === 'reset_pin' && otpSessionRef.current?.accessToken) {
        await resetOwnerPinOnServer(
          key,
          otpCode,
          newPin,
          otpSessionRef.current.accessToken
        );
      } else if (otpSessionRef.current?.accessToken) {
        await setOwnerPinOnServer(newPin, otpSessionRef.current.accessToken);
      }

      await saveOwnerPin(key, newPin);
      await resetPinAttempts(key);

      if (otpPurposeRef.current === 'register') {
        setStep('create_pvz');
        return;
      }

      await finishLogin();
    } catch (error: unknown) {
      const message = resolveAuthUserMessage(error, 'alerts.network.loginFailed');
      setAuthErrorMessage(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [
    finishLogin,
    finishReturningStaffLogin,
    finishStaffLogin,
    newPin,
    newPinConfirm,
    newPinPhase,
    phone,
    showToast,
    t,
  ]);

  /** Создание первого ПВЗ после регистрации. */
  const createPvz = useCallback(async () => {
    const key = normalizedLoginEmail();
    const name = pvzName.trim();
    const address = pvzAddress.trim();
    if (!name) {
      showToast(t('alerts.validation.enterPvzName'), 'error');
      return;
    }
    if (!address) {
      showToast(t('alerts.validation.enterPvzAddress'), 'error');
      return;
    }

    const session = await resolveLoginSession(otpSessionRef);
    if (!session?.userId) {
      showToast(t('auth.login.sessionRequired'), 'error');
      return;
    }

    setLoading(true);
    try {
      const created = await createPvzOnApi({
        name,
        address,
        workingHours: '10:00 - 21:00',
        workStart: '10:00',
        workEnd: '21:00',
        phone: '',
      });
      const pvz: Pvz = { ...created, ownerId: session.userId };

      await DataService.savePvz(pvz);
      await SecureStore.setItemAsync('pvz', JSON.stringify(pvz));
      const owner = await ensureLocalOwnerRecord(key, session.userId, pvz.id);
      await saveOwnerPinLoginSnapshot(key, {
        ownerId: session.userId,
        name: owner.name,
        pvzId: pvz.id,
        pvzList: [pvz],
      });

      await finishLogin();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t('alerts.network.createPvzFailed');
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [finishLogin, pvzAddress, pvzName, showToast, t]);

  const switchToRegister = useCallback(() => {
    setFlowMode('register');
    setAuthErrorMessage('');
    setStep('email');
  }, []);

  const switchToLogin = useCallback(() => {
    setFlowMode('login');
    setAuthErrorMessage('');
    setStep('email');
  }, []);

  const handleBack = useCallback(() => {
    setAuthErrorMessage('');
    setPinError(false);
    if (step === 'email') {
      setStep('role');
      return;
    }
    if (step === 'phone') {
      setPhone('');
      setStep('role');
      return;
    }
    if (step === 'sms') {
      setOtpCode('');
      setStep('phone');
      return;
    }
    if (step === 'select_pvz') {
      setStep('sms');
      return;
    }
    if (step === 'quick_login') {
      if (cleanPhone(phone).length === 11) {
        setPinCode('');
        setStep('phone');
        return;
      }
      switchAccount();
      return;
    }
    if (step === 'pin') {
      setPinCode('');
      setStep('email');
      return;
    }
    if (step === 'otp_reset') {
      setOtpCode('');
      setStep('pin');
      return;
    }
    if (step === 'register_otp') {
      setOtpCode('');
      setStep('email');
      return;
    }
    if (step === 'create_pvz') {
      setPvzName('');
      setPvzAddress('');
      setNewPinPhase('confirm');
      setStep('new_pin');
      return;
    }
    if (step === 'new_pin') {
      if (newPinPhase === 'confirm') {
        setNewPinPhase('enter');
        setNewPinConfirm('');
        return;
      }
      setNewPin('');
      if (otpPurposeRef.current === 'staff_setup') {
        setStep('sms');
        return;
      }
      if (otpPurposeRef.current === 'register') {
        setStep('register_otp');
        return;
      }
      setStep('otp_reset');
    }
  }, [newPinPhase, step]);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (authErrorMessage) setAuthErrorMessage('');
  };

  const handlePinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, PIN_LENGTH);
    setPinCode(cleaned);
    if (pinError) setPinError(false);
    if (authErrorMessage) setAuthErrorMessage('');
  };

  const handleOtpChange = (value: string) => {
    const maxLen = step === 'sms' ? getPhoneOtpCodeLength() : getOtpCodeLength();
    const cleaned = value.replace(/\D/g, '').slice(0, maxLen);
    setOtpCode(cleaned);
    if (authErrorMessage) setAuthErrorMessage('');
  };

  const handleNewPinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (newPinPhase === 'enter') {
      setNewPin(cleaned);
    } else {
      setNewPinConfirm(cleaned);
    }
  };

  const handlePvzNameChange = (value: string) => {
    setPvzName(value);
    if (authErrorMessage) setAuthErrorMessage('');
  };

  const handlePvzAddressChange = (value: string) => {
    setPvzAddress(value);
    if (authErrorMessage) setAuthErrorMessage('');
  };

  const handlePhoneChange = (value: string) => {
    setPhone(formatPhoneInput(value));
    if (authErrorMessage) setAuthErrorMessage('');
  };

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    if (authErrorMessage) setAuthErrorMessage('');
  };

  const handleSelectPvz = (pvzId: string, invitationId?: string) => {
    setSelectedPvzId(pvzId);
    if (invitationId) setSelectedInvitationId(invitationId);
  };

  return {
    flowMode,
    step,
    selectedRole,
    phone,
    email,
    pinCode,
    otpCode,
    otpSendStatus,
    rateLimitWaitMinutes,
    staffInvitations,
    selectedPvzId,
    savedProfileName,
    newPin,
    newPinConfirm,
    newPinPhase,
    pvzName,
    pvzAddress,
    otpTimer,
    loading,
    checkingSavedProfile,
    authErrorMessage,
    pinError,
    pinLength: PIN_LENGTH,
    otpLength: step === 'sms' ? getPhoneOtpCodeLength() : getOtpCodeLength(),
    loginEmail: normalizedLoginEmail(),
    loginDisplay,
    phoneDisplay: formatPhoneForDisplay(cleanPhone(phone)),
    isRegisterFlow: pinSetupPurpose === 'register',
    isStaffPinSetup: pinSetupPurpose === 'staff_setup',
    handleSelectRole,
    handlePhoneChange,
    handleSelectPvz,
    submitRoleStep,
    submitPhoneStep,
    verifyStaffSms,
    resendStaffSms,
    completeStaffPvzSelection,
    switchAccount,
    handleEmailChange,
    handlePinChange,
    handleOtpChange,
    handleNewPinChange,
    handlePvzNameChange,
    handlePvzAddressChange,
    handleBack,
    checkEmail,
    submitEmailStep,
    verifyPin,
    handleStaffForgotPin,
    sendOtpForReset,
    sendRegisterOtp,
    handleForgotPin,
    verifyOtp,
    verifyRegisterOtp,
    resetPin,
    createPvz,
    switchToRegister,
    switchToLogin,
    isValidEmail: () => isValidEmail(email),
    legalAccepted,
    setLegalAccepted,
    requiresLegalConsent,
    canProceedWithLegal,
  };
}
