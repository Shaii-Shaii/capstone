import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from './DashboardLayout';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { StatusBanner } from '../ui/StatusBanner';
import { NotificationListItem } from '../notifications/NotificationListItem';
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

function DonorNotificationsHeader({ unreadCount, onBackPress, onRefreshPress, isRefreshing }) {
  return (
    <View style={styles.topBar}>
      <Pressable onPress={onBackPress} style={styles.topBarButton}>
        <AppIcon name="arrowLeft" size="md" state="default" />
      </Pressable>

      <View style={styles.topBarCopy}>
        <Text style={styles.topBarTitle}>Notifications</Text>
        <Text style={styles.topBarSubtitle}>
          {unreadCount ? `${unreadCount} unread` : 'Recent donor updates'}
        </Text>
      </View>

      <Pressable onPress={onRefreshPress} style={styles.topBarButton}>
        <AppIcon name="refresh" size="md" state={isRefreshing ? 'active' : 'muted'} />
      </Pressable>
    </View>
  );
}

function DonorNotificationsEmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <AppIcon name="notifications" size="lg" state="muted" />
      </View>
      <Text style={styles.emptyTitle}>No notifications yet</Text>
      <Text style={styles.emptyBody}>Updates about your donations and hair checks will appear here.</Text>
    </View>
  );
}

function DonorNotificationsContent({
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
    () => groupNotificationsByDate(notifications),
    [notifications]
  );

  return (
    <>
      <View style={styles.actionRow}>
        <Text style={styles.sectionLead}>Latest updates that matter</Text>
        <View style={styles.actionButtons}>
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
          style={styles.bannerGap}
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
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.label}</Text>
              </View>

              <AppCard variant="default" radius="xl" padding="md" style={styles.sectionCard}>
                {section.items.map((notification, index) => (
                  <View
                    key={notification.renderKey}
                    style={index < section.items.length - 1 ? styles.notificationRowDivider : null}
                  >
                    <NotificationListItem
                      notification={notification}
                      onPress={onNotificationPress}
                      compact
                    />
                  </View>
                ))}
              </AppCard>
            </View>
          ))}
        </View>
      ) : (
        <AppCard variant="default" radius="xl" padding="lg">
          <DonorNotificationsEmptyState />
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

  if (role !== 'donor') {
    return (
      <DashboardLayout
        navItems={navItems}
        activeNavKey="notifications"
        navVariant={role}
        onNavPress={handleNavPress}
      >
        <AppCard variant="default" radius="xl" padding="lg">
          <DonorNotificationsContent
            notifications={notifications}
            unreadCount={unreadCount}
            isLoadingNotifications={isLoadingNotifications}
            isRefreshingNotifications={isRefreshingNotifications}
            notificationError={notificationError}
            onRefresh={refreshNotifications}
            onMarkAllRead={readAllNotifications}
            onNotificationPress={handleNotificationPress}
          />
        </AppCard>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      showSupportChat={false}
      navItems={navItems}
      activeNavKey="notifications"
      navVariant="donor"
      onNavPress={handleNavPress}
      screenVariant="default"
      header={(
        <DonorNotificationsHeader
          unreadCount={unreadCount}
          onBackPress={() => router.back()}
          onRefreshPress={() => refreshNotifications({ silent: true, force: true })}
          isRefreshing={isRefreshingNotifications}
        />
      )}
    >
      <ScrollView
        style={styles.screenScroll}
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        <DonorNotificationsContent
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  topBarButton: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  topBarCopy: {
    flex: 1,
    gap: 2,
  },
  topBarTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  topBarSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  screenScroll: {
    flex: 1,
  },
  screenContent: {
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  sectionLead: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  bannerGap: {
    marginBottom: theme.spacing.md,
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
  sectionHeader: {
    paddingHorizontal: theme.spacing.xs,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.label,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionCard: {
    gap: 0,
  },
  notificationRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
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
