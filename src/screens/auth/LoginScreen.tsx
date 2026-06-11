// src/screens/auth/LoginScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import ThemedSafeAreaView from '../../components/common/ThemedSafeAreaView';
import { useThemedScreen } from '../../hooks/useThemedScreen';
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
} from '../../services/SupabaseAuthService';
import { formatPhoneInput, cleanPhone, isValidPhone, formatPhoneForDisplay } from '../../utils/phoneHelpers';
import { LAST_LOGIN_PROFILE_KEY, type LastLoginProfile } from '../../context/auth/lastLoginProfile';
import { LoginStep, PinMode, LoginInvitationItem, LoginPvzItem } from './loginTypes';
import { isPinSetupComplete } from './loginHelpers';
import { useLoginStyles } from './useLoginStyles';
import BiometricService, { BIOMETRIC_LOGIN_ENABLED } from '../../services/BiometricService';
import DataService from '../../services/DataService';
import {
  startLoginSupabaseRealtime,
  stopLoginSupabaseRealtime,
} from '../../services/SupabaseRealtimeService';
import LoginLoadingView from './components/LoginLoadingView';
import LoginRoleSelectionStep from './components/LoginRoleSelectionStep';
import LoginPhoneStep from './components/LoginPhoneStep';
import LoginSmsStep from './components/LoginSmsStep';
import LoginPinStep from './components/LoginPinStep';
import LoginQuickLoginStep from './components/LoginQuickLoginStep';
import LoginCreatePvzStep from './components/LoginCreatePvzStep';
import LoginSelectPvzStep from './components/LoginSelectPvzStep';

export default function LoginScreen(_props: { navigation: unknown }) {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const { ui, screen } = useThemedScreen();
  const { styles: loginStyles } = useLoginStyles();

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
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('');
  const [biometricIsFaceId, setBiometricIsFaceId] = useState(false);
  const [biometricUsesDeviceAuth, setBiometricUsesDeviceAuth] = useState(false);
  const [pendingQuickLogin, setPendingQuickLogin] = useState(false);

  const loadBiometricSettings = async (cleanedPhone: string) => {
    if (!BIOMETRIC_LOGIN_ENABLED) {
      setBiometricAvailable(false);
      setBiometricEnabled(false);
      setBiometricUsesDeviceAuth(false);
      return;
    }

    const capabilities = await BiometricService.getCapabilities();
    setBiometricAvailable(capabilities.available);
    setBiometricLabel(capabilities.label || t('auth.pin.biometric'));
    setBiometricIsFaceId(capabilities.isFaceId);
    setBiometricUsesDeviceAuth(capabilities.usesDeviceAuth);

    if (capabilities.available) {
      setBiometricEnabled(await BiometricService.isEnabled(cleanedPhone));
    } else {
      setBiometricEnabled(false);
    }
  };

  useEffect(() => {
    const loadSavedProfile = async () => {
      try {
        const raw = await SecureStore.getItemAsync(LAST_LOGIN_PROFILE_KEY);
        if (!raw) return;

        const profile: LastLoginProfile = JSON.parse(raw);
        const setupComplete = await isPinSetupComplete(profile.phone);
        if (!setupComplete) return;

        const usersRaw = await SecureStore.getItemAsync('pvz_users');
        const users = usersRaw ? JSON.parse(usersRaw) : [];
        const existingUser = users.find(
          (u: { phone: string; role: UserRole; status: string }) =>
            u.phone === profile.phone && u.role === profile.role && u.status === 'active'
        );
        if (!existingUser) return;

        setPhone(formatPhoneForDisplay(profile.phone));
        setSelectedRole(profile.role);
        setSavedProfileName(profile.name || existingUser.name);
        setPinMode('entry');
        setStep('quickLogin');
        await loadBiometricSettings(profile.phone);
      } catch (error) {
        console.error('Ошибка загрузки сохранённого профиля:', error);
      } finally {
        setCheckingSavedProfile(false);
      }
    };

    loadSavedProfile();
  }, []);

  const reloadPendingInvitations = useCallback(async () => {
    if (!selectedRole || selectedRole === 'owner') return;

    const cleanedPhone = cleanPhone(phone);
    if (!cleanedPhone) return;

    try {
      const invitesRaw = await SecureStore.getItemAsync('all_invitations');
      const allInvites = invitesRaw ? JSON.parse(invitesRaw) : [];
      const expectedRole = selectedRole === 'admin' ? 'admin' : 'employee';
      const userInvites = allInvites.filter(
        (invite: { phone: string; status: string; role: string }) =>
          invite.phone.replace(/[^0-9]/g, '') === cleanedPhone &&
          invite.status === 'pending' &&
          invite.role === expectedRole
      );

      setInvitations(userInvites);

      if (userInvites.length > 0) {
        const stillSelected = userInvites.some(
          (invite: { id: string }) => invite.id === selectedInvitationId
        );
        const nextInvite = stillSelected
          ? userInvites.find((invite: { id: string }) => invite.id === selectedInvitationId)
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

    (async () => {
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
    await loadBiometricSettings(cleanedPhone);
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
    const users = usersRaw ? JSON.parse(usersRaw) : [];
    const existingUser = users.find(
      (u: { phone: string; role: UserRole; status: string }) =>
        u.phone === cleanedPhone && u.role === selectedRole && u.status === 'active'
    );

    if (!existingUser) return false;

    await goToPinStep(cleanedPhone, 'entry');
    return true;
  };

  const handlePhoneContinue = async () => {
    if (!isValidPhone(phone)) {
      Alert.alert(t('common.error.title'), t('alerts.validation.invalidPhone'));
      return;
    }

    const cleanedPhone = cleanPhone(phone);

    if (!usesSupabasePhoneOtp() || (await hasSupabaseSession())) {
      if (await tryQuickPinEntry(cleanedPhone)) return;
    }

    await handleSendSms();
  };

  const handleSendSms = async () => {
    if (!isValidPhone(phone)) {
      Alert.alert(t('common.error.title'), t('alerts.validation.invalidPhone'));
      return;
    }
    setLoading(true);
    try {
      const cleanedPhone = cleanPhone(phone);
      const { devCode } = await sendPhoneOtp(cleanedPhone);
      if (devCode) {
        Alert.alert(t('auth.devCodeStub'), t('auth.devCodeMessage', { code: devCode }));
      }
      setSmsTimer(60);
      setStep('sms');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t('alerts.network.smsFailed');
      Alert.alert(t('common.error.title'), message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySms = async () => {
    const otpLength = getOtpCodeLength();
    if (!smsCode || smsCode.length < otpLength) {
      Alert.alert(t('common.error.title'), t('alerts.validation.invalidOtp', { length: otpLength }));
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
      const users = usersRaw ? JSON.parse(usersRaw) : [];

      if (selectedRole === 'owner') {
        const existingUser = users.find(
          (u: { phone: string; role: UserRole; status: string }) =>
            u.phone === cleanedPhone && u.role === 'owner' && u.status === 'active'
        );

        if (existingUser) {
          await goToPinStep(cleanedPhone);
          return;
        }

        const pvzsRaw = await SecureStore.getItemAsync('pvz_list');
        const allPvzs = pvzsRaw ? JSON.parse(pvzsRaw) : [];
        const ownerPvzs = allPvzs.filter((p: LoginPvzItem & { ownerId: string }) => {
          const owner = users.find((u: { id: string; phone: string; role: UserRole; status: string }) => u.id === p.ownerId);
          return owner?.phone === cleanedPhone && owner?.role === 'owner' && owner?.status === 'active';
        });

        if (ownerPvzs.length > 0) {
          setPvzList(ownerPvzs);
          setSelectedPvzId(ownerPvzs[0].id);
          setStep('selectPvz');
        } else {
          setStep('createPvz');
        }
      } else {
        const existingUser = users.find(
          (u: { phone: string; role: UserRole; status: string }) =>
            u.phone === cleanedPhone && u.role === selectedRole && u.status === 'active'
        );

        if (existingUser) {
          await goToPinStep(cleanedPhone);
          return;
        }

        const invitesRaw = await SecureStore.getItemAsync('all_invitations');
        const allInvites = invitesRaw ? JSON.parse(invitesRaw) : [];
        const expectedRole = selectedRole === 'admin' ? 'admin' : 'employee';
        const userInvites = allInvites.filter(
          (i: LoginInvitationItem & { phone: string; status: string; role: string }) =>
            i.phone.replace(/[^0-9]/g, '') === cleanedPhone &&
            i.status === 'pending' &&
            i.role === expectedRole
        );

        if (userInvites.length === 0) {
          Alert.alert(t('common.error.title'), t('alerts.validation.noInvites'));
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
      const message =
        error instanceof Error ? error.message : t('alerts.network.verifyFailed');
      Alert.alert(t('common.error.title'), message);
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = async (cleanedPhone: string, pinOverride?: string) => {
    const storedPin =
      pinOverride || (await SecureStore.getItemAsync(`user_pin_${cleanedPhone}`)) || undefined;

    if (!storedPin) {
      throw new Error(t('alerts.validation.pinNotFound'));
    }

    if (usesSupabasePhoneOtp() && !(await hasSupabaseSession())) {
      setPendingQuickLogin(true);
      setLoading(true);
      try {
        const { devCode } = await sendPhoneOtp(cleanedPhone);
        if (devCode) {
          Alert.alert(t('auth.devCodeStub'), t('auth.devCodeMessage', { code: devCode }));
        }
        setSmsTimer(60);
        setSmsCode('');
        setStep('sms');
        Alert.alert(t('auth.confirmationTitle'), t('auth.sessionExpired'));
      } catch (error: unknown) {
        if (isSupabaseProviderConfigError(error)) {
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

  const offerBiometricEnrollment = async (cleanedPhone: string) => {
    if (!BIOMETRIC_LOGIN_ENABLED) {
      await completeLogin(cleanedPhone);
      return;
    }

    const capabilities = await BiometricService.getCapabilities();
    if (!capabilities.available) {
      await completeLogin(cleanedPhone);
      return;
    }

    Alert.alert(
      t('auth.biometric.enableTitle', { label: capabilities.label }),
      t('auth.biometric.enableMessage'),
      [
        {
          text: t('auth.biometric.notNow'),
          style: 'cancel',
          onPress: () => {
            completeLogin(cleanedPhone).catch((error: unknown) => {
              const message =
                error instanceof Error ? error.message : t('alerts.network.loginFailed');
              Alert.alert(t('common.error.title'), message);
            });
          },
        },
        {
          text: t('auth.biometric.enable'),
          onPress: async () => {
            const auth = await BiometricService.authenticate(
              t('auth.biometric.confirm', { label: capabilities.label })
            );
            if (auth.success) {
              await BiometricService.setEnabled(cleanedPhone, true);
            }
            try {
              await completeLogin(cleanedPhone);
            } catch (error: unknown) {
              const message =
                error instanceof Error ? error.message : t('alerts.network.loginFailed');
              Alert.alert(t('common.error.title'), message);
            }
          },
        },
      ]
    );
  };

  const handleBiometricLogin = async (silentCancel = false) => {
    if (loading) return;

    const cleanedPhone = cleanPhone(phone);
    setLoading(true);
    try {
      const auth = await BiometricService.authenticate(
        savedProfileName
          ? t('auth.biometric.loginAs', { name: savedProfileName })
          : t('auth.biometric.confirmLogin')
      );

      if (!auth.success) {
        if (!silentCancel && auth.error !== 'user_cancel' && auth.message) {
          Alert.alert(t('common.error.title'), auth.message);
        }
        return;
      }

      await completeLogin(cleanedPhone);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t('alerts.network.loginFailed');
      Alert.alert(t('common.error.title'), message);
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async () => {
    if (pinCode.length < 4) {
      Alert.alert(t('common.error.title'), t('alerts.validation.invalidPin'));
      return;
    }
    setLoading(true);
    try {
      const cleanedPhone = cleanPhone(phone);

      if (pinMode === 'entry') {
        const storedPin = await SecureStore.getItemAsync(`user_pin_${cleanedPhone}`);
        if (!storedPin || storedPin !== pinCode) {
          Alert.alert(t('common.error.title'), t('alerts.validation.wrongPin'));
          return;
        }
        await completeLogin(cleanedPhone, pinCode);
      } else {
        await SecureStore.setItemAsync(`user_pin_${cleanedPhone}`, pinCode);
        await SecureStore.setItemAsync(`user_setup_complete_${cleanedPhone}`, 'true');
        setLoading(false);
        if (BIOMETRIC_LOGIN_ENABLED) {
          await offerBiometricEnrollment(cleanedPhone);
        } else {
          await completeLogin(cleanedPhone, pinCode);
        }
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t('alerts.network.loginFailed');
      Alert.alert(t('common.error.title'), message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!BIOMETRIC_LOGIN_ENABLED || step !== 'quickLogin' || !biometricEnabled || !biometricAvailable) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        handleBiometricLogin(true);
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [step, biometricEnabled, biometricAvailable]);

  const handleCreatePvz = async () => {
    if (!newPvzName.trim()) {
      Alert.alert(t('common.error.title'), t('alerts.validation.enterPvzName'));
      return;
    }
    if (!newPvzAddress.trim()) {
      Alert.alert(t('common.error.title'), t('alerts.validation.enterPvzAddress'));
      return;
    }
    setLoading(true);
    try {
      const cleanedPhone = cleanPhone(phone);
      const ownerId = Date.now().toString();

      const newPvz: LoginPvzItem & { ownerId: string; workStart: string; workEnd: string; workingHours: string; phone: string } = {
        id: `${Date.now()}1`,
        name: newPvzName.trim(),
        address: newPvzAddress.trim(),
        workStart: '09:00',
        workEnd: '21:00',
        workingHours: '09:00 - 21:00',
        phone: cleanedPhone,
        ownerId,
      };

      const pvzsRaw = await SecureStore.getItemAsync('pvz_list');
      const pvzs = pvzsRaw ? JSON.parse(pvzsRaw) : [];
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
      const users = usersRaw ? JSON.parse(usersRaw) : [];
      users.push(userData);
      await SecureStore.setItemAsync('pvz_users', JSON.stringify(users));

      await goToPinStep(cleanedPhone, 'setup');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t('alerts.network.createPvzFailed');
      Alert.alert(t('common.error.title'), message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPvzContinue = async () => {
    if (!selectedPvzId) {
      Alert.alert(t('common.error.title'), t('alerts.validation.selectPvz'));
      return;
    }

    if (selectedRole !== 'owner') {
      const invite = invitations.find((inv) => inv.pvzId === selectedPvzId);
      if (invite) {
        setSelectedInvitationId(invite.id);
      }
      await goToPinStep(cleanPhone(phone), 'setup');
      return;
    }

    await goToPinStep(cleanPhone(phone));
  };

  const handlePinCodeChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length <= 4) {
      setPinCode(cleaned);
    }
  };

  const handleSmsCodeChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length <= getOtpCodeLength()) {
      setSmsCode(cleaned);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'quickLogin':
        return (
          <LoginQuickLoginStep
            savedProfileName={savedProfileName}
            selectedRole={selectedRole}
            phone={phone}
            pinCode={pinCode}
            loading={loading}
            biometricEnabled={biometricEnabled}
            biometricLabel={biometricLabel}
            biometricIsFaceId={biometricIsFaceId}
            biometricUsesDeviceAuth={biometricUsesDeviceAuth}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            onChangePin={handlePinCodeChange}
            onSubmit={handlePinSubmit}
            onBiometricPress={() => handleBiometricLogin(false)}
            onSwitchAccount={handleSwitchAccount}
          />
        );
      case 'role':
        return (
          <LoginRoleSelectionStep
            selectedRole={selectedRole}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            cardBackground={screen.card}
            cardBorder={screen.border}
            onSelectRole={setSelectedRole}
            onContinue={() => selectedRole && setStep('phone')}
          />
        );
      case 'phone':
        return (
          <LoginPhoneStep
            phone={phone}
            loading={loading}
            isValid={isValidPhone(phone)}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            inputBackground={ui.input.backgroundColor}
            inputBorder={screen.border}
            textColor={screen.text}
            onBack={() => setStep('role')}
            onChangePhone={(text) => setPhone(formatPhoneInput(text))}
            onContinue={handlePhoneContinue}
          />
        );
      case 'sms':
        return (
          <LoginSmsStep
            phone={phone}
            smsCode={smsCode}
            smsTimer={smsTimer}
            loading={loading}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            onBack={() => setStep('phone')}
            onChangeCode={handleSmsCodeChange}
            onVerify={handleVerifySms}
            onResend={handleSendSms}
          />
        );
      case 'pin':
        return (
          <LoginPinStep
            pinMode={pinMode}
            pinCode={pinCode}
            loading={loading}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            showBiometric={pinMode === 'entry' && biometricAvailable && biometricEnabled}
            biometricLabel={biometricLabel}
            biometricIsFaceId={biometricIsFaceId}
            biometricUsesDeviceAuth={biometricUsesDeviceAuth}
            autoFocusPin={pinMode !== 'entry' || !biometricEnabled}
            onChangePin={handlePinCodeChange}
            onSubmit={handlePinSubmit}
            onBiometricPress={() => handleBiometricLogin(false)}
          />
        );
      case 'createPvz':
        return (
          <LoginCreatePvzStep
            name={newPvzName}
            address={newPvzAddress}
            loading={loading}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            inputBackground={ui.input.backgroundColor}
            inputBorder={screen.border}
            textColor={screen.text}
            onChangeName={setNewPvzName}
            onChangeAddress={setNewPvzAddress}
            onSubmit={handleCreatePvz}
          />
        );
      case 'selectPvz':
        return (
          <LoginSelectPvzStep
            selectedRole={selectedRole}
            selectedPvzId={selectedPvzId}
            pvzList={pvzList}
            invitations={invitations}
            titleStyle={ui.title}
            subtitleStyle={ui.subtitle}
            onSelectPvz={(pvzId, invitationId) => {
              setSelectedPvzId(pvzId);
              if (invitationId) {
                setSelectedInvitationId(invitationId);
              }
            }}
            onContinue={handleSelectPvzContinue}
            onCreateNew={selectedRole === 'owner' ? () => setStep('createPvz') : undefined}
          />
        );
      default:
        return null;
    }
  };

  if (checkingSavedProfile) {
    return <LoginLoadingView subtitleStyle={ui.subtitle} />;
  }

  return (
    <ThemedSafeAreaView style={loginStyles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={loginStyles.keyboardView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={[
              loginStyles.scrollContent,
              (step === 'role' || step === 'quickLogin') && loginStyles.scrollContentRole,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {renderStep()}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </ThemedSafeAreaView>
  );
}
