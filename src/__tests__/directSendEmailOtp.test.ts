import { directSendEmailOtp } from '../../lib/supabaseAuthDirect';

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxOTAwMDAwMDAwfQ.test';
});

function mockOtpSendOk() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => '{}',
  });
}

describe('directSendEmailOtp', () => {
  it('login OTP: create_user=false, без role metadata', async () => {
    mockOtpSendOk();

    await directSendEmailOtp('Owner@Test.RU');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      email?: string;
      type?: string;
      create_user?: boolean;
      data?: unknown;
    };
    expect(body.email).toBe('owner@test.ru');
    expect(body.type).toBe('email');
    expect(body.create_user).toBe(false);
    expect(body.data).toBeUndefined();
  });

  it('registration OTP: create_user=true, role=owner', async () => {
    mockOtpSendOk();

    await directSendEmailOtp('Owner@Test.RU', { forRegistration: true });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      create_user?: boolean;
      data?: { role?: string };
    };
    expect(body.create_user).toBe(true);
    expect(body.data).toEqual({ role: 'owner' });
  });
});
