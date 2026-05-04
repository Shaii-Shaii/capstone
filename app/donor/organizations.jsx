import React from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import { fetchOrganizationPreview, fetchOrganizationsWithDrives, joinOrganizationMembership } from '../../src/features/donorHome.api';
import { useAuthActions } from '../../src/features/auth/hooks/useAuthActions';
import { useNotifications } from '../../src/hooks/useNotifications';
import { useAuth } from '../../src/providers/AuthProvider';
import { buildProfileCompletionMeta } from '../../src/features/profile/services/profile.service';
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

function OrganizationBrowseCard({ organization, onOpenOrganization, onOpenDrive, databaseUserId, onJoined }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const [isJoining, setIsJoining] = React.useState(false);
  const [memberStatus, setMemberStatus] = React.useState(() => {
    const s = String(organization?.membership?.status || '').toLowerCase();
    return s === 'active' ? 'member' : s ? 'inactive' : 'none';
  });
  const [joinFeedback, setJoinFeedback] = React.useState('');

  const initials = String(organization?.organization_name || '')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const isJoinable = (
    String(organization?.status || '').trim().toLowerCase() === 'active'
    && Boolean(organization?.is_approved)
    && String(organization?.approval_status || '').trim().toLowerCase() === 'approved'
  );

  React.useEffect(() => {
    setImageFailed(false);
  }, [organization?.organization_logo_url]);

  React.useEffect(() => {
    const s = String(organization?.membership?.status || '').toLowerCase();
    setMemberStatus(s === 'active' ? 'member' : s ? 'inactive' : 'none');
  }, [organization?.membership?.status]);

  const handleJoin = React.useCallback(async () => {
    if (!databaseUserId || memberStatus === 'member' || isJoining) return;
    setIsJoining(true);
    setJoinFeedback('');
    const result = await joinOrganizationMembership({
      organizationId: organization.organization_id,
      databaseUserId,
    });
    setIsJoining(false);
    if (result.error) {
      setJoinFeedback(String(result.error?.message || 'Could not join right now.').trim());
    } else {
      setMemberStatus('member');
      setJoinFeedback('');
      onJoined?.();
    }
  }, [databaseUserId, isJoining, memberStatus, onJoined, organization.organization_id]);

  const joinLabel = memberStatus === 'member' ? 'Joined' : memberStatus === 'inactive' ? 'Rejoin' : 'Request to Join';
  const joinDisabled = memberStatus === 'member' || !isJoinable || isJoining;

  return (
    <AppCard variant="default" radius="xl" padding="none">
      <Pressable
        onPress={() => onOpenOrganization?.(organization)}
        style={({ pressed }) => [pressed ? styles.cardPressed : null]}
      >
      <View style={[styles.orgCoverBanner, { backgroundColor: roles.supportCardBackground }]}>
        {organization.organization_logo_url && !imageFailed ? (
          <Image
            source={{ uri: organization.organization_logo_url }}
            style={styles.orgCoverImage}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={[styles.orgCoverFallback, { backgroundColor: roles.iconPrimarySurface }]}>
            <AppIcon name="organization" size="lg" state="default" color={roles.primaryActionBackground} />
          </View>
        )}
      </View>
      </Pressable>

      <View style={styles.orgCardBody}>
        {/* Identity row */}
        <View style={styles.orgIdentityRow}>
          <View style={[styles.orgAvatarWrap, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            {organization.organization_logo_url && !imageFailed ? (
              <Image
                source={{ uri: organization.organization_logo_url }}
                style={styles.orgAvatarImage}
                resizeMode="cover"
              />
            ) : initials ? (
              <Text style={[styles.orgAvatarInitials, { color: roles.headingText }]}>{initials}</Text>
            ) : (
              <AppIcon name="organization" size="md" color={roles.headingText} />
            )}
          </View>

          <View style={styles.orgIdentityCopy}>
            <Pressable onPress={() => onOpenOrganization?.(organization)} style={({ pressed }) => [pressed ? styles.cardPressed : null]}>
            <Text numberOfLines={1} style={[styles.orgName, { color: roles.headingText }]}>
              {organization.organization_name}
            </Text>
            {organization.organization_type ? (
              <Text numberOfLines={1} style={[styles.orgType, { color: roles.metaText }]}>
                {organization.organization_type}
              </Text>
            ) : null}
            </Pressable>
          </View>

          <Pressable
            onPress={handleJoin}
            disabled={joinDisabled}
            style={({ pressed }) => [
              styles.orgJoinBtn,
              {
                backgroundColor: memberStatus === 'member'
                  ? roles.supportCardBackground
                  : roles.primaryActionBackground,
                borderColor: memberStatus === 'member'
                  ? roles.defaultCardBorder
                  : roles.primaryActionBackground,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            {isJoining ? (
              <ActivityIndicator size="small" color={roles.primaryActionText} />
            ) : (
              <>
                <MaterialCommunityIcons
                  name={memberStatus === 'member' ? 'check' : 'plus'}
                  size={14}
                  color={memberStatus === 'member' ? roles.bodyText : roles.primaryActionText}
                />
                <Text style={[
                  styles.orgJoinBtnText,
                  { color: memberStatus === 'member' ? roles.bodyText : roles.primaryActionText },
                ]}>
                  {joinLabel}
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Meta info */}
        {organization.location_label ? (
          <View style={styles.orgMetaRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={13} color={roles.metaText} />
            <Text numberOfLines={1} style={[styles.orgMetaText, { color: roles.metaText }]}>
              {organization.location_label}
            </Text>
          </View>
        ) : null}

        {joinFeedback ? (
          <Text style={[styles.orgJoinFeedback, { color: theme.colors.textError }]}>{joinFeedback}</Text>
        ) : null}

        {/* Drives — displayed as "event posts" */}
        {memberStatus === 'member' && organization.drives?.length ? (
          <View style={styles.orgDriveFeed}>
            <Text style={[styles.orgFeedLabel, { color: roles.headingText }]}>Upcoming drives</Text>
            {organization.drives.map((drive) => (
              <Pressable
                key={`org-drive-${organization.organization_id}-${drive.donation_drive_id}`}
                onPress={() => onOpenDrive(drive)}
                style={({ pressed }) => [
                  styles.orgDrivePost,
                  { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder },
                  pressed ? styles.drivePostPressed : null,
                ]}
              >
                <View style={[styles.orgDrivePostIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                  <MaterialCommunityIcons name="gift-outline" size={18} color={roles.primaryActionBackground} />
                </View>
                <View style={styles.orgDrivePostCopy}>
                  <Text numberOfLines={1} style={[styles.orgDrivePostTitle, { color: roles.headingText }]}>
                    {drive.event_title}
                  </Text>
                  <View style={styles.orgDrivePostMeta}>
                    <MaterialCommunityIcons name="calendar-clock-outline" size={11} color={roles.metaText} />
                    <Text style={[styles.orgDrivePostDate, { color: roles.metaText }]}>
                      {formatDriveDate(drive.start_date, drive.end_date)}
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={16} color={roles.metaText} />
              </Pressable>
            ))}
          </View>
        ) : memberStatus === 'member' ? (
          <Text style={[styles.emptyDriveText, { color: roles.bodyText }]}>
            No donation drives yet.
          </Text>
        ) : (
          <Text style={[styles.emptyDriveText, { color: roles.bodyText }]}>
            Join the organization to view donation drive activities.
          </Text>
        )}
      </View>
    </AppCard>
  );
}

function OrganizationDetailView({ organization, isLoading, onBack, onOpenDrive }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const upcomingDrives = organization?.upcoming_drives || organization?.drives?.filter((drive) => {
    const compareDate = drive?.end_date || drive?.start_date;
    return compareDate && new Date(compareDate).getTime() >= new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  }) || [];
  const pastDrives = organization?.past_drives || organization?.drives?.filter((drive) => {
    const compareDate = drive?.end_date || drive?.start_date;
    return compareDate && new Date(compareDate).getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  }) || [];

  const renderDriveRow = (drive, prefix) => (
    <Pressable
      key={`${prefix}-${drive.donation_drive_id}`}
      onPress={() => onOpenDrive(drive)}
      style={({ pressed }) => [
        styles.orgDrivePost,
        { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder },
        pressed ? styles.drivePostPressed : null,
      ]}
    >
      <View style={[styles.orgDrivePostIcon, { backgroundColor: roles.iconPrimarySurface }]}>
        <MaterialCommunityIcons name="gift-outline" size={18} color={roles.primaryActionBackground} />
      </View>
      <View style={styles.orgDrivePostCopy}>
        <Text numberOfLines={1} style={[styles.orgDrivePostTitle, { color: roles.headingText }]}>
          {drive.event_title}
        </Text>
        <View style={styles.orgDrivePostMeta}>
          <MaterialCommunityIcons name="calendar-clock-outline" size={11} color={roles.metaText} />
          <Text style={[styles.orgDrivePostDate, { color: roles.metaText }]}>
            {formatDriveDate(drive.start_date, drive.end_date)}
          </Text>
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={16} color={roles.metaText} />
    </Pressable>
  );

  return (
    <View style={styles.organizationList}>
      <Pressable
        onPress={onBack}
        style={[styles.topBarIconButton, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}
      >
        <AppIcon name="arrowLeft" size="md" state="default" color={roles.headingText} />
      </Pressable>

      {isLoading ? (
        <AppCard variant="default" radius="xl" padding="lg">
          <View style={styles.loadingState}>
            <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
            <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading organization details</Text>
          </View>
        </AppCard>
      ) : organization ? (
        <AppCard variant="default" radius="xl" padding="lg">
          <Text style={[styles.detailOrgTitle, { color: roles.headingText }]}>{organization.organization_name}</Text>
          {organization.organization_type ? (
            <Text style={[styles.detailOrgMeta, { color: roles.metaText }]}>{organization.organization_type}</Text>
          ) : null}
          {organization.address_label || organization.location_label ? (
            <Text style={[styles.detailOrgMeta, { color: roles.bodyText }]}>{organization.address_label || organization.location_label}</Text>
          ) : null}
          {organization.contact_number ? (
            <Text style={[styles.detailOrgMeta, { color: roles.bodyText }]}>{organization.contact_number}</Text>
          ) : null}

          <View style={styles.orgDriveFeed}>
            <Text style={[styles.orgFeedLabel, { color: roles.headingText }]}>Upcoming donation drives</Text>
            {upcomingDrives.length ? upcomingDrives.map((drive) => renderDriveRow(drive, 'upcoming')) : (
              <Text style={[styles.emptyDriveText, { color: roles.bodyText }]}>No upcoming drives.</Text>
            )}
          </View>

          <View style={styles.orgDriveFeed}>
            <Text style={[styles.orgFeedLabel, { color: roles.headingText }]}>Past donation drives</Text>
            {pastDrives.length ? pastDrives.map((drive) => renderDriveRow(drive, 'past')) : (
              <Text style={[styles.emptyDriveText, { color: roles.bodyText }]}>No past drives yet.</Text>
            )}
          </View>
        </AppCard>
      ) : (
        <Text style={[styles.emptyStateText, { color: roles.bodyText }]}>Organization details are not available right now.</Text>
      )}
    </View>
  );
}

function ProfileSetupGate({ completionMeta, onManageProfile }) {
  return (
    <Pressable onPress={onManageProfile} style={({ pressed }) => [styles.profileGateCard, pressed ? styles.cardPressed : null]}>
      <View style={styles.profileGateTop}>
        <View style={styles.profileGateIcon}>
          <AppIcon name="shield-check-outline" size="lg" state="active" />
        </View>
        <View style={styles.profileGateCopy}>
          <Text style={styles.profileGateTitle}>Finish Setting Up Your Account</Text>
          <Text style={styles.profileGateBody}>{completionMeta?.percentage || 0}% complete</Text>
        </View>
        <AppIcon name="chevronRight" size="md" state="muted" />
      </View>
    </Pressable>
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
  const [selectedOrganizationDetail, setSelectedOrganizationDetail] = React.useState(null);
  const [isLoadingOrganizationDetail, setIsLoadingOrganizationDetail] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const donorProfileCompletionMeta = React.useMemo(() => buildProfileCompletionMeta({
    photo_path: profile?.photo_path || profile?.avatar_url || '',
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    birthdate: profile?.birthdate || '',
    gender: profile?.gender || '',
    contact_number: profile?.contact_number || profile?.phone || '',
    street: profile?.street || '',
    barangay: profile?.barangay || '',
    city: profile?.city || '',
    province: profile?.province || '',
    region: profile?.region || '',
    country: profile?.country || 'Philippines',
  }), [
    profile?.avatar_url,
    profile?.barangay,
    profile?.birthdate,
    profile?.city,
    profile?.contact_number,
    profile?.country,
    profile?.first_name,
    profile?.gender,
    profile?.last_name,
    profile?.phone,
    profile?.photo_path,
    profile?.province,
    profile?.region,
    profile?.street,
  ]);
  const isDonorProfileComplete = donorProfileCompletionMeta.isComplete;

  const loadOrganizations = React.useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    const result = await fetchOrganizationsWithDrives(24, 3, profile?.user_id || null);
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
  }, [highlightedOrganizationId, profile?.user_id]);

  React.useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const handleNavPress = (item) => {
    if (!item.route) return;
    router.navigate(item.route);
  };

  const openOrganizationDetail = React.useCallback(async (organization) => {
    if (!organization?.organization_id) return;
    setSelectedOrganizationDetail(organization);
    setIsLoadingOrganizationDetail(true);

    const result = await fetchOrganizationPreview(organization.organization_id, profile?.user_id || null, 24);
    if (result.data) {
      setSelectedOrganizationDetail(result.data);
    }

    setIsLoadingOrganizationDetail(false);
  }, [profile?.user_id]);

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

      {!isDonorProfileComplete ? (
        <ProfileSetupGate
          completionMeta={donorProfileCompletionMeta}
          onManageProfile={() => router.navigate('/profile')}
        />
      ) : selectedOrganizationDetail ? (
        <OrganizationDetailView
          organization={selectedOrganizationDetail}
          isLoading={isLoadingOrganizationDetail}
          onBack={() => setSelectedOrganizationDetail(null)}
          onOpenDrive={(drive) => router.navigate(`/donor/drives/${drive.donation_drive_id}`)}
        />
      ) : isLoading ? (
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
              onOpenOrganization={openOrganizationDetail}
              onOpenDrive={(drive) => router.navigate(`/donor/drives/${drive.donation_drive_id}`)}
              databaseUserId={profile?.user_id}
              onJoined={() => loadOrganizations()}
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
  cardPressed: {
    opacity: 0.82,
  },
  profileGateCard: {
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceElevated,
    padding: theme.spacing.lg,
  },
  profileGateTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  profileGateIcon: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  profileGateCopy: {
    flex: 1,
    gap: 4,
  },
  profileGateTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  profileGateBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
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
    paddingTop: theme.spacing.xs,
  },
  orgCoverBanner: {
    width: '100%',
    height: 110,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    overflow: 'hidden',
  },
  orgCoverImage: {
    width: '100%',
    height: '100%',
  },
  orgCoverFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgCardBody: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  orgIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: -22,
  },
  orgAvatarWrap: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  orgAvatarImage: {
    width: '100%',
    height: '100%',
  },
  orgAvatarInitials: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.bold,
  },
  orgIdentityCopy: {
    flex: 1,
    paddingTop: theme.spacing.md,
    gap: 2,
  },
  orgName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  orgType: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  orgJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    alignSelf: 'flex-end',
    marginBottom: 2,
  },
  orgJoinBtnText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  orgMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  orgMetaText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    flex: 1,
  },
  orgJoinFeedback: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  orgDriveFeed: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  orgFeedLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    marginBottom: 2,
  },
  detailOrgTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
    marginBottom: theme.spacing.xs,
  },
  detailOrgMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    marginBottom: theme.spacing.xs,
  },
  orgDrivePost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    padding: theme.spacing.sm,
  },
  drivePostPressed: {
    opacity: 0.75,
  },
  orgDrivePostIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgDrivePostCopy: {
    flex: 1,
    gap: 2,
  },
  orgDrivePostTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  orgDrivePostMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  orgDrivePostDate: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  emptyStateText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    paddingVertical: theme.spacing.xs,
  },
});
