import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
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
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { DonorTopBar } from '../../src/components/donor/DonorTopBar';
import { HairTrendLineChart } from '../../src/components/donor/HairTrendLineChart';
import { LatestHairLogResultCard } from '../../src/components/donor/LatestHairLogResultCard';
import { HairLogDetailModal as SharedHairLogDetailModal } from '../../src/components/hair/HairLogDetailModal';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import {
  fetchHairSubmissionsByUserId,
  fetchLatestDonorRecommendationByUserId,
} from '../../src/features/hairSubmission.api';
import {
  fetchDonationDrivePreview,
  fetchFeaturedOrganizations,
  fetchOrganizationPreview,
  joinOrganizationMembership,
} from '../../src/features/donorHome.api';
import {
  buildDriveInvitationQrPayload,
  buildQrImageUrl,
  getDonorDonationsModuleData,
} from '../../src/features/donorDonations.service';
import { useAuthActions } from '../../src/features/auth/hooks/useAuthActions';
import { useNotifications } from '../../src/hooks/useNotifications';
import { useAuth } from '../../src/providers/AuthProvider';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';

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

const formatDriveQrStatusLabel = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Pending';
  if (normalized === 'pending qr') return 'Pending';

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

// Converts any Date or ISO string to the user's LOCAL calendar date key (YYYY-MM-DD).
// Using toISOString() on local-midnight Date objects shifts the day in UTC+N timezones,
// causing a one-day mismatch between calendar cells and stored screening dates.
const toLocalDateKey = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Maps each logged calendar date to the submission that owns the latest AI screening on that date.
// eslint-disable-next-line no-unused-vars
const buildSubmissionByDate = (submissions = []) => {
  const latest = new Map(); // dateKey → { submission, createdAt }

  submissions.forEach((submission) => {
    (submission?.ai_screenings || []).forEach((screening) => {
      if (!screening?.created_at) return;
      const key = toLocalDateKey(screening.created_at);
      const current = latest.get(key);
      if (!current || new Date(screening.created_at).getTime() > new Date(current.createdAt).getTime()) {
        latest.set(key, { submission, createdAt: screening.created_at });
      }
    });
  });

  const result = new Map();
  latest.forEach(({ submission }, key) => result.set(key, submission));
  return result;
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
  onClose,
  onShowMore,
  onContinue,
  primaryActionTitle = 'Continue',
  primaryActionDisabled = false,
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
                  title={primaryActionTitle}
                  fullWidth={false}
                  onPress={onContinue}
                  disabled={primaryActionDisabled}
                />
                <AppButton
                  title="Show more"
                  variant="outline"
                  fullWidth={false}
                  onPress={onShowMore}
                />
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

function DriveQrModal({
  visible,
  drive,
  payload,
  qrStatus,
  onClose,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  if (!visible || !drive || !payload) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewModalOverlay}>
        <Pressable style={styles.previewModalBackdrop} onPress={onClose} />

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.previewModalCard}>
          <View style={styles.previewModalHeader}>
            <View style={styles.previewModalHeaderCopy}>
              <Text style={[styles.previewEyebrow, { color: roles.metaText }]}>My drive QR</Text>
              <Text style={[styles.previewTitle, { color: roles.headingText }]}>Drive QR</Text>
            </View>

            <Pressable onPress={onClose} style={[styles.previewCloseButton, { backgroundColor: roles.supportCardBackground }]}>
              <AppIcon name="close" size="sm" state="muted" />
            </Pressable>
          </View>

          <View style={styles.driveQrStage}>
            <Image source={{ uri: buildQrImageUrl(payload, 360) }} style={styles.driveQrImage} resizeMode="contain" />
          </View>

          <View style={styles.driveQrMeta}>
            <Text style={[styles.driveQrStatus, { color: roles.headingText }]}>
              Status: {formatDriveQrStatusLabel(qrStatus)}
            </Text>
            <Text style={[styles.driveQrContextTitle, { color: roles.headingText }]}>
              {drive.event_title || 'Donation drive'}
            </Text>
            {drive.organization_name ? (
              <Text style={[styles.driveQrContextText, { color: roles.bodyText }]}>
                {drive.organization_name}
              </Text>
            ) : null}
            <Text style={[styles.driveQrContextText, { color: roles.bodyText }]}>
              {formatDriveDate(drive.start_date, drive.end_date)}
            </Text>
          </View>
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
  feedbackMessage,
  feedbackVariant,
  isJoining,
  onClose,
  onJoinOrganization,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const isActiveMember = Boolean(organization?.membership?.is_active);
  const hasInactiveMembership = Boolean(organization?.membership && !organization?.membership?.is_active);
  const organizationIsJoinable = (
    String(organization?.status || '').trim().toLowerCase() === 'active'
    && Boolean(organization?.is_approved)
    && String(organization?.approval_status || '').trim().toLowerCase() === 'approved'
  );
  const joinButtonTitle = isActiveMember
    ? 'Joined'
    : hasInactiveMembership
      ? 'Rejoin organization'
      : 'Join organization';
  const membershipMessage = errorMessage
    || feedbackMessage
    || (
      isActiveMember
        ? 'You are already a member of this organization.'
        : !organizationIsJoinable && organization
          ? 'This organization is not available to join right now.'
          : ''
    );
  const membershipVariant = errorMessage
    ? 'error'
    : feedbackMessage
      ? feedbackVariant || 'info'
      : isActiveMember
        ? 'success'
        : 'info';

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

          {membershipMessage ? (
            <StatusBanner
              variant={membershipVariant}
              message={membershipMessage}
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
                  {organization.contact_number ? (
                    <Text style={[styles.previewStatusText, { color: roles.metaText }]}>
                      {organization.contact_number}
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
                      {drive.registration?.registration_status ? (
                        <Text style={[styles.organizationDriveRegistration, { color: roles.metaText }]}>
                          RSVP {formatDriveQrStatusLabel(drive.registration.registration_status)}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.organizationPreviewActions}>
                <AppButton
                  title={joinButtonTitle}
                  fullWidth={false}
                  onPress={onJoinOrganization}
                  disabled={isActiveMember || !organizationIsJoinable}
                  loading={isJoining}
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

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS FOR DAILY REMINDER & ANALYTICS

const conditionScoreMap = {
  healthy: 5,
  good: 4,
  'fair': 3,
  improving: 3.5,
  'needs care': 2,
  poor: 1,
  dry: 2,
  damaged: 1.5,
  treated: 3,
  rebonded: 3,
  colored: 3,
};

const normalizeConditionForChart = (condition = '') => {
  const normalized = String(condition || '').trim().toLowerCase();
  for (const [key, score] of Object.entries(conditionScoreMap)) {
    if (normalized.includes(key)) return score;
  }
  return 2.5; // default middle score
};

// Build analytics data from submissions
const buildAnalyticsData = (submissions = []) => {
  const allScreenings = submissions
    .flatMap((s) => (s?.ai_screenings || []).map((screening) => ({ submission: s, screening })))
    .filter((entry) => entry.screening?.created_at)
    .sort((a, b) => new Date(a.screening.created_at) - new Date(b.screening.created_at));

  if (!allScreenings.length) {
    return {
      hasHistory: false,
      chartData: [],
      latestStatus: null,
      latestAnalysis: null,
      trendDirection: null,
    };
  }

  // Get last 10 screenings for chart
  const recentScreenings = allScreenings.slice(-10);

  // Map to chart data
  const chartData = recentScreenings.map((entry) => ({
    date: toLocalDateKey(entry.screening.created_at),
    displayDate: formatDayLabel(entry.screening.created_at),
    value: normalizeConditionForChart(entry.screening.detected_condition),
    condition: entry.screening.detected_condition,
  }));

  // Calculate trend
  const latestValue = chartData[chartData.length - 1]?.value || 2.5;
  const earliestValue = chartData[0]?.value || 2.5;
  let trendDirection = '→';
  if (latestValue > earliestValue + 0.3) trendDirection = '↑';
  else if (latestValue < earliestValue - 0.3) trendDirection = '↓';

  return {
    hasHistory: true,
    chartData,
    latestStatus: normalizeConditionTone(allScreenings[allScreenings.length - 1]?.screening?.detected_condition),
    latestAnalysis: allScreenings[allScreenings.length - 1]?.screening || null,
    trendDirection,
  };
};

// Build daily reminder state from submissions
const buildDailyReminder = (submissions = []) => {
  const today = toLocalDateKey(new Date());

  const allScreenings = submissions
    .flatMap((s) => (s?.ai_screenings || []).map((screening) => ({ submission: s, screening })))
    .filter((entry) => entry.screening?.created_at);

  if (!allScreenings.length) {
    return {
      type: 'first-time',
      title: 'Start your hair check',
      subtitle: 'No analysis yet. Begin with CheckHair to understand your hair condition.',
      buttonLabel: 'Start CheckHair',
    };
  }

  // Check if analysis done today
  const todayScreenings = allScreenings.filter((entry) => toLocalDateKey(entry.screening.created_at) === today);

  if (todayScreenings.length > 0) {
    // Already analyzed today - show improvement tip
    const latestToday = todayScreenings[todayScreenings.length - 1];
    const decision = latestToday.screening.decision || latestToday.screening.summary || 'Keep following your routine';
    const summary = String(decision)
      .trim()
      .split('\n')[0] // first line only
      .slice(0, 100); // max 100 chars

    return {
      type: 'analyzed-today',
      title: "Today's care tip",
      subtitle: summary || 'Check your latest result for more details',
      buttonLabel: 'View latest result',
    };
  }

  // No analysis today - remind
  return {
    type: 'reminder',
    title: "You haven't checked your hair today",
    subtitle: 'Quick hair check takes 1 minute',
    buttonLabel: 'Start CheckHair',
  };
};

// ─────────────────────────────────────────────────────────────────────────────

export default function DonorHomeScreen() {
  const router = useRouter();
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
  const [isLoadingHome, setIsLoadingHome] = React.useState(true);
  const [homeError, setHomeError] = React.useState('');
  const [donationDrives, setDonationDrives] = React.useState([]);
  const [organizations, setOrganizations] = React.useState([]);
  const [hairSubmissions, setHairSubmissions] = React.useState([]);
  const [showAllDrives, setShowAllDrives] = React.useState(false);
  const [isDrivePreviewOpen, setIsDrivePreviewOpen] = React.useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = React.useState(false);
  const [driveQrPayload, setDriveQrPayload] = React.useState('');
  const [isOrganizationPreviewOpen, setIsOrganizationPreviewOpen] = React.useState(false);
  const [isLoadingDrivePreview, setIsLoadingDrivePreview] = React.useState(false);
  const [isLoadingOrganizationPreview, setIsLoadingOrganizationPreview] = React.useState(false);
  const [selectedDrivePreview, setSelectedDrivePreview] = React.useState(null);
  const [selectedOrganizationPreview, setSelectedOrganizationPreview] = React.useState(null);
  const [drivePreviewError, setDrivePreviewError] = React.useState('');
  const [organizationPreviewError, setOrganizationPreviewError] = React.useState('');
  const [drivePreviewFeedback, setDrivePreviewFeedback] = React.useState({ message: '', variant: 'info' });
  const [organizationPreviewFeedback, setOrganizationPreviewFeedback] = React.useState({ message: '', variant: 'info' });
  const [isJoiningOrganizationPreview, setIsJoiningOrganizationPreview] = React.useState(false);
  const [donationFlowState, setDonationFlowState] = React.useState({
    hasOngoingDonation: false,
    ongoingDonationMessage: '',
  });
  // Hair log detail modal
  const [isHairLogModalOpen, setIsHairLogModalOpen] = React.useState(false);
  const [latestRecommendation, setLatestRecommendation] = React.useState(null);

  const firstName = String(profile?.first_name || '').trim();
  const lastName = String(profile?.last_name || '').trim();
  const greetingName = firstName || String(profile?.email || user?.email || 'Donor').split('@')[0];
  const greeting = `Hello, ${greetingName}`;
  const donorDisplayName = [firstName, lastName].filter(Boolean).join(' ').trim() || greetingName || 'Donor';
  const avatarInitials = [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase();
  const avatarUri = profile?.avatar_url || profile?.photo_path || '';

  const loadHome = React.useCallback(async () => {
    if (!user?.id) return;

    setIsLoadingHome(true);
    setHomeError('');

    const [donationModuleResult, organizationsResult, submissionsResult, recommendationResult] = await Promise.all([
      getDonorDonationsModuleData({
        userId: user.id,
        databaseUserId: profile?.user_id || null,
        driveLimit: 8,
      }),
      fetchFeaturedOrganizations(10),
      fetchHairSubmissionsByUserId(user.id, 12),
      fetchLatestDonorRecommendationByUserId(user.id).catch(() => ({ data: null })),
    ]);

    setDonationDrives(donationModuleResult.drives || []);
    setOrganizations(organizationsResult.data || []);
    setHairSubmissions(submissionsResult.data || []);
    setLatestRecommendation(recommendationResult?.data || null);
    setDonationFlowState({
      hasOngoingDonation: Boolean(donationModuleResult.hasOngoingDonation),
      ongoingDonationMessage: donationModuleResult.ongoingDonationMessage || '',
    });

    const loadFailed = Boolean(donationModuleResult.error || organizationsResult.error || submissionsResult.error);
    setHomeError(loadFailed ? 'Some donor home updates could not be loaded right now.' : '');
    setIsLoadingHome(false);
  }, [profile?.user_id, user?.id]);

  React.useEffect(() => {
    loadHome();
  }, [loadHome]);

  const visibleDrives = showAllDrives ? donationDrives : donationDrives.slice(0, 4);

  // Compute daily reminder and analytics data
  const dailyReminder = React.useMemo(() => buildDailyReminder(hairSubmissions), [hairSubmissions]);
  const analyticsData = React.useMemo(() => buildAnalyticsData(hairSubmissions), [hairSubmissions]);

  // Build entries array for latest result modal
  const latestResultEntries = React.useMemo(() => {
    if (!analyticsData.latestAnalysis) return [];
    
    // Find the submission that contains this latest screening
    const latestScreening = analyticsData.latestAnalysis;
    const latestSubmission = hairSubmissions.find((submission) => 
      (submission?.ai_screenings || []).some((screening) => 
        screening?.ai_screening_id === latestScreening?.ai_screening_id
      )
    );

    if (!latestSubmission) return [];

    return [{
      screening: latestScreening,
      submission: latestSubmission,
      images: latestSubmission?.submission_details?.flatMap((detail) => detail.images || []) || [],
      recommendations: latestRecommendation ? [latestRecommendation] : [],
    }];
  }, [analyticsData.latestAnalysis, hairSubmissions, latestRecommendation]);

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
    setOrganizationPreviewFeedback({ message: '', variant: 'info' });
    setIsOrganizationPreviewOpen(true);
    setIsLoadingOrganizationPreview(true);

    const result = await fetchOrganizationPreview(organization.organization_id, profile?.user_id || null);
    if (result.error) {
      setOrganizationPreviewError('Organization details could not be loaded right now.');
    }

    if (result.data) {
      setSelectedOrganizationPreview(result.data);
    }

    setIsLoadingOrganizationPreview(false);
  }, [profile?.user_id]);

  const handleShowDriveQr = React.useCallback(() => {
    if (!selectedDrivePreview?.registration?.qr?.is_valid || !selectedDrivePreview?.registration?.registration_id) {
      return;
    }

    const payload = buildDriveInvitationQrPayload({
      drive: selectedDrivePreview,
      registration: selectedDrivePreview.registration,
      donor: {
        databaseUserId: profile?.user_id || null,
        name: donorDisplayName,
        email: user?.email || profile?.email || '',
      },
    });

    setDriveQrPayload(payload);
    setIsDrivePreviewOpen(false);
    setIsQRModalOpen(true);
  }, [donorDisplayName, profile?.email, profile?.user_id, selectedDrivePreview, user?.email]);

  const handleContinueDriveFlow = React.useCallback(() => {
    if (selectedDrivePreview?.registration?.qr?.is_valid) {
      handleShowDriveQr();
      return;
    }

    if (!selectedDrivePreview?.donation_drive_id) return;
    setIsDrivePreviewOpen(false);
    router.navigate(`/donor/drives/${selectedDrivePreview.donation_drive_id}`);
  }, [handleShowDriveQr, router, selectedDrivePreview]);

  const handleShowDriveMore = React.useCallback(() => {
    if (!selectedDrivePreview?.donation_drive_id) return;
    setIsDrivePreviewOpen(false);
    router.navigate(`/donor/drives/${selectedDrivePreview.donation_drive_id}`);
  }, [router, selectedDrivePreview]);

  const handleCloseDriveQr = React.useCallback(() => {
    setIsQRModalOpen(false);
    setDriveQrPayload('');
  }, []);

  const handleJoinOrganizationPreview = React.useCallback(async () => {
    const organizationId = selectedOrganizationPreview?.organization_id;
    if (!organizationId || !profile?.user_id) {
      setOrganizationPreviewFeedback({
        message: 'Your donor account is required before joining an organization.',
        variant: 'error',
      });
      return;
    }

    setOrganizationPreviewFeedback({ message: '', variant: 'info' });
    setOrganizationPreviewError('');
    setIsJoiningOrganizationPreview(true);
    const result = await joinOrganizationMembership({
      organizationId,
      databaseUserId: profile.user_id,
    });
    setIsJoiningOrganizationPreview(false);

    if (result.error) {
      const errorText = String(result.error?.message || '').trim();
      setOrganizationPreviewFeedback({
        message: errorText || 'Organization membership could not be saved right now.',
        variant: 'error',
      });
      return;
    }

    const refreshed = await fetchOrganizationPreview(organizationId, profile.user_id);
    if (refreshed.data) {
      setSelectedOrganizationPreview(refreshed.data);
    } else if (result.data) {
      setSelectedOrganizationPreview((current) => (
        current
          ? {
              ...current,
              membership: result.data,
              drives: (current.drives || []).map((drive) => ({
                ...drive,
                membership: result.data,
              })),
            }
          : current
      ));
    }

    setOrganizationPreviewFeedback({
      message: result.alreadyMember ? 'You are already a member of this organization.' : 'Organization joined successfully.',
      variant: 'success',
    });
  }, [profile?.user_id, selectedOrganizationPreview?.organization_id]);

  const hasOngoingDonation = Boolean(donationFlowState.hasOngoingDonation);
  const ongoingDonationMessage = donationFlowState.ongoingDonationMessage
    || 'You already have an ongoing donation. Please complete or wait for the current donation process to finish before starting a new one.';
  const drivePreviewMessage = drivePreviewError
    || drivePreviewFeedback.message
    || (
      selectedDrivePreview?.registration?.qr?.is_valid
        ? 'This drive already has your saved RSVP. Use Show my QR to open your saved drive QR.'
        : hasOngoingDonation
          ? ongoingDonationMessage
          : selectedDrivePreview?.organization_id && !selectedDrivePreview?.membership?.is_active
            ? 'Join the organization first to RSVP for this drive.'
            : ''
    );
  const drivePreviewVariant = drivePreviewError
    ? 'error'
    : (drivePreviewFeedback.message ? drivePreviewFeedback.variant : 'info');
  const drivePreviewPrimaryTitle = selectedDrivePreview?.registration?.qr?.is_valid ? 'Show my QR' : 'Continue';
  const drivePreviewPrimaryDisabled = !selectedDrivePreview?.registration?.qr?.is_valid && hasOngoingDonation;
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

      {!isLoadingHome && (
        <>
          {/* SECTION 1: Latest Hair Log Result OR Daily Reminder */}
          {dailyReminder.type === 'reminder' ? (
            <AppCard variant="default" radius="xl" padding="md" style={styles.reminderCard}>
              <View style={styles.reminderContent}>
                <View style={[styles.reminderIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
                  <AppIcon name="checkHair" size="md" state="default" color={theme.colors.brandPrimary} />
                </View>
                <View style={styles.reminderCopy}>
                  <Text style={[styles.reminderTitle, { color: roles.headingText }]}>
                    {dailyReminder.title}
                  </Text>
                  <Text style={[styles.reminderSubtitle, { color: roles.bodyText }]}>
                    {dailyReminder.subtitle}
                  </Text>
                </View>
              </View>
              <View style={styles.reminderFooter}>
                <AppButton
                  title={dailyReminder.buttonLabel}
                  size="sm"
                  fullWidth={false}
                  onPress={() => router.navigate('/donor/donations')}
                />
              </View>
            </AppCard>
          ) : (
            <LatestHairLogResultCard
              latestScreening={analyticsData.latestAnalysis}
              latestRecommendation={latestRecommendation}
              onViewResult={() => setIsHairLogModalOpen(true)}
              onStartCheckHair={() => router.navigate('/donor/donations')}
            />
          )}

          {/* SECTION 2: Hair Condition Analytics */}
          {analyticsData.hasHistory && (
            <AppCard variant="default" radius="xl" padding="md" style={styles.analyticsCard}>
              <View style={styles.analyticsHeader}>
                <View>
                  <Text style={[styles.analyticsTitle, { color: roles.headingText }]}>
                    Hair condition
                  </Text>
                  <Text style={[styles.analyticsSubtitle, { color: roles.bodyText }]}>
                    {analyticsData.latestStatus?.label || 'Tracked'} {analyticsData.trendDirection}
                  </Text>
                </View>
              </View>
              <HairTrendLineChart chartData={analyticsData.chartData} />
            </AppCard>
          )}
        </>
      )}

      {/* SECTION 3: Upcoming Drives */}
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
            cardWidth={220}
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

      {/* SECTION 4: Organizations */}
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

      <DonationDrivePreviewModal
        visible={isDrivePreviewOpen}
        drive={selectedDrivePreview}
        isLoading={isLoadingDrivePreview}
        errorMessage={drivePreviewError}
        feedbackMessage={drivePreviewMessage}
        feedbackVariant={drivePreviewVariant}
        onClose={() => {
          setIsDrivePreviewOpen(false);
          setDrivePreviewError('');
          setDrivePreviewFeedback({ message: '', variant: 'info' });
        }}
        onShowMore={handleShowDriveMore}
        onContinue={handleContinueDriveFlow}
        primaryActionTitle={drivePreviewPrimaryTitle}
        primaryActionDisabled={drivePreviewPrimaryDisabled}
      />

      <DriveQrModal
        visible={isQRModalOpen}
        drive={selectedDrivePreview}
        payload={driveQrPayload}
        qrStatus={selectedDrivePreview?.registration?.qr?.status || selectedDrivePreview?.registration?.registration_status || ''}
        onClose={handleCloseDriveQr}
      />

      <OrganizationPreviewModal
        visible={isOrganizationPreviewOpen}
        organization={selectedOrganizationPreview}
        isLoading={isLoadingOrganizationPreview}
        errorMessage={organizationPreviewError}
        feedbackMessage={organizationPreviewFeedback.message}
        feedbackVariant={organizationPreviewFeedback.variant}
        isJoining={isJoiningOrganizationPreview}
        onClose={() => {
          setIsOrganizationPreviewOpen(false);
          setOrganizationPreviewError('');
          setOrganizationPreviewFeedback({ message: '', variant: 'info' });
        }}
        onJoinOrganization={handleJoinOrganizationPreview}
      />

      <SharedHairLogDetailModal
        visible={isHairLogModalOpen}
        entries={latestResultEntries}
        onClose={() => setIsHairLogModalOpen(false)}
      />
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  statusBanner: {
    marginTop: 0,
  },
  quickOverviewSection: {
    gap: theme.spacing.xs,
  },
  section: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    marginHorizontal: theme.spacing.xs,
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
    minHeight: 120,
  },
  driveCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
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
    fontSize: theme.typography.compact.bodyMd,
    lineHeight: theme.typography.compact.bodyMd * theme.typography.lineHeights.snug,
    marginBottom: theme.spacing.xs,
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
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  organizationLogoWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
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
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  driveQrStage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
  },
  driveQrImage: {
    width: 220,
    height: 220,
  },
  driveQrMeta: {
    alignItems: 'center',
    gap: 4,
    marginBottom: theme.spacing.md,
  },
  driveQrStatus: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  driveQrContextTitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  driveQrContextText: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
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
  organizationDriveRegistration: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    marginTop: 2,
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

  // ─── Hair Log Detail Modal ────────────────────────────────────────────────
  hairLogModalCard: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    maxHeight: '85%',
  },
  hairLogScroll: {
    flexGrow: 0,
  },
  hairLogScrollContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  hairLogConditionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  hairLogConditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hairLogConditionLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  hairLogConditionDetail: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  hairLogSectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    marginTop: theme.spacing.xs,
  },
  hairLogPhotoLoading: {
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hairLogPhotoRow: {
    gap: theme.spacing.sm,
    paddingBottom: 2,
  },
  hairLogPhoto: {
    width: 100,
    height: 100,
    borderRadius: 14,
  },
  hairLogEmptyText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  hairLogAiBlock: {
    borderRadius: 16,
    borderWidth: 1,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  hairLogDecisionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
  },
  hairLogDecisionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'capitalize',
  },
  hairLogAiSummary: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  hairLogMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  hairLogMetaItem: {
    gap: 2,
    minWidth: 72,
  },
  hairLogMetaKey: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hairLogMetaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  hairLogDamageNote: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * 1.5,
    fontStyle: 'italic',
  },
  hairLogRecsLoader: {
    alignSelf: 'flex-start',
  },
  hairLogRecsList: {
    gap: 0,
  },
  hairLogRecItem: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    gap: 2,
  },
  hairLogRecTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  hairLogRecText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },

  // ─── Daily Hair Reminder Card ────────────────────────────────────────────
  reminderCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  reminderContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  reminderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reminderCopy: {
    flex: 1,
    gap: 1,
  },
  reminderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyMd,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: theme.typography.compact.bodyMd * theme.typography.lineHeights.snug,
  },
  reminderSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  reminderFooter: {
    marginTop: theme.spacing.xs,
  },

  // ─── Hair Analytics Card ─────────────────────────────────────────────────
  analyticsCard: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  analyticsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: 4,
  },
  analyticsTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyMd,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: theme.typography.compact.bodyMd * theme.typography.lineHeights.snug,
  },
  analyticsSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
});
