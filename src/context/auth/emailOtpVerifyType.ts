export const EMAIL_OTP_VERIFY_TYPES = ['magiclink', 'email'] as const;
export type EmailOtpVerifyType = (typeof EMAIL_OTP_VERIFY_TYPES)[number];

export type { EmailOtpVerifyType as EmailOtpVerifyTypeAlias };

/** Порядок типов verify для email OTP. */
export async function resolveEmailOtpVerifyTypes(
  _normalizedEmail?: string
): Promise<EmailOtpVerifyType[]> {
  return [...EMAIL_OTP_VERIFY_TYPES];
}

export async function rememberEmailOtpVerifyTypes(
  _normalizedEmail: string,
  _types: EmailOtpVerifyType[]
): Promise<void> {
  // Единый тип verify — хранить не нужно.
}

export async function loadEmailOtpVerifyTypes(
  _normalizedEmail: string
): Promise<EmailOtpVerifyType[] | null> {
  return null;
}

export async function clearEmailOtpVerifyTypes(_normalizedEmail: string): Promise<void> {
  // no-op
}
