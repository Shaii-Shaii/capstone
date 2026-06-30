import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppIcon } from '../ui/AppIcon';
import { NotificationListItem } from './NotificationListItem';
import { resolveThemeRoles, theme } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';
import { logAppEvent } from '../../utils/appErrors';

const normalizeTextToken = (value = '') => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const buildNotificationRenderBaseKey = (notification = {}) => {
  const backendId = notification.backendId || notification.notificationId || null;
  if (backendId) {
    return `backend:${backendId}`;
  }

  if (notification.dedupeKey) {
    return `dedupe:${notification.dedupeKey}`;
  }

  if (notification.id && !String(notification.id).includes(':')) {
    return `id:${notification.id}`;
  }

  return [
    'fallback',
    normalizeTextToken(notification.type || 'system_update'),
    normalizeTextToken(notification.referenceType || 'none'),
    String(notification.referenceId || 'none').trim(),
    String(notification.createdAt || notification.updatedAt || notification.created_at || 'no-date').trim(),
    normalizeTextToken(notification.title || 'system update'),
    normalizeTextToken(notification.message || ''),
  ].join(':');
};

const buildRenderableNotifications = (notifications = []) => {
  const seen = new Set();
  let duplicateCount = 0;

  const items = (Array.isArray(notifications) ? notifications : []).reduce((accumulator, item) => {
    if (!item || typeof item !== 'object') {
      return accumulator;
    }

    const normalizedItem = {
      ...item,
      title: String(item.title || 'Notification').trim(),
      message: String(item.message || '').trim(),
      createdAt: item.createdAt || item.updatedAt || item.created_at || new Date().toISOString(),
      type: item.type || 'system_update',
      isRead: Boolean(item.isRead),
    };

    if (!normalizedItem.title && !normalizedItem.message) {
      return accumulator;
    }

    const baseKey = buildNotificationRenderBaseKey(normalizedItem);
    if (seen.has(baseKey)) {
      duplicateCount += 1;
      return accumulator;
    }

    seen.add(baseKey);
    accumulator.push({
      ...normalizedItem,
      renderKey: baseKey,
    });
    return accumulator;
  }, []);

  return {
    items,
    duplicateCount,
  };
};

export function DonorNotificationPanel({
  visible,
  notifications = [],
  unreadCount = 0,
  isLoading = false,
  isRefreshing = false,
  errorMessage = '',
  onClose,
  onRefresh,
  onMarkAllRead,
  onNotificationPress,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const { items: renderableNotifications, duplicateCount } = React.useMemo(
    () => buildRenderableNotifications(notifications),
    [notifications]
  );

  React.useEffect(() => {
    if (__DEV__ && duplicateCount > 0) {
      logAppEvent(
        'notifications.panel.dedupe',
        'Duplicate donor notifications were removed before rendering.',
        { duplicateCount },
        'warn'
      );
    }
  }, [duplicateCount]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: roles.defaultCardBackground,
              borderColor: roles.defaultCardBorder,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: roles.headingText }]}>Notifications</Text>
              <Text style={[styles.subtitle, { color: roles.metaText }]}>
                {unreadCount ? `${unreadCount} unread` : 'Recent donor updates'}
              </Text>
            </View>

            <View style={styles.headerActions}>
              <Pressable
                onPress={onRefresh}
                style={[styles.iconButton, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}
              >
                <AppIcon name="refresh" size="sm" state={isRefreshing ? 'active' : 'muted'} />
              </Pressable>
              <Pressable
                onPress={onClose}
                style={[styles.iconButton, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}
              >
                <AppIcon name="close" size="sm" state="muted" />
              </Pressable>
            </View>
          </View>

          <View style={styles.toolbar}>
            <Text style={[styles.toolbarLabel, { color: roles.metaText }]}>Latest updates that matter</Text>
            <Pressable disabled={!unreadCount} onPress={onMarkAllRead}>
              <Text style={[styles.markAllText, { color: unreadCount ? roles.primaryActionBackground : roles.metaText }]}>
                Mark all as read
              </Text>
            </Pressable>
          </View>

          {errorMessage ? (
            <View style={[styles.inlineNotice, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}>
              <Text style={[styles.inlineNoticeText, { color: roles.bodyText }]}>{errorMessage}</Text>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.emptyState}>
              <AppIcon name="notifications" state="muted" size="lg" />
              <Text style={[styles.emptyTitle, { color: roles.headingText }]}>Loading notifications</Text>
              <Text style={[styles.emptyBody, { color: roles.bodyText }]}>Checking your latest donor updates.</Text>
            </View>
          ) : renderableNotifications.length ? (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {renderableNotifications.map((notification) => (
                <NotificationListItem
                  key={notification.renderKey}
                  notification={notification}
                  onPress={onNotificationPress}
                  compact
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyState}>
              <AppIcon name="bell-outline" state="muted" size="lg" />
              <Text style={[styles.emptyTitle, { color: roles.headingText }]}>No notifications yet</Text>
              <Text style={[styles.emptyBody, { color: roles.bodyText }]}>Updates will appear here.</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: theme.spacing.xxxl,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.overlay,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'flex-end',
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    maxHeight: '78%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
  },
  subtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  headerActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  toolbarLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  markAllText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  inlineNotice: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  inlineNoticeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: theme.spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.xs,
  },
  emptyTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  emptyBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    textAlign: 'center',
  },
});
