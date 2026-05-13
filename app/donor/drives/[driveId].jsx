import React from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '../../../src/components/ui/ScreenContainer';
import { AppButton } from '../../../src/components/ui/AppButton';
import { AppCard } from '../../../src/components/ui/AppCard';
import { AppIcon } from '../../../src/components/ui/AppIcon';
import { StatusBanner } from '../../../src/components/ui/StatusBanner';
import { useAuth } from '../../../src/providers/AuthProvider';
import {
  createDonationDriveRegistration,
  fetchDonationDriveDetail,
  fetchDonationDrivePreview,
  joinOrganizationMembership,
} from '../../../src/features/donorHome.api';
import {
  getDonorDonationsModuleData,
} from '../../../src/features/donorDonations.service';
import { DONOR_PERMISSION_REASONS } from '../../../src/features/donorCompliance.service';
import { supabase } from '../../../src/api/supabase/client';
import { resolveThemeRoles, theme } from '../../../src/design-system/theme';

const DRIVE_REALTIME_DEBOUNCE_MS = 380;

const formatDriveDate = (startDate, endDate) => {
  if (!startDate) return 'Date to follow';
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  if (!end || start.toDateString() === end.toDateString()) return formatter.format(start);
  return `${formatter.format(start)} - ${formatter.format(end)}`;
};

const formatDriveTime = (startDate, endDate) => {
  if (!startDate) return '';
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (!end) return formatter.format(start);
  return `${formatter.format(start)} - ${formatter.format(end)}`;
};

const isDriveEnded = (drive = null) => {
  const compareDate = drive?.end_date || drive?.start_date || null;
  if (!compareDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(compareDate).getTime() < today.getTime();
};

const normalizeRealtimeDriveRegistration = (row = {}) => ({
  registration_id: row?.Registration_ID || row?.registration_id || null,
  donation_drive_id: row?.Donation_Drive_ID || row?.donation_drive_id || null,
  user_id: row?.User_ID || row?.user_id || null,
  registration_status: row?.Registration_Status || row?.registration_status || '',
  attendance_status: row?.Attendance_Status || row?.attendance_status || '',
  registered_at: row?.Registered_At || row?.registered_at || null,
  updated_at: row?.Updated_At || row?.updated_at || null,
  attendance_marked_at: row?.Attendance_Marked_At || row?.attendance_marked_at || null,
});

const isApprovedRegistration = (registration = null) => (
  ['approved', 'joined', 'confirmed', 'accepted'].includes(
    String(registration?.registration_status || '').trim().toLowerCase()
  )
);

const initialsFromName = (value = '') => (
  String(value || 'D')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'D'
);

const buildDirectionsUrl = (drive = null) => {
  const latitude = Number(drive?.latitude);
  const longitude = Number(drive?.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const coordinate = `${latitude},${longitude}`;
    if (Platform.OS === 'ios') return `http://maps.apple.com/?daddr=${coordinate}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${coordinate}`;
  }

  const address = drive?.address_label || drive?.location_label || '';
  if (!address) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};

function EventTopBar({ title, onBack }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  return (
    <View style={[styles.topBar, { backgroundColor: roles.pageBackground }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        style={({ pressed }) => [
          styles.topBarButton,
          { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder },
          pressed ? styles.pressed : null,
        ]}
      >
        <AppIcon name="arrowLeft" state="default" color={roles.primaryActionBackground} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.topBarTitle, { color: roles.primaryActionBackground }]}>
        {title}
      </Text>
      <View style={styles.topBarSpacer} />
    </View>
  );
}

function InfoRow({ icon, title, primary, secondary, action, onActionPress }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  if (!primary && !secondary) return null;

  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIcon, { backgroundColor: roles.iconPrimarySurface }]}>
        <MaterialCommunityIcons name={icon} size={22} color={roles.primaryActionBackground} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={[styles.infoTitle, { color: roles.headingText }]}>{title}</Text>
        {primary ? <Text style={[styles.infoPrimary, { color: roles.bodyText }]}>{primary}</Text> : null}
        {secondary ? <Text style={[styles.infoSecondary, { color: roles.metaText }]}>{secondary}</Text> : null}
        {action ? (
          <Pressable disabled={!onActionPress} onPress={onActionPress}>
            <Text style={[styles.infoAction, { color: roles.primaryActionBackground }]}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function EventMapPreview({ drive }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const latitude = Number(drive?.latitude);
  const longitude = Number(drive?.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const directionsUrl = buildDirectionsUrl(drive);

  const handleOpenDirections = React.useCallback(async () => {
    if (!directionsUrl) return;
    await Linking.openURL(directionsUrl);
  }, [directionsUrl]);

  if (!directionsUrl) return null;

  return (
    <View style={[styles.mapPreview, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
      <View style={styles.mapGrid}>
        <View style={[styles.mapGridLineHorizontal, { backgroundColor: roles.defaultCardBorder }]} />
        <View style={[styles.mapGridLineVertical, { backgroundColor: roles.defaultCardBorder }]} />
      </View>
      <View style={[styles.mapPin, { backgroundColor: roles.defaultCardBackground }]}>
        <MaterialCommunityIcons name="map-marker" size={34} color={roles.primaryActionBackground} />
      </View>
      <View style={styles.mapCopy}>
        <Text numberOfLines={1} style={[styles.mapTitle, { color: roles.headingText }]}>
          {hasCoordinates ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : 'Event location'}
        </Text>
        <Text numberOfLines={1} style={[styles.mapAddress, { color: roles.bodyText }]}>
          {drive?.address_label || drive?.location_label || 'Open map for directions'}
        </Text>
      </View>
      <Pressable
        onPress={handleOpenDirections}
        style={({ pressed }) => [
          styles.mapDirectionsButton,
          { backgroundColor: roles.primaryActionBackground },
          pressed ? styles.pressed : null,
        ]}
      >
        <MaterialCommunityIcons name="navigation-variant-outline" size={17} color={roles.primaryActionText} />
        <Text style={[styles.mapDirectionsText, { color: roles.primaryActionText }]}>Directions</Text>
      </Pressable>
    </View>
  );
}

function HostCard({ drive }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const orgName = drive?.organization_name || 'Donivra partner organization';

  React.useEffect(() => setImageFailed(false), [drive?.organization_logo_url]);

  return (
    <AppCard variant="default" radius="xl" padding="lg" style={styles.sideCard}>
      <Text style={[styles.cardTitle, { color: roles.headingText }]}>Host Organization</Text>
      <View style={styles.hostRow}>
        <View style={[styles.hostLogo, { backgroundColor: roles.iconPrimarySurface, borderColor: roles.defaultCardBorder }]}>
          {drive?.organization_logo_url && !imageFailed ? (
            <Image
              source={{ uri: drive.organization_logo_url }}
              style={styles.hostLogoImage}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <Text style={[styles.hostInitials, { color: roles.primaryActionBackground }]}>
              {initialsFromName(orgName)}
            </Text>
          )}
        </View>
        <View style={styles.hostCopy}>
          <Text numberOfLines={2} style={[styles.hostName, { color: roles.headingText }]}>{orgName}</Text>
          <Text style={[styles.hostMeta, { color: roles.metaText }]}>
            {drive?.organization?.organization_type || 'Partner organization'}
          </Text>
        </View>
      </View>
    </AppCard>
  );
}

function DonorCommunityCard({ count = 0, isRegistered = false, isOrganizationMember = false }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const shownCount = Number(count) || 0;
  const avatarCount = Math.min(shownCount, 4);
  const avatars = Array.from({ length: avatarCount }, (_item, index) => (
    index === 0 && isRegistered ? 'You' : String(index + 1)
  ));

  return (
    <AppCard variant="default" radius="xl" padding="lg" style={styles.sideCard}>
      <View style={styles.communityHeader}>
        <View style={styles.communityTitleCopy}>
          <Text style={[styles.cardTitle, styles.communityCardTitle, { color: roles.headingText }]}>Donors Attending</Text>
          <Text style={[styles.communitySubtitle, { color: roles.metaText }]}>
            {shownCount > 0 ? 'Registered donors for this event.' : 'No registered donors yet.'}
          </Text>
        </View>
        <View style={[styles.joinedPill, { backgroundColor: roles.iconPrimarySurface }]}>
          <Text style={[styles.joinedCount, { color: roles.primaryActionBackground }]}>
            {shownCount} Joined
          </Text>
        </View>
      </View>
      {shownCount > 0 ? (
        <View style={styles.avatarStack}>
          {avatars.map((item, index) => (
            <View
              key={item}
              style={[
                styles.communityAvatar,
                {
                  marginLeft: index === 0 ? 0 : -12,
                  backgroundColor: roles.iconPrimarySurface,
                  borderColor: roles.defaultCardBackground,
                },
              ]}
            >
              <Text style={[styles.communityAvatarText, { color: roles.primaryActionBackground }]}>{item}</Text>
            </View>
          ))}
          {shownCount > avatars.length ? (
            <View
              style={[
                styles.communityAvatar,
                styles.communityMore,
                {
                  marginLeft: -12,
                  backgroundColor: roles.supportCardBackground,
                  borderColor: roles.defaultCardBackground,
                },
              ]}
            >
              <Text style={[styles.communityAvatarText, { color: roles.headingText }]}>
                +{Math.max(0, shownCount - avatars.length)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <Text style={[styles.communityHint, { color: roles.bodyText }]}>
        {isRegistered
          ? 'You are counted for this drive.'
          : isOrganizationMember
            ? 'You are a member of the host organization. Register to be counted for this drive.'
            : 'Register to be counted for this drive.'}
      </Text>
    </AppCard>
  );
}

export default function DonorDriveDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const driveId = Array.isArray(params.driveId) ? params.driveId[0] : params.driveId;
  const numericDriveId = Number(driveId);
  const { user, profile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = React.useState(true);
  const [drive, setDrive] = React.useState(null);
  const [registrationCount, setRegistrationCount] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [feedbackMessage, setFeedbackMessage] = React.useState('');
  const [feedbackVariant, setFeedbackVariant] = React.useState('info');
  const [isJoiningOrganization, setIsJoiningOrganization] = React.useState(false);
  const [isJoinOrganizationConfirmOpen, setIsJoinOrganizationConfirmOpen] = React.useState(false);
  const [isSubmittingRsvp, setIsSubmittingRsvp] = React.useState(false);
  const [driveQrPayload, setDriveQrPayload] = React.useState('');
  const [donationFlowState, setDonationFlowState] = React.useState({
    hasOngoingDonation: false,
    ongoingDonationMessage: '',
    hasRecentHairEligibility: false,
  });

  const driveImageUrl = drive?.event_image_url || drive?.organization_logo_url || '';
  const requiresMembership = Boolean(drive?.requires_membership);
  const isMembershipPending = Boolean(drive?.membership?.is_pending);
  const hasOngoingDonation = Boolean(donationFlowState.hasOngoingDonation);
  const hasRecentHairEligibility = Boolean(donationFlowState.hasRecentHairEligibility);
  const ended = isDriveEnded(drive);
  const ongoingDonationMessage = donationFlowState.ongoingDonationMessage
    || 'You already have an ongoing donation. Please complete or wait for the current donation process to finish before starting a new one.';

  const loadRegistrationCount = React.useCallback(async () => {
    if (!Number.isFinite(numericDriveId) || numericDriveId <= 0) return;
    const countResult = await supabase
      .from('Donation_Drive_Registrations')
      .select('Registration_ID', { count: 'exact', head: true })
      .eq('Donation_Drive_ID', numericDriveId);

    if (!countResult.error && Number.isFinite(countResult.count)) {
      setRegistrationCount(countResult.count || 0);
      return;
    }

    const rowsResult = await supabase
      .from('Donation_Drive_Registrations')
      .select('Registration_ID,User_ID')
      .eq('Donation_Drive_ID', numericDriveId)
      .limit(500);

    if (!rowsResult.error) {
      const rows = rowsResult.data || [];
      const currentUserRegistered = profile?.user_id
        ? rows.some((row) => row?.User_ID === profile.user_id || row?.user_id === profile.user_id)
        : false;
      setRegistrationCount(Math.max(rows.length, currentUserRegistered ? 1 : 0));
      return;
    }

    setRegistrationCount((current) => current || 0);
  }, [numericDriveId, profile?.user_id]);

  const loadDrive = React.useCallback(async ({ silent = false } = {}) => {
    if (!driveId || !Number.isFinite(numericDriveId) || numericDriveId <= 0) {
      setErrorMessage('Drive details are not available right now.');
      setIsLoading(false);
      return;
    }

    if (!silent) setIsLoading(true);
    setErrorMessage('');

    const [driveResult, donationModuleResult] = await Promise.all([
      fetchDonationDriveDetail(numericDriveId, profile?.user_id || null),
      getDonorDonationsModuleData({
        userId: user?.id || null,
        databaseUserId: profile?.user_id || null,
        driveLimit: 8,
      }),
      loadRegistrationCount(),
    ]);

    if (driveResult.error) {
      setErrorMessage('Drive details could not be loaded right now.');
    }

    const nextDrive = driveResult.data || null;
    setDrive(nextDrive);
    setRegistrationCount((current) => Math.max(
      current || 0,
      nextDrive?.registration?.registration_id ? 1 : 0
    ));
    setDonationFlowState({
      hasOngoingDonation: Boolean(donationModuleResult.hasOngoingDonation),
      ongoingDonationMessage: donationModuleResult.ongoingDonationMessage || '',
      hasRecentHairEligibility: Boolean(
        donationModuleResult.latestScreening?.created_at
        && Date.now() - new Date(donationModuleResult.latestScreening.created_at).getTime() <= 30 * 24 * 60 * 60 * 1000
      ),
    });
    setIsLoading(false);
  }, [driveId, loadRegistrationCount, numericDriveId, profile?.user_id, user?.id]);

  const driveRealtimeRefreshRef = React.useRef(null);
  const scheduleDriveRealtimeRefresh = React.useCallback(() => {
    if (driveRealtimeRefreshRef.current) clearTimeout(driveRealtimeRefreshRef.current);
    driveRealtimeRefreshRef.current = setTimeout(() => {
      void loadDrive({ silent: true });
    }, DRIVE_REALTIME_DEBOUNCE_MS);
  }, [loadDrive]);

  React.useEffect(() => {
    loadDrive();
  }, [loadDrive]);

  React.useEffect(() => () => {
    if (driveRealtimeRefreshRef.current) clearTimeout(driveRealtimeRefreshRef.current);
  }, []);

  React.useEffect(() => {
    if (!user?.id || !profile?.user_id || !Number.isFinite(numericDriveId) || numericDriveId <= 0) return undefined;

    const channel = supabase.channel(`donor-drive-live-${profile.user_id}-${numericDriveId}`);
    const onRealtimeEvent = () => scheduleDriveRealtimeRefresh();
    const onRegistrationRealtimeEvent = (payload = {}) => {
      const nextRow = payload.new || {};
      const oldRow = payload.old || {};
      const nextRegistration = normalizeRealtimeDriveRegistration(nextRow);
      const oldRegistration = normalizeRealtimeDriveRegistration(oldRow);
      const registrationDriveId = Number(nextRegistration.donation_drive_id || oldRegistration.donation_drive_id);
      const registrationUserId = Number(nextRegistration.user_id || oldRegistration.user_id);

      if (registrationDriveId === numericDriveId) {
        void loadRegistrationCount();
      }

      if (registrationDriveId === numericDriveId && registrationUserId === Number(profile.user_id)) {
        setDrive((current) => {
          if (!current?.donation_drive_id) return current;
          if (payload.eventType === 'DELETE') {
            return { ...current, registration: null };
          }
          return {
            ...current,
            registration: {
              ...(current.registration || {}),
              ...nextRegistration,
            },
          };
        });

        if (isApprovedRegistration(nextRegistration)) {
          setFeedbackMessage('Your RSVP is approved for this event.');
          setFeedbackVariant('success');
        }
      }

      scheduleDriveRealtimeRefresh();
    };

    channel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Donation_Drive_Requests',
        filter: `Donation_Drive_ID=eq.${numericDriveId}`,
      }, onRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Donation_Drive_Registrations',
        filter: `Donation_Drive_ID=eq.${numericDriveId}`,
      }, onRegistrationRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Donation_Drive_Registrations',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onRegistrationRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Organization_Members',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onRealtimeEvent)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRegistrationCount, numericDriveId, profile?.user_id, scheduleDriveRealtimeRefresh, user?.id]);

  const refreshDriveRegistration = React.useCallback(async () => {
    if (!drive?.donation_drive_id || !profile?.user_id) return null;
    const refreshed = await fetchDonationDrivePreview(drive.donation_drive_id, profile.user_id);
    if (refreshed.data) {
      setDrive(refreshed.data);
      return refreshed.data;
    }
    return null;
  }, [drive?.donation_drive_id, profile?.user_id]);

  const handleJoinOrganization = React.useCallback(async () => {
    if (!drive?.organization_id || !profile?.user_id) {
      setFeedbackMessage('Your donor account is required before joining an organization.');
      setFeedbackVariant('info');
      return;
    }

    setIsJoiningOrganization(true);
    const result = await joinOrganizationMembership({
      organizationId: drive.organization_id,
      databaseUserId: profile.user_id,
    });
    setIsJoiningOrganization(false);

    if (result.error) {
      setFeedbackMessage('Organization membership could not be saved right now.');
      setFeedbackVariant('error');
      return;
    }

    const refreshed = await fetchDonationDrivePreview(drive.donation_drive_id, profile.user_id);
    if (refreshed.data) setDrive(refreshed.data);
    if (result.alreadyPending || result.data?.is_pending || result.requestSubmitted) {
      setFeedbackMessage('Join request submitted. Waiting for organization approval.');
      setFeedbackVariant('info');
      return;
    }
    setFeedbackMessage(result.alreadyMember ? 'You are already a member of this organization.' : 'Organization joined. You can now register for this private event.');
    setFeedbackVariant('success');
  }, [drive, profile?.user_id]);

  const handleRequestJoinOrganization = React.useCallback(() => {
    if (!drive?.organization_id || !profile?.user_id) {
      setFeedbackMessage('Your donor account is required before joining an organization.');
      setFeedbackVariant('info');
      return;
    }
    if (drive?.membership?.is_active) {
      setFeedbackMessage('You are already a member of this organization.');
      setFeedbackVariant('info');
      return;
    }
    if (drive?.membership?.is_pending) {
      setFeedbackMessage('Your membership request is still pending approval.');
      setFeedbackVariant('info');
      return;
    }
    setIsJoinOrganizationConfirmOpen(true);
  }, [drive?.membership?.is_active, drive?.membership?.is_pending, drive?.organization_id, profile?.user_id]);

  const handleDriveRsvp = React.useCallback(async () => {
    if (!drive?.donation_drive_id || ended) return;

    if (requiresMembership && !drive.membership?.is_active) {
      if (drive.membership?.is_pending) {
        setFeedbackMessage('Your membership request is still pending approval.');
        setFeedbackVariant('info');
        return;
      }
      handleRequestJoinOrganization();
      return;
    }

    if (!hasRecentHairEligibility) {
      setFeedbackMessage('Please complete CheckHair first. Hair eligibility must be assessed within the last month before joining this event.');
      setFeedbackVariant('info');
      router.navigate('/donor/donations');
      return;
    }

    if (hasOngoingDonation && !drive.registration?.registration_id) {
      setFeedbackMessage(ongoingDonationMessage);
      setFeedbackVariant('info');
      return;
    }

    if (drive.registration?.registration_id) {
      setDriveQrPayload('');
      router.navigate(`/donor/status?driveId=${drive.donation_drive_id}`);
      return;
    }

    if (!profile?.user_id) {
      setFeedbackMessage('Your donor account is required before joining this event.');
      setFeedbackVariant('info');
      return;
    }

    setIsSubmittingRsvp(true);
    const result = await createDonationDriveRegistration({
      driveId: drive.donation_drive_id,
      databaseUserId: profile.user_id,
    });
    setIsSubmittingRsvp(false);

    if (result.error || !result.data?.registration_id) {
      if (result.error?.code === DONOR_PERMISSION_REASONS.profileIncomplete) {
        router.navigate('/profile');
        return;
      }
      if (result.error?.code === DONOR_PERMISSION_REASONS.guardianConsentRequired) {
        router.navigate('/donor/guardian-consent');
        return;
      }
      setFeedbackMessage(result.error?.message || 'Event registration could not be saved right now.');
      setFeedbackVariant('error');
      return;
    }

    await loadRegistrationCount();
    await refreshDriveRegistration();
    setDriveQrPayload('');
    setRegistrationCount((current) => Math.max(current || 0, 1));
    setFeedbackMessage(result.alreadyRegistered ? 'You are already registered for this drive.' : 'Registration saved. Submit hair from the Donations tab to generate a hair submission QR.');
    setFeedbackVariant('success');
  }, [
    drive,
    ended,
    handleRequestJoinOrganization,
    hasOngoingDonation,
    hasRecentHairEligibility,
    loadRegistrationCount,
    ongoingDonationMessage,
    profile?.user_id,
    refreshDriveRegistration,
    requiresMembership,
    router,
  ]);

  const actionTitle = ended
    ? 'Event ended'
    : requiresMembership && isMembershipPending
      ? 'Membership Pending'
    : requiresMembership && !drive?.membership?.is_active
      ? isJoiningOrganization ? 'Joining...' : 'Join Organization'
      : !hasRecentHairEligibility
        ? 'Start CheckHair'
        : drive?.registration?.registration_id
          ? 'Submit my donation'
          : 'Register to Attend';

  const actionDisabled = isLoading || ended || isMembershipPending || (hasOngoingDonation && !drive?.registration?.registration_id);
  const isRegisteredForDrive = Boolean(drive?.registration?.registration_id);
  const isOrganizationMember = Boolean(drive?.membership?.is_active);
  const shownRegistrationCount = Math.max(registrationCount, isRegisteredForDrive ? 1 : 0);

  return (
    <ScreenContainer
      scrollable={false}
      safeArea
      variant="default"
      contentStyle={[styles.screenContent, { backgroundColor: roles.pageBackground }]}
    >
      <EventTopBar title="Event Details" onBack={() => router.back()} />

      <ScrollView
        style={styles.detailScroll}
        contentContainerStyle={[styles.detailContent, { paddingBottom: drive ? 104 + insets.bottom : theme.spacing.lg }]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {errorMessage ? <StatusBanner message={errorMessage} variant="info" style={styles.bannerGap} /> : null}
        {feedbackMessage ? <StatusBanner message={feedbackMessage} variant={feedbackVariant} style={styles.bannerGap} /> : null}

        {isLoading ? (
          <AppCard variant="default" radius="xl" padding="lg">
            <View style={styles.loadingState}>
              <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
              <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading event details</Text>
            </View>
          </AppCard>
        ) : drive ? (
          <>
            <View style={[styles.hero, { backgroundColor: roles.iconPrimarySurface }]}>
            {driveImageUrl ? (
              <ImageBackground source={{ uri: driveImageUrl }} style={styles.heroImage} resizeMode="cover">
                <LinearGradient
                  colors={['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.30)', 'rgba(0,0,0,0.78)']}
                  locations={[0, 0.48, 1]}
                  style={styles.heroOverlay}
                />
                <View style={styles.heroContent}>
                  <View style={[styles.featuredPill, { backgroundColor: roles.primaryActionBackground }]}>
                    <Text style={[styles.featuredPillText, { color: roles.primaryActionText }]}>
                      {drive.is_public ? 'Public' : 'Members'}
                    </Text>
                  </View>
                  <Text numberOfLines={3} style={styles.heroTitle}>
                    {drive.event_title || 'Donation drive'}
                  </Text>
                </View>
              </ImageBackground>
            ) : (
              <View style={styles.heroFallback}>
                <View style={[styles.featuredPill, { backgroundColor: roles.primaryActionBackground }]}>
                  <Text style={[styles.featuredPillText, { color: roles.primaryActionText }]}>
                    {drive.is_public ? 'Public' : 'Members'}
                  </Text>
                </View>
                <MaterialCommunityIcons name="calendar-heart" size={52} color={roles.primaryActionBackground} />
                <Text numberOfLines={3} style={[styles.heroFallbackTitle, { color: roles.headingText }]}>
                  {drive.event_title || 'Donation drive'}
                </Text>
              </View>
            )}
          </View>

          <AppCard variant="default" radius="xl" padding="lg" style={styles.sectionGap}>
            <InfoRow
              icon="calendar-today"
              title="Date & Time"
              primary={formatDriveDate(drive.start_date, drive.end_date)}
              secondary={formatDriveTime(drive.start_date, drive.end_date)}
            />
            <View style={[styles.infoDivider, { backgroundColor: roles.defaultCardBorder }]} />
            <InfoRow
              icon="map-marker-outline"
              title="Location"
              primary={drive.address_label || drive.location_label || 'Location to follow'}
              action={buildDirectionsUrl(drive) ? 'View directions' : ''}
              onActionPress={() => {
                const url = buildDirectionsUrl(drive);
                if (url) void Linking.openURL(url);
              }}
            />
            <EventMapPreview drive={drive} />
          </AppCard>

          <AppCard variant="default" radius="xl" padding="lg" style={styles.sectionGap}>
            <Text style={[styles.sectionTitle, { color: roles.headingText }]}>About the Mission</Text>
            <Text style={[styles.overviewText, { color: roles.bodyText }]}>
              {drive.event_overview || 'Join this Donivra hair donation drive and help provide meaningful support to people who need wigs and care. Event details are managed by the partner organization.'}
            </Text>
          </AppCard>

          <DonorCommunityCard
            count={shownRegistrationCount}
            isRegistered={isRegisteredForDrive}
            isOrganizationMember={isOrganizationMember}
          />
          <HostCard drive={drive} />

          {driveQrPayload ? null : null}
        </>
      ) : (
        <Text style={[styles.emptyText, { color: roles.bodyText }]}>Drive details are not available right now.</Text>
      )}

      </ScrollView>

      {drive ? (
        <View
          style={[
            styles.fixedBottomCta,
            {
              backgroundColor: roles.pageBackground,
              borderTopColor: roles.defaultCardBorder,
              paddingBottom: Math.max(insets.bottom, theme.spacing.sm),
            },
          ]}
        >
          <AppButton
            title={actionTitle}
            onPress={handleDriveRsvp}
            loading={isSubmittingRsvp || isJoiningOrganization}
            disabled={actionDisabled}
          />
        </View>
      ) : null}

      <Modal
        transparent
        visible={isJoinOrganizationConfirmOpen}
        animationType="fade"
        onRequestClose={() => setIsJoinOrganizationConfirmOpen(false)}
      >
        <View style={styles.joinModalOverlay}>
          <Pressable style={styles.joinModalBackdrop} onPress={() => setIsJoinOrganizationConfirmOpen(false)} />
          <AppCard variant="elevated" radius="xl" padding="lg" style={styles.joinModalCard}>
            <Text style={styles.joinModalTitle}>Send Join Request?</Text>
            <Text style={styles.joinModalBody}>
              Your organization membership will be pending until approved.
            </Text>
            <View style={styles.joinModalActions}>
              <AppButton
                title="Cancel"
                variant="outline"
                fullWidth={false}
                onPress={() => setIsJoinOrganizationConfirmOpen(false)}
              />
              <AppButton
                title="Confirm"
                fullWidth={false}
                loading={isJoiningOrganization}
                onPress={async () => {
                  setIsJoinOrganizationConfirmOpen(false);
                  await handleJoinOrganization();
                }}
              />
            </View>
          </AppCard>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: 0,
  },
  topBar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  topBarButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  topBarSpacer: {
    width: 40,
    height: 40,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  bannerGap: {
    marginBottom: theme.spacing.sm,
  },
  hero: {
    height: 288,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    ...theme.shadows.soft,
  },
  heroImage: {
    flex: 1,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  heroContent: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: theme.spacing.lg,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: theme.typography.weights.bold,
  },
  heroFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  heroFallbackTitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
  },
  featuredPill: {
    alignSelf: 'flex-end',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  featuredPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionGap: {
    marginBottom: theme.spacing.lg,
  },
  sideCard: {
    marginBottom: theme.spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  infoIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCopy: {
    flex: 1,
    gap: 3,
  },
  infoTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.bold,
  },
  infoPrimary: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  infoSecondary: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  infoAction: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    marginTop: 3,
  },
  infoDivider: {
    height: 1,
    marginVertical: theme.spacing.md,
  },
  mapPreview: {
    marginTop: theme.spacing.md,
    minHeight: 148,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    padding: theme.spacing.md,
    justifyContent: 'space-between',
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.55,
  },
  mapGridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
  },
  mapGridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '48%',
    width: 1,
  },
  mapPin: {
    position: 'absolute',
    top: 45,
    left: '50%',
    width: 48,
    height: 48,
    marginLeft: -24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.soft,
  },
  mapCopy: {
    paddingRight: 120,
  },
  mapTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  mapAddress: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    marginTop: 2,
  },
  mapDirectionsButton: {
    alignSelf: 'flex-end',
    minHeight: 36,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mapDirectionsText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    marginBottom: theme.spacing.sm,
  },
  overviewText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * 1.7,
  },
  cardTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.bold,
    marginBottom: theme.spacing.md,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  hostLogo: {
    width: 62,
    height: 62,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hostLogoImage: {
    width: '100%',
    height: '100%',
  },
  hostInitials: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  hostCopy: {
    flex: 1,
  },
  hostName: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.bold,
  },
  hostMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    marginTop: 3,
  },
  communityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  communityTitleCopy: {
    flex: 1,
  },
  communityCardTitle: {
    marginBottom: 3,
  },
  communitySubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  joinedPill: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  joinedCount: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  communityAvatar: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityMore: {},
  communityAvatarText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
  },
  communityHint: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  fixedBottomCta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    ...theme.shadows.soft,
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
  qrWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
  },
  qrImage: {
    width: 240,
    height: 240,
  },
  qrHelper: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
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
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  emptyText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    paddingVertical: theme.spacing.xs,
  },
});
