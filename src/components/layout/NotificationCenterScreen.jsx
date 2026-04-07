import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeader } from '../ui/DashboardHeader';
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { StatusBanner } from '../ui/StatusBanner';
import { NotificationListItem } from '../notifications/NotificationListItem';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../providers/AuthProvider';
import { donorDashboardNavItems, patientDashboardNavItems } from '../../constants/dashboard';
import { theme } from '../../design-system/theme';

export function NotificationCenterScreen({ role }) {
  const router = useRouter();
  const { user, profile, patientProfile } = useAuth();
  const {
    notifications,
    unreadCount,
    isLoadingNotifications,
    isRefreshingNotifications,
    notificationError,
    refreshNotifications,
    readNotification,
    readAllNotifications,
  } = useNotifications({ role, userId: user?.id, databaseUserId: profile?.user_id });

  const navItems = role === 'donor' ? donorDashboardNavItems : patientDashboardNavItems;
  const firstName = profile?.first_name || patientProfile?.first_name || '';
  const lastName = profile?.last_name || patientProfile?.last_name || '';
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim();

  const handleNavPress = (item) => {
    if (!item.route) return;
    if (item.route === (role === 'donor' ? '/donor/notifications' : '/patient/notifications')) return;
    router.navigate(item.route);
  };

  const handleNotificationPress = async (notification) => {
    if (!notification.isRead) {
      await readNotification(notification.id);
    }
  };

  return (
    <DashboardLayout
      navItems={navItems}
      activeNavKey="notifications"
      navVariant={role}
      onNavPress={handleNavPress}
      header={(
        <DashboardHeader
          title={role === 'patient' ? (firstName || 'Account') : 'Notifications'}
          subtitle={role === 'patient' ? '' : (firstName ? `${firstName}'s updates` : 'Account updates')}
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url}
          variant={role}
          quickTools={role === 'patient' ? [] : [
            {
              key: 'profile',
              label: 'Profile',
              icon: 'profile',
              onPress: () => router.navigate('/profile'),
            },
          ]}
          minimal={role === 'patient'}
          showAvatar={role === 'patient' ? false : undefined}
          utilityActions={[
            {
              key: 'notifications',
              icon: 'notifications',
              badge: unreadCount ? String(Math.min(unreadCount, 99)) : undefined,
              onPress: () => {},
            },
          ]}
        />
      )}
    >
      <AppCard variant={role === 'donor' ? 'donorTint' : 'patientTint'} radius="xl" padding="lg">
        <Text style={styles.eyebrow}>Notifications</Text>
        <Text style={styles.heroTitle}>{unreadCount ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'All caught up'}</Text>
        <Text style={styles.heroBody}>Latest account activity.</Text>
      </AppCard>

      <AppCard variant="elevated" radius="xl" padding="lg">
        <DashboardSectionHeader
          title="Recent Notifications"
          description="Linked to your current account."
          style={styles.sectionHeader}
        />

        <View style={styles.actionRow}>
          <AppButton
            title="Refresh"
            variant="secondary"
            fullWidth={false}
            loading={isRefreshingNotifications}
            onPress={() => refreshNotifications({ silent: true })}
            leading={<AppIcon name="refresh" state="muted" />}
          />
          <AppButton
            title="Mark All Read"
            variant="outline"
            fullWidth={false}
            disabled={!unreadCount}
            onPress={readAllNotifications}
            leading={<AppIcon name="check-all" state="muted" />}
          />
        </View>

        {notificationError ? (
          <StatusBanner
            message={notificationError}
            variant="info"
            title="Notification sync"
            style={styles.inlineBanner}
          />
        ) : null}

        {isLoadingNotifications ? (
          <StatusBanner
            message="Loading updates."
            variant="info"
            title="Checking"
            style={styles.inlineBanner}
          />
        ) : null}

        {notifications.length ? (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {notifications.map((notification) => (
              <NotificationListItem
                key={notification.id}
                notification={notification}
                onPress={handleNotificationPress}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <AppIcon name="bell-outline" state="muted" />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyBody}>Updates will appear here.</Text>
          </View>
        )}
      </AppCard>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: theme.spacing.xs,
  },
  heroTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  heroBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  sectionHeader: {
    marginBottom: theme.spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  inlineBanner: {
    marginBottom: theme.spacing.md,
  },
  list: {
    maxHeight: 520,
  },
  listContent: {
    gap: theme.spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderStyle: 'dashed',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  emptyTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  emptyBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
});
