import React from 'react';
import { ActivityIndicator, BackHandler, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import { fetchOrganizationPreview, joinOrganizationMembership, leaveOrganizationMembership } from '../../src/features/donorHome.api';
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

const getMobileOrganizationError = (error, fallback = 'Something went wrong. Please try again.') => {
  const message = String(error?.message || error || '').toLowerCase();
  if (!message) return fallback;
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return 'Connection problem. Check your internet and try again.';
  }
  if (message.includes('permission') || message.includes('42501') || message.includes('row-level')) {
    return 'We could not save this yet because your account permission is not ready.';
  }
  if (message.includes('not available') || message.includes('not open')) {
    return 'This organization is not available to join right now.';
  }
  if (message.includes('required')) {
    return 'Your donor account must be ready before joining an organization.';
  }
  return fallback;
};

function OrganizationsPageHeader({
  title = 'Organizations',
  isDetail = false,
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
            <Text numberOfLines={1} style={[styles.topBarTitle, { color: isDetail ? roles.primaryActionBackground : roles.headingText }]}>
              {title}
            </Text>
          </View>

          {isDetail ? (
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
            </View>
          ) : (
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
          )}
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

// Kept for possible reuse when browsing organizations as a standalone page.
// eslint-disable-next-line no-unused-vars
function OrganizationBrowseCard({ organization, onOpenOrganization, onOpenDrive, databaseUserId, onJoined }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const [isJoining, setIsJoining] = React.useState(false);
  const [memberStatus, setMemberStatus] = React.useState(() => {
    if (organization?.membership?.is_active) return 'member';
    if (organization?.membership?.is_pending) return 'pending';
    const s = String(organization?.membership?.status || '').toLowerCase();
    return s ? 'inactive' : 'none';
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
    if (organization?.membership?.is_active) {
      setMemberStatus('member');
      return;
    }
    if (organization?.membership?.is_pending) {
      setMemberStatus('pending');
      return;
    }
    const s = String(organization?.membership?.status || '').toLowerCase();
    setMemberStatus(s ? 'inactive' : 'none');
  }, [organization?.membership?.is_active, organization?.membership?.is_pending, organization?.membership?.status]);

  const handleJoin = React.useCallback(async () => {
    if (!databaseUserId || memberStatus === 'member' || memberStatus === 'pending' || isJoining) return;
    setIsJoining(true);
    setJoinFeedback('');
    const result = await joinOrganizationMembership({
      organizationId: organization.organization_id,
      databaseUserId,
    });
    setIsJoining(false);
    if (result.error) {
      setJoinFeedback(getMobileOrganizationError(result.error, 'Could not join right now. Please try again.'));
    } else {
      if (result.alreadyMember) setMemberStatus('member');
      else setMemberStatus(result.data?.is_pending ? 'pending' : 'member');
      setJoinFeedback('');
      onJoined?.();
    }
  }, [databaseUserId, isJoining, memberStatus, onJoined, organization.organization_id]);

  const joinLabel = memberStatus === 'member'
    ? 'Joined'
    : memberStatus === 'pending'
      ? 'Pending'
      : 'Join';
  const joinDisabled = memberStatus === 'member' || memberStatus === 'pending' || !isJoinable || isJoining;

  return (
    <AppCard variant="default" radius="xl" padding="none" style={styles.orgBrowseCard}>
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
                  name={memberStatus === 'member' ? 'check' : memberStatus === 'pending' ? 'clock-outline' : 'plus'}
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
        {false && memberStatus === 'member' && organization.drives?.length ? (
          <View style={styles.orgDriveFeed}>
            <Text style={[styles.orgFeedLabel, { color: roles.headingText }]}>Upcoming drives</Text>
            {organization.drives.slice(0, 1).map((drive) => (
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
        ) : null}
      </View>
    </AppCard>
  );
}

function OrganizationDetailView({ organization, isLoading, isJoining, isLeaving, onJoinOrganization, onLeaveOrganization, onOpenDrive }) {
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

  const [logoFailed, setLogoFailed] = React.useState(false);
  const isActiveMember = Boolean(organization?.membership?.is_active);
  const isPendingMember = Boolean(organization?.membership?.is_pending);
  const organizationName = organization?.organization_name || 'Organization';
  const locationLabel = organization?.address_label || organization?.location_label || 'Location to follow';
  const totalEvents = (organization?.drives || []).length || upcomingDrives.length + pastDrives.length;
  const joinTitle = isActiveMember
    ? 'Joined'
    : isPendingMember
      ? 'Pending Approval'
      : 'Join Organization';
  const buttonIsSecondary = isActiveMember || isPendingMember;

  React.useEffect(() => {
    setLogoFailed(false);
  }, [organization?.organization_logo_url]);

  const renderDriveRow = (drive, prefix) => (
    <Pressable
      key={`${prefix}-${drive.donation_drive_id}`}
      onPress={() => onOpenDrive?.(drive)}
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
    <View style={styles.orgDetailPage}>
      {isLoading ? (
        <AppCard variant="default" radius="xl" padding="lg">
          <View style={styles.loadingState}>
            <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
            <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading organization details</Text>
          </View>
        </AppCard>
      ) : organization ? (
        <>
          <View style={[styles.orgDetailHero, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            <View style={[styles.orgDetailCover, { backgroundColor: roles.iconPrimarySurface }]}>
              {organization.organization_logo_url && !logoFailed ? (
                <Image
                  source={{ uri: organization.organization_logo_url }}
                  style={styles.orgDetailCoverImage}
                  resizeMode="cover"
                  blurRadius={8}
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <MaterialCommunityIcons name="office-building-outline" size={64} color={roles.primaryActionBackground} />
              )}
              <View style={styles.orgDetailCoverOverlay} />
            </View>

            <View style={styles.orgDetailIdentity}>
              <View style={[styles.orgDetailLogo, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBackground }]}>
                {organization.organization_logo_url && !logoFailed ? (
                  <Image source={{ uri: organization.organization_logo_url }} style={styles.orgDetailLogoImage} resizeMode="cover" />
                ) : (
                  <Text style={[styles.orgDetailInitials, { color: roles.primaryActionBackground }]}>
                    {organizationName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </View>
              <Text numberOfLines={2} style={[styles.orgDetailName, { color: roles.headingText }]}>{organizationName}</Text>
              <View style={styles.orgDetailLocationRow}>
                <MaterialCommunityIcons name="map-marker-outline" size={17} color={roles.metaText} />
                <Text numberOfLines={2} style={[styles.orgDetailLocation, { color: roles.bodyText }]}>{locationLabel}</Text>
              </View>
              <Pressable
                onPress={isActiveMember ? onLeaveOrganization : onJoinOrganization}
                disabled={isPendingMember || isJoining || isLeaving}
                style={({ pressed }) => [
                  styles.orgDetailJoinButton,
                  {
                    backgroundColor: buttonIsSecondary ? roles.supportCardBackground : roles.primaryActionBackground,
                    borderColor: buttonIsSecondary ? roles.defaultCardBorder : roles.primaryActionBackground,
                  },
                  pressed ? styles.cardPressed : null,
                ]}
              >
                {isJoining || isLeaving ? (
                  <ActivityIndicator size="small" color={buttonIsSecondary ? roles.bodyText : roles.primaryActionText} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name={isActiveMember ? 'check' : isPendingMember ? 'clock-outline' : 'account-plus-outline'}
                      size={18}
                      color={buttonIsSecondary ? roles.bodyText : roles.primaryActionText}
                    />
                    <Text style={[
                      styles.orgDetailJoinText,
                      { color: buttonIsSecondary ? roles.bodyText : roles.primaryActionText },
                    ]}>
                      {joinTitle}
                    </Text>
                  </>
                )}
              </Pressable>
              {isPendingMember ? (
                <Text style={[styles.orgDetailPendingText, { color: roles.metaText }]}>
                  Your request is pending. We will notify you once approved.
                </Text>
              ) : null}
            </View>
          </View>

          <AppCard variant="default" radius="xl" padding="lg" style={styles.orgDetailSection}>
            <Text style={[styles.orgDetailSectionTitle, { color: roles.headingText }]}>About</Text>
            <Text style={[styles.orgDetailAbout, { color: roles.bodyText }]}>
              {organization.organization_type
                ? `${organizationName} is a ${organization.organization_type} partner for Donivra donation drives.`
                : `${organizationName} is a partner organization for Donivra hair donation activities.`}
              {organization.contact_number ? ` Contact: ${organization.contact_number}.` : ''}
            </Text>
            <View style={styles.orgDetailTags}>
              {organization.organization_type ? (
                <View style={[styles.orgDetailTag, { backgroundColor: roles.supportCardBackground }]}>
                  <Text style={[styles.orgDetailTagText, { color: roles.bodyText }]}>{organization.organization_type}</Text>
                </View>
              ) : null}
              <View style={[styles.orgDetailTag, { backgroundColor: roles.supportCardBackground }]}>
                <Text style={[styles.orgDetailTagText, { color: roles.bodyText }]}>
                  {organization.approval_status || 'Partner'}
                </Text>
              </View>
              <View style={[styles.orgDetailTag, { backgroundColor: roles.supportCardBackground }]}>
                <Text style={[styles.orgDetailTagText, { color: roles.bodyText }]}>
                  {organization.status || 'Active'}
                </Text>
              </View>
            </View>
          </AppCard>

          <View style={styles.orgDetailStatsRow}>
            <View style={[styles.orgDetailStatCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
              <Text style={[styles.orgDetailStatValue, { color: roles.primaryActionBackground }]}>
                {isActiveMember ? 'Yes' : isPendingMember ? 'Pending' : 'No'}
              </Text>
              <Text style={[styles.orgDetailStatLabel, { color: roles.metaText }]}>Member</Text>
            </View>
            <View style={[styles.orgDetailStatCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
              <Text style={[styles.orgDetailStatValue, { color: roles.primaryActionBackground }]}>{upcomingDrives.length}</Text>
              <Text style={[styles.orgDetailStatLabel, { color: roles.metaText }]}>Upcoming</Text>
            </View>
            <View style={[styles.orgDetailStatCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
              <Text style={[styles.orgDetailStatValue, { color: roles.primaryActionBackground }]}>{totalEvents}</Text>
              <Text style={[styles.orgDetailStatLabel, { color: roles.metaText }]}>Events</Text>
            </View>
          </View>

          <AppCard variant="default" radius="xl" padding="lg" style={styles.orgDetailCommunity}>
            <View style={styles.orgDetailCommunityCopy}>
              <Text style={[styles.orgDetailSectionTitle, { color: roles.headingText }]}>Community</Text>
              <Text style={[styles.orgDetailCommunityText, { color: roles.bodyText }]}>
                {isActiveMember
                  ? 'You are part of this organization. Private drives from this organization can appear in your donor home.'
                  : 'Join this organization to access member-only donation drives when available.'}
              </Text>
            </View>
            <View style={styles.orgDetailAvatarStack}>
              {[organizationName[0] || 'O', 'D', '+'].map((label, index) => (
                <View
                  key={`${label}-${index}`}
                  style={[
                    styles.orgDetailCommunityAvatar,
                    {
                      marginLeft: index === 0 ? 0 : -10,
                      backgroundColor: roles.iconPrimarySurface,
                      borderColor: roles.defaultCardBackground,
                    },
                  ]}
                >
                  <Text style={[styles.orgDetailCommunityAvatarText, { color: roles.primaryActionBackground }]}>
                    {label.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          </AppCard>

          <AppCard variant="default" radius="xl" padding="lg" style={styles.orgDetailSection}>
            <Text style={[styles.orgDetailSectionTitle, { color: roles.headingText }]}>Upcoming drives</Text>
            {upcomingDrives.length ? upcomingDrives.map((drive) => renderDriveRow(drive, 'upcoming')) : (
              <Text style={[styles.emptyDriveText, { color: roles.bodyText }]}>No upcoming drives.</Text>
            )}
          </AppCard>

          <AppCard variant="default" radius="xl" padding="lg" style={styles.orgDetailSection}>
            <Text style={[styles.orgDetailSectionTitle, { color: roles.headingText }]}>Past drives</Text>
            {pastDrives.length ? pastDrives.map((drive) => renderDriveRow(drive, 'past')) : (
              <Text style={[styles.emptyDriveText, { color: roles.bodyText }]}>No past drives yet.</Text>
            )}
          </AppCard>
        </>
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
  const [selectedOrganizationDetail, setSelectedOrganizationDetail] = React.useState(null);
  const [isLoadingOrganizationDetail, setIsLoadingOrganizationDetail] = React.useState(false);
  const [isJoiningOrganizationDetail, setIsJoiningOrganizationDetail] = React.useState(false);
  const [isLeavingOrganizationDetail, setIsLeavingOrganizationDetail] = React.useState(false);
  const [isJoinConfirmOpen, setIsJoinConfirmOpen] = React.useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = React.useState(false);
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
  const loadOrganizationDetail = React.useCallback(async () => {
    if (!highlightedOrganizationId) {
      router.replace('/donor/home?tab=organizations');
      return;
    }
    setErrorMessage('');
    const organizationId = Number(highlightedOrganizationId);
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      setIsLoadingOrganizationDetail(false);
      router.replace('/donor/home?tab=organizations');
      return;
    }
    setIsLoadingOrganizationDetail(true);
    const result = await fetchOrganizationPreview(organizationId, profile?.user_id || null, 24);
    if (result.error) {
      setErrorMessage(getMobileOrganizationError(result.error, 'Organization details could not be loaded right now.'));
    }
    setSelectedOrganizationDetail(result.data || null);
    setIsLoadingOrganizationDetail(false);
  }, [highlightedOrganizationId, profile?.user_id, router]);

  React.useEffect(() => {
    void loadOrganizationDetail();
  }, [loadOrganizationDetail]);

  const handleNavPress = (item) => {
    if (!item.route) return;
    router.navigate(item.route);
  };

  const handleJoinOrganizationDetail = React.useCallback(async () => {
    const organizationId = selectedOrganizationDetail?.organization_id;
    if (!organizationId || !profile?.user_id || isJoiningOrganizationDetail) return;

    setIsJoiningOrganizationDetail(true);
    setErrorMessage('');
    const result = await joinOrganizationMembership({
      organizationId,
      databaseUserId: profile.user_id,
    });
    setIsJoiningOrganizationDetail(false);

    if (result.error) {
      setErrorMessage(getMobileOrganizationError(result.error, 'Organization membership could not be saved right now.'));
      return;
    }
    if (result.alreadyPending) {
      setErrorMessage('Your request is still pending approval. We will notify you once approved.');
    } else if (result.requestSubmitted) {
      setErrorMessage('Join request submitted. Waiting for organization approval.');
    } else if (result.alreadyMember) {
      setErrorMessage('You are already an active member of this organization.');
    } else {
      setErrorMessage('Organization membership has been updated.');
    }

    const refreshed = await fetchOrganizationPreview(organizationId, profile.user_id, 24);
    if (refreshed.data) {
      setSelectedOrganizationDetail(refreshed.data);
    } else if (result.data) {
      setSelectedOrganizationDetail((current) => (
        current ? { ...current, membership: result.data } : current
      ));
    }
    await loadOrganizationDetail();
  }, [isJoiningOrganizationDetail, loadOrganizationDetail, profile?.user_id, selectedOrganizationDetail?.organization_id]);

  const handleLeaveOrganizationDetail = React.useCallback(async () => {
    const organizationId = selectedOrganizationDetail?.organization_id;
    if (!organizationId || !profile?.user_id || isLeavingOrganizationDetail) return;

    setIsLeavingOrganizationDetail(true);
    setErrorMessage('');
    const result = await leaveOrganizationMembership({
      organizationId,
      databaseUserId: profile.user_id,
    });
    setIsLeavingOrganizationDetail(false);

    if (result.error) {
      setErrorMessage(getMobileOrganizationError(result.error, 'Organization membership could not be updated right now.'));
      return;
    }

    setErrorMessage(result.alreadyLeft
      ? 'You are no longer an active member of this organization.'
      : 'You left this organization. You will need to send a new request before joining again.');

    const refreshed = await fetchOrganizationPreview(organizationId, profile.user_id, 24);
    if (refreshed.data) {
      setSelectedOrganizationDetail(refreshed.data);
    } else if (result.data) {
      setSelectedOrganizationDetail((current) => (
        current ? { ...current, membership: result.data } : current
      ));
    }
    await loadOrganizationDetail();
  }, [isLeavingOrganizationDetail, loadOrganizationDetail, profile?.user_id, selectedOrganizationDetail?.organization_id]);

  const handleRequestJoinOrganizationDetail = React.useCallback(() => {
    if (!selectedOrganizationDetail?.organization_id) return;
    if (selectedOrganizationDetail?.membership?.is_active || selectedOrganizationDetail?.membership?.is_pending) return;
    setIsJoinConfirmOpen(true);
  }, [selectedOrganizationDetail?.membership?.is_active, selectedOrganizationDetail?.membership?.is_pending, selectedOrganizationDetail?.organization_id]);

  const handleRequestLeaveOrganizationDetail = React.useCallback(() => {
    if (!selectedOrganizationDetail?.organization_id) return;
    if (!selectedOrganizationDetail?.membership?.is_active) return;
    setIsLeaveConfirmOpen(true);
  }, [selectedOrganizationDetail?.membership?.is_active, selectedOrganizationDetail?.organization_id]);

  useFocusEffect(
    React.useCallback(() => {
      const handleHardwareBack = () => {
        if (selectedOrganizationDetail || highlightedOrganizationId) {
          router.replace('/donor/home?tab=organizations');
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
      return () => subscription.remove();
    }, [highlightedOrganizationId, router, selectedOrganizationDetail])
  );

  return (
    <DashboardLayout
      showSupportChat
      navItems={donorDashboardNavItems}
      activeNavKey="home"
      navVariant="donor"
      onNavPress={handleNavPress}
      screenVariant="default"
      header={(
        <OrganizationsPageHeader
          avatarUri={profile?.avatar_url || profile?.photo_path || ''}
          title={selectedOrganizationDetail?.organization_name || 'Organizations'}
          isDetail={Boolean(selectedOrganizationDetail)}
          unreadCount={unreadCount}
          onBackPress={() => {
            if (selectedOrganizationDetail) {
              router.replace('/donor/home?tab=organizations');
              return;
            }
            router.replace('/donor/home?tab=organizations');
          }}
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
      ) : selectedOrganizationDetail || highlightedOrganizationId ? (
        <OrganizationDetailView
          organization={selectedOrganizationDetail}
          isLoading={isLoadingOrganizationDetail}
          isJoining={isJoiningOrganizationDetail}
          isLeaving={isLeavingOrganizationDetail}
          onJoinOrganization={handleRequestJoinOrganizationDetail}
          onLeaveOrganization={handleRequestLeaveOrganizationDetail}
          onOpenDrive={(drive) => router.navigate(`/donor/drives/${drive.donation_drive_id}`)}
        />
      ) : (
        <AppCard variant="default" radius="xl" padding="lg">
          <View style={styles.loadingState}>
            <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
            <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading organization details</Text>
          </View>
        </AppCard>
      )}

      <Modal transparent visible={isJoinConfirmOpen} animationType="fade" onRequestClose={() => setIsJoinConfirmOpen(false)}>
        <View style={styles.joinModalOverlay}>
          <Pressable style={styles.joinModalBackdrop} onPress={() => setIsJoinConfirmOpen(false)} />
          <AppCard variant="elevated" radius="xl" padding="lg" style={styles.joinModalCard}>
            <Text style={styles.joinModalTitle}>Send Join Request?</Text>
            <Text style={styles.joinModalBody}>
              Your membership will stay pending until the organization approves it.
            </Text>
            <View style={styles.joinModalActions}>
              <AppButton
                title="Cancel"
                variant="outline"
                fullWidth={false}
                onPress={() => setIsJoinConfirmOpen(false)}
              />
              <AppButton
                title="Confirm"
                fullWidth={false}
                loading={isJoiningOrganizationDetail}
                onPress={async () => {
                  setIsJoinConfirmOpen(false);
                  await handleJoinOrganizationDetail();
                }}
              />
            </View>
          </AppCard>
        </View>
      </Modal>

      <Modal transparent visible={isLeaveConfirmOpen} animationType="fade" onRequestClose={() => setIsLeaveConfirmOpen(false)}>
        <View style={styles.joinModalOverlay}>
          <Pressable style={styles.joinModalBackdrop} onPress={() => setIsLeaveConfirmOpen(false)} />
          <AppCard variant="elevated" radius="xl" padding="lg" style={styles.joinModalCard}>
            <Text style={styles.joinModalTitle}>Leave Organization?</Text>
            <Text style={styles.joinModalBody}>
              Once you leave, you will need to send a new join request before becoming a member again.
            </Text>
            <View style={styles.joinModalActions}>
              <AppButton
                title="Cancel"
                variant="outline"
                fullWidth={false}
                onPress={() => setIsLeaveConfirmOpen(false)}
              />
              <AppButton
                title="Leave"
                fullWidth={false}
                loading={isLeavingOrganizationDetail}
                onPress={async () => {
                  setIsLeaveConfirmOpen(false);
                  await handleLeaveOrganizationDetail();
                }}
              />
            </View>
          </AppCard>
        </View>
      </Modal>
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
  searchBox: {
    minHeight: 48,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    paddingVertical: 0,
  },
  cardPressed: {
    opacity: 0.82,
  },
  orgBrowseCard: {
    overflow: 'hidden',
  },
  profileGateCard: {
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceCard,
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
    height: 0,
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
    paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  orgIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: 0,
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
    justifyContent: 'center',
    gap: 4,
    minWidth: 86,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
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
  orgDetailPage: {
    gap: theme.spacing.lg,
  },
  orgDetailHero: {
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    overflow: 'visible',
    marginBottom: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  orgDetailCover: {
    height: 190,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgDetailCoverImage: {
    width: '100%',
    height: '100%',
  },
  orgDetailCoverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  orgDetailIdentity: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 0,
    paddingBottom: theme.spacing.lg,
    marginTop: -52,
  },
  orgDetailLogo: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.soft,
  },
  orgDetailLogoImage: {
    width: '100%',
    height: '100%',
  },
  orgDetailInitials: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
  },
  orgDetailName: {
    marginTop: theme.spacing.sm,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: theme.typography.weights.bold,
  },
  orgDetailLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  orgDetailLocation: {
    flexShrink: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  orgDetailJoinButton: {
    minHeight: 48,
    marginTop: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  orgDetailJoinText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  orgDetailPendingText: {
    marginTop: theme.spacing.xs,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  orgDetailSection: {
    marginBottom: 0,
  },
  orgDetailSectionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.bold,
    marginBottom: theme.spacing.sm,
  },
  orgDetailAbout: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  orgDetailTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },
  orgDetailTag: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
  },
  orgDetailTagText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'capitalize',
  },
  orgDetailStatsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  orgDetailStatCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  orgDetailStatValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: theme.typography.weights.bold,
  },
  orgDetailStatLabel: {
    marginTop: 2,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  orgDetailCommunity: {
    marginBottom: theme.spacing.md,
  },
  orgDetailCommunityCopy: {
    marginBottom: theme.spacing.md,
  },
  orgDetailCommunityText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  orgDetailAvatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orgDetailCommunityAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgDetailCommunityAvatarText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
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
  joinModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  joinModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  joinModalCard: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  joinModalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  joinModalBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  joinModalActions: {
    marginTop: theme.spacing.lg,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
});
