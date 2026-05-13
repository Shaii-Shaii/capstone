import { supabase } from '../api/supabase/client';

const NOTIFICATION_TABLE = 'Notification';

const notificationSelect = `
  notification_id:Notification_ID,
  user_id:User_ID,
  type:Type,
  title:Title,
  message:Message,
  status:Status,
  updated_at:Updated_At
`;

const toNotificationInsertRow = (row = {}) => ({
  User_ID: row.user_id,
  Type: row.type,
  Title: row.title,
  Message: row.message,
  Status: row.status || 'Unread',
  Updated_At: row.updated_at || new Date().toISOString(),
});

export const fetchNotificationsByUserId = async (userId) => (
  await supabase
    .from(NOTIFICATION_TABLE)
    .select(notificationSelect)
    .eq('User_ID', userId)
    .order('Updated_At', { ascending: false })
    .limit(60)
);

export const createNotifications = async (rows) => (
  await supabase
    .from(NOTIFICATION_TABLE)
    .insert((rows || []).map(toNotificationInsertRow))
    .select(notificationSelect)
);

export const markNotificationsRead = async (ids) => (
  await supabase
    .from(NOTIFICATION_TABLE)
    .update({
      Status: 'Read',
      Updated_At: new Date().toISOString(),
    })
    .in('Notification_ID', ids)
    .select(notificationSelect)
);

export const markAllNotificationsRead = async (userId) => (
  await supabase
    .from(NOTIFICATION_TABLE)
    .update({
      Status: 'Read',
      Updated_At: new Date().toISOString(),
    })
    .eq('User_ID', userId)
    .select(notificationSelect)
);
