import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../api/supabase/client';
import {
  loadNotificationSummary,
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../features/notification.service';
import { resolveDatabaseUserId } from '../features/profile/api/profile.api';

const NOTIFICATION_CACHE_TTL_MS = 30 * 1000;
const notificationCache = new Map();
const notificationInflightRequests = new Map();

const getNotificationCacheKey = ({ role, userId, mode }) => (
  `${role || 'unknown'}:${userId || 'anonymous'}:${mode || 'badge'}`
);

const isCacheFresh = (cacheEntry) => (
  Boolean(cacheEntry?.fetchedAt && Date.now() - cacheEntry.fetchedAt < NOTIFICATION_CACHE_TTL_MS)
);

export const useNotifications = ({
  role,
  userId,
  userEmail = '',
  databaseUserId: preferredDatabaseUserId = null,
  mode = 'badge',
  liveUpdates = false,
  refreshOnMount = false,
}) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isRefreshingNotifications, setIsRefreshingNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState(null);
  const [databaseUserId, setDatabaseUserId] = useState(preferredDatabaseUserId || null);
  const cacheKey = getNotificationCacheKey({ role, userId, mode });
  const loader = mode === 'full' ? loadNotifications : loadNotificationSummary;

  const applyNotificationResult = useCallback((result) => {
    setNotifications(result?.notifications || []);
    setUnreadCount(result?.unreadCount || 0);
    setNotificationError(result?.error || null);
    setDatabaseUserId(result?.databaseUserId || preferredDatabaseUserId || null);
  }, [preferredDatabaseUserId]);

  const refreshNotifications = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!userId || !role) return;

    const cached = notificationCache.get(cacheKey);
    if (!force && isCacheFresh(cached)) {
      applyNotificationResult(cached.result);
      return cached.result;
    }

    if (!force && notificationInflightRequests.has(cacheKey)) {
      const inflightResult = await notificationInflightRequests.get(cacheKey);
      applyNotificationResult(inflightResult);
      return inflightResult;
    }

    if (silent) {
      setIsRefreshingNotifications(true);
    } else {
      setIsLoadingNotifications(true);
    }

    const request = loader({
      userId,
      userEmail,
      role,
      databaseUserId: preferredDatabaseUserId || databaseUserId || null,
    })
      .then((result) => {
        const normalizedResult = {
          notifications: result?.notifications || [],
          unreadCount: result?.unreadCount || 0,
          error: result?.error || null,
          databaseUserId: result?.databaseUserId || preferredDatabaseUserId || databaseUserId || null,
        };

        notificationCache.set(cacheKey, {
          fetchedAt: Date.now(),
          result: normalizedResult,
        });

        return normalizedResult;
      })
      .finally(() => {
        notificationInflightRequests.delete(cacheKey);
      });

    notificationInflightRequests.set(cacheKey, request);

    const result = await request;

    if (silent) {
      setIsRefreshingNotifications(false);
    } else {
      setIsLoadingNotifications(false);
    }

    applyNotificationResult(result);
    return result;
  }, [applyNotificationResult, cacheKey, databaseUserId, loader, preferredDatabaseUserId, role, userEmail, userId]);

  useEffect(() => {
    if (!userId || !role) {
      setNotifications([]);
      setUnreadCount(0);
      setNotificationError(null);
      setDatabaseUserId(preferredDatabaseUserId || null);
      return;
    }

    const cached = notificationCache.get(cacheKey);
    if (cached?.result) {
      applyNotificationResult(cached.result);
    }

    if (refreshOnMount || !isCacheFresh(cached)) {
      refreshNotifications({ silent: Boolean(cached?.result), force: refreshOnMount });
    }
  }, [applyNotificationResult, cacheKey, preferredDatabaseUserId, refreshNotifications, refreshOnMount, role, userId]);

  const readNotification = async (notificationId) => {
    const result = await markNotificationRead({ userId, role, notificationId });
    const normalizedResult = {
      notifications: result.notifications || [],
      unreadCount: result.unreadCount || 0,
      error: null,
      databaseUserId,
    };
    notificationCache.set(cacheKey, {
      fetchedAt: Date.now(),
      result: normalizedResult,
    });
    applyNotificationResult(normalizedResult);
  };

  const readAllNotifications = async () => {
    const result = await markAllNotificationsRead({ userId, role });
    const normalizedResult = {
      notifications: result.notifications || [],
      unreadCount: result.unreadCount || 0,
      error: null,
      databaseUserId,
    };
    notificationCache.set(cacheKey, {
      fetchedAt: Date.now(),
      result: normalizedResult,
    });
    applyNotificationResult(normalizedResult);
  };

  useEffect(() => {
    let isMounted = true;

    if (!preferredDatabaseUserId && userId) {
      resolveDatabaseUserId(userId, { ensure: false }).then((result) => {
        if (isMounted) {
          setDatabaseUserId(result.data || null);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [preferredDatabaseUserId, userId]);

  useEffect(() => {
    if (!liveUpdates || !userId || !role || !databaseUserId) return undefined;

    const channel = supabase.channel(`notifications-${mode}-${role}-${databaseUserId}`);
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'notification',
      filter: `user_id=eq.${databaseUserId}`,
    }, () => {
      refreshNotifications({ silent: true, force: true });
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [databaseUserId, liveUpdates, mode, refreshNotifications, role, userId]);

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
