import {
  directVerifyEmailOtp,
  AuthOtpVerifyError,
} from '../../lib/supabaseAuthDirect';

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxOTAwMDAwMDAwfQ.test';
});

function verifyResponse(type: string, ok: boolean, errorCode = 'otp_expired') {
  mockFetch.mockImplementationOnce(async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { type?: string };
    expect(body.type).toBe(type);
    return {
      ok,
      status: ok ? 200 : 403,
      text: async () =>
        ok
          ? JSON.stringify({
              access_token: 'jwt',
              refresh_token: 'refresh',
              user: { id: 'user-1' },
            })
          : JSON.stringify({
              error_code: errorCode,
              msg: errorCode === 'invalid_otp' ? 'Invalid token' : 'Token has expired or is invalid',
            }),
    };
  });
}

describe('directVerifyEmailOtp', () => {
  it('succeeds with type magiclink first', async () => {
    verifyResponse('magiclink', true);

    const session = await directVerifyEmailOtp('owner@test.ru', '654321');

    expect(session.accessToken).toBe('jwt');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to email when magiclink returns invalid_otp', async () => {
    verifyResponse('magiclink', false, 'invalid_otp');
    verifyResponse('email', true);

    const session = await directVerifyEmailOtp('owner@test.ru', '654321');

    expect(session.accessToken).toBe('jwt');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry other types on otp_expired', async () => {
    verifyResponse('magiclink', false, 'otp_expired');

    await expect(
      directVerifyEmailOtp('owner@test.ru', '654321', { forRegistration: true })
    ).rejects.toBeInstanceOf(AuthOtpVerifyError);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries verify on transient network_error', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockImplementationOnce(async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { type?: string };
        expect(body.type).toBe('magiclink');
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              access_token: 'jwt',
              refresh_token: 'refresh',
              user: { id: 'user-1' },
            }),
        };
      });

    await expect(directVerifyEmailOtp('owner@test.ru', '654321')).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects codes shorter than 6 digits', async () => {
    await expect(directVerifyEmailOtp('owner@test.ru', '12345')).rejects.toBeInstanceOf(
      AuthOtpVerifyError
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
