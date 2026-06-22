import { isUuid, mergeById } from '../utils/supabaseHelpers';
import { getToken } from '../../lib/authSessionStore';
import { readStoredAuthSession } from '../../lib/authSessionStore';
import {
  readSnapshotArray,
  upsertSnapshotItem,
  updateSnapshotItem,
  writeSnapshotArray,
} from '../../lib/snapshotSync';
import { upsertNotificationForUser } from '../../lib/notificationApi';
import { NotificationRecord } from './notifications/types';
import { generateUuidV4 } from '../utils/generateSecureId';

const SNAPSHOT_KEY = 'notifications';

export async function fetchNotificationsFromSupabase(): Promise<NotificationRecord[] | null> {
  if (!(await getToken())) return null;
  try {
    return await readSnapshotArray<NotificationRecord>(SNAPSHOT_KEY);
  } catch (error) {
    if (__DEV__) {
      console.warn('fetchNotificationsFromSupabase:', error);
    }
    return null;
  }
}

export async function upsertNotificationToSupabase(
  notification: NotificationRecord,
  userId: string
): Promise<NotificationRecord | null> {
  if (!(await getToken()) || !userId) return null;

  const payload: NotificationRecord = {
    ...notification,
    id: notification.id && isUuid(notification.id) ? notification.id : generateUuidV4(),
    recipientUserId: userId,
    createdAt: notification.createdAt || new Date().toISOString(),
  };

  try {
    const session = await readStoredAuthSession();
    const currentUserId = session?.user?.id ?? null;
    if (currentUserId && currentUserId === userId) {
      return await upsertSnapshotItem(SNAPSHOT_KEY, payload);
    }
    return await upsertNotificationForUser(userId, payload);
  } catch (error) {
    if (__DEV__) {
      console.warn('upsertNotificationToSupabase:', error);
    }
    return null;
  }
}

export async function markNotificationReadInSupabase(id: string): Promise<boolean> {
  if (!(await getToken()) || !isUuid(id)) return false;
  try {
    return await updateSnapshotItem<NotificationRecord>(SNAPSHOT_KEY, id, { isRead: true });
  } catch (error) {
    if (__DEV__) {
      console.warn('markNotificationReadInSupabase:', error);
    }
    return false;
  }
}

export async function markAllNotificationsReadInSupabase(): Promise<boolean> {
  if (!(await getToken())) return false;

  const stored = await readStoredAuthSession();
  const userId = stored?.user?.id ?? null;
  if (!userId) return false;

  try {
    const items = await readSnapshotArray<NotificationRecord>(SNAPSHOT_KEY);
    const updated = items.map((item) =>
      item.recipientUserId === userId ? { ...item, isRead: true } : item
    );
    await writeSnapshotArray(SNAPSHOT_KEY, updated);
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('markAllNotificationsReadInSupabase:', error);
    }
    return false;
  }
}

export function mergeNotifications(
  local: NotificationRecord[],
  remote: NotificationRecord[]
): NotificationRecord[] {
  return mergeById(local, remote).slice(0, 200);
}
