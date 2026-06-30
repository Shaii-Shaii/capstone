import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from './DashboardLayout';
import { AppIcon } from '../ui/AppIcon';
import { EmptyDataState } from '../ui/EmptyDataState';
import { useAuth } from '../../providers/AuthProvider';
import { getDonorDonationsModuleData } from '../../features/donorDonations.service';
import { resolveThemeRoles, theme } from '../../design-system/theme';

const formatStatusLabel = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Completed';

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const getDonationStatusTone = (status = '') => {
  const normalized = String(status || '').toLowerCase();
  return {
    isCancelled: /cancel|reject|deny|fail|void|expire/.test(normalized),
    isCompleted: /complete|completed|success|approved|received|done|closed/.test(normalized),
  };
};

function HistoryTopBar({ title, onBack, onRefresh, refreshing = false }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const { height } = useWindowDimensions();
  const horizontalInset = height < theme.layout.shortScreenHeight
    ? theme.layout.screenPaddingXCompact
    : theme.layout.screenPaddingX;

  return (
    <View
      style={[
        styles.topBar,
        {
          backgroundColor: roles.primaryActionBackground,
          marginHorizontal: -horizontalInset,
          paddingHorizontal: 0,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        style={({ pressed }) => [
          styles.topBarButton,
          { backgroundColor: 'rgba(255, 255, 255, 0.10)' },
          pressed ? styles.topBarButtonPressed : null,
        ]}
      >
        <AppIcon name="arrowLeft" state="inverse" color={roles.primaryActionText} />
      </Pressable>

      <Text numberOfLines={1} style={[styles.topBarTitle, { color: roles.primaryActionText }]}>
        {title}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Refresh history"
        onPress={onRefresh}
        style={({ pressed }) => [
          styles.topBarButton,
          { backgroundColor: 'rgba(255, 255, 255, 0.10)' },
          pressed ? styles.topBarButtonPressed : null,
        ]}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color={roles.primaryActionText} />
        ) : (
          <AppIcon name="refresh" state="inverse" color={roles.primaryActionText} />
        )}
      </Pressable>
    </View>
  );
}

function DonationHistoryRow({ item, roles, showDivider = true }) {
  const { isCancelled, isCompleted } = getDonationStatusTone(item?.status);
  const statusLabel = isCancelled
    ? 'Cancelled'
    : isCompleted
      ? 'Completed'
      : formatStatusLabel(item?.status);
  const statusBackground = isCancelled
    ? 'rgba(163, 33, 33, 0.10)'
    : isCompleted
      ? roles.iconPrimarySurface
      : roles.badgeBackground;
  const statusColor = isCancelled
    ? '#A32121'
    : isCompleted
      ? roles.iconPrimaryColor
      : roles.badgeText;

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: roles.defaultCardBorder,
          borderBottomWidth: showDivider ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
        <AppIcon name="history" size="md" color={roles.iconPrimaryColor} />
      </View>

      <View style={styles.rowCopy}>
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={[styles.rowTitle, { color: roles.headingText }]}>
            {item?.donation_reference || 'Donation record'}
          </Text>
          <Text numberOfLines={1} style={[styles.rowDate, { color: roles.metaText }]}>
            {item?.date_label || 'Date unavailable'}
          </Text>
        </View>

        <View style={styles.rowBottom}>
          <View style={[styles.statusBadge, { backgroundColor: statusBackground }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <Text numberOfLines={1} style={[styles.bundleText, { color: roles.bodyText }]}>
            {item?.bundle_quantity
              ? `${item.bundle_quantity} bundle${item.bundle_quantity === 1 ? '' : 's'}`
              : 'N/A'}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function DonorDonationHistoryScreen() {
  const router = useRouter();
  const { user, profile, resolvedTheme, isLoading: isAuthLoading } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [historyItems, setHistoryItems] = React.useState([]);

  const loadHistory = React.useCallback(async ({ silent = false } = {}) => {
    if (!user?.id) {
      setHistoryItems([]);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const result = await getDonorDonationsModuleData({
        userId: user.id,
        databaseUserId: profile?.user_id || null,
      });

      setHistoryItems(result?.donationHistory || result?.completedDonationHistory || []);

      if (result?.error) {
        // Keep the technical detail out of the UI, but preserve it for debugging.
        console.warn('[DonorDonationHistoryScreen] loadHistory error:', result.error);
      }
    } catch (err) {
      setHistoryItems([]);
      console.warn('[DonorDonationHistoryScreen] loadHistory exception:', err);
    } finally {
      if (silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [profile?.user_id, user?.id]);

  React.useEffect(() => {
    if (isAuthLoading) return;
    loadHistory();
  }, [isAuthLoading, loadHistory]);

  return (
    <DashboardLayout
      hideNav
      navItems={[]}
      navVariant="donor"
      screenVariant="default"
      onRefresh={() => loadHistory({ silent: true })}
      refreshing={isRefreshing}
      header={(
        <HistoryTopBar
          title="History"
          onBack={() => router.back()}
          onRefresh={() => loadHistory({ silent: true })}
          refreshing={isRefreshing}
        />
      )}
    >
      <View style={styles.page}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
            <Text style={[styles.loadingText, { color: roles.metaText }]}>
              Loading donation history...
            </Text>
          </View>
        ) : historyItems.length ? (
          <View style={[styles.list, { borderTopColor: roles.defaultCardBorder }]}>
            {historyItems.map((item, index) => (
              <DonationHistoryRow
                key={item.submission_id}
                item={item}
                roles={roles}
                showDivider={index < historyItems.length - 1}
              />
            ))}
          </View>
        ) : (
          <EmptyDataState
            variant="default"
            showCountBadge={false}
            title="No donation history yet"
            message="Completed or cancelled donations will appear here."
            style={styles.emptyState}
            illustrationStyle={styles.emptyIllustration}
            titleStyle={[styles.emptyTitle, { color: roles.headingText }]}
            messageStyle={[styles.emptyBody, { color: roles.metaText }]}
          />
        )}
      </View>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    minHeight: 56,
    paddingVertical: theme.spacing.xs,
  },
  topBarButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarButtonPressed: {
    opacity: 0.82,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  page: {
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
    gap: theme.spacing.md,
  },
  loadingState: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  loadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: theme.typography.semantic.bodyLg * theme.typography.lineHeights.snug,
  },
  rowDate: {
    flexShrink: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight: theme.typography.semantic.caption * theme.typography.lineHeights.snug,
    marginTop: 2,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
  },
  statusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  bundleText: {
    flexShrink: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  emptyState: {
    width: '100%',
    minHeight: 340,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
  },
  emptyIllustration: {
    marginBottom: theme.spacing.xs,
  },
  emptyTitle: {
    fontSize: 24,
    lineHeight: 28,
  },
  emptyBody: {
    maxWidth: 300,
  },
});
