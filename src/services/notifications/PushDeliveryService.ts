import { supabase } from '../../../lib/supabase';
import { hasSupabaseSession } from '../SupabaseAuthService';
import pushTokenService from './PushTokenService';

interface ExpoPushReceipt {
  status: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data?: ExpoPushReceipt[];
}

const INVALID_TOKEN_ERRORS = new Set(['DeviceNotRegistered', 'InvalidCredentials']);

async function sendViaEdgeFunction(
  recipientUserId: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<boolean> {
  if (!(await hasSupabaseSession())) return false;

  try {
    const { data: result, error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        recipientUserId,
        title,
        body,
        data,
      },
    });

    if (error) {
      console.warn('send-push-notification edge function:', error.message);
      return false;
    }

    const receipts = (result as ExpoPushResponse | null)?.data;
    if (Array.isArray(receipts)) {
      await handlePushReceipts(receipts, { recipientUserId });
    }

    return true;
  } catch (error) {
    console.warn('send-push-notification invoke failed:', error);
    return false;
  }
}

async function sendDirectExpoPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!token || !token.startsWith('ExponentPushToken')) return;

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data,
        sound: 'default',
        priority: 'high',
      }),
    });

    if (!response.ok) {
      console.warn(`Expo Push API ответил ${response.status}`);
      return;
    }

    const result = (await response.json()) as ExpoPushResponse;
    await handlePushReceipts(result.data ?? [], { token });
  } catch (error) {
    console.warn('Expo push не отправлен:', error);
  }
}

async function handlePushReceipts(
  receipts: ExpoPushReceipt[],
  context?: { token?: string; recipientUserId?: string }
): Promise<void> {
  for (const receipt of receipts) {
    if (receipt.status !== 'error') continue;

    const errorCode = receipt.details?.error || receipt.message || '';
    const isInvalid = [...INVALID_TOKEN_ERRORS].some((code) => errorCode.includes(code));

    if (isInvalid) {
      if (context?.token) {
        await pushTokenService.invalidatePushToken(context.token);
      } else if (context?.recipientUserId) {
        await pushTokenService.invalidatePushTokenForUser(context.recipientUserId);
      }
    }

    console.warn('Expo Push error:', errorCode || receipt.message);
  }
}

class PushDeliveryService {
  async sendToUser(
    recipientUserId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    if (!recipientUserId) return;

    const payload = data || {};
    const token = await pushTokenService.getRecipientPushToken(recipientUserId);

    if (token && pushTokenService.isOwnToken(token)) {
      return;
    }

    const sentViaEdge = await sendViaEdgeFunction(recipientUserId, title, body, payload);
    if (sentViaEdge) return;

    if (token) {
      await sendDirectExpoPush(token, title, body, payload);
    }
  }
}

export default new PushDeliveryService();
