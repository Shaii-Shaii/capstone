import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from './DashboardLayout';
import { DonorTopBar } from '../donor/DonorTopBar';
import { AppIcon } from '../ui/AppIcon';
import { StatusBanner } from '../ui/StatusBanner';
import { donorDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuthActions } from '../../features/auth/hooks/useAuthActions';
import { getDonorDonationsModuleData } from '../../features/donorDonations.service';
import { resolveThemeRoles, theme } from '../../design-system/theme';

const formatStatusLabel = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Closed';
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

function DonationHistoryRow({ item, roles }) {
  const statusLabel = formatStatusLabel(item?.status);
  const normalized = String(item?.status || '').toLowerCase();
  const isCancelled = normalized.includes('cancel');
  const badgeBackground = isCancelled ? '#FDECEC' : roles.iconPrimarySurface;
  const badgeColor = isCancelled ? '#A32121' : roles.iconPrimaryColor;

  return (
    <View style={[styles.row, { borderBottomColor: roles.defaultCardBorder }]}>
      <View style={[styles.rowIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
        <AppIcon name="donations" size="sm" color={roles.iconPrimaryColor} />
      </View>

      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: roles.headingText }]}>
          {item?.submission_code || 'Donation record'}
        </Text>
        <Text numberOfLines={1} style={[styles.rowMeta, { color: roles.metaText }]}>
          {item?.date_label || 'Date unavailable'}
        </Text>
      </View>

      <View style={styles.rowRight}>
        <View style={[styles.statusBadge, { backgroundColor: badgeBackground }]}>
          <Text style={[styles.statusText, { color: badgeColor }]}>{statusLabel}</Text>
        </View>
        <Text style={[styles.bundleText, { color: roles.bodyText }]}>
          {item?.bundle_quantity ? `${item.bundle_quantity} bundle${item.bundle_quantity > 1 ? 's' : ''}` : '—'}
        </Text>
      </View>
    </View>
  );
}

export function DonorDonationHistoryScreen() {
  const router = useRouter();
  const { user, profile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const { logout, isLoading: isLoggingOut } = useAuthActions();
  const { unreadCount } = useNotifications({
    role: 'donor',
    userId: user?.id,
    userEmail: user?.email || profile?.email || '',
    databaseUserId: profile?.user_id,
    mode: 'badge',
    liveUpdates: true,
  });

  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [historyItems, setHistoryItems] = React.useState([]);
  const avatarInitials = `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.trim();

  const loadHistory = React.useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    setError('');

    const result = await getDonorDonationsModuleData({
      userId: user.id,
      databaseUserId: profile?.user_id || null,
    });

    setHistoryItems(result?.donationHistory || result?.completedDonationHistory || []);
    setError(result?.error || '');
    setIsLoading(false);
  }, [profile?.user_id, user?.id]);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <DashboardLayout
      showSupportChat
      navItems={donorDashboardNavItems}
      activeNavKey="donations"
      navVariant="donor"
      screenVariant="default"
      onNavPress={(item) => {
        if (!item.route) return;
        router.navigate(item.route);
      }}
      header={(
        <DonorTopBar
          title="Donation History"
          subtitle="Completed and cancelled records"
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url || profile?.photo_path || ''}
          unreadCount={unreadCount}
          onNotificationsPress={() => router.navigate('/donor/notifications')}
          onProfilePress={() => router.navigate('/profile')}
          onLogoutPress={logout}
          isLoggingOut={isLoggingOut}
        />
      )}
    >
      {error ? <StatusBanner message={error} variant="info" /> : null}
      <View style={[styles.card, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: roles.headingText }]}>History records</Text>
          <Pressable onPress={loadHistory} style={({ pressed }) => [styles.refreshBtn, pressed ? styles.pressed : null]}>
            <AppIcon name="refresh" size="sm" state="muted" />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
            <Text style={[styles.loadingText, { color: roles.metaText }]}>Loading donation history…</Text>
          </View>
        ) : historyItems.length ? (
          <View style={styles.list}>
            {historyItems.map((item) => (
              <DonationHistoryRow key={item.submission_id} item={item} roles={roles} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <AppIcon name="history" size="lg" state="muted" />
            <Text style={[styles.emptyTitle, { color: roles.headingText }]}>No donation history yet</Text>
            <Text style={[styles.emptyBody, { color: roles.metaText }]}>Completed or cancelled donations will appear here.</Text>
          </View>
        )}
      </View>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  loadingState: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  loadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  list: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
  },
  rowMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 5,
  },
  statusBadge: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  statusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  bundleText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  emptyState: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  emptyTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
  },
  emptyBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
});
