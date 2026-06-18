import { useEffect, useRef } from 'react';
import { DEMO_MODE, DEMO_OTP_CODE } from '../../services/SupabaseAuthService';
import type { OtpSendStatus } from './loginTypes';

/** В demoMode подставляет 000000 и вызывает verify через 500 мс. */
export function useDemoOtpAutofill(options: {
  otpSendStatus: OtpSendStatus;
  loading: boolean;
  smsCode: string;
  onChangeCode: (value: string) => void;
  onVerify: (code?: string) => void;
}): void {
  const { otpSendStatus, loading, smsCode, onChangeCode, onVerify } = options;
  const didAutofill = useRef(false);

  useEffect(() => {
    didAutofill.current = false;
  }, [otpSendStatus]);

  useEffect(() => {
    if (!DEMO_MODE || didAutofill.current) {
      return;
    }
    if (loading || otpSendStatus === 'sending' || otpSendStatus === 'rate_limited') {
      return;
    }
    if (otpSendStatus === 'idle' || otpSendStatus === 'failed') {
      return;
    }

    const timer = setTimeout(() => {
      if (didAutofill.current) {
        return;
      }
      didAutofill.current = true;
      if (smsCode !== DEMO_OTP_CODE) {
        onChangeCode(DEMO_OTP_CODE);
      }
      onVerify(DEMO_OTP_CODE);
    }, 500);

    return () => clearTimeout(timer);
  }, [loading, onChangeCode, onVerify, otpSendStatus, smsCode]);
}
