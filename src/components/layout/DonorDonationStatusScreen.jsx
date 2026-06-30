import React from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DashboardLayout } from './DashboardLayout';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { DASHBOARD_TAB_BAR_HEIGHT } from '../ui/DashboardTabBar';
import { DonationEventsEmptyState } from '../ui/DonationEventsEmptyState';
import { GradientActionButton } from '../ui/GradientActionButton';
import { SectionTitleRow } from '../ui/SectionTitleRow';
import { AppInput } from '../ui/AppInput';
import { StatusBanner } from '../ui/StatusBanner';
import { DonivraLoadingOverlay } from '../ui/DonivraLoadingOverlay';
import { DonorTopBar } from '../donor/DonorTopBar';
import { donorDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuthActions } from '../../features/auth/hooks/useAuthActions';
import { supabase } from '../../api/supabase/client';
import {
  buildDonationTrackingQrPayload,
  buildDriveInvitationQrPayload,
  buildQrImageUrl,
  getDonorDonationsModuleData,
  printDonationQrPdf,
  printDonationQrLabelsPdf,
  saveManualDonationQualification,
  saveDonationQrPngToDevice,
  startIndependentDonationDraft,
  addDonationBundleFromAnalysis,
  addDonationBundleFromManualDetails,
  updateManualDonationDetail,
  ensureIndependentDonationQr,
  submitDonationForStaffWaybill,
  linkDonationRecipient,
  cancelDonorDonation,
} from '../../features/donorDonations.service';
import { createDonationDriveRegistration } from '../../features/donorHome.api';
import { fetchLatestLogisticsSettings, updateHairSubmissionDetailById } from '../../features/hairSubmission.api';
import { hairDonationModeOptions } from '../../features/hairSubmission.constants';
import { buildProfileCompletionMeta } from '../../features/profile/services/profile.service';
import { canSubmitHairDonation, DONOR_PERMISSION_REASONS, mapDonationPermissionError } from '../../features/donorCompliance.service';
import { resolveThemeRoles, theme } from '../../design-system/theme';

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MANUAL_FORM_DEFAULTS = {
  donorType: 'own',
  donorName: '',
  donorBirthdate: '',
  relationshipToSubmitter: '',
  consentConfirmed: false,
  lengthValue: '',
  lengthUnit: 'in',
  treated: 'no',
  colored: 'no',
  trimmed: 'no',
  hairColor: 'Natural black',
  density: 'Medium density',
};

const ADDITIONAL_BUNDLE_DEFAULTS = {
  donorType: 'own',
  inputMethod: 'scan',
  donorName: '',
  donorBirthdate: '',
  relationshipToSubmitter: '',
  consentConfirmed: false,
  lengthValue: '',
  lengthUnit: 'in',
  treated: 'no',
  colored: 'no',
  trimmed: 'no',
  hairColor: 'Natural black',
  density: 'Medium density',
};

const LENGTH_UNIT_OPTIONS = [
  { label: 'Inches', value: 'in' },
];
const DONATION_REALTIME_DEBOUNCE_MS = 420;
let cachedDonorDonationModuleData = null;
let cachedDonorDonationModuleUserId = '';

const getFriendlyDonationModuleError = (error = '') => {
  const text = String(error?.message || error || '').trim();
  const normalized = text.toLowerCase();

  if (!text) return '';
  if (
    normalized.includes('could not find the table')
    || normalized.includes('schema cache')
    || normalized.includes('pgrst205')
  ) {
    return 'Some donation updates could not load. You can still use the available donation records.';
  }

  return text;
};

const YES_NO_OPTIONS = [
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' },
];

const HAIR_COLOR_OPTIONS = [
  { label: 'Natural black', value: 'Natural black' },
  { label: 'Dark brown', value: 'Dark brown' },
  { label: 'Medium brown', value: 'Medium brown' },
  { label: 'Light brown', value: 'Light brown' },
  { label: 'Blonde', value: 'Blonde' },
  { label: 'Gray', value: 'Gray' },
  { label: 'Other natural shade', value: 'Other natural shade' },
];

const MANUAL_DENSITY_OPTIONS = [
  { label: 'Light density', value: 'Light density' },
  { label: 'Medium density', value: 'Medium density' },
  { label: 'Heavy density', value: 'Heavy density' },
];

const formatDateLabel = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const isValidBirthdate = (value) => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const [year, month, day] = text.split('-').map(Number);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) {
    return false;
  }
  return parsed <= new Date();
};

const getAgeFromBirthdate = (value) => {
  if (!isValidBirthdate(value)) return null;
  const birthdate = new Date(`${String(value).trim()}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  const monthDelta = today.getMonth() - birthdate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthdate.getDate())) {
    age -= 1;
  }
  return age;
};

const getScreeningLogText = (screening = null, { preferSummary = false } = {}) => {
  const values = preferSummary
    ? [screening?.summary, screening?.visible_damage_notes, screening?.detected_condition, screening?.decision]
    : [screening?.decision, screening?.summary, screening?.visible_damage_notes, screening?.detected_condition];

  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
};

const buildDonationDecisionText = ({ screening = null, isEligible = false, ineligibilityReason = '' }) => {
  if (isEligible) {
    const decision = String(screening?.decision || '').trim().toLowerCase();
    const preferSummary = decision.includes('improve') || decision.includes('not eligible') || decision.includes('needs');
    return getScreeningLogText(screening, { preferSummary });
  }

  const reason = String(ineligibilityReason || '').trim();
  if (reason) return reason;

  return getScreeningLogText(screening);
};

const formatScreeningLengthInches = (screening = null) => {
  const lengthCm = Number(screening?.estimated_length);
  if (!Number.isFinite(lengthCm) || lengthCm <= 0) return 'N/A';
  return `${(lengthCm / 2.54).toFixed(1)} inches`;
};

const getDriveDateLabel = (drive = null) => (
  drive?.start_date
    ? `${formatDateLabel(drive.start_date)}${drive?.end_date ? ` - ${formatDateLabel(drive.end_date)}` : ''}`
    : 'Schedule to be announced'
);

const getDriveOrganizationLabel = (drive = null) => (
  drive?.organization_name || drive?.organization?.organization_name || 'Partner organization'
);

const isClosedDonationStatus = (status = '') => {
  const normalized = String(status || '').trim().toLowerCase();
  return ['completed', 'cancelled', 'canceled', 'rejected', 'closed'].includes(normalized);
};

const hasApprovalToken = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  if (['reject', 'declined', 'failed', 'not approved'].some((token) => normalized.includes(token))) {
    return false;
  }
  return [
    'approved',
    'accepted',
    'qualified',
    'qa passed',
    'quality passed',
    'passed qa',
    'passed quality',
  ].some((token) => normalized.includes(token));
};

const getCombinedDonationUpdateText = (item = null) => [
  item?.status,
  item?.statusLabel,
  item?.title,
  item?.label,
  item?.description,
  item?.savedNote,
  item?.message,
  item?.badge,
].filter(Boolean).join(' ');

const hasDonationApprovalEvidence = ({
  submission = null,
  certificate = null,
  timelineStages = [],
  timelineEvents = [],
  trackingEntries = [],
} = {}) => {
  if (!submission?.submission_id) return false;
  if (certificate?.submission_id && Number(certificate.submission_id) === Number(submission.submission_id)) {
    return true;
  }

  const relatedUpdates = [
    ...(timelineStages || []),
    ...(timelineEvents || []),
    ...(trackingEntries || []),
  ].filter((item) => (
    !item?.submission_id || Number(item.submission_id) === Number(submission.submission_id)
  ));

  return relatedUpdates.some((item) => hasApprovalToken(getCombinedDonationUpdateText(item)));
};

const canCancelDonationSubmission = ({
  submission = null,
  registration = null,
  certificate = null,
  timelineStages = [],
  timelineEvents = [],
  trackingEntries = [],
} = {}) => {
  const normalizedStatus = String(submission?.status || '').trim().toLowerCase();
  const normalizedStatusKey = normalizeTimelineKey(normalizedStatus);
  const isDraftLike = ['draft', 'pending', 'qr generated', 'not generated'].includes(normalizedStatus);

  return Boolean(submission?.submission_id)
    && !isClosedDonationStatus(submission?.status)
    && !isRsvpCheckedIn(registration)
    && !submission?.cut_at
    && !['cut', 'wiginproduction', 'wigcreated'].includes(normalizedStatusKey)
    && (
      isDraftLike
      || !hasDonationApprovalEvidence({
        submission,
        certificate,
        timelineStages,
        timelineEvents,
        trackingEntries,
      })
    );
};

const DONATION_MODULE_SCREEN = {
  EVENTS: 'events',
  EVENT_DETAILS: 'eventDetails',
  SUMMARY: 'summary',
  RECIPIENT: 'recipient',
  QR_CODES: 'qrCodes',
  MY_DONATIONS: 'myDonations',
  DONATION_STATUS: 'donationStatus',
};

const DONATION_EVENT_SORT_OPTIONS = [
  { key: 'latest', label: 'Latest' },
  { key: 'oldest', label: 'Oldest' },
];

const DONATION_EVENT_VISIBILITY_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'public', label: 'Public' },
  { key: 'private', label: 'Private' },
];

const isDonationDrivePublic = (drive = null) => Boolean(
  drive?.is_public || drive?.visibility_scope === 'public'
);

const getDonationEventSortTime = (drive = null) => {
  const dateValue = drive?.start_date || drive?.end_date || drive?.updated_at || null;
  const time = dateValue ? new Date(dateValue).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const sortDonationEventsByDate = (drives = [], sortOrder = 'latest') => (
  [...drives].sort((left, right) => {
    const leftTime = getDonationEventSortTime(left);
    const rightTime = getDonationEventSortTime(right);

    if (leftTime !== rightTime) {
      return sortOrder === 'oldest'
        ? leftTime - rightTime
        : rightTime - leftTime;
    }

    const leftTitle = String(left?.event_title || '').toLowerCase();
    const rightTitle = String(right?.event_title || '').toLowerCase();
    if (leftTitle !== rightTitle) return leftTitle.localeCompare(rightTitle);

    return Number(right?.donation_drive_id || 0) - Number(left?.donation_drive_id || 0);
  })
);

const isSubmittedDonationStatus = (status = '') => (
  String(status || '').trim().toLowerCase().includes('submitted')
);

const isRemovedHairDetail = (detail = null) => {
  const status = String(detail?.status || '').trim().toLowerCase();
  const trackingStatus = String(detail?.current_tracking_status || '').trim().toLowerCase();
  return ['removed', 'cancelled', 'canceled'].includes(status)
    || ['removed', 'cancelled', 'canceled'].includes(trackingStatus);
};

const normalizeTimelineKey = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const isCancelledDonationSubmission = (submission = null) => (
  ['cancelled', 'canceled'].includes(normalizeTimelineKey(submission?.status || submission?.Status || ''))
);

const getTimelineEvidenceAt = (stage) => (
  stage?.displayEvidenceAt
  || stage?.completedAt
  || stage?.evidenceAt
  || stage?.timestamp
  || stage?.created_at
  || null
);

const findTimelineStage = (stages = [], keys = [], labels = []) => {
  const keySet = new Set(keys.map(normalizeTimelineKey));
  const labelTokens = labels.map(normalizeTimelineKey).filter(Boolean);

  return stages.find((stage) => {
    const stageKey = normalizeTimelineKey(stage?.key || stage?.id || '');
    if (stageKey && keySet.has(stageKey)) return true;

    const searchable = normalizeTimelineKey(`${stage?.label || ''} ${stage?.title || ''} ${stage?.savedNote || ''}`);
    return labelTokens.some((token) => searchable.includes(token));
  }) || null;
};

const isSubmissionCutAndShipComplete = (submission = null) => {
  const statusKey = normalizeTimelineKey(submission?.status || submission?.Status || '');
  return [
    'cut',
    'wiginproduction',
    'inproduction',
    'wigcreated',
    'wigcompleted',
    'completed',
  ].includes(statusKey);
};

const buildEventDonationTimelineStages = ({ item, fallbackStages = [], certificate }) => {
  const submission = item?.submission || null;
  const isSubmissionCancelled = isCancelledDonationSubmission(submission);
  const submissionId = Number(submission?.submission_id || submission?.Submission_ID || 0);
  const isSubmissionCutComplete = isSubmissionCutAndShipComplete(submission);
  const certificateSubmissionId = isSubmissionCancelled ? 0 : Number(certificate?.submission_id || certificate?.Submission_ID || 0);
  const certificateIssuedAt = !isSubmissionCancelled && isSubmissionCutComplete && submissionId && certificateSubmissionId === submissionId
    ? (certificate?.issued_at || certificate?.Issued_At || null)
    : null;

  const cutFallback = findTimelineStage(
    fallbackStages,
    ['cut_and_ship', 'cutship', 'received_by_company', 'receivedbyhairforhope'],
    ['cut ship', 'received by hair', 'received by company'],
  );
  const productionFallback = findTimelineStage(
    fallbackStages,
    ['wig_production', 'wigproduction', 'for_bundling', 'forbundling'],
    ['wig production', 'for bundling'],
  );
  const hospitalFallback = findTimelineStage(
    fallbackStages,
    ['wig_distribution_hospitals', 'wigdistributionhospitals', 'wig_completed', 'wigcompleted', 'assigned_to_patient'],
    ['wig distribution hospital', 'wig completed', 'assigned to patient'],
  );
  const patientFallback = findTimelineStage(
    fallbackStages,
    ['distribution_to_patients', 'distributiontopatients', 'received_by_patient', 'receivedbypatient'],
    ['distribution to patient', 'received by patient'],
  );

  const cutFallbackEvidenceAt = normalizeTimelineKey(cutFallback?.key || '') === 'cutandship'
    ? getTimelineEvidenceAt(cutFallback)
    : null;
  const cutEvidenceAt = !isSubmissionCancelled && (submission?.cut_at
    || (isSubmissionCutComplete ? (submission?.updated_at || submission?.created_at) : null)
    || certificateIssuedAt
    || cutFallbackEvidenceAt);

  if (isSubmissionCancelled) {
    const cancelledAt = submission?.updated_at || submission?.Updated_At || submission?.created_at || submission?.Created_At || null;
    return [{
      key: 'donation_cancelled',
      label: 'Donation Cancelled',
      savedNote: 'This donation was cancelled in the donation records. RSVP scan history is kept, but the latest submission status controls this timeline.',
      evidenceAt: cancelledAt,
      displayEvidenceAt: cancelledAt,
      state: 'cancelled',
      progressLabel: 'Cancelled',
      statusLabel: 'Cancelled',
    }];
  }

  const eventStages = [
    {
      key: 'cut_and_ship',
      label: 'Cut & Ship',
      savedNote: 'The user has a hair ready to be delivered to the organization.',
      evidenceAt: cutEvidenceAt,
      statusLabel: cutEvidenceAt ? 'Complete' : '',
    },
    {
      key: 'wig_production',
      label: 'Wig Production',
      savedNote: productionFallback?.savedNote || 'Approved hair by the staff is used in the wig production process.',
      evidenceAt: getTimelineEvidenceAt(productionFallback),
      statusLabel: productionFallback?.statusLabel || '',
    },
    {
      key: 'wig_distribution_hospitals',
      label: 'Wig Distribution for Hospital',
      savedNote: hospitalFallback?.savedNote || 'The completed wig is prepared for hospital distribution.',
      evidenceAt: getTimelineEvidenceAt(hospitalFallback),
      statusLabel: hospitalFallback?.statusLabel || '',
    },
    {
      key: 'distribution_to_patients',
      label: 'Distribution to Patients',
      savedNote: patientFallback?.savedNote || 'The wig is distributed to patients.',
      evidenceAt: getTimelineEvidenceAt(patientFallback),
      statusLabel: patientFallback?.statusLabel || '',
    },
  ];

  const lastCompletedIndex = eventStages.reduce((latestIndex, stage, index) => (
    stage.evidenceAt ? index : latestIndex
  ), -1);
  const currentIndex = Math.min(lastCompletedIndex + 1, eventStages.length - 1);

  return eventStages.map((stage, index) => {
    const isCompleted = Boolean(stage.evidenceAt);
    const isCurrent = !isCompleted && index === currentIndex;
    return {
      ...stage,
      displayEvidenceAt: stage.evidenceAt,
      state: isCompleted ? 'completed' : (isCurrent ? 'current' : 'upcoming'),
      progressLabel: isCompleted ? 'Complete' : (isCurrent ? 'Ongoing' : 'On waiting'),
      statusLabel: stage.statusLabel || (isCompleted ? 'Complete' : ''),
    };
  });
};

const isSubmittedDonationItem = (item = null) => (
  Boolean(
    item?.submission?.submission_id
    && isSubmittedDonationStatus(item.submission.status)
  )
);

const formatDateTimeLabel = (dateString) => {
  if (!dateString) return '';
  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(dateString));
  } catch {
    return String(dateString || '');
  }
};

const getDriveLocationLabel = (drive = null) => (
  drive?.location_label
  || drive?.address_label
  || [drive?.street, drive?.barangay, drive?.city, drive?.province, drive?.country].filter(Boolean).join(', ')
  || 'Location to be announced'
);

const getLogisticsAddressLines = (logisticsSettings = null) => {
  if (!logisticsSettings) return [];

  return [
    logisticsSettings.destination_name,
    [logisticsSettings.street, logisticsSettings.barangay].filter(Boolean).join(', '),
    [logisticsSettings.city, logisticsSettings.province].filter(Boolean).join(', '),
    logisticsSettings.country,
  ].map((line) => String(line || '').trim()).filter(Boolean);
};

const getLogisticsSummaryRows = (logisticsSettings = null) => {
  if (!logisticsSettings) return [];

  const addressLines = getLogisticsAddressLines(logisticsSettings);

  return [
    { label: 'Destination', value: logisticsSettings.destination_name || 'Donation drop-off' },
    { label: 'Address', value: addressLines.join('\n') || 'To be announced' },
    { label: 'Contact person', value: logisticsSettings.contact_person || 'To be announced' },
    { label: 'Contact number', value: logisticsSettings.contact_number || 'To be announced' },
  ];
};

const getShippingFeeNote = () => (
  hairDonationModeOptions.find((option) => option.value === 'shipping')?.description
  || 'Send the prepared hair package to the donation drop-off address. Shipping fee is shouldered by the donor.'
);

const buildStaticMapPreviewUrl = (logisticsSettings = null) => {
  const latitude = Number(logisticsSettings?.latitude);
  const longitude = Number(logisticsSettings?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';

  return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}&zoom=15&size=640x360&markers=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)},red-pushpin`;
};

const getDriveTimeState = (drive = null) => {
  const now = Date.now();
  const startTime = drive?.start_date ? new Date(drive.start_date).getTime() : 0;
  const endTime = drive?.end_date ? new Date(drive.end_date).getTime() : startTime;

  if (Number.isFinite(endTime) && endTime && endTime < now) return 'past';
  if (Number.isFinite(startTime) && startTime && startTime > now) return 'upcoming';
  if (startTime || endTime) return 'active';
  return 'active';
};

const normalizeDriveRegistrationRow = (row = null) => {
  if (!row) return null;
  const attendanceStatus = String(row?.attendance_status || '').trim().toLowerCase();
  const isUsed = Boolean(row?.attendance_marked_at || row?.rsvp_scanned_at)
    || ['marked', 'attended', 'present', 'checked in', 'checked-in', 'scanned', 'verified'].some((token) => attendanceStatus.includes(token));

  return {
    registration_id: row?.registration_id || null,
    donation_drive_id: row?.donation_drive_id || null,
    user_id: row?.user_id || null,
    waybill_code: row?.waybill_code || '',
    submission_id: row?.submission_id || null,
    donation_reference: row?.donation_reference || '',
    submission_detail_id: row?.submission_detail_id || null,
    submission_status: row?.submission_status || '',
    submission_detail_status: row?.submission_detail_status || '',
    registration_status: row?.registration_status || '',
    attendance_status: row?.attendance_status || '',
    rsvp_scanned_at: row?.rsvp_scanned_at || null,
    rsvp_scanned_by: row?.rsvp_scanned_by || null,
    registered_at: row?.registered_at || null,
    updated_at: row?.updated_at || null,
    attendance_marked_at: row?.attendance_marked_at || null,
    qr: {
      state: isUsed ? 'used' : row?.registration_id ? 'registered' : 'missing',
      generated_at: row?.registered_at || row?.updated_at || null,
      used_at: isUsed ? (row?.rsvp_scanned_at || row?.attendance_marked_at || row?.updated_at || row?.registered_at || null) : null,
      is_used: isUsed,
      is_valid: Boolean(row?.registration_id) && !isUsed,
    },
  };
};

const normalizeRsvpStatus = (value = '') => String(value || '').trim().toLowerCase();

const isRsvpCheckedIn = (registration = null) => {
  if (!registration) return false;
  if (registration?.attendance_marked_at || registration?.rsvp_scanned_at) return true;

  const attendanceStatus = normalizeRsvpStatus(registration?.attendance_status);
  return ['marked', 'attended', 'present', 'checked in', 'checked-in', 'scanned', 'verified']
    .some((token) => attendanceStatus.includes(token));
};

const getDonationCardMeta = ({ submission = null, drive = null, logistics = null } = {}) => {
  const rawStatus = String(logistics?.shipment_status || submission?.status || '').trim();
  const normalized = rawStatus.toLowerCase();

  if (isClosedDonationStatus(rawStatus)) {
    return {
      label: normalized.includes('complete') ? 'Completed' : rawStatus || 'Closed',
      category: normalized.includes('complete') ? 'completed' : 'past',
      icon: 'check-circle-outline',
    };
  }

  if (submission?.submission_id) {
    if (
      normalized.includes('submitted')
      || normalized === 'cut'
      || normalized.includes('ready for shipping')
      || normalized.includes('in transit')
      || normalized.includes('received')
      || normalized.includes('under review')
    ) {
      return { label: 'Submitted', category: 'submitted', icon: 'upload-check-outline' };
    }

    return {
      label: rawStatus || 'Active Now',
      category: 'active',
      icon: 'content-cut',
    };
  }

  const driveState = getDriveTimeState(drive);
  if (driveState === 'past') return { label: 'Past', category: 'past', icon: 'calendar-remove-outline' };
  if (driveState === 'upcoming') return { label: 'Upcoming', category: 'active', icon: 'calendar-clock-outline' };
  return { label: 'Active Now', category: 'active', icon: 'calendar-check-outline' };
};

const getTimelineStageDescription = (stage = {}) => {
  if (stage?.savedNote) return stage.savedNote;

  switch (stage?.key) {
    case 'event_rsvp':
      return 'Your RSVP is approved for this donation drive.';
    case 'waybill_ready':
      return 'The waybill QR is prepared from the saved hair record. Use this paper or printed QR for the next scans.';
    case 'cut_and_ship':
    case 'cut_and_shipped':
      return 'The user has a hair ready to be delivered to the organization.';
    case 'sent_by_donor':
      return 'The donor sent the hair parcel with the printed waybill QR.';
    case 'received_by_company':
      return 'Hair for Hope received the donated hair and scanned the waybill.';
    case 'qa_assessment':
      return 'QA assessment decides whether the donated hair is approved or rejected.';
    case 'wig_production':
      return 'Approved hair by the staff is used in the wig production process.';
    case 'bundling':
      return 'Approved hair is ready to be grouped with other hair for bundling.';
    case 'wig_distribution_hospitals':
      return 'The completed wig is prepared for hospital distribution.';
    case 'distribution_to_patients':
      return 'The wig is distributed to patients.';
    case 'ready_for_shipment':
      return 'Your hair donation record and QR have been prepared for staff scanning.';
    case 'in_transit':
      return 'The donation is moving through the logistics process.';
    case 'received_by_organization':
      return 'The organization has received the hair donation.';
    case 'quality_checking':
      return 'The organization is reviewing the hair quality and donation details.';
    case 'ready_for_shipment_to_receiver':
      return 'The donation is ready for the receiver or wig production process.';
    case 'received_by_patient':
      return 'The donation journey has reached the recipient stage.';
    default:
      return 'Waiting for the next logistics update.';
  }
};

// â”€â”€â”€ Shared UI primitives â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionHeader({ eyebrow, title, body, roles }) {
  return (
    <View style={styles.sectionHeader}>
      {eyebrow ? (
        <Text style={[styles.sectionEyebrow, { color: roles.primaryActionBackground }]}>{eyebrow}</Text>
      ) : null}
      <SectionTitleRow
        title={title}
        icon="file-document-outline"
        color={roles.headingText}
        iconColor={roles.primaryActionBackground}
        accentColor={roles.primaryActionBackground}
        titleStyle={styles.sectionTitle}
      />
      {body ? <Text style={[styles.sectionBody, { color: roles.bodyText }]}>{body}</Text> : null}
    </View>
  );
}

function ModalShell({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
  scrollContent = false,
  cardBackground = theme.colors.backgroundPrimary,
}) {
  if (!visible) return null;
  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: cardBackground }]}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>{title}</Text>
              {subtitle ? <Text style={styles.modalSubtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} style={styles.modalCloseBtn}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>
          <View style={styles.modalBody}>
            {scrollContent ? (
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            ) : children}
          </View>
          {footer ? <View style={[styles.modalFooter, { backgroundColor: cardBackground }]}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

function ChoiceField({ label, value, options, onChange }) {
  return (
    <View style={styles.choiceField}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <View style={styles.choiceChipRow}>
        {options.map((opt) => {
          const active = value === opt.value;
          const disabled = Boolean(opt.disabled);
          return (
            <Pressable
              key={opt.value}
              disabled={disabled}
              onPress={() => {
                if (!disabled) onChange?.(opt.value);
              }}
              style={[
                styles.choiceChip,
                active ? styles.choiceChipActive : null,
                disabled ? styles.choiceChipDisabled : null,
              ]}
            >
              <Text style={[
                styles.choiceChipText,
                active ? styles.choiceChipTextActive : null,
                disabled ? styles.choiceChipTextDisabled : null,
              ]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ManualSection({ icon, title, body, children, roles }) {
  return (
    <View style={[styles.manualSectionCard, { backgroundColor: roles.pageBackground, borderColor: roles.defaultCardBorder }]}>
      <View style={styles.manualSectionHeader}>
        <View style={[styles.manualSectionIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
          <AppIcon name={icon} size="sm" color={roles.iconPrimaryColor} />
        </View>
        <View style={styles.manualSectionCopy}>
          <Text style={[styles.manualSectionTitle, { color: roles.headingText }]}>{title}</Text>
          {body ? <Text style={[styles.manualSectionBody, { color: roles.bodyText }]}>{body}</Text> : null}
        </View>
      </View>
      <View style={styles.manualSectionContent}>
        {children}
      </View>
    </View>
  );
}

// â”€â”€â”€ Profile pending â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ProfilePendingCard({ roles, completionMeta, onManageProfile }) {
  const missing = (completionMeta?.missingFieldLabels || []).slice(0, 3);
  const items = missing.length ? missing : ['Profile details'];

  return (
    <View style={styles.profileSetupGate}>
      <View style={[styles.profileSetupPanel, { backgroundColor: theme.colors.backgroundPrimary, borderColor: theme.colors.borderSubtle }]}>
        <View style={styles.profileSetupHero}>
          <View style={[styles.profileSetupIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
            <AppIcon name="editProfile" size="lg" color={roles.iconPrimaryColor} />
          </View>
          <View style={styles.profileSetupCopy}>
            <Text style={[styles.profileSetupEyebrow, { color: roles.primaryActionBackground }]}>Account setup</Text>
            <Text style={[styles.profileSetupTitle, { color: roles.headingText }]}>Complete your profile first</Text>
            <Text style={[styles.profileSetupBody, { color: roles.bodyText }]}>
              Finish the remaining donor details before you can start hair donation actions.
            </Text>
          </View>
        </View>

        <View style={styles.profileSetupChipsRow}>
          {items.map((label, i) => (
            <View key={`${label}-${i}`} style={[styles.profileSetupChip, { backgroundColor: theme.colors.surfaceSoft, borderColor: theme.colors.borderSubtle }]}>
              <View style={[styles.profileSetupChipDot, { backgroundColor: roles.primaryActionBackground }]} />
              <Text numberOfLines={1} style={[styles.profileSetupChipText, { color: roles.bodyText }]}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        <AppButton
          title="Open Profile"
          onPress={onManageProfile}
          leading={<AppIcon name="editProfile" size="sm" color={roles.primaryActionText} />}
          fullWidth
        />
      </View>
    </View>
  );
}

// â”€â”€â”€ Hair eligibility gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function HairEligibilityPromptModal({
  visible,
  roles,
  onClose,
  onStartHairCheck,
  title = 'Ready for your first check?',
  message = 'Start your hair health journey with a quick analysis of your hair\'s current condition.',
  actionTitle = 'Start First Hair Check',
  iconName = 'chart-line',
}) {
  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.hairEligibilityModalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.hairEligibilityModalCard, { backgroundColor: roles.pageBackground, borderColor: roles.defaultCardBorder }]}>
          <Pressable
            onPress={onClose}
            style={styles.hairEligibilityModalCloseBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Dismiss hair eligibility prompt"
          >
            <MaterialCommunityIcons name="close" size={22} color={roles.primaryActionBackground} />
          </Pressable>
          <View style={[styles.hairEligibilityModalIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
            <MaterialCommunityIcons name={iconName} size={34} color={roles.primaryActionBackground} />
          </View>
          <Text style={[styles.hairEligibilityModalTitle, { color: roles.headingText }]}>{title}</Text>
          <Text style={[styles.hairEligibilityModalMessage, { color: roles.bodyText }]}>{message}</Text>
          <GradientActionButton
            title={actionTitle}
            onPress={onStartHairCheck}
            fullWidth={false}
            textColor={roles.primaryActionText}
            style={styles.hairEligibilityModalAction}
            buttonStyle={styles.hairEligibilityModalActionButton}
            textStyle={styles.hairEligibilityModalActionText}
          />
        </View>
      </View>
    </Modal>
  );
}

// â”€â”€â”€ Active joined drive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const HairEligibilityGateCard = HairEligibilityPromptModal;

function DonationFilterDropdown({
  roles,
  label,
  value,
  options,
  onChange,
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const activeOption = options.find((option) => option.key === value) || options[0];

  const handleSelect = React.useCallback((nextValue) => {
    onChange?.(nextValue);
    setIsOpen(false);
  }, [onChange]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} filter. Current selection ${activeOption?.label || 'All'}`}
        onPress={() => setIsOpen(true)}
        style={({ pressed }) => [
          styles.donationEventFilterButton,
          {
            backgroundColor: roles.defaultCardBackground,
            borderColor: roles.defaultCardBorder,
          },
          pressed ? styles.cardPressed : null,
        ]}
      >
        <View style={styles.donationEventFilterCopy}>
          <Text style={[styles.donationEventFilterLabel, { color: roles.metaText }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[styles.donationEventFilterValue, { color: roles.headingText }]} numberOfLines={1}>
            {activeOption?.label || 'All'}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-down" size={18} color={roles.iconPrimaryColor} />
      </Pressable>

      <Modal
        transparent
        animationType="fade"
        visible={isOpen}
        onRequestClose={() => setIsOpen(false)}
      >
        <View style={styles.donationEventFilterModalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsOpen(false)} />
          <View style={[
            styles.donationEventFilterModalCard,
            {
              backgroundColor: roles.pageBackground,
              borderColor: roles.defaultCardBorder,
            },
          ]}>
            <Text style={[styles.donationEventFilterModalTitle, { color: roles.headingText }]}>
              {label}
            </Text>
            <View style={styles.donationEventFilterOptionList}>
              {options.map((option) => {
                const isSelected = option.key === value;
                return (
                  <Pressable
                    key={option.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => handleSelect(option.key)}
                    style={[
                      styles.donationEventFilterOption,
                      {
                        backgroundColor: isSelected ? roles.iconPrimarySurface : roles.defaultCardBackground,
                        borderColor: isSelected ? roles.primaryActionBackground : roles.defaultCardBorder,
                      },
                    ]}
                  >
                    <Text style={[
                      styles.donationEventFilterOptionText,
                      { color: isSelected ? roles.primaryActionBackground : roles.headingText },
                    ]}>
                      {option.label}
                    </Text>
                    {isSelected ? (
                      <MaterialCommunityIcons
                        name="check"
                        size={18}
                        color={roles.primaryActionBackground}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function DonationEventCard({ roles, drive, onOpenDetails }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const imageUrl = drive?.event_image_url || drive?.organization_logo_url || '';
  const visibilityLabel = isDonationDrivePublic(drive) ? 'PUBLIC' : 'PRIVATE';
  const driveDateLabel = getDriveDateLabel(drive);
  const locationLabel = getDriveLocationLabel(drive);

  React.useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const cardContent = (
    <View style={[styles.myDonationCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      <View style={styles.myDonationCardTop}>
        {imageUrl && !imageFailed ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.myDonationImage}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={[styles.myDonationImage, styles.myDonationImageFallback, { backgroundColor: roles.iconPrimarySurface }]}>
            <MaterialCommunityIcons name="calendar-heart" size={28} color={roles.iconPrimaryColor} />
          </View>
        )}

        <View style={styles.myDonationCardCopy}>
          <View style={styles.myDonationTitleRow}>
            <Text style={[styles.myDonationTitle, { color: roles.headingText }]} numberOfLines={2}>
              {drive?.event_title || 'Donation drive'}
            </Text>
            <View style={[styles.myDonationStatusBadge, { backgroundColor: roles.supportCardBackground }]}>
              <Text style={[styles.myDonationStatusText, { color: roles.bodyText }]} numberOfLines={1}>
                {visibilityLabel}
              </Text>
            </View>
          </View>
          <Text style={[styles.flowMetaText, { color: roles.bodyText }]} numberOfLines={1}>
            {drive?.organization_name || 'Community event'}
          </Text>
          <Text style={[styles.flowMetaText, { color: roles.metaText }]} numberOfLines={1}>
            {driveDateLabel}
          </Text>
        </View>
      </View>

      <View style={[styles.myDonationInfoBox, { backgroundColor: roles.supportCardBackground }]}>
        <View style={styles.myDonationInfoRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={18} color={roles.iconPrimaryColor} />
          <Text style={[styles.flowMetaText, { color: roles.bodyText }]} numberOfLines={2}>
            {locationLabel}
          </Text>
        </View>
        <View style={styles.myDonationInfoRow}>
          <MaterialCommunityIcons name="account-group-outline" size={18} color={roles.iconPrimaryColor} />
          <Text style={[styles.flowMetaText, { color: roles.bodyText }]} numberOfLines={2}>
            {isDonationDrivePublic(drive) ? 'Open to all donors' : 'Private event invite only'}
          </Text>
        </View>
      </View>
    </View>
  );

  if (!onOpenDetails) {
    return cardContent;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open event details for ${drive?.event_title || 'donation drive'}`}
      onPress={onOpenDetails}
      style={({ pressed }) => [pressed ? styles.cardPressed : null]}
    >
      {cardContent}
    </Pressable>
  );
}

function DonationHomeOverview({
  roles,
  completedDrives = [],
  onSubmitDriveDonation,
}) {
  const [eventSortOrder, setEventSortOrder] = React.useState('latest');
  const [eventVisibilityFilter, setEventVisibilityFilter] = React.useState('all');
  const visibleEventDrives = React.useMemo(() => {
    const seen = new Set();
    const completedHistoryDrives = (completedDrives || [])
      .filter(Boolean)
      .filter((drive) => getDriveTimeState(drive) === 'past')
      .filter((drive) => {
        const driveId = Number(drive?.donation_drive_id);
        const key = Number.isFinite(driveId) && driveId > 0
          ? `drive-${driveId}`
          : `${drive?.event_title || 'drive'}-${drive?.start_date || drive?.updated_at || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .filter((drive) => {
        const isPublic = isDonationDrivePublic(drive);
        if (eventVisibilityFilter === 'public') return isPublic;
        if (eventVisibilityFilter === 'private') return !isPublic;
        return true;
      });

    return sortDonationEventsByDate(completedHistoryDrives, eventSortOrder);
  }, [completedDrives, eventSortOrder, eventVisibilityFilter]);

  return (
    <View style={[styles.flowScreen, styles.donationEventBrowserScreen]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.donationEventBrowserContent}
      >
        <View style={styles.donationEventBrowserFilters}>
          <View style={styles.donationEventBrowserFilterCell}>
            <DonationFilterDropdown
              roles={roles}
              label="Sort"
              value={eventSortOrder}
              options={DONATION_EVENT_SORT_OPTIONS}
              onChange={setEventSortOrder}
            />
          </View>
          <View style={styles.donationEventBrowserFilterCell}>
            <DonationFilterDropdown
              roles={roles}
              label="Event type"
              value={eventVisibilityFilter}
              options={DONATION_EVENT_VISIBILITY_OPTIONS}
              onChange={setEventVisibilityFilter}
            />
          </View>
        </View>

        {visibleEventDrives.length ? (
          <View style={styles.flowCardList}>
            {visibleEventDrives.map((drive) => (
              <DonationEventCard
                key={`event-drive-${drive?.donation_drive_id || drive?.event_title || drive?.start_date}`}
                roles={roles}
                drive={drive}
                onOpenDetails={() => onSubmitDriveDonation?.(drive)}
              />
            ))}
          </View>
        ) : (
          <DonationEventsEmptyState
            title="No completed hair donation events."
            message="Only ended events where your hair donation was successfully completed appear here."
          />
        )}
      </ScrollView>
    </View>
  );
/*
  const [logisticsMapLoadFailed, setLogisticsMapLoadFailed] = React.useState(false);
  const [calendarMonth, setCalendarMonth] = React.useState(() => new Date());
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = React.useState(() => toDonationDateKey(new Date()));
  const donationCalendarEvents = React.useMemo(() => {
    const seen = new Set();
    return [
      ...(joinedDrives || []),
      ...(drives || []),
    ]
      .filter((drive) => drive?.start_date)
      .filter((drive) => {
        const key = drive?.donation_drive_id || `${drive?.event_title || 'drive'}-${drive?.start_date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => new Date(left.start_date || 0) - new Date(right.start_date || 0));
  }, [drives, joinedDrives]);
  const calendarEventDateKeys = React.useMemo(
    () => new Set(donationCalendarEvents.map((drive) => toDonationDateKey(drive.start_date)).filter(Boolean)),
    [donationCalendarEvents]
  );
  const donationMonthCells = React.useMemo(
    () => buildDonationMonthCells(calendarMonth, calendarEventDateKeys, selectedCalendarDateKey),
    [calendarEventDateKeys, calendarMonth, selectedCalendarDateKey]
  );
  const donationMonthRows = React.useMemo(() => {
    const rows = [];
    for (let index = 0; index < donationMonthCells.length; index += 7) {
      rows.push(donationMonthCells.slice(index, index + 7));
    }
    return rows;
  }, [donationMonthCells]);
  const selectedDayEvents = React.useMemo(() => (
    donationCalendarEvents.filter((drive) => toDonationDateKey(drive.start_date) === selectedCalendarDateKey)
  ), [donationCalendarEvents, selectedCalendarDateKey]);
  const selectedMonthEvents = React.useMemo(() => (
    donationCalendarEvents.filter((drive) => {
      const date = new Date(drive.start_date || 0);
      return !Number.isNaN(date.getTime())
        && date.getFullYear() === calendarMonth.getFullYear()
        && date.getMonth() === calendarMonth.getMonth();
    })
  ), [calendarMonth, donationCalendarEvents]);
  const visibleCalendarEvents = selectedDayEvents.length ? selectedDayEvents : selectedMonthEvents.slice(0, 4);
  const selectedCalendarLabel = selectedCalendarDateKey
    ? formatDateLabel(`${selectedCalendarDateKey}T00:00:00`)
    : getDonationMonthLabel(calendarMonth);
  const hasScreening = Boolean(latestScreening);
  const bannerTitle = isEligible
    ? "You're Eligible to Donate!"
    : 'Donation status';
  const bannerStatus = isEligible ? 'Ready' : hasScreening ? 'Needs care' : 'No scan';
  const upcomingTitle = displayDrive?.event_title || (hasOngoingDonation ? 'Independent hair donation' : 'No upcoming donation yet');
  const upcomingBody = displayDrive
    ? getDriveDateLabel(displayDrive)
    : hasOngoingDonation
      ? hasGeneratedDonationQr
        ? 'QR generated. Attach it to the matching parcel or hair bundle.'
        : 'Review the saved hair details, then submit to generate its QR.'
      : isEligible
        ? 'Choose a drive or start an independent donation.'
        : 'Your donation status will update after a valid hair scan.';
  const shippingFeeNote = getShippingFeeNote();
  const logisticsAddressRows = React.useMemo(() => getLogisticsSummaryRows(logisticsSettings), [logisticsSettings]);
  const logisticsMapPreviewUrl = React.useMemo(() => buildStaticMapPreviewUrl(logisticsSettings), [logisticsSettings]);
  const donationStatusTitle = hasOngoingDonation
    ? 'Donation status'
    : hasGeneratedDonationQr
      ? 'Donation status'
      : 'Donation status';
  const donationStatusBody = hasOngoingDonation
    ? (upcomingBody || 'Your donation is in progress.')
    : hasGeneratedDonationQr
      ? 'Your donation QR is ready. Attach it to the parcel or hair bundle before sending the shipment.'
      : isEligible
        ? 'You are eligible to start a logistics donation. Review the send-off details below before shipping.'
        : 'Your donation status will appear after a valid hair scan.';
  const donationStatusButtonTitle = hasOngoingDonation
    ? 'View Timeline'
    : hasGeneratedDonationQr
      ? 'View Timeline'
    : isEligible
      ? 'Add Logistic Donation'
      : 'Start Hair Check';
  const donationStatusButtonAction = (hasOngoingDonation || hasGeneratedDonationQr)
    ? onSubmitDonation
    : isEligible
      ? (onAddLogisticDonation || onAddHair || onCheckHair)
      : onCheckHair;

  React.useEffect(() => {
    setLogisticsMapLoadFailed(false);
  }, [logisticsMapPreviewUrl]);

  return (
    <View style={styles.donationHome}>
      {isEligible ? (
        <View style={[styles.eligibleBanner, { backgroundColor: roles.primaryActionBackground }]}>
          <View style={styles.eligibleBannerHeader}>
            <View style={[styles.eligibleBannerIcon, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={24}
                color={roles.primaryActionText}
              />
            </View>
            <Text style={[styles.eligibleBannerTitle, { color: roles.primaryActionText }]}>
              {bannerTitle}
            </Text>
          </View>
          <View style={[styles.eligibleStatsCard, { borderColor: 'rgba(255,255,255,0.22)' }]}>
            <View style={styles.eligibleStat}>
              <Text style={[styles.eligibleStatLabel, { color: 'rgba(255,255,255,0.78)' }]}>CURRENT LENGTH</Text>
              <Text style={[styles.eligibleStatValue, { color: roles.primaryActionText }]}>
                {formatScreeningLengthInches(latestScreening)}
              </Text>
            </View>
            <View style={[styles.eligibleDivider, { backgroundColor: 'rgba(255,255,255,0.25)' }]} />
            <View style={[styles.eligibleStat, styles.eligibleStatCenter]}>
              <Text style={[styles.eligibleStatLabel, { color: 'rgba(255,255,255,0.78)' }]}>HAIR TYPE</Text>
              <Text style={[styles.eligibleStatValue, { color: roles.primaryActionText }]} numberOfLines={1}>
                {latestScreening?.detected_texture || 'N/A'}
              </Text>
            </View>
            <View style={[styles.eligibleDivider, { backgroundColor: 'rgba(255,255,255,0.25)' }]} />
            <View style={[styles.eligibleStat, styles.eligibleStatEnd]}>
              <Text style={[styles.eligibleStatLabel, { color: 'rgba(255,255,255,0.78)' }]}>STATUS</Text>
              <Text style={[styles.eligibleStatValue, { color: roles.primaryActionText }]} numberOfLines={1}>
                {bannerStatus}
              </Text>
            </View>
          </View>
          {!hasScreening ? (
            <AppButton title="Start Hair Check" variant="secondary" fullWidth={false} onPress={onCheckHair} />
          ) : null}
        </View>
      ) : (
        <View style={[styles.eligibleBanner, { backgroundColor: roles.supportCardBackground }]}>
          <View style={styles.activeDonationSummaryHeader}>
            <View style={[styles.upcomingDonationIcon, { backgroundColor: roles.iconPrimarySurface }]}>
              <MaterialCommunityIcons name="hair-dryer-outline" size={24} color={roles.iconPrimaryColor} />
            </View>
            <View style={styles.upcomingDonationCopy}>
              <Text style={[styles.upcomingDonationTitle, { color: roles.headingText }]} numberOfLines={1}>
                Donation status
              </Text>
              <Text style={[styles.upcomingDonationBody, { color: roles.bodyText }]}>
                Your donation status will appear after a valid hair scan.
              </Text>
            </View>
          </View>
          <View style={styles.activeDonationSummaryActions}>
            <AppButton title="Start Hair Check" onPress={onCheckHair} />
          </View>
        </View>
      )}

      {(isEligible || hasOngoingDonation || hasGeneratedDonationQr) ? (
      <View style={[
        {
          borderWidth: 1,
          borderRadius: 14,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          ...theme.shadows.soft,
        },
        { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder },
      ]}>
        <View style={styles.activeDonationSummaryHeader}>
          <View style={[styles.upcomingDonationIcon, { backgroundColor: roles.iconPrimarySurface }]}>
            <MaterialCommunityIcons
              name={hasOngoingDonation ? 'truck-delivery-outline' : hasGeneratedDonationQr ? 'qrcode' : 'shield-check-outline'}
              size={24}
              color={roles.iconPrimaryColor}
            />
          </View>
          <View style={styles.upcomingDonationCopy}>
            <Text style={[styles.upcomingDonationTitle, { color: roles.headingText }]} numberOfLines={1}>
              {donationStatusTitle}
            </Text>
            <Text style={[styles.upcomingDonationBody, { color: roles.bodyText }]}>
              {donationStatusBody}
            </Text>
          </View>
        </View>
        <View style={styles.activeDonationSummaryActions}>
          <AppButton
            title={donationStatusButtonTitle}
            onPress={donationStatusButtonAction}
            disabled={isSubmittingDonation && hasOngoingDonation}
            loading={isSubmittingDonation && hasOngoingDonation}
          />
          {hasOngoingDonation ? (
            <AppButton
              title="Add Another Hair"
              variant="outline"
              onPress={onAddHair}
              disabled={isSubmittingDonation}
            />
          ) : null}
        </View>
      </View>
      ) : null}

      <View style={[
        {
          borderWidth: 1,
          borderRadius: 14,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          ...theme.shadows.soft,
        },
        { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder },
      ]}>
        <View style={styles.activeDonationSummaryHeader}>
          <View style={[styles.upcomingDonationIcon, { backgroundColor: roles.iconPrimarySurface }]}>
            <MaterialCommunityIcons name="map-marker-radius-outline" size={24} color={roles.iconPrimaryColor} />
          </View>
          <View style={styles.upcomingDonationCopy}>
            <Text style={[styles.upcomingDonationTitle, { color: roles.headingText }]} numberOfLines={1}>
              Send-off location
            </Text>
            <Text style={[styles.upcomingDonationBody, { color: roles.bodyText }]}>
              {shippingFeeNote}
            </Text>
          </View>
        </View>
        {logisticsMapPreviewUrl && !logisticsMapLoadFailed ? (
          <View style={[
            styles.eventMapFrame,
            { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder },
          ]}>
            <Image
              source={{ uri: logisticsMapPreviewUrl }}
              style={styles.eventMapImage}
              resizeMode="cover"
              onError={() => setLogisticsMapLoadFailed(true)}
            />
          </View>
        ) : (
          <View style={[
            styles.eventMapFrame,
            { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder },
          ]}>
            <View style={styles.eventMapFallback}>
              <MaterialCommunityIcons name="map-marker-radius-outline" size={28} color={roles.iconPrimaryColor} />
              <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>
                {logisticsMapPreviewUrl
                  ? 'Map preview could not load right now.'
                  : 'Map coordinates are not available yet.'}
              </Text>
            </View>
          </View>
        )}
        {logisticsAddressRows.length ? (
          <View style={styles.logisticsTable}>
            {logisticsAddressRows.map((row) => (
              <View key={`${row.label}-${row.value}`} style={[styles.logisticsTableRow, { borderColor: roles.defaultCardBorder }]}>
                <Text style={[styles.logisticsTableLabel, { color: roles.metaText }]}>{row.label}</Text>
                <Text style={[styles.logisticsTableValue, { color: roles.headingText }]}>{row.value}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>
            The send-off address will appear here once logistics settings are available.
          </Text>
        )}
        <AppButton
          title={isEligible ? 'Add Logistic Donation' : 'Start Hair Check'}
          onPress={onAddLogisticDonation || onCheckHair}
          disabled={isSubmittingDonation}
        />
      </View>

      <View style={styles.section}>
      <SectionTitleRow
        title={hasOngoingDonation ? 'Donation in progress' : 'Donation Calendar'}
        icon="file-document-outline"
        color={roles.headingText}
        iconColor={roles.primaryActionBackground}
        accentColor={roles.primaryActionBackground}
        titleStyle={styles.sectionTitle}
      />
        {!hasOngoingDonation ? (
          <View style={[styles.donationCalendarCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            <View style={styles.donationCalendarHeader}>
              <Pressable
                onPress={() => setCalendarMonth((previous) => {
                  const nextMonth = new Date(previous.getFullYear(), previous.getMonth() - 1, 1);
                  setSelectedCalendarDateKey(toDonationDateKey(nextMonth));
                  return nextMonth;
                })}
                style={[styles.donationCalendarNavButton, { backgroundColor: roles.supportCardBackground }]}
              >
                <MaterialCommunityIcons name="chevron-left" size={22} color={roles.headingText} />
              </Pressable>
              <View style={styles.donationCalendarHeaderCopy}>
                <Text style={[styles.donationCalendarMonth, { color: roles.headingText }]}>
                  {getDonationMonthLabel(calendarMonth)}
                </Text>
                <Text style={[styles.donationCalendarSubtitle, { color: roles.metaText }]}>
                  {selectedDayEvents.length
                    ? `${selectedDayEvents.length} drive${selectedDayEvents.length === 1 ? '' : 's'} on ${selectedCalendarLabel}`
                    : `${selectedMonthEvents.length} drive${selectedMonthEvents.length === 1 ? '' : 's'} this month`}
                </Text>
              </View>
              <Pressable
                onPress={() => setCalendarMonth((previous) => {
                  const nextMonth = new Date(previous.getFullYear(), previous.getMonth() + 1, 1);
                  setSelectedCalendarDateKey(toDonationDateKey(nextMonth));
                  return nextMonth;
                })}
                style={[styles.donationCalendarNavButton, { backgroundColor: roles.supportCardBackground }]}
              >
                <MaterialCommunityIcons name="chevron-right" size={22} color={roles.headingText} />
              </Pressable>
            </View>

            <View style={styles.donationWeekdayRow}>
              {DONATION_WEEKDAY_LABELS.map((label) => (
                <Text key={`donation-weekday-${label}`} style={[styles.donationWeekdayText, { color: roles.metaText }]}>
                  {label}
                </Text>
              ))}
            </View>
            <View style={styles.donationCalendarGrid}>
              {donationMonthRows.map((row, rowIndex) => (
                <View key={`donation-month-row-${rowIndex}`} style={styles.donationCalendarRow}>
                  {row.map((cell) => (
                    <Pressable
                      key={cell.key}
                      onPress={() => {
                        setSelectedCalendarDateKey(cell.key);
                        if (!cell.isCurrentMonth) {
                          setCalendarMonth(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1));
                        }
                      }}
                      style={[
                        styles.donationCalendarDay,
                        { borderColor: cell.isSelected ? roles.primaryActionBackground : roles.defaultCardBorder },
                        cell.isSelected ? { backgroundColor: roles.primaryActionBackground } : { backgroundColor: roles.supportCardBackground },
                        !cell.isCurrentMonth ? styles.donationCalendarDayMuted : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.donationCalendarDayText,
                          { color: cell.isSelected ? roles.primaryActionText : roles.headingText },
                          !cell.isCurrentMonth && !cell.isSelected ? { color: roles.metaText } : null,
                        ]}
                      >
                        {cell.day}
                      </Text>
                      {cell.hasEvent ? (
                        <View
                          style={[
                            styles.donationCalendarDot,
                            { backgroundColor: cell.isSelected ? roles.primaryActionText : roles.primaryActionBackground },
                          ]}
                        />
                      ) : cell.isToday ? (
                        <View style={[styles.donationCalendarTodayDot, { borderColor: roles.primaryActionBackground }]} />
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>

            <View style={styles.donationCalendarEvents}>
              <Text style={[styles.donationCalendarEventsTitle, { color: roles.headingText }]}>
                {selectedDayEvents.length ? selectedCalendarLabel : 'This month'}
              </Text>
              {visibleCalendarEvents.length ? (
                visibleCalendarEvents.map((drive) => (
                  <View
                    key={`calendar-drive-${drive?.donation_drive_id || drive?.event_title || drive?.start_date}`}
                    style={[styles.upcomingDonationCard, styles.donationCalendarEventCard, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}
                  >
                    <View style={[styles.upcomingDonationIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                      <MaterialCommunityIcons name="calendar-check-outline" size={24} color={roles.iconPrimaryColor} />
                    </View>
                    <View style={styles.upcomingDonationCopy}>
                      <Text style={[styles.upcomingDonationTitle, { color: roles.headingText }]} numberOfLines={2}>
                        {drive?.event_title || 'Donation drive'}
                      </Text>
                      <Text style={[styles.upcomingDonationBody, { color: roles.bodyText }]} numberOfLines={2}>
                        {getDriveDateLabel(drive)}
                      </Text>
                    </View>
                    <View style={styles.upcomingDonationActions}>
                      <AppButton
                        title={drive?.registration ? 'Open' : 'View'}
                        fullWidth={false}
                        size="sm"
                        style={styles.upcomingActionButton}
                        onPress={() => onSubmitDriveDonation?.(drive)}
                        disabled={isSubmittingDonation}
                      />
                    </View>
                  </View>
                ))
              ) : (
                <View style={[styles.emptyDonationCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
                  <AppIcon name="donations" size="lg" color={roles.metaText} />
                  <Text style={[styles.emptyDonationText, { color: roles.bodyText }]}>No donation drives for this month.</Text>
                </View>
              )}
              {!selectedDayEvents.length && selectedMonthEvents.length ? (
                <Text style={[styles.donationCalendarHint, { color: roles.metaText }]}>
                  Select a marked date to view that day only.
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {hasOngoingDonation ? (
          <View style={styles.activeDonationSummary}>
            <View style={styles.activeDonationSummaryHeader}>
              <View style={[styles.upcomingDonationIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                <MaterialCommunityIcons name="content-cut" size={24} color={roles.iconPrimaryColor} />
              </View>
              <View style={styles.upcomingDonationCopy}>
                <Text style={[styles.upcomingDonationTitle, { color: roles.headingText }]} numberOfLines={2}>
                  {upcomingTitle}
                </Text>
                <Text style={[styles.upcomingDonationBody, { color: roles.bodyText }]} numberOfLines={3}>
                  {upcomingBody}
                </Text>
              </View>
            </View>

            <View style={styles.activeDonationSummaryActions}>
              <AppButton
                title={isSubmittingDonation ? 'Opening preview...' : 'View Timeline'}
                fullWidth
                size="sm"
                onPress={onSubmitDonation}
                loading={isSubmittingDonation}
                disabled={isSubmittingDonation}
              />
              <AppButton
                title="Add Another Hair"
                variant="outline"
                fullWidth
                size="sm"
                onPress={onAddHair}
                disabled={isSubmittingDonation}
              />
              {canCancelOngoingDonation ? (
                <AppButton
                  title="Cancel Submission"
                  variant="danger"
                  fullWidth
                  size="sm"
                  onPress={onCancelDonation}
                  disabled={isSubmittingDonation}
                />
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
*/

}
function JoinedDriveCard({ roles, drive }) {
  if (!drive?.registration) return null;

  const reg = drive.registration;
  const rsvpStatus = reg.attendance_status || reg.registration_status || 'Registered';
  const isApproved = ['approved', 'going', 'confirmed', 'accepted'].includes(
    String(rsvpStatus).toLowerCase()
  );

  return (
    <View style={[styles.card, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      <View style={styles.driveCardTop}>
        {drive.event_image_url || drive.organization_logo_url ? (
          <Image
            source={{ uri: drive.event_image_url || drive.organization_logo_url }}
            style={styles.driveLogo}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.driveLogo, styles.driveLogoFallback, { backgroundColor: roles.iconPrimarySurface }]}>
            <AppIcon name="organization" size="sm" color={roles.iconPrimaryColor} />
          </View>
        )}
        <View style={styles.driveMeta}>
          <Text style={[styles.driveTitle, { color: roles.headingText }]} numberOfLines={1}>
            {drive.event_title || 'Donation drive'}
          </Text>
          <Text style={[styles.driveOrg, { color: roles.bodyText }]} numberOfLines={1}>
            {drive.organization_name || 'Organization'}
          </Text>
          {drive.start_date ? (
            <Text style={[styles.driveMeta2, { color: roles.metaText }]}>
              {formatDateLabel(drive.start_date)}{drive.end_date ? ` â€“ ${formatDateLabel(drive.end_date)}` : ''}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.driveRsvpRow}>
        <Text style={[styles.driveRsvpLabel, { color: roles.metaText }]}>RSVP status</Text>
        <View style={[
          styles.rsvpBadge,
          { backgroundColor: isApproved ? roles.primaryActionBackground : roles.supportCardBackground },
        ]}>
          <Text style={[
            styles.rsvpBadgeText,
            { color: isApproved ? roles.primaryActionText : roles.bodyText },
          ]}>
            {rsvpStatus}
          </Text>
        </View>
      </View>
    </View>
  );
}

// â”€â”€â”€ Hair log card (AI path) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

void JoinedDriveCard;
void HairLogCard;

function HairLogCard({
  roles,
  screening,
  isEligible,
  screeningLabel,
  ineligibilityReason = '',
  onProceed,
  isLoading,
}) {
  const lengthCm = Number(screening?.estimated_length);
  const lengthIn = lengthCm > 0 ? (lengthCm / 2.54).toFixed(1) : null;
  const decisionText = buildDonationDecisionText({ screening, isEligible, ineligibilityReason });

  return (
    <View style={[styles.pathCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      <View style={styles.pathCardTop}>
        <View style={[styles.pathIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
          <AppIcon name="checkHair" color={roles.iconPrimaryColor} />
        </View>
        <View style={styles.pathCardCopy}>
          <Text style={[styles.pathCardTitle, { color: roles.headingText }]}>Use recent hair log</Text>
          <Text style={[styles.pathCardBody, { color: roles.bodyText }]}>
            Donate using your last hair analysis result; no extra input needed.
          </Text>
        </View>
        <View style={[
          styles.eligibilityBadge,
          { backgroundColor: isEligible ? roles.primaryActionBackground : roles.supportCardBackground },
        ]}>
          <Text style={[
            styles.eligibilityBadgeText,
            { color: isEligible ? roles.primaryActionText : roles.bodyText },
          ]}>
            {isEligible ? 'Eligible' : 'Not eligible'}
          </Text>
        </View>
      </View>

      <View style={styles.hairLogGrid}>
        <View style={[styles.hairLogTile, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.hairLogTileLabel, { color: roles.metaText }]}>Length</Text>
          <Text style={[styles.hairLogTileValue, { color: roles.headingText }]}>
            {lengthIn ? `${lengthIn} inches` : 'â€”'}
          </Text>
        </View>
        <View style={[styles.hairLogTile, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.hairLogTileLabel, { color: roles.metaText }]}>Condition</Text>
          <Text style={[styles.hairLogTileValue, { color: roles.headingText }]}>
            {screening?.detected_condition || 'â€”'}
          </Text>
        </View>
        <View style={[styles.hairLogTile, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.hairLogTileLabel, { color: roles.metaText }]}>Decision</Text>
          <Text style={[styles.hairLogTileValue, { color: roles.headingText }]} numberOfLines={3}>
            {decisionText || 'â€”'}
          </Text>
        </View>
        <View style={[styles.hairLogTile, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.hairLogTileLabel, { color: roles.metaText }]}>Analyzed</Text>
          <Text style={[styles.hairLogTileValue, { color: roles.headingText }]}>
            {screeningLabel || 'â€”'}
          </Text>
        </View>
      </View>

      {isEligible ? (
        <AppButton
          title={isLoading ? 'Saving...' : 'Add hair to donate'}
          onPress={onProceed}
          loading={isLoading}
          fullWidth
        />
      ) : (
        <Text style={[styles.ineligibleNote, { color: roles.metaText }]}>
          {decisionText}
        </Text>
      )}
    </View>
  );
}

// â”€â”€â”€ Manual input path card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ManualInputCard({ roles, onOpen }) {
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.pathCard, styles.pathCardPressable, { opacity: pressed ? 0.84 : 1, borderColor: roles.defaultCardBorder }]}>
      <View style={styles.pathCardTop}>
        <View style={[styles.pathIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
          <AppIcon name="editProfile" color={roles.iconPrimaryColor} />
        </View>
        <View style={styles.pathCardCopy}>
          <Text style={[styles.pathCardTitle, { color: roles.headingText }]}>Enter hair details manually</Text>
          <Text style={[styles.pathCardBody, { color: roles.bodyText }]}>
            Input hair length and condition manually, then upload a clear photo.
          </Text>
        </View>
        <AppIcon name="chevronRight" size="sm" color={roles.metaText} />
      </View>
    </Pressable>
  );
}

// â”€â”€â”€ Manual entry modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ManualEntryModal({
  visible, form, errors, photo, feedback, isSaving, aiPrefilled,
  isEditing = false,
  onClose, onChangeField, onPickPhoto, onSave,
}) {
  const { resolvedTheme } = useAuth();
  const { width } = useWindowDimensions();
  const isMobileViewport = width < 768;
  const roles = resolveThemeRoles(resolvedTheme, { isMobile: isMobileViewport });
  const isOtherPersonHair = form.donorType === 'different';

  return (
    <ModalShell
      visible={visible}
      title={isEditing ? 'Edit hair details' : 'Add hair to donate'}
      subtitle={isEditing
        ? 'Update the saved hair detail before generating the final QR.'
        : 'Add hair under this account. Use this for your own hair or hair from someone without an account.'}
      onClose={onClose}
      cardBackground={roles.defaultCardBackground}
      scrollContent
      footer={(
        <View style={styles.modalFooterActions}>
          <View style={styles.modalFooterActionHalf}>
            <AppButton title="Cancel" variant="outline" onPress={onClose} />
          </View>
          <View style={styles.modalFooterActionHalf}>
            <AppButton title={isSaving ? 'Saving...' : (isEditing ? 'Update hair' : 'Save hair')} onPress={onSave} loading={isSaving} />
          </View>
        </View>
      )}
    >
      {aiPrefilled ? (
        <StatusBanner
          message={isOtherPersonHair
            ? 'Recent AI screening is used only to pre-fill this donation form. It will not create a CheckHair log for this donor.'
            : 'Hair length pre-filled from your recent AI screening. Adjust if needed.'}
          variant="info"
          style={styles.bannerSpacing}
        />
      ) : null}
      {feedback?.message ? (
        <StatusBanner message={feedback.message} variant={feedback.variant} style={styles.bannerSpacing} />
      ) : null}

      <ManualSection
        icon="account-circle-outline"
        title="Hair owner"
        body="Choose whether this hair is yours or from another person using your account."
        roles={roles}
      >
        <ChoiceField
          label="Donor type"
          value={form.donorType}
          options={[
            { label: 'My hair', value: 'own' },
            { label: 'Other person', value: 'different' },
          ]}
          onChange={(v) => onChangeField('donorType', v)}
        />
        {errors.donorType ? <Text style={styles.inputError}>{errors.donorType}</Text> : null}
        {isOtherPersonHair ? (
          <View style={styles.donorIdentityFields}>
            <AppInput
              label="Hair owner name/label"
              required
              value={form.donorName}
              onChangeText={(v) => onChangeField('donorName', v)}
              placeholder="Example: Sister"
              error={errors.donorName}
              helperText="Use the name of the person who owns this hair."
            />
            <AppInput
              label="Relationship to submitter"
              required
              value={form.relationshipToSubmitter}
              onChangeText={(v) => onChangeField('relationshipToSubmitter', v)}
              placeholder="Example: Sister, parent, friend"
              error={errors.relationshipToSubmitter}
              helperText="Required when submitting another person's hair."
            />
            <Pressable
              onPress={() => onChangeField('consentConfirmed', !form.consentConfirmed)}
              style={[styles.consentRow, { borderColor: errors.consentConfirmed ? roles.errorText : roles.defaultCardBorder }]}
            >
              <MaterialCommunityIcons
                name={form.consentConfirmed ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={22}
                color={form.consentConfirmed ? roles.iconPrimaryColor : roles.metaText}
              />
              <Text style={[styles.consentText, { color: roles.bodyText }]}>
                I confirm that I have permission from this person to submit their hair donation and process the hair details/images if needed.
              </Text>
            </Pressable>
            {errors.consentConfirmed ? <Text style={styles.inputError}>{errors.consentConfirmed}</Text> : null}
          </View>
        ) : null}
      </ManualSection>

      <ManualSection
        icon="donations"
        title="Hair measurements"
        body="Enter your current hair length."
        roles={roles}
      >
        <AppInput
          label="Hair length"
          required
          value={form.lengthValue}
          onChangeText={(v) => onChangeField('lengthValue', v.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="14"
          error={errors.lengthValue}
          helperText="Minimum required is 14 inches"
        />
        <ChoiceField
          label="Unit"
          value={form.lengthUnit}
          options={LENGTH_UNIT_OPTIONS}
          onChange={(v) => onChangeField('lengthUnit', v)}
        />

      </ManualSection>

      <ManualSection
        icon="checkHair"
        title="Hair profile"
        body="Set treatment and visible hair attributes."
        roles={roles}
      >
        <View style={styles.manualChoiceGrid}>
          <ChoiceField label="Treated" value={form.treated} options={YES_NO_OPTIONS} onChange={(v) => onChangeField('treated', v)} />
          <ChoiceField label="Colored" value={form.colored} options={YES_NO_OPTIONS} onChange={(v) => onChangeField('colored', v)} />
          <ChoiceField label="Trimmed" value={form.trimmed} options={YES_NO_OPTIONS} onChange={(v) => onChangeField('trimmed', v)} />
        </View>

        <View style={styles.manualChoiceGrid}>
          <ChoiceField label="Hair color" value={form.hairColor} options={HAIR_COLOR_OPTIONS} onChange={(v) => onChangeField('hairColor', v)} />
          <ChoiceField label="Density" value={form.density} options={MANUAL_DENSITY_OPTIONS} onChange={(v) => onChangeField('density', v)} />
        </View>
      </ManualSection>

      <ManualSection
        icon="camera"
        title="Reference photo"
        body={isEditing
          ? 'Upload a new clear photo only if the existing reference needs to be changed.'
          : 'Upload one clear photo with your hair fully visible.'}
        roles={roles}
      >
        {photo?.uri ? (
          <Image source={{ uri: photo.uri }} style={[styles.photoPreview, { backgroundColor: roles.defaultCardBackground }]} resizeMode="cover" />
        ) : (
          <View style={[styles.photoPlaceholder, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            <AppIcon name="camera" size="md" state="muted" />
            <Text style={styles.photoPlaceholderText}>No photo selected</Text>
          </View>
        )}
        <View style={styles.rowActions}>
          <AppButton title="Gallery" variant="outline" fullWidth={false} onPress={() => onPickPhoto('library')} />
          <AppButton title="Camera" fullWidth={false} onPress={() => onPickPhoto('camera')} />
        </View>
        {errors.photo ? <Text style={styles.inputError}>{errors.photo}</Text> : null}
      </ManualSection>
    </ModalShell>
  );
}

function AddBundleModal({
  visible,
  bundleForm,
  bundleErrors,
  bundlePhoto,
  bundleFeedback,
  isSaving,
  onClose,
  onChangeField,
  onPickPhoto,
  onOpenScanner,
  onAttachLatestScan,
  onSave,
}) {
  const { resolvedTheme } = useAuth();
  const { width } = useWindowDimensions();
  const isMobileViewport = width < 768;
  const roles = resolveThemeRoles(resolvedTheme, { isMobile: isMobileViewport });
  const isDifferentDonor = bundleForm.donorType === 'different';
  const isManual = bundleForm.inputMethod === 'manual';

  return (
    <ModalShell
      visible={visible}
      title="Add another bundle"
      subtitle="Choose whose hair this bundle belongs to before adding it."
      onClose={onClose}
      cardBackground={roles.defaultCardBackground}
      scrollContent
      footer={(
        <View style={styles.modalFooterActions}>
          <View style={styles.modalFooterActionHalf}>
            <AppButton title="Cancel" variant="outline" onPress={onClose} disabled={isSaving} />
          </View>
          <View style={styles.modalFooterActionHalf}>
            <AppButton title={isSaving ? 'Savingâ€¦' : 'Save bundle'} onPress={onSave} loading={isSaving} disabled={isSaving} />
          </View>
        </View>
      )}
    >
      {bundleFeedback?.message ? (
        <StatusBanner message={bundleFeedback.message} variant={bundleFeedback.variant} style={styles.bannerSpacing} />
      ) : null}

      <ManualSection
        icon="account-circle-outline"
        title="Whose hair is this?"
        body="This decides how the bundle is validated and logged."
        roles={roles}
      >
        <ChoiceField
          label="Donor type"
          value={bundleForm.donorType}
          options={[
            { label: 'My hair', value: 'own' },
            { label: 'Different donor', value: 'different' },
          ]}
          onChange={(value) => onChangeField('donorType', value)}
        />
      </ManualSection>

      {isDifferentDonor ? (
        <ManualSection
          icon="radar"
          title="How will you add this bundle?"
          body="For different-donor hair, use scan or manual details."
          roles={roles}
        >
          <View style={styles.donorIdentityFields}>
            <AppInput
              label="Hair owner name/label"
              required
              value={bundleForm.donorName}
              onChangeText={(v) => onChangeField('donorName', v)}
              placeholder="Example: Sister"
              error={bundleErrors.donorName}
              helperText="This name will appear on the matching QR."
            />
            <AppInput
              label="Relationship to submitter"
              required
              value={bundleForm.relationshipToSubmitter}
              onChangeText={(v) => onChangeField('relationshipToSubmitter', v)}
              placeholder="Example: Sister, parent, friend"
              error={bundleErrors.relationshipToSubmitter}
              helperText="Required when submitting another person's hair."
            />
            <Pressable
              onPress={() => onChangeField('consentConfirmed', !bundleForm.consentConfirmed)}
              style={[styles.consentRow, { borderColor: bundleErrors.consentConfirmed ? roles.errorText : roles.defaultCardBorder }]}
            >
              <MaterialCommunityIcons
                name={bundleForm.consentConfirmed ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={22}
                color={bundleForm.consentConfirmed ? roles.iconPrimaryColor : roles.metaText}
              />
              <Text style={[styles.consentText, { color: roles.bodyText }]}>
                I confirm that I have permission from this person to submit their hair donation and process the hair details/images if needed.
              </Text>
            </Pressable>
            {bundleErrors.consentConfirmed ? <Text style={styles.inputError}>{bundleErrors.consentConfirmed}</Text> : null}
          </View>
          <ChoiceField
            label="Entry method"
            value={bundleForm.inputMethod}
            options={[
              { label: 'Scan donor hair', value: 'scan' },
              { label: 'Manual details', value: 'manual' },
            ]}
            onChange={(value) => onChangeField('inputMethod', value)}
          />

          {bundleForm.inputMethod === 'scan' ? (
            <View style={styles.bundleScanActions}>
              <AppButton title="Open CheckHair scanner" variant="outline" fullWidth={false} onPress={onOpenScanner} />
              <AppButton title="Attach latest scanned result" fullWidth={false} onPress={onAttachLatestScan} />
            </View>
          ) : null}
        </ManualSection>
      ) : (
        <ManualSection
          icon="checkHair"
          title="Use your latest hair log"
          body="Tap Save bundle to attach your latest saved scan result as an additional own-hair bundle."
          roles={roles}
        />
      )}

      {(isDifferentDonor && isManual) ? (
        <ManualSection
          icon="donations"
          title="Bundle details"
          body="Enter the details for this additional bundle."
          roles={roles}
        >
          <View style={styles.formRow}>
            <View style={styles.formRowFlex}>
              <AppInput
                label="Hair length"
                required
                value={bundleForm.lengthValue}
                onChangeText={(v) => onChangeField('lengthValue', v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="14"
                error={bundleErrors.lengthValue}
              />
            </View>
            <View style={styles.formRowUnit}>
              <ChoiceField
                label="Unit"
                value={bundleForm.lengthUnit}
                options={LENGTH_UNIT_OPTIONS}
                onChange={(value) => onChangeField('lengthUnit', value)}
              />
            </View>
          </View>
          <View style={styles.manualChoiceGrid}>
            <ChoiceField label="Treated" value={bundleForm.treated} options={YES_NO_OPTIONS} onChange={(value) => onChangeField('treated', value)} />
            <ChoiceField label="Colored" value={bundleForm.colored} options={YES_NO_OPTIONS} onChange={(value) => onChangeField('colored', value)} />
            <ChoiceField label="Trimmed" value={bundleForm.trimmed} options={YES_NO_OPTIONS} onChange={(value) => onChangeField('trimmed', value)} />
          </View>
          <View style={styles.manualChoiceGrid}>
            <ChoiceField label="Hair color" value={bundleForm.hairColor} options={HAIR_COLOR_OPTIONS} onChange={(value) => onChangeField('hairColor', value)} />
            <ChoiceField label="Density" value={bundleForm.density} options={MANUAL_DENSITY_OPTIONS} onChange={(value) => onChangeField('density', value)} />
          </View>
        </ManualSection>
      ) : null}

      {(isDifferentDonor && isManual) ? (
        <ManualSection
          icon="camera"
          title="Bundle photo"
          body="Upload one clear photo for this additional bundle."
          roles={roles}
        >
          {bundlePhoto?.uri ? (
            <Image source={{ uri: bundlePhoto.uri }} style={[styles.photoPreview, { backgroundColor: roles.defaultCardBackground }]} resizeMode="cover" />
          ) : (
            <View style={[styles.photoPlaceholder, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
              <AppIcon name="camera" size="md" state="muted" />
              <Text style={styles.photoPlaceholderText}>No photo selected</Text>
            </View>
          )}
          <View style={styles.rowActions}>
            <AppButton title="Gallery" variant="outline" fullWidth={false} onPress={() => onPickPhoto('library')} />
            <AppButton title="Camera" fullWidth={false} onPress={() => onPickPhoto('camera')} />
          </View>
          {bundleErrors.photo ? <Text style={styles.inputError}>{bundleErrors.photo}</Text> : null}
        </ManualSection>
      ) : null}
    </ModalShell>
  );
}

// â”€â”€â”€ Donation history row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BundlePreviewPanel({
  roles,
  bundles = [],
  onPrintQr,
  printingQrKey = '',
  onSaveQr,
  savingQrKey = '',
}) {
  if (!bundles.length) return null;

  return (
    <View style={styles.bundlePreviewPanel}>
      <Text style={[styles.bundlePreviewTitle, { color: roles.headingText }]}>Hair preview before QR</Text>
      <Text style={[styles.bundlePreviewBody, { color: roles.metaText }]}>
        Review each hair separately. Each hair gets its own QR. Print each QR and paste it on the matching parcel or hair bundle before submitting at the donation site.
      </Text>
      <View style={[styles.bundlePreviewList, { borderColor: roles.defaultCardBorder }]}>
        {bundles.map((bundle, index) => (
          <View
            key={bundle.key}
            style={[
              styles.bundlePreviewRow,
              index > 0 ? { borderTopWidth: 1, borderTopColor: roles.defaultCardBorder } : null,
            ]}
          >
            <View style={styles.bundlePreviewRowTop}>
              <Text style={[styles.bundlePreviewRowTitle, { color: roles.headingText }]}>
                Hair {bundle.bundleNumber || index + 1}
              </Text>
              <View style={[styles.bundlePreviewSourceChip, { backgroundColor: roles.iconPrimarySurface }]}>
                <Text style={[styles.bundlePreviewSourceText, { color: roles.iconPrimaryColor }]}>{bundle.sourceLabel}</Text>
              </View>
            </View>
            <View style={styles.bundlePreviewMetaGrid}>
              {bundle.donorName ? (
                <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Hair owner: {bundle.donorName}</Text>
              ) : null}
              {bundle.donorBirthdate ? (
                <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>{bundle.donorBirthdate}</Text>
              ) : null}
              {bundle.hairItemCode ? (
                <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Hair Item Code: {bundle.hairItemCode}</Text>
              ) : null}
              {bundle.donationCode ? (
                <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Donation Code: {bundle.donationCode}</Text>
              ) : null}
              {bundle.currentStatus ? (
                <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Status: {bundle.currentStatus}</Text>
              ) : null}
              <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Length: {bundle.lengthLabel}</Text>
              <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Condition: {bundle.condition || '-'}</Text>
              <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Color: {bundle.color || '-'}</Text>
              <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Density: {bundle.density || '-'}</Text>
            </View>
            {bundle.qrPayload ? (
              <View style={[styles.previewQrCard, styles.bundlePreviewQrCard, { borderColor: roles.defaultCardBorder, backgroundColor: roles.supportCardBackground }]}>
                <Text style={[styles.previewQrTitle, { color: roles.headingText }]}>
                  Hair {bundle.bundleNumber || index + 1} QR
                </Text>
                <Text style={[styles.previewQrPayload, { color: roles.bodyText }]}>
                  Attach this QR label to the matching parcel or hair bundle. Do not reuse it for another hair item.
                </Text>
                <Image
                  source={{ uri: buildQrImageUrl(bundle.qrPayload, 220) }}
                  style={styles.previewQrImage}
                  resizeMode="contain"
                />
                <View style={styles.previewQrActionRow}>
                  <AppButton
                    title={printingQrKey === bundle.key ? 'Printing...' : 'Print QR'}
                    variant="outline"
                    size="sm"
                    fullWidth={false}
                    onPress={() => onPrintQr?.(bundle)}
                    loading={printingQrKey === bundle.key}
                    disabled={printingQrKey === bundle.key || savingQrKey === bundle.key}
                    style={styles.previewQrActionButton}
                  />
                  <AppButton
                    title={savingQrKey === bundle.key ? 'Saving...' : 'Save QR'}
                    size="sm"
                    fullWidth={false}
                    onPress={() => onSaveQr?.(bundle)}
                    loading={savingQrKey === bundle.key}
                    disabled={savingQrKey === bundle.key || printingQrKey === bundle.key}
                    style={styles.previewQrActionButton}
                  />
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

// â”€â”€â”€ Main screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DonationStepHeader({ roles, title, body, onBack }) {
  return (
    <View style={styles.donationStepHeader}>
      {onBack ? (
        <Pressable onPress={onBack} style={[styles.stepBackButton, { backgroundColor: roles.supportCardBackground }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={roles.iconPrimaryColor} />
        </Pressable>
      ) : null}
      <View style={styles.donationStepHeaderCopy}>
        <Text style={[styles.donationStepTitle, { color: roles.headingText }]}>{title}</Text>
        {body ? <Text style={[styles.donationStepBody, { color: roles.bodyText }]}>{body}</Text> : null}
      </View>
    </View>
  );
}

function DonationEventDetailsScreen({
  roles,
  drive,
  onBack,
  onSubmit,
  onGenerateRsvp,
  isGeneratingRsvp = false,
  hasOngoingDonation = false,
  hasHairScanLog = false,
  isHairEligible = false,
  hairEligibilityMessage = '',
  onCheckHair,
}) {
  const [eventMapLoadFailed, setEventMapLoadFailed] = React.useState(false);
  const registration = drive?.registration || null;
  const hasRsvp = Boolean(registration?.registration_id);
  const rsvpStatus = registration?.attendance_status || registration?.registration_status || 'Not registered';
  const checkedIn = isRsvpCheckedIn(registration);
  const canSubmit = hasHairScanLog && isHairEligible && hasRsvp && checkedIn;
  const mapPreviewUrl = buildStaticMapPreviewUrl(drive);
  const locationLabel = [drive?.street, drive?.barangay, drive?.city, drive?.province, drive?.country]
    .filter(Boolean)
    .join(', ') || 'To be announced';
  const rsvpQrPayloadText = hasRsvp
    ? buildDriveInvitationQrPayload({ drive, registration })
    : '';
  const rsvpQrImageUrl = rsvpQrPayloadText ? buildQrImageUrl(rsvpQrPayloadText, 360) : '';

  React.useEffect(() => {
    setEventMapLoadFailed(false);
  }, [mapPreviewUrl]);

  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader
        roles={roles}
        title="Donation Event Details"
        body="Review the event before adding the hair details."
        onBack={onBack}
      />
      <View style={[styles.eventDetailsHero, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <View style={[styles.eventDetailsIcon, { backgroundColor: roles.iconPrimarySurface }]}>
          <MaterialCommunityIcons name="domain" size={28} color={roles.iconPrimaryColor} />
        </View>
        <Text style={[styles.eventDetailsHost, { color: roles.bodyText }]}>Hosted by {getDriveOrganizationLabel(drive)}</Text>
        <Text style={[styles.eventDetailsTitle, { color: roles.headingText }]}>{drive?.event_title || 'Donation drive'}</Text>
        <View style={styles.eventDetailsMetaList}>
          <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Date: {getDriveDateLabel(drive)}</Text>
          <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Location: {locationLabel}</Text>
          {drive?.event_overview ? <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{drive.event_overview}</Text> : null}
        </View>

        <View style={[styles.eventMapCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <View style={styles.eventMapHeader}>
            <View style={styles.eventMapHeaderCopy}>
              <Text style={[styles.eventMapTitle, { color: roles.headingText }]}>Map preview</Text>
              <Text style={[styles.eventMapSubtitle, { color: roles.bodyText }]} numberOfLines={2}>
                {locationLabel}
              </Text>
            </View>
            <MaterialCommunityIcons name="map-marker-radius-outline" size={22} color={roles.iconPrimaryColor} />
          </View>
          {mapPreviewUrl && !eventMapLoadFailed ? (
            <View style={[styles.eventMapFrame, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
              <Image
                source={{ uri: mapPreviewUrl }}
                style={styles.eventMapImage}
                resizeMode="cover"
                onError={() => setEventMapLoadFailed(true)}
              />
            </View>
          ) : (
            <View style={[styles.eventMapFrame, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
              <View style={styles.eventMapFallback}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={28} color={roles.iconPrimaryColor} />
                <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>
                  {mapPreviewUrl
                    ? 'Map preview could not load right now.'
                    : 'Map coordinates are not available yet.'}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={[styles.driveRsvpRow, styles.eventRsvpRow]}>
          <Text style={[styles.driveRsvpLabel, { color: roles.metaText }]}>RSVP status</Text>
          <View style={[
            styles.rsvpBadge,
            { backgroundColor: checkedIn ? roles.primaryActionBackground : roles.supportCardBackground },
          ]}>
            <Text style={[
              styles.rsvpBadgeText,
              { color: checkedIn ? roles.primaryActionText : roles.bodyText },
            ]}>
              {rsvpStatus}
            </Text>
          </View>
        </View>

        {hasRsvp ? (
          <View style={[styles.eventRsvpQrWrap, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            <View style={styles.eventRsvpQrHeader}>
              <View>
                <Text style={[styles.eventRsvpQrTitle, { color: roles.headingText }]}>RSVP QR</Text>
                <Text style={[styles.eventRsvpQrSubtitle, { color: roles.bodyText }]}>
                  Show this to staff for check-in.
                </Text>
              </View>
              <MaterialCommunityIcons name="qrcode-scan" size={24} color={roles.iconPrimaryColor} />
            </View>
            {rsvpQrImageUrl ? (
              <View style={styles.eventRsvpQrImageFrame}>
                <Image
                  source={{ uri: rsvpQrImageUrl }}
                  style={styles.eventRsvpQrImage}
                  resizeMode="contain"
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {hasOngoingDonation ? (
          <StatusBanner
            variant="info"
            message="You already have a donation in progress. You can view this event, but you cannot register or submit until the current donation is finished or cancelled."
            style={styles.eventRsvpBanner}
          />
        ) : !hasHairScanLog || !isHairEligible ? (
          <StatusBanner
            variant="info"
            message={hairEligibilityMessage || 'Scan your hair first so the system can confirm if you are eligible to join this donation event.'}
            style={styles.eventRsvpBanner}
          />
        ) : !canSubmit ? (
          <StatusBanner
            variant="info"
            message={hasRsvp
              ? 'RSVP saved. Staff must mark your attendance as Present before you can submit hair donation for this event.'
              : 'RSVP is required for event donation. Generate your RSVP QR first.'}
            style={styles.eventRsvpBanner}
          />
        ) : (
          <StatusBanner
            variant="success"
            message="Your attendance is marked Present. You can now submit your hair donation details."
            style={styles.eventRsvpBanner}
          />
        )}

        <AppButton
          style={styles.eventRsvpActionButton}
          title={
            hasOngoingDonation
              ? 'Donation in progress'
              : !hasHairScanLog
              ? 'Scan hair first'
              : !isHairEligible
              ? 'Not eligible yet'
              : !hasRsvp
              ? (isGeneratingRsvp ? 'Generating RSVP QR...' : 'Generate RSVP QR')
              : canSubmit
                ? 'Submit my hair donation'
                : 'Waiting for RSVP check-in'
          }
          onPress={hasOngoingDonation ? undefined : !hasHairScanLog ? onCheckHair : !isHairEligible ? undefined : !hasRsvp ? onGenerateRsvp : onSubmit}
          disabled={isGeneratingRsvp || hasOngoingDonation || (hasHairScanLog && !isHairEligible) || (hasHairScanLog && hasRsvp && !canSubmit)}
          loading={isGeneratingRsvp}
        />
      </View>
    </View>
  );
}

function DonationHairSummaryScreen({
  roles,
  drive,
  latestScreening,
  isEligible,
  ineligibilityReason,
  hairItems = [],
  isSubmitting,
  onBack,
  onAddAnotherHair,
  allowAddAnotherHair = true,
  onRemoveHair,
  removingHairKey = '',
  onReferDonation,
  onSubmitDonation,
}) {
  const screeningText = buildDonationDecisionText({
    screening: latestScreening,
    isEligible,
    ineligibilityReason,
  }) || 'No screening result found yet.';

  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader
        roles={roles}
        title="Donation Summary"
        body="Review your hair donation details before choosing a recipient or generating QR codes."
        onBack={onBack}
      />
      <View style={[styles.summaryCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>Event</Text>
        <Text style={[styles.summaryMainText, { color: roles.headingText }]}>{drive?.event_title || 'Selected donation drive'}</Text>
        <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{getDriveDateLabel(drive)}</Text>
        <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Recipient default: {getDriveOrganizationLabel(drive)}</Text>
      </View>
      <View style={[styles.summaryCard, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
        <View style={styles.summaryHeaderRow}>
          <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>Initial screening</Text>
          <View style={[styles.summaryStatusChip, { backgroundColor: isEligible ? roles.iconPrimarySurface : roles.supportCardBackground }]}>
            <Text style={[styles.summaryStatusText, { color: isEligible ? roles.iconPrimaryColor : theme.colors.textError }]}>
              {isEligible ? 'Eligible' : 'Review needed'}
            </Text>
          </View>
        </View>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Length</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]}>{formatScreeningLengthInches(latestScreening)}</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Condition</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]}>{latestScreening?.detected_condition || 'N/A'}</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Color</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]}>{latestScreening?.detected_color || 'N/A'}</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Analyzed</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]}>{formatDateLabel(latestScreening?.created_at)}</Text>
          </View>
        </View>
        <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{screeningText}</Text>
      </View>
      <View style={styles.flowCardList}>
        <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>Hair to donate</Text>
        {hairItems.length ? hairItems.map((item, index) => (
          <View key={`summary-hair-${item.key || index}`} style={[styles.summaryHairRow, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            <View style={styles.summaryHeaderRow}>
              <Text style={[styles.summaryMainText, { color: roles.headingText }]}>Hair {index + 1}</Text>
              <View style={styles.summaryHairActions}>
                <View style={[styles.bundlePreviewSourceChip, { backgroundColor: roles.iconPrimarySurface }]}>
                  <Text style={[styles.bundlePreviewSourceText, { color: roles.iconPrimaryColor }]}>{item.sourceLabel}</Text>
                </View>
                {onRemoveHair ? (
                  <Pressable
                    onPress={() => onRemoveHair(item)}
                    disabled={removingHairKey === item.key}
                    style={({ pressed }) => [
                      styles.summaryRemoveButton,
                      { borderColor: roles.defaultCardBorder, opacity: pressed || removingHairKey === item.key ? 0.72 : 1 },
                    ]}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={15} color={theme.colors.textError} />
                    <Text style={[styles.summaryRemoveText, { color: theme.colors.textError }]}>
                      {removingHairKey === item.key ? 'Removing' : 'Remove'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            {item.donorName ? <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Donor: {item.donorName}</Text> : null}
            <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Length: {item.lengthLabel}</Text>
            <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Condition: {item.condition || '-'}</Text>
            <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Color: {item.color || '-'}  Density: {item.density || '-'}</Text>
          </View>
        )) : (
          <View style={[styles.emptyDonationCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            <Text style={[styles.emptyDonationText, { color: roles.bodyText }]}>No saved hair details yet. Add hair details first.</Text>
          </View>
        )}
      </View>
      <View style={styles.summaryActions}>
        {allowAddAnotherHair ? (
          <AppButton title="Add another hair" variant="outline" onPress={onAddAnotherHair} />
        ) : null}
        <AppButton title="Refer your donation" variant="secondary" onPress={onReferDonation} />
        <AppButton
          title={isSubmitting ? 'Submitting...' : 'Submit your donation'}
          onPress={onSubmitDonation}
          loading={isSubmitting}
          disabled={isSubmitting || !hairItems.length}
        />
      </View>
    </View>
  );
}

function RecipientChoiceScreen({ roles, drive, patients = [], selectedRecipient, onBack, onSelectDefault, onSelectPatient, onConfirm }) {
  const [patientSearch, setPatientSearch] = React.useState('');
  const normalizedSearch = patientSearch.trim().toLowerCase();
  const visiblePatients = React.useMemo(() => {
    if (!normalizedSearch) return patients;
    return patients.filter((patient) => (
      [
        patient.patient_name,
        patient.medical_condition,
        patient.patient_code,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch))
    ));
  }, [normalizedSearch, patients]);

  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader
        roles={roles}
        title="Donation Recipient"
        body="Choose where your hair should go. If no patient is selected, the donation goes to the event organization."
        onBack={onBack}
      />
      <Pressable
        onPress={onSelectDefault}
        style={[styles.recipientDefaultCard, {
          backgroundColor: roles.defaultCardBackground,
          borderColor: selectedRecipient?.type === 'organization' ? roles.primaryActionBackground : roles.defaultCardBorder,
        }]}
      >
        <View style={[styles.recommendedBadge, { backgroundColor: roles.primaryActionBackground }]}>
          <Text style={[styles.recommendedBadgeText, { color: roles.primaryActionText }]}>Default</Text>
        </View>
        <View style={[styles.flowIconCircle, { backgroundColor: roles.iconPrimarySurface }]}>
          <MaterialCommunityIcons name="domain" size={24} color={roles.iconPrimaryColor} />
        </View>
        <View style={styles.inputMethodCopy}>
          <Text style={[styles.inputMethodTitle, { color: roles.headingText }]}>Donate to Organization</Text>
          <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{getDriveOrganizationLabel(drive)}</Text>
        </View>
      </Pressable>
      <View style={[styles.summaryCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>Refer to a Patient</Text>
        <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Select a patient, or continue without referral.</Text>
        <AppInput
          label="Search patient"
          value={patientSearch}
          onChangeText={setPatientSearch}
          placeholder="Search by patient name or condition"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.patientScroll}>
          {visiblePatients.length ? visiblePatients.map((patient) => {
            const isSelected = selectedRecipient?.patient?.patient_id === patient.patient_id;
            return (
              <Pressable
                key={`patient-${patient.patient_id}`}
                onPress={() => onSelectPatient?.(patient)}
                style={[styles.patientChoiceCard, {
                  backgroundColor: roles.supportCardBackground,
                  borderColor: isSelected ? roles.primaryActionBackground : roles.defaultCardBorder,
                }]}
              >
                <View style={[styles.patientAvatar, { backgroundColor: roles.iconPrimarySurface }]}>
                  <MaterialCommunityIcons name="account-heart-outline" size={24} color={roles.iconPrimaryColor} />
                </View>
                <Text style={[styles.patientName, { color: roles.headingText }]} numberOfLines={2}>
                  {patient.patient_name || `Patient ${patient.patient_id}`}
                </Text>
                <Text style={[styles.flowMetaText, { color: roles.bodyText }]} numberOfLines={2}>
                  {patient.medical_condition || 'Wig request patient'}
                </Text>
                <Text style={[styles.patientSelectText, { color: roles.primaryActionBackground }]}>
                  {isSelected ? 'Selected' : 'Select'}
                </Text>
              </Pressable>
            );
          }) : (
            <View style={[styles.patientChoiceCard, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
              <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>
                {patients.length ? 'No patient matched your search.' : 'No patient referral list is available right now.'}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
      <AppButton title="Confirm donation details" onPress={onConfirm} />
    </View>
  );
}

function DonationQrCodesScreen({
  roles,
  bundles = [],
  feedback,
  printingQrKey,
  savingQrKey,
  onBack,
  onPrintQr,
  onSaveQr,
  onDone,
  allowQrActions = false,
}) {
  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader
        roles={roles}
        title={allowQrActions ? 'Your Hair QR Codes' : 'Donation Submitted'}
        body={allowQrActions
          ? 'For independent donation, attach this QR to your parcel before shipping.'
          : 'Waybill QR is issued by staff from the website after verification.'}
        onBack={onBack}
      />
      <View style={[styles.successBanner, { backgroundColor: roles.iconPrimarySurface, borderColor: roles.primaryActionBackground }]}>
        <MaterialCommunityIcons name="check-circle-outline" size={22} color={roles.iconPrimaryColor} />
        <Text style={[styles.successBannerText, { color: roles.iconPrimaryColor }]}>Donation submitted successfully.</Text>
      </View>
      <View style={[styles.summaryCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>Next step</Text>
        <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>
          {allowQrActions
            ? 'Print or save this QR and attach it to your hair parcel. Staff will scan it during receiving and QA.'
            : 'Staff will issue the waybill QR from the website and provide it to you for attachment.'}
        </Text>
      </View>
      {allowQrActions ? (
        <BundlePreviewPanel
          roles={roles}
          bundles={bundles}
          onPrintQr={onPrintQr}
          printingQrKey={printingQrKey}
          onSaveQr={onSaveQr}
          savingQrKey={savingQrKey}
        />
      ) : null}
      {feedback?.message ? <StatusBanner message={feedback.message} variant={feedback.variant} /> : null}
      <AppButton title="Done" onPress={onDone} />
    </View>
  );
}

function MyJoinedDonationsScreen({
  roles,
  logisticsSettings = null,
}) {
  const [sendOffMapFailed, setSendOffMapFailed] = React.useState(false);
  const [isSendOffExpanded, setIsSendOffExpanded] = React.useState(false);
  const shippingFeeNote = getShippingFeeNote();
  const sendOffAddressRows = React.useMemo(
    () => getLogisticsSummaryRows(logisticsSettings),
    [logisticsSettings]
  );
  const sendOffMapPreviewUrl = React.useMemo(
    () => buildStaticMapPreviewUrl(logisticsSettings),
    [logisticsSettings]
  );

  React.useEffect(() => {
    setSendOffMapFailed(false);
  }, [sendOffMapPreviewUrl]);

  return (
    <View style={[styles.flowScreen, styles.logisticHistoryScreen]}>
      <View style={[styles.logisticLocationCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSendOffExpanded ? 'Collapse send-off location details' : 'Expand send-off location details'}
          onPress={() => setIsSendOffExpanded((current) => !current)}
          style={styles.logisticLocationToggle}
        >
          <View style={styles.logisticLocationToggleCopy}>
            <View style={[styles.upcomingDonationIcon, { backgroundColor: roles.iconPrimarySurface }]}>
              <MaterialCommunityIcons name="map-marker-radius-outline" size={24} color={roles.iconPrimaryColor} />
            </View>
            <View style={styles.upcomingDonationCopy}>
              <Text style={[styles.upcomingDonationTitle, { color: roles.headingText }]} numberOfLines={1}>
                Send-off location
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons
            name={isSendOffExpanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color={roles.iconPrimaryColor}
          />
        </Pressable>

        {isSendOffExpanded ? (
          <View style={styles.logisticLocationBody}>
            <Text style={[styles.upcomingDonationBody, { color: roles.bodyText }]}>
              {shippingFeeNote}
            </Text>
            {sendOffMapPreviewUrl && !sendOffMapFailed ? (
              <View style={[styles.eventMapFrame, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
                <Image
                  source={{ uri: sendOffMapPreviewUrl }}
                  style={styles.eventMapImage}
                  resizeMode="cover"
                  onError={() => setSendOffMapFailed(true)}
                />
              </View>
            ) : (
              <View style={[styles.eventMapFrame, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
                <View style={styles.eventMapFallback}>
                  <MaterialCommunityIcons name="map-marker-radius-outline" size={28} color={roles.iconPrimaryColor} />
                  <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>
                    {sendOffMapPreviewUrl
                      ? 'Map preview could not load right now.'
                      : 'Map coordinates are not available yet.'}
                  </Text>
                </View>
              </View>
            )}
            {sendOffAddressRows.length ? (
              <View style={styles.logisticsTable}>
                {sendOffAddressRows.map((row) => (
                  <View key={`${row.label}-${row.value}`} style={[styles.logisticsTableRow, { borderColor: roles.defaultCardBorder }]}>
                    <Text style={[styles.logisticsTableLabel, { color: roles.metaText }]}>{row.label}</Text>
                    <Text style={[styles.logisticsTableValue, { color: roles.headingText }]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>
                The send-off address will appear here once logistics settings are available.
              </Text>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
/*
  const getDonationActionTitle = React.useCallback((item) => {
    if (item?.submission) return 'View Timeline';
    if (item?.drive?.registration?.registration_id) return 'View';
    if (hasOngoingDonation) return 'View Timeline';
    return 'Register';
  }, [hasOngoingDonation]);

  const handleDonationActionPress = React.useCallback((item) => {
    if (item?.submission) {
      onViewDonation?.(item);
      return;
    }

    onSubmitDriveDonation?.(item.drive);
  }, [onSubmitDriveDonation, onViewDonation]);
  const historyNote = hasOngoingDonation
    ? 'Your latest donation appears first. Tap any record to view its timeline.'
    : 'Tap any record to view its timeline. Start a new logistic donation from the floating action button.';

  const filteredItems = React.useMemo(() => (
    donationItems
      .filter((item) => {
        return Boolean(
          item?.drive?.donation_drive_id
          || item?.submission?.donation_drive_id
        );
      })
      .filter((item) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'active') return item.statusCategory === 'active';
      return item.statusCategory === activeFilter;
    })
  ), [activeFilter, donationItems]);

  return (
    <View style={[styles.flowScreen, styles.logisticHistoryScreen]}>
      <View style={[styles.logisticHistoryBanner, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <View style={[styles.logisticHistoryIcon, { backgroundColor: roles.iconPrimarySurface }]}>
          <MaterialCommunityIcons name="history" size={20} color={roles.iconPrimaryColor} />
        </View>
        <View style={styles.logisticHistoryCopy}>
          <Text style={[styles.upcomingDonationTitle, { color: roles.headingText }]}>Donation history</Text>
          <Text style={[styles.upcomingDonationBody, { color: roles.bodyText }]}>{historyNote}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.myDonationFilters}>
        {MY_DONATION_FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              onPress={() => onChangeFilter?.(filter.key)}
              style={[
                styles.myDonationFilterChip,
                {
                  backgroundColor: isActive ? roles.primaryActionBackground : roles.supportCardBackground,
                  borderColor: isActive ? roles.primaryActionBackground : roles.defaultCardBorder,
                },
              ]}
            >
              <Text style={[styles.myDonationFilterText, { color: isActive ? roles.primaryActionText : roles.bodyText }]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filteredItems.length ? (
        <View style={styles.flowCardList}>
          {filteredItems.map((item) => (
            <View
              key={item.key}
              style={[styles.myDonationCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}
            >
              <View style={styles.myDonationCardTop}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.myDonationImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.myDonationImage, styles.myDonationImageFallback, { backgroundColor: roles.iconPrimarySurface }]}>
                    <MaterialCommunityIcons name={item.statusIcon || 'calendar-check-outline'} size={28} color={roles.iconPrimaryColor} />
                  </View>
                )}
                <View style={styles.myDonationCardCopy}>
                  <View style={styles.myDonationTitleRow}>
                    <Text style={[styles.myDonationTitle, { color: roles.headingText }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View style={[styles.myDonationStatusBadge, { backgroundColor: item.statusCategory === 'submitted' ? roles.iconPrimarySurface : roles.supportCardBackground }]}>
                      <Text style={[styles.myDonationStatusText, { color: item.statusCategory === 'submitted' ? roles.iconPrimaryColor : roles.bodyText }]} numberOfLines={1}>
                        {item.statusLabel}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.flowMetaText, { color: roles.bodyText }]} numberOfLines={1}>
                    {item.organizationName}
                  </Text>
                </View>
              </View>

              <View style={[styles.myDonationInfoBox, { backgroundColor: roles.supportCardBackground }]}>
                <View style={styles.myDonationInfoRow}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={18} color={roles.iconPrimaryColor} />
                  <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{item.dateLabel}</Text>
                </View>
                <View style={styles.myDonationInfoRow}>
                  <MaterialCommunityIcons name={item.submission ? 'content-cut' : 'map-marker-outline'} size={18} color={roles.iconPrimaryColor} />
                  <Text style={[styles.flowMetaText, { color: roles.bodyText }]} numberOfLines={2}>
                    {item.submission ? `${item.hairCount || 1} hair donation${item.hairCount === 1 ? '' : 's'}` : item.locationLabel}
                  </Text>
                </View>
              </View>

              <View style={styles.myDonationCardActions}>
                <AppButton
                  title={getDonationActionTitle(item)}
                  onPress={() => handleDonationActionPress(item)}
                />
                {item.submission && item.canCancel ? (
                  <AppButton
                    title="Cancel My Donation"
                    variant="danger"
                    onPress={() => onCancelDonation?.(item)}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.emptyDonationCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <AppIcon name="donations" size="lg" color={roles.metaText} />
          <Text style={[styles.emptyDonationText, { color: roles.bodyText }]}>No donation records yet.</Text>
        </View>
      )}

      <Pressable
        onPress={onAddLogisticDonation}
        style={({ pressed }) => [
          styles.logisticFab,
          {
            backgroundColor: roles.primaryActionBackground,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <MaterialCommunityIcons name="plus" size={22} color={roles.primaryActionText} />
        <Text style={[styles.logisticFabText, { color: roles.primaryActionText }]}>Add Logistic Donation</Text>
      </Pressable>
    </View>
  );
}

const normalizeTimelineKey = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

const isCancelledDonationSubmission = (submission = null) => (
  ['cancelled', 'canceled'].includes(normalizeTimelineKey(submission?.status || submission?.Status || ''))
);

const getTimelineEvidenceAt = (stage) => (
  stage?.displayEvidenceAt
  || stage?.completedAt
  || stage?.evidenceAt
  || stage?.timestamp
  || stage?.created_at
  || null
);

const findTimelineStage = (stages = [], keys = [], labels = []) => {
  const keySet = new Set(keys.map(normalizeTimelineKey));
  const labelTokens = labels.map(normalizeTimelineKey).filter(Boolean);

  return stages.find((stage) => {
    const stageKey = normalizeTimelineKey(stage?.key || stage?.id || '');
    if (stageKey && keySet.has(stageKey)) return true;

    const searchable = normalizeTimelineKey(`${stage?.label || ''} ${stage?.title || ''} ${stage?.savedNote || ''}`);
    return labelTokens.some((token) => searchable.includes(token));
  }) || null;
};

const isSubmissionCutAndShipComplete = (submission = null) => {
  const statusKey = normalizeTimelineKey(submission?.status || submission?.Status || '');
  return [
    'cut',
    'wiginproduction',
    'inproduction',
    'wigcreated',
    'wigcompleted',
    'completed',
  ].includes(statusKey);
};

const buildEventDonationTimelineStages = ({ item, fallbackStages = [], certificate }) => {
  const submission = item?.submission || null;
  const isSubmissionCancelled = isCancelledDonationSubmission(submission);
  const submissionId = Number(submission?.submission_id || submission?.Submission_ID || 0);
  const isSubmissionCutComplete = isSubmissionCutAndShipComplete(submission);
  const certificateSubmissionId = isSubmissionCancelled ? 0 : Number(certificate?.submission_id || certificate?.Submission_ID || 0);
  const certificateIssuedAt = !isSubmissionCancelled && isSubmissionCutComplete && submissionId && certificateSubmissionId === submissionId
    ? (certificate?.issued_at || certificate?.Issued_At || null)
    : null;

  const cutFallback = findTimelineStage(
    fallbackStages,
    ['cut_and_ship', 'cutship', 'received_by_company', 'receivedbyhairforhope'],
    ['cut ship', 'received by hair', 'received by company'],
  );
  const productionFallback = findTimelineStage(
    fallbackStages,
    ['wig_production', 'wigproduction', 'for_bundling', 'forbundling'],
    ['wig production', 'for bundling'],
  );
  const hospitalFallback = findTimelineStage(
    fallbackStages,
    ['wig_distribution_hospitals', 'wigdistributionhospitals', 'wig_completed', 'wigcompleted', 'assigned_to_patient'],
    ['wig distribution hospital', 'wig completed', 'assigned to patient'],
  );
  const patientFallback = findTimelineStage(
    fallbackStages,
    ['distribution_to_patients', 'distributiontopatients', 'received_by_patient', 'receivedbypatient'],
    ['distribution to patient', 'received by patient'],
  );

  const cutFallbackEvidenceAt = normalizeTimelineKey(cutFallback?.key || '') === 'cutandship'
    ? getTimelineEvidenceAt(cutFallback)
    : null;
  const cutEvidenceAt = !isSubmissionCancelled && (submission?.cut_at
    || (isSubmissionCutComplete ? (submission?.updated_at || submission?.created_at) : null)
    || certificateIssuedAt
    || cutFallbackEvidenceAt);

  if (isSubmissionCancelled) {
    const cancelledAt = submission?.updated_at || submission?.Updated_At || submission?.created_at || submission?.Created_At || null;
    return [{
      key: 'donation_cancelled',
      label: 'Donation Cancelled',
      savedNote: 'This donation was cancelled in the donation records. RSVP scan history is kept, but the latest submission status controls this timeline.',
      evidenceAt: cancelledAt,
      displayEvidenceAt: cancelledAt,
      state: 'cancelled',
      progressLabel: 'Cancelled',
      statusLabel: 'Cancelled',
    }];
  }

  const eventStages = [
    {
      key: 'cut_and_ship',
      label: 'Cut & Ship',
      savedNote: 'The user has a hair ready to be delivered to the organization.',
      evidenceAt: cutEvidenceAt,
      statusLabel: cutEvidenceAt ? 'Complete' : '',
    },
    {
      key: 'wig_production',
      label: 'Wig Production',
      savedNote: productionFallback?.savedNote || 'Approved hair by the staff is used in the wig production process.',
      evidenceAt: getTimelineEvidenceAt(productionFallback),
      statusLabel: productionFallback?.statusLabel || '',
    },
    {
      key: 'wig_distribution_hospitals',
      label: 'Wig Distribution for Hospital',
      savedNote: hospitalFallback?.savedNote || 'The completed wig is prepared for hospital distribution.',
      evidenceAt: getTimelineEvidenceAt(hospitalFallback),
      statusLabel: hospitalFallback?.statusLabel || '',
    },
    {
      key: 'distribution_to_patients',
      label: 'Distribution to Patients',
      savedNote: patientFallback?.savedNote || 'The wig is distributed to patients.',
      evidenceAt: getTimelineEvidenceAt(patientFallback),
      statusLabel: patientFallback?.statusLabel || '',
    },
  ];

  const lastCompletedIndex = eventStages.reduce((latestIndex, stage, index) => (
    stage.evidenceAt ? index : latestIndex
  ), -1);
  const currentIndex = Math.min(lastCompletedIndex + 1, eventStages.length - 1);

  return eventStages.map((stage, index) => {
    const isCompleted = Boolean(stage.evidenceAt);
    const isCurrent = !isCompleted && index === currentIndex;
    return {
      ...stage,
      displayEvidenceAt: stage.evidenceAt,
      state: isCompleted ? 'completed' : (isCurrent ? 'current' : 'upcoming'),
      progressLabel: isCompleted ? 'Complete' : (isCurrent ? 'Ongoing' : 'On waiting'),
      statusLabel: stage.statusLabel || (isCompleted ? 'Complete' : ''),
    };
  });
};

 */

}
function DonationTimelineStatusScreen({
  roles,
  item,
  previewItems = [],
  timelineStages = [],
  timelineEvents = [],
  parcelImages = [],
  certificate,
  accountDonorName,
  onBack,
  onViewDonationQr,
  onCancelDonation,
}) {
  const primaryPreview = previewItems[0] || item?.previewItems?.[0] || null;
  const submittedAt = item?.submission?.created_at || item?.submission?.updated_at || '';
  const canCancel = canCancelDonationSubmission({
    submission: item?.submission || null,
    registration: item?.drive?.registration || item?.registration || null,
    certificate,
    timelineStages,
    timelineEvents,
  });
  const recipientLabel = item?.recipientName || item?.organizationName || 'Donation drive';
  const isEventDonation = Boolean(item?.submission?.donation_drive_id || item?.drive?.donation_drive_id);
  const canViewDonationQr = Boolean(
    !isEventDonation
    && isSubmittedDonationItem({ submission: item?.submission })
    && previewItems.some((previewItem) => previewItem?.qrPayload)
  );
  const stages = isEventDonation
    ? buildEventDonationTimelineStages({ item, fallbackStages: timelineStages, certificate })
    : timelineStages;

  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader
        roles={roles}
        title="Donation Status"
        body="View the logistics timeline for this hair donation."
        onBack={onBack}
      />

      <View style={[styles.timelineHero, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <View style={styles.timelineHeroTop}>
          <View style={styles.timelineHeroCopy}>
            <Text style={[styles.timelineHeroTitle, { color: roles.headingText }]} numberOfLines={2}>
              Hair #1 - {primaryPreview?.donorName || accountDonorName || 'Donor'}
            </Text>
            <View style={[styles.timelineHeroChip, { backgroundColor: roles.iconPrimarySurface }]}>
              <Text style={[styles.timelineHeroChipText, { color: roles.iconPrimaryColor }]}>
                {item?.statusLabel || 'Processing'}
              </Text>
            </View>
          </View>
          <View style={[styles.flowIconCircle, { backgroundColor: roles.iconPrimarySurface }]}>
            <MaterialCommunityIcons name="content-cut" size={24} color={roles.iconPrimaryColor} />
          </View>
        </View>
        <View style={[styles.timelineMetricGrid, { borderTopColor: roles.defaultCardBorder }]}>
          <View style={styles.timelineMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Length</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]}>{primaryPreview?.lengthLabel || 'Not recorded'}</Text>
          </View>
          <View style={styles.timelineMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Date Submitted</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]}>{submittedAt ? formatDateLabel(submittedAt) : 'Not submitted'}</Text>
          </View>
          <View style={styles.timelineMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Recipient</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]} numberOfLines={2}>{recipientLabel}</Text>
          </View>
        </View>
        {canViewDonationQr ? (
          <AppButton
            title="View Donation QR"
            leading={<MaterialCommunityIcons name="qrcode-scan" size={18} color={roles.primaryActionText} />}
            onPress={onViewDonationQr}
          />
        ) : null}
      </View>

      <View style={styles.timelineSection}>
        <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>Journey Timeline</Text>
        <View style={styles.timelineStageList}>
          {stages.length ? stages.map((stage, index) => {
            const isCompleted = stage.state === 'completed';
            const isCurrent = stage.state === 'current';
            const isCancelled = stage.state === 'cancelled';
            const stageDisplayDate = stage.displayEvidenceAt || stage.completedAt || stage.evidenceAt || '';
            const markerColor = isCancelled ? roles.errorText : roles.primaryActionBackground;
            const stageImages = index === 0
              ? (stage.parcelImages || parcelImages || []).filter((image) => image?.signed_url || image?.image_url)
              : [];
            return (
              <View key={stage.key || `${stage.label}-${index}`} style={styles.timelineStageRow}>
                <View style={styles.timelineMarkerColumn}>
                  <View style={[
                    styles.timelineMarker,
                    {
                      backgroundColor: isCompleted ? roles.primaryActionBackground : roles.defaultCardBackground,
                      borderColor: isCompleted || isCurrent || isCancelled ? markerColor : roles.defaultCardBorder,
                    },
                  ]}>
                    {isCompleted ? (
                      <MaterialCommunityIcons name="check" size={14} color={roles.primaryActionText} />
                    ) : isCancelled ? (
                      <MaterialCommunityIcons name="close" size={14} color={roles.errorText} />
                    ) : isCurrent ? (
                      <View style={[styles.timelineCurrentDot, { backgroundColor: roles.primaryActionBackground }]} />
                    ) : (
                      <MaterialCommunityIcons name="clock-outline" size={13} color={roles.metaText} />
                    )}
                  </View>
                  {index < stages.length - 1 ? (
                    <View style={[styles.timelineStageConnector, { backgroundColor: isCompleted ? roles.primaryActionBackground : roles.defaultCardBorder }]} />
                  ) : null}
                </View>
                <View style={[
                  styles.timelineStageCard,
                  {
                    backgroundColor: isCurrent ? roles.iconPrimarySurface : roles.defaultCardBackground,
                    borderColor: isCancelled ? roles.errorText : (isCurrent ? roles.primaryActionBackground : roles.defaultCardBorder),
                  },
                ]}>
                  <View style={styles.timelineStageHeader}>
                    <Text style={[styles.timelineStageTitle, { color: isCancelled ? roles.errorText : (isCurrent ? roles.iconPrimaryColor : roles.headingText) }]}>
                      {stage.label || stage.title || 'Donation update'}
                    </Text>
                    <Text style={[styles.timelineStageDate, { color: roles.metaText }]}>
                      {stageDisplayDate ? formatDateTimeLabel(stageDisplayDate) : (stage.progressLabel || 'Waiting')}
                    </Text>
                  </View>
                  <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{getTimelineStageDescription(stage)}</Text>
                  {stageImages.length ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.timelinePhotoStrip}
                    >
                      {stageImages.map((image, imageIndex) => (
                        <View
                          key={`timeline-photo-${image?.image_id || imageIndex}`}
                          style={[styles.timelinePhotoFrame, { backgroundColor: roles.supportCardBackground }]}
                        >
                          <Image
                            source={{ uri: image.signed_url || image.image_url }}
                            style={styles.timelinePhoto}
                            resizeMode="cover"
                          />
                          <Text style={[styles.timelinePhotoLabel, { color: roles.metaText }]} numberOfLines={1}>
                            {image.uploaded_at ? formatDateTimeLabel(image.uploaded_at) : 'Uploaded photo'}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  ) : null}
                  {stage.statusLabel ? (
                    <Text style={[styles.timelineStageBadgeText, { color: isCancelled ? roles.errorText : roles.iconPrimaryColor }]}>{stage.statusLabel}</Text>
                  ) : null}
                </View>
              </View>
            );
          }) : (
            <View style={[styles.emptyDonationState, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
              <AppIcon name="info" size="lg" color={roles.metaText} />
              <Text style={[styles.emptyDonationText, { color: roles.bodyText }]}>
                No timeline updates are available from the database yet.
              </Text>
            </View>
          )}
        </View>
      </View>

      {timelineEvents.length ? (
        <View style={[styles.summaryCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>Recent updates</Text>
          {timelineEvents.slice(0, 4).map((event) => (
            <View key={event.key} style={styles.timelineEventRow}>
              <Text style={[styles.summaryMainText, { color: roles.headingText }]}>{event.title}</Text>
              <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{event.description}</Text>
              {event.timestamp ? <Text style={[styles.flowMetaText, { color: roles.metaText }]}>{event.timestamp}</Text> : null}
              {event.imageUrl ? (
                <Image
                  source={{ uri: event.imageUrl }}
                  style={styles.timelineEventImage}
                  resizeMode="cover"
                />
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {canCancel ? (
        <AppButton title="Cancel My Donation" variant="danger" onPress={onCancelDonation} />
      ) : null}
    </View>
  );
}

function getNoteValue(notes = '', label = '') {
  const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(notes || '').match(new RegExp(`${escapedLabel}:\\s*([^|.]+)`, 'i'));
  return match?.[1]?.trim() || '';
}

function getPreviewConditionLabel(condition = '') {
  const text = String(condition || '').trim();
  const lower = text.toLowerCase();
  if (!text) return 'Pending review';
  if (lower.includes('different donor') || lower.includes('other person')) return 'Other person hair';
  if (lower.includes('qualified for donor donation flow')) return 'Ready for donation';
  if (lower.includes('own hair')) return 'Own hair';
  return text;
}

function getLatestPreviewDetail(submission = null) {
  const submissionDetails = Array.isArray(submission?.submission_details)
    ? submission.submission_details
    : [];
  return submissionDetails.length
    ? [...submissionDetails].sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))[0]
    : null;
}

function buildHairSubmissionPreviewItems(submission = null, fallbackDetail = null, qrPayload = '', accountDonorName = '') {
  const submissionDetails = Array.isArray(submission?.submission_details)
    ? submission.submission_details
    : [];
  const latestSubmissionDetail = submissionDetails.length
    ? [...submissionDetails].sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))[0]
    : null;
  const details = (fallbackDetail ? [fallbackDetail] : (latestSubmissionDetail ? [latestSubmissionDetail] : []))
    .filter((detail) => !isRemovedHairDetail(detail));

  return details.map((detail, index) => {
    const rawLength = Number(detail?.declared_length);
    const inputMethod = String(detail?.input_method || '').toLowerCase();
    const lengthInches = Number.isFinite(rawLength) && rawLength > 0
      ? (rawLength > 40 || (inputMethod.includes('ai') && rawLength > 30) ? rawLength / 2.54 : rawLength)
      : null;
    const lengthLabel = lengthInches
      ? `${lengthInches.toFixed(1)} inches`
      : 'Not recorded';
    const notes = [detail?.detail_notes, submission?.donor_notes].filter(Boolean).join(' ');
    const condition = getPreviewConditionLabel(detail?.declared_condition);
    const markerText = `${notes} ${condition}`.toLowerCase();
    const isOtherPersonHair = detail?.hair_owner_type === 'Other'
      || markerText.includes('different donor')
      || markerText.includes('other person');
    const ownerName = detail?.hair_owner_display_name
      || (isOtherPersonHair ? getNoteValue(notes, 'Donor name') : accountDonorName);

    return {
      key: String(detail?.submission_detail_id || `${submission?.submission_id || 'hair'}-${index}`),
      submission,
      detail,
      bundleNumber: index + 1,
      sourceLabel: isOtherPersonHair ? 'Other person' : 'My hair',
      donorName: ownerName,
      donorBirthdate: isOtherPersonHair
        ? (detail?.relationship_to_submitter ? `Relationship: ${detail.relationship_to_submitter}` : '')
        : '',
      hairItemCode: detail?.hair_item_code || '',
      donationCode: submission?.donation_reference || '',
      currentStatus: detail?.current_tracking_status || detail?.status || '',
      lengthLabel,
      condition,
      color: detail?.declared_color || '-',
      density: detail?.declared_density || '-',
      qrPayload: detail?.qr_token
        ? buildDonationTrackingQrPayload({ submission, detail })
        : qrPayload,
    };
  });
}

function DonationSubmitPreviewModal({
  visible,
  roles,
  submission,
  detail,
  qrPayload,
  qrItems = [],
  accountDonorName = '',
  isSubmitting,
  isSubmitted = false,
  onClose,
  onEditDetails,
  onConfirm,
}) {
  const [printingQrKey, setPrintingQrKey] = React.useState('');
  const [savingQrKey, setSavingQrKey] = React.useState('');
  const [printFeedback, setPrintFeedback] = React.useState({ message: '', variant: 'info' });
  const previewItems = React.useMemo(() => {
    if (qrItems.length) {
      return qrItems.flatMap((item, index) => (
        buildHairSubmissionPreviewItems(item.submission, item.detail, item.qrPayload, accountDonorName)
          .map((previewItem) => ({
            ...previewItem,
            bundleNumber: index + 1,
            key: `${previewItem.key}-${item.qrPayload || index}`,
          }))
      ));
    }
    return buildHairSubmissionPreviewItems(submission, detail, qrPayload, accountDonorName);
  }, [accountDonorName, detail, qrItems, qrPayload, submission]);

  const handlePrintQr = React.useCallback(async (bundle) => {
    if (!bundle?.qrPayload) return;

    setPrintingQrKey(bundle.key);
    setPrintFeedback({ message: '', variant: 'info' });

    try {
      await printDonationQrPdf({
        title: 'DONIVRA HAIR DONATION',
        subtitle: 'Attach this QR label to the matching parcel or hair bundle.',
        helperText: 'If you added multiple hair bundles, each bundle must use its own matching QR label.',
        qrPayloadText: bundle.qrPayload,
        details: [
          { label: 'Hair Item Code', value: bundle.hairItemCode || `Hair ${bundle.bundleNumber || ''}` },
          { label: 'Hair Owner', value: bundle.donorName || '' },
          { label: 'Donation Code', value: bundle.donationCode || '' },
          { label: 'Instruction', value: 'Attach this QR label to the matching parcel or hair bundle.' },
          { label: 'Length', value: bundle.lengthLabel || '' },
          { label: 'Condition', value: bundle.condition || '' },
          { label: 'Color', value: bundle.color || '' },
          { label: 'Density', value: bundle.density || '' },
        ],
      });
      setPrintFeedback({ message: 'Print dialog opened. Attach the printed QR to the parcel or hair bundle before submitting it at the donation site.', variant: 'success' });
    } catch (_error) {
      setPrintFeedback({ message: 'Unable to open the print dialog right now. Please try again.', variant: 'error' });
    } finally {
      setPrintingQrKey('');
    }
  }, []);

  const handleSaveQr = React.useCallback(async (bundle) => {
    if (!bundle?.qrPayload) return;

    setSavingQrKey(bundle.key);
    setPrintFeedback({ message: '', variant: 'info' });

    const result = await saveDonationQrPngToDevice({
      qrPayloadText: bundle.qrPayload,
      fileName: `donivra-hair-${bundle.bundleNumber || 'qr'}-${bundle.donorName || 'donor'}`,
    });

    setSavingQrKey('');
    setPrintFeedback({
      message: result.success
        ? 'QR image saved to this device. Attach it to the parcel or hair bundle before submitting at the donation site.'
        : (result.error || 'Unable to save the QR image right now.'),
      variant: result.success ? 'success' : 'error',
    });
  }, []);

  const handlePrintAllQr = React.useCallback(async () => {
    const printableItems = previewItems.filter((item) => item.qrPayload);
    if (!printableItems.length) return;

    setPrintFeedback({ message: '', variant: 'info' });
    try {
      await printDonationQrLabelsPdf({
        labels: printableItems.map((bundle) => ({
          title: bundle.hairItemCode || `Hair ${bundle.bundleNumber || ''}`,
          subtitle: 'Attach this QR label to the matching parcel or hair bundle.',
          qrPayloadText: bundle.qrPayload,
          details: [
            { label: 'Hair Item Code', value: bundle.hairItemCode || `Hair ${bundle.bundleNumber || ''}` },
            { label: 'Hair Owner', value: bundle.donorName || '' },
            { label: 'Donation Code', value: bundle.donationCode || '' },
            { label: 'Instruction', value: 'Attach this QR label to the matching parcel or hair bundle.' },
          ],
        })),
      });
      setPrintFeedback({ message: 'Print dialog opened for all QR labels.', variant: 'success' });
    } catch (_error) {
      setPrintFeedback({ message: 'Unable to print all QR labels right now. Please try again.', variant: 'error' });
    }
  }, [previewItems]);

  return (
    <ModalShell
      visible={visible}
      title="Preview hair submission"
      subtitle={isSubmitted
        ? 'These QR codes are already generated. Attach each QR to the matching parcel or hair bundle.'
        : 'Confirm these details before generating the QR for the parcel or hair bundle.'}
      onClose={onClose}
      cardBackground={roles.defaultCardBackground}
      scrollContent
      footer={isSubmitted ? (
        <AppButton title="Close" onPress={onClose} disabled={isSubmitting} />
      ) : (
        <View style={styles.modalFooterActions}>
          <View style={styles.modalFooterActionHalf}>
            <AppButton title="Edit details" variant="outline" onPress={onEditDetails || onClose} disabled={isSubmitting} />
          </View>
          <View style={styles.modalFooterActionHalf}>
            <AppButton
              title={isSubmitting ? 'Submitting...' : 'Submit donation'}
              onPress={onConfirm}
              loading={isSubmitting}
              disabled={isSubmitting}
            />
          </View>
        </View>
      )}
    >
      {printFeedback.message ? (
        <StatusBanner message={printFeedback.message} variant={printFeedback.variant} style={styles.bannerSpacing} />
      ) : null}
      {previewItems.length > 1 ? (
        <AppButton
          title="Print All QR Labels"
          variant="outline"
          onPress={handlePrintAllQr}
          style={styles.bannerSpacing}
        />
      ) : null}
      <BundlePreviewPanel
        roles={roles}
        bundles={previewItems}
        onPrintQr={handlePrintQr}
        printingQrKey={printingQrKey}
        onSaveQr={handleSaveQr}
        savingQrKey={savingQrKey}
      />
    </ModalShell>
  );
}

export function DonorDonationStatusScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user, profile, resolvedTheme } = useAuth();
  const isMobileViewport = width < 768;
  const roles = resolveThemeRoles(resolvedTheme, { isMobile: isMobileViewport });
  const headerPrimaryColor = resolvedTheme?.primaryColor || roles.primaryActionBackground;
  const { logout, isLoggingOut } = useAuthActions();
  const { unreadCount } = useNotifications({
    role: 'donor',
    userId: user?.id,
    userEmail: user?.email || profile?.email || '',
    databaseUserId: profile?.user_id,
    mode: 'badge',
    liveUpdates: true,
  });

  // â”€â”€ Module data
  const cacheMatchesUser = Boolean(cachedDonorDonationModuleData && cachedDonorDonationModuleUserId === user?.id);
  const moduleDataRef = React.useRef(cacheMatchesUser ? cachedDonorDonationModuleData : null);
  const [moduleData, setModuleData] = React.useState(cacheMatchesUser ? cachedDonorDonationModuleData : null);
  const [isLoading, setIsLoading] = React.useState(!cacheMatchesUser);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [screenError, setScreenError] = React.useState('');
  const [moduleFeedback, setModuleFeedback] = React.useState({ message: '', variant: 'info' });

  // â”€â”€ Manual form
  const [isManualModalOpen, setIsManualModalOpen] = React.useState(false);
  const [manualForm, setManualForm] = React.useState(MANUAL_FORM_DEFAULTS);
  const [manualFormErrors, setManualFormErrors] = React.useState({});
  const [manualPhoto, setManualPhoto] = React.useState(null);
  const [manualFeedback, setManualFeedback] = React.useState({ message: '', variant: 'info' });
  const [isSavingManual, setIsSavingManual] = React.useState(false);
  const [manualEditTarget, setManualEditTarget] = React.useState(null);
  const [isGeneratingQr, setIsGeneratingQr] = React.useState(false);
  const [removingHairKey, setRemovingHairKey] = React.useState('');

  // â”€â”€ Parcel photo
  const [isAddBundleModalOpen, setIsAddBundleModalOpen] = React.useState(false);
  const [bundleForm, setBundleForm] = React.useState(ADDITIONAL_BUNDLE_DEFAULTS);
  const [bundleErrors, setBundleErrors] = React.useState({});
  const [bundlePhoto, setBundlePhoto] = React.useState(null);
  const [bundleFeedback, setBundleFeedback] = React.useState({ message: '', variant: 'info' });
  const [isSavingBundle, setIsSavingBundle] = React.useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = React.useState(false);
  const [isHairEligibilityPromptOpen, setIsHairEligibilityPromptOpen] = React.useState(false);
  const [isCancellingDonation, setIsCancellingDonation] = React.useState(false);
  const [, setIsSubmitPreviewOpen] = React.useState(false);
  const [isGeneratingEventRsvp, setIsGeneratingEventRsvp] = React.useState(false);
  const [selectedDriveForDonation, setSelectedDriveForDonation] = React.useState(null);
  const [donationModuleScreen, setDonationModuleScreen] = React.useState(DONATION_MODULE_SCREEN.EVENTS);
  const [recipientPatients, setRecipientPatients] = React.useState([]);
  const [selectedRecipient, setSelectedRecipient] = React.useState({ type: 'organization', patient: null });
  const [selectedDonationStatusItem, setSelectedDonationStatusItem] = React.useState(null);
  const [qrActionFeedback, setQrActionFeedback] = React.useState({ message: '', variant: 'info' });
  const [printingQrKey, setPrintingQrKey] = React.useState('');
  const [savingQrKey, setSavingQrKey] = React.useState('');
  // When the user picks a view manually, stop auto-routing away from it.
  const hasManualDonationViewSelectionRef = React.useRef(false);

  const avatarInitials = `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.trim();
  const firstName = String(profile?.first_name || '').trim();
  const accountDonorName = [
    profile?.first_name,
    profile?.middle_name,
    profile?.last_name,
    profile?.suffix,
  ].map((part) => String(part || '').trim()).filter(Boolean).join(' ') || profile?.email || 'Account owner';

  // â”€â”€ Load module data
  const loadModuleData = React.useCallback(async ({ silent = false } = {}) => {
    if (!user?.id) return;
    if (!silent && !moduleDataRef.current) {
      setIsLoading(true);
    }
    setScreenError('');
    const [result, logisticsSettingsResult] = await Promise.all([
      getDonorDonationsModuleData({
        userId: user.id,
        databaseUserId: profile?.user_id || null,
      }),
      fetchLatestLogisticsSettings(),
    ]);
    const mergedResult = {
      ...result,
      logisticsSettings: logisticsSettingsResult.data || null,
    };
    cachedDonorDonationModuleData = mergedResult;
    cachedDonorDonationModuleUserId = user.id;
    moduleDataRef.current = mergedResult;
    setModuleData(mergedResult);
    setIsLoading(false);
    setIsRefreshing(false);
    if (result.error) setScreenError(getFriendlyDonationModuleError(result.error));
  }, [profile?.user_id, user?.id]);

  const handleRefreshModuleData = React.useCallback(async () => {
    if (!user?.id) return;
    setIsRefreshing(true);
    await loadModuleData({ silent: true });
  }, [loadModuleData, user?.id]);

  const donationRealtimeRefreshRef = React.useRef(null);
  const scheduleDonationRealtimeRefresh = React.useCallback(() => {
    if (donationRealtimeRefreshRef.current) {
      clearTimeout(donationRealtimeRefreshRef.current);
    }

    donationRealtimeRefreshRef.current = setTimeout(() => {
      void loadModuleData({ silent: true });
    }, DONATION_REALTIME_DEBOUNCE_MS);
  }, [loadModuleData]);

  React.useEffect(() => { loadModuleData(); }, [loadModuleData]);

  React.useEffect(() => () => {
    if (donationRealtimeRefreshRef.current) {
      clearTimeout(donationRealtimeRefreshRef.current);
    }
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    const loadRecipientPatients = async () => {
      const { data } = await supabase
        .from('Patients')
        .select('Patient_ID, Patient_Code, Medical_Condition, Patient_Picture, User_ID')
        .limit(12);
      if (!isMounted) return;

      const patientRows = data || [];
      const patientUserIds = [
        ...new Set(patientRows.map((patient) => Number(patient.User_ID)).filter((value) => Number.isFinite(value) && value > 0)),
      ];
      let detailsByUserId = new Map();
      if (patientUserIds.length) {
        const { data: detailsData } = await supabase
          .from('user_details')
          .select('user_id, first_name, middle_name, last_name, suffix')
          .in('user_id', patientUserIds);

        if (!isMounted) return;
        detailsByUserId = new Map(
          (detailsData || []).map((detail) => {
            const fullName = [
              detail.first_name,
              detail.middle_name,
              detail.last_name,
              detail.suffix,
            ].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
            return [Number(detail.user_id), fullName];
          })
        );
      }

      setRecipientPatients((data || []).map((patient) => ({
        patient_id: patient.Patient_ID,
        patient_code: patient.Patient_Code,
        patient_name: detailsByUserId.get(Number(patient.User_ID)) || `Patient ${patient.Patient_ID}`,
        medical_condition: patient.Medical_Condition,
        patient_picture: patient.Patient_Picture,
      })));
    };

    void loadRecipientPatients();
    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (donationRealtimeRefreshRef.current) {
        clearTimeout(donationRealtimeRefreshRef.current);
      }
    };
  }, []);

  // â”€â”€ Derived state
  const donorProfileMeta = React.useMemo(() => buildProfileCompletionMeta({
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
  }), [profile]);

  const isProfileComplete = donorProfileMeta.isComplete;
  const latestScreening = moduleData?.latestScreening || null;
  const screeningDate = latestScreening?.created_at || '';
  const screeningLabel = screeningDate ? formatDateLabel(screeningDate) : '';
  const isHairFresh = Boolean(
    screeningDate && Date.now() - new Date(screeningDate).getTime() <= 30 * 24 * 60 * 60 * 1000
  );
  const isAiEligible = Boolean(moduleData?.isAiEligible);
  const hasHairScanLog = Boolean(latestScreening && moduleData?.latestAnalysisEntry?.submission);
  const hairEligibilityMessage = latestScreening
    ? isAiEligible
      ? 'Your latest eligible hair scan will be used for this donation.'
      : (moduleData?.latestAiEligibility?.reason || 'Your latest AI hair screening is not eligible for donation yet. Please follow the recommendations and scan again before donating.')
    : 'Scan your hair first so the system can confirm if you are eligible to join this donation event.';
  const logisticEligibilityPromptTitle = !hasHairScanLog
    ? 'Hair Check Required'
    : 'Not Eligible for Donation Yet';
  const logisticEligibilityPromptMessage = !hasHairScanLog
    ? 'Complete Hair Check in Analysis first so we can confirm if your hair is eligible for a logistic donation.'
    : `${hairEligibilityMessage} Open Analysis to review your latest result before starting a logistic donation.`;
  const hasOngoingDonation = Boolean(moduleData?.hasOngoingDonation);
  const effectiveDonationModuleScreen = donationModuleScreen;
  const activeDonationTabKey = React.useMemo(() => (
    [
      DONATION_MODULE_SCREEN.EVENTS,
      DONATION_MODULE_SCREEN.EVENT_DETAILS,
      DONATION_MODULE_SCREEN.SUMMARY,
      DONATION_MODULE_SCREEN.RECIPIENT,
      DONATION_MODULE_SCREEN.QR_CODES,
    ].includes(effectiveDonationModuleScreen)
      ? 'hair-event'
      : 'logistic'
  ), [effectiveDonationModuleScreen]);
  const independentQrState = moduleData?.independentQrState || null;
  const hasGeneratedDonationQr = Boolean(independentQrState?.reference);

  React.useEffect(() => {
    if (!hasGeneratedDonationQr) return;
    if (!moduleFeedback?.message) return;

    const normalizedMessage = String(moduleFeedback.message).toLowerCase();
    if (normalizedMessage.includes('qr was generated but could not be persisted')) {
      setModuleFeedback({ message: '', variant: 'info' });
    }
  }, [hasGeneratedDonationQr, moduleFeedback?.message]);

  const certificate = moduleData?.certificate || null;
  const donationDrives = React.useMemo(() => (
    moduleData?.drives || []
  ), [moduleData?.drives]);

  React.useEffect(() => {
    if (hasManualDonationViewSelectionRef.current) return;
    const routeDriveId = Array.isArray(routeParams.driveId) ? routeParams.driveId[0] : routeParams.driveId;
    const numericRouteDriveId = Number(routeDriveId);
    if (!Number.isFinite(numericRouteDriveId) || numericRouteDriveId <= 0) return;

    const matchingDrive = (moduleData?.drives || []).find((drive) => Number(drive?.donation_drive_id) === numericRouteDriveId);
    const hasSubmittedDonationForRouteDrive = [
      ...(Array.isArray(moduleData?.activeSubmissions) ? moduleData.activeSubmissions : []),
      moduleData?.latestSubmission,
    ].filter(Boolean).some((submission) => Number(submission?.donation_drive_id) === numericRouteDriveId);

    if (hasSubmittedDonationForRouteDrive) return;

    if (matchingDrive && donationModuleScreen === DONATION_MODULE_SCREEN.EVENTS && !hasSubmittedDonationForRouteDrive) {
      setSelectedDriveForDonation(matchingDrive);
      setDonationModuleScreen(DONATION_MODULE_SCREEN.EVENT_DETAILS);
      return;
    }

    if (moduleData?.hasOngoingDonation) {
      setDonationModuleScreen(DONATION_MODULE_SCREEN.MY_DONATIONS);
      return;
    }

    // Only auto-open event details from route when the module is still on the events list.
    // This prevents route-based state from overriding the next-step flow (summary/QR screens).
    if (matchingDrive && donationModuleScreen === DONATION_MODULE_SCREEN.EVENTS) {
      setSelectedDriveForDonation(matchingDrive);
      setDonationModuleScreen(DONATION_MODULE_SCREEN.EVENT_DETAILS);
    }
  }, [
    donationModuleScreen,
    moduleData?.activeSubmissions,
    moduleData?.drives,
    moduleData?.hasOngoingDonation,
    moduleData?.latestSubmission,
    routeParams.driveId,
  ]);

  // Active drive from submission
  const activeDriveFromSubmission = moduleData?.activeDrive || null;
  const displayDrive = activeDriveFromSubmission || selectedDriveForDonation || donationDrives[0] || null;
  const selectedDriveFromList = (moduleData?.drives || []).find(
    (drive) => Number(drive?.donation_drive_id) === Number(selectedDriveForDonation?.donation_drive_id)
  ) || null;
  const selectedFlowDrive = selectedDriveFromList || selectedDriveForDonation || displayDrive;
  const selectedDonationDriveId = (
    selectedDriveForDonation?.donation_drive_id
    || activeDriveFromSubmission?.donation_drive_id
    || displayDrive?.donation_drive_id
    || null
  );
  const trackedSubmissionId = moduleData?.latestSubmission?.submission_id || null;
  const trackedDetailIds = React.useMemo(() => {
    const activeSubmissions = Array.isArray(moduleData?.activeSubmissions)
      ? moduleData.activeSubmissions
      : [];
    const activeDetails = activeSubmissions.flatMap((submission) => (
      Array.isArray(submission?.submission_details) ? submission.submission_details : []
    ));
    const latestDetails = Array.isArray(moduleData?.latestSubmission?.submission_details)
      ? moduleData.latestSubmission.submission_details
      : [];
    const fallback = moduleData?.latestDetail ? [moduleData.latestDetail] : [];
    const detailSource = activeDetails.length ? activeDetails : latestDetails.length ? latestDetails : fallback;

    return [...new Set(
      detailSource
        .map((item) => Number(item?.submission_detail_id))
        .filter((value) => Number.isFinite(value) && value > 0)
    )];
  }, [moduleData?.activeSubmissions, moduleData?.latestDetail, moduleData?.latestSubmission?.submission_details]);
  const trackedDetailIdsKey = React.useMemo(
    () => trackedDetailIds.join(','),
    [trackedDetailIds]
  );

  React.useEffect(() => {
    if (!user?.id || !profile?.user_id) return undefined;

    const channel = supabase.channel(`donor-donation-live-${profile.user_id}`);
    const onRealtimeEvent = () => {
      scheduleDonationRealtimeRefresh();
    };
    const onCertificateRealtimeEvent = (payload = {}) => {
      if (payload?.eventType !== 'INSERT') return;
      setModuleFeedback({
        message: 'Certificate is now available in Achievements.',
        variant: 'success',
      });
      scheduleDonationRealtimeRefresh();
    };

    channel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Event_Requests',
      }, onRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Event_Attendees',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Hair_Submissions',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Donation_Certificates',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onCertificateRealtimeEvent);

    if (trackedSubmissionId) {
      channel
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'Hair_Submission_Details',
          filter: `Submission_ID=eq.${trackedSubmissionId}`,
        }, onRealtimeEvent)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'Hair_Submission_Logistics',
          filter: `Submission_ID=eq.${trackedSubmissionId}`,
        }, onRealtimeEvent)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'Hair_Bundle_Tracking_History',
          filter: `Submission_ID=eq.${trackedSubmissionId}`,
        }, onRealtimeEvent)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'Donation_Certificates',
          filter: `Submission_ID=eq.${trackedSubmissionId}`,
        }, onCertificateRealtimeEvent);
    }

    trackedDetailIds.forEach((detailId) => {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Hair_Submission_Images',
        filter: `Submission_Detail_ID=eq.${detailId}`,
      }, onRealtimeEvent);
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    profile?.user_id,
    scheduleDonationRealtimeRefresh,
    trackedDetailIds,
    trackedDetailIdsKey,
    trackedSubmissionId,
    user?.id,
  ]);

  // QR payload for the active independent donation
  const activeDonationQrItems = React.useMemo(() => {
    const submissions = Array.isArray(moduleData?.activeSubmissions)
      ? moduleData.activeSubmissions
      : [];

    return submissions
      .filter((submission) => submission?.submission_id)
      .flatMap((submission) => {
        const submissionDetails = Array.isArray(submission?.submission_details)
          ? submission.submission_details.filter((detail) => !isRemovedHairDetail(detail))
          : [];
        const fallbackDetail = Number(moduleData?.latestDetail?.submission_id) === Number(submission.submission_id)
          && !isRemovedHairDetail(moduleData.latestDetail)
          ? moduleData.latestDetail
          : getLatestPreviewDetail(submission);
        const details = submissionDetails.length ? submissionDetails : (fallbackDetail && !isRemovedHairDetail(fallbackDetail) ? [fallbackDetail] : []);
        const payloadSubmission = selectedDonationDriveId && !submission?.donation_drive_id
          ? { ...submission, donation_drive_id: selectedDonationDriveId }
          : submission;

        return details.map((detail, index) => ({
          key: `${submission.submission_id}-${detail?.submission_detail_id || index}`,
          submission,
          detail,
          qrPayload: buildDonationTrackingQrPayload({
            submission: payloadSubmission,
            detail,
            drive: selectedDriveForDonation || displayDrive || null,
          }),
        }));
      });
  }, [
    displayDrive,
    moduleData?.activeSubmissions,
    moduleData?.latestDetail,
    selectedDonationDriveId,
    selectedDriveForDonation,
  ]);
  const activeDonationQrPayload = activeDonationQrItems[0]?.qrPayload || '';
  const donationPreviewItems = React.useMemo(() => {
    if (activeDonationQrItems.length) {
      return activeDonationQrItems.flatMap((item, index) => (
        buildHairSubmissionPreviewItems(item.submission, item.detail, item.qrPayload, accountDonorName)
          .map((previewItem) => ({
            ...previewItem,
            bundleNumber: index + 1,
            key: `${previewItem.key}-${item.qrPayload || index}`,
          }))
      ));
    }
    return [];
  }, [
    accountDonorName,
    activeDonationQrItems,
  ]);
  const hasSubmittedDonationQr = Boolean(
    activeDonationQrItems.length && activeDonationQrItems.every(isSubmittedDonationItem)
  );
  const myDonationItems = React.useMemo(() => {
    const driveById = new Map(
      [activeDriveFromSubmission, selectedDriveForDonation, ...donationDrives]
        .filter(Boolean)
        .map((drive) => [Number(drive?.donation_drive_id), drive])
    );
    const submissionSource = Array.isArray(moduleData?.activeSubmissions) && moduleData.activeSubmissions.length
      ? moduleData.activeSubmissions
      : (moduleData?.latestSubmission ? [moduleData.latestSubmission] : []);
    const submissionGroups = new Map();

    submissionSource
      .filter((submission) => submission?.submission_id && !isClosedDonationStatus(submission?.status))
      .forEach((submission) => {
        const driveId = Number(submission?.donation_drive_id);
        const groupKey = Number.isFinite(driveId) && driveId > 0
          ? `drive-${driveId}`
          : `submission-${submission.submission_id}`;
        const current = submissionGroups.get(groupKey) || [];
        submissionGroups.set(groupKey, [...current, submission]);
      });

    const items = Array.from(submissionGroups.entries()).map(([groupKey, submissions]) => {
      const primarySubmission = [...submissions]
        .sort((left, right) => new Date(right?.updated_at || right?.created_at || 0) - new Date(left?.updated_at || left?.created_at || 0))[0];
      const driveId = Number(primarySubmission?.donation_drive_id);
      const drive = driveById.get(driveId) || activeDriveFromSubmission || selectedDriveForDonation || null;
      const groupQrItems = activeDonationQrItems.filter((item) => (
        submissions.some((submission) => Number(submission?.submission_id) === Number(item?.submission?.submission_id))
      ));
      const previewItems = groupQrItems.flatMap((item, index) => (
        buildHairSubmissionPreviewItems(item.submission, item.detail, item.qrPayload, accountDonorName)
          .map((previewItem) => ({
            ...previewItem,
            bundleNumber: index + 1,
            key: `${previewItem.key}-${item.qrPayload || index}`,
          }))
      ));
      const statusMeta = getDonationCardMeta({
        submission: primarySubmission,
        drive,
        logistics: moduleData?.logistics || null,
      });
      const canCancel = canCancelDonationSubmission({
        submission: primarySubmission,
        registration: drive?.registration || null,
        certificate,
        timelineStages: moduleData?.timelineStages || [],
        timelineEvents: moduleData?.timelineEvents || [],
        trackingEntries: moduleData?.trackingEntries || [],
      });

      return {
        key: groupKey,
        type: 'submission',
        submission: primarySubmission,
        submissions,
        previewItems,
        drive,
        title: drive?.event_title || 'Hair donation',
        organizationName: getDriveOrganizationLabel(drive),
        recipientName: selectedRecipient?.type === 'patient'
          ? selectedRecipient?.patient?.patient_name || ''
          : getDriveOrganizationLabel(drive),
        dateLabel: getDriveDateLabel(drive),
        locationLabel: getDriveLocationLabel(drive),
        imageUrl: drive?.event_image_url || drive?.organization_logo_url || '',
        statusLabel: statusMeta.label,
        statusCategory: statusMeta.category,
        statusIcon: statusMeta.icon,
        canCancel,
        hairCount: groupQrItems.length || previewItems.length || submissions.length,
        updatedAt: primarySubmission?.updated_at || primarySubmission?.created_at || '',
      };
    });

    const activeSubmissionDriveIds = new Set(
      items
        .map((item) => Number(item?.drive?.donation_drive_id || item?.submission?.donation_drive_id))
        .filter((value) => Number.isFinite(value) && value > 0)
    );

    donationDrives
      .filter((drive) => !activeSubmissionDriveIds.has(Number(drive?.donation_drive_id)))
      .forEach((drive) => {
        const statusMeta = getDonationCardMeta({ drive });
        items.push({
          key: `drive-${drive?.donation_drive_id || drive?.event_title}`,
          type: 'drive',
          submission: null,
          submissions: [],
          previewItems: [],
          drive,
          title: drive?.event_title || 'Donation drive',
          organizationName: getDriveOrganizationLabel(drive),
          recipientName: getDriveOrganizationLabel(drive),
          dateLabel: getDriveDateLabel(drive),
          locationLabel: getDriveLocationLabel(drive),
          imageUrl: drive?.event_image_url || drive?.organization_logo_url || '',
          statusLabel: statusMeta.label,
          statusCategory: statusMeta.category,
          statusIcon: statusMeta.icon,
          hairCount: 0,
          updatedAt: drive?.start_date || drive?.updated_at || '',
        });
      });

    return items.sort((left, right) => {
      const leftPriority = left.submission ? 0 : 1;
      const rightPriority = right.submission ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0);
    });
  }, [
    accountDonorName,
    activeDonationQrItems,
    activeDriveFromSubmission,
    certificate,
    donationDrives,
    moduleData?.activeSubmissions,
    moduleData?.latestSubmission,
    moduleData?.logistics,
    moduleData?.timelineEvents,
    moduleData?.timelineStages,
    moduleData?.trackingEntries,
    selectedDriveForDonation,
    selectedRecipient?.patient?.patient_name,
    selectedRecipient?.type,
  ]);
  const selectedDonationTimelineItem = React.useMemo(() => {
    if (selectedDonationStatusItem?.key) {
      return myDonationItems.find((item) => item.key === selectedDonationStatusItem.key) || selectedDonationStatusItem;
    }
    return myDonationItems.find((item) => item.submission) || myDonationItems[0] || null;
  }, [myDonationItems, selectedDonationStatusItem]);
  const handleShowHairEventTab = React.useCallback(() => {
    hasManualDonationViewSelectionRef.current = true;
    setSelectedDonationStatusItem(null);
    setDonationModuleScreen(DONATION_MODULE_SCREEN.EVENTS);
    setIsHairEligibilityPromptOpen(false);
  }, []);
  const handleShowLogisticTab = React.useCallback(() => {
    hasManualDonationViewSelectionRef.current = true;
    setSelectedDonationStatusItem(null);
    setDonationModuleScreen(DONATION_MODULE_SCREEN.MY_DONATIONS);
    setIsHairEligibilityPromptOpen(false);
  }, []);
  const handleAddLogisticDonation = React.useCallback(() => {
    if (!hasHairScanLog || !isAiEligible) {
      setIsHairEligibilityPromptOpen(true);
      return;
    }
    hasManualDonationViewSelectionRef.current = true;
    setIsHairEligibilityPromptOpen(false);
    router.navigate('/donor/donations');
  }, [hasHairScanLog, isAiEligible, router]);
  const handleStartHairCheckFromPrompt = React.useCallback(() => {
    setIsHairEligibilityPromptOpen(false);
    router.push('/donor/donations');
  }, [router]);

  React.useEffect(() => {
    if (hasManualDonationViewSelectionRef.current) return;
    const routeDriveId = Array.isArray(routeParams.driveId) ? routeParams.driveId[0] : routeParams.driveId;
    const numericRouteDriveId = Number(routeDriveId);
    if (!Number.isFinite(numericRouteDriveId) || numericRouteDriveId <= 0) return;
    if (donationModuleScreen !== DONATION_MODULE_SCREEN.EVENTS) return;

    const matchingDonationItem = myDonationItems.find((item) => (
      item?.submission
      && Number(item?.submission?.donation_drive_id) > 0
      && Number(item?.submission?.donation_drive_id || item?.drive?.donation_drive_id) === numericRouteDriveId
    ));
    if (!matchingDonationItem) return;

    setSelectedDonationStatusItem(matchingDonationItem);
    setDonationModuleScreen(DONATION_MODULE_SCREEN.DONATION_STATUS);
  }, [donationModuleScreen, myDonationItems, routeParams.driveId]);

  const handleNavPress = React.useCallback((item) => {
    if (!item.route || item.route === '/donor/status') return;
    router.navigate(item.route);
  }, [router]);

  // â”€â”€ AI log path
  const guardDonationPermission = React.useCallback(async () => {
    const permission = await canSubmitHairDonation(profile?.user_id || null);
    if (permission.allowed) return true;

    if (permission.reason === DONOR_PERMISSION_REASONS.profileIncomplete) {
      router.navigate('/profile');
      return false;
    }

    if (permission.reason === DONOR_PERMISSION_REASONS.guardianConsentRequired) {
      router.navigate('/donor/guardian-consent');
      return false;
    }

    setModuleFeedback({ message: mapDonationPermissionError(permission.reason), variant: 'error' });
    return false;
  }, [profile?.user_id, router]);

  const handleProceedWithHairLog = React.useCallback(async () => {
    const hasPermission = await guardDonationPermission();
    if (!hasPermission) return false;

    const aiDonation = moduleData?.latestAiDonation || moduleData?.latestAnalysisEntry;
    if (!aiDonation?.submission) {
      setModuleFeedback({
        message: 'No saved hair scan log found. Open CheckHair and scan first.',
        variant: 'error',
      });
      return false;
    }
    setModuleFeedback({ message: 'Saving donation detailsâ€¦', variant: 'info' });
    setIsGeneratingQr(true);
    const draftResult = await startIndependentDonationDraft({
      userId: user?.id,
      submission: aiDonation.submission,
      databaseUserId: profile?.user_id || null,
      donationDriveId: selectedDonationDriveId,
    });
    setIsGeneratingQr(false);
    setModuleFeedback({
      message: draftResult.success
        ? 'Hair details saved. Staff will issue the waybill QR after submission.'
        : (draftResult.error || 'Could not save donation details right now.'),
      variant: draftResult.success ? 'success' : 'error',
    });
    await loadModuleData();
    return Boolean(draftResult.success);
  }, [
    loadModuleData,
    moduleData?.latestAiDonation,
    moduleData?.latestAnalysisEntry,
    profile?.user_id,
    guardDonationPermission,
    selectedDonationDriveId,
    user?.id,
  ]);

  // â”€â”€ Manual path
  void handleProceedWithHairLog;

  const handleOpenManualModal = React.useCallback(() => {
    if (!isProfileComplete) { router.navigate('/profile'); return; }
    if (!isHairFresh && !selectedDriveForDonation) { router.navigate('/donor/donations'); return; }
    setManualEditTarget(null);
    const screening = moduleData?.latestScreening;
    if (screening) {
      const estLengthCm = Number(screening.estimated_length);
      const estLengthIn = estLengthCm > 0 ? String((estLengthCm / 2.54).toFixed(1)) : '';
      setManualForm({ ...MANUAL_FORM_DEFAULTS, lengthValue: estLengthIn });
    } else {
      setManualForm(MANUAL_FORM_DEFAULTS);
    }
    setManualFormErrors({});
    setManualPhoto(null);
    setManualFeedback({ message: '', variant: 'info' });
    setIsManualModalOpen(true);
  }, [isHairFresh, isProfileComplete, moduleData?.latestScreening, router, selectedDriveForDonation]);

  const updateManualField = React.useCallback((field, value) => {
    setManualForm((prev) => ({ ...prev, [field]: value }));
    setManualFormErrors((prev) => ({
      ...prev,
      [field]: '',
      donorType: '',
      ...(field === 'donorType' ? {
        donorName: '',
        donorBirthdate: '',
        relationshipToSubmitter: '',
        consentConfirmed: '',
      } : {}),
      photo: '',
    }));
  }, []);

  const handlePickManualPhoto = React.useCallback(async (mode = 'library') => {
    const picker = mode === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await picker({ mediaTypes: ['images'], allowsEditing: true, quality: 0.72, base64: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setManualPhoto({ uri: asset.uri, base64: asset.base64 || '', mimeType: asset.mimeType || 'image/jpeg', fileName: asset.fileName || '' });
    setManualFormErrors((prev) => ({ ...prev, photo: '' }));
  }, []);

  const handleSaveManualDetails = React.useCallback(async () => {
    const nextErrors = {};
    const numericLength = Number(manualForm.lengthValue);
    if (!Number.isFinite(numericLength) || numericLength <= 0) {
      nextErrors.lengthValue = 'Enter a valid hair length.';
    }
    if (manualForm.donorType === 'different') {
      if (!String(manualForm.donorName || '').trim()) {
        nextErrors.donorName = 'Enter the hair owner name or label.';
      }
      if (!String(manualForm.relationshipToSubmitter || '').trim()) {
        nextErrors.relationshipToSubmitter = 'Enter your relationship to the hair owner.';
      }
      if (!manualForm.consentConfirmed) {
        nextErrors.consentConfirmed = 'Confirm consent before saving this hair item.';
      }
    }
    if (!manualEditTarget && !manualPhoto) {
      nextErrors.photo = 'Please upload or capture a hair photo.';
    }
    if (Object.keys(nextErrors).length) {
      setManualFormErrors(nextErrors);
      return;
    }

    setIsSavingManual(true);
    if (manualEditTarget?.submission?.submission_id && manualEditTarget?.detail?.submission_detail_id) {
      const result = await updateManualDonationDetail({
        userId: user?.id,
        databaseUserId: profile?.user_id || null,
        donorType: manualForm.donorType,
        submission: manualEditTarget.submission,
        detail: manualEditTarget.detail,
        manualDetails: {
          length_value: numericLength,
          length_unit: manualForm.lengthUnit,
          bundle_quantity: 1,
          treated: manualForm.treated,
          colored: manualForm.colored,
          trimmed: manualForm.trimmed,
          hair_color: manualForm.hairColor,
          density: manualForm.density,
          donor_name: manualForm.donorType === 'different' ? String(manualForm.donorName || '').trim() : null,
          donor_birthdate: manualForm.donorType === 'different' ? String(manualForm.donorBirthdate || '').trim() : null,
          relationship_to_submitter: manualForm.donorType === 'different' ? String(manualForm.relationshipToSubmitter || '').trim() : null,
          consent_confirmed: manualForm.donorType === 'different' ? Boolean(manualForm.consentConfirmed) : true,
          donor_age: manualForm.donorType === 'different' ? getAgeFromBirthdate(manualForm.donorBirthdate) : null,
          donor_is_minor: manualForm.donorType === 'different'
            ? Number(getAgeFromBirthdate(manualForm.donorBirthdate)) < 18
            : null,
        },
        photo: manualPhoto,
        donationRequirement: moduleData?.latestDonationRequirement || null,
      });
      setIsSavingManual(false);

      if (!result.success) {
        setManualFeedback({ message: result.error || 'Could not update details. Please try again.', variant: 'error' });
        return;
      }

      setManualEditTarget(null);
      setManualPhoto(null);
      setIsManualModalOpen(false);
      setModuleFeedback({
        message: result.canProceed
          ? 'Hair details updated. You can continue to submit this donation.'
          : (result.qualification?.reason || 'Hair details updated but do not meet donation requirements yet.'),
        variant: result.canProceed ? 'success' : 'info',
      });
      await loadModuleData();
      setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
      return;
    }

    const activeIndependentDraft = moduleData?.latestSubmission
      && !Number(moduleData.latestSubmission?.donation_drive_id)
      && ['draft', 'qr generated'].includes(String(moduleData.latestSubmission?.status || '').trim().toLowerCase())
      ? moduleData.latestSubmission
      : null;

    if (activeIndependentDraft?.submission_id) {
      const result = await addDonationBundleFromManualDetails({
        userId: user?.id,
        databaseUserId: profile?.user_id || null,
        donorType: manualForm.donorType,
        submission: activeIndependentDraft,
        manualDetails: {
          length_value: numericLength,
          length_unit: manualForm.lengthUnit,
          bundle_quantity: 1,
          treated: manualForm.treated,
          colored: manualForm.colored,
          trimmed: manualForm.trimmed,
          hair_color: manualForm.hairColor,
          density: manualForm.density,
          donor_name: manualForm.donorType === 'different' ? String(manualForm.donorName || '').trim() : null,
          donor_birthdate: manualForm.donorType === 'different' ? String(manualForm.donorBirthdate || '').trim() : null,
          relationship_to_submitter: manualForm.donorType === 'different' ? String(manualForm.relationshipToSubmitter || '').trim() : null,
          consent_confirmed: manualForm.donorType === 'different' ? Boolean(manualForm.consentConfirmed) : true,
          donor_age: manualForm.donorType === 'different' ? getAgeFromBirthdate(manualForm.donorBirthdate) : null,
          donor_is_minor: manualForm.donorType === 'different'
            ? Number(getAgeFromBirthdate(manualForm.donorBirthdate)) < 18
            : null,
        },
        photo: manualPhoto,
      });
      setIsSavingManual(false);

      if (!result.success) {
        setManualFeedback({ message: result.error || 'Could not save this hair item. Please try again.', variant: 'error' });
        return;
      }

      setIsManualModalOpen(false);
      setModuleFeedback({ message: 'Hair item added. Its QR is ready for printing.', variant: 'success' });
      await loadModuleData();
      setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
      return;
    }

    const result = await saveManualDonationQualification({
      userId: user?.id,
      databaseUserId: profile?.user_id || null,
      donorType: manualForm.donorType,
      donationDriveId: selectedDonationDriveId,
      recipientType: selectedRecipient?.type === 'patient' ? 'patient' : 'organization',
      recipientPatientId: selectedRecipient?.type === 'patient'
        ? Number(selectedRecipient?.patient?.patient_id || 0) || null
        : null,
      manualDetails: {
        length_value: numericLength,
        length_unit: manualForm.lengthUnit,
        bundle_quantity: 1,
        treated: manualForm.treated,
        colored: manualForm.colored,
        trimmed: manualForm.trimmed,
        hair_color: manualForm.hairColor,
        density: manualForm.density,
        donor_name: manualForm.donorType === 'different' ? String(manualForm.donorName || '').trim() : null,
        donor_birthdate: manualForm.donorType === 'different' ? String(manualForm.donorBirthdate || '').trim() : null,
        relationship_to_submitter: manualForm.donorType === 'different' ? String(manualForm.relationshipToSubmitter || '').trim() : null,
        consent_confirmed: manualForm.donorType === 'different' ? Boolean(manualForm.consentConfirmed) : true,
        donor_age: manualForm.donorType === 'different' ? getAgeFromBirthdate(manualForm.donorBirthdate) : null,
        donor_is_minor: manualForm.donorType === 'different'
          ? Number(getAgeFromBirthdate(manualForm.donorBirthdate)) < 18
          : null,
      },
      photo: manualPhoto,
      donationRequirement: moduleData?.latestDonationRequirement || null,
    });
    setIsSavingManual(false);

    if (!result.success) {
      if (result.errorCode === DONOR_PERMISSION_REASONS.profileIncomplete) {
        setIsManualModalOpen(false);
        router.navigate('/profile');
        return;
      }
      if (result.errorCode === DONOR_PERMISSION_REASONS.guardianConsentRequired) {
        setIsManualModalOpen(false);
        router.navigate('/donor/guardian-consent');
        return;
      }
      setManualFeedback({ message: result.error || 'Could not save details. Please try again.', variant: 'error' });
      return;
    }

    setIsManualModalOpen(false);

    if (result.canProceed && result.submission) {
      setModuleFeedback({ message: 'Hair details saved. Starting your donation flow...', variant: 'info' });
      setIsGeneratingQr(true);
      const draftResult = await startIndependentDonationDraft({
        userId: user?.id,
        submission: result.submission,
        databaseUserId: profile?.user_id || null,
        donationDriveId: selectedDonationDriveId,
      });
      setIsGeneratingQr(false);
      setModuleFeedback({
        message: draftResult.success
          ? 'Hair details saved. Continue to submit donation details for staff waybill issuance.'
          : (draftResult.error || 'Details saved but donation flow could not be started.'),
        variant: draftResult.success ? 'success' : 'error',
      });
    } else {
      setModuleFeedback({
        message: result.qualification?.reason || 'Details saved but do not meet donation requirements yet.',
        variant: 'info',
      });
    }

    await loadModuleData();
    setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
  }, [
    loadModuleData,
    manualForm,
    manualPhoto,
    moduleData?.latestDonationRequirement,
    moduleData?.latestSubmission,
    manualEditTarget,
    profile?.user_id,
    router,
    selectedRecipient?.patient?.patient_id,
    selectedRecipient?.type,
    selectedDonationDriveId,
    user?.id,
  ]);

  const handleUpdateBundleField = React.useCallback((field, value) => {
    setBundleForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'donorType' && value === 'own') {
        next.inputMethod = 'scan';
      }
      return next;
    });
    setBundleErrors((prev) => ({ ...prev, [field]: '', photo: '' }));
  }, []);

  const handlePickBundlePhoto = React.useCallback(async (mode = 'library') => {
    const picker = mode === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await picker({ mediaTypes: ['images'], allowsEditing: true, quality: 0.72, base64: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setBundlePhoto({ uri: asset.uri, base64: asset.base64 || '', mimeType: asset.mimeType || 'image/jpeg', fileName: asset.fileName || '' });
    setBundleErrors((prev) => ({ ...prev, photo: '' }));
  }, []);

  const handleAttachLatestScanForBundle = React.useCallback(async (bundleOverride = {}) => {
    const effectiveBundleForm = { ...bundleForm, ...bundleOverride };
    const submission = moduleData?.latestSubmission;
    if (!submission?.submission_id) {
      setBundleFeedback({ message: 'No active donation record found.', variant: 'error' });
      return;
    }
    if (!moduleData?.latestScreening) {
      setBundleFeedback({ message: 'No recent scan was found. Open CheckHair and scan first.', variant: 'error' });
      return;
    }
    if (effectiveBundleForm.donorType === 'different') {
      const nextErrors = {};
      if (!String(effectiveBundleForm.donorName || '').trim()) {
        nextErrors.donorName = 'Enter the hair owner name or label.';
      }
      if (!String(effectiveBundleForm.relationshipToSubmitter || '').trim()) {
        nextErrors.relationshipToSubmitter = 'Enter your relationship to the hair owner.';
      }
      if (!effectiveBundleForm.consentConfirmed) {
        nextErrors.consentConfirmed = 'Confirm consent before saving this hair item.';
      }
      if (Object.keys(nextErrors).length) {
        setBundleErrors(nextErrors);
        return;
      }
    }

    setIsSavingBundle(true);
    const result = await addDonationBundleFromAnalysis({
      userId: user?.id || null,
      databaseUserId: profile?.user_id || null,
      submission,
      screening: moduleData.latestScreening,
      referenceDetail: moduleData?.latestAnalysisEntry?.detail || moduleData?.latestDetail || null,
      donorType: effectiveBundleForm.donorType,
      donorName: effectiveBundleForm.donorType === 'different' ? String(effectiveBundleForm.donorName || '').trim() : '',
      donorBirthdate: effectiveBundleForm.donorType === 'different' ? String(effectiveBundleForm.donorBirthdate || '').trim() : '',
      relationshipToSubmitter: effectiveBundleForm.donorType === 'different' ? String(effectiveBundleForm.relationshipToSubmitter || '').trim() : '',
      consentConfirmed: effectiveBundleForm.donorType === 'different' ? Boolean(effectiveBundleForm.consentConfirmed) : true,
      donorAge: effectiveBundleForm.donorType === 'different' ? getAgeFromBirthdate(effectiveBundleForm.donorBirthdate) : null,
      donorIsMinor: effectiveBundleForm.donorType === 'different'
        ? Number(getAgeFromBirthdate(effectiveBundleForm.donorBirthdate)) < 18
        : null,
    });
    setIsSavingBundle(false);

    if (!result.success) {
      setBundleFeedback({ message: result.error || 'Could not attach scanned bundle right now.', variant: 'error' });
      return;
    }

    setIsAddBundleModalOpen(false);
    setModuleFeedback({ message: 'Additional scanned bundle added to this donation.', variant: 'success' });
    await loadModuleData();
    setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
  }, [
    bundleForm,
    loadModuleData,
    moduleData?.latestAnalysisEntry?.detail,
    moduleData?.latestDetail,
    moduleData?.latestScreening,
    moduleData?.latestSubmission,
    profile?.user_id,
    user?.id,
  ]);

  const handleSaveAdditionalBundle = React.useCallback(async () => {
    const submission = moduleData?.latestSubmission;
    if (!submission?.submission_id) {
      setBundleFeedback({ message: 'No active donation record found.', variant: 'error' });
      return;
    }

    const donorIdentityErrors = {};
    if (bundleForm.donorType === 'different') {
      if (!String(bundleForm.donorName || '').trim()) {
        donorIdentityErrors.donorName = 'Enter the hair owner name or label.';
      }
      if (!String(bundleForm.relationshipToSubmitter || '').trim()) {
        donorIdentityErrors.relationshipToSubmitter = 'Enter your relationship to the hair owner.';
      }
      if (!bundleForm.consentConfirmed) {
        donorIdentityErrors.consentConfirmed = 'Confirm consent before saving this hair item.';
      }
    }
    if (Object.keys(donorIdentityErrors).length) {
      setBundleErrors(donorIdentityErrors);
      return;
    }

    if (bundleForm.donorType === 'own' || (bundleForm.donorType === 'different' && bundleForm.inputMethod === 'scan')) {
      await handleAttachLatestScanForBundle();
      return;
    }

    const nextErrors = {};
    const numericLength = Number(bundleForm.lengthValue);
    if (!Number.isFinite(numericLength) || numericLength <= 0) {
      nextErrors.lengthValue = 'Enter a valid hair length.';
    }
    if (!bundlePhoto) {
      nextErrors.photo = 'Please upload or capture a bundle photo.';
    }
    if (Object.keys(nextErrors).length) {
      setBundleErrors(nextErrors);
      return;
    }

    setIsSavingBundle(true);
    const result = await addDonationBundleFromManualDetails({
      userId: user?.id || null,
      databaseUserId: profile?.user_id || null,
      submission,
      donorType: bundleForm.donorType,
      manualDetails: {
        length_value: numericLength,
        length_unit: bundleForm.lengthUnit,
        treated: bundleForm.treated,
        colored: bundleForm.colored,
        trimmed: bundleForm.trimmed,
        hair_color: bundleForm.hairColor,
        density: bundleForm.density,
        donor_name: bundleForm.donorType === 'different' ? String(bundleForm.donorName || '').trim() : null,
        donor_birthdate: bundleForm.donorType === 'different' ? String(bundleForm.donorBirthdate || '').trim() : null,
        relationship_to_submitter: bundleForm.donorType === 'different' ? String(bundleForm.relationshipToSubmitter || '').trim() : null,
        consent_confirmed: bundleForm.donorType === 'different' ? Boolean(bundleForm.consentConfirmed) : true,
        donor_age: bundleForm.donorType === 'different' ? getAgeFromBirthdate(bundleForm.donorBirthdate) : null,
        donor_is_minor: bundleForm.donorType === 'different'
          ? Number(getAgeFromBirthdate(bundleForm.donorBirthdate)) < 18
          : null,
      },
      photo: bundlePhoto,
    });
    setIsSavingBundle(false);

    if (!result.success) {
      setBundleFeedback({ message: result.error || 'Could not add this bundle right now.', variant: 'error' });
      return;
    }

    setIsAddBundleModalOpen(false);
    setModuleFeedback({
      message: bundleForm.donorType === 'different'
        ? 'Different-donor bundle added to this donation.'
        : 'Additional bundle added to this donation.',
      variant: 'success',
    });
    await loadModuleData();
    setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
  }, [
    bundleForm.colored,
    bundleForm.density,
    bundleForm.donorType,
    bundleForm.donorBirthdate,
    bundleForm.donorName,
    bundleForm.relationshipToSubmitter,
    bundleForm.consentConfirmed,
    bundleForm.hairColor,
    bundleForm.inputMethod,
    bundleForm.lengthUnit,
    bundleForm.lengthValue,
    bundleForm.treated,
    bundleForm.trimmed,
    bundlePhoto,
    handleAttachLatestScanForBundle,
    loadModuleData,
    moduleData?.latestSubmission,
    profile?.user_id,
    user?.id,
  ]);

  const handleEditDonationDetails = React.useCallback(() => {
    const target = activeDonationQrItems[0] || (
      moduleData?.latestSubmission
        ? {
            submission: moduleData.latestSubmission,
            detail: moduleData.latestDetail || getLatestPreviewDetail(moduleData.latestSubmission),
          }
        : null
    );

    const submission = target?.submission || null;
    const detail = target?.detail || getLatestPreviewDetail(submission);
    if (!submission?.submission_id || !detail?.submission_detail_id) {
      setModuleFeedback({ message: 'No editable hair detail was found for this donation.', variant: 'error' });
      return;
    }

    const notes = [detail?.detail_notes, submission?.donor_notes].filter(Boolean).join(' ');
    const markerText = `${notes} ${detail?.declared_condition || ''}`.toLowerCase();
    const donorType = markerText.includes('different donor') || markerText.includes('other person')
      ? 'different'
      : 'own';
    const rawLength = Number(detail?.declared_length);
    const normalizedLength = Number.isFinite(rawLength) && rawLength > 0
      ? (rawLength > 40 ? rawLength / 2.54 : rawLength)
      : '';

    setManualEditTarget({ submission, detail });
    setManualForm({
      ...MANUAL_FORM_DEFAULTS,
      donorType,
      donorName: donorType === 'different' ? getNoteValue(notes, 'Donor name') : '',
      donorBirthdate: donorType === 'different' ? getNoteValue(notes, 'Donor birthdate') : '',
      lengthValue: normalizedLength ? String(Number(normalizedLength).toFixed(1)) : '',
      lengthUnit: 'in',
      treated: detail?.is_chemically_treated ? 'yes' : 'no',
      colored: detail?.is_colored ? 'yes' : 'no',
      trimmed: 'no',
      hairColor: detail?.declared_color || MANUAL_FORM_DEFAULTS.hairColor,
      density: detail?.declared_density || MANUAL_FORM_DEFAULTS.density,
    });
    setManualPhoto(null);
    setManualFormErrors({});
    setManualFeedback({
      message: 'Editing saved hair details. Upload a new photo only if you want to replace or add a clearer reference.',
      variant: 'info',
    });
    setIsSubmitPreviewOpen(false);
    setIsManualModalOpen(true);
  }, [activeDonationQrItems, moduleData?.latestDetail, moduleData?.latestSubmission]);

  const handleRemoveSummaryHair = React.useCallback((item) => {
    const detail = item?.detail || null;
    if (!detail?.submission_detail_id) {
      setModuleFeedback({ message: 'No removable hair detail was found for this item.', variant: 'error' });
      return;
    }

    const removeDetail = async () => {
      setRemovingHairKey(item.key);
      setModuleFeedback({ message: '', variant: 'info' });

      const result = await updateHairSubmissionDetailById(detail.submission_detail_id, {
        status: 'Cancelled',
        current_tracking_status: 'Cancelled',
        updated_by: profile?.user_id || null,
      });

      setRemovingHairKey('');

      if (result.error) {
        setModuleFeedback({
          message: result.error?.message || 'Could not remove this hair item right now.',
          variant: 'error',
        });
        return;
      }

      setModuleFeedback({ message: 'Hair item removed from this donation.', variant: 'success' });
      await loadModuleData({ silent: true });
    };

    Alert.alert(
      'Remove hair item?',
      'This hair item will be removed from your donation summary.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => { void removeDetail(); } },
      ]
    );
  }, [loadModuleData, profile?.user_id]);

  // eslint-disable-next-line no-unused-vars
  const handleSubmitDriveDonation = React.useCallback((drive) => {
    if (!drive?.donation_drive_id) return;

    setSelectedDriveForDonation(drive);

    if (!isProfileComplete) {
      setModuleFeedback({
        message: 'Complete your donor profile before submitting hair for this donation drive.',
        variant: 'info',
      });
      router.navigate('/profile');
      return;
    }

    if (!hasHairScanLog) {
      setModuleFeedback({
        message: hairEligibilityMessage,
        variant: 'info',
      });
      return;
    }

    if (hasOngoingDonation) {
      setModuleFeedback({
        message: 'You already have a donation in progress. Finish or cancel it before starting another hair submission.',
        variant: 'info',
      });
      return;
    }

    const screening = moduleData?.latestScreening;
    if (screening) {
      const estLengthCm = Number(screening.estimated_length);
      const estLengthIn = estLengthCm > 0 ? String((estLengthCm / 2.54).toFixed(1)) : '';
      setManualForm({ ...MANUAL_FORM_DEFAULTS, lengthValue: estLengthIn });
    } else {
      setManualForm(MANUAL_FORM_DEFAULTS);
    }
    setManualFormErrors({});
    setManualPhoto(null);
    setManualFeedback({
      message: `Add the hair details for ${drive.event_title || 'this donation drive'}. You can use manual details here, then preview before QR generation.`,
      variant: 'info',
    });
    setIsManualModalOpen(true);
    setModuleFeedback({
      message: `Selected ${drive.event_title || 'this donation drive'}. Add hair details, then submit for staff waybill issuance.`,
      variant: 'info',
    });
  }, [hairEligibilityMessage, hasHairScanLog, hasOngoingDonation, isProfileComplete, moduleData?.latestScreening, router]);

  const refreshDriveRegistrationFromTable = React.useCallback(async (driveId) => {
    if (!driveId || !profile?.user_id) return null;

    const result = await supabase
      .from('Event_Attendees')
      .select(`
        registration_id:Event_Attendee_ID,
        donation_drive_id:Event_Request_ID,
        user_id:User_ID,
        waybill_code:Waybill_Code,
        registration_status:Registration_Status,
        attendance_status:Attendance_Status,
        rsvp_scanned_at:RSVP_Scanned_At,
        rsvp_scanned_by:RSVP_Scanned_By,
        registered_at:Created_At,
        updated_at:Updated_At
      `)
      .eq('Event_Request_ID', driveId)
      .eq('User_ID', profile.user_id)
      .order('Updated_At', { ascending: false })
      .limit(1)
      .maybeSingle();

    const normalizedRegistration = normalizeDriveRegistrationRow(result.data || null);
    let linkedRegistration = normalizedRegistration;

    if (normalizedRegistration?.registration_id) {
      const submissionResult = await supabase
        .from('Hair_Submissions')
        .select(`
          submission_id:Submission_ID,
          submission_status:Status,
          created_at:Created_At
        `)
        .eq('Event_Request_ID', driveId)
        .eq('User_ID', profile.user_id)
        .not('Status', 'ilike', 'cancelled')
        .order('Created_At', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (submissionResult.data?.submission_id) {
        const detailResult = await supabase
          .from('Hair_Submission_Details')
          .select('submission_detail_id:Submission_Detail_ID,submission_detail_status:Status,created_at:Created_At')
          .eq('Submission_ID', submissionResult.data.submission_id)
          .order('Created_At', { ascending: false })
          .limit(1)
          .maybeSingle();

        linkedRegistration = {
          ...normalizedRegistration,
          submission_id: submissionResult.data.submission_id || null,
          submission_status: submissionResult.data.submission_status || '',
          submission_detail_id: detailResult.data?.submission_detail_id || null,
          submission_detail_status: detailResult.data?.submission_detail_status || '',
        };
      }
    }

    setSelectedDriveForDonation((current) => (
      current && Number(current?.donation_drive_id) === Number(driveId)
        ? { ...current, registration: linkedRegistration }
        : current
    ));

    setModuleData((current) => {
      if (!current) return current;

      const nextDrives = Array.isArray(current.drives)
        ? current.drives.map((drive) => (
            Number(drive?.donation_drive_id) === Number(driveId)
              ? { ...drive, registration: linkedRegistration }
              : drive
          ))
        : current.drives;

      const nextActiveDrive = Number(current?.activeDrive?.donation_drive_id) === Number(driveId)
        ? { ...current.activeDrive, registration: linkedRegistration }
        : current.activeDrive;

      return {
        ...current,
        drives: nextDrives,
        activeDrive: nextActiveDrive,
      };
    });

    return linkedRegistration;
  }, [profile?.user_id]);

  const handleEnsureEventRsvp = React.useCallback(async () => {
    if (!selectedDriveForDonation?.donation_drive_id) return;
    if (isGeneratingEventRsvp) return;
    if (hasOngoingDonation) {
      setModuleFeedback({
        message: 'You already have a donation in progress. You can view this event, but you cannot register until the current donation is finished or cancelled.',
        variant: 'info',
      });
      return;
    }
    if (!hasHairScanLog) {
      setModuleFeedback({
        message: hairEligibilityMessage,
        variant: 'info',
      });
      return;
    }
    if (!isAiEligible) {
      setModuleFeedback({
        message: hairEligibilityMessage,
        variant: 'info',
      });
      return;
    }
    if (!profile?.user_id) {
      setModuleFeedback({ message: 'Your donor profile is required before RSVP generation.', variant: 'error' });
      return;
    }

    setIsGeneratingEventRsvp(true);
    const result = await createDonationDriveRegistration({
      driveId: selectedDriveForDonation.donation_drive_id,
      databaseUserId: profile.user_id,
      hasEligibleHairScan: isAiEligible,
      hasHairScanLog,
    });
    setIsGeneratingEventRsvp(false);

    if (result.error) {
      setModuleFeedback({
        message: result.error?.message || 'Unable to create RSVP right now.',
        variant: 'error',
      });
      return;
    }

    await refreshDriveRegistrationFromTable(selectedDriveForDonation.donation_drive_id);
    setModuleFeedback({
      message: result.alreadyRegistered
        ? 'RSVP already exists. Show your RSVP QR at check-in. Donation submission unlocks after staff marks you Present.'
        : 'RSVP generated. Show your RSVP QR at check-in. Donation submission unlocks after staff marks you Present.',
      variant: 'success',
    });
  }, [hairEligibilityMessage, hasHairScanLog, hasOngoingDonation, isAiEligible, isGeneratingEventRsvp, profile?.user_id, refreshDriveRegistrationFromTable, selectedDriveForDonation]);

  React.useEffect(() => {
    if (donationModuleScreen !== DONATION_MODULE_SCREEN.EVENT_DETAILS) return;
    if (!selectedDriveForDonation?.donation_drive_id) return;

    void refreshDriveRegistrationFromTable(selectedDriveForDonation.donation_drive_id).then((registration) => {
      if (!registration || !isRsvpCheckedIn(registration)) return;
      const refreshedDrive = { ...selectedDriveForDonation, registration };
      const timelineDriveItem = myDonationItems.find(
        (item) => Number(item?.drive?.donation_drive_id || item?.submission?.donation_drive_id) === Number(refreshedDrive.donation_drive_id)
      ) || null;
      if (!timelineDriveItem?.submission) return;
      setSelectedDonationStatusItem(timelineDriveItem);
      setDonationModuleScreen(DONATION_MODULE_SCREEN.DONATION_STATUS);
    });
  }, [donationModuleScreen, myDonationItems, refreshDriveRegistrationFromTable, selectedDriveForDonation]);

  const handleSubmitSelectedEventDonation = React.useCallback(async () => {
    if (!selectedDriveForDonation?.donation_drive_id) {
      setModuleFeedback({ message: 'Select a donation drive first.', variant: 'error' });
      return;
    }

    if (!hasHairScanLog) {
      setModuleFeedback({
        message: hairEligibilityMessage,
        variant: 'info',
      });
      return;
    }
    if (!isAiEligible) {
      setModuleFeedback({
        message: hairEligibilityMessage,
        variant: 'info',
      });
      return;
    }

    const freshSelectedDrive = (moduleData?.drives || []).find(
      (drive) => Number(drive?.donation_drive_id) === Number(selectedDriveForDonation?.donation_drive_id)
    ) || selectedDriveForDonation;
    const selectedRegistration = freshSelectedDrive?.registration || null;

    if (!selectedRegistration?.registration_id) {
      setModuleFeedback({
        message: 'RSVP is required for this event before submitting hair donation details.',
        variant: 'info',
      });
      return;
    }

    if (!isRsvpCheckedIn(selectedRegistration)) {
      setModuleFeedback({
        message: 'Staff must scan your RSVP QR first before you can submit hair donation for this event.',
        variant: 'info',
      });
      return;
    }

    if (!isProfileComplete) {
      setModuleFeedback({
        message: 'Complete your donor profile before submitting hair for this donation drive.',
        variant: 'info',
      });
      router.navigate('/profile');
      return;
    }

    if (hasOngoingDonation) {
      const selectedDriveId = Number(selectedDriveForDonation?.donation_drive_id);
      const activeDriveId = Number(moduleData?.latestSubmission?.donation_drive_id || activeDriveFromSubmission?.donation_drive_id);
      const isSameActiveDrive = Number.isFinite(selectedDriveId)
        && Number.isFinite(activeDriveId)
        && selectedDriveId === activeDriveId;

      setModuleFeedback({
        message: isSameActiveDrive
          ? 'You already have an active donation for this event. Open it from My Donations.'
          : 'You already have a donation in progress. Finish or cancel it before submitting hair for another event.',
        variant: 'info',
      });
      setDonationModuleScreen(DONATION_MODULE_SCREEN.MY_DONATIONS);
      return;
    }

    if (moduleData?.latestAiDonation?.submission || moduleData?.latestAnalysisEntry?.submission) {
      const success = await handleProceedWithHairLog();
      if (success) setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
      return;
    }

    setManualForm(MANUAL_FORM_DEFAULTS);
    setManualFormErrors({});
    setManualPhoto(null);
    setManualFeedback({
      message: 'Add the hair details first. You can preview the summary before QR generation.',
      variant: 'info',
    });
    setIsManualModalOpen(true);
    setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
  }, [
    handleProceedWithHairLog,
    activeDriveFromSubmission?.donation_drive_id,
    hairEligibilityMessage,
    hasOngoingDonation,
    hasHairScanLog,
    isAiEligible,
    isProfileComplete,
    moduleData?.drives,
    moduleData?.latestAiDonation,
    moduleData?.latestAnalysisEntry,
    moduleData?.latestSubmission?.donation_drive_id,
    router,
    selectedDriveForDonation,
  ]);

  const handlePrintQrFromScreen = React.useCallback(async (bundle) => {
    if (!bundle?.qrPayload) return;
    setPrintingQrKey(bundle.key);
    setQrActionFeedback({ message: '', variant: 'info' });
    try {
      await printDonationQrPdf({
        title: `Hair ${bundle.bundleNumber || ''} QR`,
        subtitle: 'Attach this QR to the parcel or hair bundle before submitting at the donation site.',
        helperText: 'This QR is for identification. Do not reuse it for another hair bundle.',
        qrPayloadText: bundle.qrPayload,
        details: [
          { label: 'Hair', value: `Hair ${bundle.bundleNumber || ''}` },
          { label: 'Donor type', value: bundle.sourceLabel || '' },
          { label: 'Donor name', value: bundle.donorName || '' },
          { label: 'Birthday', value: bundle.donorBirthdate || '' },
          { label: 'Length', value: bundle.lengthLabel || '' },
          { label: 'Condition', value: bundle.condition || '' },
          { label: 'Color', value: bundle.color || '' },
          { label: 'Density', value: bundle.density || '' },
        ],
      });
      setQrActionFeedback({ message: 'Print dialog opened. Attach the printed QR to the parcel or hair bundle.', variant: 'success' });
    } catch (_error) {
      setQrActionFeedback({ message: 'Unable to open the print dialog right now.', variant: 'error' });
    } finally {
      setPrintingQrKey('');
    }
  }, []);

  const handleSaveQrFromScreen = React.useCallback(async (bundle) => {
    if (!bundle?.qrPayload) return;
    setSavingQrKey(bundle.key);
    setQrActionFeedback({ message: '', variant: 'info' });
    const result = await saveDonationQrPngToDevice({
      qrPayloadText: bundle.qrPayload,
      fileName: `donivra-hair-${bundle.bundleNumber || 'qr'}-${bundle.donorName || 'donor'}`,
    });
    setSavingQrKey('');
    setQrActionFeedback({
      message: result.success
        ? 'QR image saved to this device. Attach it to the parcel or hair bundle.'
        : (result.error || 'Unable to save the QR image right now.'),
      variant: result.success ? 'success' : 'error',
    });
  }, []);

  const handleConfirmGenerateDonationQr = React.useCallback(async () => {
    const itemsToSubmit = activeDonationQrItems.length
      ? activeDonationQrItems
      : (moduleData?.latestSubmission ? [{
          submission: moduleData.latestSubmission,
          detail: moduleData.latestDetail || null,
          qrPayload: activeDonationQrPayload,
        }] : []);

    if (!itemsToSubmit.length) {
      setModuleFeedback({ message: 'No active donation record found.', variant: 'error' });
      setIsSubmitPreviewOpen(false);
      return false;
    }

    if (itemsToSubmit.every(isSubmittedDonationItem)) {
      setIsSubmitPreviewOpen(false);
      setModuleFeedback({
        message: itemsToSubmit.length > 1
          ? 'Donation already submitted. Waiting for staff waybill updates.'
          : 'Donation already submitted. Waiting for staff waybill updates.',
        variant: 'info',
      });
      return true;
    }

    const hasEventLinkedItems = itemsToSubmit.some(
      (item) => Number(item?.submission?.donation_drive_id) > 0 || Number(selectedDonationDriveId) > 0
    );
    setModuleFeedback({
      message: itemsToSubmit.length > 1
        ? hasEventLinkedItems
          ? `Submitting ${itemsToSubmit.length} hair donation record(s) for staff waybill issuance...`
          : `Submitting ${itemsToSubmit.length} independent hair donation record(s) and generating QR...`
        : hasEventLinkedItems
          ? 'Submitting donation details for staff waybill issuance...'
          : 'Submitting independent donation and generating QR...',
      variant: 'info',
    });
    setIsGeneratingQr(true);
    try {
      const submissionMap = new Map();
      itemsToSubmit.forEach((item) => {
        if (item?.submission?.submission_id && !submissionMap.has(item.submission.submission_id)) {
          submissionMap.set(item.submission.submission_id, item.submission);
        }
      });

      const hasEventLinkedSubmission = Array.from(submissionMap.values())
        .some((submission) => Number(submission?.donation_drive_id) > 0);
      const submissionResults = [];
      for (let submission of submissionMap.values()) {
        const recipientResult = await linkDonationRecipient({
          submission,
          databaseUserId: profile?.user_id || null,
          recipientType: selectedRecipient?.type === 'patient' ? 'patient' : 'organization',
          recipientPatientId: selectedRecipient?.type === 'patient'
            ? Number(selectedRecipient?.patient?.patient_id || 0) || null
            : null,
        });
        if (!recipientResult.success) {
          submissionResults.push({ success: false, error: recipientResult.error || 'Failed to save referral recipient.' });
          continue;
        }
        submission = recipientResult.submission || submission;

        if (hasEventLinkedSubmission) {
          submissionResults.push(await submitDonationForStaffWaybill({
            userId: user?.id,
            submission,
            databaseUserId: profile?.user_id || null,
            donationDriveId: selectedDonationDriveId,
          }));
        } else {
          submissionResults.push(await ensureIndependentDonationQr({
            userId: user?.id,
            submission,
            databaseUserId: profile?.user_id || null,
            donationDriveId: null,
          }));
        }
      }

      const failedResult = submissionResults.find((result) => !result.success);
      if (failedResult) {
        setModuleFeedback({ message: failedResult.error || 'Submission failed. Please try again.', variant: 'error' });
        return false;
      }

      const submittedIds = new Set(itemsToSubmit.map((item) => Number(item?.submission?.submission_id)).filter(Boolean));
      setModuleData((current) => (
        current
          ? {
              ...current,
              hasOngoingDonation: true,
              activeSubmission: current.activeSubmission && submittedIds.has(Number(current.activeSubmission.submission_id))
                ? { ...current.activeSubmission, status: 'Submitted' }
                : current.activeSubmission,
              latestSubmission: current.latestSubmission && submittedIds.has(Number(current.latestSubmission.submission_id))
                ? { ...current.latestSubmission, status: 'Submitted' }
                : current.latestSubmission,
              activeSubmissions: Array.isArray(current.activeSubmissions)
                ? current.activeSubmissions.map((submission) => (
                    submittedIds.has(Number(submission?.submission_id))
                      ? { ...submission, status: 'Submitted' }
                      : submission
                  ))
                : current.activeSubmissions,
            }
          : current
      ));

      setIsSubmitPreviewOpen(false);
      setModuleFeedback({
        message: itemsToSubmit.length > 1
          ? hasEventLinkedSubmission
            ? `${itemsToSubmit.length} hair record(s) submitted. Staff will issue the waybill QR from the website.`
            : `${itemsToSubmit.length} hair record(s) submitted. Independent waybill QR is ready.`
          : hasEventLinkedSubmission
            ? 'Donation submitted. Staff will issue your waybill QR from the website.'
            : 'Donation submitted. Independent waybill QR is ready.',
        variant: 'success',
      });
      await loadModuleData();
      return !hasEventLinkedSubmission ? 'independent' : 'event';
    } catch (_error) {
      setModuleFeedback({ message: 'Unable to submit donation right now. Please try again.', variant: 'error' });
      return false;
    } finally {
      setIsGeneratingQr(false);
    }
  }, [
    activeDonationQrItems,
    activeDonationQrPayload,
    loadModuleData,
    moduleData?.latestDetail,
    moduleData?.latestSubmission,
    profile?.user_id,
    selectedRecipient?.patient?.patient_id,
    selectedRecipient?.type,
    selectedDonationDriveId,
    user?.id,
  ]);

  // â”€â”€ Parcel photo
  const handleSubmitDonationAndShowQr = React.useCallback(async () => {
    if (!activeDonationQrItems.length) {
      setModuleFeedback({ message: 'No saved hair donation details found yet.', variant: 'error' });
      return;
    }
    const submitMode = await handleConfirmGenerateDonationQr();
    if (submitMode) {
      if (submitMode === 'independent') {
        setDonationModuleScreen(DONATION_MODULE_SCREEN.QR_CODES);
        return;
      }
      const nextItem = myDonationItems.find((item) => item.submission && !isClosedDonationStatus(item.submission?.status))
        || myDonationItems.find((item) => item.submission)
        || null;
      if (nextItem) {
        setSelectedDonationStatusItem(nextItem);
      }
      setDonationModuleScreen(DONATION_MODULE_SCREEN.DONATION_STATUS);
    }
  }, [activeDonationQrItems.length, handleConfirmGenerateDonationQr, myDonationItems]);

  const handleDoneFromQrCodes = React.useCallback(async () => {
    await loadModuleData({ silent: true });
    setDonationModuleScreen(DONATION_MODULE_SCREEN.MY_DONATIONS);
  }, [loadModuleData]);

  const handleConfirmCancelDonation = React.useCallback(async () => {
    const selectedCancelItems = selectedDonationStatusItem?.submissions?.length
      ? selectedDonationStatusItem.submissions.map((submission) => ({
          submission,
          detail: getLatestPreviewDetail(submission),
        }))
      : selectedDonationStatusItem?.submission
        ? [{
            submission: selectedDonationStatusItem.submission,
            detail: selectedDonationStatusItem.previewItems?.[0]?.detail || getLatestPreviewDetail(selectedDonationStatusItem.submission),
          }]
        : [];
    const cancelItems = selectedCancelItems.length
      ? selectedCancelItems
      : activeDonationQrItems.length
      ? activeDonationQrItems
      : (moduleData?.latestSubmission ? [{
          submission: moduleData.latestSubmission,
          detail: moduleData.latestDetail || null,
        }] : []);
    const openCancelItems = cancelItems.filter((item) => (
      canCancelDonationSubmission({
        submission: item?.submission || null,
        registration: selectedDonationStatusItem?.drive?.registration || selectedDonationStatusItem?.registration || null,
        certificate,
        timelineStages: moduleData?.timelineStages || [],
        timelineEvents: moduleData?.timelineEvents || [],
        trackingEntries: moduleData?.trackingEntries || [],
      })
    ));
    if (!openCancelItems.length) {
      setModuleFeedback({
        message: 'This donation can no longer be cancelled because Hair for Hope has already approved it.',
        variant: 'info',
      });
      setIsCancelModalOpen(false);
      return;
    }

    setIsCancellingDonation(true);
    const results = [];
    for (const item of openCancelItems) {
      results.push(await cancelDonorDonation({
        userId: user?.id || null,
        databaseUserId: profile?.user_id || null,
        submission: item.submission,
        detail: item.detail || null,
        reason: 'Cancelled by donor from donor donation module.',
      }));
    }
    setIsCancellingDonation(false);
    setIsCancelModalOpen(false);

    const failedResult = results.find((result) => !result.success);
    if (failedResult) {
      setModuleFeedback({ message: failedResult.error || 'Unable to cancel donation right now.', variant: 'error' });
      await loadModuleData();
      return;
    }

    setModuleData((current) => (
      current
        ? {
            ...current,
            activeSubmission: null,
            activeSubmissions: [],
            latestSubmission: null,
            latestDetail: null,
            hasOngoingDonation: false,
            independentQrState: null,
          }
        : current
    ));
    setSelectedDonationStatusItem(null);
    setModuleFeedback({
      message: openCancelItems.length > 1
        ? `${openCancelItems.length} donation submissions cancelled. You can start a new donation anytime.`
        : 'Donation cancelled. You can start a new donation anytime.',
      variant: 'success',
    });
    await loadModuleData();
  }, [
    activeDonationQrItems,
    certificate,
    loadModuleData,
    moduleData?.latestDetail,
    moduleData?.latestSubmission,
    moduleData?.timelineEvents,
    moduleData?.timelineStages,
    moduleData?.trackingEntries,
    profile?.user_id,
    selectedDonationStatusItem,
    user?.id,
  ]);

  // â”€â”€ Render
  const donationFlowContent = React.useMemo(() => {
    if (!isProfileComplete) {
      return (
        <ProfilePendingCard
          roles={roles}
          completionMeta={donorProfileMeta}
          onManageProfile={() => router.navigate('/profile')}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.EVENTS) {
      return (
        <DonationHomeOverview
          roles={roles}
          completedDrives={moduleData?.completedEventDrives || []}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.EVENT_DETAILS) {
      return (
        <DonationEventDetailsScreen
          roles={roles}
          drive={selectedFlowDrive}
          onBack={() => setDonationModuleScreen(DONATION_MODULE_SCREEN.EVENTS)}
          onGenerateRsvp={handleEnsureEventRsvp}
          isGeneratingRsvp={isGeneratingEventRsvp}
          hasOngoingDonation={hasOngoingDonation}
          hasHairScanLog={hasHairScanLog}
          isHairEligible={isAiEligible}
          hairEligibilityMessage={hairEligibilityMessage}
          onCheckHair={() => router.navigate('/donor/donations')}
          onSubmit={async () => {
            const registration = selectedFlowDrive?.registration || null;
            if (!registration?.registration_id) {
              await handleEnsureEventRsvp();
              return;
            }
            await handleSubmitSelectedEventDonation();
          }}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.SUMMARY) {
      return (
        <DonationHairSummaryScreen
          roles={roles}
          drive={selectedFlowDrive}
          latestScreening={latestScreening}
          isEligible={isAiEligible}
          ineligibilityReason={moduleData?.latestAiEligibility?.reason || ''}
          hairItems={donationPreviewItems}
          isSubmitting={isGeneratingQr}
          onBack={() => setDonationModuleScreen(DONATION_MODULE_SCREEN.EVENT_DETAILS)}
          allowAddAnotherHair={false}
          onRemoveHair={handleRemoveSummaryHair}
          removingHairKey={removingHairKey}
          onReferDonation={() => {
            setSelectedRecipient({ type: 'organization', patient: null });
            setDonationModuleScreen(DONATION_MODULE_SCREEN.RECIPIENT);
          }}
          onSubmitDonation={handleSubmitDonationAndShowQr}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.RECIPIENT) {
      return (
        <RecipientChoiceScreen
          roles={roles}
          drive={selectedFlowDrive}
          patients={recipientPatients}
          selectedRecipient={selectedRecipient}
          onBack={() => setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY)}
          onSelectDefault={() => setSelectedRecipient({ type: 'organization', patient: null })}
          onSelectPatient={(patient) => setSelectedRecipient({ type: 'patient', patient })}
          onConfirm={handleSubmitDonationAndShowQr}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.QR_CODES) {
      return (
        <DonationQrCodesScreen
          roles={roles}
          bundles={donationPreviewItems}
          feedback={qrActionFeedback}
          printingQrKey={printingQrKey}
          savingQrKey={savingQrKey}
          onBack={() => setDonationModuleScreen(
            selectedDonationStatusItem ? DONATION_MODULE_SCREEN.DONATION_STATUS : DONATION_MODULE_SCREEN.SUMMARY
          )}
          onPrintQr={handlePrintQrFromScreen}
          onSaveQr={handleSaveQrFromScreen}
          onDone={handleDoneFromQrCodes}
          allowQrActions={!selectedDonationDriveId}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.MY_DONATIONS) {
      return (
        <MyJoinedDonationsScreen
          roles={roles}
          logisticsSettings={moduleData?.logisticsSettings || null}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.DONATION_STATUS) {
      return (
        <DonationTimelineStatusScreen
          roles={roles}
          item={selectedDonationTimelineItem}
          previewItems={selectedDonationTimelineItem?.previewItems?.length ? selectedDonationTimelineItem.previewItems : donationPreviewItems}
          timelineStages={moduleData?.timelineStages || []}
          timelineEvents={moduleData?.timelineEvents || []}
          parcelImages={moduleData?.parcelImages || []}
          certificate={certificate}
          accountDonorName={accountDonorName}
          onBack={() => setDonationModuleScreen(DONATION_MODULE_SCREEN.MY_DONATIONS)}
          onViewDonationQr={() => {
            if (selectedDonationTimelineItem?.submission?.donation_drive_id) return;
            setDonationModuleScreen(DONATION_MODULE_SCREEN.QR_CODES);
          }}
          onCancelDonation={() => setIsCancelModalOpen(true)}
        />
      );
    }

    return (
      <MyJoinedDonationsScreen
        roles={roles}
        logisticsSettings={moduleData?.logisticsSettings || null}
      />
    );
  }, [
    effectiveDonationModuleScreen,
    donationPreviewItems,
    donorProfileMeta,
    selectedFlowDrive,
    accountDonorName,
    certificate,
    handleEnsureEventRsvp,
    handleRemoveSummaryHair,
    handleDoneFromQrCodes,
    handlePrintQrFromScreen,
    handleSaveQrFromScreen,
    handleSubmitDonationAndShowQr,
    handleSubmitSelectedEventDonation,
    hairEligibilityMessage,
    hasHairScanLog,
    hasOngoingDonation,
    isAiEligible,
    isGeneratingEventRsvp,
    isGeneratingQr,
    isProfileComplete,
    latestScreening,
    moduleData?.timelineEvents,
    moduleData?.timelineStages,
    moduleData?.parcelImages,
    moduleData?.latestAiEligibility?.reason,
    moduleData?.completedEventDrives,
    moduleData?.logisticsSettings,
    printingQrKey,
    qrActionFeedback,
    recipientPatients,
    removingHairKey,
    roles,
    router,
    savingQrKey,
    selectedRecipient,
    selectedDonationTimelineItem,
    selectedDonationStatusItem,
    selectedDonationDriveId,
  ]);
  const logisticStickyAction = effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.MY_DONATIONS ? (
    <View
      pointerEvents="box-none"
      style={[
        styles.logisticFabOverlay,
        { bottom: insets.bottom + DASHBOARD_TAB_BAR_HEIGHT + 22 },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add logistic donation"
        onPress={handleAddLogisticDonation}
        style={({ pressed }) => [
          styles.logisticFab,
          {
            backgroundColor: roles.primaryActionBackground,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <MaterialCommunityIcons name="plus" size={22} color={roles.primaryActionText} />
        <Text style={[styles.logisticFabText, { color: roles.primaryActionText }]}>Add Logistic Donation</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <DashboardLayout
      showSupportChat
      navItems={donorDashboardNavItems}
      activeNavKey="donations"
      navVariant="donor"
      onNavPress={handleNavPress}
      screenVariant="default"
      refreshing={isRefreshing}
      onRefresh={handleRefreshModuleData}
      floatingOverlay={logisticStickyAction}
      loadingOverlay={isLoading ? (
        <DonivraLoadingOverlay visible label="Loading donation details..." />
      ) : null}
      header={(
        <View style={[styles.dashboardHeaderSurface, { backgroundColor: headerPrimaryColor }]}>
          <DonorTopBar
            title={firstName || 'Donor'}
            subtitle="Hair Donor"
            avatarInitials={avatarInitials}
            avatarUri={profile?.avatar_url || profile?.photo_path || ''}
            unreadCount={unreadCount}
            onNotificationsPress={() => router.navigate('/donor/notifications')}
            onProfilePress={() => router.navigate('/profile')}
            onLogoutPress={logout}
            isLoggingOut={isLoggingOut}
          />
        </View>
      )}
    >
      {screenError ? (
        <StatusBanner
          message={screenError}
          variant="info"
          presentation="floating"
          visible={Boolean(screenError)}
          autoDismissMs={3000}
          onDismiss={() => setScreenError('')}
        />
      ) : null}
      {moduleFeedback.message ? (
        <StatusBanner
          message={moduleFeedback.message}
          variant={moduleFeedback.variant}
          presentation="floating"
          visible={Boolean(moduleFeedback.message)}
          autoDismissMs={3000}
          onDismiss={() => setModuleFeedback({ message: '', variant: 'info' })}
        />
      ) : null}
      <View style={styles.page}>
        <View style={[styles.donationTypeTabs, { borderBottomColor: roles.defaultCardBorder }]}>
          <Pressable
            onPress={handleShowHairEventTab}
            style={[
              styles.donationTypeTab,
              activeDonationTabKey === 'hair-event'
                ? [styles.donationTypeTabActive, { borderBottomColor: headerPrimaryColor }]
                : null,
            ]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.9}
              style={[
                styles.donationTypeTabText,
                { color: activeDonationTabKey === 'hair-event' ? headerPrimaryColor : roles.metaText },
              ]}
            >
              Hair Event Donation
            </Text>
          </Pressable>
          <Pressable
            onPress={handleShowLogisticTab}
            style={[
              styles.donationTypeTab,
              activeDonationTabKey === 'logistic'
                ? [styles.donationTypeTabActive, { borderBottomColor: headerPrimaryColor }]
                : null,
            ]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.9}
              style={[
                styles.donationTypeTabText,
                { color: activeDonationTabKey === 'logistic' ? headerPrimaryColor : roles.metaText },
              ]}
            >
              Logistic Donation
            </Text>
          </Pressable>
        </View>

        {donationFlowContent}

          {/* â”€â”€ Profile gate */}
          {true ? null : !isHairFresh && !selectedDriveForDonation ? (
            /* â”€â”€ Hair eligibility gate */
            <HairEligibilityGateCard
              roles={roles}
              hasScreening={Boolean(latestScreening)}
              screeningLabel={screeningLabel}
              onCheckHair={() => router.navigate('/donor/donations')}
            />
          ) : (
            <>
              {/* â”€â”€ Active joined drive */}
              {/* â”€â”€ Donation paths (no ongoing donation) */}
              {!hasOngoingDonation && selectedDonationDriveId ? (
                <View style={styles.section}>
                  <SectionHeader
                    eyebrow="Hair to donate"
                    title="Add hair to donate"
                    roles={roles}
                  />

                  <ManualInputCard roles={roles} onOpen={handleOpenManualModal} />
                </View>
              ) : null}

              {/* â”€â”€ Active donation: QR + parcel photo */}
              {/* â”€â”€ Donation journey timeline */}
              {/* â”€â”€ Certificate */}
            </>
          )}

      </View>

      <ManualEntryModal
        visible={isManualModalOpen}
        form={manualForm}
        errors={manualFormErrors}
        photo={manualPhoto}
        feedback={manualFeedback}
        isSaving={isSavingManual}
        isEditing={Boolean(manualEditTarget)}
        aiPrefilled={Boolean(
          moduleData?.latestScreening
          && manualForm.lengthValue
          && manualForm.lengthValue !== MANUAL_FORM_DEFAULTS.lengthValue
        )}
        onClose={() => {
          setIsManualModalOpen(false);
          setManualEditTarget(null);
        }}
        onChangeField={updateManualField}
        onPickPhoto={handlePickManualPhoto}
        onSave={handleSaveManualDetails}
      />

      <HairEligibilityPromptModal
        visible={isHairEligibilityPromptOpen}
        roles={roles}
        title={logisticEligibilityPromptTitle}
        message={logisticEligibilityPromptMessage}
        actionTitle="Go to Analysis"
        onClose={() => setIsHairEligibilityPromptOpen(false)}
        onStartHairCheck={handleStartHairCheckFromPrompt}
      />

      <DonationSubmitPreviewModal
        visible={false}
        roles={roles}
        submission={moduleData?.latestSubmission || null}
        detail={moduleData?.latestDetail || null}
        qrPayload={activeDonationQrPayload}
        qrItems={activeDonationQrItems}
        accountDonorName={accountDonorName}
        isSubmitting={isGeneratingQr}
        isSubmitted={hasSubmittedDonationQr}
        onClose={() => {
          if (!isGeneratingQr) setIsSubmitPreviewOpen(false);
        }}
        onEditDetails={handleEditDonationDetails}
        onConfirm={handleConfirmGenerateDonationQr}
      />

      <AddBundleModal
        visible={isAddBundleModalOpen}
        bundleForm={bundleForm}
        bundleErrors={bundleErrors}
        bundlePhoto={bundlePhoto}
        bundleFeedback={bundleFeedback}
        isSaving={isSavingBundle}
        onClose={() => {
          if (!isSavingBundle) setIsAddBundleModalOpen(false);
        }}
        onChangeField={handleUpdateBundleField}
        onPickPhoto={handlePickBundlePhoto}
        onOpenScanner={() => {
          setIsAddBundleModalOpen(false);
          router.navigate('/donor/donations');
        }}
        onAttachLatestScan={handleAttachLatestScanForBundle}
        onSave={handleSaveAdditionalBundle}
      />

      <ModalShell
        visible={isCancelModalOpen}
        title="Cancel donation submission"
        subtitle={
          activeDonationQrItems.length > 1
            ? 'This action will mark all active hair donation submissions as cancelled.'
            : 'This action will mark your active hair donation submission as cancelled.'
        }
        onClose={() => {
          if (!isCancellingDonation) setIsCancelModalOpen(false);
        }}
        cardBackground={roles.defaultCardBackground}
        footer={(
          <View style={styles.rowActions}>
            <AppButton
              title="Keep donation"
              variant="outline"
              fullWidth={false}
              onPress={() => setIsCancelModalOpen(false)}
              disabled={isCancellingDonation}
            />
            <AppButton
              title={isCancellingDonation ? 'Cancellingâ€¦' : 'Yes, cancel'}
              variant="danger"
              fullWidth={false}
              onPress={handleConfirmCancelDonation}
              loading={isCancellingDonation}
              disabled={isCancellingDonation}
            />
          </View>
        )}
      >
        <Text style={styles.cancelModalText}>
          You can start a new donation after cancellation. This will close the current hair submission records, logistics, and tracking flow.
        </Text>
      </ModalShell>
    </DashboardLayout>
  );
}

// â”€â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const styles = StyleSheet.create({
  dashboardHeaderSurface: {
    marginHorizontal: -theme.layout.screenPaddingX,
    paddingHorizontal: 0,
    paddingVertical: theme.spacing.xs,
  },
  page: {
    gap: theme.spacing.xl,
  },
  flowScreen: {
    gap: theme.spacing.lg,
  },
  donationStepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  donationStepHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  donationStepTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.title,
    fontWeight: theme.typography.weights.bold,
    lineHeight: theme.typography.semantic.title * theme.typography.lineHeights.snug,
  },
  donationStepBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  stepBackButton: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowCardList: {
    gap: theme.spacing.md,
  },
  flowEventCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  flowIconCircle: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  flowEventCopy: {
    gap: theme.spacing.xs,
  },
  flowHost: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  flowEventTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.semibold,
  },
  flowMetaText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  flowEventButton: {
    alignSelf: 'stretch',
  },
  eventDetailsHero: {
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  eventDetailsIcon: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDetailsHost: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  eventDetailsTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.title,
    fontWeight: theme.typography.weights.bold,
  },
  eventDetailsMetaList: {
    gap: theme.spacing.sm,
  },
  eventMapCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  eventMapHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  eventMapHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eventMapTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
  },
  eventMapSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  eventMapFrame: {
    minHeight: 180,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.sm,
  },
  eventMapImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  eventMapFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  logisticsTable: {
    gap: theme.spacing.xs,
  },
  logisticsTableRow: {
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    gap: 3,
  },
  logisticsTableLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  logisticsTableValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  summarySectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
  },
  summaryMainText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  summaryStatusChip: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  summaryStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  summaryMetric: {
    width: '48%',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.48)',
    padding: theme.spacing.md,
    gap: 3,
  },
  summaryMetricLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
  },
  summaryMetricValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  summaryHairRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  summaryHairActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 1,
    gap: theme.spacing.xs,
  },
  summaryRemoveButton: {
    minHeight: 30,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryRemoveText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  summaryActions: {
    gap: theme.spacing.sm,
  },
  inputMethodCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    position: 'relative',
    overflow: 'hidden',
    ...theme.shadows.soft,
  },
  inputMethodRecommended: {
    paddingTop: theme.spacing.xl,
  },
  inputMethodCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  inputMethodTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
  },
  recommendedBadge: {
    position: 'absolute',
    right: 0,
    top: 0,
    borderBottomLeftRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  recommendedBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  recipientDefaultCard: {
    borderWidth: 2,
    borderRadius: 18,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  patientScroll: {
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  patientChoiceCard: {
    width: 210,
    minHeight: 152,
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  patientAvatar: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientName: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  patientSelectText: {
    marginTop: 'auto',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  successBanner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  successBannerText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  myDonationFilters: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  myDonationFilterChip: {
    borderWidth: 1,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  myDonationFilterText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  donationEventBrowserScreen: {
    paddingBottom: 108,
  },
  donationEventBrowserContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  donationEventBrowserHero: {
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  donationEventBrowserHeroIcon: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  donationEventBrowserHeroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  donationEventBrowserFilters: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing.sm,
  },
  donationEventBrowserFilterCell: {
    flex: 1,
    minWidth: 0,
  },
  donationEventFilterButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  donationEventFilterCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  donationEventFilterLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  donationEventFilterValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  donationEventFilterModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  donationEventFilterModalCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  donationEventFilterModalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  donationEventFilterOptionList: {
    gap: theme.spacing.sm,
  },
  donationEventFilterOption: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  donationEventFilterOptionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  donationTypeTabs: {
    minHeight: 44,
    marginHorizontal: -theme.spacing.md,
    marginTop: -theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
  },
  donationTypeTab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: theme.spacing.md,
  },
  donationTypeTabActive: {
    borderBottomWidth: 2,
  },
  donationTypeTabText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
  },
  independentDonationCta: {
    borderWidth: 1,
    borderRadius: 18,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  independentDonationTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
  },
  independentDonationBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  myDonationCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  myDonationCardTop: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  myDonationImage: {
    width: 78,
    height: 78,
    borderRadius: theme.radius.lg,
    flexShrink: 0,
  },
  myDonationImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  myDonationCardCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  myDonationTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  myDonationTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
  },
  myDonationStatusBadge: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    maxWidth: 136,
  },
  myDonationStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  myDonationInfoBox: {
    borderRadius: 14,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  myDonationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  myDonationCardActions: {
    gap: theme.spacing.sm,
  },
  logisticHistoryScreen: {
    position: 'relative',
    paddingBottom: 108,
  },
  logisticHistoryBanner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  logisticHistoryIcon: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logisticHistoryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  logisticEligibilityBanner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  logisticEligibilityIcon: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logisticEligibilityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  logisticLocationCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  logisticLocationToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  logisticLocationToggleCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  logisticLocationBody: {
    gap: theme.spacing.md,
  },
  logisticFabOverlay: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    zIndex: 18,
    pointerEvents: 'box-none',
  },
  logisticFab: {
    borderRadius: 999,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    width: '100%',
    elevation: 4,
    ...theme.shadows.soft,
  },
  logisticFabText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  timelineHero: {
    borderWidth: 1,
    borderRadius: 18,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
    ...theme.shadows.soft,
  },
  timelineHeroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  timelineHeroCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.sm,
  },
  timelineHeroTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
  },
  timelineHeroChip: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  timelineHeroChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  timelineMetricGrid: {
    borderTopWidth: 1,
    paddingTop: theme.spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  timelineMetric: {
    flex: 1,
    minWidth: 120,
    gap: 3,
  },
  timelineSection: {
    gap: theme.spacing.lg,
  },
  timelineStageList: {
    gap: theme.spacing.md,
  },
  timelineStageRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing.md,
  },
  timelineMarkerColumn: {
    width: 28,
    alignItems: 'center',
  },
  timelineMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  timelineCurrentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timelineStageConnector: {
    flex: 1,
    width: 2,
    minHeight: 64,
    marginTop: 2,
  },
  timelineStageCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  timelineStageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  timelineStageTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  timelineStageDate: {
    maxWidth: 116,
    textAlign: 'right',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  timelineStageBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  timelinePhotoStrip: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  timelinePhotoFrame: {
    width: 132,
    borderRadius: 14,
    padding: theme.spacing.xs,
    gap: 4,
  },
  timelinePhoto: {
    width: '100%',
    height: 96,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSoft,
  },
  timelinePhotoLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  timelineEventRow: {
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
  },
  timelineEventImage: {
    width: '100%',
    height: 150,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceSoft,
    marginTop: theme.spacing.xs,
  },
  section: {
    gap: theme.spacing.md,
  },
  flowRail: {
    borderWidth: 1,
    borderRadius: 18,
    padding: theme.spacing.md,
    gap: 0,
  },
  flowStep: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  flowStepMarkerWrap: {
    width: 28,
    alignItems: 'center',
    minHeight: 68,
  },
  flowStepMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  flowStepMarkerText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  flowConnector: {
    position: 'absolute',
    top: 28,
    bottom: 0,
    width: 2,
    borderRadius: theme.radius.full,
  },
  flowStepCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  flowStepLabel: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.snug,
  },
  flowStepState: {
    marginTop: 2,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  loadingBlock: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },

  // Section header
  sectionHeader: {
    gap: theme.spacing.xs,
  },
  sectionEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
  },
  sectionBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },

  // Card base
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  donationHome: {
    gap: theme.spacing.xl,
  },
  eligibleBanner: {
    borderRadius: 18,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    overflow: 'hidden',
    ...theme.shadows.soft,
  },
  eligibleBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  eligibleBannerIcon: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eligibleBannerTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  eligibleStatsCard: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  eligibleStat: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  eligibleStatCenter: {
    alignItems: 'center',
  },
  eligibleStatEnd: {
    alignItems: 'flex-end',
  },
  eligibleStatLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.45,
  },
  eligibleStatValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  eligibleDivider: {
    width: 1,
    height: 36,
    marginHorizontal: theme.spacing.sm,
  },
  organizationScroll: {
    gap: theme.spacing.md,
    paddingBottom: 2,
  },
  organizationMiniCard: {
    width: 142,
    minHeight: 166,
    borderRadius: 14,
    borderWidth: 1,
    padding: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.xs,
    ...theme.shadows.soft,
  },
  organizationMiniLogo: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    marginBottom: theme.spacing.xs,
  },
  organizationMiniLogoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  organizationMiniName: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    textAlign: 'center',
    minHeight: 38,
  },
  organizationMiniStatus: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  findMoreCard: {
    width: 142,
    minHeight: 166,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  findMoreIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findMoreText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    textAlign: 'center',
  },
  eventChipRow: {
    gap: theme.spacing.sm,
    paddingBottom: 2,
  },
  eventChip: {
    borderWidth: 1,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  eventChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  eventList: {
    gap: theme.spacing.md,
  },
  eventCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.soft,
  },
  eventImage: {
    width: '100%',
    height: 180,
  },
  eventImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventCopy: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  eventHost: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  eventTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
  },
  eventMetaGrid: {
    gap: theme.spacing.sm,
  },
  eventMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  eventMetaText: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  emptyDonationCard: {
    minHeight: 116,
    borderRadius: 14,
    borderWidth: 1,
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  emptyDonationText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    textAlign: 'center',
  },
  upcomingDonationCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  participatedEventList: {
    gap: theme.spacing.md,
  },
  donationCalendarCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  donationCalendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  donationCalendarHeaderCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 2,
  },
  donationCalendarMonth: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.semibold,
    textAlign: 'center',
  },
  donationCalendarSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    textAlign: 'center',
  },
  donationCalendarNavButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  donationWeekdayRow: {
    flexDirection: 'row',
    gap: 6,
  },
  donationWeekdayText: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  donationCalendarGrid: {
    gap: 6,
  },
  donationCalendarRow: {
    flexDirection: 'row',
    gap: 6,
  },
  donationCalendarDay: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  donationCalendarDayMuted: {
    opacity: 0.48,
  },
  donationCalendarDayText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  donationCalendarDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  donationCalendarTodayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
  },
  donationCalendarEvents: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  donationCalendarEventsTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  donationCalendarEventCard: {
    padding: theme.spacing.md,
    shadowOpacity: 0,
    elevation: 0,
  },
  donationCalendarHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    textAlign: 'center',
  },
  upcomingDonationIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  upcomingDonationCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  upcomingDonationActions: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  activeDonationSummary: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  activeDonationSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  activeDonationSummaryActions: {
    gap: theme.spacing.sm,
  },
  upcomingActionButton: {
    maxWidth: 180,
  },
  upcomingDonationTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  upcomingDonationBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  upcomingStatusChip: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    flexShrink: 0,
  },
  upcomingStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },

  // Profile setup gate
  profileSetupGate: {
    width: '100%',
    paddingVertical: theme.spacing.md,
  },
  profileSetupPanel: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 24,
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  profileSetupHero: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  profileSetupIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  profileSetupCopy: {
    width: '100%',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  profileSetupEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  profileSetupTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
  },
  profileSetupBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    textAlign: 'center',
  },
  profileSetupChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  profileSetupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  profileSetupChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  profileSetupChipText: {
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },

  // Joined drive card
  driveCardTop: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  driveLogo: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.lg,
  },
  driveLogoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  driveMeta: {
    flex: 1,
    gap: 3,
  },
  driveTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
  },
  driveOrg: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  driveMeta2: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  driveRsvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  eventRsvpRow: {
    marginTop: theme.spacing.sm,
  },
  eventRsvpQrWrap: {
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  eventRsvpQrHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  eventRsvpQrTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
  },
  eventRsvpQrSubtitle: {
    marginTop: 3,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  eventRsvpQrImageFrame: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 330,
    aspectRatio: 1,
    padding: theme.spacing.sm,
    borderRadius: 14,
    backgroundColor: theme.colors.white,
  },
  eventRsvpQrImage: {
    width: '100%',
    height: '100%',
  },
  eventRsvpBanner: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  eventRsvpActionButton: {
    marginTop: theme.spacing.sm,
  },
  driveRsvpLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  rsvpBadge: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  rsvpBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'capitalize',
  },

  // Path cards (hair log + manual)
  pathCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceCard,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  pathCardPressable: {
    // keep padding/radius from pathCard
  },
  pathCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  pathIconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pathCardCopy: {
    flex: 1,
    gap: 4,
  },
  pathCardTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
  },
  pathCardBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  eligibilityBadge: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  eligibilityBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  hairLogGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  hairLogTile: {
    flex: 1,
    minWidth: 130,
    borderRadius: 14,
    padding: theme.spacing.sm,
    gap: 3,
  },
  hairLogTileLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hairLogTileValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  ineligibleNote: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },

  // Manual modal form
  manualSectionCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  manualSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  manualSectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  manualSectionCopy: {
    flex: 1,
    gap: 2,
  },
  manualSectionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  manualSectionBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  manualSectionContent: {
    gap: theme.spacing.sm,
  },
  donorIdentityFields: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  bundleScanActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    justifyContent: 'flex-end',
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  formRowFlex: {
    flex: 1,
    minWidth: 160,
  },
  formRowUnit: {
    flex: 1,
    minWidth: 140,
  },
  choiceField: {
    gap: theme.spacing.xs,
    flex: 1,
    minWidth: 0,
  },
  manualChoiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  choiceLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.label,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  choiceChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  choiceChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  choiceChipActive: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  choiceChipDisabled: {
    opacity: 0.45,
  },
  choiceChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  choiceChipTextActive: {
    color: theme.colors.brandPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  choiceChipTextDisabled: {
    color: theme.colors.textMuted,
  },
  choiceHelperText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight: theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
  },

  // Photo upload
  photoCard: {
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceCardMuted,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  photoCardTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  photoCardBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  photoPreview: {
    width: '100%',
    height: 228,
    borderRadius: 14,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  photoPlaceholder: {
    minHeight: 168,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderSubtle,
    padding: theme.spacing.lg,
  },
  uploadIconBubble: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  photoPlaceholderText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    textAlign: 'center',
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  inputError: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textError,
    fontWeight: theme.typography.weights.medium,
  },

  // Parcel images
  parcelImagesWrap: {
    gap: theme.spacing.sm,
  },
  parcelImageThumb: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceSoft,
  },
  parcelSubmittedNote: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },

  // QR shipping card
  qrCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  qrEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  qrTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    marginTop: 3,
  },
  qrStatusBadge: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
  },
  qrStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  qrImageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    borderRadius: 14,
    minHeight: 220,
    gap: theme.spacing.sm,
  },
  qrImage: {
    width: 240,
    height: 240,
  },
  qrLoadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  qrMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  qrMetaTile: {
    flex: 1,
    minWidth: 110,
    borderRadius: 14,
    padding: theme.spacing.sm,
    gap: 3,
  },
  qrMetaLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  qrMetaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  qrNote: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },

  // Timeline
  timelineContainer: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    minHeight: 56,
  },
  timelineTrack: {
    width: 20,
    alignItems: 'center',
    flexShrink: 0,
  },
  timelineNode: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 4,
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    marginTop: 4,
    minHeight: 28,
  },
  timelineCopy: {
    flex: 1,
    paddingBottom: theme.spacing.md,
    gap: 3,
  },
  timelineLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
  },
  timelineMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },

  // Certificate
  certBadge: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
  },
  certBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  certTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.title,
    lineHeight: theme.typography.semantic.title * 1.16,
  },
  certBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
  },
  certMeta: {
    gap: 0,
  },
  certMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    gap: theme.spacing.sm,
  },
  certMetaLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  certMetaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    textAlign: 'right',
    flex: 1,
  },

  // History
  historyList: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    gap: 0,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    paddingVertical: theme.spacing.sm,
  },
  historyIcon: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  historyCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  historyCode: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  historyDate: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  historyBundles: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },

  // Bundle preview before final QR
  bundlePreviewPanel: {
    gap: theme.spacing.xs,
  },
  bundlePreviewTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  bundlePreviewBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    marginBottom: theme.spacing.xs,
  },
  bundlePreviewList: {
    borderWidth: 1,
    borderRadius: 14,
    borderColor: theme.colors.borderSubtle,
    overflow: 'hidden',
  },
  bundlePreviewRow: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  bundlePreviewRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  bundlePreviewRowTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  bundlePreviewSourceChip: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  bundlePreviewSourceText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  bundlePreviewMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  bundlePreviewMeta: {
    minWidth: '46%',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  previewQrCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  bundlePreviewQrCard: {
    marginTop: theme.spacing.sm,
  },
  previewQrPrintButton: {
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
  },
  previewQrActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  previewQrActionButton: {
    minWidth: 116,
  },
  previewQrTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  previewQrPayload: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight: theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
  },
  previewQrImage: {
    width: 180,
    height: 180,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
  },

  // Row actions
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    justifyContent: 'flex-start',
  },
  modalFooterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  modalFooterActionHalf: {
    flex: 1,
  },
  bannerSpacing: {
    marginBottom: theme.spacing.md,
  },
  cancelModalText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.sm,
  },
  consentText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight: theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
  },

  hairEligibilityModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  hairEligibilityModalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  hairEligibilityModalCloseBtn: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    zIndex: 1,
    padding: 2,
  },
  hairEligibilityModalIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
  },
  hairEligibilityModalTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.headingSm,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
    lineHeight: theme.typography.semantic.headingSm * 1.15,
  },
  hairEligibilityModalMessage: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyMd,
    textAlign: 'center',
    lineHeight: theme.typography.semantic.bodyMd * theme.typography.lineHeights.relaxed,
  },
  hairEligibilityModalAction: {
    marginTop: theme.spacing.xs,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
  },
  hairEligibilityModalActionButton: {
    minHeight: 56,
    borderRadius: 999,
    paddingHorizontal: theme.spacing.xl,
  },
  hairEligibilityModalActionText: {
    fontSize: theme.typography.semantic.bodyMd,
    fontWeight: theme.typography.weights.medium,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
    paddingTop: theme.spacing.xxl,
    paddingBottom: 0,
    backgroundColor: theme.colors.overlay,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    backgroundColor: theme.colors.backgroundPrimary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    paddingTop: theme.spacing.md,
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    maxHeight: '94%',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  modalTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  modalSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  modalBody: {
    flexShrink: 1,
    minHeight: 0,
    paddingHorizontal: theme.spacing.md,
  },
  modalScroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  modalScrollContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  modalFooter: {
    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
});
