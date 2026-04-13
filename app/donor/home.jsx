import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { DashboardSectionHeader } from '../../src/components/ui/DashboardSectionHeader';
import { DashboardWidgetRail } from '../../src/components/ui/DashboardWidgetRail';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { AppTextLink } from '../../src/components/ui/AppTextLink';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { DonorTopBar } from '../../src/components/donor/DonorTopBar';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import { fetchHairSubmissionsByUserId } from '../../src/features/hairSubmission.api';
import {
  createDonationDriveRsvp,
  fetchDonationDrivePreview,
  fetchFeaturedOrganizations,
  fetchOrganizationPreview,
  fetchUpcomingDonationDrives,
} from '../../src/features/donorHome.api';
import { useAuthActions } from '../../src/features/auth/hooks/useAuthActions';
import { useNotifications } from '../../src/hooks/useNotifications';
import { useAuth } from '../../src/providers/AuthProvider';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';

const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const formatMonthLabel = (value) => (
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(value)
);

const formatDayLabel = (value) => (
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
);

const formatDriveDate = (startDate, endDate) => {
  if (!startDate) return 'Date to follow';
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  const shortFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

  if (!end) {
    return shortFormatter.format(start);
  }

  return `${shortFormatter.format(start)} - ${shortFormatter.format(end)}`;
};

const buildCalendarDays = (visibleMonth) => {
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const firstWeekday = firstDay.getDay();
  const firstCalendarDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - firstWeekday);

  return Array.from({ length: 35 }, (_, index) => {
    const day = new Date(firstCalendarDay);
    day.setDate(firstCalendarDay.getDate() + index);
    return day;
  });
};

const normalizeConditionTone = (condition = '') => {
  const normalized = String(condition || '').trim().toLowerCase();

  if (normalized.includes('healthy') || normalized.includes('good')) {
    return {
      dotColor: '#54b86f',
      label: 'Healthy',
    };
  }

  if (normalized.includes('dry') || normalized.includes('damaged')) {
    return {
      dotColor: '#f0a856',
      label: 'Needs care',
    };
  }

  if (normalized.includes('treated') || normalized.includes('rebonded') || normalized.includes('colored')) {
    return {
      dotColor: '#7a8ae6',
      label: 'Treated',
    };
  }

  return {
    dotColor: theme.colors.brandPrimary,
    label: condition || 'Checked',
  };
};

const buildHairConditionHistory = (submissions = []) => {
  const screenings = submissions
    .flatMap((submission) => submission?.ai_screenings || [])
    .filter((screening) => screening?.created_at);

  const markers = new Map();

  screenings.forEach((screening) => {
    const key = new Date(screening.created_at).toISOString().slice(0, 10);
    const current = markers.get(key);

    if (!current || new Date(screening.created_at).getTime() > new Date(current.created_at).getTime()) {
      markers.set(key, screening);
    }
  });

  const latestScreening = screenings.sort((left, right) => (
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  ))[0] || null;

  return {
    markers,
    latestScreening,
  };
};

function DonationDriveCard({ drive }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  return (
    <AppCard variant="default" radius="xl" padding="md" style={styles.driveCard}>
      <View style={styles.driveCardTop}>
        <View style={[styles.iconChip, { backgroundColor: roles.iconPrimarySurface }]}>
          <AppIcon name="donations" size="sm" state="default" color={roles.iconPrimaryColor} />
        </View>
        <Text style={[styles.driveStatus, { color: roles.metaText }]}>
          {drive.status || 'Upcoming'}
        </Text>
      </View>

      <Text numberOfLines={2} style={[styles.driveTitle, { color: roles.headingText }]}>
        {drive.event_title || 'Donation drive'}
      </Text>

      <View style={styles.driveMetaBlock}>
        <View style={styles.inlineMetaRow}>
          <AppIcon name="appointment" size="sm" state="muted" />
          <Text numberOfLines={1} style={[styles.inlineMetaText, { color: roles.bodyText }]}>
            {formatDriveDate(drive.start_date, drive.end_date)}
          </Text>
        </View>

        {drive.location_label ? (
          <View style={styles.inlineMetaRow}>
            <AppIcon name="location" size="sm" state="muted" />
            <Text numberOfLines={1} style={[styles.inlineMetaText, { color: roles.bodyText }]}>
              {drive.location_label}
            </Text>
          </View>
        ) : null}

        {drive.organization_name ? (
          <View style={styles.inlineMetaRow}>
            <AppIcon name="organization" size="sm" state="muted" />
            <Text numberOfLines={1} style={[styles.inlineMetaText, { color: roles.bodyText }]}>
              {drive.organization_name}
            </Text>
          </View>
        ) : null}
      </View>
    </AppCard>
  );
}

function OrganizationCard({ organization }) {
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
    <AppCard variant="default" radius="xl" padding="md" style={styles.organizationCard}>
      <View style={[styles.organizationLogoWrap, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}>
        {organization?.organization_logo_url && !imageFailed ? (
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
      <Text numberOfLines={2} style={[styles.organizationName, { color: roles.headingText }]}>
        {organization.organization_name}
      </Text>
    </AppCard>
  );
}

function PreviewMetaRow({ icon, text }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  if (!text) return null;

  return (
    <View style={styles.previewMetaRow}>
      <AppIcon name={icon} size="sm" state="muted" />
      <Text numberOfLines={2} style={[styles.previewMetaText, { color: roles.bodyText }]}>
        {text}
      </Text>
    </View>
  );
}

function DonationDrivePreviewModal({
  visible,
  drive,
  isLoading,
  errorMessage,
  feedbackMessage,
  feedbackVariant,
  isSubmittingRsvp,
  onClose,
  onShowMore,
  onRsvp,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewModalOverlay}>
        <Pressable style={styles.previewModalBackdrop} onPress={onClose} />

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.previewModalCard}>
          <View style={styles.previewModalHeader}>
            <View style={styles.previewModalHeaderCopy}>
              <Text style={[styles.previewEyebrow, { color: roles.metaText }]}>Drive preview</Text>
              <Text style={[styles.previewTitle, { color: roles.headingText }]}>
                {drive?.event_title || 'Donation drive'}
              </Text>
            </View>

            <Pressable onPress={onClose} style={[styles.previewCloseButton, { backgroundColor: roles.supportCardBackground }]}>
              <AppIcon name="close" size="sm" state="muted" />
            </Pressable>
          </View>

          {feedbackMessage ? (
            <StatusBanner
              variant={feedbackVariant || 'info'}
              message={feedbackMessage}
              style={styles.previewBanner}
            />
          ) : null}

          {isLoading ? (
            <View style={styles.previewLoadingState}>
              <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
              <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading drive overview</Text>
            </View>
          ) : drive ? (
            <>
              <View style={styles.previewIdentityRow}>
                {drive.organization_logo_url ? (
                  <Image source={{ uri: drive.organization_logo_url }} style={styles.previewLogo} resizeMode="cover" />
                ) : (
                  <View style={[styles.previewLogoFallback, { backgroundColor: roles.iconPrimarySurface }]}>
                    <AppIcon name="donations" size="md" state="default" color={roles.iconPrimaryColor} />
                  </View>
                )}

                <View style={styles.previewIdentityCopy}>
                  {drive.organization_name ? (
                    <Text style={[styles.previewSupportText, { color: roles.metaText }]}>
                      {drive.organization_name}
                    </Text>
                  ) : null}
                  <Text style={[styles.previewStatusText, { color: roles.metaText }]}>
                    {drive.registration ? 'RSVP saved' : (drive.status || 'Upcoming')}
                  </Text>
                </View>
              </View>

              <View style={styles.previewMetaBlock}>
                <PreviewMetaRow icon="appointment" text={formatDriveDate(drive.start_date, drive.end_date)} />
                <PreviewMetaRow icon="location" text={drive.address_label || drive.location_label} />
              </View>

              {drive.short_overview ? (
                <Text style={[styles.previewBody, { color: roles.bodyText }]}>
                  {drive.short_overview}
                </Text>
              ) : null}

              <View style={styles.previewActions}>
                <AppButton
                  title={drive.registration ? 'RSVP saved' : 'RSVP'}
                  fullWidth={false}
                  onPress={onRsvp}
                  disabled={Boolean(drive.registration) || isSubmittingRsvp}
                  loading={isSubmittingRsvp}
                />
                <AppTextLink title="Show more" onPress={onShowMore} />
              </View>
            </>
          ) : (
            <Text style={[styles.emptySectionText, { color: roles.bodyText }]}>
              Drive details are not available right now.
            </Text>
          )}
        </AppCard>
      </View>
    </Modal>
  );
}

function OrganizationPreviewModal({
  visible,
  organization,
  isLoading,
  errorMessage,
  onClose,
  onJoinOrganization,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [organization?.organization_logo_url]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewModalOverlay}>
        <Pressable style={styles.previewModalBackdrop} onPress={onClose} />

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.previewModalCard}>
          <View style={styles.previewModalHeader}>
            <View style={styles.previewModalHeaderCopy}>
              <Text style={[styles.previewEyebrow, { color: roles.metaText }]}>Organization</Text>
              <Text style={[styles.previewTitle, { color: roles.headingText }]}>
                {organization?.organization_name || 'Organization preview'}
              </Text>
            </View>

            <Pressable onPress={onClose} style={[styles.previewCloseButton, { backgroundColor: roles.supportCardBackground }]}>
              <AppIcon name="close" size="sm" state="muted" />
            </Pressable>
          </View>

          {errorMessage ? (
            <StatusBanner
              variant="info"
              message={errorMessage}
              style={styles.previewBanner}
            />
          ) : null}

          {isLoading ? (
            <View style={styles.previewLoadingState}>
              <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
              <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading organization</Text>
            </View>
          ) : organization ? (
            <>
              <View style={styles.organizationPreviewIdentity}>
                <View style={[styles.organizationPreviewLogoWrap, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}>
                  {organization.organization_logo_url && !imageFailed ? (
                    <Image
                      source={{ uri: organization.organization_logo_url }}
                      style={styles.organizationPreviewLogo}
                      resizeMode="cover"
                      onError={() => setImageFailed(true)}
                    />
                  ) : (
                    <AppIcon name="organization" size="md" state="default" color={roles.headingText} />
                  )}
                </View>

                <View style={styles.organizationPreviewCopy}>
                  {organization.organization_type ? (
                    <Text style={[styles.previewSupportText, { color: roles.metaText }]}>
                      {organization.organization_type}
                    </Text>
                  ) : null}
                  {organization.location_label ? (
                    <Text style={[styles.previewStatusText, { color: roles.metaText }]}>
                      {organization.location_label}
                    </Text>
                  ) : null}
                </View>
              </View>

              {organization.short_overview ? (
                <Text style={[styles.previewBody, { color: roles.bodyText }]}>
                  {organization.short_overview}
                </Text>
              ) : null}

              {organization.drives?.length ? (
                <View style={styles.organizationDriveList}>
                  <Text style={[styles.organizationDriveTitle, { color: roles.headingText }]}>Related drives</Text>
                  {organization.drives.map((drive) => (
                    <View key={`preview-drive-${drive.donation_drive_id}`} style={[styles.organizationDriveRow, { borderColor: roles.defaultCardBorder }]}>
                      <Text numberOfLines={1} style={[styles.organizationDriveName, { color: roles.headingText }]}>
                        {drive.event_title}
                      </Text>
                      <Text style={[styles.organizationDriveDate, { color: roles.metaText }]}>
                        {formatDriveDate(drive.start_date, drive.end_date)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.organizationPreviewActions}>
                <AppButton
                  title="Join organization"
                  fullWidth={false}
                  onPress={onJoinOrganization}
                />
              </View>
            </>
          ) : (
            <Text style={[styles.emptySectionText, { color: roles.bodyText }]}>
              Organization details are not available right now.
            </Text>
          )}
        </AppCard>
      </View>
    </Modal>
  );
}

function HairCalendarCard({ submissions, onOpenAnalyzer }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const visibleMonth = React.useMemo(() => new Date(), []);
  const calendarDays = React.useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const history = React.useMemo(() => buildHairConditionHistory(submissions), [submissions]);
  const hasHistory = history.markers.size > 0;
  const latestTone = normalizeConditionTone(history.latestScreening?.detected_condition);

  if (!hasHistory) {
    return (
      <AppCard variant="default" radius="xl" padding="md">
        <View style={styles.emptyCalendarState}>
          <View style={[styles.emptyCalendarIcon, { backgroundColor: roles.iconPrimarySurface }]}>
            <AppIcon name="checkHair" size="md" state="default" color={roles.iconPrimaryColor} />
          </View>
          <View style={styles.emptyCalendarCopy}>
            <Text style={[styles.emptyCalendarTitle, { color: roles.headingText }]}>No hair check yet</Text>
            <Text style={[styles.emptyCalendarBody, { color: roles.bodyText }]}>
              Try CheckHair to see your hair condition here.
            </Text>
          </View>
          <AppButton
            title="Try CheckHair"
            size="md"
            fullWidth={false}
            onPress={onOpenAnalyzer}
          />
        </View>
      </AppCard>
    );
  }

  return (
    <AppCard variant="default" radius="xl" padding="md">
      <View style={styles.calendarHeaderRow}>
        <View>
          <Text style={[styles.calendarMonthLabel, { color: roles.headingText }]}>
            {formatMonthLabel(visibleMonth)}
          </Text>
          <Text style={[styles.calendarSummaryText, { color: roles.bodyText }]}>
            Latest: {latestTone.label}
          </Text>
        </View>

        <View style={[styles.latestConditionChip, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}>
          <View style={[styles.conditionDot, { backgroundColor: latestTone.dotColor }]} />
          <Text style={[styles.latestConditionText, { color: roles.headingText }]}>
            {formatDayLabel(history.latestScreening?.created_at)}
          </Text>
        </View>
      </View>

      <View style={styles.weekdayRow}>
        {weekdayLabels.map((label) => (
          <Text key={label} style={[styles.weekdayLabel, { color: roles.metaText }]}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {calendarDays.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const screening = history.markers.get(key);
          const tone = normalizeConditionTone(screening?.detected_condition);
          const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();

          return (
            <View
              key={key}
              style={[
                styles.calendarCell,
                {
                  backgroundColor: screening ? roles.supportCardBackground : roles.defaultCardBackground,
                  borderColor: screening ? roles.supportCardBorder : roles.defaultCardBorder,
                  opacity: isCurrentMonth ? 1 : 0.42,
                },
              ]}
            >
              <Text style={[styles.calendarCellLabel, { color: roles.headingText }]}>
                {day.getDate()}
              </Text>
              <View
                style={[
                  styles.conditionDot,
                  { backgroundColor: screening ? tone.dotColor : theme.colors.transparent },
                ]}
              />
            </View>
          );
        })}
      </View>
    </AppCard>
  );
}

export default function DonorHomeScreen() {
  const router = useRouter();
  const { user, profile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const { logout, isLoading: isLoggingOut } = useAuthActions();
  const { unreadCount } = useNotifications({ role: 'donor', userId: user?.id, databaseUserId: profile?.user_id });
  const [isLoadingHome, setIsLoadingHome] = React.useState(true);
  const [homeError, setHomeError] = React.useState('');
  const [donationDrives, setDonationDrives] = React.useState([]);
  const [organizations, setOrganizations] = React.useState([]);
  const [hairSubmissions, setHairSubmissions] = React.useState([]);
  const [showAllDrives, setShowAllDrives] = React.useState(false);
  const [isDrivePreviewOpen, setIsDrivePreviewOpen] = React.useState(false);
  const [isOrganizationPreviewOpen, setIsOrganizationPreviewOpen] = React.useState(false);
  const [isLoadingDrivePreview, setIsLoadingDrivePreview] = React.useState(false);
  const [isLoadingOrganizationPreview, setIsLoadingOrganizationPreview] = React.useState(false);
  const [isSubmittingDriveRsvp, setIsSubmittingDriveRsvp] = React.useState(false);
  const [selectedDrivePreview, setSelectedDrivePreview] = React.useState(null);
  const [selectedOrganizationPreview, setSelectedOrganizationPreview] = React.useState(null);
  const [drivePreviewError, setDrivePreviewError] = React.useState('');
  const [organizationPreviewError, setOrganizationPreviewError] = React.useState('');
  const [drivePreviewFeedback, setDrivePreviewFeedback] = React.useState({ message: '', variant: 'info' });

  const firstName = String(profile?.first_name || '').trim();
  const lastName = String(profile?.last_name || '').trim();
  const greetingName = firstName || String(profile?.email || user?.email || 'Donor').split('@')[0];
  const greeting = `Hello, ${greetingName}`;
  const avatarInitials = [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase();
  const avatarUri = profile?.avatar_url || profile?.photo_path || '';

  const loadHome = React.useCallback(async () => {
    if (!user?.id) return;

    setIsLoadingHome(true);
    setHomeError('');

    const [drivesResult, organizationsResult, submissionsResult] = await Promise.all([
      fetchUpcomingDonationDrives(8),
      fetchFeaturedOrganizations(10),
      fetchHairSubmissionsByUserId(user.id, 12),
    ]);

    setDonationDrives(drivesResult.data || []);
    setOrganizations(organizationsResult.data || []);
    setHairSubmissions(submissionsResult.data || []);

    const loadFailed = Boolean(drivesResult.error || organizationsResult.error || submissionsResult.error);
    setHomeError(loadFailed ? 'Some donor home updates could not be loaded right now.' : '');
    setIsLoadingHome(false);
  }, [user?.id]);

  React.useEffect(() => {
    loadHome();
  }, [loadHome]);

  const visibleDrives = showAllDrives ? donationDrives : donationDrives.slice(0, 4);

  const handleNavPress = (item) => {
    if (!item.route) return;
    router.navigate(item.route);
  };

  const handleOpenDrivePreview = React.useCallback(async (drive) => {
    if (!drive?.donation_drive_id) return;

    setSelectedDrivePreview(drive);
    setDrivePreviewError('');
    setDrivePreviewFeedback({ message: '', variant: 'info' });
    setIsDrivePreviewOpen(true);
    setIsLoadingDrivePreview(true);

    const result = await fetchDonationDrivePreview(drive.donation_drive_id, profile?.user_id || null);
    if (result.error) {
      setDrivePreviewError('Drive details could not be loaded right now.');
    }

    if (result.data) {
      setSelectedDrivePreview(result.data);
    }

    setIsLoadingDrivePreview(false);
  }, [profile?.user_id]);

  const handleOpenOrganizationPreview = React.useCallback(async (organization) => {
    if (!organization?.organization_id) return;

    setSelectedOrganizationPreview(organization);
    setOrganizationPreviewError('');
    setIsOrganizationPreviewOpen(true);
    setIsLoadingOrganizationPreview(true);

    const result = await fetchOrganizationPreview(organization.organization_id);
    if (result.error) {
      setOrganizationPreviewError('Organization details could not be loaded right now.');
    }

    if (result.data) {
      setSelectedOrganizationPreview(result.data);
    }

    setIsLoadingOrganizationPreview(false);
  }, []);

  const handleRsvpDrive = React.useCallback(async () => {
    if (!selectedDrivePreview?.donation_drive_id || !profile?.user_id) {
      setDrivePreviewFeedback({
        message: 'Your donor account is required before sending an RSVP.',
        variant: 'info',
      });
      return;
    }

    setIsSubmittingDriveRsvp(true);
    setDrivePreviewFeedback({ message: '', variant: 'info' });

    const result = await createDonationDriveRsvp({
      driveId: selectedDrivePreview.donation_drive_id,
      databaseUserId: profile.user_id,
      organizationId: selectedDrivePreview.organization_id || null,
    });

    setIsSubmittingDriveRsvp(false);

    if (result.error) {
      setDrivePreviewFeedback({
        message: 'RSVP could not be saved right now. Please try again.',
        variant: 'error',
      });
      return;
    }

    setSelectedDrivePreview((current) => (
      current
        ? {
          ...current,
          registration: result.data,
          can_rsvp: false,
        }
        : current
    ));
    setDrivePreviewFeedback({
      message: result.alreadyRegistered ? 'You already saved an RSVP for this drive.' : 'RSVP saved.',
      variant: 'success',
    });
  }, [profile?.user_id, selectedDrivePreview]);

  const handleShowDriveMore = React.useCallback(() => {
    if (!selectedDrivePreview?.donation_drive_id) return;
    setIsDrivePreviewOpen(false);
    router.navigate(`/donor/drives/${selectedDrivePreview.donation_drive_id}`);
  }, [router, selectedDrivePreview]);

  const handleViewAllOrganizations = React.useCallback(() => {
    const organizationId = selectedOrganizationPreview?.organization_id;
    setIsOrganizationPreviewOpen(false);
    if (organizationId) {
      router.navigate({
        pathname: '/donor/organizations',
        params: { organizationId: String(organizationId) },
      });
      return;
    }

    router.navigate('/donor/organizations');
  }, [router, selectedOrganizationPreview?.organization_id]);

  return (
    <DashboardLayout
      navItems={donorDashboardNavItems}
      activeNavKey="home"
      navVariant="donor"
      onNavPress={handleNavPress}
      screenVariant="default"
      chatModalPresentation="centered"
      draggableChat={true}
      header={(
        <DonorTopBar
          title={greeting}
          avatarInitials={avatarInitials}
          avatarUri={avatarUri}
          unreadCount={unreadCount}
          onNotificationsPress={() => router.navigate('/donor/notifications')}
          onProfilePress={() => router.navigate('/profile')}
          onLogoutPress={logout}
          isLoggingOut={isLoggingOut}
        />
      )}
    >
      {homeError ? (
        <StatusBanner
          variant="info"
          message={homeError}
          style={styles.statusBanner}
        />
      ) : null}

      <View style={styles.section}>
        <DashboardSectionHeader
          title="Upcoming drives"
          actionLabel={donationDrives.length > 4 ? (showAllDrives ? 'Show less' : 'View more') : undefined}
          onActionPress={donationDrives.length > 4 ? () => setShowAllDrives((current) => !current) : undefined}
        />

        {isLoadingHome ? (
          <AppCard variant="default" radius="xl" padding="md">
            <View style={styles.loadingState}>
              <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
              <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading drives</Text>
            </View>
          </AppCard>
        ) : visibleDrives.length ? (
          <DashboardWidgetRail
            items={visibleDrives.map((item) => ({ ...item, key: `drive-${item.donation_drive_id}` }))}
            cardWidth={258}
            renderItem={(item, _index, width) => (
              <View style={{ width }}>
                <Pressable onPress={() => handleOpenDrivePreview(item)} style={({ pressed }) => [pressed ? styles.cardPressed : null]}>
                  <DonationDriveCard drive={item} />
                </Pressable>
              </View>
            )}
          />
        ) : (
          <Text style={[styles.emptySectionText, styles.emptySectionTextInline, { color: roles.bodyText }]}>
            No upcoming drives right now.
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <DashboardSectionHeader
          title="Organizations"
          actionLabel="View all organization"
          onActionPress={() => router.navigate('/donor/organizations')}
        />

        {isLoadingHome ? (
          <AppCard variant="default" radius="xl" padding="md">
            <View style={styles.loadingState}>
              <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
              <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading organizations</Text>
            </View>
          </AppCard>
        ) : organizations.length ? (
          <DashboardWidgetRail
            items={organizations.map((item) => ({ ...item, key: `organization-${item.organization_id}` }))}
            cardWidth={126}
            spacing={theme.spacing.sm}
            renderItem={(item, _index, width) => (
              <View style={{ width }}>
                <Pressable onPress={() => handleOpenOrganizationPreview(item)} style={({ pressed }) => [pressed ? styles.cardPressed : null]}>
                  <OrganizationCard organization={item} />
                </Pressable>
              </View>
            )}
          />
        ) : (
          <AppCard variant="default" radius="xl" padding="md">
            <Text style={[styles.emptySectionText, { color: roles.bodyText }]}>No organizations available yet.</Text>
          </AppCard>
        )}
      </View>

      <View style={styles.section}>
        <DashboardSectionHeader title="Hair condition" />
        {isLoadingHome ? (
          <AppCard variant="default" radius="xl" padding="md">
            <View style={styles.loadingState}>
              <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
              <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading hair history</Text>
            </View>
          </AppCard>
        ) : (
          <HairCalendarCard
            submissions={hairSubmissions}
            onOpenAnalyzer={() => router.navigate('/donor/donations')}
          />
        )}
      </View>

      <DonationDrivePreviewModal
        visible={isDrivePreviewOpen}
        drive={selectedDrivePreview}
        isLoading={isLoadingDrivePreview}
        errorMessage={drivePreviewError}
        feedbackMessage={drivePreviewError || drivePreviewFeedback.message}
        feedbackVariant={drivePreviewError ? 'error' : drivePreviewFeedback.variant}
        isSubmittingRsvp={isSubmittingDriveRsvp}
        onClose={() => {
          setIsDrivePreviewOpen(false);
          setDrivePreviewError('');
          setDrivePreviewFeedback({ message: '', variant: 'info' });
        }}
        onShowMore={handleShowDriveMore}
        onRsvp={handleRsvpDrive}
      />

      <OrganizationPreviewModal
        visible={isOrganizationPreviewOpen}
        organization={selectedOrganizationPreview}
        isLoading={isLoadingOrganizationPreview}
        errorMessage={organizationPreviewError}
        onClose={() => {
          setIsOrganizationPreviewOpen(false);
          setOrganizationPreviewError('');
        }}
        onJoinOrganization={handleViewAllOrganizations}
      />
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  statusBanner: {
    marginTop: 0,
  },
  section: {
    gap: theme.spacing.sm,
  },
  loadingState: {
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  emptySectionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  emptySectionTextInline: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
  },
  driveCard: {
    minHeight: 156,
  },
  driveCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driveStatus: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: theme.typography.weights.semibold,
  },
  driveTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    lineHeight: theme.typography.semantic.bodyLg * theme.typography.lineHeights.snug,
    marginBottom: theme.spacing.sm,
  },
  driveMetaBlock: {
    gap: theme.spacing.xs,
  },
  inlineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  inlineMetaText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  organizationCard: {
    minHeight: 136,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  organizationLogoWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
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
  organizationName: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    fontWeight: theme.typography.weights.semibold,
  },
  previewModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  previewModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  previewModalCard: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  previewModalHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  previewEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  previewTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
  },
  previewCloseButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBanner: {
    marginBottom: theme.spacing.sm,
  },
  previewLoadingState: {
    minHeight: 172,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  previewIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  previewLogo: {
    width: 48,
    height: 48,
    borderRadius: 16,
  },
  previewLogoFallback: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewIdentityCopy: {
    flex: 1,
    gap: 2,
  },
  previewSupportText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  previewStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  previewMetaBlock: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  previewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  previewMetaText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  previewBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    marginBottom: theme.spacing.md,
  },
  previewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  organizationPreviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  organizationPreviewIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  organizationPreviewLogoWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
  },
  organizationPreviewLogo: {
    width: '100%',
    height: '100%',
  },
  organizationPreviewCopy: {
    flex: 1,
    gap: 2,
  },
  organizationDriveList: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  organizationDriveTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  organizationDriveRow: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  organizationDriveName: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    marginBottom: 2,
  },
  organizationDriveDate: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  emptyCalendarState: {
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  emptyCalendarIcon: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCalendarCopy: {
    gap: 4,
  },
  emptyCalendarTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  emptyCalendarBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  calendarMonthLabel: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  calendarSummaryText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  latestConditionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  latestConditionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.xs,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: theme.spacing.xs,
  },
  calendarCell: {
    width: '13.5%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  calendarCellLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.semibold,
  },
  conditionDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radius.full,
  },
});
