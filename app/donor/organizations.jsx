import React from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import { fetchOrganizationsWithDrives } from '../../src/features/donorHome.api';
import { useAuthActions } from '../../src/features/auth/hooks/useAuthActions';
import { useNotifications } from '../../src/hooks/useNotifications';
import { useAuth } from '../../src/providers/AuthProvider';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';

const formatDriveDate = (startDate, endDate) => {
  if (!startDate) return 'Date to follow';
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

  if (!end) {
    return formatter.format(start);
  }

  return `${formatter.format(start)} - ${formatter.format(end)}`;
};

function OrganizationsPageHeader({
  avatarUri,
  unreadCount,
  onBackPress,
  onProfilePress,
  onNotificationsPress,
  onLogoutPress,
  isLoggingOut,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [avatarUri]);

  const openLogoutModal = React.useCallback(() => {
    if (isLoggingOut) return;
    setIsLogoutModalOpen(true);
  }, [isLoggingOut]);

  const closeLogoutModal = React.useCallback(() => {
    if (isLoggingOut) return;
    setIsLogoutModalOpen(false);
  }, [isLoggingOut]);

  const confirmLogout = React.useCallback(() => {
    setIsLogoutModalOpen(false);
    onLogoutPress?.();
  }, [onLogoutPress]);

  return (
    <>
      <View
        style={[
          styles.topBarContainer,
          {
            backgroundColor: roles.defaultCardBackground,
            borderColor: roles.defaultCardBorder,
          },
        ]}
      >
        <View style={styles.topBar}>
          <View style={styles.topBarSide}>
            <Pressable
              onPress={onBackPress}
              style={[styles.topBarIconButton, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}
            >
              <AppIcon name="arrowLeft" size="md" state="default" color={roles.headingText} />
            </Pressable>
          </View>

          <View style={styles.topBarCenter}>
            <Text style={[styles.topBarTitle, { color: roles.headingText }]}>Organizations</Text>
          </View>

          <View style={[styles.topBarSide, styles.topBarActions]}>
            <Pressable
              onPress={onProfilePress}
              style={[styles.topBarAvatarButton, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}
            >
              {avatarUri && !imageFailed ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.topBarAvatarImage}
                  resizeMode="cover"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <AppIcon name="profile" size="md" state="default" color={roles.headingText} />
              )}
            </Pressable>

            <Pressable
              onPress={onNotificationsPress}
              style={[styles.topBarIconButton, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}
            >
              <AppIcon name="notifications" size="md" state="default" color={roles.headingText} />
              {unreadCount ? (
                <View style={[styles.topBarBadge, { backgroundColor: roles.primaryActionBackground }]}>
                  <Text style={[styles.topBarBadgeText, { color: roles.primaryActionText }]}>
                    {Math.min(unreadCount, 99)}
                  </Text>
                </View>
              ) : null}
            </Pressable>

            <Pressable
              onPress={openLogoutModal}
              disabled={isLoggingOut}
              style={[styles.topBarIconButton, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}
            >
              <AppIcon name="signOut" size="md" state="default" color={roles.headingText} />
            </Pressable>
          </View>
        </View>
      </View>
      <Modal transparent visible={isLogoutModalOpen} animationType="fade" onRequestClose={closeLogoutModal}>
        <View style={styles.logoutModalOverlay}>
          <Pressable style={styles.logoutModalBackdrop} onPress={closeLogoutModal} />
          <AppCard variant="elevated" radius="xl" padding="lg" style={styles.logoutModalCard}>
            <Text style={styles.logoutModalTitle}>Log out?</Text>
            <Text style={styles.logoutModalBody}>Are you sure you want to log out?</Text>
            <View style={styles.logoutModalActions}>
              <AppButton title="Cancel" variant="outline" fullWidth={false} onPress={closeLogoutModal} />
              <AppButton title="Log out" fullWidth={false} onPress={confirmLogout} loading={isLoggingOut} />
            </View>
          </AppCard>
        </View>
      </Modal>
    </>
  );
}

function OrganizationBrowseCard({ organization, onOpenDrive }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const initials = String(organization?.organization_name || '')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  React.useEffect(() => {
    setImageFailed(false);
  }, [organization?.organization_logo_url]);

  return (
    <AppCard variant="default" radius="xl" padding="lg">
      <View style={styles.organizationRow}>
        <View style={[styles.organizationLogoWrap, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}>
          {organization.organization_logo_url && !imageFailed ? (
            <Image
              source={{ uri: organization.organization_logo_url }}
              style={styles.organizationLogo}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : initials ? (
            <Text style={[styles.organizationInitials, { color: roles.headingText }]}>{initials}</Text>
          ) : (
            <AppIcon name="organization" size="md" state="default" color={roles.headingText} />
          )}
        </View>

        <View style={styles.organizationCopy}>
          <Text style={[styles.organizationName, { color: roles.headingText }]}>
            {organization.organization_name}
          </Text>
          {organization.location_label ? (
            <Text style={[styles.organizationMeta, { color: roles.metaText }]}>
              {organization.location_label}
            </Text>
          ) : null}
        </View>
      </View>

      {organization.drives?.length ? (
        <View style={styles.driveList}>
          {organization.drives.map((drive) => (
            <Pressable
              key={`org-drive-${organization.organization_id}-${drive.donation_drive_id}`}
              onPress={() => onOpenDrive(drive)}
              style={({ pressed }) => [
                styles.driveRow,
                { borderColor: roles.defaultCardBorder },
                pressed ? styles.driveRowPressed : null,
              ]}
            >
              <View style={styles.driveRowCopy}>
                <Text numberOfLines={1} style={[styles.driveRowTitle, { color: roles.headingText }]}>
                  {drive.event_title}
                </Text>
                <Text style={[styles.driveRowMeta, { color: roles.metaText }]}>
                  {formatDriveDate(drive.start_date, drive.end_date)}
                </Text>
              </View>
              <AppIcon name="chevronRight" size="sm" state="muted" />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[styles.emptyDriveText, { color: roles.bodyText }]}>
          No donation drives available right now.
        </Text>
      )}
    </AppCard>
  );
}

export default function DonorOrganizationsRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const highlightedOrganizationId = Array.isArray(params.organizationId) ? params.organizationId[0] : params.organizationId;
  const { user, profile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const { logout, isLoading: isLoggingOut } = useAuthActions();
  const {
    unreadCount,
  } = useNotifications({
    role: 'donor',
    userId: user?.id,
    userEmail: user?.email || profile?.email || '',
    databaseUserId: profile?.user_id,
    mode: 'badge',
    liveUpdates: true,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [organizations, setOrganizations] = React.useState([]);
  const [errorMessage, setErrorMessage] = React.useState('');

  const loadOrganizations = React.useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    const result = await fetchOrganizationsWithDrives(24, 3);
    if (result.error) {
      setErrorMessage('Organizations could not be loaded right now.');
    }

    const rows = result.data || [];
    if (highlightedOrganizationId) {
      const highlightedId = Number(highlightedOrganizationId);
      rows.sort((left, right) => (
        Number(right.organization_id === highlightedId) - Number(left.organization_id === highlightedId)
      ));
    }

    setOrganizations(rows);
    setIsLoading(false);
  }, [highlightedOrganizationId]);

  React.useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const handleNavPress = (item) => {
    if (!item.route) return;
    router.navigate(item.route);
  };

  return (
    <DashboardLayout
      showSupportChat={false}
      navItems={donorDashboardNavItems}
      activeNavKey="home"
      navVariant="donor"
      onNavPress={handleNavPress}
      screenVariant="default"
      header={(
        <OrganizationsPageHeader
          avatarUri={profile?.avatar_url || profile?.photo_path || ''}
          unreadCount={unreadCount}
          onBackPress={() => router.back()}
          onProfilePress={() => router.navigate('/profile')}
          onNotificationsPress={() => router.navigate('/donor/notifications')}
          onLogoutPress={logout}
          isLoggingOut={isLoggingOut}
        />
      )}
    >
      {errorMessage ? <StatusBanner message={errorMessage} variant="info" style={styles.bannerGap} /> : null}

      {isLoading ? (
        <AppCard variant="default" radius="xl" padding="lg">
          <View style={styles.loadingState}>
            <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
            <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading organizations</Text>
          </View>
        </AppCard>
      ) : organizations.length ? (
        <View style={styles.organizationList}>
          {organizations.map((organization) => (
            <OrganizationBrowseCard
              key={`browse-organization-${organization.organization_id}`}
              organization={organization}
              onOpenDrive={(drive) => router.navigate(`/donor/drives/${drive.donation_drive_id}`)}
            />
          ))}
        </View>
      ) : (
        <Text style={[styles.emptyStateText, { color: roles.bodyText }]}>No organizations available right now.</Text>
      )}
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  topBarContainer: {
    borderWidth: 1,
    borderRadius: theme.radius.xxl,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  topBarSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minWidth: 42,
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarActions: {
    justifyContent: 'flex-end',
  },
  topBarTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    textAlign: 'center',
  },
  topBarIconButton: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  topBarAvatarButton: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  topBarAvatarImage: {
    width: '100%',
    height: '100%',
  },
  topBarBadge: {
    position: 'absolute',
    top: -3,
    right: -2,
    minWidth: 14,
    height: 14,
    borderRadius: theme.radius.full,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
  },
  logoutModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  logoutModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  logoutModalCard: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  logoutModalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  logoutModalBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  logoutModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  bannerGap: {
    marginBottom: theme.spacing.sm,
  },
  loadingState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  organizationList: {
    gap: theme.spacing.md,
  },
  organizationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  organizationLogoWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
  },
  organizationLogo: {
    width: '100%',
    height: '100%',
  },
  organizationInitials: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.bold,
  },
  organizationCopy: {
    flex: 1,
  },
  organizationName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    marginBottom: 2,
  },
  organizationMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  driveList: {
    gap: theme.spacing.xs,
  },
  driveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
  },
  driveRowPressed: {
    opacity: 0.8,
  },
  driveRowCopy: {
    flex: 1,
  },
  driveRowTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    marginBottom: 2,
  },
  driveRowMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  emptyDriveText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  emptyStateText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    paddingVertical: theme.spacing.xs,
  },
});
