import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getAppVersion } from '../constants/legal';
import { UserRole } from '../types/user';
import { hasStoredAccessToken, readStoredAuthSession } from '../../lib/authSessionStore';
import { sendChatMessage } from '../../lib/chatService';
import { SupportTopic, getSupportTopicLabel } from '../utils/supportHelpers';
import { generateSecureId } from '../utils/generateSecureId';
import { safeParseJson } from '../utils/safeJson';

const LOCAL_QUEUE_KEY = 'support_messages_local';

export interface SupportMessagePayload {
  topic: SupportTopic;
  message: string;
  userId?: string;
  userName?: string;
  userRole?: UserRole;
  userPhone?: string;
  pvzId?: string;
  pvzName?: string;
}

interface LocalSupportMessage extends SupportMessagePayload {
  id: string;
  appVersion: string;
  platform: string;
  createdAt: string;
  synced: boolean;
}

function formatSupportMessage(
  payload: SupportMessagePayload & { message: string; appVersion?: string; platform?: string }
): string {
  const subject = getSupportTopicLabel(payload.topic);
  const meta = [
    `[${subject}]`,
    payload.pvzName ? `ПВЗ: ${payload.pvzName}` : null,
    payload.userName ? `От: ${payload.userName}` : null,
    payload.userPhone ? `Тел: ${payload.userPhone}` : null,
    `v${payload.appVersion ?? getAppVersion()} / ${payload.platform ?? Platform.OS}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return `${meta}\n\n${payload.message}`;
}

class SupportService {
  async flushLocalQueue(): Promise<void> {
    if (!(await hasStoredAccessToken())) {
      return;
    }

    const raw = await SecureStore.getItemAsync(LOCAL_QUEUE_KEY);
    if (!raw) {
      return;
    }

    const queue = safeParseJson<LocalSupportMessage[]>(raw, []);
    if (queue.length === 0) {
      return;
    }

    const session = await readStoredAuthSession();
    if (!session?.user?.id) {
      return;
    }

    const remaining: LocalSupportMessage[] = [];

    for (const item of queue) {
      try {
        await sendChatMessage(formatSupportMessage(item), { isSupport: true });
      } catch {
        remaining.push(item);
      }
    }

    if (remaining.length === 0) {
      await SecureStore.deleteItemAsync(LOCAL_QUEUE_KEY);
    } else {
      await SecureStore.setItemAsync(LOCAL_QUEUE_KEY, JSON.stringify(remaining));
    }
  }

  async submitMessage(payload: SupportMessagePayload): Promise<void> {
    const trimmedMessage = payload.message.trim();

    if (await hasStoredAccessToken()) {
      const session = await readStoredAuthSession();
      if (!session?.user?.id) {
        throw new Error('Сессия не найдена');
      }

      await sendChatMessage(
        formatSupportMessage({
          ...payload,
          message: trimmedMessage,
          appVersion: getAppVersion(),
          platform: Platform.OS,
        }),
        { isSupport: true }
      );
      return;
    }

    await this.enqueueLocal({
      ...payload,
      message: trimmedMessage,
      appVersion: getAppVersion(),
      platform: Platform.OS,
    });
  }

  private async enqueueLocal(
    payload: SupportMessagePayload & { appVersion: string; platform: string }
  ): Promise<void> {
    const raw = await SecureStore.getItemAsync(LOCAL_QUEUE_KEY);
    const queue = safeParseJson<LocalSupportMessage[]>(raw ?? '[]', []);

    queue.push({
      ...payload,
      id: generateSecureId(),
      createdAt: new Date().toISOString(),
      synced: false,
    });

    await SecureStore.setItemAsync(LOCAL_QUEUE_KEY, JSON.stringify(queue));
  }
}

export default new SupportService();
