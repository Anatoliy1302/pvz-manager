import { useState, useEffect, useCallback, useRef, type MutableRefObject } from 'react';
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
  getSupabaseSessionUserId,
  resolveAuthAccessToken,
  isOtpSendMaybeDelivered,
  signInWithEmailPin,
  setOwnerPinOnServer,
  resetOwnerPinOnServer,
  sendPhoneOtp,
  verifyPhoneOtpSession,
  prefetchEmployeePhoneAuth,
} from '../../services/SupabaseAuthService';
import { AuthApiError } from '../../../lib/authApi';
import { checkPendingInvitationForPhone } from '../../services/SupabaseInvitationService';
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
import { ensureLocalOwnerRecord, resolveOwnerPvzsForLogin } from '../../context/auth/ownerOps';
import {
  checkOwnerEmailExistsRemotely,
  clearOrphanedOwnerLocalAuth,
} from '../../context/auth/ownerRegistrationCleanup';
import { syncOwnerPinHashToCloud } from '../../services/ownerPinCloudSync';
import { saveOwnerPinLoginSnapshot } from '../../utils/ownerPinLoginStore';
import DataService from '../../services/DataService';
import { createPvz as createPvzOnApi } from '../../../lib/pvzService';
import type { Pvz, UserRole } from '../../types/user';
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
type OtpPurpose = 'reset_pin' | 'register';

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
  const userId = getCachedSessionUserId() ?? (await getSupabaseSessionUserId());
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

  const otpSessionRef = useRef<OtpSession | null>(null);
  const otpPurposeRef = useRef<OtpPurpose>('reset_pin');
  const loginEmailRef = useRef('');

  const normalizedLoginEmail = () => normalizeEmail(loginEmailRef.current || email);

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

  const finishStaffLogin = useCallback(
    async (invitationId: string, pvzId: string) => {
      const normalized = cleanPhone(phone);
      const role = selectedRole;
      if (!role || role === 'owner') return;

      await signIn(normalized, role, {
        loginMethod: 'phone',
        invitationId,
        pvzId,
      });
    },
    [phone, selectedRole, signIn]
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

    const local = await DataService.getPendingInvitationsForLoginPhone(normalized, role);
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
    setPhone('');
    setOtpSendStatus('idle');
    setStep('phone');
  }, [selectedRole, showToast, t]);

  const submitPhoneStep = useCallback(async () => {
    const normalized = cleanPhone(phone);
    if (!selectedRole || selectedRole === 'owner') return;
    if (!isValidPhone(normalized)) {
      showToast(t('alerts.validation.invalidPhone'), 'error');
      return;
    }

    setLoading(true);
    setAuthErrorMessage('');
    try {
      let hasRemoteInvite = false;
      try {
        hasRemoteInvite = await checkPendingInvitationForPhone(normalized, selectedRole);
      } catch (checkError) {
        const localInvitesOnCheckFail = await DataService.getPendingInvitationsForLoginPhone(
          normalized,
          selectedRole
        );
        if (localInvitesOnCheckFail.length === 0) {
          const message = resolveAuthUserMessage(checkError, 'alerts.network.loginFailed');
          setAuthErrorMessage(message);
          showToast(message, 'error');
          return;
        }
      }

      const localInvites = await DataService.getPendingInvitationsForLoginPhone(
        normalized,
        selectedRole
      );
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
  }, [phone, selectedRole, showToast, t]);

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

      if (DEMO_MODE) {
        if (otpCode !== DEMO_OTP_CODE) {
          showToast(t('alerts.validation.invalidOtp', { length: otpLength }), 'error');
          return;
        }
      } else {
        const session = await verifyPhoneOtpSession(normalized, otpCode, role);
        if (session.invitations?.length) {
          invitations = mapInvitations(session.invitations);
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
          for (const inv of session.invitations) {
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

      if (invitations.length === 0) {
        const message = t('alerts.auth.invitationRevoked');
        setAuthErrorMessage(message);
        showToast(message, 'error');
        return;
      }

      if (invitations.length === 1) {
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
    finishStaffLogin,
    mapInvitations,
    otpCode,
    phone,
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
      await finishStaffLogin(selectedInvitationId, selectedPvzId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('alerts.network.loginFailed');
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [finishStaffLogin, selectedInvitationId, selectedPvzId, showToast, t]);

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
    const normalized = normalizeEmail(email);
    setLoading(true);
    setAuthErrorMessage('');
    try {
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
      await restoreOwnerForPinLogin(normalized);
      setStep('pin');
    } catch (error: unknown) {
      const message = resolveAuthUserMessage(error, 'alerts.network.serverUnavailable');
      setAuthErrorMessage(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [email, showToast, t]);

  /** Шаг 1 (регистрация): email → OTP. */
  const startRegister = useCallback(async () => {
    if (!isValidEmail(email)) {
      showToast(t('alerts.validation.invalidEmail'), 'error');
      return;
    }
    const normalized = normalizeEmail(email);
    setLoading(true);
    setAuthErrorMessage('');
    try {
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
  }, [email, showToast, t]);

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
    const key = normalizedLoginEmail();
    if (pinCode.length < PIN_LENGTH) {
      showToast(t('alerts.validation.invalidPin'), 'error');
      return;
    }

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
  }, [finishLogin, pinCode, showToast, t]);

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
      const message = error instanceof Error ? error.message : t('alerts.network.loginFailed');
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [finishLogin, newPin, newPinConfirm, newPinPhase, showToast, t]);

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
    phoneDisplay: formatPhoneForDisplay(cleanPhone(phone)),
    isRegisterFlow: pinSetupPurpose === 'register',
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
  };
}
