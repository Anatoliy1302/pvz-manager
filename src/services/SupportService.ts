import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../lib/supabase';
import { getAppVersion } from '../constants/legal';
import { UserRole } from '../types/user';
import { hasSupabaseSession } from './SupabaseAuthService';
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

function buildSupportRow(
  userId: string,
  payload: SupportMessagePayload & { message: string; appVersion?: string; platform?: string }
) {
  const subject = getSupportTopicLabel(payload.topic);
  return {
    user_id: userId,
    topic: payload.topic,
    subject,
    message: payload.message,
    user_name: payload.userName ?? null,
    user_role: payload.userRole ?? null,
    user_phone: payload.userPhone ?? null,
    pvz_id: payload.pvzId ?? null,
    pvz_name: payload.pvzName ?? null,
    app_version: payload.appVersion ?? getAppVersion(),
    platform: payload.platform ?? Platform.OS,
  };
}

class SupportService {
  async flushLocalQueue(): Promise<void> {
    if (!(await hasSupabaseSession())) {
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

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return;
    }

    const remaining: LocalSupportMessage[] = [];

    for (const item of queue) {
      try {
        const { error } = await supabase
          .from('support_messages')
          .insert(buildSupportRow(session.user.id, item));

        if (error) {
          remaining.push(item);
        }
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

    if (await hasSupabaseSession()) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        throw new Error('Сессия не найдена');
      }

      const { error } = await supabase
        .from('support_messages')
        .insert(
          buildSupportRow(session.user.id, {
            ...payload,
            message: trimmedMessage,
            appVersion: getAppVersion(),
            platform: Platform.OS,
          })
        );

      if (error) {
        throw error;
      }

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
