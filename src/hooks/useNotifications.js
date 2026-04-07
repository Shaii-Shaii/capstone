import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../api/supabase/client';
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../features/notification.service';
import { resolveDatabaseUserId } from '../features/profile/api/profile.api';

export const useNotifications = ({ role, userId, databaseUserId: preferredDatabaseUserId = null }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isRefreshingNotifications, setIsRefreshingNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState(null);
  const [databaseUserId, setDatabaseUserId] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const syncDatabaseUserId = async () => {
      if (!userId) {
        if (isMounted) setDatabaseUserId(null);
        return;
      }

      if (preferredDatabaseUserId) {
        if (isMounted) setDatabaseUserId(preferredDatabaseUserId);
        return;
      }

      const result = await resolveDatabaseUserId(userId, { ensure: false });
      if (isMounted) {
        setDatabaseUserId(result.data || null);
      }
    };

    syncDatabaseUserId();

    return () => {
      isMounted = false;
    };
  }, [preferredDatabaseUserId, userId]);

  const refreshNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!userId || !role) return;

    if (silent) {
      setIsRefreshingNotifications(true);
    } else {
      setIsLoadingNotifications(true);
    }

    const result = await loadNotifications({ userId, role });

    if (silent) {
      setIsRefreshingNotifications(false);
    } else {
      setIsLoadingNotifications(false);
    }

    setNotifications(result.notifications);
    setUnreadCount(result.unreadCount);
    setNotificationError(result.error);
  }, [role, userId]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  const readNotification = async (notificationId) => {
    const result = await markNotificationRead({ userId, role, notificationId });
    setNotifications(result.notifications);
    setUnreadCount(result.unreadCount);
  };

  const readAllNotifications = async () => {
    const result = await markAllNotificationsRead({ userId, role });
    setNotifications(result.notifications);
    setUnreadCount(result.unreadCount);
  };

  useEffect(() => {
    if (!userId || !role || !databaseUserId) return undefined;

    const channel = supabase.channel(`notifications-${role}-${databaseUserId}`);
    const subscribeTo = (config) => {
      channel.on('postgres_changes', config, () => {
        refreshNotifications({ silent: true });
      });
    };

    [
      {
        event: '*',
        schema: 'public',
        table: 'notification',
        filter: `user_id=eq.${databaseUserId}`,
      },
      {
        event: '*',
        schema: 'public',
        table: role === 'donor' ? 'hair_submissions' : 'wig_requests',
        ...(role === 'donor' ? { filter: `user_id=eq.${databaseUserId}` } : {}),
      },
      {
        event: '*',
        schema: 'public',
        table: role === 'donor' ? 'hair_submission_logistics' : 'wig_request_specifications',
      },
      {
        event: '*',
        schema: 'public',
        table: role === 'donor' ? 'donor_recommendations' : 'wigs',
      },
    ].forEach(subscribeTo);

    if (role === 'donor') {
      subscribeTo({
        event: '*',
        schema: 'public',
        table: 'ai_screenings',
      });
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [databaseUserId, refreshNotifications, role, userId]);

  return {
    notifications,
    unreadCount,
    isLoadingNotifications,
    isRefreshingNotifications,
    notificationError,
    refreshNotifications,
    readNotification,
    readAllNotifications,
  };
};
