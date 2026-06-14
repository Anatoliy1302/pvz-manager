import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types/user';
import {
  sendPhoneOtp,
  verifyPhoneOtp,
  hasSupabaseSession,
  isSupabaseProviderConfigError,
  usesSupabasePhoneOtp,
  getOtpCodeLength,
  DEMO_MODE,
  canRegisterOwnerWithoutPhoneOtp,
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
import { LAST_LOGIN_PROFILE_KEY, type LastLoginProfile } from '../../context/auth/lastLoginProfile';
import { LoginStep, PinMode, LoginInvitationItem, LoginPvzItem } from './loginTypes';
import { isPinSetupComplete } from './loginHelpers';
import DataService from '../../services/DataService';
import {
  startLoginSupabaseRealtime,
  stopLoginSupabaseRealtime,
} from '../../services/SupabaseRealtimeService';
import { generateSecureId } from '../../utils/generateSecureId';
import { useToast } from '../../components/common/Toast';

export function useLoginFlow() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<LoginStep>('role');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [phone, setPhone] = useState('');
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
  const [checkingSavedProfile, setCheckingSavedProfile] = useState(true);
  const [pendingQuickLogin, setPendingQuickLogin] = useState(false);
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    const loadSavedProfile = async () => {
      try {
        const raw = await SecureStore.getItemAsync(LAST_LOGIN_PROFILE_KEY);
        if (!raw) return;

        const profile = safeParseJson<LastLoginProfile | null>(raw, null);
        if (!profile) return;
        if (!(await isPinSetupComplete(profile.phone))) return;

        const usersRaw = await SecureStore.getItemAsync('pvz_users');
        const users = safeParseJson<Array<{ phone: string; role: UserRole; status: string; name?: string }>>(
          usersRaw ?? '[]',
          []
        );
        const existingUser = users.find(
          (u) => u.phone === profile.phone && u.role === profile.role && u.status === 'active'
        );
        if (!existingUser) return;

        setPhone(formatPhoneForDisplay(profile.phone));
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

  const goToPinStep = async (cleanedPhone: string, mode?: PinMode) => {
    if (mode) {
      setPinMode(mode);
    } else {
      setPinMode((await isPinSetupComplete(cleanedPhone)) ? 'entry' : 'setup');
    }
    setPinCode('');
    setStep('pin');
  };

  const handleSwitchAccount = () => {
    setStep('role');
    setPhone('');
    setSelectedRole(null);
    setPinCode('');
    setSavedProfileName('');
    setSmsCode('');
  };

  const tryQuickPinEntry = async (cleanedPhone: string): Promise<boolean> => {
    if (!(await isPinSetupComplete(cleanedPhone))) return false;

    const usersRaw = await SecureStore.getItemAsync('pvz_users');
    const users = safeParseJson<Array<{ phone: string; role: UserRole; status: string }>>(
      usersRaw ?? '[]',
      []
    );
    const existingUser = users.find(
      (u) => u.phone === cleanedPhone && u.role === selectedRole && u.status === 'active'
    );
    if (!existingUser) return false;

    await goToPinStep(cleanedPhone, 'entry');
    return true;
  };

  const completeLogin = async (cleanedPhone: string) => {
    if (!(await PinService.hasPin(cleanedPhone))) {
      throw new Error(t('alerts.validation.pinNotFound'));
    }

    if (usesSupabasePhoneOtp() && !(await hasSupabaseSession())) {
      setPendingQuickLogin(true);
      setLoading(true);
      try {
        await sendPhoneOtp(cleanedPhone);
        setSmsTimer(60);
        setSmsCode('');
        setStep('sms');
        showToast(t('auth.sessionExpired'), 'info');
      } catch (error: unknown) {
        if (DEMO_MODE && isSupabaseProviderConfigError(error)) {
          const signInOptions =
            selectedRole !== 'owner' && (selectedInvitationId || selectedPvzId)
              ? {
                  invitationId: selectedInvitationId || undefined,
                  pvzId: selectedPvzId || undefined,
                }
              : {};
          await signIn(cleanedPhone, (selectedRole || 'employee') as UserRole, signInOptions);
          return;
        }
        throw error;
      } finally {
        setLoading(false);
      }
      return;
    }

    const signInOptions =
      selectedRole !== 'owner' && (selectedInvitationId || selectedPvzId)
        ? {
            invitationId: selectedInvitationId || undefined,
            pvzId: selectedPvzId || undefined,
          }
        : {};

    await signIn(cleanedPhone, (selectedRole || 'employee') as UserRole, signInOptions);
  };

  const routeOwnerRegistration = async (cleanedPhone: string) => {
    const usersRaw = await SecureStore.getItemAsync('pvz_users');
    const users = safeParseJson<
      Array<{ phone: string; role: UserRole; status: string; id?: string }>
    >(usersRaw ?? '[]', []);

    const existingUser = users.find(
      (u) => u.phone === cleanedPhone && u.role === 'owner' && u.status === 'active'
    );
    if (existingUser) {
      await goToPinStep(cleanedPhone);
      return;
    }

    const pvzsRaw = await SecureStore.getItemAsync('pvz_list');
    const allPvzs = safeParseJson<Array<LoginPvzItem & { ownerId: string }>>(pvzsRaw ?? '[]', []);
    const ownerPvzs = allPvzs.filter((p) => {
      const owner = users.find((u) => u.id === p.ownerId);
      return owner?.phone === cleanedPhone && owner?.role === 'owner' && owner?.status === 'active';
    });

    if (ownerPvzs.length > 0) {
      setPvzList(ownerPvzs);
      setSelectedPvzId(ownerPvzs[0].id);
      setStep('selectPvz');
    } else {
      setStep('createPvz');
    }
  };

  const handleSendSms = async () => {
    if (!isValidPhone(phone)) {
      showToast(t('alerts.validation.invalidPhone'), 'error');
      return;
    }
    setLoading(true);
    try {
      await sendPhoneOtp(cleanPhone(phone));
      setSmsTimer(60);
      setStep('sms');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('alerts.network.smsFailed');
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneContinue = async () => {
    if (!isValidPhone(phone)) {
      showToast(t('alerts.validation.invalidPhone'), 'error');
      return;
    }
    const cleanedPhone = cleanPhone(phone);
    if (!usesSupabasePhoneOtp() || (await hasSupabaseSession())) {
      if (await tryQuickPinEntry(cleanedPhone)) return;
    }

    if (selectedRole === 'owner' && canRegisterOwnerWithoutPhoneOtp()) {
      await routeOwnerRegistration(cleanedPhone);
      return;
    }

    await handleSendSms();
  };

  const handleVerifySms = async () => {
    const otpLength = getOtpCodeLength();
    if (!smsCode || smsCode.length < otpLength) {
      showToast(t('alerts.validation.invalidOtp', { length: otpLength }), 'error');
      return;
    }
    setLoading(true);
    try {
      const cleanedPhone = cleanPhone(phone);
      await verifyPhoneOtp(cleanedPhone, smsCode);

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

      if (selectedRole === 'owner') {
        await routeOwnerRegistration(cleanedPhone);
      } else {
        const existingUser = users.find(
          (u) => u.phone === cleanedPhone && u.role === selectedRole && u.status === 'active'
        );
        if (existingUser) {
          await goToPinStep(cleanedPhone);
          return;
        }

        const invitesRaw = await SecureStore.getItemAsync('all_invitations');
        const allInvites = safeParseJson<
          Array<LoginInvitationItem & { phone: string; status: string; role: string }>
        >(invitesRaw ?? '[]', []);
        const expectedRole = selectedRole === 'admin' ? 'admin' : 'employee';
        const userInvites = allInvites.filter(
          (i) =>
            i.phone.replace(/[^0-9]/g, '') === cleanedPhone &&
            i.status === 'pending' &&
            i.role === expectedRole
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
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('alerts.network.verifyFailed');
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPin = () => {
    const cleanedPhone = cleanPhone(phone);
    if (!cleanedPhone) return;

    Alert.alert(t('auth.pin.forgotTitle'), t('auth.pin.forgotMessage'), [
      { text: t('common.actions.cancel'), style: 'cancel' },
      {
        text: t('auth.pin.forgotConfirm'),
        onPress: () => {
          void (async () => {
            await SecureStore.deleteItemAsync(`user_pin_${cleanedPhone}`);
            await SecureStore.deleteItemAsync(`user_setup_complete_${cleanedPhone}`);
            await resetPinAttempts(cleanedPhone);
            setPinCode('');
            setPinMode('setup');
            setPinError(false);
            if (usesSupabasePhoneOtp()) {
              setStep('phone');
              await handleSendSms();
            } else {
              showToast(t('auth.pin.forgotRequiresOtp'), 'error');
            }
          })();
        },
      },
    ]);
  };

  const handlePinSubmit = async () => {
    if (pinCode.length < 4) {
      showToast(t('alerts.validation.invalidPin'), 'error');
      return;
    }
    setLoading(true);
    setPinError(false);
    try {
      const cleanedPhone = cleanPhone(phone);
      const lockStatus = await getPinLockStatus(cleanedPhone);
      if (lockStatus.locked) {
        const seconds = Math.ceil(lockStatus.retryAfterMs / 1000);
        Alert.alert(t('common.error.title'), t('auth.pin.locked', { seconds }));
        return;
      }

      if (pinMode === 'entry') {
        const valid = await PinService.verifyPin(cleanedPhone, pinCode);
        if (!valid) {
          const afterFail = await recordPinFailure(cleanedPhone);
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
        await resetPinAttempts(cleanedPhone);
        await completeLogin(cleanedPhone);
      } else {
        await PinService.savePin(cleanedPhone, pinCode);
        setLoading(false);
        await completeLogin(cleanedPhone);
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
      const cleanedPhone = cleanPhone(phone);
      const ownerId = generateSecureId('owner');

      const newPvz = {
        id: generateSecureId('pvz'),
        name: newPvzName.trim(),
        address: newPvzAddress.trim(),
        workStart: '09:00',
        workEnd: '21:00',
        workingHours: '09:00 - 21:00',
        phone: cleanedPhone,
        ownerId,
      };

      const pvzsRaw = await SecureStore.getItemAsync('pvz_list');
      const pvzs = safeParseJson<typeof newPvz[]>(pvzsRaw ?? '[]', []);
      pvzs.push(newPvz);
      await SecureStore.setItemAsync('pvz_list', JSON.stringify(pvzs));

      const userData = {
        id: ownerId,
        name: t('common.roles.ownerShort'),
        phone: cleanedPhone,
        role: 'owner',
        status: 'active',
        pvzId: newPvz.id,
        pvzName: newPvz.name,
        createdAt: new Date().toISOString(),
      };

      const usersRaw = await SecureStore.getItemAsync('pvz_users');
      const users = safeParseJson<Array<Record<string, unknown>>>(usersRaw ?? '[]', []);
      users.push(userData);
      await SecureStore.setItemAsync('pvz_users', JSON.stringify(users));

      await goToPinStep(cleanedPhone, 'setup');
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
    await goToPinStep(cleanPhone(phone));
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
    if (cleaned.length <= getOtpCodeLength()) setSmsCode(cleaned);
  };

  return {
    step,
    setStep,
    selectedRole,
    setSelectedRole,
    phone,
    setPhone: (text: string) => setPhone(formatPhoneInput(text)),
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
    checkingSavedProfile,
    pinError,
    handleSwitchAccount,
    handlePhoneContinue,
    handleSendSms,
    handleVerifySms,
    handlePinSubmit,
    handleForgotPin,
    handleCreatePvz,
    handleSelectPvzContinue,
    handlePinCodeChange,
    handleSmsCodeChange,
    isValidPhone: () => isValidPhone(phone),
  };
}
