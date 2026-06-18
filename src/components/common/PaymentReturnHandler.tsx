import { usePaymentDeepLink } from '../../hooks/usePaymentDeepLink';

/** Слушает deep link pvzpersonal://payment/success и восстанавливает подписку. */
export default function PaymentReturnHandler() {
  usePaymentDeepLink();
  return null;
}
