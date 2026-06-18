/** Deep link возврата после оплаты ЮKassa */
export const PAYMENT_DEEP_LINK_SCHEME = 'pvzpersonal';
export const PAYMENT_RETURN_URL = 'pvzpersonal://payment/success';

export function isPaymentSuccessDeepLink(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  if (normalized.startsWith(PAYMENT_RETURN_URL.toLowerCase())) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === `${PAYMENT_DEEP_LINK_SCHEME}:` &&
      parsed.hostname === 'payment' &&
      parsed.pathname.replace(/\/$/, '') === '/success'
    );
  } catch {
    return normalized.includes('pvzpersonal://payment/success');
  }
}
