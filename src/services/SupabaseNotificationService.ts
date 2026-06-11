import { supabase } from '../../lib/supabase';
import { isUuid, mergeById } from '../utils/supabaseHelpers';
import { hasSupabaseSession } from './SupabaseAuthService';
import { NotificationRecord } from './NotificationService';

function rowToNotification(row: Record<string, unknown>): NotificationRecord {
  const data = (row.data as Record<string, unknown>) || {};
  return {
    id: row.id as string,
    title: row.title as string,
    message: row.message as string,
    type: row.type as NotificationRecord['type'],
    isRead: Boolean(row.is_read),
    createdAt: row.created_at as string,
    data: Object.keys(data).length > 0 ? data : undefined,
    recipientUserId: row.user_id as string,
  };
}

function notificationToRow(
  notification: NotificationRecord,
  userId: string
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    user_id: userId,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    is_read: notification.isRead,
    data: notification.data || {},
  };

  if (notification.id && isUuid(notification.id)) {
    row.id = notification.id;
  }

  return row;
}

export async function fetchNotificationsFromSupabase(): Promise<NotificationRecord[] | null> {
  if (!(await hasSupabaseSession())) return null;

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('fetchNotificationsFromSupabase:', error.message);
    return null;
  }

  return (data || []).map((row) => rowToNotification(row as Record<string, unknown>));
}

export async function upsertNotificationToSupabase(
  notification: NotificationRecord,
  userId: string
): Promise<NotificationRecord | null> {
  if (!(await hasSupabaseSession()) || !isUuid(userId)) return null;

  const row = notificationToRow(notification, userId);
  const { data, error } = await supabase
    .from('notifications')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    const { data: inserted, error: insertError } = await supabase
      .from('notifications')
      .insert(row)
      .select('*')
      .single();

    if (insertError) {
      console.warn('upsertNotificationToSupabase:', insertError.message);
      return null;
    }
    return rowToNotification(inserted as Record<string, unknown>);
  }

  return data ? rowToNotification(data as Record<string, unknown>) : null;
}

export async function markNotificationReadInSupabase(id: string): Promise<boolean> {
  if (!(await hasSupabaseSession()) || !isUuid(id)) return false;

  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) {
    console.warn('markNotificationReadInSupabase:', error.message);
    return false;
  }
  return true;
}

export async function markAllNotificationsReadInSupabase(): Promise<boolean> {
  if (!(await hasSupabaseSession())) return false;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return false;

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', session.user.id)
    .eq('is_read', false);

  if (error) {
    console.warn('markAllNotificationsReadInSupabase:', error.message);
    return false;
  }
  return true;
}

export function mergeNotifications(
  local: NotificationRecord[],
  remote: NotificationRecord[]
): NotificationRecord[] {
  return mergeById(local, remote).slice(0, 200);
}
