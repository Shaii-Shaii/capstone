import { supabase } from '../api/supabase/client';

const NOTIFICATION_TABLE = 'notification';

export const fetchNotificationsByUserId = async (userId) => (
  await supabase
    .from(NOTIFICATION_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(60)
);

export const createNotifications = async (rows) => (
  await supabase
    .from(NOTIFICATION_TABLE)
    .insert(rows)
    .select()
);

export const markNotificationsRead = async (ids) => (
  await supabase
    .from(NOTIFICATION_TABLE)
    .update({
      status: 'Read',
      updated_at: new Date().toISOString(),
    })
    .in('notification_id', ids)
    .select()
);

export const markAllNotificationsRead = async (userId) => (
  await supabase
    .from(NOTIFICATION_TABLE)
    .update({
      status: 'Read',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
);
