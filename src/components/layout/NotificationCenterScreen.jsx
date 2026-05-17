import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from './DashboardLayout';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { StatusBanner } from '../ui/StatusBanner';
import { NotificationListItem } from '../notifications/NotificationListItem';
import { DonorTopBar } from '../donor/DonorTopBar';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../providers/AuthProvider';
import { donorDashboardNavItems, patientDashboardNavItems } from '../../constants/dashboard';
import { theme } from '../../design-system/theme';
import { getNotificationNavigationTarget } from '../../features/notification.service';

const getNotificationRenderKey = (notification = {}, index = 0) => (
  String(
    notification?.backendId
    || notification?.id
    || notification?.dedupeKey
    || `${notification?.type || 'notification'}:${notification?.createdAt || 'no-date'}:${index}`
  )
);

const getDateSectionLabel = (value) => {
  if (!value) return 'Earlier';

  const createdAt = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const toDayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const createdKey = toDayKey(createdAt);

  if (createdKey === toDayKey(today)) return 'Today';
  if (createdKey === toDayKey(yesterday)) return 'Yesterday';

  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(createdAt);
  } catch {
    return 'Earlier';
  }
};

const groupNotificationsByDate = (notifications = []) => {
  const sections = [];
  const sectionMap = new Map();

  (notifications || []).forEach((notification, index) => {
    const label = getDateSectionLabel(notification?.createdAt);
    if (!sectionMap.has(label)) {
      const section = {
        key: label.toLowerCase().replace(/\s+/g, '-'),
        label,
        items: [],
      };
      sectionMap.set(label, section);
      sections.push(section);
    }

    sectionMap.get(label).items.push({
      ...notification,
      renderKey: getNotificationRenderKey(notification, index),
    });
  });

  return sections;
};

const getVisibleNotifications = (notifications = []) => {
  const seen = new Set();

  return (Array.isArray(notifications) ? notifications : []).filter((notification) => {
    if (!notification || (!notification.title && !notification.message)) {
      return false;
    }

    const title = String(notification.title || '').trim().toLowerCase();
    const message = String(notification.message || '').trim().toLowerCase();
    const key = [
      notification.type || 'notification',
      notification.referenceType || '',
      notification.referenceId || '',
      title,
      message,
    ].join('|');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

function DonorNotificationsEmptyState({ role }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <AppIcon name="notifications" size="lg" state="muted" />
      </View>
      <Text style={styles.emptyTitle}>No notifications yet</Text>
      <Text style={styles.emptyBody}>
        {role === 'patient'
          ? 'Updates about wig requests and hospital review will appear here.'
          : 'Updates about your donations and hair checks will appear here.'}
      </Text>
    </View>
  );
}

function DonorNotificationsContent({
  role,
  notifications,
  unreadCount,
  isLoadingNotifications,
  isRefreshingNotifications,
  notificationError,
  onRefresh,
  onMarkAllRead,
  onNotificationPress,
}) {
  const sections = React.useMemo(
    () => groupNotificationsByDate(getVisibleNotifications(notifications)),
    [notifications]
  );

  return (
    <>
      <View style={styles.toolbar}>
        <View style={styles.toolbarCopy}>
          <Text style={styles.toolbarTitle}>{unreadCount ? `${unreadCount} unread` : 'All caught up'}</Text>
          <Text style={styles.toolbarSubtitle}>
            {role === 'patient' ? 'Request and allocation updates only' : 'Hair check, donation, and joined drive updates only'}
          </Text>
        </View>
        <View style={styles.toolbarActions}>
          <AppButton
            title="Refresh"
            variant="secondary"
            size="sm"
            fullWidth={false}
            loading={isRefreshingNotifications}
            onPress={() => onRefresh({ silent: true, force: true })}
          />
          <AppButton
            title="Mark all as read"
            variant="outline"
            size="sm"
            fullWidth={false}
            disabled={!unreadCount}
            onPress={onMarkAllRead}
          />
        </View>
      </View>

      {notificationError ? (
        <StatusBanner
          title="Notification sync"
          message={notificationError}
          variant="info"
          presentation="floating"
        />
      ) : null}

      {isLoadingNotifications ? (
        <AppCard variant="default" radius="xl" padding="lg" style={styles.loadingCard}>
          <AppIcon name="notifications" size="lg" state="muted" />
          <Text style={styles.loadingTitle}>Loading notifications</Text>
          <Text style={styles.loadingBody}>Checking your latest donor updates.</Text>
        </AppCard>
      ) : sections.length ? (
        <View style={styles.sectionsWrap}>
          {sections.map((section) => (
            <View key={section.key} style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>{section.label}</Text>

              <AppCard variant="default" radius="xl" padding="md" style={styles.sectionCard}>
                {section.items.map((notification) => (
                  <React.Fragment key={notification.renderKey}>
                    <NotificationListItem
                      notification={notification}
                      onPress={onNotificationPress}
                      compact
                    />
                  </React.Fragment>
                ))}
              </AppCard>
            </View>
          ))}
        </View>
      ) : (
        <AppCard variant="default" radius="xl" padding="lg">
          <DonorNotificationsEmptyState role={role} />
        </AppCard>
      )}
    </>
  );
}

export function NotificationCenterScreen({ role }) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const {
    notifications,
    unreadCount,
    isLoadingNotifications,
    isRefreshingNotifications,
    notificationError,
    refreshNotifications,
    readNotification,
    readAllNotifications,
  } = useNotifications({
    role,
    userId: user?.id,
    userEmail: user?.email || profile?.email || '',
    databaseUserId: profile?.user_id,
    mode: 'full',
    liveUpdates: true,
  });

  const navItems = role === 'donor' ? donorDashboardNavItems : patientDashboardNavItems;

  const handleNavPress = (item) => {
    if (!item.route) return;
    if (item.route === (role === 'donor' ? '/donor/notifications' : '/patient/notifications')) return;
    router.navigate(item.route);
  };

  const handleNotificationPress = async (notification) => {
    if (!notification?.isRead) {
      await readNotification(notification.id);
    }

    const targetRoute = getNotificationNavigationTarget(notification);
    if (targetRoute) {
      router.navigate(targetRoute);
    }
  };

  return (
    <DashboardLayout
      showSupportChat={false}
      navItems={navItems}
      activeNavKey="notifications"
      navVariant={role === 'donor' ? 'donor' : 'patient'}
      onNavPress={handleNavPress}
      screenVariant="default"
      header={(
        <DonorTopBar
          title="Notifications"
          subtitle={unreadCount ? `${unreadCount} unread` : (role === 'patient' ? 'Recent patient updates' : 'Recent donor updates')}
          showBack
          showProfileAction={false}
          showNotificationsAction={false}
          showLogoutAction={false}
          onBackPress={() => router.back()}
        />
      )}
    >
      <ScrollView
        style={styles.screenScroll}
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        <DonorNotificationsContent
          role={role}
          notifications={notifications}
          unreadCount={unreadCount}
          isLoadingNotifications={isLoadingNotifications}
          isRefreshingNotifications={isRefreshingNotifications}
          notificationError={notificationError}
          onRefresh={refreshNotifications}
          onMarkAllRead={readAllNotifications}
          onNotificationPress={handleNotificationPress}
        />
      </ScrollView>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  screenScroll: {
    flex: 1,
  },
  screenContent: {
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
  },
  toolbarCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  toolbarTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  toolbarSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  toolbarActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  loadingCard: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  loadingTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  loadingBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  sectionsWrap: {
    gap: theme.spacing.md,
  },
  sectionBlock: {
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.label,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: theme.spacing.xs,
  },
  sectionCard: {
    gap: 0,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xl,
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  emptyTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  emptyBody: {
    maxWidth: 260,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
});
