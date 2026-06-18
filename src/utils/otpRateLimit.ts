import * as SecureStore from 'expo-secure-store';

const OTP_RATE_LIMIT_KEY = 'pvz_otp_rate_limit_until';

export async function setOtpRateLimitUntil(untilMs: number): Promise<void> {
  await SecureStore.setItemAsync(OTP_RATE_LIMIT_KEY, String(untilMs));
}

export async function getOtpRateLimitRemainingMs(): Promise<number> {
  const raw = await SecureStore.getItemAsync(OTP_RATE_LIMIT_KEY);
  if (!raw) return 0;
  const until = Number.parseInt(raw, 10);
  if (!Number.isFinite(until)) return 0;
  const remaining = until - Date.now();
  if (remaining <= 0) {
    await SecureStore.deleteItemAsync(OTP_RATE_LIMIT_KEY);
    return 0;
  }
  return remaining;
}

export async function isOtpRateLimited(): Promise<boolean> {
  return (await getOtpRateLimitRemainingMs()) > 0;
}

export async function clearOtpRateLimit(): Promise<void> {
  await SecureStore.deleteItemAsync(OTP_RATE_LIMIT_KEY);
}

export function rateLimitUntilFromMinutes(minutes: number): number {
  return Date.now() + minutes * 60 * 1000;
}
