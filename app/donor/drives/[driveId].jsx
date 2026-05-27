import React from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Linking,
  NativeModules,
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
} from '../../../src/features/donorHome.api';
import {
  buildDriveInvitationQrPayload,
  buildQrImageUrl,
} from '../../../src/features/donorDonations.service';
import { getDonorDonationsModuleData } from '../../../src/features/donorDonations.service';
import { DONOR_PERMISSION_REASONS } from '../../../src/features/donorCompliance.service';
import { supabase } from '../../../src/api/supabase/client';
import { resolveThemeRoles, theme } from '../../../src/design-system/theme';

const DRIVE_REALTIME_DEBOUNCE_MS = 380;

const resolveWebView = () => {
  if (!NativeModules?.RNCWebViewModule) return null;
  try {
    return require('react-native-webview').WebView;
  } catch (_error) {
    return null;
  }
};

const WebView = resolveWebView();

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
  registration_id: row?.Event_Attendee_ID || row?.registration_id || null,
  donation_drive_id: row?.Event_Request_ID || row?.donation_drive_id || null,
  user_id: row?.User_ID || row?.user_id || null,
  waybill_code: row?.Waybill_Code || row?.waybill_code || null,
  registration_status: row?.Registration_Status || row?.registration_status || '',
  attendance_status: row?.Attendance_Status || row?.attendance_status || '',
  registered_at: row?.Created_At || row?.registered_at || null,
  updated_at: row?.Updated_At || row?.updated_at || null,
  attendance_marked_at: normalizeRsvpStatus(row?.Attendance_Status || row?.attendance_status) === 'present'
    ? (row?.Updated_At || row?.updated_at || null)
    : null,
});

const isApprovedRegistration = (registration = null) => (
  ['approved', 'joined', 'confirmed', 'accepted'].includes(
    String(registration?.registration_status || '').trim().toLowerCase()
  )
);

const normalizeRsvpStatus = (value = '') => (
  String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ')
);

const isPresentRegistration = (registration = null) => {
  if (!registration) return false;
  if (registration?.attendance_marked_at) return true;
  return ['present', 'attended', 'checked in', 'marked'].includes(
    normalizeRsvpStatus(registration?.attendance_status)
  );
};

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

const buildCoordinateMapHtml = (latitude, longitude) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: #f7f7f7; }
    .leaflet-control-container { display: none; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const lat = ${latitude};
    const lng = ${longitude};
    const map = L.map('map', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false }).setView([lat, lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    L.marker([lat, lng]).addTo(map);
  </script>
</body>
</html>`;

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

function EventMapPreview({ drive }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const latitude = Number(drive?.latitude);
  const longitude = Number(drive?.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const directionsUrl = buildDirectionsUrl(drive);
  const mapHtml = hasCoordinates ? buildCoordinateMapHtml(latitude, longitude) : '';
  const [mapFailed, setMapFailed] = React.useState(false);

  const handleOpenDirections = React.useCallback(async () => {
    if (!directionsUrl) return;
    await Linking.openURL(directionsUrl);
  }, [directionsUrl]);

  React.useEffect(() => {
    setMapFailed(false);
  }, [mapHtml]);

  if (!directionsUrl && !mapHtml) return null;

  return (
    <View style={[styles.mapPreview, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
      {WebView && mapHtml && !mapFailed ? (
        <WebView
          source={{ html: mapHtml }}
          baseUrl="https://maps.local"
          style={styles.mapWebView}
          containerStyle={styles.mapWebViewContainer}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          originWhitelist={['*']}
          onError={() => setMapFailed(true)}
          onHttpError={() => setMapFailed(true)}
          pointerEvents="none"
        />
      ) : (
        <>
          <View style={styles.mapGrid}>
            <View style={[styles.mapGridLineHorizontal, { backgroundColor: roles.defaultCardBorder }]} />
            <View style={[styles.mapGridLineVertical, { backgroundColor: roles.defaultCardBorder }]} />
          </View>
          <View style={[styles.mapPin, { backgroundColor: roles.defaultCardBackground }]}>
            <MaterialCommunityIcons name="map-marker" size={34} color={roles.primaryActionBackground} />
          </View>
          <Pressable
            onPress={handleOpenDirections}
            style={styles.mapFallbackTapTarget}
            accessibilityRole="button"
            accessibilityLabel="Open event location in maps"
          />
        </>
      )}
      <LinearGradient
        colors={['rgba(255,255,255,0.88)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.88)']}
        locations={[0, 0.46, 1]}
        style={styles.mapOverlay}
        pointerEvents="none"
      />
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

function DetailIconRow({ icon, label, value, meta, badge, onPress }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const content = (
    <View style={styles.detailIconRow}>
      <View style={[styles.detailIcon, { backgroundColor: roles.iconPrimarySurface }]}>
        <MaterialCommunityIcons name={icon} size={20} color={roles.primaryActionBackground} />
      </View>
      <View style={styles.detailIconCopy}>
        <Text style={[styles.detailIconLabel, { color: roles.metaText }]}>{label}</Text>
        <Text numberOfLines={2} style={[styles.detailIconValue, { color: roles.headingText }]}>{value}</Text>
        {meta ? <Text numberOfLines={2} style={[styles.detailIconMeta, { color: roles.bodyText }]}>{meta}</Text> : null}
      </View>
      {badge ? (
        <View style={[styles.detailBadge, { backgroundColor: roles.iconPrimarySurface }]}>
          <Text style={[styles.detailBadgeText, { color: roles.primaryActionBackground }]}>{badge}</Text>
        </View>
      ) : null}
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={22} color={roles.metaText} /> : null}
    </View>
  );

  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed ? styles.pressed : null]}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

function HairEligibilitySection({
  isRegisteredForDrive = false,
  hasHairScanLog = false,
  isAiEligible = false,
  hairEligibilityMessage = '',
  ended = false,
  onScanPress,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  if (isRegisteredForDrive || ended) return null;

  const isEligible = hasHairScanLog && isAiEligible;
  const hasScannedButNotEligible = hasHairScanLog && !isAiEligible;

  const icon = isEligible
    ? 'check-circle-outline'
    : hasScannedButNotEligible
      ? 'alert-circle-outline'
      : 'hair-dryer-outline';
  const iconColor = isEligible
    ? '#2f8f57'
    : hasScannedButNotEligible
      ? '#c87a12'
      : roles.primaryActionBackground;
  const surfaceColor = isEligible
    ? '#edf7f1'
    : hasScannedButNotEligible
      ? '#fff8ec'
      : roles.iconPrimarySurface;
  const borderColor = isEligible
    ? '#b5dec8'
    : hasScannedButNotEligible
      ? '#f0d49a'
      : roles.defaultCardBorder;
  const title = isEligible
    ? 'Hair eligible for donation'
    : hasScannedButNotEligible
      ? 'Not eligible for donation yet'
      : 'Hair scan required to register';

  return (
    <View style={[styles.eligibilityCard, { backgroundColor: surfaceColor, borderColor }]}>
      <View style={[styles.eligibilityIconWrap, { backgroundColor: isEligible ? '#d0f0de' : hasScannedButNotEligible ? '#fdebc8' : roles.iconPrimarySurface }]}>
        <MaterialCommunityIcons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.eligibilityContent}>
        <Text style={[styles.eligibilityTitle, { color: iconColor }]}>{title}</Text>
        <Text style={[styles.eligibilityMessage, { color: roles.bodyText }]}>{hairEligibilityMessage}</Text>
        {!hasHairScanLog && onScanPress ? (
          <Pressable
            onPress={onScanPress}
            style={({ pressed }) => [styles.eligibilityScanLink, pressed ? styles.pressed : null]}
            accessibilityRole="button"
            accessibilityLabel="Go to Hair Scan"
          >
            <Text style={[styles.eligibilityScanLinkText, { color: roles.primaryActionBackground }]}>
              Scan your hair now →
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function EventDetailsPanel({
  drive,
  shownRegistrationCount = 0,
  isRegisteredForDrive = false,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const directionsUrl = buildDirectionsUrl(drive);
  const shownCount = Number(shownRegistrationCount) || 0;
  const orgName = drive?.event_by || drive?.organization_name || 'Event host';
  const missionText = drive?.event_overview
    || 'Join this Donivra hair donation drive and help provide meaningful support to people who need wigs and care.';
  const attendeeMeta = isRegisteredForDrive
    ? 'You are counted for this drive.'
    : 'Register to be counted for this drive.';

  return (
    <AppCard variant="default" radius="xl" padding="lg" style={styles.sectionGap}>
      <View style={styles.eventPanelHeader}>
        <Text style={[styles.eventPanelTitle, { color: roles.headingText }]}>Event Details</Text>
        <View style={[styles.detailBadge, { backgroundColor: roles.iconPrimarySurface }]}>
          <Text style={[styles.detailBadgeText, { color: roles.primaryActionBackground }]}>
            {drive?.is_public ? 'Public' : 'Private'}
          </Text>
        </View>
      </View>

      <View style={styles.detailIconList}>
        <DetailIconRow
          icon="calendar-today"
          label="Date & time"
          value={formatDriveDate(drive?.start_date, drive?.end_date)}
          meta={formatDriveTime(drive?.start_date, drive?.end_date)}
        />
        <DetailIconRow
          icon="map-marker-outline"
          label="Location"
          value={drive?.address_label || drive?.location_label || 'Location to follow'}
          meta={directionsUrl ? 'Open directions in Maps' : ''}
          onPress={directionsUrl ? () => Linking.openURL(directionsUrl) : null}
        />
        <DetailIconRow
          icon="account-group-outline"
          label="Donors attending"
          value={shownCount > 0 ? `${shownCount} joined` : 'No registered donors yet'}
          meta={attendeeMeta}
          badge={isRegisteredForDrive ? 'Joined' : ''}
        />
        <DetailIconRow
          icon="domain"
          label="Host"
          value={orgName}
          meta="Event host"
          badge={initialsFromName(orgName)}
        />
      </View>

      <View style={[styles.compactDivider, { backgroundColor: roles.defaultCardBorder }]} />
      <View style={styles.missionRow}>
        <MaterialCommunityIcons name="hand-heart-outline" size={21} color={roles.primaryActionBackground} />
        <Text style={[styles.missionText, { color: roles.bodyText }]}>{missionText}</Text>
      </View>

      <EventMapPreview drive={drive} />
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
  const [isSubmittingRsvp, setIsSubmittingRsvp] = React.useState(false);
  const [donationFlowState, setDonationFlowState] = React.useState({
    hasOngoingDonation: false,
    ongoingDonationMessage: '',
    hasHairScanLog: false,
    isAiEligible: false,
    hairEligibilityMessage: '',
    hasSubmittedDonationForDrive: false,
  });

  const driveImageUrl = drive?.event_image_url || drive?.organization_logo_url || '';
  const hasOngoingDonation = Boolean(donationFlowState.hasOngoingDonation);
  const hasHairScanLog = Boolean(donationFlowState.hasHairScanLog);
  const hasSubmittedDonationForDrive = Boolean(donationFlowState.hasSubmittedDonationForDrive);
  const ended = isDriveEnded(drive);
  const ongoingDonationMessage = donationFlowState.ongoingDonationMessage
    || 'You already have an ongoing donation. Please complete or wait for the current donation process to finish before starting a new one.';
  const hairEligibilityMessage = donationFlowState.hairEligibilityMessage
    || 'Scan your hair first so the system can confirm if you are eligible to join this donation event.';

  const loadRegistrationCount = React.useCallback(async () => {
    if (!Number.isFinite(numericDriveId) || numericDriveId <= 0) return;
    const countResult = await supabase
      .from('Event_Attendees')
      .select('Event_Attendee_ID', { count: 'exact', head: true })
      .eq('Event_Request_ID', numericDriveId);

    if (!countResult.error && Number.isFinite(countResult.count)) {
      setRegistrationCount(countResult.count || 0);
      return;
    }

    const rowsResult = await supabase
      .from('Event_Attendees')
      .select('Event_Attendee_ID,User_ID')
      .eq('Event_Request_ID', numericDriveId)
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
    const hasSubmittedDonationForDrive = [
      ...(Array.isArray(donationModuleResult.activeSubmissions) ? donationModuleResult.activeSubmissions : []),
      donationModuleResult.latestSubmission,
    ].filter(Boolean).some((submission) => Number(submission?.donation_drive_id) === Number(numericDriveId));

    setDonationFlowState({
      hasOngoingDonation: Boolean(donationModuleResult.hasOngoingDonation),
      ongoingDonationMessage: donationModuleResult.ongoingDonationMessage || '',
      hasHairScanLog: Boolean(donationModuleResult.latestScreening && donationModuleResult.latestAnalysisEntry?.submission),
      isAiEligible: Boolean(donationModuleResult.isAiEligible),
      hairEligibilityMessage: donationModuleResult.latestScreening
        ? donationModuleResult.isAiEligible
          ? 'Your hair is cleared for this drive.'
          : (() => {
              const reason = String(donationModuleResult.latestAiEligibility?.reason || '').trim();
              const firstSentence = reason.split(/[.!]/)[0].trim();
              return firstSentence ? `${firstSentence}.` : 'Follow the scan recommendations and try again.';
            })()
        : 'Complete a CheckHair scan to check eligibility.',
      hasSubmittedDonationForDrive,
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
    const onCertificateRealtimeEvent = (payload = {}) => {
      if (payload?.eventType !== 'INSERT') return;
      setFeedbackMessage('Certificate is now available in Achievements.');
      setFeedbackVariant('success');
      scheduleDriveRealtimeRefresh();
    };
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
        table: 'Event_Requests',
        filter: `Event_Request_ID=eq.${numericDriveId}`,
      }, onRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Event_Attendees',
        filter: `Event_Request_ID=eq.${numericDriveId}`,
      }, onRegistrationRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Event_Attendees',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onRegistrationRealtimeEvent)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'Donation_Certificates',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onCertificateRealtimeEvent)
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

  const handleDriveRsvp = React.useCallback(async () => {
    if (!drive?.donation_drive_id || ended) return;

    if ((!hasHairScanLog || !donationFlowState.isAiEligible) && !drive.registration?.registration_id) {
      setFeedbackMessage(hairEligibilityMessage);
      setFeedbackVariant('info');
      if (!hasHairScanLog) router.navigate('/donor/donations');
      return;
    }

    if (hasOngoingDonation && !drive.registration?.registration_id) {
      setFeedbackMessage(ongoingDonationMessage);
      setFeedbackVariant('info');
      return;
    }

    if (hasOngoingDonation && drive.registration?.registration_id && hasSubmittedDonationForDrive) {
      router.navigate(`/donor/status?driveId=${drive.donation_drive_id}`);
      return;
    }

    if (drive.registration?.registration_id) {
      const isPresent = isPresentRegistration(drive.registration);
      if (isPresent) {
        router.navigate(`/donor/status?driveId=${drive.donation_drive_id}`);
        return;
      }
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
      hasEligibleHairScan: Boolean(donationFlowState.isAiEligible),
      hasHairScanLog,
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
    setRegistrationCount((current) => Math.max(current || 0, 1));
    setFeedbackMessage(result.alreadyRegistered ? 'You are already registered for this event.' : 'Registration saved.');
    setFeedbackVariant('success');
  }, [
    drive,
    ended,
    hairEligibilityMessage,
    hasOngoingDonation,
    hasHairScanLog,
    donationFlowState.isAiEligible,
    hasSubmittedDonationForDrive,
    loadRegistrationCount,
    ongoingDonationMessage,
    profile?.user_id,
    refreshDriveRegistration,
    router,
  ]);

  const actionTitle = ended
    ? 'Event ended'
    : !hasHairScanLog && !drive?.registration?.registration_id
      ? 'Scan hair first'
    : hasHairScanLog && !donationFlowState.isAiEligible && !drive?.registration?.registration_id
      ? 'Not eligible yet'
    : hasOngoingDonation && hasSubmittedDonationForDrive && drive?.registration?.registration_id
          ? 'View My Donation'
        : drive?.registration?.registration_id
          ? isPresentRegistration(drive.registration)
            ? 'Submit hair donation'
            : 'Registered'
          : 'Register to Attend';

  const actionDisabled = isLoading
    || ended
    || (hasHairScanLog && !donationFlowState.isAiEligible && !drive?.registration?.registration_id)
    || (hasOngoingDonation && hasSubmittedDonationForDrive && !drive?.registration?.registration_id);
  const isRegisteredForDrive = Boolean(drive?.registration?.registration_id);
  const shownRegistrationCount = Math.max(registrationCount, isRegisteredForDrive ? 1 : 0);
  const shouldHideBottomCta = actionTitle === 'Registered';
  const rsvpQrPayloadText = isRegisteredForDrive
    ? buildDriveInvitationQrPayload({ drive, registration: drive?.registration || null })
    : '';
  const rsvpQrImageUrl = rsvpQrPayloadText ? buildQrImageUrl(rsvpQrPayloadText, 280) : '';

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
        {errorMessage ? (
          <StatusBanner
            message={errorMessage}
            variant="info"
            presentation="floating"
            visible={Boolean(errorMessage)}
            autoDismissMs={3000}
            onDismiss={() => setErrorMessage('')}
          />
        ) : null}
        {feedbackMessage ? (
          <StatusBanner
            message={feedbackMessage}
            variant={feedbackVariant}
            presentation="floating"
            visible={Boolean(feedbackMessage)}
            autoDismissMs={3000}
            onDismiss={() => setFeedbackMessage('')}
          />
        ) : null}

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
            <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading event details</Text>
          </View>
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
                      {drive.is_public ? 'Public' : 'Private'}
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
                    {drive.is_public ? 'Public' : 'Private'}
                  </Text>
                </View>
                <MaterialCommunityIcons name="calendar-heart" size={52} color={roles.primaryActionBackground} />
                <Text numberOfLines={3} style={[styles.heroFallbackTitle, { color: roles.headingText }]}>
                  {drive.event_title || 'Donation drive'}
                </Text>
              </View>
            )}
          </View>

          <EventDetailsPanel
            drive={drive}
            shownRegistrationCount={shownRegistrationCount}
            isRegisteredForDrive={isRegisteredForDrive}
          />

          <HairEligibilitySection
            isRegisteredForDrive={isRegisteredForDrive}
            hasHairScanLog={hasHairScanLog}
            isAiEligible={donationFlowState.isAiEligible}
            hairEligibilityMessage={hairEligibilityMessage}
            ended={ended}
            onScanPress={() => router.navigate('/donor/donations')}
          />

          {drive?.registration?.registration_id ? (
            <AppCard variant="default" radius="xl" padding="lg" style={styles.sectionGap}>
              <Text style={[styles.sectionTitle, { color: roles.headingText }]}>RSVP QR</Text>
              <Text style={[styles.qrHelper, { color: roles.bodyText }]}>
                Show this QR to staff for attendance scan.
              </Text>
              {rsvpQrImageUrl ? (
                <View style={styles.qrWrap}>
                  <Image
                    source={{ uri: rsvpQrImageUrl }}
                    style={styles.qrImage}
                    resizeMode="contain"
                  />
                </View>
              ) : (
                <Text style={[styles.qrHelper, { color: roles.metaText }]}>QR unavailable. Please refresh this page.</Text>
              )}
            </AppCard>
          ) : null}

          {drive?.registration?.registration_id ? (
            <View style={[styles.registrationStateRow, { borderColor: roles.defaultCardBorder }]}>
              <MaterialCommunityIcons
                name={isPresentRegistration(drive.registration) ? 'check-decagram-outline' : 'clock-time-four-outline'}
                size={18}
                color={isPresentRegistration(drive.registration) ? '#2f8f57' : roles.metaText}
              />
              <Text style={[styles.registrationStateText, { color: roles.bodyText }]}>
                {isPresentRegistration(drive.registration)
                  ? 'Attendance marked Present. You can now submit your hair donation.'
                  : 'Registered. Wait for staff to mark your attendance as Present.'}
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <Text style={[styles.emptyText, { color: roles.bodyText }]}>Drive details are not available right now.</Text>
      )}

      </ScrollView>

      {drive && !shouldHideBottomCta ? (
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
            loading={isSubmittingRsvp}
            disabled={actionDisabled}
          />
        </View>
      ) : null}
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
  eventPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  eventPanelTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  detailIconList: {
    gap: theme.spacing.sm,
  },
  detailIconRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  detailIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  detailIconCopy: {
    flex: 1,
    minWidth: 0,
  },
  detailIconLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailIconValue: {
    marginTop: 2,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.bold,
    lineHeight: theme.typography.compact.bodySm * 1.35,
  },
  detailIconMeta: {
    marginTop: 2,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * 1.4,
  },
  detailBadge: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    flexShrink: 0,
  },
  detailBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  compactDivider: {
    height: 1,
    marginVertical: theme.spacing.md,
  },
  missionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  missionText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * 1.55,
  },
  mapPreview: {
    marginTop: theme.spacing.md,
    minHeight: 190,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    padding: theme.spacing.md,
    justifyContent: 'space-between',
  },
  mapWebViewContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  mapWebView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
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
  mapFallbackTapTarget: {
    ...StyleSheet.absoluteFillObject,
  },
  mapCopy: {
    paddingRight: 120,
    zIndex: 2,
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
    zIndex: 2,
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
  accessCodeInput: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    letterSpacing: 0,
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
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
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
  qrStatusBanner: {
    width: '100%',
    marginTop: theme.spacing.md,
  },
  registrationStateRow: {
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  registrationStateText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * 1.45,
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
  eligibilityCard: {
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  eligibilityIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  eligibilityContent: {
    flex: 1,
    paddingTop: 2,
  },
  eligibilityTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.bold,
    marginBottom: 3,
  },
  eligibilityMessage: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * 1.5,
  },
  eligibilityScanLink: {
    marginTop: theme.spacing.xs,
  },
  eligibilityScanLinkText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
});
