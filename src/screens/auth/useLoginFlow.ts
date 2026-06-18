import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types/user';
import {
  sendPhoneOtp,
  verifyPhoneOtp,
  sendEmailOtp,
  verifyEmailOtp,
  hasSupabaseSession,
  hasStoredAuthTokens,
  ensureSupabaseClientSession,
  resolveAuthAccessToken,
  usesSupabasePhoneOtp,
  usesSupabaseEmailOtp,
  getOtpCodeLength,
  resolveAuthUserMessage,
  canRegisterOwnerWithoutEmailOtp,
  isOtpSendMaybeDelivered,
  isOtpSendUncertain,
  isAuthRateLimitError,
  parseRateLimitWaitMinutes,
  getSupabaseSessionUserId,
  getCachedSessionUserId,
  migrateLocalUserId,
  DEMO_MODE,
  DEMO_OTP_CODE,
} from '../../services/SupabaseAuthService';
import PinService from '../../services/PinService';
import {
  getPinLockStatus,
  recordPinFailure,
  resetPinAttempts,
} from '../../utils/pinRateLimit';
import { safeParseJson } from '../../utils/safeJson';
import {
  formatPhoneInput,
  cleanPhone,
  isValidPhone,
  formatPhoneForDisplay,
} from '../../utils/phoneHelpers';
import {
  normalizeEmail,
  isValidEmail,
  getPinLoginKey,
  emailsMatch,
  loadLastOwnerEmail,
  saveLastOwnerEmail,
  clearLastOwnerEmail,
} from '../../utils/loginIdentifier';
import { LAST_LOGIN_PROFILE_KEY, type LastLoginProfile } from '../../context/auth/lastLoginProfile';
import { LoginStep, PinMode, LoginInvitationItem, LoginPvzItem, OtpChannel, OtpSendStatus } from './loginTypes';
import { isPinSetupComplete } from './loginHelpers';
import DataService from '../../services/DataService';
import {
  startLoginSupabaseRealtime,
  stopLoginSupabaseRealtime,
} from '../../services/SupabaseRealtimeService';
import { generateSecureId } from '../../utils/generateSecureId';
import { useToast } from '../../components/common/Toast';
import { checkSupabaseReachability } from '../../utils/supabaseConnectivity';
import { getSupabaseEnvDiagnostics } from '../../../lib/supabase';
import {
  getOtpRateLimitRemainingMs,
  rateLimitUntilFromMinutes,
  setOtpRateLimitUntil,
  clearOtpRateLimit,
} from '../../utils/otpRateLimit';
import {
  ensureLocalOwnerRecord,
  resolveOwnerPvzsForLogin,
} from '../../context/auth/ownerOps';
import { resolveOwnerRouteAfterEmailOtp } from '../../context/auth/remoteSignInFlow';

export function useLoginFlow() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<LoginStep>('role');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otpChannel, setOtpChannel] = useState<OtpChannel>('sms');
  const [smsCode, setSmsCode] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [pinMode, setPinMode] = useState<PinMode>('setup');
  const [loading, setLoading] = useState(false);
  const [invitations, setInvitations] = useState<LoginInvitationItem[]>([]);
  const [pvzList, setPvzList] = useState<LoginPvzItem[]>([]);
  const [selectedPvzId, setSelectedPvzId] = useState('');
  const [selectedInvitationId, setSelectedInvitationId] = useState('');
  const [newPvzName, setNewPvzName] = useState('');
  const [newPvzAddress, setNewPvzAddress] = useState('');
  const [smsTimer, setSmsTimer] = useState(0);
  const [savedProfileName, setSavedProfileName] = useState('');
  const [loginDisplay, setLoginDisplay] = useState('');
  const [checkingSavedProfile, setCheckingSavedProfile] = useState(true);
  const [pendingQuickLogin, setPendingQuickLogin] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [authErrorMessage, setAuthErrorMessage] = useState('');
  const [otpSendStatus, setOtpSendStatus] = useState<OtpSendStatus>('idle');
  const [rateLimitWaitMinutes, setRateLimitWaitMinutes] = useState(15);
  const [otpVerifiedInFlow, setOtpVerifiedInFlow] = useState(false);
  /** Email, на который ушёл текущий OTP (не теряется при переходе на шаг ввода кода). */
  const [otpVerifyEmail, setOtpVerifyEmail] = useState('');
  const emailPrefilledRef = useRef(false);

  const pinKey = () => getPinLoginKey(selectedRole, phone, email || otpVerifyEmail);

  /** Email для отправки OTP — всегда из поля ввода на шаге email. */
  const resolveSendEmail = (): string => normalizeEmail(email);

  /** Email для проверки OTP — зафиксирован при отправке. */
  const resolveVerifyEmail = (): string => {
    const candidate = otpVerifyEmail || email || loginDisplay;
    return normalizeEmail(candidate);
  };

  const resolveOtpChannel = (explicit?: OtpChannel): OtpChannel => {
    if (explicit) return explicit;
    if (selectedRole === 'owner') return 'email';
    return otpChannel === 'email' ? 'email' : 'sms';
  };

  const blockIfOtpRateLimited = async (): Promise<boolean> => {
    const remaining = await getOtpRateLimitRemainingMs();
    if (remaining <= 0) return false;
    const minutes = Math.max(1, Math.ceil(remaining / 60_000));
    setRateLimitWaitMinutes(minutes);
    setOtpSendStatus('rate_limited');
    const message = t('auth.otpDelivery.rateLimited', { minutes });
    setAuthErrorMessage(message);
    showToast(message, 'error');
    return true;
  };

  useEffect(() => {
    if (!__DEV__) return;
    let cancelled = false;
    void (async () => {
      const diag = getSupabaseEnvDiagnostics();
      if (cancelled) return;
      console.info('[Supabase] env:', diag);
      const reach = await checkSupabaseReachability();
      if (cancelled) return;
      console.info('[Supabase] reachability:', reach);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadSavedProfile = async () => {
      try {
        const raw = await SecureStore.getItemAsync(LAST_LOGIN_PROFILE_KEY);
        if (!raw) return;

        const profile = safeParseJson<LastLoginProfile | null>(raw, null);
        if (!profile) return;

        const key =
          profile.role === 'owner' && profile.email
            ? normalizeEmail(profile.email)
            : profile.phone || '';
        if (!key || !(await isPinSetupComplete(key))) return;

        const usersRaw = await SecureStore.getItemAsync('pvz_users');
        const users = safeParseJson<
          Array<{ phone: string; email: string; role: UserRole; status: string; name?: string }>
        >(usersRaw ?? '[]', []);

        const existingUser = users.find((u) => {
          if (u.role !== profile.role || u.status !== 'active') return false;
          if (profile.role === 'owner' && profile.email) {
            return emailsMatch(u.email, profile.email);
          }
          return u.phone === profile.phone;
        });
        if (!existingUser) return;

        if (profile.role === 'owner' && profile.email) {
          setEmail(profile.email);
          setLoginDisplay(profile.email);
          setOtpVerifyEmail(normalizeEmail(profile.email));
        } else if (profile.phone) {
          setPhone(formatPhoneForDisplay(profile.phone));
          setLoginDisplay(formatPhoneForDisplay(profile.phone));
        }

        setSelectedRole(profile.role);
        setSavedProfileName(profile.name || existingUser.name || '');
        setPinMode('entry');
        setStep('quickLogin');
      } catch (error) {
        console.error('Ошибка загрузки сохранённого профиля:', error);
      } finally {
        setCheckingSavedProfile(false);
      }
    };

    void loadSavedProfile();
  }, []);

  useEffect(() => {
    if (step !== 'email' || emailPrefilledRef.current) return;

    let cancelled = false;
    void (async () => {
      const savedEmail = await loadLastOwnerEmail();
      if (cancelled || !savedEmail) return;
      emailPrefilledRef.current = true;
      setEmail(savedEmail);
    })();

    return () => {
      cancelled = true;
    };
  }, [step]);

  const reloadPendingInvitations = useCallback(async () => {
    if (!selectedRole || selectedRole === 'owner') return;
    const cleanedPhone = cleanPhone(phone);
    if (!cleanedPhone) return;

    try {
      const invitesRaw = await SecureStore.getItemAsync('all_invitations');
      const allInvites = safeParseJson<
        Array<{ phone: string; status: string; role: string; id: string; pvzId: string; pvzName?: string; invitedByName?: string }>
      >(invitesRaw ?? '[]', []);
      const expectedRole = selectedRole === 'admin' ? 'admin' : 'employee';
      const userInvites = allInvites.filter(
        (invite) =>
          invite.phone.replace(/[^0-9]/g, '') === cleanedPhone &&
          invite.status === 'pending' &&
          invite.role === expectedRole
      );

      setInvitations(
        userInvites.map((invite) => ({
          id: invite.id,
          pvzId: invite.pvzId,
          pvzName: invite.pvzName ?? 'ПВЗ',
          invitedByName: invite.invitedByName,
        }))
      );
      if (userInvites.length > 0) {
        const stillSelected = userInvites.some((invite) => invite.id === selectedInvitationId);
        const nextInvite = stillSelected
          ? userInvites.find((invite) => invite.id === selectedInvitationId)
          : userInvites[0];
        if (nextInvite) {
          setSelectedPvzId(nextInvite.pvzId);
          setSelectedInvitationId(nextInvite.id);
        }
      }
    } catch (error) {
      console.warn('reloadPendingInvitations:', error);
    }
  }, [phone, selectedRole, selectedInvitationId]);

  useEffect(() => {
    let unsub = () => {};
    let active = true;

    void (async () => {
      const cleanedPhone = cleanPhone(phone);
      if (!cleanedPhone || !selectedRole || selectedRole === 'owner') return;
      if (!['sms', 'selectPvz', 'pin'].includes(step)) return;
      if (!(await hasSupabaseSession())) return;

      await startLoginSupabaseRealtime();
      if (!active) return;

      await DataService.refreshInvitationsForLogin();
      await reloadPendingInvitations();
      unsub = DataService.subscribe('all_invitations', reloadPendingInvitations);
    })();

    return () => {
      active = false;
      unsub();
      stopLoginSupabaseRealtime();
    };
  }, [phone, selectedRole, step, reloadPendingInvitations]);

  useEffect(() => {
    if (smsTimer <= 0) return;
    const interval = setInterval(() => {
      setSmsTimer((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [smsTimer]);

  const goToPinStep = async (key: string, mode?: PinMode) => {
    if (mode) {
      setPinMode(mode);
    } else {
      setPinMode((await isPinSetupComplete(key)) ? 'entry' : 'setup');
    }
    setPinCode('');
    setStep('pin');
  };

  const handleRoleContinue = () => {
    if (!selectedRole) return;
    if (selectedRole === 'owner') {
      setOtpChannel('email');
      setStep('email');
      return;
    }
    setOtpChannel('sms');
    setStep('phone');
  };

  const handleSwitchAccount = () => {
    setStep('role');
    setPhone('');
    setEmail('');
    setOtpVerifyEmail('');
    setOtpChannel('sms');
    setSelectedRole(null);
    setPinCode('');
    setSavedProfileName('');
    setLoginDisplay('');
    setSmsCode('');
    setOtpVerifiedInFlow(false);
    setOtpSendStatus('idle');
    setSmsTimer(0);
    emailPrefilledRef.current = false;
    void clearLastOwnerEmail();
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    const normalized = normalizeEmail(value);
    if (otpVerifyEmail && normalized && !emailsMatch(normalized, otpVerifyEmail)) {
      setOtpVerifyEmail('');
      setSmsCode('');
      setSmsTimer(0);
      setOtpSendStatus('idle');
      setAuthErrorMessage('');
    }
  };

  const tryQuickPinEntry = async (key: string): Promise<boolean> => {
    if (!(await isPinSetupComplete(key))) return false;

    const usersRaw = await SecureStore.getItemAsync('pvz_users');
    const users = safeParseJson<
      Array<{ phone: string; email: string; role: UserRole; status: string }>
    >(usersRaw ?? '[]', []);

    const existingUser = users.find((u) => {
      if (u.role !== selectedRole || u.status !== 'active') return false;
      if (selectedRole === 'owner') {
        return emailsMatch(u.email, key);
      }
      return u.phone === key;
    });
    if (!existingUser) return false;

    if (selectedRole === 'owner' && usesSupabaseEmailOtp() && !DEMO_MODE) {
      const clientReady = await ensureSupabaseClientSession();
      if (!clientReady && !(await hasStoredAuthTokens())) {
        return false;
      }
    }

    await goToPinStep(key, 'entry');
    return true;
  };

  const requestOwnerEmailOtpForSession = async (loginKey: string): Promise<boolean> => {
    const normalizedEmail = normalizeEmail(loginKey);
    setEmail(normalizedEmail);
    setOtpVerifyEmail(normalizedEmail);
    setLoginDisplay(normalizedEmail);
    setPendingQuickLogin(true);
    setOtpChannel('email');
    showToast(t('auth.sessionExpiredEmail'), 'info');
    if (step !== 'sms') {
      setStep('email');
    }
    await sendOtp('email', normalizedEmail);
    return true;
  };

  const completeLogin = async (key: string) => {
    if (!(await PinService.hasPin(key))) {
      throw new Error(t('alerts.validation.pinNotFound'));
    }

    const clientReady = await ensureSupabaseClientSession();

    const ownerNeedsRemoteSession =
      selectedRole === 'owner' && usesSupabaseEmailOtp() && !DEMO_MODE;

    if (ownerNeedsRemoteSession && !otpVerifiedInFlow && !clientReady) {
      await requestOwnerEmailOtpForSession(key);
      return;
    }

    const isOwner = selectedRole === 'owner';
    const signInOptions =
      selectedRole !== 'owner' && (selectedInvitationId || selectedPvzId)
        ? {
            invitationId: selectedInvitationId || undefined,
            pvzId: selectedPvzId || undefined,
            loginMethod: 'phone' as const,
          }
        : { loginMethod: isOwner ? ('email' as const) : ('phone' as const) };

    await signIn(key, (selectedRole || 'employee') as UserRole, signInOptions);
    setOtpVerifiedInFlow(false);
  };

  const routeOwnerRegistration = async (
    loginEmail?: string,
    sessionUserId?: string | null,
    sessionAccessToken?: string | null
  ) => {
    const normalizedEmail = normalizeEmail(loginEmail ?? resolveVerifyEmail());
    if (!isValidEmail(normalizedEmail)) {
      setStep('email');
      return;
    }

    const hasLocalPin = await isPinSetupComplete(normalizedEmail);
    const resolution = await resolveOwnerRouteAfterEmailOtp(
      normalizedEmail,
      hasLocalPin,
      sessionUserId,
      sessionAccessToken
    );

    if (resolution.route === 'pin') {
      if (resolution.pvzList.length === 1) {
        setSelectedPvzId(resolution.pvzList[0].id);
      }
      await goToPinStep(normalizedEmail);
      return;
    }

    if (resolution.route === 'selectPvz') {
      setPvzList(
        resolution.pvzList.map((pvz) => ({
          id: pvz.id,
          name: pvz.name,
          address: pvz.address,
        }))
      );
      setSelectedPvzId(resolution.pvzList[0].id);
      if (resolution.pvzList.length === 1 && hasLocalPin) {
        await goToPinStep(normalizedEmail, 'entry');
        return;
      }
      setStep('selectPvz');
      return;
    }

    setStep('createPvz');
  };

  const goToOtpStep = (channel: OtpChannel) => {
    setOtpChannel(channel);
    setSmsCode('');
    setAuthErrorMessage('');
    setOtpSendStatus('sending');
    setStep('sms');
    setSmsTimer(60);
  };

  const handleOtpSendError = (
    error: unknown,
    fallbackKey: string,
    rollbackStep: LoginStep,
    channel: OtpChannel
  ): boolean => {
    if (isAuthRateLimitError(error)) {
      const minutes = parseRateLimitWaitMinutes(error);
      void setOtpRateLimitUntil(rateLimitUntilFromMinutes(minutes));
      setRateLimitWaitMinutes(minutes);
      setOtpSendStatus('rate_limited');
      const message = t('auth.otpDelivery.rateLimited', { minutes });
      setAuthErrorMessage(message);
      showToast(message, 'error');
      return true;
    }
    if (isOtpSendUncertain(error)) {
      setOtpSendStatus('uncertain');
      setAuthErrorMessage('');
      showToast(
        channel === 'email' ? t('auth.emailOtp.sendUncertain') : t('auth.sms.sendUncertain'),
        'info'
      );
      if (channel === 'email') {
        void saveLastOwnerEmail(resolveVerifyEmail());
      }
      return true;
    }
    if (isOtpSendMaybeDelivered(error)) {
      setOtpSendStatus('sent');
      setAuthErrorMessage('');
      showToast(
        channel === 'email' ? t('auth.emailOtp.checkInbox') : t('auth.sms.checkPhone'),
        'info'
      );
      if (channel === 'email') {
        void saveLastOwnerEmail(resolveVerifyEmail());
      }
      return true;
    }
    setOtpSendStatus('failed');
    setStep(rollbackStep);
    setSmsTimer(0);
    const message = resolveAuthUserMessage(error, fallbackKey);
    setAuthErrorMessage(message);
    showToast(message, 'error');
    return false;
  };

  const sendOtp = async (explicitChannel?: OtpChannel, targetEmail?: string) => {
    const channel = resolveOtpChannel(explicitChannel);

    if (await blockIfOtpRateLimited()) {
      if (step !== 'sms') {
        goToOtpStep(channel);
      }
      return;
    }

    if (channel === 'email') {
      const normalizedEmail = targetEmail
        ? normalizeEmail(targetEmail)
        : step === 'email'
          ? resolveSendEmail()
          : resolveVerifyEmail();
      if (!isValidEmail(normalizedEmail)) {
        showToast(t('alerts.validation.invalidEmail'), 'error');
        return;
      }
      if (normalizedEmail !== email) {
        setEmail(normalizedEmail);
      }
      if (smsTimer > 0 && step === 'sms') return;

      setOtpVerifyEmail(normalizedEmail);
      goToOtpStep('email');
      setOtpSendStatus('sending');
      try {
        await sendEmailOtp(normalizedEmail);
        setOtpSendStatus('sent');
        setAuthErrorMessage('');
        await clearOtpRateLimit();
        await saveLastOwnerEmail(normalizedEmail);
        showToast(t('auth.emailOtp.checkInbox'), 'info');
      } catch (error: unknown) {
        handleOtpSendError(error, 'alerts.network.emailFailed', 'email', 'email');
      }
      return;
    }

    if (!isValidPhone(phone)) {
      showToast(t('alerts.validation.invalidPhone'), 'error');
      return;
    }
    if (smsTimer > 0 && step === 'sms') return;

    goToOtpStep('sms');
    setOtpSendStatus('sending');
    try {
      await sendPhoneOtp(cleanPhone(phone));
        setOtpSendStatus('sent');
        setAuthErrorMessage('');
        if (DEMO_MODE) {
          showToast(t('auth.sms.demoHint', { code: DEMO_OTP_CODE }), 'info');
        } else {
          showToast(t('auth.sms.checkPhone'), 'info');
        }
    } catch (error: unknown) {
      handleOtpSendError(error, 'alerts.network.smsFailed', 'phone', 'sms');
    }
  };

  const routeToInvitation = async (cleanedPhone: string) => {
    const usersRaw = await SecureStore.getItemAsync('pvz_users');
    const users = safeParseJson<
      Array<{ phone: string; role: UserRole; status: string }>
    >(usersRaw ?? '[]', []);
    const existingUser = users.find(
      (u) => u.phone === cleanedPhone && u.role === selectedRole && u.status === 'active'
    );
    if (existingUser) {
      await goToPinStep(cleanedPhone);
      return true;
    }

    const invitesRaw = await SecureStore.getItemAsync('all_invitations');
    const allInvites = safeParseJson<
      Array<LoginInvitationItem & { phone: string; status: string; role: string }>
    >(invitesRaw ?? '[]', []);
    const expectedRole = selectedRole === 'admin' ? 'admin' : 'employee';
    let userInvites = allInvites.filter(
      (i) =>
        i.phone.replace(/[^0-9]/g, '') === cleanedPhone &&
        i.status === 'pending' &&
        i.role === expectedRole
    );

    if (userInvites.length === 0) {
      const remoteInvites = await DataService.getPendingInvitationsForLoginPhone(
        cleanedPhone,
        expectedRole
      );
      userInvites = remoteInvites as Array<
        LoginInvitationItem & { phone: string; status: string; role: string }
      >;
    }

    if (userInvites.length === 0) return false;

    setInvitations(userInvites);
    setSelectedPvzId(userInvites[0].pvzId);
    setSelectedInvitationId(userInvites[0].id);

    if (userInvites.length === 1) {
      await goToPinStep(cleanedPhone, 'setup');
    } else {
      setStep('selectPvz');
    }
    return true;
  };

  const handleEmailContinue = async () => {
    if (!isValidEmail(email)) {
      showToast(t('alerts.validation.invalidEmail'), 'error');
      return;
    }
    const normalizedEmail = normalizeEmail(email);
    setLoginDisplay(normalizedEmail);
    setEmail(normalizedEmail);
    setOtpVerifyEmail('');

    if (await tryQuickPinEntry(normalizedEmail)) return;

    if (canRegisterOwnerWithoutEmailOtp()) {
      await routeOwnerRegistration(normalizedEmail);
      return;
    }

    setOtpChannel('email');
    await sendOtp('email', normalizedEmail);
  };

  const handlePhoneContinue = async () => {
    if (!isValidPhone(phone)) {
      showToast(t('alerts.validation.invalidPhone'), 'error');
      return;
    }
    const cleanedPhone = cleanPhone(phone);
    setLoginDisplay(formatPhoneForDisplay(cleanedPhone));

    if (await tryQuickPinEntry(cleanedPhone)) return;

    if (!usesSupabasePhoneOtp()) {
      if (await routeToInvitation(cleanedPhone)) return;
      showToast(t('alerts.validation.noInvites'), 'error');
      return;
    }

    setOtpChannel('sms');
    await sendOtp('sms');
  };

  const handleVerifyOtp = async (codeOverride?: string) => {
    const otpLength = getOtpCodeLength();
    const code = codeOverride ?? smsCode;
    if (!code || code.length < otpLength) {
      showToast(t('alerts.validation.invalidOtp', { length: otpLength }), 'error');
      return;
    }
    setLoading(true);
    setAuthErrorMessage('');
    try {
      const channel = resolveOtpChannel();

      if (channel === 'email' || selectedRole === 'owner') {
        const normalizedEmail = resolveVerifyEmail();
        if (!isValidEmail(normalizedEmail)) {
          showToast(t('alerts.validation.invalidEmail'), 'error');
          setStep('email');
          return;
        }
        const otpSession = await verifyEmailOtp(normalizedEmail, code);
        setOtpVerifiedInFlow(true);

        if (pendingQuickLogin) {
          setPendingQuickLogin(false);
          setSmsCode('');
          await completeLogin(normalizedEmail);
          return;
        }

        await routeOwnerRegistration(
          normalizedEmail,
          otpSession.userId,
          otpSession.accessToken
        );
        return;
      }

      const cleanedPhone = cleanPhone(phone);
      await verifyPhoneOtp(cleanedPhone, code);
      setOtpVerifiedInFlow(true);

      if (pendingQuickLogin) {
        setPendingQuickLogin(false);
        setSmsCode('');
        await completeLogin(cleanedPhone);
        return;
      }

      const usersRaw = await SecureStore.getItemAsync('pvz_users');
      const users = safeParseJson<
        Array<{ phone: string; role: UserRole; status: string; id?: string }>
      >(usersRaw ?? '[]', []);

      const existingUser = users.find(
        (u) => u.phone === cleanedPhone && u.role === selectedRole && u.status === 'active'
      );
      if (existingUser) {
        await goToPinStep(cleanedPhone);
        return;
      }

      const expectedRole = selectedRole === 'admin' ? 'admin' : 'employee';
      const userInvites = await DataService.getPendingInvitationsForLoginPhone(
        cleanedPhone,
        expectedRole
      );

      if (userInvites.length === 0) {
        showToast(t('alerts.validation.noInvites'), 'error');
        return;
      }

      setInvitations(userInvites);
      setSelectedPvzId(userInvites[0].pvzId);
      setSelectedInvitationId(userInvites[0].id);

      if (userInvites.length === 1) {
        await goToPinStep(cleanedPhone, 'setup');
      } else {
        setStep('selectPvz');
      }
    } catch (error: unknown) {
      const channel = resolveOtpChannel();
      const isOwnerFlow = channel === 'email' || selectedRole === 'owner';

      if (isOwnerFlow) {
        const clientReady = await ensureSupabaseClientSession();
        const hasStored = await hasStoredAuthTokens();
        if (clientReady || hasStored) {
          const normalizedEmail = resolveVerifyEmail();
          if (!isValidEmail(normalizedEmail)) {
            setStep('email');
            return;
          }
          setOtpVerifiedInFlow(true);
          setSmsCode('');
          setAuthErrorMessage('');

          if (pendingQuickLogin) {
            setPendingQuickLogin(false);
            await completeLogin(normalizedEmail);
            return;
          }

          await routeOwnerRegistration(
            normalizedEmail,
            (await getSupabaseSessionUserId()) ?? getCachedSessionUserId(),
            await resolveAuthAccessToken()
          );
          return;
        }
      }

      const message = resolveAuthUserMessage(error, 'alerts.network.verifyFailed');
      setAuthErrorMessage(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPin = () => {
    const key = pinKey();
    if (!key) return;

    const isOwner = selectedRole === 'owner';
    Alert.alert(
      t('auth.pin.forgotTitle'),
      isOwner ? t('auth.pin.forgotMessageEmail') : t('auth.pin.forgotMessage'),
      [
        { text: t('common.actions.cancel'), style: 'cancel' },
        {
          text: t('auth.pin.forgotConfirm'),
          onPress: () => {
            void (async () => {
              await PinService.clearPin(key);
              await resetPinAttempts(key);
              setPinCode('');
              setPinMode('setup');
              setPinError(false);

              if (isOwner) {
                if (!usesSupabaseEmailOtp()) {
                  showToast(t('auth.pin.otpSkipped'), 'info');
                  return;
                }
                setPendingQuickLogin(true);
                setStep('email');
                await sendOtp('email');
                return;
              }

              if (!usesSupabasePhoneOtp()) {
                showToast(t('auth.pin.otpSkipped'), 'info');
                return;
              }
              setPendingQuickLogin(true);
              setStep('phone');
              await sendOtp('sms');
            })();
          },
        },
      ]
    );
  };

  const handlePinSubmit = async () => {
    if (pinCode.length < 4) {
      showToast(t('alerts.validation.invalidPin'), 'error');
      return;
    }
    setLoading(true);
    setPinError(false);
    const key = pinKey();
    try {
      const lockStatus = await getPinLockStatus(key);
      if (lockStatus.locked) {
        const seconds = Math.ceil(lockStatus.retryAfterMs / 1000);
        Alert.alert(t('common.error.title'), t('auth.pin.locked', { seconds }));
        return;
      }

      if (pinMode === 'entry') {
        const valid = await PinService.verifyPin(key, pinCode);
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
        await resetPinAttempts(key);
        await completeLogin(key);
      } else {
        await PinService.savePin(key, pinCode);
        setLoading(false);
        await completeLogin(key);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('alerts.network.loginFailed');
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePvz = async () => {
    if (!newPvzName.trim()) {
      showToast(t('alerts.validation.enterPvzName'), 'error');
      return;
    }
    if (!newPvzAddress.trim()) {
      showToast(t('alerts.validation.enterPvzAddress'), 'error');
      return;
    }
    setLoading(true);
    try {
      const normalizedEmail = resolveVerifyEmail();
      const { pvzList } = await resolveOwnerPvzsForLogin(normalizedEmail);

      if (pvzList.length > 0) {
        setPvzList(
          pvzList.map((pvz) => ({
            id: pvz.id,
            name: pvz.name,
            address: pvz.address,
          }))
        );
        setSelectedPvzId(pvzList[0].id);
        setStep('selectPvz');
        return;
      }

      const sessionOwnerId = await getSupabaseSessionUserId();
      const usersRaw = await SecureStore.getItemAsync('pvz_users');
      const users = safeParseJson<
        Array<{ id: string; email: string; role: UserRole; status: string }>
      >(usersRaw ?? '[]', []);
      const existingOwner = users.find(
        (u) => u.role === 'owner' && u.status === 'active' && emailsMatch(u.email, normalizedEmail)
      );

      let ownerId = sessionOwnerId ?? existingOwner?.id ?? generateSecureId('owner');

      if (existingOwner && sessionOwnerId && existingOwner.id !== sessionOwnerId) {
        await migrateLocalUserId(existingOwner.id, sessionOwnerId, 'owner');
        ownerId = sessionOwnerId;
      }

      const existingOwnerPvzs = await DataService.getPvzsByOwner(ownerId);
      if (existingOwnerPvzs.length > 0) {
        setPvzList(
          existingOwnerPvzs.map((pvz) => ({
            id: pvz.id,
            name: pvz.name,
            address: pvz.address,
          }))
        );
        setSelectedPvzId(existingOwnerPvzs[0].id);
        setStep('selectPvz');
        return;
      }

      const newPvz = {
        id: generateSecureId('pvz'),
        name: newPvzName.trim(),
        address: newPvzAddress.trim(),
        workStart: '09:00',
        workEnd: '21:00',
        workingHours: '09:00 - 21:00',
        phone: '',
        ownerId,
      };

      await DataService.savePvz(newPvz);

      await ensureLocalOwnerRecord(
        normalizedEmail,
        ownerId,
        newPvz.id,
        t('common.roles.ownerShort')
      );

      await goToPinStep(normalizedEmail, 'setup');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('alerts.network.createPvzFailed');
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPvzContinue = async () => {
    if (!selectedPvzId) {
      showToast(t('alerts.validation.selectPvz'), 'error');
      return;
    }
    if (selectedRole !== 'owner') {
      const invite = invitations.find((inv) => inv.pvzId === selectedPvzId);
      if (invite) setSelectedInvitationId(invite.id);
      await goToPinStep(cleanPhone(phone), 'setup');
      return;
    }
    await goToPinStep(resolveVerifyEmail());
  };

  const handlePinCodeChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length <= 4) {
      setPinCode(cleaned);
      if (pinError) setPinError(false);
    }
  };

  const handleSmsCodeChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length <= getOtpCodeLength()) {
      setSmsCode(cleaned);
      if (authErrorMessage) setAuthErrorMessage('');
    }
  };

  const otpContactDisplay =
    otpChannel === 'email'
      ? resolveVerifyEmail() || loginDisplay
      : formatPhoneForDisplay(cleanPhone(phone));

  return {
    step,
    setStep,
    selectedRole,
    setSelectedRole,
    email,
    setEmail,
    phone,
    setPhone: (text: string) => setPhone(formatPhoneInput(text)),
    otpChannel,
    otpContactDisplay,
    smsCode,
    pinCode,
    pinMode,
    loading,
    invitations,
    pvzList,
    selectedPvzId,
    setSelectedPvzId,
    selectedInvitationId,
    setSelectedInvitationId,
    newPvzName,
    setNewPvzName,
    newPvzAddress,
    setNewPvzAddress,
    smsTimer,
    savedProfileName,
    loginDisplay,
    checkingSavedProfile,
    pinError,
    authErrorMessage,
    otpSendStatus,
    rateLimitWaitMinutes,
    handleSwitchAccount,
    handleRoleContinue,
    handleEmailChange,
    handleEmailContinue,
    handlePhoneContinue,
    handleSendOtp: () => sendOtp(),
    handleVerifyOtp,
    handlePinSubmit,
    handleForgotPin,
    handleCreatePvz,
    handleSelectPvzContinue,
    handlePinCodeChange,
    handleSmsCodeChange,
    isValidPhone: () => isValidPhone(phone),
    isValidEmail: () => isValidEmail(email),
  };
}
