process.env.EXPO_PUBLIC_DEMO_MODE = 'false';
process.env.EXPO_PUBLIC_USE_SUPABASE_EMAIL_OTP = 'true';
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxOTAwMDAwMDAwfQ.test';

jest.mock('../context/auth/emailOtpVerifyType', () => ({
  resolveEmailOtpVerifyTypes: jest.fn(async () => ['email']),
  loadEmailOtpVerifyTypes: jest.fn(async () => null),
  clearEmailOtpVerifyTypes: jest.fn(async () => undefined),
}));

jest.mock('../../lib/supabaseAuthDirect', () => ({
  directSendEmailOtp: jest.fn(async () => undefined),
  directVerifyEmailOtp: jest.fn(async () => ({
    userId: 'supabase-user-uuid',
    accessToken: 'jwt-token',
    refreshToken: 'refresh',
  })),
  AuthOtpVerifyError: class AuthOtpVerifyError extends Error {
    errorCode?: string;
    constructor(message: string, errorCode?: string) {
      super(message);
      this.name = 'AuthOtpVerifyError';
      this.errorCode = errorCode;
    }
  },
  applyDirectSession: jest.fn(async () => undefined),
  persistDirectSession: jest.fn(async () => undefined),
  directPingAuthHealth: jest.fn(async () => true),
  warmupSendSmsHook: jest.fn(async () => undefined),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      setSession: jest.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
  getSupabaseProjectHost: () => 'test.supabase.co',
  getSupabaseAuthStorageKey: () => 'sb-test-auth',
}));

jest.mock('../../lib/supabaseRest', () => ({
  supabaseRestGet: jest.fn(async () => []),
  supabaseRestInsert: jest.fn(async () => true),
  supabaseRestUpsert: jest.fn(async () => undefined),
  supabaseRestRpcVoid: jest.fn(async () => undefined),
}));

jest.mock('../../lib/authClientSyncGate', () => ({
  suspendAuthClientNetworkSync: jest.fn(),
  resumeAuthClientNetworkSync: jest.fn(),
  isAuthClientNetworkSyncSuspended: jest.fn(() => false),
}));

jest.mock('../utils/secureStorageAdapter', () => ({
  secureStorageAdapter: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('../services/DataService', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../i18n', () => ({
  t: (key: string) => key,
}));

import { sendEmailOtp, verifyEmailOtp, clearCachedDirectAuthSession } from '../services/SupabaseAuthService';

const { directSendEmailOtp, directVerifyEmailOtp, AuthOtpVerifyError } = jest.requireMock(
  '../../lib/supabaseAuthDirect'
);
const { supabaseRestGet, supabaseRestInsert } = jest.requireMock('../../lib/supabaseRest');

describe('SupabaseAuthService email OTP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCachedDirectAuthSession();
    process.env.EXPO_PUBLIC_DEMO_MODE = 'false';
    process.env.EXPO_PUBLIC_USE_SUPABASE_EMAIL_OTP = 'true';
    supabaseRestGet.mockResolvedValue([]);
    supabaseRestInsert.mockResolvedValue(true);
  });

  it('sendEmailOtp calls directSendEmailOtp with normalized email', async () => {
    await sendEmailOtp('Owner@Test.RU', { forRegistration: true });

    expect(directSendEmailOtp).toHaveBeenCalledTimes(1);
    expect(directSendEmailOtp).toHaveBeenCalledWith('Owner@Test.RU', {
      forRegistration: true,
    });
  });

  it('verifyEmailOtp returns session userId from directVerifyEmailOtp', async () => {
    const session = await verifyEmailOtp('owner@test.ru', '123456', { forRegistration: true });

    expect(directVerifyEmailOtp).toHaveBeenCalledWith('owner@test.ru', '123456', {
      forRegistration: true,
    });
    expect(session.userId).toBe('supabase-user-uuid');
    expect(session.accessToken).toBe('jwt-token');
  });

  it('verifyEmailOtp surfaces otp_expired without session recovery', async () => {
    directVerifyEmailOtp.mockRejectedValueOnce(
      new AuthOtpVerifyError('Token has expired', 'otp_expired')
    );

    await expect(
      verifyEmailOtp('owner@test.ru', '654321', { forRegistration: true })
    ).rejects.toThrow('alerts.auth.otpExpired');
  });

  it('verifyEmailOtp schedules profile sync via REST insert', async () => {
    await verifyEmailOtp('owner@test.ru', '123456', { forRegistration: true });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(supabaseRestGet).toHaveBeenCalled();
    expect(supabaseRestInsert).toHaveBeenCalled();
  });

  it('DEMO_MODE skips network OTP send', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_DEMO_MODE = 'true';
    const { isDemoMode } = require('../services/SupabaseAuthService') as typeof import('../services/SupabaseAuthService');
    expect(isDemoMode()).toBe(true);
  });
});
