import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { invokeEdgeFunction, supabase } from '../api/supabase/client';
import { logAppError } from '../utils/appErrors';
import {
  createDonationDriveRegistration,
  fetchDonationDrivePreview,
  fetchRegisteredDonationDrivesByUserId,
  fetchUpcomingDonationDrives,
} from './donorHome.api';
import {
    createHairBundleTrackingEntry,
    createHairSubmission,
    createHairSubmissionDetail,
    createHairSubmissionImages,
    createHairSubmissionLogistics,
    createHairSubmissionLogisticsItems,
    deleteAiScreeningsBySubmissionId,
    deleteHairBundleTrackingHistoryBySubmissionId,
    deleteHairSubmissionById,
    deleteHairSubmissionDetailsBySubmissionId,
    deleteHairSubmissionImagesByDetailIds,
    deleteHairSubmissionLogisticsBySubmissionId,
    deleteSalonDonationAppointmentsBySubmissionId,
    fetchHairBundleTrackingHistory,
    fetchHairSubmissionById,
    fetchHairSubmissionDetailById,
    fetchHairSubmissionDetailByQrToken,
    fetchHairSubmissionDetailsBySubmissionId,
    fetchHairSubmissionImagesByDetailIds,
    fetchHairSubmissionLogisticsBySubmissionId,
    fetchHairSubmissionProgressSummariesByUserId,
    fetchHairSubmissionWorkflowEvidenceByIds,
    fetchHairSubmissionForEventByUserId,
    fetchHairSubmissionSummariesByUserId,
    fetchHairSubmissionsByUserId,
    fetchAiScreeningsByUserId,
    fetchCurrentHairEligibility,
    fetchLatestHairAnalysisSummaryByUserId,
    fetchDonationCertificateBySubmissionId,
    fetchDonationCertificatesByUserId,
    fetchDonorTimelineWigProgressBySubmissionId,
    fetchDonationTimelineProductionByBundleId,
    fetchLatestDonationCertificateByUserId,
    fetchLatestDonationRequirement,
    fetchLatestHairSubmissionDetailBySubmissionId,
    fetchSalonDonationAppointmentBySubmissionId,
    fetchSalonDonationAppointmentsByUserId,
    fetchSalonAppointmentStatusHistoryByAppointmentIds,
    getHairSubmissionImageSignedUrl,
    isHairCheckOnlySubmission,
    removeHairSubmissionImagesFromStorage,
    updateHairSubmissionDetailById,
    updateHairSubmissionById,
    updateHairSubmissionLogisticsById,
    updateHairSubmissionLogisticsItemsByDetailIds,
    uploadHairSubmissionImage,
} from './hairSubmission.api';
import { hairSubmissionStorageBucket } from './hairSubmission.constants';
import { notificationTypes } from './notification.constants';
import { buildImmediateNotificationEvents, recordNotifications } from './notification.service';
import { canSubmitHairDonation, mapDonationPermissionError } from './donorCompliance.service';
const MANUAL_DONATION_SOURCE = 'manual_donor_details';
const INDEPENDENT_DONATION_SOURCE = 'Independent';
const DRIVE_DONATION_SOURCE = 'drive_donation';
const MANUAL_HAIR_PHOTO_IMAGE_TYPE = 'manual_donation_hair_photo';
const MANUAL_DONATION_NOTE_MARKER = 'Manual donor details saved from the donor Donations module.';
const PARCEL_IMAGE_TYPES = ['independent_parcel_photo', 'parcel_photo', 'parcel_log'];
const QR_IMAGE_BASE_URL = 'https://api.qrserver.com/v1/create-qr-code/';
const DONOR_QR_EMAIL_FUNCTION = 'send-donor-qr-email';
const DONOR_CANCELLATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const sanitizeFileName = (value = 'donivra-qr') => (
  String(value || 'donivra-qr')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  || 'donivra-qr'
);

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const formatDateTime = (value) => {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
};

const formatDateShort = (value) => {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
};

const formatHistoryDateLabel = (value) => (
  formatDateShort(value)
);

const normalizeStatus = (value = '') => String(value || '').trim().toLowerCase();
const TERMINAL_DONATION_STATUSES = new Set(['completed', 'cancelled', 'canceled', 'rejected', 'closed']);

const isTerminalDonationStatus = (status = '') => (
  TERMINAL_DONATION_STATUSES.has(normalizeStatus(status))
);

const sortSubmissionsByCreatedAt = (submissions = []) => (
  [...submissions].sort((left, right) => (
    new Date(right?.created_at || right?.updated_at || 0).getTime() - new Date(left?.created_at || left?.updated_at || 0).getTime()
  ))
);

const getLatestSubmissionDetail = (submission = null) => (
  [...(submission?.submission_details || [])]
    .sort((left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime())[0] || null
);

const normalizeYesNoChoice = (value = '') => String(value || '').trim().toLowerCase() === 'yes';

const normalizeLengthUnit = (unit = '') => {
  const normalized = String(unit || '').trim().toLowerCase();
  return normalized === 'cm' ? 'cm' : 'in';
};

const toRoundedNumber = (value, precision = 2) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed.toFixed(precision));
};

const convertLengthToInches = (value, unit = 'in') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return normalizeLengthUnit(unit) === 'cm'
    ? toRoundedNumber(parsed / 2.54)
    : toRoundedNumber(parsed);
};

const resolveMinimumLengthInches = (donationRequirement = null) => {
  if (donationRequirement?.minimum_hair_length_inches == null || donationRequirement.minimum_hair_length_inches === '') return null;
  const configuredLength = Number(donationRequirement?.minimum_hair_length_inches);
  return Number.isFinite(configuredLength) && configuredLength >= 0
    ? toRoundedNumber(configuredLength, 1)
    : null;
};

const buildManualDonationReason = (reasons = []) => (
  reasons.filter(Boolean).join(' ')
);

const evaluateManualDonationEligibility = ({ manualDetails = {}, donationRequirement = null }) => {
  const minimumLengthInches = resolveMinimumLengthInches(donationRequirement);
  const normalizedLengthInches = convertLengthToInches(manualDetails?.length_value, manualDetails?.length_unit);
  const isTreated = normalizeYesNoChoice(manualDetails?.treated);
  const isColored = normalizeYesNoChoice(manualDetails?.colored);
  const reasons = [];

  if (!donationRequirement?.donation_requirement_id) {
    reasons.push('Donation requirements are currently unavailable. Please try again later or contact the organization.');
  } else if (minimumLengthInches != null && (normalizedLengthInches == null || normalizedLengthInches < minimumLengthInches)) {
    reasons.push(`Hair must be at least ${minimumLengthInches} inches to qualify for donation.`);
  }

  if (donationRequirement?.chemical_treatment_status === false && isTreated) {
    reasons.push('Current donation rules do not allow chemically treated hair.');
  }

  if (donationRequirement?.colored_hair_status === false && isColored) {
    reasons.push('Current donation rules do not allow colored hair.');
  }

  return {
    isQualified: reasons.length === 0,
    normalized_length_inches: normalizedLengthInches,
    minimum_length_inches: minimumLengthInches,
    reasons,
    reason: reasons.length
      ? buildManualDonationReason(reasons)
      : 'Your manual donor details meet the current donation criteria.',
  };
};

export const evaluateAiDonationEligibility = ({ screening = null, detail = null, donationRequirement = null }) => {
  if (screening?.current_eligibility) {
    return screening.current_eligibility;
  }
  const hasScreening = Boolean(screening?.ai_screening_id);
  const reason = hasScreening
    ? 'Current eligibility has not been evaluated. Refresh and try again.'
    : '';
  return {
    isQualified: false,
    configurationError: false,
    evaluationUnavailable: hasScreening,
    normalized_length_cm: null,
    minimum_length_cm: null,
    reasons: reason ? [reason] : [],
    reason,
  };
};

const fetchLatestCurrentlyEligibleScreening = async (databaseUserId) => {
  const [screeningsResult, eligibilityResult] = await Promise.all([
    fetchAiScreeningsByUserId(databaseUserId, 30),
    fetchCurrentHairEligibility(),
  ]);
  if (screeningsResult.error || eligibilityResult.error) {
    return { data: null, error: screeningsResult.error || eligibilityResult.error };
  }

  const screening = (screeningsResult.data || []).find((item) => (
    Number(item?.ai_screening_id) === Number(eligibilityResult.data?.ai_screening_id)
  )) || null;
  const qualification = eligibilityResult.data;
  return {
    data: qualification?.isQualified ? { ...screening, current_eligibility: qualification } : null,
    error: qualification?.isQualified ? null : new Error(
      qualification?.reason || 'Pass Hair Analysis before starting a donation.'
    ),
  };
};

const createDonationReference = (prefix = 'DON') => (
  `${prefix}-${Date.now().toString(36).toUpperCase()}`
);

export const createDonationQrReference = (prefix = 'QR') => (
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
);

const createSecureQrToken = () => (
  `hit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}_${Math.random().toString(36).slice(2, 12)}`
);

const createHairItemCode = (submissionDetailId) => (
  `HIR-${new Date().getFullYear()}-${String(submissionDetailId || Date.now()).padStart(6, '0')}`
);

const getHairItemTrackingUrl = (qrToken = '') => {
  const token = encodeURIComponent(String(qrToken || '').trim());
  const appUrl = String(process.env.EXPO_PUBLIC_APP_URL || 'https://donivra.app').replace(/\/+$/, '');
  return `${appUrl}/hair-track/${token}`;
};

const normalizeHairOwnerPayload = ({
  donorType = 'own',
  donorName = '',
  relationshipToSubmitter = '',
  consentConfirmed = false,
} = {}) => {
  const isOther = donorType === 'different' || donorType === 'other' || donorType === 'Other';
  return {
    hair_owner_type: isOther ? 'Other' : 'Self',
    hair_owner_display_name: isOther ? String(donorName || '').trim() : 'You',
    relationship_to_submitter: isOther ? String(relationshipToSubmitter || '').trim() : null,
    consent_confirmed: isOther ? Boolean(consentConfirmed) : true,
    consent_confirmed_at: isOther && consentConfirmed ? new Date().toISOString() : null,
  };
};

const validateHairOwnerPayload = ({
  donorType = 'own',
  donorName = '',
  relationshipToSubmitter = '',
  consentConfirmed = false,
} = {}) => {
  const isOther = donorType === 'different' || donorType === 'other' || donorType === 'Other';
  if (!isOther) return null;
  if (!String(donorName || '').trim()) return 'Enter the hair owner name or label.';
  if (!String(relationshipToSubmitter || '').trim()) return 'Enter your relationship to the hair owner.';
  if (!consentConfirmed) return 'Confirm consent before adding another person\'s hair.';
  return null;
};

const getHairItemDisplayName = (detail = null, fallbackIndex = 0) => {
  const owner = detail?.hair_owner_display_name || (detail?.hair_owner_type === 'Self' ? 'You' : '');
  return `Hair ${fallbackIndex || detail?.submission_detail_id || ''}${owner ? ` - ${owner}` : ''}`.trim();
};

const mergeDonationNotes = (notes = '', additions = []) => {
  const baseText = String(notes || '').trim();
  const fragments = [baseText, ...additions]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const uniqueFragments = [...new Set(fragments)];
  return uniqueFragments.join(' ');
};

export const buildDonationNotification = ({
  dedupeKey,
  type = notificationTypes.logisticsUpdated,
  title,
  message,
  createdAt = new Date().toISOString(),
  referenceType = 'hair_submission',
  referenceId = null,
}) => ({
  dedupeKey,
  type,
  title,
  message,
  createdAt,
  referenceType,
  referenceId,
  isRead: false,
});

const persistDonationNotifications = async ({
  userId,
  notifications = [],
}) => {
  if (!userId || !notifications.length) {
    return;
  }

  try {
    await recordNotifications({
      userId,
      role: 'donor',
      notifications,
    });
  } catch {
    // Keep the main donation flow moving even if notification persistence fails.
  }
};

const buildDonationQrEmailItems = ({
  submission = null,
  details = [],
  titlePrefix = 'Hair donation QR',
} = {}) => (
  (details || [])
    .filter((detail) => detail?.submission_detail_id)
    .map((detail, index) => {
      const qrPayload = buildDonationTrackingQrPayload({ submission, detail });
      const hairItemLabel = detail.hair_item_code || `Hair item ${index + 1}`;
      const reference = submission?.donation_reference || `DON-${submission?.submission_id || ''}`;

      return {
        title: details.length > 1 ? `${titlePrefix} - ${hairItemLabel}` : titlePrefix,
        subtitle: 'Attach this QR to the parcel or hair bundle before shipping or drop-off.',
        qrPayload,
        reference: [reference, hairItemLabel].filter(Boolean).join(' / '),
        details: [
          { label: 'Donation reference', value: reference },
          { label: 'Hair item', value: hairItemLabel },
          { label: 'Length', value: detail.declared_length ? `${detail.declared_length} in` : '' },
          { label: 'Color', value: detail.declared_color || '' },
          { label: 'Condition', value: detail.declared_condition || '' },
        ],
      };
    })
);

export const sendDonorQrEmail = async ({
  donorName = '',
  submission = null,
  details = [],
  titlePrefix = 'Hair donation QR',
} = {}) => {
  const qrItems = buildDonationQrEmailItems({ submission, details, titlePrefix });
  if (!qrItems.length) {
    return null;
  }

  const result = await invokeEdgeFunction(DONOR_QR_EMAIL_FUNCTION, {
    body: {
      donorName,
      qrItems,
    },
  });

  if (result?.error) {
    logAppError('donor_donation.qr_email', result.error);
  }

  return result;
};

const getIndependentQrMetadata = (submission = null) => {
  const qrStatus = String(submission?.qr_status || '').trim();
  const normalizedQrStatus = normalizeStatus(qrStatus);
  const hasDbQr = Boolean(
    submission?.submission_id
    && submission?.donation_reference
    && !['', 'not generated'].includes(normalizedQrStatus)
  );

  if (!hasDbQr) {
    return null;
  }

  const isActivated = ['active', 'activated', 'scanned', 'qr active', 'received', 'shipped'].includes(normalizedQrStatus);
  return {
    reference: submission.donation_reference,
    generated_at: submission?.qr_generated_at || submission?.updated_at || submission?.created_at || '',
    expires_at: '',
    activated_at: isActivated ? (submission?.updated_at || submission?.qr_generated_at || '') : '',
    version: 1,
    status: isActivated ? 'active' : 'inactive',
    is_activated: isActivated,
    is_inactive: !isActivated,
    is_expired: false,
    is_pending: !isActivated,
    can_regenerate: false,
    source: 'Hair_Submissions',
  };
};

const getLatestSubmissionDetailSnapshot = (submission = null) => (
  [...(submission?.submission_details || [])]
    .sort((left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime())[0] || null
);

const isManualDonationSubmission = (submission = null) => {
  const source = String(submission?.donation_source || '').trim().toLowerCase();
  if (source === MANUAL_DONATION_SOURCE) {
    return true;
  }

  if (String(submission?.donor_notes || '').includes(MANUAL_DONATION_NOTE_MARKER)) {
    return true;
  }

  const latestDetail = getLatestSubmissionDetailSnapshot(submission);
  return String(latestDetail?.detail_notes || '').includes(MANUAL_DONATION_NOTE_MARKER);
};

const isIndependentDonationSource = (source = '') => (
  ['independent', 'independent_donation', MANUAL_DONATION_SOURCE]
    .includes(String(source || '').trim().toLowerCase())
);

const upsertSubmissionLogistics = async ({
  submissionId,
  logisticsType,
  shipmentStatus = undefined,
  notes = undefined,
  courierName = undefined,
  trackingNumber = undefined,
  pickupScheduledAt = undefined,
  pickupApprovedAt = undefined,
  receivedBy = undefined,
  receivedAt = undefined,
  updatedBy = undefined,
}) => {
  if (!submissionId) {
    return { data: null, error: new Error('Submission ID is required for logistics updates.') };
  }

  const existingResult = await fetchHairSubmissionLogisticsBySubmissionId(submissionId);
  if (existingResult.error) return existingResult;
  const currentLogistics = existingResult.data || null;
  const payload = {
    submission_id: submissionId,
    logistics_type: logisticsType || currentLogistics?.logistics_type || null,
  };

  if (courierName !== undefined) payload.courier_name = courierName;
  if (trackingNumber !== undefined) payload.tracking_number = trackingNumber;
  if (shipmentStatus !== undefined) payload.shipment_status = shipmentStatus;
  if (pickupScheduledAt !== undefined) payload.pickup_scheduled_at = pickupScheduledAt;
  if (pickupApprovedAt !== undefined) payload.pickup_approved_at = pickupApprovedAt;
  if (receivedBy !== undefined) payload.received_by = receivedBy;
  if (receivedAt !== undefined) payload.received_at = receivedAt;
  if (notes !== undefined) payload.notes = notes;
  if (updatedBy !== undefined) payload.updated_by = updatedBy;

  return currentLogistics?.submission_logistics_id
    ? await updateHairSubmissionLogisticsById(currentLogistics.submission_logistics_id, {
        ...currentLogistics,
        ...payload,
      })
    : await createHairSubmissionLogistics(payload);
};

const resolveIndependentLogisticsType = (method = '') => {
  const key = String(method || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['dropoff', 'walkindropoff', 'salondropoff', 'onsitedelivery', 'walkin'].includes(key)) return 'Walk-in Drop-off';
  if (['shipping', 'shipbycourier', 'courier', 'independentshipping'].includes(key)) return 'Ship by Courier';
  return '';
};

export const getWalkInDropoffAvailability = async () => {
  const result = await supabase.rpc('get_available_walk_in_dates');

  return {
    data: Array.isArray(result.data) ? result.data : [],
    error: result.error?.message || null,
  };
};

export const scheduleWalkInDropoff = async ({
  userId = null,
  submission = null,
  expectedArrivalAt = '',
  contactName = '',
  contactEmail = '',
  contactNumber = '',
}) => {
  if (!expectedArrivalAt) {
    return { success: false, error: 'Choose an expected drop-off date and arrival time before continuing.' };
  }

  const result = await supabase.rpc('schedule_salon_logistics_donation', {
    p_expected_arrival_at: expectedArrivalAt,
    p_contact_name: String(contactName || '').trim(),
    p_contact_number: String(contactNumber || '').trim(),
    p_contact_email: String(contactEmail || '').trim() || null,
    p_donor_notes: 'Salon drop-off scheduled from the mobile Donations module.',
    p_hair_submission_id: submission?.submission_id || null,
  });

  if (result.error || !result.data?.appointment?.appointment_id) {
    return {
      success: false,
      error: result.error?.message || 'Unable to save the expected walk-in arrival.',
    };
  }

  const savedSubmission = result.data.submission;
  const savedLogistics = result.data.logistics;
  const savedAppointment = result.data.appointment;
  const cleanDate = String(savedAppointment.appointment_start_at || '').slice(0, 10);
  const expectedArrivalTime = (() => {
    const formatTime = (value) => new Date(value).toLocaleTimeString('en-PH', {
      hour: 'numeric',
      minute: '2-digit',
    });
    return formatTime(savedAppointment.appointment_start_at);
  })();
  const latestDetail = getLatestSubmissionDetailSnapshot(savedSubmission);
  await createHairBundleTrackingEntry({
    submission_id: savedSubmission.submission_id,
    submission_detail_id: latestDetail?.submission_detail_id || null,
    status: result.data.rescheduled ? 'Walk-in rescheduled' : 'Walk-in scheduled',
    title: result.data.rescheduled ? 'Walk-in drop-off rescheduled' : 'Walk-in drop-off scheduled',
    description: `Expected walk-in arrival: ${cleanDate}, ${expectedArrivalTime}. Staff will scan the QR at receiving.`,
    changed_by: savedSubmission.user_id || null,
  });

  await persistDonationNotifications({
    userId,
    notifications: [
      buildDonationNotification({
        dedupeKey: `${notificationTypes.logisticsUpdated}:${savedSubmission.submission_id}:walkin:${cleanDate}:${expectedArrivalTime}`,
        title: result.data.rescheduled ? 'Walk-in drop-off rescheduled' : 'Walk-in drop-off scheduled',
        message: `We expect your walk-in donation on ${cleanDate} at about ${expectedArrivalTime}. You may still check in if reasonable delays occur.`,
        createdAt: new Date().toISOString(),
        referenceId: savedSubmission.submission_id,
      }),
    ],
  });

  return {
    success: true,
    submission: savedSubmission,
    appointment: savedAppointment,
    logistics: savedLogistics,
    deliveryMethod: 'walk_in',
    rescheduled: Boolean(result.data.rescheduled),
  };
};

export const confirmCourierLogisticsDonation = async ({
  userId = null,
  courierName = '',
  trackingNumber = '',
  notes = '',
} = {}) => {
  const result = await supabase.rpc('confirm_courier_logistics_donation', {
    p_courier_name: String(courierName || '').trim() || null,
    p_tracking_number: String(trackingNumber || '').trim() || null,
    p_donor_notes: String(notes || '').trim() || null,
  });

  if (result.error || !result.data?.submission?.submission_id || !result.data?.logistics?.submission_logistics_id) {
    return {
      success: false,
      error: result.error?.message || 'Unable to confirm the courier donation.',
    };
  }

  const savedSubmission = result.data.submission;
  await persistDonationNotifications({
    userId,
    notifications: [
      buildDonationNotification({
        dedupeKey: `${notificationTypes.logisticsUpdated}:${savedSubmission.submission_id}:courier-confirmed`,
        title: 'Courier donation confirmed',
        message: `Your Donivra waybill is ${savedSubmission.waybill_code}. Attach it and upload package proof before adding courier details.`,
        createdAt: new Date().toISOString(),
        referenceId: savedSubmission.submission_id,
      }),
    ],
  });

  return {
    success: true,
    submission: savedSubmission,
    logistics: result.data.logistics,
    appointment: null,
    deliveryMethod: 'courier',
    rescheduled: false,
  };
};

export const saveCourierShippingDetails = async ({
  submissionId = null,
  courierName = '',
  trackingNumber = '',
} = {}) => {
  const normalizedSubmissionId = Number(submissionId);
  const normalizedCourierName = String(courierName || '').trim();
  const normalizedTrackingNumber = String(trackingNumber || '').trim();

  if (!Number.isInteger(normalizedSubmissionId) || normalizedSubmissionId <= 0) {
    return { success: false, error: 'A valid courier donation is required.' };
  }
  if (!normalizedCourierName) {
    return { success: false, error: 'Enter the courier name.' };
  }
  if (!normalizedTrackingNumber) {
    return { success: false, error: 'Enter the tracking number provided by the courier.' };
  }

  const result = await supabase.rpc('update_own_courier_shipping_details', {
    p_submission_id: normalizedSubmissionId,
    p_courier_name: normalizedCourierName,
    p_tracking_number: normalizedTrackingNumber,
  });

  if (result.error || !result.data?.submission_logistics_id) {
    return {
      success: false,
      error: result.error?.message || 'Unable to save the courier details right now.',
    };
  }

  return { success: true, logistics: result.data };
};

export const discardUnscheduledWalkInDonationDraft = async ({
  submission = null,
  userId = null,
} = {}) => {
  if (!submission?.submission_id || Number(submission?.donation_drive_id)) {
    return { success: true, skipped: true };
  }

  const submissionId = submission.submission_id;

  const [logisticsResult, appointmentResult] = await Promise.all([
    fetchHairSubmissionLogisticsBySubmissionId(submissionId),
    fetchSalonDonationAppointmentBySubmissionId(submissionId),
  ]);

  if (logisticsResult.error) {
    return { success: false, error: logisticsResult.error.message || 'Unable to verify drop-off draft logistics.' };
  }
  if (appointmentResult.error) {
    return { success: false, error: appointmentResult.error.message || 'Unable to verify drop-off draft schedule.' };
  }

  const logistics = logisticsResult.data || null;
  const isUnscheduledWalkInDonation = matchesAnyToken(logistics?.logistics_type, ['onsite_delivery', 'walk_in', 'walk-in', 'dropoff', 'drop-off']);
  const hasSchedule = Boolean(
    appointmentResult.data?.appointment_id
  );

  if (!isUnscheduledWalkInDonation || hasSchedule) {
    return { success: true, skipped: true };
  }

  const detailsResult = await fetchHairSubmissionDetailsBySubmissionId(submissionId);
  if (detailsResult.error) {
    return { success: false, error: detailsResult.error.message || 'Unable to load drop-off draft details.' };
  }

  const detailIds = (detailsResult.data || [])
    .map((detail) => detail?.submission_detail_id)
    .filter(Boolean);
  const imagesResult = await fetchHairSubmissionImagesByDetailIds(detailIds);
  if (imagesResult.error) {
    return { success: false, error: imagesResult.error.message || 'Unable to load drop-off draft photos.' };
  }

  const imagePaths = (imagesResult.data || []).map((image) => image?.file_path).filter(Boolean);
  const deleteSteps = [
    async () => deleteAiScreeningsBySubmissionId(submissionId),
    async () => deleteHairBundleTrackingHistoryBySubmissionId(submissionId),
    async () => deleteSalonDonationAppointmentsBySubmissionId(submissionId),
    async () => deleteHairSubmissionLogisticsBySubmissionId(submissionId),
    async () => deleteHairSubmissionImagesByDetailIds(detailIds),
    async () => imagePaths.length ? removeHairSubmissionImagesFromStorage({ paths: imagePaths }) : { error: null },
    async () => deleteHairSubmissionDetailsBySubmissionId(submissionId),
    async () => deleteHairSubmissionById(submissionId),
  ];

  for (const deleteStep of deleteSteps) {
    const result = await deleteStep();
    if (result?.error) {
      logAppError('donor_donation.discard_unscheduled_walkin', result.error, {
        userId,
        submissionId,
      });
      return { success: false, error: result.error.message || 'Unable to delete the unscheduled drop-off draft.' };
    }
  }

  return { success: true, deleted: true };
};

export const markDonationShippedByDonor = async ({
  submission,
  databaseUserId = null,
}) => {
  if (!submission?.submission_id) {
    return { success: false, error: 'Donation record was not found.' };
  }
  if (Number(submission?.donation_drive_id)) {
    return { success: false, error: 'Event donations do not use independent shipping.' };
  }

  const details = (submission?.submission_details || [])
    .filter((detail) => detail?.submission_detail_id);
  if (!details.length) {
    return { success: false, error: 'No hair item is linked to this donation.' };
  }

  for (const detail of details) {
    const statusResult = await updateHairItemStatus(
      detail.submission_detail_id,
      'Shipped',
      '',
      databaseUserId
    );
    if (!statusResult.success) {
      return { success: false, error: statusResult.error || 'Unable to update the shipment status.' };
    }
  }

  const shippedAt = new Date().toISOString();
  const logisticsResult = await upsertSubmissionLogistics({
    submissionId: submission.submission_id,
    logisticsType: 'Ship by Courier',
    shipmentStatus: 'Shipped',
    notes: 'The donor confirmed that the parcel was sent with the printed waybill QR attached.',
  });

  if (logisticsResult.error) {
    return { success: false, error: logisticsResult.error.message || 'Unable to save the shipment update.' };
  }

  return {
    success: true,
    shippedAt,
    logistics: logisticsResult.data || null,
  };
};

export const saveIndependentDonationShipment = async ({
  submission,
  databaseUserId,
  logisticsType = '',
  courierName = '',
  trackingNumber = '',
  pickupScheduledAt = null,
  notes = '',
}) => {
  if (!submission?.submission_id) {
    return { success: false, error: 'A valid donation submission is required.' };
  }

  const detailsResult = await fetchHairSubmissionDetailsBySubmissionId(submission.submission_id);
  if (detailsResult.error) {
    return { success: false, error: detailsResult.error.message || 'Unable to load donation hair items.' };
  }

  const details = detailsResult.data || [];
  if (!details.length) {
    return { success: false, error: 'No hair items are linked to this donation.' };
  }

  const logisticsResult = await upsertSubmissionLogistics({
    submissionId: submission.submission_id,
    logisticsType,
    shipmentStatus: 'Shipped',
    notes,
    courierName,
    trackingNumber,
    pickupScheduledAt,
    updatedBy: databaseUserId || null,
  });

  if (logisticsResult.error || !logisticsResult.data?.submission_logistics_id) {
    return { success: false, error: logisticsResult.error?.message || 'Unable to save shipment details.' };
  }

  await createHairSubmissionLogisticsItems(details.map((detail) => ({
    submission_logistics_id: logisticsResult.data.submission_logistics_id,
    submission_detail_id: detail.submission_detail_id,
    item_logistics_status: 'Shipped',
  })));

  for (const detail of details) {
    await updateHairSubmissionDetailById(detail.submission_detail_id, {
      status: 'Shipped',
      current_tracking_status: 'Shipped',
      updated_by: databaseUserId || null,
    });
    await createHairBundleTrackingEntry({
      submission_id: submission.submission_id,
      submission_detail_id: detail.submission_detail_id,
      status: 'Shipped',
      title: 'Hair Item Shipped',
      description: 'This hair item was included in the submitted shipment.',
      changed_by: databaseUserId,
    });
  }

  const statusResult = await recalculateSubmissionStatus(submission.submission_id);
  return {
    success: true,
    logistics: logisticsResult.data,
    submission: statusResult.submission || submission,
  };
};

const syncIndependentDonationSubmission = async ({
  userId,
  databaseUserId,
  submission,
  status,
  logisticsStatus,
  logisticsNotes,
  trackingStatus = '',
  trackingTitle = '',
  trackingDescription = '',
  shouldTrack = false,
  shouldNotify = false,
  donationDriveId = null,
  logisticsType = undefined,
  qrStatus = undefined,
  qrGeneratedAt = undefined,
}) => {
  if (!submission?.submission_id) {
    return { success: false, error: 'A valid donation submission is required.' };
  }
  const isEventDonation = submission?.from_event === true || Number(donationDriveId || submission?.donation_drive_id) > 0;

  const nextNotes = mergeDonationNotes(
    submission?.donor_notes || '',
    [donationDriveId ? 'Donation path: event donation drive.' : 'Donation path: independent donation.'],
    null,
  );

  const submissionResult = await updateHairSubmissionById(submission.submission_id, {
    donation_drive_id: donationDriveId ?? submission?.donation_drive_id ?? undefined,
    donation_source: donationDriveId ? DRIVE_DONATION_SOURCE : INDEPENDENT_DONATION_SOURCE,
    donor_notes: nextNotes,
    qr_status: qrStatus,
    qr_generated_at: qrGeneratedAt,
    status,
  });

  if (submissionResult.error || !submissionResult.data?.submission_id) {
    return {
      success: false,
      error: submissionResult.error?.message || 'Unable to update the independent donation submission.',
    };
  }

  const logisticsResult = isEventDonation
    ? { data: null, error: null }
    : await upsertSubmissionLogistics({
        submissionId: submissionResult.data.submission_id,
        logisticsType,
        shipmentStatus: logisticsStatus,
        notes: logisticsNotes,
        updatedBy: databaseUserId || null,
      });

  if (logisticsResult.error) {
    return {
      success: false,
      error: logisticsResult.error.message || 'Unable to save the donation logistics state.',
    };
  }

  const latestDetail = getLatestSubmissionDetailSnapshot(submissionResult.data);
  if (shouldTrack) {
    const trackingResult = await createHairBundleTrackingEntry({
      submission_id: submissionResult.data.submission_id,
      submission_detail_id: latestDetail?.submission_detail_id || null,
      status: trackingStatus || logisticsStatus,
      title: trackingTitle || trackingStatus || logisticsStatus,
      description: trackingDescription || logisticsNotes,
      changed_by: databaseUserId || null,
    });

    if (trackingResult.error) {
      return {
        success: false,
        error: trackingResult.error.message || 'Unable to save the donation tracking update.',
      };
    }
  }

  if (shouldNotify) {
    await persistDonationNotifications({
      userId,
      notifications: [
        buildDonationNotification({
          dedupeKey: `${notificationTypes.logisticsUpdated}:${submissionResult.data.submission_id}:${status}`,
          title: trackingTitle || 'Donation update',
          message: trackingDescription || logisticsNotes,
          createdAt: new Date().toISOString(),
          referenceId: submissionResult.data.submission_id,
        }),
      ],
    });
  }

  return {
    success: true,
    submission: submissionResult.data,
    logistics: logisticsResult.data || null,
  };
};

export const getIndependentDonationQrState = ({
  submission = null,
  logistics = null,
  trackingEntries = [],
} = {}) => {
  const metadata = getIndependentQrMetadata(submission);
  if (!metadata?.reference) {
    return null;
  }

  const shipmentStatus = normalizeStatus(logistics?.shipment_status);
  const hasActivationTracking = (trackingEntries || []).some((entry) => (
    matchesAnyToken(entry?.status, ['qr activated', 'qr active', 'donation qr activated'])
    || matchesAnyToken(entry?.title, ['qr activated', 'qr active', 'donation qr activated'])
  ));
  const isFlowActivated = (
    metadata.is_activated
    || ['qr activated', 'activated', 'qr active', 'active'].includes(shipmentStatus)
    || hasActivationTracking
  );

  return {
    ...metadata,
    status: isFlowActivated ? 'active' : 'inactive',
    is_activated: isFlowActivated,
    is_inactive: !isFlowActivated,
    is_pending: !isFlowActivated,
    is_expired: false,
    is_valid: Boolean(metadata.reference),
    show_my_qr: Boolean(metadata.reference),
    upload_unlocked: isFlowActivated,
  };
};

const buildManualDonationNotes = ({
  manualDetails = {},
  evaluation = null,
  donorType = 'own',
}) => (
  [
    MANUAL_DONATION_NOTE_MARKER,
    `Hair owner: ${donorType === 'different' ? 'Other person' : 'Account owner'}`,
    donorType === 'different' ? `Donor name: ${manualDetails?.donor_name || 'Not provided'}` : '',
    donorType === 'different' ? `Donor birthdate: ${manualDetails?.donor_birthdate || 'Not provided'}` : '',
    donorType === 'different' && manualDetails?.donor_age != null ? `Donor age: ${manualDetails.donor_age}` : '',
    donorType === 'different' && manualDetails?.donor_is_minor != null
      ? `Minor donor: ${manualDetails.donor_is_minor ? 'Yes' : 'No'}`
      : '',
    `Length entered: ${manualDetails?.length_value || '-'} ${normalizeLengthUnit(manualDetails?.length_unit)}`,
    `Treated: ${normalizeYesNoChoice(manualDetails?.treated) ? 'Yes' : 'No'}`,
    `Colored: ${normalizeYesNoChoice(manualDetails?.colored) ? 'Yes' : 'No'}`,
    `Trimmed: ${normalizeYesNoChoice(manualDetails?.trimmed) ? 'Yes' : 'No'}`,
    `Hair color: ${manualDetails?.hair_color || 'Not provided'}`,
    `Density: ${manualDetails?.density || 'Not provided'}`,
    evaluation?.reason || '',
  ].filter(Boolean).join(' | ')
);

const buildAdditionalBundleNotes = ({
  donorType = 'own',
  inputMethod = 'manual',
  detailNotes = '',
  donorName = '',
  donorBirthdate = '',
  donorAge = null,
  donorIsMinor = null,
}) => (
  [
    `Additional hair owner: ${donorType === 'different' ? 'Other person' : 'Account owner'}.`,
    donorType === 'different' ? `Donor name: ${donorName || 'Not provided'}` : '',
    donorType === 'different' ? `Donor birthdate: ${donorBirthdate || 'Not provided'}` : '',
    donorType === 'different' && donorAge != null ? `Donor age: ${donorAge}` : '',
    donorType === 'different' && donorIsMinor != null ? `Minor donor: ${donorIsMinor ? 'Yes' : 'No'}` : '',
    `Additional bundle input method: ${inputMethod === 'scan' ? 'Live scan' : 'Manual details'}.`,
    detailNotes || '',
  ].filter(Boolean).join(' ')
);

const resolveManualDonationRecord = ({ submissions = [], donationRequirement = null }) => {
  const latestManualSubmission = sortSubmissionsByCreatedAt(submissions)
    .find((submission) => isManualDonationSubmission(submission)) || null;
  const latestManualDetail = getLatestSubmissionDetail(latestManualSubmission);

  if (!latestManualSubmission || !latestManualDetail) {
    return null;
  }

  const manualDetails = {
    length_value: latestManualDetail.declared_length ?? null,
    length_unit: 'in',
    treated: latestManualDetail.is_chemically_treated ? 'yes' : 'no',
    colored: latestManualDetail.is_colored ? 'yes' : 'no',
    trimmed: String(latestManualDetail.detail_notes || '').toLowerCase().includes('trimmed: yes') ? 'yes' : 'no',
    hair_color: latestManualDetail.declared_color || '',
    density: latestManualDetail.declared_density || '',
  };
  const qualification = evaluateManualDonationEligibility({ manualDetails, donationRequirement });

  return {
    source: 'manual',
    submission: latestManualSubmission,
    detail: latestManualDetail,
    screening: null,
    recommendations: [],
    qualification,
    created_at: latestManualSubmission?.created_at || null,
  };
};

const resolveAiDonationRecord = (latestAnalysisEntry = null, donationRequirement = null) => {
  if (!latestAnalysisEntry?.screening) {
    return null;
  }

  const qualification = evaluateAiDonationEligibility({
    screening: latestAnalysisEntry.screening,
    detail: latestAnalysisEntry.detail,
    donationRequirement,
  });

  if (!qualification.isQualified) {
    return null;
  }

  return {
    source: 'ai',
    submission: latestAnalysisEntry.submission || null,
    detail: latestAnalysisEntry.detail || null,
    screening: latestAnalysisEntry.screening || null,
    recommendations: latestAnalysisEntry.recommendations || [],
    qualification,
    created_at: latestAnalysisEntry?.submission?.created_at || latestAnalysisEntry?.screening?.created_at || null,
  };
};

const getSubmissionParcelImages = (submission = null) => (
  (submission?.submission_details || []).flatMap((detail) => (
    (detail?.images || []).filter((image) => PARCEL_IMAGE_TYPES.includes(image?.image_type))
  ))
);

const hasCurrentFlowStatus = (submission = null) => (
  [
    'submitted',
    'qr inactive',
    'qr active',
    'qr pending activation',
    'qr activated',
    'ready for shipment',
    'in transit',
    'received',
    'quality',
    'shipment',
  ].some((token) => normalizeStatus(submission?.status).includes(token))
);

const hasSubmissionFlowProgress = (submission = null) => (
  Boolean(
    hasCurrentFlowStatus(submission)
    || submission?.cut_at
    || submission?.bundle_id
    || Boolean(getIndependentQrMetadata(submission)?.reference)
    || Boolean(getSubmissionParcelImages(submission).length)
  )
);

const hasEventDonationProgress = ({ submission = null, registration = null } = {}) => (
  Boolean(
    Number(submission?.donation_drive_id) > 0
    && (registration
      ? isDonationParticipantRegistration(registration) && isMarkedPresentRegistration(registration)
      : hasSubmissionFlowProgress(submission))
  )
);

const hasIndependentDonationProgress = (submission = null) => (
  Boolean(
    !Number(submission?.donation_drive_id)
    && isIndependentDonationSource(submission?.donation_source)
  )
);

const isSubmissionCompleted = ({ submission = null }) => (
  Boolean(
    !submission?.submission_id
    || isTerminalDonationStatus(submission?.status)
  )
);

const resolveQualifiedDonationRecordForSubmission = ({ submission = null, donationRequirement = null }) => {
  if (!submission?.submission_id) {
    return null;
  }

  const detail = getLatestSubmissionDetail(submission);
  if (!detail?.submission_detail_id) {
    return null;
  }

  const latestQualifiedAiScreeningEntry = [...(submission?.ai_screenings || [])]
    .sort((left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime())
    .map((screening) => ({
      screening,
      qualification: evaluateAiDonationEligibility({
        screening,
        detail,
        donationRequirement,
      }),
    }))
    .find((entry) => entry.qualification.isQualified) || null;

  if (latestQualifiedAiScreeningEntry?.screening) {
    return {
      source: 'ai',
      submission,
      detail,
      screening: latestQualifiedAiScreeningEntry.screening,
      recommendations: latestQualifiedAiScreeningEntry.screening?.recommendations || [],
      qualification: latestQualifiedAiScreeningEntry.qualification,
      created_at: submission?.updated_at || submission?.created_at || latestQualifiedAiScreeningEntry.screening?.created_at || null,
    };
  }

  if (!isManualDonationSubmission(submission)) {
    return null;
  }

  const manualDetails = {
    length_value: detail.declared_length ?? null,
    length_unit: 'in',
    treated: detail.is_chemically_treated ? 'yes' : 'no',
    colored: detail.is_colored ? 'yes' : 'no',
    trimmed: String(detail.detail_notes || '').toLowerCase().includes('trimmed: yes') ? 'yes' : 'no',
    hair_color: detail.declared_color || '',
    density: detail.declared_density || '',
  };
  const qualification = evaluateManualDonationEligibility({ manualDetails, donationRequirement });
  if (!qualification.isQualified) {
    return null;
  }

  return {
    source: 'manual',
    submission,
    detail,
    screening: null,
    recommendations: [],
    qualification,
    created_at: submission?.updated_at || submission?.created_at || null,
  };
};

const resolveCurrentDonationRecord = ({
  submissions = [],
  donationRequirement = null,
  fallbackRecord = null,
}) => {
  const sortedSubmissions = sortSubmissionsByCreatedAt(submissions);
  const driveFirstSubmissions = [
    ...sortedSubmissions.filter((submission) => Boolean(submission?.donation_drive_id)),
    ...sortedSubmissions.filter((submission) => !submission?.donation_drive_id),
  ];

  const flowMatchedRecord = driveFirstSubmissions
    .filter((submission) => !isSubmissionCompleted({ submission }))
    .find((submission) => (
      hasEventDonationProgress({ submission })
      || hasIndependentDonationProgress(submission)
    ));

  if (flowMatchedRecord) {
    const resolvedRecord = resolveQualifiedDonationRecordForSubmission({
      submission: flowMatchedRecord,
      donationRequirement,
    });

    if (resolvedRecord) {
      return resolvedRecord;
    }
  }

  if (fallbackRecord?.submission && !isSubmissionCompleted({ submission: fallbackRecord.submission })) {
    return fallbackRecord;
  }

  return null;
};

const resolveCurrentFlowSubmission = ({
  submissions = [],
} = {}) => {
  const sortedSubmissions = sortSubmissionsByCreatedAt(submissions);
  const driveFirstSubmissions = [
    ...sortedSubmissions.filter((submission) => Boolean(submission?.donation_drive_id)),
    ...sortedSubmissions.filter((submission) => !submission?.donation_drive_id),
  ];

  return driveFirstSubmissions
    .filter((submission) => !isSubmissionCompleted({ submission }))
    .find((submission) => (
      hasEventDonationProgress({ submission })
      || hasIndependentDonationProgress(submission)
    )) || null;
};

const resolveCurrentFlowSubmissions = ({
  submissions = [],
} = {}) => {
  const sortedSubmissions = sortSubmissionsByCreatedAt(submissions);
  const driveFirstSubmissions = [
    ...sortedSubmissions.filter((submission) => Boolean(submission?.donation_drive_id)),
    ...sortedSubmissions.filter((submission) => !submission?.donation_drive_id),
  ];

  return driveFirstSubmissions
    .filter((submission) => !isSubmissionCompleted({ submission }))
    .filter((submission) => (
      hasEventDonationProgress({ submission })
      || hasIndependentDonationProgress(submission)
    ));
};

const resolveActiveDonationRecord = ({ aiRecord = null, manualRecord = null }) => (
  [aiRecord, manualRecord]
    .filter((record) => record?.qualification?.isQualified)
    .sort((left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime())[0] || null
);

const buildDonationHistory = ({ submissions = [], activeSubmission = null }) => (
  sortSubmissionsByCreatedAt(submissions)
    .filter((submission) => submission?.submission_id && submission.submission_id !== activeSubmission?.submission_id)
    .filter((submission) => isTerminalDonationStatus(submission?.status))
    .map((submission) => ({
      submission_id: submission.submission_id,
      donation_reference: submission.donation_reference || '',
      status: submission.status || '',
      donation_source: submission.donation_source || '',
      created_at: submission.created_at || '',
      updated_at: submission.updated_at || '',
      date_label: formatHistoryDateLabel(submission.updated_at || submission.created_at || ''),
      bundle_quantity: Array.isArray(submission?.submission_details) ? submission.submission_details.length : 0,
    }))
);

const DONOR_HISTORY_STATUS_LABELS = {
  pending: 'Submitted',
  cut: 'Hair received',
  received: 'Hair received',
  accepted: 'Hair accepted',
  bundled: 'Hair bundled',
  wiginproduction: 'Wig in production',
  wigcreated: 'Wig created',
  completed: 'Completed',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  rejected: 'Not accepted',
};

const formatActivityStatus = (value = '', fallback = 'Recorded') => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const sortActivityTimeline = (items = []) => {
  const seen = new Set();
  return items
    .filter((item) => item?.timestamp)
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
    .filter((item) => {
      const key = `${normalizeTimelineStatusKey(item?.title)}|${item?.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const getLatestActivityTimestamp = (timeline = [], fallback = null) => (
  [...timeline]
    .map((item) => item?.timestamp)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0]
  || fallback
);

const isCancelledActivityStatus = (value = '') => (
  ['cancelled', 'canceled', 'rejected'].includes(normalizeTimelineStatusKey(value))
);

const buildDonationActivityTimeline = ({ submission, trackingEntries = [], certificate = null }) => {
  const submittedAt = submission?.created_at || submission?.submitted_at || null;
  const timeline = submittedAt ? [{
    key: `donation-${submission.submission_id}-submitted`,
    title: 'Donation Submitted',
    description: 'The hair donation was recorded in Donivra.',
    timestamp: submittedAt,
    status: 'Completed',
  }] : [];

  (trackingEntries || [])
    .filter((entry) => {
      const text = `${entry?.title || ''} ${entry?.description || ''}`.toLowerCase();
      return entry?.updated_at && !text.includes('manual donor details saved');
    })
    .forEach((entry) => {
      timeline.push({
        key: `tracking-${entry?.tracking_id || entry?.id || `${submission.submission_id}-${entry.updated_at}`}`,
        title: String(entry?.title || formatActivityStatus(entry?.status, 'Donation Updated')).trim(),
        description: String(entry?.description || '').trim(),
        timestamp: entry.updated_at,
        status: formatActivityStatus(entry?.status, 'Completed'),
      });
    });

  const statusKey = normalizeTimelineStatusKey(submission?.status);
  const statusLabel = DONOR_HISTORY_STATUS_LABELS[statusKey]
    || formatActivityStatus(submission?.status, 'Submitted');
  const hasCurrentStatusEvent = timeline.some((item) => (
    normalizeTimelineStatusKey(`${item?.title || ''} ${item?.status || ''}`).includes(statusKey)
  ));
  if (statusKey && statusKey !== 'pending' && submission?.updated_at && !hasCurrentStatusEvent) {
    timeline.push({
      key: `donation-${submission.submission_id}-${statusKey}`,
      title: statusLabel,
      description: isCancelledActivityStatus(submission.status)
        ? 'This donation activity was closed.'
        : 'This is the latest recorded stage of the donation.',
      timestamp: submission.updated_at,
      status: isCancelledActivityStatus(submission.status) ? statusLabel : 'Current stage',
      isCurrent: !isCancelledActivityStatus(submission.status)
        && !['completed', 'wigcreated', 'wigcompleted'].includes(statusKey),
    });
  }

  if (certificate?.issued_at) {
    timeline.push({
      key: `certificate-${certificate.certificate_id || certificate.id}`,
      title: 'Certificate Issued',
      description: certificate.certificate_number
        ? `Certificate ${certificate.certificate_number} is available in Achievements.`
        : 'The donation certificate is available in Achievements.',
      timestamp: certificate.issued_at,
      status: 'Completed',
    });
  }

  const sorted = sortActivityTimeline(timeline);
  const donationIsClosed = isCancelledActivityStatus(submission?.status)
    || ['completed', 'wigcreated', 'wigcompleted'].includes(statusKey);
  if (donationIsClosed) {
    sorted.forEach((item) => {
      item.isCurrent = false;
    });
  } else if (sorted.length > 1) {
    sorted.forEach((item, index) => {
      item.isCurrent = index === sorted.length - 1 && !certificate?.issued_at;
    });
  }
  return sorted;
};

const buildDonorActivityHistory = ({
  submissions = [],
  workflowEvidence = [],
  screenings = [],
  registeredDrives = [],
  certificates = [],
  appointments = [],
  appointmentHistory = [],
} = {}) => {
  const activities = [];
  const realDonations = submissions.filter((submission) => (
    submission?.submission_id && !isHairCheckOnlySubmission(submission)
  ));
  const submissionById = new Map(
    realDonations.map((submission) => [Number(submission.submission_id), submission])
  );

  const workflowBySubmissionId = new Map(
    workflowEvidence.map((record) => [Number(record?.submission?.submission_id), record])
  );
  const certificateBySubmissionId = new Map(
    certificates
      .filter((certificate) => certificate?.submission_id)
      .map((certificate) => [Number(certificate.submission_id), certificate])
  );
  const driveById = new Map(
    registeredDrives
      .filter((drive) => drive?.donation_drive_id)
      .map((drive) => [Number(drive.donation_drive_id), drive])
  );
  const donationActivityBySubmissionId = new Map();

  realDonations.forEach((submission) => {
    const workflow = workflowBySubmissionId.get(Number(submission.submission_id)) || null;
    const certificate = certificateBySubmissionId.get(Number(submission.submission_id)) || null;
    const drive = driveById.get(Number(submission.donation_drive_id)) || null;
    const timeline = buildDonationActivityTimeline({
      submission,
      trackingEntries: workflow?.trackingEntries || [],
      certificate,
    });
    const statusKey = normalizeTimelineStatusKey(submission.status);
    const status = DONOR_HISTORY_STATUS_LABELS[statusKey]
      || formatActivityStatus(submission.status, 'Submitted');
    const timestamp = getLatestActivityTimestamp(
      timeline,
      submission.updated_at || submission.created_at || null
    );
    const activity = {
      id: `donation-${submission.submission_id}`,
      type: 'donation',
      title: `Hair Donation ${submission.donation_reference || `DON-${submission.submission_id}`}`,
      related_title: drive?.event_title
        || (workflow?.logistics?.logistics_type ? `${formatActivityStatus(workflow.logistics.logistics_type)} donation` : 'Independent donation'),
      status,
      timestamp,
      activity_date: submission.created_at || timestamp,
      date_label: formatHistoryDateLabel(submission.created_at || timestamp),
      reference: submission.donation_reference || `DON-${submission.submission_id}`,
      icon: 'hand-heart-outline',
      timeline,
      submission_id: submission.submission_id,
      drive_id: submission.donation_drive_id || null,
      certificate_id: certificate?.certificate_id || certificate?.id || null,
      certificate_number: certificate?.certificate_number || '',
      isOngoing: !isCancelledActivityStatus(submission.status)
        && !['completed', 'wigcreated', 'wigcompleted'].includes(statusKey),
    };
    donationActivityBySubmissionId.set(Number(submission.submission_id), activity);
    activities.push(activity);
  });

  registeredDrives.forEach((drive) => {
    const registration = drive?.registration;
    if (!registration?.registration_id) return;
    const attended = isMarkedPresentRegistration(registration);
    const registrationStatusKey = normalizeTimelineStatusKey(registration.registration_status);
    const cancelled = ['cancelled', 'canceled'].includes(registrationStatusKey);
    const registeredAt = registration.registered_at || null;
    const attendedAt = registration.rsvp_scanned_at || registration.attendance_marked_at || null;
    const relatedDonation = realDonations.find((submission) => (
      Number(submission?.event_attendee_id) === Number(registration.registration_id)
      || Number(submission?.donation_drive_id) === Number(drive.donation_drive_id)
    )) || null;
    const donationActivity = relatedDonation
      ? donationActivityBySubmissionId.get(Number(relatedDonation.submission_id))
      : null;
    const timeline = sortActivityTimeline([
      registeredAt ? {
        key: `event-${registration.registration_id}-rsvp`,
        title: 'RSVP Submitted',
        description: 'Participation in the event was recorded.',
        timestamp: registeredAt,
        status: 'Completed',
      } : null,
      cancelled && registration.updated_at ? {
        key: `event-${registration.registration_id}-cancelled`,
        title: 'RSVP Cancelled',
        description: 'The event registration was cancelled.',
        timestamp: registration.updated_at,
        status: 'Cancelled',
      } : null,
      attendedAt ? {
        key: `event-${registration.registration_id}-attended`,
        title: 'Checked In',
        description: 'Attendance at the event was confirmed.',
        timestamp: attendedAt,
        status: 'Completed',
      } : null,
      ...(donationActivity?.timeline || []),
    ]);
    const timestamp = attendedAt || registration.updated_at || registeredAt || drive.start_date || null;

    activities.push({
      id: `event-${registration.registration_id}`,
      type: 'event',
      title: String(drive?.event_title || 'Donation Event').trim(),
      related_title: relatedDonation
        ? `Related donation: ${relatedDonation.donation_reference || `DON-${relatedDonation.submission_id}`}`
        : drive?.venue_name || drive?.location_label || '',
      status: cancelled ? 'Cancelled' : attended ? 'Completed' : 'Joined',
      timestamp,
      activity_date: drive.start_date || timestamp,
      date_label: formatHistoryDateLabel(drive.start_date || timestamp),
      reference: relatedDonation?.donation_reference || '',
      icon: cancelled ? 'calendar-remove-outline' : 'calendar-check-outline',
      timeline,
      drive_id: drive.donation_drive_id,
      submission_id: relatedDonation?.submission_id || null,
      certificate_id: donationActivity?.certificate_id || null,
      certificate_number: donationActivity?.certificate_number || '',
      isOngoing: !cancelled && !attended,
    });
  });

  screenings.forEach((screening) => {
    const timestamp = screening?.created_at || null;
    const linkedSubmission = realDonations.find((submission) => (
      Number(submission?.ai_screening_id) === Number(screening?.ai_screening_id || screening?.id)
      || (screening?.submission_id && Number(submission?.submission_id) === Number(screening.submission_id))
    )) || null;
    const usedAt = linkedSubmission?.created_at || linkedSubmission?.submitted_at || null;
    const timeline = sortActivityTimeline([
      timestamp ? {
        key: `analysis-${screening?.ai_screening_id || screening?.id}-completed`,
        title: 'Hair Analysis Completed',
        description: screening?.summary || 'The Hair Analysis result was saved.',
        timestamp,
        status: formatActivityStatus(screening?.decision, 'Completed'),
      } : null,
      linkedSubmission && usedAt ? {
        key: `analysis-${screening?.ai_screening_id || screening?.id}-used`,
        title: 'Used for Donation',
        description: `Used for ${linkedSubmission.donation_reference || `DON-${linkedSubmission.submission_id}`}.`,
        timestamp: usedAt,
        status: 'Completed',
      } : null,
    ]);
    activities.push({
      id: `analysis-${screening?.ai_screening_id || screening?.id}`,
      type: 'analysis',
      title: 'Hair Analysis Completed',
      related_title: linkedSubmission
        ? `Used for ${linkedSubmission.donation_reference || `DON-${linkedSubmission.submission_id}`}`
        : screening?.detected_condition || '',
      status: formatActivityStatus(screening?.decision, 'Analysis saved'),
      timestamp,
      activity_date: timestamp,
      date_label: formatHistoryDateLabel(timestamp),
      icon: 'creation-outline',
      timeline,
      screening_id: screening?.ai_screening_id || screening?.id || null,
      submission_id: linkedSubmission?.submission_id || null,
      reference: linkedSubmission?.donation_reference || '',
      isOngoing: false,
    });
  });

  const appointmentHistoryById = new Map();
  (appointmentHistory || []).forEach((entry) => {
    const appointmentId = Number(entry?.Appointment_ID || entry?.appointment_id);
    if (!appointmentId) return;
    const entries = appointmentHistoryById.get(appointmentId) || [];
    entries.push(entry);
    appointmentHistoryById.set(appointmentId, entries);
  });

  appointments.forEach((appointment) => {
    const statusKey = normalizeTimelineStatusKey(appointment?.status);
    if (!['completed', 'cancelled', 'canceled', 'noshow'].includes(statusKey)) return;
    const linkedSubmission = submissionById.get(Number(appointment.submission_id)) || null;
    const rawHistory = appointmentHistoryById.get(Number(appointment.appointment_id)) || [];
    const timeline = sortActivityTimeline([
      appointment.created_at ? {
        key: `appointment-${appointment.appointment_id}-created`,
        title: 'Expected Arrival Scheduled',
        description: 'The Walk-in expected arrival was recorded.',
        timestamp: appointment.created_at,
        status: 'Completed',
      } : null,
      ...rawHistory.map((entry) => ({
        key: `appointment-history-${entry?.Status_History_ID || entry?.status_history_id}`,
        title: formatActivityStatus(entry?.To_Status || entry?.to_status || entry?.Change_Type || entry?.change_type, 'Appointment Updated'),
        description: String(entry?.Notes || entry?.notes || '').trim(),
        timestamp: entry?.Changed_At || entry?.changed_at || null,
        status: 'Completed',
      })),
      appointment.checked_in_at ? {
        key: `appointment-${appointment.appointment_id}-checked-in`,
        title: 'Checked In',
        description: 'Arrival at the receiving location was confirmed.',
        timestamp: appointment.checked_in_at,
        status: 'Completed',
      } : null,
      appointment.completed_at ? {
        key: `appointment-${appointment.appointment_id}-completed`,
        title: 'Appointment Completed',
        description: 'The Walk-in receiving activity was completed.',
        timestamp: appointment.completed_at,
        status: 'Completed',
      } : null,
      appointment.cancelled_at ? {
        key: `appointment-${appointment.appointment_id}-cancelled`,
        title: statusKey === 'noshow' ? 'Marked as No Show' : 'Appointment Cancelled',
        description: appointment.cancellation_reason || 'The Walk-in activity was closed.',
        timestamp: appointment.cancelled_at,
        status: statusKey === 'noshow' ? 'No Show' : 'Cancelled',
      } : null,
    ]);
    const timestamp = appointment.completed_at
      || appointment.cancelled_at
      || appointment.updated_at
      || appointment.appointment_start_at
      || appointment.created_at;
    activities.push({
      id: `appointment-${appointment.appointment_id}`,
      type: 'appointment',
      title: 'Walk-in Donation Appointment',
      related_title: linkedSubmission
        ? `Related donation: ${linkedSubmission.donation_reference || `DON-${linkedSubmission.submission_id}`}`
        : '',
      status: statusKey === 'noshow' ? 'No Show' : formatActivityStatus(appointment.status),
      timestamp,
      activity_date: appointment.appointment_start_at || timestamp,
      date_label: formatHistoryDateLabel(appointment.appointment_start_at || timestamp),
      reference: linkedSubmission?.donation_reference || '',
      icon: statusKey === 'completed' ? 'store-check-outline' : 'calendar-remove-outline',
      timeline,
      appointment_id: appointment.appointment_id,
      submission_id: appointment.submission_id || null,
      appointment_start_at: appointment.appointment_start_at || null,
      isOngoing: false,
    });
  });

  return activities
    .sort((left, right) => {
      const leftTime = left?.activity_date || left?.timestamp
        ? new Date(left.activity_date || left.timestamp).getTime()
        : 0;
      const rightTime = right?.activity_date || right?.timestamp
        ? new Date(right.activity_date || right.timestamp).getTime()
        : 0;
      return rightTime - leftTime;
    });
};

/**
 * Page-only activity loader. Call this only after the donor opens History; it
 * deliberately does not participate in profile/dashboard initialization.
 */
export const getDonorDonationHistory = async ({ userId, databaseUserId, limit = 100 } = {}) => {
  if (!userId || !databaseUserId) return { historyItems: [], donationHistory: [], error: 'Your session is not ready.' };

  const [submissionsResult, screeningsResult, drivesResult, certificatesResult, appointmentsResult] = await Promise.all([
    fetchHairSubmissionProgressSummariesByUserId(userId, limit),
    fetchAiScreeningsByUserId(databaseUserId, limit),
    fetchRegisteredDonationDrivesByUserId({ databaseUserId, limit }),
    fetchDonationCertificatesByUserId(userId, limit),
    fetchSalonDonationAppointmentsByUserId(databaseUserId, limit),
  ]);
  const submissions = submissionsResult.data || [];
  const realSubmissionIds = submissions
    .filter((submission) => !isHairCheckOnlySubmission(submission))
    .map((submission) => submission.submission_id)
    .filter(Boolean);
  const workflowResult = realSubmissionIds.length
    ? await fetchHairSubmissionWorkflowEvidenceByIds({
        userId,
        submissionIds: realSubmissionIds,
        trackingLimitPerSubmission: 24,
      })
    : { data: [], error: null };
  const appointmentIds = (appointmentsResult.data || [])
    .map((appointment) => appointment?.appointment_id)
    .filter(Boolean);
  const appointmentHistoryResult = appointmentIds.length
    ? await fetchSalonAppointmentStatusHistoryByAppointmentIds(appointmentIds)
    : { data: [], error: null };
  const historyItems = buildDonorActivityHistory({
    submissions,
    workflowEvidence: workflowResult.data || [],
    screenings: screeningsResult.data || [],
    registeredDrives: drivesResult.data || [],
    certificates: certificatesResult.data || [],
    appointments: appointmentsResult.data || [],
    appointmentHistory: appointmentHistoryResult.data || [],
  });
  const error = submissionsResult.error
    || screeningsResult.error
    || drivesResult.error
    || certificatesResult.error
    || appointmentsResult.error
    || appointmentHistoryResult.error
    || workflowResult.error
    || null;

  return {
    historyItems,
    donationHistory: historyItems,
    error: error?.message || error || null,
  };
};

export const getDonorActivityHistoryItem = async ({
  userId,
  databaseUserId,
  activityId,
} = {}) => {
  const result = await getDonorDonationHistory({ userId, databaseUserId, limit: 100 });
  return {
    activity: (result.historyItems || []).find((item) => String(item?.id) === String(activityId)) || null,
    error: result.error,
  };
};

const getCompletedDonationAt = (submission = null) => {
  if (!submission?.submission_id) return null;
  const status = submission?.status || '';
  const isCompletedDonation = isCutAndShipCompletedStatus(status)
    || ['completed', 'accepted'].includes(normalizeStatus(status));
  if (!isCompletedDonation) return null;

  const completedAt = submission?.cut_at || submission?.updated_at || submission?.created_at || null;
  const completedMs = completedAt ? new Date(completedAt).getTime() : NaN;
  return Number.isFinite(completedMs) ? completedAt : null;
};

const resolveLatestCompletedDonation = (submissions = []) => (
  sortSubmissionsByCreatedAt(submissions)
    .map((submission) => ({
      submission,
      completed_at: getCompletedDonationAt(submission),
    }))
    .filter((entry) => entry.completed_at)
    .sort((left, right) => new Date(right.completed_at).getTime() - new Date(left.completed_at).getTime())[0] || null
);

const hasMeaningfulTrackingEntries = (trackingEntries = []) => (
  (trackingEntries || []).some((entry) => {
    const combinedText = [
      entry?.title,
      entry?.description,
      entry?.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!combinedText) return false;
    return !combinedText.includes('manual donor details saved');
  })
);

const findTimelineMatch = (items = [], matcher) => (
  items.find(matcher) || null
);

const matchesAnyToken = (source = '', tokens = []) => {
  const normalized = String(source || '').toLowerCase();
  return tokens.some((token) => normalized.includes(token));
};

const normalizeTimelineStatusKey = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[_\s-]+/g, '');

const isCutAndShipCompletedStatus = (value = '') => [
  'cut',
  'wiginproduction',
  'inproduction',
  'wigcreated',
  'wigcompleted',
  'completed',
].includes(normalizeTimelineStatusKey(value));

const isPresentAttendanceStatus = (value = '') => [
  'present',
  'attended',
  'checkedin',
  'marked',
  'scanned',
  'verified',
].includes(normalizeTimelineStatusKey(value));

export const isDonationParticipantRegistration = (registration = null) => {
  const attendeeType = normalizeTimelineStatusKey(registration?.attendee_type);
  return ['donor', 'participant', 'participatingdonor'].includes(attendeeType);
};

const isMarkedPresentRegistration = (registration = null) => (
  Boolean(
    registration?.rsvp_scanned_at
    || registration?.attendance_marked_at
    || isPresentAttendanceStatus(registration?.attendance_status)
  )
);

const isDisplayableEventSubmission = (submission = null) => {
  const normalizedStatus = normalizeStatus(submission?.status);
  if (!Number(submission?.donation_drive_id)) return false;
  if (['cancelled', 'canceled', 'rejected'].includes(normalizedStatus)) return false;
  return Boolean(
    hasSubmissionFlowProgress(submission)
    || isCutAndShipCompletedStatus(normalizedStatus)
    || isTerminalDonationStatus(normalizedStatus)
  );
};

const isReceivedByOrganizationEntry = (entry = null) => {
  if (matchesAnyToken(entry?.title, ['quality', 'checking', 'assessment', 'qa'])) {
    return false;
  }

  return (
    matchesAnyToken(entry?.status, ['received_by_company', 'received by hair for hope', 'received by organization', 'received by the organization', 'organization received', 'received'])
    || matchesAnyToken(entry?.title, ['received by hair for hope', 'received by organization', 'received by the organization', 'organization received'])
    || matchesAnyToken(entry?.description, ['received by hair for hope', 'received by organization', 'received by the organization', 'organization received'])
  );
};

const isQualityAssessmentEntry = (entry = null) => (
  matchesAnyToken(entry?.status, ['qa_assessment', 'quality_checking', 'quality assessment'])
  || matchesAnyToken(entry?.title, ['quality', 'checking', 'assessment', 'qa'])
  || (
    matchesAnyToken(entry?.description, ['approved', 'accepted', 'rejected', 'reject', 'qa passed', 'quality passed', 'passed qa', 'passed quality'])
    && matchesAnyToken(`${entry?.status || ''} ${entry?.title || ''} ${entry?.description || ''}`, ['quality', 'assessment', 'qa'])
  )
);

const buildTimelineProgressLabel = ({ stageState, index, currentIndex }) => {
  if (stageState === 'completed') return 'Complete';
  if (stageState === 'current') return 'Ongoing';

  const distanceFromCurrent = index - currentIndex;
  if (distanceFromCurrent === 1) {
    return 'To receive';
  }

  return 'On waiting';
};

const getLatestEvidenceAt = (stages = [], fromIndex = 0) => (
  stages
    .slice(fromIndex)
    .map((stage) => stage?.evidenceAt)
    .filter(Boolean)
    .sort((left, right) => new Date(right || 0).getTime() - new Date(left || 0).getTime())[0] || null
);

const DONOR_IMPACT_TIMELINE_STAGES = [
  { key: 'donation_submitted', label: 'Donation Submitted', savedNote: 'Your hair donation has been recorded by the organization.' },
  { key: 'hair_received', label: 'Hair Received', savedNote: 'The organization has received your donated hair.' },
  { key: 'hair_accepted', label: 'Hair Accepted', savedNote: 'Your donated hair passed assessment and can be prepared for wig production.' },
  { key: 'hair_bundled', label: 'Hair Bundled', savedNote: 'Your donated hair has been included in a production bundle.' },
  { key: 'wig_in_production', label: 'Wig in Production', savedNote: 'The hair bundle is being transformed into a wig.' },
  { key: 'wig_created', label: 'Wig Created', savedNote: 'A wig made with the contributed hair has been completed.' },
  { key: 'wig_assigned', label: 'Wig Assigned', savedNote: 'The wig created with your donated hair has been assigned for distribution.' },
  { key: 'wig_ready_for_release', label: 'Wig Ready for Release', savedNote: 'The wig is ready to begin its release process.' },
  { key: 'preparing_for_release', label: 'Preparing for Release', savedNote: 'The organization is preparing the wig for release.' },
  { key: 'wig_being_released', label: 'Wig Being Released', savedNote: 'The wig is currently going through the release process.' },
  { key: 'wig_received', label: 'Wig Received', savedNote: 'The patient confirmed physical receipt of the wig.' },
];

const buildJourneyProjection = (stages = [], groups = []) => groups.map((group) => {
  const groupedStages = group.stageKeys
    .map((key) => stages.find((stage) => stage.key === key))
    .filter(Boolean);
  const states = groupedStages.map((stage) => stage.state);
  const state = states.includes('attention')
    ? 'attention'
    : states.includes('current')
      ? 'current'
      : groupedStages.length && states.every((value) => value === 'completed')
        ? 'completed'
        : states.includes('completed')
          ? 'current'
          : 'upcoming';
  const evidenceAt = groupedStages
    .map((stage) => stage.displayEvidenceAt || stage.completedAt || null)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null;
  return {
    key: group.key,
    label: group.label,
    stageKeys: group.stageKeys,
    savedNote: group.savedNote,
    state,
    completedAt: state === 'completed' ? evidenceAt : null,
    displayEvidenceAt: evidenceAt,
    timestampLabel: evidenceAt ? `Updated ${formatDateTime(evidenceAt)}` : '',
    statusLabel: state === 'completed' ? 'Complete' : state === 'current' ? 'Ongoing' : '',
    progressLabel: state === 'completed' ? 'Complete' : state === 'current' ? 'Ongoing' : 'Waiting',
  };
});

const getDonorJourneyHeadline = ({ currentStageKey = '', isComplete = false, released = false } = {}) => {
  if (isComplete) return 'Your donation completed its journey';
  if (released) return 'The wig has been released';
  if (currentStageKey === 'hair_received') return 'Your donation has arrived';
  if (currentStageKey === 'hair_accepted') return 'Your hair has been accepted';
  if (currentStageKey === 'hair_not_accepted') return 'Your hair review is complete';
  if (currentStageKey === 'hair_bundled' || currentStageKey === 'wig_in_production') return 'Your donation is becoming a wig';
  if (currentStageKey === 'wig_created') return 'A wig has been created';
  if (['wig_assigned', 'wig_ready_for_release', 'preparing_for_release', 'wig_being_released'].includes(currentStageKey)) {
    return 'Your donation is helping someone';
  }
  return 'Your donation journey has started';
};

export const buildCanonicalEventDonorJourney = ({
  submission = null,
  registration = null,
  trackingEntries = [],
  production = null,
  wigRequestProgress = null,
} = {}) => {
  const statusKey = normalizeTimelineStatusKey(submission?.status);
  const detail = getLatestSubmissionDetailSnapshot(submission);
  const detailStatusKey = normalizeTimelineStatusKey(detail?.status);
  const receivedEntry = findTimelineMatch(trackingEntries, isReceivedByOrganizationEntry);
  const acceptedEntry = findTimelineMatch(trackingEntries, (entry) => (
    isQualityAssessmentEntry(entry)
    && matchesAnyToken(
      `${entry?.status || ''} ${entry?.title || ''} ${entry?.description || ''}`,
      ['accepted', 'approved', 'qa passed', 'quality passed', 'passed qa', 'passed quality']
    )
  ));
  const bundledEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(`${entry?.status || ''} ${entry?.title || ''} ${entry?.description || ''}`, ['bundled', 'bundle created'])
  ));
  const productionEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(`${entry?.status || ''} ${entry?.title || ''} ${entry?.description || ''}`, ['wig production', 'in production'])
  ));
  const createdEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(`${entry?.status || ''} ${entry?.title || ''} ${entry?.description || ''}`, ['wig created', 'wig completed'])
  ));
  const bundleStatusKey = normalizeTimelineStatusKey(production?.bundle?.status);
  const wigStatusKey = normalizeTimelineStatusKey(production?.wig?.wig_status);
  const hasApprovedDetail = ['approved', 'accepted'].includes(detailStatusKey);
  const hasRejectedDetail = ['rejected', 'rejectedcut'].includes(detailStatusKey);
  const attendanceAt = isMarkedPresentRegistration(registration)
    ? registration?.rsvp_scanned_at || registration?.attendance_marked_at || null
    : null;
  const evidenceAt = Array(DONOR_IMPACT_TIMELINE_STAGES.length).fill(null);

  evidenceAt[0] = submission?.created_at || submission?.submitted_at || null;
  evidenceAt[1] = submission?.cut_at || receivedEntry?.updated_at || attendanceAt || null;
  evidenceAt[2] = hasApprovedDetail || hasRejectedDetail
    ? detail?.updated_at || detail?.created_at || acceptedEntry?.updated_at || null
    : null;
  evidenceAt[3] = hasApprovedDetail ? production?.bundle?.created_at || bundledEntry?.updated_at || null : null;
  evidenceAt[4] = hasApprovedDetail ? productionEntry?.updated_at
    || production?.wig?.created_at
    || (bundleStatusKey === 'inproduction' ? production?.bundle?.updated_at || null : null) : null;
  evidenceAt[5] = hasApprovedDetail ? production?.wig?.completed_at
    || production?.bundle?.wig_completed_at
    || createdEntry?.updated_at
    || null : null;

  let highestMilestoneIndex = submission?.submission_id ? 0 : -1;
  if (evidenceAt[1] || ['cut', 'accepted', 'wiginproduction', 'wigcreated'].includes(statusKey)) {
    highestMilestoneIndex = Math.max(highestMilestoneIndex, 1);
  }
  if (hasApprovedDetail) {
    highestMilestoneIndex = Math.max(highestMilestoneIndex, 2);
  }
  if (hasRejectedDetail) {
    highestMilestoneIndex = Math.max(highestMilestoneIndex, 2);
  }
  if (hasApprovedDetail && (submission?.bundle_id || evidenceAt[3])) highestMilestoneIndex = Math.max(highestMilestoneIndex, 3);
  if (
    hasApprovedDetail
    && (statusKey === 'wiginproduction'
    || evidenceAt[4]
    || bundleStatusKey === 'inproduction'
    || wigStatusKey === 'inproduction')
  ) {
    highestMilestoneIndex = Math.max(highestMilestoneIndex, 4);
  }
  if (
    hasApprovedDetail
    && (statusKey === 'wigcreated'
    || evidenceAt[5]
    || bundleStatusKey === 'wigcompleted'
    || ['completed', 'created', 'readyforrelease', 'released'].includes(wigStatusKey))
  ) {
    highestMilestoneIndex = Math.max(highestMilestoneIndex, 5);
  }

  const requestMilestoneIndex = Number(wigRequestProgress?.milestoneIndex);
  if (hasApprovedDetail && Number.isInteger(requestMilestoneIndex) && requestMilestoneIndex >= 4 && requestMilestoneIndex <= 10) {
    highestMilestoneIndex = Math.max(highestMilestoneIndex, requestMilestoneIndex);
    if (wigRequestProgress?.milestoneAt) evidenceAt[requestMilestoneIndex] = wigRequestProgress.milestoneAt;
  }

  const isComplete = Boolean(wigRequestProgress?.receiptConfirmed && highestMilestoneIndex === 10);
  const highestMilestoneCompleted = Boolean(wigRequestProgress?.milestoneCompleted);
  const stages = DONOR_IMPACT_TIMELINE_STAGES.map((stage, index) => {
    const isRejectedStage = index === 2 && hasRejectedDetail;
    const state = isRejectedStage
      ? 'attention'
      : isComplete
        ? 'completed'
        : index < highestMilestoneIndex
          ? 'completed'
          : index === highestMilestoneIndex
            ? highestMilestoneCompleted ? 'completed' : 'current'
            : 'upcoming';
    return {
      ...stage,
      ...(isRejectedStage ? {
        key: 'hair_not_accepted',
        label: 'Hair Not Accepted',
        savedNote: detail?.rejection_reason || 'The physical hair assessment did not pass.',
      } : {}),
      state,
      completedAt: state === 'completed' ? evidenceAt[index] : null,
      displayEvidenceAt: evidenceAt[index],
      statusLabel: state === 'completed' ? 'Complete' : '',
      progressLabel: state === 'completed' ? 'Complete' : ['current', 'attention'].includes(state) ? 'Ongoing' : 'Waiting',
      timestampLabel: evidenceAt[index] ? `Updated ${formatDateTime(evidenceAt[index])}` : '',
    };
  });
  const completedCount = stages.filter((stage) => stage.state === 'completed').length;
  const currentWeight = stages.some((stage) => ['current', 'attention'].includes(stage.state)) ? 0.5 : 0;
  const progressPercent = stages.length
    ? Math.min(100, Math.round(((completedCount + currentWeight) / stages.length) * 100))
    : 0;
  const currentStage = stages.find((stage) => ['current', 'attention'].includes(stage.state))
    || [...stages].reverse().find((stage) => stage.state === 'completed')
    || stages[0]
    || null;
  const compactStages = buildJourneyProjection(stages, [
    { key: 'hair_received', label: 'Hair received', stageKeys: ['donation_submitted', 'hair_received'], savedNote: 'Your donation was recorded and received.' },
    { key: 'hair_review', label: 'Hair review', stageKeys: ['hair_accepted', 'hair_not_accepted'], savedNote: 'Your donated hair completed physical review.' },
    { key: 'wig_production', label: 'Wig production', stageKeys: ['hair_bundled', 'wig_in_production', 'wig_created'], savedNote: 'Your donated hair is prepared and made into a wig.' },
    { key: 'assigned_to_patient', label: 'Recipient assigned', stageKeys: ['wig_assigned', 'wig_ready_for_release', 'preparing_for_release', 'wig_being_released'], savedNote: 'The wig is assigned and prepared for release.' },
    { key: 'received_by_patient', label: 'Received by patient', stageKeys: ['wig_received'], savedNote: 'The patient confirmed physical receipt of the wig.' },
  ]).map((stage) => (
    currentStage?.key && stage.stageKeys.includes(currentStage.key)
      ? { ...stage, label: currentStage.label }
      : stage
  ));

  return {
    submissionId: submission?.submission_id || null,
    stages,
    compactStages,
    detailStages: compactStages,
    currentStageKey: currentStage?.key || '',
    currentStageLabel: currentStage?.label || '',
    completedCount,
    totalCount: stages.length,
    progressPercent,
    isComplete,
    headline: getDonorJourneyHeadline({
      currentStageKey: currentStage?.key || '',
      isComplete,
      released: Boolean(wigRequestProgress?.released),
    }),
    sourceState: {
      submissionStatus: submission?.status || '',
      detailStatus: detail?.status || '',
      requestMilestoneKey: wigRequestProgress?.milestoneKey || null,
      requestStatus: wigRequestProgress?.requestStatus || null,
      receiptConfirmed: Boolean(wigRequestProgress?.receiptConfirmed),
      releaseCycle: wigRequestProgress?.releaseCycle ?? null,
    },
  };
};

const resolveCourierTimelineStages = ({ submission, logistics, parcelImages = [] } = {}) => {
  const detail = getLatestSubmissionDetailSnapshot(submission);
  const detailStatusKey = normalizeTimelineStatusKey(detail?.status);
  const proof = (parcelImages || []).find((image) => image?.image_type === 'independent_parcel_photo') || null;
  const proofAt = proof?.uploaded_at || null;
  const courierName = String(logistics?.courier_name || '').trim();
  const trackingNumber = String(logistics?.tracking_number || '').trim();
  const hasShippingDetails = Boolean(courierName && trackingNumber);
  const shippingDetailsAt = hasShippingDetails ? logistics?.updated_at || logistics?.created_at || null : null;
  const receivedAt = logistics?.received_at || null;
  const hasQualityResult = ['approved', 'accepted', 'rejected', 'rejectedcut'].includes(detailStatusKey);
  const qualityResultAt = hasQualityResult ? detail?.updated_at || detail?.created_at || null : null;
  const isRejected = ['rejected', 'rejectedcut'].includes(detailStatusKey);

  const stages = [
    {
      key: 'donation_confirmed',
      label: 'Donation Confirmed',
      savedNote: 'Your courier donation and Donivra waybill were created.',
      evidenceAt: submission?.created_at || submission?.updated_at || null,
      entry: submission,
    },
    {
      key: 'package_preparation',
      label: 'Package Preparation',
      savedNote: 'Securely pack the hair and attach the Donivra waybill label.',
      evidenceAt: proofAt,
      entry: proof || submission,
    },
    {
      key: 'package_proof_uploaded',
      label: 'Package Proof Uploaded',
      savedNote: 'A clear photo of the prepared package is saved with this donation.',
      evidenceAt: proofAt,
      entry: proof,
      parcelImages: proof ? [proof] : [],
    },
    {
      key: 'courier_details_added',
      label: 'Courier Details Added',
      savedNote: hasShippingDetails
        ? `${courierName} tracking number ${trackingNumber} is saved separately from the Donivra waybill.`
        : 'Add the courier name and the external tracking number after shipping.',
      evidenceAt: shippingDetailsAt,
      entry: logistics,
    },
    {
      key: 'waiting_for_package_arrival',
      label: 'Waiting for Package Arrival',
      savedNote: 'The organization has not yet confirmed physical receipt of the parcel.',
      evidenceAt: receivedAt,
      entry: logistics,
    },
    {
      key: 'package_received',
      label: 'Package Received',
      savedNote: 'The organization confirmed receipt of the hair donation package.',
      evidenceAt: receivedAt,
      entry: logistics,
    },
    {
      key: 'hair_under_verification',
      label: 'Hair Under Verification',
      savedNote: 'Staff is completing the physical hair assessment.',
      evidenceAt: qualityResultAt,
      entry: detail,
    },
    {
      key: isRejected ? 'hair_not_accepted' : 'hair_accepted',
      label: isRejected ? 'Hair Not Accepted' : 'Hair Accepted',
      savedNote: isRejected
        ? (detail?.rejection_reason || 'The physical hair assessment did not pass.')
        : 'The physical hair assessment has been approved.',
      evidenceAt: hasQualityResult ? qualityResultAt : null,
      entry: detail,
    },
  ];

  let currentIndex = 1;
  if (proofAt) currentIndex = 3;
  if (hasShippingDetails) currentIndex = 4;
  if (receivedAt) currentIndex = 6;
  if (hasQualityResult) currentIndex = 7;

  return stages.map((stage, index) => {
    const completed = index < currentIndex || (index === currentIndex && hasQualityResult);
    return {
      ...stage,
      state: completed ? 'completed' : (index === currentIndex ? 'current' : 'upcoming'),
      completedAt: completed ? stage.evidenceAt : null,
      displayEvidenceAt: stage.evidenceAt,
      statusLabel: completed ? 'Complete' : (index === currentIndex ? 'Ongoing' : ''),
      progressLabel: completed ? 'Complete' : (index === currentIndex ? 'Ongoing' : 'Waiting'),
    };
  });
};

const resolveTimelineStages = ({
  submission = null,
  logistics,
  trackingEntries,
  parcelImages,
  certificate,
  flowType = '',
  registration = null,
  production = null,
  appointment = null,
  wigRequestProgress = null,
}) => {
  const isEventFlow = flowType === 'drive' || Boolean(submission?.donation_drive_id);
  const isWalkInFlow = !isEventFlow && (
    Boolean(appointment?.appointment_id)
    || matchesAnyToken(logistics?.logistics_type, ['onsite', 'walk-in', 'walk in', 'dropoff', 'drop-off'])
  );
  const hasWalkInSchedule = isWalkInFlow && Boolean(
    appointment?.appointment_id
    || appointment?.appointment_start_at
  );
  const isCourierFlow = !isEventFlow && !isWalkInFlow && matchesAnyToken(
    logistics?.logistics_type,
    ['ship by courier', 'courier']
  );
  if (isCourierFlow) {
    return resolveCourierTimelineStages({ submission, logistics, parcelImages });
  }
  if (isEventFlow) {
    return buildCanonicalEventDonorJourney({
      submission,
      registration,
      trackingEntries,
      production,
      wigRequestProgress,
    }).stages;
  }
  const attendanceEvidenceAt = isEventFlow && isMarkedPresentRegistration(registration)
    ? registration?.rsvp_scanned_at
      || registration?.attendance_marked_at
      || registration?.updated_at
      || null
    : null;
  const donationSubmittedEvidenceAt = submission?.submitted_at || submission?.updated_at || submission?.created_at || null;
  const hasCutStatus = isCutAndShipCompletedStatus(submission?.status);
  const cutAndShipApprovedAt = submission?.cut_at
    || (hasCutStatus ? submission?.updated_at || submission?.created_at || null : null);
  const latestDetail = getLatestSubmissionDetailSnapshot(submission);
  const detailTrackingText = `${latestDetail?.status || ''} ${latestDetail?.current_tracking_status || ''} ${latestDetail?.qr_status || ''}`;
  const detailUpdatedAt = latestDetail?.updated_at || latestDetail?.created_at || null;
  const waybillEvidenceAt = submission?.qr_generated_at
    || latestDetail?.qr_generated_at
    || (submission?.donation_reference ? submission?.updated_at || submission?.created_at || null : null);
  const readyEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(entry?.status, ['ready for shipment', 'parcel logged', 'parcel prepared'])
    || matchesAnyToken(entry?.title, ['ready for shipment', 'parcel logged', 'parcel prepared'])
    || matchesAnyToken(entry?.description, ['ready for shipment', 'parcel logged', 'parcel prepared'])
  ));
  const readyEvidenceAt = parcelImages[0]?.uploaded_at
    || readyEntry?.updated_at
    || (matchesAnyToken(detailTrackingText, ['qr generated', 'generated', 'ready for shipping', 'waybill ready']) ? detailUpdatedAt : null)
    || logistics?.created_at
    || null;
  const transitEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(entry?.status, ['transit', 'shipped', 'shipping', 'cut & shipped', 'cut and shipped', 'cut shipped'])
    || matchesAnyToken(entry?.title, ['transit', 'shipped', 'shipping', 'cut & shipped', 'cut and shipped', 'cut shipped'])
  ));
  const transitEvidenceAt = transitEntry?.updated_at
    || (matchesAnyToken(detailTrackingText, ['transit', 'shipped', 'shipping', 'cut & shipped', 'cut and shipped', 'cut shipped']) ? detailUpdatedAt : null)
    || (matchesAnyToken(logistics?.shipment_status, ['transit', 'shipped', 'received', 'quality']) ? logistics?.created_at || null : null);
  const receivedOrgEntry = findTimelineMatch(trackingEntries, isReceivedByOrganizationEntry);
  const receivedOrgEvidenceAt = receivedOrgEntry?.updated_at
    || logistics?.received_at
    || (matchesAnyToken(detailTrackingText, ['received by the organization', 'organization received', 'received']) ? detailUpdatedAt : null)
    || (matchesAnyToken(logistics?.shipment_status, ['received by the organization', 'organization received', 'received', 'quality']) ? logistics?.created_at || null : null);
  const latestScreening = [...(submission?.ai_screenings || [])]
    .sort((left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime())[0] || null;
  const qualityEntry = findTimelineMatch(trackingEntries, isQualityAssessmentEntry);
  const detailStatus = latestDetail?.status || '';
  const hasQualityDbStatus = Boolean(detailStatus);
  const qualityEvidenceAt = qualityEntry?.updated_at
    || (matchesAnyToken(detailTrackingText, ['qa', 'quality', 'under review', 'under qa review', 'accepted', 'approved', 'rejected']) ? detailUpdatedAt : null)
    || null;
  const bundlingEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(entry?.status, ['bundle', 'bundling', 'bundled', 'in production', 'wig production'])
    || matchesAnyToken(entry?.title, ['bundle', 'bundling', 'bundled', 'in production', 'wig production'])
    || matchesAnyToken(entry?.description, ['bundle', 'bundling', 'bundled', 'in production', 'wig production'])
  ));
  const bundleStatus = production?.bundle?.status || '';
  const wigStatus = production?.wig?.wig_status || '';
  const allocationStatus = production?.allocation?.release_status || '';
  const bundleEvidenceAt = production?.bundle?.updated_at || production?.bundle?.created_at || null;
  const wigEvidenceAt = production?.wig?.updated_at || production?.wig?.created_at || null;
  const wigCompletedDbAt = production?.wig?.completed_at || production?.bundle?.wig_completed_at || null;
  const allocatedDbAt = production?.allocation?.allocated_at || null;
  const releasedDbAt = production?.allocation?.released_at || null;
  const bundlingEvidenceAt = bundlingEntry?.updated_at
    || bundleEvidenceAt
    || null;
  const wigProductionEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(entry?.status, ['wig production', 'in production', 'production'])
    || matchesAnyToken(entry?.title, ['wig production', 'in production', 'production'])
    || matchesAnyToken(entry?.description, ['wig production', 'in production', 'production'])
  ));
  const wigProductionEvidenceAt = wigProductionEntry?.updated_at
    || (production?.wig?.wig_id ? wigEvidenceAt : null)
    || (matchesAnyToken(bundleStatus, ['in production', 'in_production']) ? bundleEvidenceAt : null);
  const wigCompletedEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(entry?.status, ['wig completed', 'completed'])
    || matchesAnyToken(entry?.title, ['wig completed'])
    || matchesAnyToken(entry?.description, ['wig completed'])
  ));
  const wigCompletedEvidenceAt = wigCompletedEntry?.updated_at
    || wigCompletedDbAt
    || (matchesAnyToken(bundleStatus, ['wig completed', 'wig_completed']) ? bundleEvidenceAt : null)
    || (matchesAnyToken(wigStatus, ['ready for release', 'ready_for_release', 'wig allocated', 'wig_allocated', 'releasing', 'released']) ? wigEvidenceAt : null);
  const assignedToPatientEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(entry?.status, ['assigned to patient', 'allocated to patient', 'assigned'])
    || matchesAnyToken(entry?.title, ['assigned to patient', 'allocated to patient'])
    || matchesAnyToken(entry?.description, ['assigned to patient', 'allocated to patient'])
  ));
  const assignedToPatientEvidenceAt = assignedToPatientEntry?.updated_at
    || allocatedDbAt
    || production?.allocation?.released_at
    || null;
  const receivedByPatientEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(entry?.status, ['received by patient', 'released to patient', 'delivered to patient'])
    || matchesAnyToken(entry?.title, ['received by patient', 'released to patient', 'delivered to patient'])
    || matchesAnyToken(entry?.description, ['received by patient', 'released to patient', 'delivered to patient'])
  ));
  const receivedByPatientEvidenceAt = receivedByPatientEntry?.updated_at
    || (matchesAnyToken(allocationStatus, ['received', 'completed'])
      ? releasedDbAt || allocatedDbAt
      : null);

  const eventStageEntries = isEventFlow ? [
    {
      key: 'cut_and_ship',
      label: 'Hair received',
      statusLabel: transitEntry?.status || (attendanceEvidenceAt || cutAndShipApprovedAt ? 'Complete' : ''),
      savedNote: transitEntry?.description || 'Staff checked you in and accepted your hair donation.',
      evidenceAt: transitEvidenceAt || cutAndShipApprovedAt || attendanceEvidenceAt,
      entry: transitEntry || registration,
      parcelImages,
    },
    {
      key: 'qa_assessment',
      label: 'QA Assessment',
      statusLabel: qualityEntry?.status || '',
      savedNote: qualityEntry?.description || 'The donated hair is reviewed before wig production.',
      evidenceAt: qualityEvidenceAt,
      entry: qualityEntry,
      parcelImages,
    },
    {
      key: 'wig_production',
      label: 'Wig Production',
      statusLabel: wigProductionEntry?.status || wigStatus || bundleStatus || '',
      savedNote: wigProductionEntry?.description || bundlingEntry?.description || production?.wig?.wig_name || 'Approved hair by the staff is used in the wig production process.',
      evidenceAt: wigProductionEvidenceAt || bundlingEvidenceAt || wigCompletedEvidenceAt,
      entry: wigProductionEntry || production?.wig || bundlingEntry || wigCompletedEntry,
      parcelImages,
    },
    {
      key: 'assigned_to_patient',
      label: 'Assigned to Patient',
      statusLabel: assignedToPatientEntry?.status || '',
      savedNote: assignedToPatientEntry?.description || 'The completed wig is assigned to a patient.',
      evidenceAt: assignedToPatientEvidenceAt,
      entry: assignedToPatientEntry || production?.allocation,
      parcelImages,
    },
    {
      key: 'received_by_patient',
      label: 'Received by the Patient',
      statusLabel: receivedByPatientEntry?.status || allocationStatus || '',
      savedNote: receivedByPatientEntry?.description || 'The patient confirms receipt of the wig.',
      evidenceAt: receivedByPatientEvidenceAt,
      entry: receivedByPatientEntry || production?.allocation,
      parcelImages,
    },
  ] : null;

  const walkInStageEntries = isWalkInFlow ? (hasWalkInSchedule ? [
    {
      key: 'donation_submitted',
      label: 'Donation Confirmed',
      statusLabel: submission?.status || '',
      savedNote: 'Your walk-in donation record includes your expected drop-off date and approximate arrival time.',
      evidenceAt: donationSubmittedEvidenceAt,
      entry: submission,
    },
    {
      key: 'waybill_ready',
      label: 'Donation QR Ready',
      statusLabel: submission?.qr_status || readyEntry?.status || '',
      savedNote: readyEntry?.description || 'Open the QR and bring it with your hair donation.',
      evidenceAt: waybillEvidenceAt || readyEvidenceAt,
      entry: readyEntry || submission,
    },
    {
      key: 'dropoff_scheduled',
      label: 'Drop-off Visit',
      statusLabel: appointment?.checked_in_at ? 'Checked in' : (appointment?.status || 'Expected'),
      savedNote: appointment?.appointment_start_at
        ? `Expected arrival: ${formatDateTime(appointment.appointment_start_at)}. This time is approximate.`
        : 'Bring your donation on the expected walk-in date.',
      evidenceAt: appointment?.checked_in_at || null,
      entry: appointment || logistics,
    },
    {
      key: 'received_by_company',
      label: 'Received by Hair for Hope',
      statusLabel: appointment?.completed_at || logistics?.received_at ? 'Received' : '',
      savedNote: 'The organization confirms receipt of your hair donation.',
      evidenceAt: appointment?.completed_at || logistics?.received_at || null,
      entry: appointment || logistics,
    },
    {
      key: 'qa_assessment',
      label: 'QA Assessment',
      statusLabel: qualityEntry?.status || '',
      savedNote: qualityEntry?.description || 'Your donated hair will be reviewed after drop-off.',
      evidenceAt: qualityEntry?.updated_at || null,
      entry: qualityEntry,
    },
    {
      key: 'wig_production',
      label: 'Wig Production',
      statusLabel: wigProductionEntry?.status || wigStatus || bundleStatus || '',
      savedNote: wigProductionEntry?.description || 'The approved hair bundle is being made into a wig.',
      evidenceAt: wigProductionEvidenceAt,
      entry: wigProductionEntry || production?.wig,
    },
    {
      key: 'assigned_to_patient',
      label: 'Assigned to Patient',
      statusLabel: assignedToPatientEntry?.status || '',
      savedNote: assignedToPatientEntry?.description || 'The completed wig has been assigned to a patient.',
      evidenceAt: assignedToPatientEvidenceAt,
      entry: assignedToPatientEntry || production?.allocation,
    },
    {
      key: 'received_by_patient',
      label: 'Received by the Patient',
      statusLabel: receivedByPatientEntry?.status || allocationStatus || '',
      savedNote: receivedByPatientEntry?.description || 'The patient has received the completed wig.',
      evidenceAt: receivedByPatientEvidenceAt,
      entry: receivedByPatientEntry || production?.allocation,
    },
  ] : [
    {
      key: 'dropoff_schedule_required',
      label: 'Add Expected Arrival',
      statusLabel: 'Expected arrival required',
      savedNote: 'Choose an open walk-in date and an approximate arrival time before confirming this donation.',
      evidenceAt: null,
      entry: logistics || submission,
    },
    {
      key: 'donation_submitted',
      label: 'Donation Submitted',
      statusLabel: '',
      savedNote: 'Your walk-in donation will be submitted after its expected arrival is confirmed.',
      evidenceAt: null,
      entry: submission,
    },
    {
      key: 'waybill_ready',
      label: 'Donation QR Ready',
      statusLabel: '',
      savedNote: 'Bring the QR with your hair donation after confirming your expected arrival.',
      evidenceAt: null,
      entry: submission,
    },
    {
      key: 'dropoff_scheduled',
      label: 'Drop-off Visit',
      statusLabel: '',
      savedNote: 'Bring your donation on the expected date. The arrival time is approximate.',
      evidenceAt: null,
      entry: logistics,
    },
    {
      key: 'received_by_company',
      label: 'Received by Hair for Hope',
      statusLabel: '',
      savedNote: 'The organization confirms receipt of your hair donation.',
      evidenceAt: null,
      entry: logistics,
    },
    {
      key: 'qa_assessment',
      label: 'QA Assessment',
      statusLabel: '',
      savedNote: 'Your donated hair will be reviewed after drop-off.',
      evidenceAt: null,
      entry: qualityEntry,
    },
    {
      key: 'wig_production',
      label: 'Wig Production',
      statusLabel: '',
      savedNote: 'The approved hair bundle is made into a wig.',
      evidenceAt: null,
      entry: production?.wig,
    },
    {
      key: 'assigned_to_patient',
      label: 'Assigned to Patient',
      statusLabel: '',
      savedNote: 'The completed wig is assigned to a patient.',
      evidenceAt: null,
      entry: production?.allocation,
    },
    {
      key: 'received_by_patient',
      label: 'Received by the Patient',
      statusLabel: '',
      savedNote: 'The patient receives the completed wig.',
      evidenceAt: null,
      entry: production?.allocation,
    },
  ]) : null;

  const baseStages = eventStageEntries || walkInStageEntries || [
    {
      key: 'donation_ready_to_send',
      label: 'Donation Submitted & Sent by Donor',
      statusLabel: 'Waybill ready',
      savedNote: 'Your logistic donation is submitted, its waybill QR is ready, and it is recorded as sent by you for drop-off or shipment. Print the waybill and securely attach it to the outside of your donation package.',
      evidenceAt: transitEvidenceAt || waybillEvidenceAt || readyEvidenceAt || donationSubmittedEvidenceAt,
      entry: transitEntry || readyEntry || submission,
      parcelImages,
    },
    {
      key: 'received_by_company',
      label: 'Received by Hair for Hope',
      statusLabel: receivedOrgEntry?.status || (logistics?.received_at ? 'Received' : ''),
      savedNote: receivedOrgEntry?.description || logistics?.notes || '',
      evidenceAt: receivedOrgEvidenceAt,
      entry: receivedOrgEntry,
      parcelImages,
    },
    {
      key: 'qa_assessment',
      label: 'QA Assessment',
      statusLabel: qualityEntry?.status || '',
      savedNote: qualityEntry?.description || (hasQualityDbStatus ? 'QA status is loaded from the saved hair submission assessment.' : ''),
      evidenceAt: qualityEvidenceAt,
      entry: qualityEntry || latestDetail || latestScreening,
      parcelImages,
    },
    {
      key: 'wig_production',
      label: 'Wig production',
      statusLabel: wigProductionEntry?.status || wigStatus || '',
      savedNote: wigProductionEntry?.description || production?.wig?.wig_name || '',
      evidenceAt: wigProductionEvidenceAt,
      entry: wigProductionEntry || production?.wig,
      parcelImages,
    },
    {
      key: 'assigned_to_patient',
      label: 'Assigned to patient',
      statusLabel: assignedToPatientEntry?.status || (assignedToPatientEvidenceAt ? allocationStatus || 'Assigned' : ''),
      savedNote: assignedToPatientEntry?.description || production?.allocation?.notes || '',
      evidenceAt: assignedToPatientEvidenceAt,
      entry: assignedToPatientEntry || production?.allocation,
      parcelImages,
    },
    {
      key: 'received_by_patient',
      label: 'Received by patient',
      statusLabel: receivedByPatientEntry?.status || allocationStatus || '',
      savedNote: receivedByPatientEntry?.description || production?.allocation?.notes || '',
      evidenceAt: receivedByPatientEvidenceAt,
      entry: receivedByPatientEntry || production?.allocation,
      parcelImages,
    },
  ];

  const reachedStageIndexes = baseStages.reduce((indexes, stage, index) => (
    stage?.evidenceAt ? [...indexes, index] : indexes
  ), []);
  const latestReachedIndex = reachedStageIndexes.length
    ? reachedStageIndexes[reachedStageIndexes.length - 1]
    : -1;
  const hasConfirmedDonorShipment = !isEventFlow && !isWalkInFlow && Boolean(transitEvidenceAt);
  const hasPreparedIndependentDonation = !isEventFlow && !isWalkInFlow && Boolean(
    transitEvidenceAt
    || waybillEvidenceAt
    || readyEvidenceAt
    || donationSubmittedEvidenceAt
  );
  const resolvedCurrentIndex = hasConfirmedDonorShipment || hasPreparedIndependentDonation
    ? Math.min(latestReachedIndex + 1, baseStages.length - 1)
    : (isEventFlow && isDonationParticipantRegistration(registration) && isMarkedPresentRegistration(registration) && latestReachedIndex === 0
      ? Math.min(1, baseStages.length - 1)
      : latestReachedIndex);
  const isDonationCompleted = Boolean(
    receivedByPatientEvidenceAt
    || (!isEventFlow && (assignedToPatientEvidenceAt || wigCompletedEvidenceAt || bundlingEvidenceAt))
  );

  return baseStages.map((stage, index) => {
    const stageState = isDonationCompleted
      ? index <= resolvedCurrentIndex ? 'completed' : 'upcoming'
      : index < resolvedCurrentIndex ? 'completed' : index === resolvedCurrentIndex ? 'current' : 'upcoming';
    const completedAt = stageState === 'completed'
      ? stage.evidenceAt || getLatestEvidenceAt(baseStages, index + 1)
      : null;
    const displayEvidenceAt = stage.evidenceAt || completedAt || null;
    const statusLabel = stage.statusLabel
      || (stageState === 'completed' ? 'Complete' : '');

    return {
      ...stage,
      completedAt,
      displayEvidenceAt,
      statusLabel,
      state: stageState,
      progressLabel: buildTimelineProgressLabel({
        stageState,
        index,
        currentIndex: resolvedCurrentIndex,
      }),
      timestampLabel: displayEvidenceAt ? `Updated ${formatDateTime(displayEvidenceAt)}` : '',
    };
  });
};

const buildTimelineEvents = ({ logistics, trackingEntries, parcelImages, certificate, flowType = '' }) => {
  const parcelEvents = parcelImages.map((image, index) => ({
    key: `parcel-${image.image_id || index}`,
    title: index === 0 ? 'Parcel image uploaded' : 'Additional parcel image uploaded',
    description: 'The donor uploaded a parcel or hair bundle image before shipment.',
    timestamp: formatDateTime(image.uploaded_at),
    imageUrl: image.signed_url || '',
    badge: 'Parcel log',
  }));

  const trackingEvents = (trackingEntries || [])
    .filter((entry) => {
      if (flowType !== 'drive') return true;
      return !(
        matchesAnyToken(entry?.status, ['donation_submitted', 'donation submitted'])
        || matchesAnyToken(entry?.title, ['donation submitted'])
      );
    })
    .map((entry) => ({
      key: `tracking-${entry.id}`,
      title: entry.title || 'Donation update',
      description: entry.description || 'A donation tracking update was recorded.',
      timestamp: formatDateTime(entry.updated_at),
      badge: entry.status || 'Updated',
    }));

  const logisticsEvent = logistics
    ? [{
        key: `logistics-${logistics.submission_logistics_id}`,
        title: 'Logistics updated',
        description: logistics.notes || logistics.shipment_status || logistics.logistics_type || 'Logistics details were updated.',
        timestamp: formatDateTime(logistics.received_at || logistics.created_at),
        badge: logistics.shipment_status || logistics.logistics_type || 'Logistics',
      }]
    : [];

  const certificateEvent = certificate
    ? [{
        key: `certificate-${certificate.certificate_id}`,
        title: 'Certificate available',
        description: 'The organization approved the donation and issued a certificate of appreciation.',
        timestamp: formatDateTime(certificate.issued_at),
        badge: 'Certificate',
      }]
    : [];

  const sortedEvents = [...certificateEvent, ...trackingEvents, ...logisticsEvent, ...parcelEvents]
    .filter(Boolean)
    .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime());

  const seenEvents = new Set();
  return sortedEvents.filter((event) => {
    const dedupeKey = [
      String(event?.title || '').trim().toLowerCase(),
      String(event?.description || '').trim().toLowerCase(),
      String(event?.badge || '').trim().toLowerCase(),
    ].join('|');

    if (!dedupeKey.replace(/\|/g, '')) {
      return true;
    }

    if (seenEvents.has(dedupeKey)) {
      return false;
    }

    seenEvents.add(dedupeKey);
    return true;
  });
};

const getParcelImagesWithUrls = async (detail) => {
  const parcelImages = (detail?.images || []).filter((image) => PARCEL_IMAGE_TYPES.includes(image?.image_type));

  return await Promise.all(parcelImages.map(async (image) => {
    if (!image?.file_path) {
      return { ...image, signed_url: '' };
    }

    const result = await getHairSubmissionImageSignedUrl(image.file_path, 3600);
    return {
      ...image,
      signed_url: result.data || '',
    };
  }));
};

export const buildDriveInvitationQrPayload = ({ drive, registration }) => (
  JSON.stringify({
    type: 'event_rsvp',
    Payload_Type: 'Donation_Drive_Registration',
    Registration_ID: registration?.registration_id || null,
    Event_Attendee_ID: registration?.registration_id || null,
    Event_Request_ID: registration?.donation_drive_id || drive?.event_request_id || drive?.donation_drive_id || null,
    User_ID: registration?.user_id || null,
    Attendee_Type: registration?.attendee_type || 'Donor',
    Waybill_Code: registration?.waybill_code || '',
    Submission_ID: registration?.submission_id || null,
    Submission_Detail_ID: registration?.submission_detail_id || null,
    Registration_Status: registration?.registration_status || '',
    Attendance_Status: registration?.attendance_status || '',
  })
);

export const buildIndependentDonationQrPayload = ({
  submission,
  detail = null,
}) => (
  JSON.stringify({
    type: 'hair_submission',
    submission_id: submission?.submission_id || null,
    donation_reference: submission?.donation_reference || '',
    submission_detail_id: detail?.submission_detail_id || null,
    user_id: submission?.user_id || null,
    from_event: Boolean(submission?.from_event || submission?.event_request_id || submission?.event_attendee_id),
    qr_status: submission?.qr_status || '',
    donation_drive_id: submission?.donation_drive_id || null,
    recipient_type: submission?.recipient_type || '',
    recipient_patient_id: submission?.recipient_patient_id || null,
  })
);

export const buildDonationTrackingQrPayload = ({
  submission = null,
  detail = null,
  drive = null,
} = {}) => {
  if (detail?.qr_token) {
    return getHairItemTrackingUrl(detail.qr_token);
  }

  return JSON.stringify({
    type: 'hair_submission',
    submission_id: submission?.submission_id || null,
    donation_reference: submission?.donation_reference || '',
    submission_detail_id: detail?.submission_detail_id || null,
    user_id: submission?.user_id || null,
    from_event: Boolean(submission?.from_event || submission?.event_request_id || submission?.event_attendee_id),
    qr_status: submission?.qr_status || '',
    donation_drive_id: submission?.donation_drive_id || drive?.donation_drive_id || null,
    recipient_type: submission?.recipient_type || '',
    recipient_patient_id: submission?.recipient_patient_id || null,
  });
};

const getDonationQrPayloadValue = (payloadText = '', label = '') => {
  const escapedLabel = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedLabel}:\\s*(.+)$`, 'im');
  const match = String(payloadText || '').match(pattern);
  return match?.[1]?.trim() || '';
};

const parseDonationTrackingQrPayload = (payloadText = '') => {
  const rawPayload = String(payloadText || '').trim();
  const tokenUrlMatch = rawPayload.match(/\/hair-track\/([^/?#\s]+)/i);
  if (tokenUrlMatch?.[1]) {
    return {
      qr_token: decodeURIComponent(tokenUrlMatch[1]),
      submission_id: '',
      donation_reference: '',
      submission_detail_id: '',
      user_id: '',
      donation_source: '',
      donation_status: '',
      donation_drive_id: '',
      recipient_type: '',
      recipient_patient_id: '',
    };
  }

  if (rawPayload.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawPayload);
      if (parsed?.type === 'hair_submission') {
        return {
          submission_id: parsed?.submission_id != null ? String(parsed.submission_id) : '',
          qr_token: parsed?.qr_token || '',
          donation_reference: parsed?.donation_reference || '',
          submission_detail_id: parsed?.submission_detail_id != null ? String(parsed.submission_detail_id) : '',
          user_id: parsed?.user_id != null ? String(parsed.user_id) : '',
          donation_source: parsed?.donation_source
            || (parsed?.from_event ? DRIVE_DONATION_SOURCE : INDEPENDENT_DONATION_SOURCE),
          donation_status: parsed?.qr_status || parsed?.status || parsed?.tracking_status || '',
          donation_drive_id: parsed?.donation_drive_id != null ? String(parsed.donation_drive_id) : '',
          recipient_type: parsed?.recipient_type || '',
          recipient_patient_id: parsed?.recipient_patient_id != null ? String(parsed.recipient_patient_id) : '',
        };
      }
    } catch (_error) {
      // Fall back to legacy line-based parsing below.
    }
  }

  const legacyEventRequestId = getDonationQrPayloadValue(payloadText, 'Event_Request_ID')
    || getDonationQrPayloadValue(payloadText, 'Donation_Drive_ID');
  const legacyFromEvent = getDonationQrPayloadValue(payloadText, 'Hair_Submissions.From_Event')
    || getDonationQrPayloadValue(payloadText, 'From_Event');
  const isLegacyEventSubmission = ['true', '1', 'yes'].includes(legacyFromEvent.toLowerCase())
    || Boolean(legacyEventRequestId);

  return {
    submission_id: getDonationQrPayloadValue(payloadText, 'Hair_Submissions.Submission_ID')
      || getDonationQrPayloadValue(payloadText, 'Submission_ID'),
    qr_token: getDonationQrPayloadValue(payloadText, 'QR_Token'),
    donation_reference: '',
    submission_detail_id: getDonationQrPayloadValue(payloadText, 'Hair_Submission_Details.Submission_Detail_ID')
      || getDonationQrPayloadValue(payloadText, 'Submission_Detail_ID'),
    user_id: getDonationQrPayloadValue(payloadText, 'Hair_Submissions.User_ID')
      || getDonationQrPayloadValue(payloadText, 'User_ID'),
    donation_source: isLegacyEventSubmission ? DRIVE_DONATION_SOURCE : INDEPENDENT_DONATION_SOURCE,
    donation_status: getDonationQrPayloadValue(payloadText, 'Hair_Submissions.Status')
      || getDonationQrPayloadValue(payloadText, 'Status'),
    donation_drive_id: legacyEventRequestId,
  };
};

const renderDonationQrDetailsHtml = (details = []) => (
  (details || [])
    .filter((item) => String(item?.value || '').trim())
    .map((item) => `
      <div class="detail-row">
        <div class="detail-label">${escapeHtml(item.label || '')}</div>
        <div class="detail-value">${escapeHtml(item.value || '')}</div>
      </div>
    `)
    .join('')
);

const buildDonationQrHtmlDocument = ({
  title,
  subtitle,
  qrPayloadText,
  helperText = '',
  details = [],
}) => {
  const qrImageUrl = buildQrImageUrl(qrPayloadText, 420);
  const detailsMarkup = renderDonationQrDetailsHtml(details);

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            margin: 0;
            padding: 28px;
            font-family: Arial, sans-serif;
            background: #f6f1ea;
            color: #241a13;
          }
          .sheet {
            background: #fffaf5;
            border: 1px solid #e1d2c2;
            border-radius: 20px;
            padding: 28px;
          }
          .eyebrow {
            text-transform: uppercase;
            letter-spacing: 1.2px;
            font-size: 11px;
            color: #8a6546;
            margin-bottom: 8px;
          }
          h1 {
            margin: 0 0 8px;
            font-size: 24px;
            color: #59351d;
          }
          p {
            margin: 0 0 16px;
            color: #5a4940;
            line-height: 1.5;
          }
          .qr {
            width: 320px;
            height: 320px;
            display: block;
            margin: 18px auto;
            border: 10px solid white;
            border-radius: 16px;
          }
          .details {
            margin-top: 18px;
            padding: 14px 16px;
            border-radius: 14px;
            background: #f2e7da;
          }
          .detail-row + .detail-row {
            margin-top: 12px;
          }
          .detail-label {
            font-size: 11px;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            color: #8a6546;
            margin-bottom: 4px;
          }
          .detail-value {
            font-size: 14px;
            line-height: 1.45;
            color: #241a13;
          }
          .payload {
            margin-top: 18px;
            padding: 12px;
            border-radius: 12px;
            background: #f2e7da;
            font-size: 11px;
            word-break: break-word;
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="eyebrow">Donivra donation QR</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
          ${helperText ? `<p>${escapeHtml(helperText)}</p>` : ''}
          <img class="qr" src="${qrImageUrl}" />
          ${detailsMarkup ? `<div class="details">${detailsMarkup}</div>` : `<div class="payload">${escapeHtml(qrPayloadText)}</div>`}
        </div>
      </body>
    </html>
  `;
};

export const buildQrImageUrl = (payloadText = '', size = 320) => (
  `${QR_IMAGE_BASE_URL}?size=${size}x${size}&margin=12&ecc=M&data=${encodeURIComponent(payloadText)}`
);

export const isQrSharingSupported = async () => (
  await Sharing.isAvailableAsync()
);

export const generateDonationQrPdf = async ({
  title,
  subtitle,
  qrPayloadText,
  helperText = '',
  details = [],
}) => {
  const html = buildDonationQrHtmlDocument({
    title,
    subtitle,
    qrPayloadText,
    helperText,
    details,
  });

  return await Print.printToFileAsync({ html, base64: false });
};

export const printDonationQrPdf = async ({
  title,
  subtitle,
  qrPayloadText,
  helperText = '',
  details = [],
}) => {
  const html = buildDonationQrHtmlDocument({
    title,
    subtitle,
    qrPayloadText,
    helperText,
    details,
  });

  await Print.printAsync({ html });
};

export const printDonationQrLabelsPdf = async ({
  labels = [],
  title = 'DONIVRA HAIR DONATION',
}) => {
  const labelMarkup = (labels || [])
    .filter((label) => label?.qrPayloadText)
    .map((label, index) => {
      const qrImageUrl = buildQrImageUrl(label.qrPayloadText, 360);
      const detailsMarkup = renderDonationQrDetailsHtml(label.details || []);
      return `
        <section class="sheet">
          <div class="eyebrow">${escapeHtml(title)}</div>
          <h1>${escapeHtml(label.title || `Hair ${index + 1} QR Label`)}</h1>
          <p>${escapeHtml(label.subtitle || 'Attach this QR label to the parcel or hair bundle.')}</p>
          <img class="qr" src="${qrImageUrl}" />
          ${detailsMarkup ? `<div class="details">${detailsMarkup}</div>` : ''}
        </section>
      `;
    })
    .join('');

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { margin: 0; padding: 20px; font-family: Arial, sans-serif; background: #f6f1ea; color: #241a13; }
          .sheet { page-break-after: always; background: #fffaf5; border: 1px solid #e1d2c2; border-radius: 18px; padding: 24px; margin-bottom: 20px; }
          .sheet:last-child { page-break-after: auto; }
          .eyebrow { text-transform: uppercase; letter-spacing: 1.2px; font-size: 11px; color: #8a6546; margin-bottom: 8px; }
          h1 { margin: 0 0 8px; font-size: 22px; color: #59351d; }
          p { margin: 0 0 14px; color: #5a4940; line-height: 1.5; }
          .qr { width: 280px; height: 280px; display: block; margin: 14px auto; border: 10px solid white; border-radius: 16px; }
          .details { margin-top: 14px; padding: 14px 16px; border-radius: 14px; background: #f2e7da; }
          .detail-row + .detail-row { margin-top: 10px; }
          .detail-label { font-size: 11px; letter-spacing: 0.8px; text-transform: uppercase; color: #8a6546; margin-bottom: 4px; }
          .detail-value { font-size: 14px; line-height: 1.45; color: #241a13; }
        </style>
      </head>
      <body>${labelMarkup}</body>
    </html>
  `;

  await Print.printAsync({ html });
};

export const shareDonationQrPdf = async (uri) => {
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Save or share donor QR',
    UTI: '.pdf',
  });
};

export const saveDonationQrPngToDevice = async ({
  qrPayloadText,
  fileName = 'donivra-donation-qr',
  size = 720,
}) => {
  if (!qrPayloadText) {
    return { success: false, error: 'A valid QR payload is required before saving.' };
  }

  try {
    if (!FileSystem.cacheDirectory) {
      return { success: false, error: 'Device storage cache is not available right now.' };
    }

    const safeFileName = sanitizeFileName(fileName);
    const targetUri = `${FileSystem.cacheDirectory}${safeFileName}-${Date.now()}.png`;
    const downloadResult = await FileSystem.downloadAsync(
      buildQrImageUrl(qrPayloadText, size),
      targetUri
    );

    const shareQrImage = async () => {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        return {
          success: false,
          error: 'Saving is unavailable on this device. Try Print QR instead.',
        };
      }

      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: 'image/png',
        dialogTitle: 'Save or share waybill QR',
        UTI: 'public.png',
      });
      return { success: true, uri: downloadResult.uri, shared: true };
    };

    // Expo Go cannot provide full Media Library access on recent Android
    // versions. Use the native save/share sheet there instead.
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      return await shareQrImage();
    }

    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (permission.granted) {
        const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
        return {
          success: true,
          uri: asset?.uri || downloadResult.uri,
          asset,
        };
      }
    } catch (_mediaLibraryError) {
      // A native save may be unavailable in a preview client. The share sheet
      // still lets the donor save the generated PNG without losing progress.
    }

    return await shareQrImage();
  } catch (error) {
    logAppError('donor_donations.qr.save_png', error, {
      fileName,
      hasPayload: Boolean(qrPayloadText),
    });

    return {
      success: false,
      error: error?.message || 'Unable to save the QR image to this device.',
    };
  }
};

/**
 * Data needed by one donor event page. This deliberately excludes event lists,
 * logistics, certificates, parcel images, and production timelines.
 */
export const getDonorEventParticipationData = async ({
  userId,
  databaseUserId,
  driveId,
} = {}) => {
  if (!userId || !databaseUserId || !driveId) {
    return { error: 'Your account and event are required.' };
  }

  const [analysisResult, eventSubmissionResult] = await Promise.all([
    fetchLatestHairAnalysisSummaryByUserId(databaseUserId, 50),
    fetchHairSubmissionForEventByUserId({ userId: databaseUserId, eventRequestId: driveId }),
  ]);

  const submissions = analysisResult.data?.submissions || [];
  const latestAnalysisEntry = analysisResult.data?.latestAnalysisEntry || null;
  const latestScreening = latestAnalysisEntry?.screening || null;
  const latestCompletedDonation = resolveLatestCompletedDonation(submissions);
  const latestScreeningMs = latestScreening?.created_at
    ? new Date(latestScreening.created_at).getTime()
    : NaN;
  const latestCompletedDonationMs = latestCompletedDonation?.completed_at
    ? new Date(latestCompletedDonation.completed_at).getTime()
    : NaN;
  const requiresPostDonationAnalysis = Boolean(
    Number.isFinite(latestCompletedDonationMs)
    && (!Number.isFinite(latestScreeningMs) || latestScreeningMs <= latestCompletedDonationMs)
  );
  const rawEligibility = evaluateAiDonationEligibility({
    screening: latestScreening,
  });
  const postDonationMessage = 'Your previous donated hair has already been cut. Run Hair Analysis again so the app can verify if your current hair is long enough for another event donation.';
  const latestAiEligibility = requiresPostDonationAnalysis
    ? {
        ...rawEligibility,
        isQualified: false,
        reason: postDonationMessage,
        reasons: [postDonationMessage],
      }
    : rawEligibility;
  const ongoingSubmission = submissions.find((submission) => (
    submission?.submission_id
    && !isTerminalDonationStatus(submission.status)
    && !getCompletedDonationAt(submission)
    && !isHairCheckOnlySubmission(submission)
  )) || null;

  return {
    submissions: eventSubmissionResult.data ? [eventSubmissionResult.data] : [],
    latestSubmission: eventSubmissionResult.data || null,
    latestAnalysisEntry,
    latestScreening,
    latestAiEligibility,
    // Event RSVP is based on whether the latest AI observations satisfy the
    // current wig_requirements. Screening availability is enforced later when
    // an actual donation is started, and must not downgrade an eligible RSVP
    // to guest-only attendance.
    isAiEligible: Boolean(
      !requiresPostDonationAnalysis
      && latestAiEligibility?.meetsCurrentRequirements === true
    ),
    requiresPostDonationAnalysis,
    hasOngoingDonation: Boolean(ongoingSubmission),
    ongoingDonationMessage: ongoingSubmission
      ? 'You already have an ongoing donation. Please finish or cancel the current donation before starting a new one.'
      : '',
    error: analysisResult.error?.message
      || eventSubmissionResult.error?.message
      || null,
  };
};

export const getDonorDonationsModuleData = async ({ userId, databaseUserId, driveLimit = 6 }) => {
  if (!userId) {
    return {
      latestAnalysisEntry: null,
      latestAiEligibility: null,
      latestDonationRequirement: null,
      isEligible: false,
      isAiEligible: false,
      isDonationReady: false,
      drives: [],
      completedEventDrives: [],
      timelineStages: [],
      timelineEvents: [],
      certificate: null,
      error: 'Your session is not ready.',
    };
  }

  const [submissionsResult, analysisResult, drivesResult, registeredDrivesResult, certificateResult, donationRequirementResult] = await Promise.all([
    fetchHairSubmissionsByUserId(databaseUserId || userId, 50, { relationLimit: 12 }),
    fetchLatestHairAnalysisSummaryByUserId(databaseUserId || userId, 50),
    fetchUpcomingDonationDrives(driveLimit, databaseUserId || null),
    fetchRegisteredDonationDrivesByUserId({ databaseUserId: databaseUserId || null, limit: 50 }),
    fetchLatestDonationCertificateByUserId(databaseUserId || userId),
    fetchLatestDonationRequirement(),
  ]);

  if (submissionsResult.error || analysisResult.error) {
    return {
      latestAnalysisEntry: null,
      latestAiEligibility: null,
      latestDonationRequirement: donationRequirementResult.data || null,
      isEligible: false,
      isAiEligible: false,
      isDonationReady: false,
      drives: drivesResult.data || [],
      registeredDrives: registeredDrivesResult.data || [],
      completedEventDrives: [],
      timelineStages: [],
      timelineEvents: [],
      certificate: certificateResult.data || null,
      error: submissionsResult.error?.message
        || analysisResult.error?.message
        || 'Unable to load donation data.',
    };
  }

  let submissions = submissionsResult.data || [];
  const latestAnalysisEntry = analysisResult.data?.latestAnalysisEntry || null;
  const latestScreening = latestAnalysisEntry?.screening || null;
  const rawLatestAiEligibility = evaluateAiDonationEligibility({
    screening: latestAnalysisEntry?.screening || null,
    detail: latestAnalysisEntry?.detail || null,
    donationRequirement: donationRequirementResult.data || null,
  });
  const latestCompletedDonation = resolveLatestCompletedDonation(submissions);
  const latestScreeningMs = latestScreening?.created_at ? new Date(latestScreening.created_at).getTime() : NaN;
  const latestCompletedDonationMs = latestCompletedDonation?.completed_at
    ? new Date(latestCompletedDonation.completed_at).getTime()
    : NaN;
  const requiresPostDonationAnalysis = Boolean(
    Number.isFinite(latestCompletedDonationMs)
    && (!Number.isFinite(latestScreeningMs) || latestScreeningMs <= latestCompletedDonationMs)
  );
  const postDonationAnalysisMessage = 'Your last donated hair was already cut. Please run a new Hair Analysis first so the app can verify your current hair length before another donation.';
  const latestAiEligibility = requiresPostDonationAnalysis
    ? {
        ...rawLatestAiEligibility,
        isQualified: false,
        reasons: [postDonationAnalysisMessage],
        reason: postDonationAnalysisMessage,
        requires_post_donation_analysis: true,
      }
    : rawLatestAiEligibility;
  const aiRecord = resolveAiDonationRecord(latestAnalysisEntry, donationRequirementResult.data || null);
  const manualRecord = resolveManualDonationRecord({
    submissions,
    donationRequirement: donationRequirementResult.data || null,
  });
  const latestQualifiedRecord = resolveActiveDonationRecord({ aiRecord, manualRecord });
  const eventRegistrationByDriveId = new Map(
    (registeredDrivesResult.data || [])
      .filter((drive) => Number(drive?.donation_drive_id) > 0)
      .map((drive) => [Number(drive.donation_drive_id), drive?.registration || null])
  );
  const flowEligibleSubmissions = submissions.filter((submission) => {
    const submissionDriveId = Number(submission?.donation_drive_id);
    if (!Number.isFinite(submissionDriveId) || submissionDriveId <= 0) return true;
    const registration = eventRegistrationByDriveId.get(submissionDriveId) || null;
    return isDonationParticipantRegistration(registration) && isMarkedPresentRegistration(registration);
  });
  let activeRecord = resolveCurrentDonationRecord({
    submissions: flowEligibleSubmissions,
    donationRequirement: donationRequirementResult.data || null,
    fallbackRecord: latestQualifiedRecord,
  });
  let activeFlowSubmission = resolveCurrentFlowSubmission({
    submissions: flowEligibleSubmissions,
  });
  const activeFlowSubmissions = resolveCurrentFlowSubmissions({
    submissions: flowEligibleSubmissions,
  });
  const independentFlowSubmissions = activeFlowSubmissions.filter(
    (submission) => submission?.submission_id && !Number(submission?.donation_drive_id)
  );
  let submissionFlowRecords = await Promise.all(independentFlowSubmissions.map(async (submission) => {
    const flowDetail = getLatestSubmissionDetail(submission);
    const [
      submissionLogisticsResult,
      submissionAppointmentResult,
      submissionTrackingResult,
      submissionParcelImages,
      submissionProductionResult,
    ] = await Promise.all([
      fetchHairSubmissionLogisticsBySubmissionId(submission.submission_id),
      fetchSalonDonationAppointmentBySubmissionId(submission.submission_id),
      flowDetail?.submission_detail_id
        ? fetchHairBundleTrackingHistory({
            submissionId: submission.submission_id,
            submissionDetailId: flowDetail.submission_detail_id,
            limit: 16,
          })
        : Promise.resolve({ data: [], error: null }),
      flowDetail ? getParcelImagesWithUrls(flowDetail) : Promise.resolve([]),
      submission?.bundle_id
        ? fetchDonationTimelineProductionByBundleId(submission.bundle_id)
        : Promise.resolve({ data: null, error: null }),
    ]);
    const appointmentHistoryResult = submissionAppointmentResult.data?.appointment_id
      ? await fetchSalonAppointmentStatusHistoryByAppointmentIds([
          submissionAppointmentResult.data.appointment_id,
        ])
      : { data: [], error: null };
    return {
      submission_id: submission.submission_id,
      logistics: submissionLogisticsResult.data || null,
      appointment: submissionAppointmentResult.data || null,
      appointmentHistory: appointmentHistoryResult.data || [],
      appointmentHistoryError: appointmentHistoryResult.error || null,
      trackingEntries: submissionTrackingResult.data || [],
      parcelImages: submissionParcelImages || [],
      production: submissionProductionResult.data || null,
    };
  }));
  // Hair_Submissions is the root record. Keep it visible even if a failed or
  // interrupted child write temporarily leaves logistics or appointment null.
  activeFlowSubmission = resolveCurrentFlowSubmission({ submissions: activeFlowSubmissions });
  const isAiEligible = Boolean(!requiresPostDonationAnalysis && aiRecord?.qualification?.isQualified);
  const isManualQualified = Boolean(manualRecord?.qualification?.isQualified);
  const isDonationReady = Boolean(!requiresPostDonationAnalysis && activeRecord?.qualification?.isQualified);
  const activeSubmission = activeFlowSubmission || activeRecord?.submission || null;
  const activeDetail = activeRecord?.detail || getLatestSubmissionDetail(activeSubmission);
  const activeScreening = activeRecord?.screening || [...(activeSubmission?.ai_screenings || [])]
    .sort((left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime())[0] || null;

  let logistics = null;
  let logisticsError = null;
  let trackingEntries = [];
  let trackingError = null;
  let parcelImages = [];
  let productionTimeline = null;
  let productionTimelineError = null;
  let wigRequestProgress = null;
  let wigRequestProgressError = null;
  let appointment = null;
  let appointmentError = null;
  let appointmentHistory = [];
  let appointmentHistoryError = null;
  const prefetchedActiveFlowRecord = activeSubmission?.submission_id
    ? submissionFlowRecords.find((record) => (
        Number(record?.submission_id) === Number(activeSubmission.submission_id)
      )) || null
    : null;

  if (prefetchedActiveFlowRecord) {
    logistics = prefetchedActiveFlowRecord.logistics || null;
    trackingEntries = prefetchedActiveFlowRecord.trackingEntries || [];
    parcelImages = prefetchedActiveFlowRecord.parcelImages || [];
    appointment = prefetchedActiveFlowRecord.appointment || null;
    appointmentHistory = prefetchedActiveFlowRecord.appointmentHistory || [];
    appointmentHistoryError = prefetchedActiveFlowRecord.appointmentHistoryError || null;
    productionTimeline = prefetchedActiveFlowRecord.production || null;
  } else if (activeSubmission?.submission_id && activeDetail?.submission_detail_id) {
    const [logisticsResult, trackingResult, parcelImagesResult, appointmentResult] = await Promise.all([
      fetchHairSubmissionLogisticsBySubmissionId(activeSubmission.submission_id),
      fetchHairBundleTrackingHistory({
        submissionId: activeSubmission.submission_id,
        submissionDetailId: activeDetail.submission_detail_id,
        limit: 16,
      }),
      getParcelImagesWithUrls(activeDetail),
      fetchSalonDonationAppointmentBySubmissionId(activeSubmission.submission_id),
    ]);

    logistics = logisticsResult.data || null;
    logisticsError = logisticsResult.error;
    trackingEntries = trackingResult.data || [];
    trackingError = trackingResult.error;
    parcelImages = parcelImagesResult;
    appointment = appointmentResult.data || null;
    appointmentError = appointmentResult.error;
    if (appointment?.appointment_id) {
      const appointmentHistoryResult = await fetchSalonAppointmentStatusHistoryByAppointmentIds([
        appointment.appointment_id,
      ]);
      appointmentHistory = appointmentHistoryResult.data || [];
      appointmentHistoryError = appointmentHistoryResult.error || null;
    }
  }

  if (activeSubmission?.bundle_id && !prefetchedActiveFlowRecord) {
    const [productionTimelineResult, wigRequestProgressResult] = await Promise.all([
      fetchDonationTimelineProductionByBundleId(activeSubmission.bundle_id),
      fetchDonorTimelineWigProgressBySubmissionId(activeSubmission.submission_id),
    ]);
    productionTimeline = productionTimelineResult.data || null;
    productionTimelineError = productionTimelineResult.error || null;
    wigRequestProgress = wigRequestProgressResult.data || null;
    wigRequestProgressError = wigRequestProgressResult.error || null;
  }

  const matchingDriveFromList = (drivesResult.data || [])
    .find((drive) => drive?.donation_drive_id === activeSubmission?.donation_drive_id) || null;
  let activeDrive = matchingDriveFromList;
  let activeDriveError = null;

  if (activeSubmission?.donation_drive_id && databaseUserId && !matchingDriveFromList?.registration) {
    const activeDriveResult = await fetchDonationDrivePreview(activeSubmission.donation_drive_id, databaseUserId);
    activeDrive = activeDriveResult.data || matchingDriveFromList || null;
    activeDriveError = activeDriveResult.error || null;
  }

  const certificate = certificateResult.data || null;

  const independentQrState = getIndependentDonationQrState({
    submission: activeSubmission,
    logistics,
    trackingEntries,
  });
  const hasIndependentFlow = Boolean(
    activeSubmission?.from_event === false
    || independentQrState?.reference
    || logistics
    || appointment
    || parcelImages.length
    || hasMeaningfulTrackingEntries(trackingEntries)
  );
  const hasDriveFlow = hasEventDonationProgress({
    submission: activeSubmission,
    registration: activeDrive?.registration || null,
  });
  const activeFlowType = hasDriveFlow ? 'drive' : hasIndependentFlow ? 'independent' : '';
  const donorJourney = activeSubmission && activeFlowType === 'drive'
    ? buildCanonicalEventDonorJourney({
        submission: activeDetail
          ? { ...activeSubmission, submission_details: [activeDetail] }
          : activeSubmission,
        registration: activeDrive?.registration || null,
        trackingEntries,
        production: productionTimeline,
        wigRequestProgress,
      })
    : null;
  const timelineStages = activeSubmission
    ? donorJourney?.stages || resolveTimelineStages({
        submission: activeSubmission,
        logistics,
        trackingEntries,
        parcelImages,
        certificate,
        flowType: activeFlowType,
        registration: activeDrive?.registration || null,
        production: productionTimeline,
        appointment,
        wigRequestProgress,
      })
    : [];
  const timelineEvents = activeSubmission
    ? buildTimelineEvents({ logistics, trackingEntries, parcelImages, certificate, flowType: activeFlowType })
    : [];
  const submissionFlowRecordsWithTimelines = submissionFlowRecords.map((record) => {
    const flowSubmission = independentFlowSubmissions.find(
      (submission) => Number(submission?.submission_id) === Number(record.submission_id)
    );
    return {
      ...record,
      timelineStages: resolveTimelineStages({
        submission: flowSubmission,
        logistics: record.logistics,
        trackingEntries: record.trackingEntries,
        parcelImages: record.parcelImages,
        certificate: Number(certificate?.submission_id) === Number(record.submission_id)
          ? certificate
          : null,
        flowType: 'independent',
        registration: null,
        production: record.production,
        appointment: record.appointment,
      }),
      timelineEvents: buildTimelineEvents({
        logistics: record.logistics,
        trackingEntries: record.trackingEntries,
        parcelImages: record.parcelImages,
        certificate: Number(certificate?.submission_id) === Number(record.submission_id)
          ? certificate
          : null,
        flowType: 'independent',
      }),
    };
  });
  const latestStage = timelineStages[timelineStages.length - 1] || null;
const hasCompletedDonation = Boolean(
    donorJourney?.isComplete
    || latestStage?.key === 'bundling' && latestStage?.state === 'completed'
    || isTerminalDonationStatus(activeSubmission?.status)
  );
  const activeQrState = activeFlowType === 'drive'
    ? activeDrive?.registration?.qr || null
    : independentQrState;
  const hasOngoingDonation = Boolean(
    activeSubmission?.submission_id
    && !hasCompletedDonation
    && (hasDriveFlow || hasIndependentFlow)
  );
  const donationHistory = buildDonationHistory({
    submissions,
    activeSubmission: hasOngoingDonation ? activeSubmission : null,
  });
  const eventSubmissionDriveIds = [...new Set(
    sortSubmissionsByCreatedAt(submissions)
      .filter(isDisplayableEventSubmission)
      .map((submission) => Number(submission?.donation_drive_id))
      .filter((driveId) => Number.isFinite(driveId) && driveId > 0)
  )];
  const eventSubmissionDriveIdSet = new Set(eventSubmissionDriveIds);
  const registeredEventDriveIds = (registeredDrivesResult.data || [])
    .filter((drive) => isMarkedPresentRegistration(drive?.registration))
    .map((drive) => Number(drive?.donation_drive_id))
    .filter((driveId) => Number.isFinite(driveId) && driveId > 0);
  const knownEventDriveIds = new Set([
    ...registeredEventDriveIds,
  ].filter((driveId) => Number.isFinite(driveId) && driveId > 0));
  const missingEventSubmissionDriveIds = eventSubmissionDriveIds
    .filter((driveId) => !knownEventDriveIds.has(driveId));
  const eventSubmissionDriveResults = missingEventSubmissionDriveIds.length
    ? await Promise.all(missingEventSubmissionDriveIds.map((driveId) => (
        fetchDonationDrivePreview(driveId, databaseUserId || null)
      )))
    : [];
  const completedEventDrivesById = new Map();
  [
    ...(registeredDrivesResult.data || []).filter((drive) => isMarkedPresentRegistration(drive?.registration)),
    activeDrive,
    ...eventSubmissionDriveResults.map((result) => result?.data || null),
  ]
    .filter((drive) => Number(drive?.donation_drive_id) > 0)
    .filter((drive) => (
      isMarkedPresentRegistration(drive?.registration)
      || eventSubmissionDriveIdSet.has(Number(drive?.donation_drive_id))
    ))
    .forEach((drive) => {
      const driveId = Number(drive.donation_drive_id);
      const existing = completedEventDrivesById.get(driveId);
      if (!existing || drive?.registration?.registration_id || !existing?.registration?.registration_id) {
        completedEventDrivesById.set(driveId, drive);
      }
    });
  const completedEventDrives = Array.from(completedEventDrivesById.values());

  return {
    submissions,
    latestAnalysisEntry,
    latestScreening,
    latestAiEligibility,
    latestCompletedDonation: latestCompletedDonation
      ? {
          submission_id: latestCompletedDonation.submission?.submission_id || null,
          status: latestCompletedDonation.submission?.status || '',
          completed_at: latestCompletedDonation.completed_at,
        }
      : null,
    requiresPostDonationAnalysis,
    latestEligibleAnalysisEntry: aiRecord ? latestAnalysisEntry : null,
    latestAiDonation: aiRecord,
    latestDonationRequirement: donationRequirementResult.data || null,
    latestManualDonation: manualRecord,
    latestSubmission: activeSubmission,
    activeSubmissions: activeFlowSubmissions,
    submissionFlowRecords: submissionFlowRecordsWithTimelines,
    latestDetail: activeDetail,
    latestRecommendations: activeRecord?.recommendations || latestAnalysisEntry?.recommendations || [],
    activeQualificationSource: activeRecord?.source || '',
    activeScreening,
    isEligible: isDonationReady,
    isAiEligible,
    isManualQualified,
    isDonationReady,
    hasOngoingDonation,
    activeFlowType,
    activeFlow: activeFlowType === 'drive'
      ? activeDrive
      : activeSubmission,
    activeDrive,
    activeQrState,
    ongoingDonationMessage: hasOngoingDonation
      ? 'You already have an ongoing donation. Please finish or cancel the current donation before starting a new one.'
      : '',
    donationHistory,
    completedDonationHistory: donationHistory,
    drives: drivesResult.data || [],
    registeredDrives: registeredDrivesResult.data || [],
    completedEventDrives,
    logistics,
    appointment,
    appointmentHistory,
    independentQrState,
    trackingEntries,
    parcelImages,
    timelineStages,
    donorJourney,
    timelineEvents,
    certificate,
    error: submissionsResult.error?.message
      || drivesResult.error?.message
      || registeredDrivesResult.error?.message
      || logisticsError?.message
      || appointmentError?.message
      || appointmentHistoryError?.message
      || trackingError?.message
      || productionTimelineError?.message
      || wigRequestProgressError?.message
      || activeDriveError?.message
      || certificateResult.error?.message
      || donationRequirementResult.error?.message
      || null,
  };
};

export const getEventDonationProgressData = async ({
  userId,
  databaseUserId,
  driveId,
  submissionId = null,
} = {}) => {
  const normalizedDriveId = Number(driveId);
  if (!userId || !databaseUserId || !Number.isFinite(normalizedDriveId) || normalizedDriveId <= 0) {
    return {
      data: null,
      error: new Error('Your account and event are required to load donation progress.'),
    };
  }

  const [driveResult, submissionResult] = await Promise.all([
    fetchDonationDrivePreview(normalizedDriveId, databaseUserId),
    fetchHairSubmissionForEventByUserId({
      userId: databaseUserId,
      eventRequestId: normalizedDriveId,
      submissionId,
    }),
  ]);

  if (driveResult.error || submissionResult.error) {
    return {
      data: null,
      error: driveResult.error || submissionResult.error,
    };
  }

  const drive = driveResult.data || null;
  const registration = drive?.registration || null;
  const submission = submissionResult.data
    && !['cancelled', 'canceled', 'rejected'].includes(normalizeStatus(submissionResult.data?.status))
    ? submissionResult.data
    : null;
  const isDonationParticipant = isDonationParticipantRegistration(registration);
  const isCheckedIn = isMarkedPresentRegistration(registration);

  if (!drive) {
    return { data: null, error: new Error('This donation event could not be found.') };
  }

  if (!registration?.registration_id) {
    return {
      data: { drive, registration: null, submission: null, canTrack: false, reason: 'not_registered' },
      error: null,
    };
  }

  if (!isDonationParticipant) {
    return {
      data: { drive, registration, submission: null, canTrack: false, reason: 'attendance_only' },
      error: null,
    };
  }

  if (!isCheckedIn) {
    return {
      data: { drive, registration, submission, canTrack: false, reason: 'awaiting_staff_scan' },
      error: null,
    };
  }

  if (!submission?.submission_id) {
    return {
      data: { drive, registration, submission: null, canTrack: false, reason: 'submission_unavailable' },
      error: null,
    };
  }

  const detailResult = await fetchLatestHairSubmissionDetailBySubmissionId(submission.submission_id);
  const detailImagesResult = detailResult.data?.submission_detail_id
    ? await fetchHairSubmissionImagesByDetailIds([detailResult.data.submission_detail_id])
    : { data: [], error: null };
  const detail = detailResult.data ? {
    ...detailResult.data,
    images: detailImagesResult.data || [],
  } : null;
  const [logisticsResult, trackingResult, parcelImages, productionResult, wigRequestProgressResult, appointmentResult, certificateResult] = await Promise.all([
    fetchHairSubmissionLogisticsBySubmissionId(submission.submission_id),
    detail?.submission_detail_id
      ? fetchHairBundleTrackingHistory({
          submissionId: submission.submission_id,
          submissionDetailId: detail.submission_detail_id,
          limit: 24,
        })
      : Promise.resolve({ data: [], error: null }),
    detail ? getParcelImagesWithUrls(detail) : Promise.resolve([]),
    submission?.bundle_id
      ? fetchDonationTimelineProductionByBundleId(submission.bundle_id)
      : Promise.resolve({ data: null, error: null }),
    submission?.bundle_id
      ? fetchDonorTimelineWigProgressBySubmissionId(submission.submission_id)
      : Promise.resolve({ data: null, error: null }),
    fetchSalonDonationAppointmentBySubmissionId(submission.submission_id),
    fetchDonationCertificateBySubmissionId(submission.submission_id),
  ]);

  const timelineSubmission = detail ? { ...submission, submission_details: [detail] } : submission;
  const donorJourney = buildCanonicalEventDonorJourney({
    submission: timelineSubmission,
    trackingEntries: trackingResult.data || [],
    registration,
    production: productionResult.data || null,
    wigRequestProgress: wigRequestProgressResult.data || null,
  });
  const timelineStages = donorJourney.stages;

  return {
    data: {
      drive,
      registration,
      submission,
      canTrack: true,
      reason: '',
      donorJourney,
      timelineStages,
      timelineEvents: buildTimelineEvents({
        logistics: logisticsResult.data || null,
        trackingEntries: trackingResult.data || [],
        parcelImages: parcelImages || [],
        certificate: certificateResult.data || null,
        flowType: 'drive',
      }),
      certificate: certificateResult.data || null,
    },
    error: logisticsResult.error
      || detailResult.error
      || detailImagesResult.error
      || trackingResult.error
      || productionResult.error
      || wigRequestProgressResult.error
      || appointmentResult.error
      || certificateResult.error
      || null,
  };
};

const decodeBase64ToArrayBuffer = (base64Value = '') => {
  const normalizedBase64 = String(base64Value || '').trim();
  if (!normalizedBase64) {
    throw new Error('The selected parcel image is missing image data.');
  }

  if (typeof atob === 'function') {
    const binary = atob(normalizedBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  if (typeof globalThis.Buffer !== 'undefined' && typeof globalThis.Buffer.from === 'function') {
    const bytes = Uint8Array.from(globalThis.Buffer.from(normalizedBase64, 'base64'));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  throw new Error('Parcel image upload is not supported in this environment.');
};

const getPhotoUploadPayload = async (photo) => {
  const contentType = photo?.mimeType || photo?.file?.type || 'image/jpeg';
  const fileName = photo?.fileName || photo?.file?.name || 'parcel-photo.jpg';

  if (photo?.file && typeof photo.file.arrayBuffer === 'function') {
    return {
      fileBody: await photo.file.arrayBuffer(),
      contentType,
      fileName,
    };
  }

  const inlineBase64 = typeof photo?.base64 === 'string' && photo.base64.trim()
    ? photo.base64.trim()
    : String(photo?.dataUrl || '').split(',')[1] || '';

  if (inlineBase64) {
    return {
      fileBody: decodeBase64ToArrayBuffer(inlineBase64),
      contentType,
      fileName,
    };
  }

  if (!photo?.uri) {
    throw new Error('The selected parcel image could not be prepared for upload.');
  }

  const response = await fetch(photo.uri);
  if (!response.ok) {
    throw new Error('The selected parcel image could not be read.');
  }

  return {
    fileBody: await response.arrayBuffer(),
    contentType,
    fileName,
  };
};

export const saveIndependentDonationParcelLog = async ({
  userId,
  databaseUserId,
  submission,
  detail,
  photo,
}) => {
  if (!userId || !databaseUserId) {
    return { success: false, error: 'Your session is not ready.' };
  }
  if (!submission?.submission_id) {
    return { success: false, error: 'A qualified donation record is required before parcel logging.' };
  }
  if (!photo) {
    return { success: false, error: 'Please upload a parcel image before continuing.' };
  }

  const logisticsResult = await fetchHairSubmissionLogisticsBySubmissionId(submission.submission_id);
  if (logisticsResult.error) {
    return { success: false, error: logisticsResult.error.message || 'Unable to verify this courier donation.' };
  }
  const logisticsType = String(logisticsResult.data?.logistics_type || '').trim().toLowerCase();
  if (!['ship by courier', 'courier'].includes(logisticsType)) {
    return { success: false, error: 'Package proof is only available for Ship by Courier donations.' };
  }
  if (logisticsResult.data?.received_at) {
    return { success: false, error: 'This package has already been received and its proof can no longer be changed.' };
  }

  let resolvedDetail = detail?.submission_detail_id ? detail : null;
  if (!resolvedDetail) {
    const existingDetailResult = await fetchLatestHairSubmissionDetailBySubmissionId(submission.submission_id);
    if (existingDetailResult.error) {
      return { success: false, error: existingDetailResult.error.message || 'Unable to load the donation details.' };
    }
    resolvedDetail = existingDetailResult.data || null;
  }

  if (!resolvedDetail?.submission_detail_id) {
    const detailResult = await supabase.rpc('prepare_own_courier_package_proof', {
      p_submission_id: Number(submission.submission_id),
    });
    if (detailResult.error || !detailResult.data?.submission_detail_id) {
      return {
        success: false,
        error: detailResult.error?.message || 'Unable to prepare the donation record for package proof.',
      };
    }
    resolvedDetail = detailResult.data;
  }

  const existingImagesResult = await fetchHairSubmissionImagesByDetailIds([resolvedDetail.submission_detail_id]);
  if (existingImagesResult.error) {
    return { success: false, error: existingImagesResult.error.message || 'Unable to verify existing package proof.' };
  }
  const existingProof = (existingImagesResult.data || []).find(
    (image) => image?.image_type === 'independent_parcel_photo'
  );
  if (existingProof) {
    return { success: true, alreadyUploaded: true, detail: resolvedDetail, image: existingProof };
  }

  let uploadPayload;
  try {
    uploadPayload = await getPhotoUploadPayload(photo);
  } catch (error) {
    return { success: false, error: error?.message || 'The selected package photo could not be prepared.' };
  }
  const filePath = `${userId}/${submission.submission_id}/parcel-${resolvedDetail.submission_detail_id}-${Date.now()}.jpg`;
  const uploadResult = await uploadHairSubmissionImage({
    path: filePath,
    fileBody: uploadPayload.fileBody,
    contentType: uploadPayload.contentType,
    bucket: hairSubmissionStorageBucket,
  });

  if (uploadResult.error) {
    return {
      success: false,
      error: uploadResult.error.message || 'Unable to upload the parcel image right now.',
    };
  }

  const imageInsertResult = await createHairSubmissionImages([{
    submission_detail_id: resolvedDetail.submission_detail_id,
    file_path: filePath,
    image_type: 'independent_parcel_photo',
  }]);

  if (imageInsertResult.error) {
    await removeHairSubmissionImagesFromStorage({ paths: [filePath] });
    return {
      success: false,
      error: imageInsertResult.error.message || 'Unable to save the parcel image record.',
    };
  }

  await persistDonationNotifications({
    userId,
    notifications: [
      buildDonationNotification({
        dedupeKey: `${notificationTypes.logisticsUpdated}:${submission.submission_id}:parcel-ready`,
        title: 'Package proof uploaded',
        message: 'Your package photo was saved. Add the courier name and external tracking number after shipping.',
        createdAt: new Date().toISOString(),
        referenceId: submission.submission_id,
      }),
    ],
  });

  return {
    success: true,
    submission,
    detail: resolvedDetail,
    logistics: logisticsResult.data,
    image: imageInsertResult.data?.[0] || null,
  };
};

export const cancelDonorDonation = async ({
  userId = null,
  databaseUserId = null,
  submission = null,
  detail = null,
  reason = '',
}) => {
  if (!userId || !databaseUserId) {
    return { success: false, error: 'Your session is not ready.' };
  }

  if (!submission?.submission_id) {
    return { success: false, error: 'No active donation record was found.' };
  }

  const [currentSubmissionResult, submissionDetailsResult, certificateResult] = await Promise.all([
    fetchHairSubmissionById(submission.submission_id),
    fetchHairSubmissionDetailsBySubmissionId(submission.submission_id),
    fetchDonationCertificateBySubmissionId(submission.submission_id),
  ]);
  if (currentSubmissionResult.error || submissionDetailsResult.error || certificateResult.error) {
    return {
      success: false,
      error: 'The cancellation period and approval status could not be verified. Please try again.',
    };
  }

  const currentSubmission = currentSubmissionResult.data || null;
  if (!currentSubmission?.submission_id || Number(currentSubmission.user_id) !== Number(databaseUserId)) {
    return { success: false, error: 'This donation is not available for cancellation.' };
  }

  if (isTerminalDonationStatus(currentSubmission.status)) {
    return { success: false, error: 'This donation is already closed and cannot be cancelled.' };
  }

  const hasApproval = ['approved', 'accepted'].includes(normalizeStatus(currentSubmission.status))
    || (submissionDetailsResult.data || []).some((item) => (
      ['approved', 'accepted'].includes(normalizeStatus(item?.status))
    ))
    || Boolean(certificateResult.data?.certificate_id);
  if (hasApproval) {
    return { success: false, error: 'Approved donations can no longer be cancelled.' };
  }

  const createdAtMs = new Date(currentSubmission.created_at || 0).getTime();
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) {
    return { success: false, error: 'The donation cancellation period could not be verified.' };
  }
  if (Date.now() > createdAtMs + DONOR_CANCELLATION_WINDOW_MS) {
    return { success: false, error: 'The 7-day cancellation period has ended.' };
  }

  const normalizedReason = String(reason || '').trim();
  const cancellationNote = normalizedReason
    ? `Donation cancelled by donor. Reason: ${normalizedReason}`
    : 'Donation cancelled by donor from the donor module.';
  const updatedNotes = mergeDonationNotes(
    currentSubmission.donor_notes || '',
    [
      'Donation status changed to cancelled by donor.',
      cancellationNote,
    ],
    null,
  );

  const submissionResult = await updateHairSubmissionById(currentSubmission.submission_id, {
    status: 'Cancelled',
    donor_notes: updatedNotes,
  });

  if (submissionResult.error || !submissionResult.data?.submission_id) {
    return {
      success: false,
      error: submissionResult.error?.message || 'Unable to cancel the donation right now.',
    };
  }

  const isEventDonation = currentSubmission.from_event === true || Number(currentSubmission.donation_drive_id) > 0;
  const logisticsResult = isEventDonation
    ? { data: null, error: null }
    : await upsertSubmissionLogistics({
        submissionId: currentSubmission.submission_id,
        shipmentStatus: 'Cancelled',
        notes: cancellationNote,
        updatedBy: databaseUserId,
      });

  if (logisticsResult.error) {
    return {
      success: false,
      error: logisticsResult.error.message || 'Unable to update donation logistics after cancellation.',
    };
  }

  if (detail?.submission_detail_id) {
    const trackingResult = await createHairBundleTrackingEntry({
      submission_id: currentSubmission.submission_id,
      submission_detail_id: detail.submission_detail_id,
      status: 'cancelled',
      title: 'Donation cancelled',
      description: cancellationNote,
      changed_by: databaseUserId,
    });

    if (trackingResult.error) {
      return {
        success: false,
        error: trackingResult.error.message || 'Unable to save the donation cancellation timeline update.',
      };
    }
  }

  await persistDonationNotifications({
    userId,
    notifications: [
      buildDonationNotification({
        dedupeKey: `${notificationTypes.logisticsUpdated}:${currentSubmission.submission_id}:cancelled`,
        title: 'Donation cancelled',
        message: 'You cancelled your current donation. You can start a new donation anytime.',
        createdAt: new Date().toISOString(),
        referenceId: currentSubmission.submission_id,
      }),
    ],
  });

  return {
    success: true,
    submission: submissionResult.data || currentSubmission,
    logistics: logisticsResult.data || null,
  };
};

export const markIndependentDonationShipped = async ({
  userId = null,
  databaseUserId = null,
  submission = null,
  detail = null,
}) => {
  if (!userId || !databaseUserId) {
    return { success: false, error: 'Your session is not ready.' };
  }

  if (!submission?.submission_id) {
    return { success: false, error: 'No active donation record was found.' };
  }

  const qrState = getIndependentDonationQrState({ submission });
  if (!qrState?.is_valid) {
    return { success: false, error: 'Generate the donation QR before marking this parcel as shipped.' };
  }

  const activeDetail = detail || getLatestSubmissionDetailSnapshot(submission);
  const shippedAt = new Date().toISOString();
  const shipmentNote = 'Donor marked the independent hair parcel as shipped and waiting for Hair for Hope staff receiving.';

  const logisticsResult = await upsertSubmissionLogistics({
    submissionId: submission.submission_id,
    logisticsType: 'Ship by Courier',
    shipmentStatus: 'Shipped',
    notes: shipmentNote,
  });

  if (logisticsResult.error) {
    return {
      success: false,
      error: logisticsResult.error.message || 'Unable to update the shipment status.',
    };
  }

  const trackingResult = await createHairBundleTrackingEntry({
    submission_id: submission.submission_id,
    submission_detail_id: activeDetail?.submission_detail_id || null,
    status: 'sent_by_donor',
    title: 'Parcel shipped',
    description: shipmentNote,
    changed_by: databaseUserId,
  });

  if (trackingResult.error) {
    return {
      success: false,
      error: trackingResult.error.message || 'Unable to save the shipped timeline update.',
    };
  }

  const submissionResult = await updateHairSubmissionById(submission.submission_id, {
    status: 'Shipped',
    donation_source: INDEPENDENT_DONATION_SOURCE,
    qr_status: qrState.is_activated ? 'Scanned' : 'Generated',
    qr_generated_at: submission?.qr_generated_at || qrState.generated_at || shippedAt,
    donor_notes: mergeDonationNotes(
      submission?.donor_notes || '',
      ['Donation path: independent donation.', shipmentNote],
      null,
    ),
  });

  if (submissionResult.error) {
    return {
      success: false,
      error: submissionResult.error.message || 'Unable to update the donation after shipment.',
    };
  }

  await persistDonationNotifications({
    userId,
    notifications: [
      buildDonationNotification({
        dedupeKey: `${notificationTypes.logisticsUpdated}:${submission.submission_id}:shipped`,
        title: 'Parcel marked shipped',
        message: 'Your hair parcel is now marked as shipped and waiting for staff receiving.',
        createdAt: shippedAt,
        referenceId: submission.submission_id,
      }),
    ],
  });

  return {
    success: true,
    submission: submissionResult.data || submission,
    logistics: logisticsResult.data || null,
  };
};

/**
 * FAST QR Generation - Returns immediately with QR URL
 * Database sync happens in background (non-blocking)
 */
export const generateIndependentDonationQrFast = async ({
  userId = null,
  submission,
  databaseUserId,
}) => {
  if (!submission?.submission_id) {
    return { success: false, error: 'A valid donation submission is required before generating a QR.' };
  }

  const currentQr = getIndependentDonationQrState({ submission });
  const reference = currentQr?.reference || submission?.donation_reference || `DON-${submission.submission_id}`;
  const qrPayload = buildDonationTrackingQrPayload({
    submission,
    detail: getLatestSubmissionDetailSnapshot(submission),
  });

  // Build QR image URL immediately (no network call)
  const qrImageUrl = buildQrImageUrl(qrPayload, 420);

  // Sync database in background (don't await)
  if (!currentQr?.is_valid) {
    const generatedAt = new Date().toISOString();

    // Fire and forget - don't block UI
    syncIndependentDonationSubmission({
      userId,
      databaseUserId,
      submission,
      status: 'Cut',
      logisticsStatus: 'Pending',
      logisticsNotes: 'Your donation QR is saved and inactive until you scan it to activate donation tracking.',
      trackingStatus: 'waybill_ready',
      trackingTitle: 'Donation QR ready',
      trackingDescription: 'A donation QR was generated for the donor shipment flow and saved to the current donation record.',
      shouldTrack: true,
      shouldNotify: true,
      qrStatus: 'Generated',
      qrGeneratedAt: generatedAt,
    }).catch((err) => {
      // Log background sync errors but don't block
      logAppError('generateIndependentDonationQrFast/backgroundSync', err);
    });
  }

  return {
    success: true,
    qrImageUrl,
    qrPayload,
    reference,
    reused: currentQr?.is_valid,
  };
};

export const ensureHairItemQr = async ({
  submission = null,
  detail = null,
  databaseUserId = null,
}) => {
  if (!submission?.submission_id || !detail?.submission_detail_id) {
    return { success: false, error: 'A saved donation item is required before generating a QR.' };
  }

  if (detail.qr_token && detail.qr_status === 'Generated' && detail.hair_item_code) {
    return {
      success: true,
      detail,
      qrPayload: buildDonationTrackingQrPayload({ submission, detail }),
      reused: true,
    };
  }

  const qrToken = detail.qr_token || createSecureQrToken();
  const hairItemCode = detail.hair_item_code || createHairItemCode(detail.submission_detail_id);
  const qrPayload = getHairItemTrackingUrl(qrToken);
  const generatedAt = new Date().toISOString();

  const updateResult = await updateHairSubmissionDetailById(detail.submission_detail_id, {
    hair_item_code: hairItemCode,
    qr_token: qrToken,
    qr_image_path: buildQrImageUrl(qrPayload, 420),
    qr_status: 'Generated',
    qr_generated_at: generatedAt,
    current_tracking_status: 'QR Generated',
    status: detail.status && detail.status !== 'Draft' ? detail.status : 'QR Generated',
    updated_by: databaseUserId || null,
  });

  if (updateResult.error || !updateResult.data?.submission_detail_id) {
    return {
      success: false,
      error: updateResult.error?.message || 'Unable to generate the hair item QR.',
    };
  }

  const trackingResult = await createHairBundleTrackingEntry({
    submission_id: submission.submission_id,
    submission_detail_id: detail.submission_detail_id,
    status: 'QR Generated',
    title: 'QR Code Generated',
    description: 'QR code was generated for this hair item.',
    changed_by: databaseUserId,
  });

  if (trackingResult.error) {
    return {
      success: false,
      error: trackingResult.error.message || 'Unable to save the QR timeline entry.',
    };
  }

  return {
    success: true,
    detail: updateResult.data,
    qrPayload: buildDonationTrackingQrPayload({ submission, detail: updateResult.data }),
    reused: false,
  };
};

export const ensureIndependentDonationQr = async ({
  userId = null,
  submission,
  databaseUserId,
  donationDriveId = null,
  donorName = '',
}) => {
  if (!submission?.submission_id) {
    return { success: false, error: 'A valid donation submission is required before generating a QR.' };
  }

  if (!Number(donationDriveId || submission?.donation_drive_id || 0)) {
    const logisticsResult = await fetchHairSubmissionLogisticsBySubmissionId(submission.submission_id);
    const logistics = logisticsResult.data || null;
    const isWalkInDonation = matchesAnyToken(logistics?.logistics_type, ['onsite_delivery', 'walk_in', 'walk-in', 'dropoff', 'drop-off']);
    const isPickupDonation = matchesAnyToken(logistics?.logistics_type, ['pickup']);
    if (isWalkInDonation) {
      const appointmentResult = await fetchSalonDonationAppointmentBySubmissionId(submission.submission_id);
      if (appointmentResult.error) {
        return { success: false, error: appointmentResult.error.message || 'Unable to verify your expected walk-in arrival.' };
      }
      if (!appointmentResult.data?.appointment_id) {
        return { success: false, error: 'Confirm your expected drop-off date and arrival time before submitting this donation.' };
      }
    }

    const detailsResult = await fetchHairSubmissionDetailsBySubmissionId(submission.submission_id);
    if (detailsResult.error) {
      return { success: false, error: detailsResult.error.message || 'Unable to load donation hair items.' };
    }

    const details = detailsResult.data || [];
    if (!details.length) {
      return { success: false, error: 'Add at least one hair item before submitting.' };
    }

    const generatedDetails = [];
    for (const detail of details) {
      const ownerError = validateHairOwnerPayload({
        donorType: detail.hair_owner_type === 'Other' ? 'different' : 'own',
        donorName: detail.hair_owner_display_name,
        relationshipToSubmitter: detail.relationship_to_submitter,
        consentConfirmed: detail.consent_confirmed,
      });
      if (ownerError) {
        return { success: false, error: `${detail.hair_item_code || 'Hair item'}: ${ownerError}` };
      }

      if (!Number(detail.declared_length) || !detail.declared_color || !detail.declared_condition) {
        return { success: false, error: `${detail.hair_item_code || 'Hair item'} is missing required hair details.` };
      }

      const qrResult = await ensureHairItemQr({ submission, detail, databaseUserId });
      if (!qrResult.success) {
        return { success: false, error: qrResult.error || 'Unable to generate a hair item QR.' };
      }
      generatedDetails.push(qrResult.detail || detail);
    }

    const submittedAt = new Date().toISOString();
    const submissionResult = await updateHairSubmissionById(submission.submission_id, {
      status: 'Cut',
      submitted_at: submittedAt,
      qr_status: 'Generated',
      qr_generated_at: submittedAt,
      donation_source: submission?.donation_source || 'Independent',
    });

    if (submissionResult.error) {
      return { success: false, error: submissionResult.error.message || 'Unable to submit this independent donation.' };
    }

    for (const detail of generatedDetails) {
      const detailUpdate = await updateHairSubmissionDetailById(detail.submission_detail_id, {
        status: 'Ready for Shipping',
        current_tracking_status: 'Ready for Shipping',
        updated_by: databaseUserId || null,
      });
      if (detailUpdate.error) {
        return { success: false, error: detailUpdate.error.message || 'Unable to update a hair item status.' };
      }
      await createHairBundleTrackingEntry({
        submission_id: submission.submission_id,
        submission_detail_id: detail.submission_detail_id,
        status: 'Ready for Shipping',
        title: 'Hair Item Ready for Shipping',
        description: 'The donor submitted this hair item and should attach the QR before shipping.',
        changed_by: databaseUserId,
      });
    }

    if (!isWalkInDonation) {
      const deliveryNote = isPickupDonation
        ? 'The donor submitted a pickup donation. Pickup scheduling and staff approval are pending.'
        : 'The donor submitted the logistic donation for delivery with the printed waybill QR attached to the outside of the package.';
      const logisticsUpdate = await upsertSubmissionLogistics({
        submissionId: submission.submission_id,
        logisticsType: logistics?.logistics_type || 'Courier',
        shipmentStatus: isPickupDonation ? 'Pending' : 'Shipped',
        notes: deliveryNote,
      });
      if (logisticsUpdate.error) {
        return {
          success: false,
          error: logisticsUpdate.error.message || 'The donation was submitted, but its delivery status could not be saved.',
        };
      }

      const deliveryTrackingResult = await createHairBundleTrackingEntry({
        submission_id: submission.submission_id,
        submission_detail_id: generatedDetails[0]?.submission_detail_id || null,
        status: isPickupDonation ? 'pickup_requested' : 'sent_by_donor',
        title: isPickupDonation ? 'Pickup requested' : 'Donation submitted and sent by donor',
        description: deliveryNote,
        changed_by: databaseUserId,
      });
      if (deliveryTrackingResult.error) {
        return {
          success: false,
          error: deliveryTrackingResult.error.message || 'The donation was submitted, but its delivery timeline could not be saved.',
        };
      }
    }

    await persistDonationNotifications({
      userId,
      notifications: [
        buildDonationNotification({
          dedupeKey: `${notificationTypes.logisticsUpdated}:${submission.submission_id}:independent-submitted`,
          title: 'Donation submitted and waybill ready',
          message: isWalkInDonation
            ? 'Print each QR label, attach it to the donation package, and bring it to your scheduled drop-off.'
            : 'Print each QR label and securely attach it to the outside of the donation package before drop-off or shipment.',
          createdAt: submittedAt,
          referenceId: submission.submission_id,
        }),
      ],
    });

    const finalSubmission = submissionResult.data || submission;
    try {
      await sendDonorQrEmail({
        donorName,
        submission: finalSubmission,
        details: generatedDetails,
        titlePrefix: 'Independent donation QR',
      });
    } catch (error) {
      logAppError('ensureIndependentDonationQr/email', error);
    }

    return {
      success: true,
      qrState: {
        reference: finalSubmission?.donation_reference || submission?.donation_reference || `DON-${submission.submission_id}`,
        generated_at: submittedAt,
        status: 'Generated',
        is_valid: true,
        show_my_qr: true,
      },
      submission: finalSubmission,
      details: generatedDetails,
      reused: false,
    };
  }

  const currentQr = getIndependentDonationQrState({ submission });
  if (currentQr?.is_valid && currentQr.reference) {
    const syncedResult = await syncIndependentDonationSubmission({
      userId,
      databaseUserId,
      submission,
      status: 'Submitted',
      logisticsStatus: currentQr.is_activated ? 'QR Active' : 'Submitted',
      logisticsNotes: currentQr.is_activated
        ? 'Donation submitted and the QR has been scanned by staff.'
        : 'Donation submitted. Attach the generated QR to the parcel or hair bundle for staff scanning.',
      shouldTrack: false,
      shouldNotify: false,
      donationDriveId,
      qrStatus: currentQr.is_activated ? 'Scanned' : 'Generated',
      qrGeneratedAt: submission?.qr_generated_at || currentQr.generated_at || new Date().toISOString(),
    });

    if (!syncedResult.success) {
      return {
        success: false,
        error: syncedResult.error,
      };
    }

    return {
      success: true,
      qrState: currentQr,
      submission: syncedResult.submission || submission,
      reused: true,
    };
  }

  const generatedAt = new Date().toISOString();
  const reference = submission?.donation_reference || `DON-${submission.submission_id}`;

  const syncedResult = await syncIndependentDonationSubmission({
    userId,
    databaseUserId,
    submission,
    status: 'Submitted',
    logisticsStatus: 'Submitted',
    logisticsNotes: 'Donation submitted. QR generated from Hair_Submissions for staff scanning.',
    trackingStatus: 'donation_submitted',
    trackingTitle: 'Donation submitted',
    trackingDescription: 'The donor confirmed the hair submission and generated its QR.',
    shouldTrack: true,
    shouldNotify: true,
    donationDriveId,
    qrStatus: 'Generated',
    qrGeneratedAt: generatedAt,
  });

  if (!syncedResult.success) {
    return {
      success: false,
      error: syncedResult.error || 'The QR could not be generated right now.',
    };
  }

  const nextQrState = getIndependentDonationQrState({ submission: syncedResult.submission });
  if (!nextQrState?.reference) {
    const fallbackQrState = {
      reference,
      generated_at: generatedAt,
      activated_at: '',
      version: 1,
      status: 'inactive',
      is_activated: false,
      is_inactive: true,
      is_pending: true,
      is_expired: false,
      is_valid: true,
      show_my_qr: true,
      upload_unlocked: false,
    };

    return {
      success: true,
      qrState: fallbackQrState,
      submission: syncedResult.submission || submission,
      reused: false,
    };
  }

  return {
    success: true,
    qrState: nextQrState,
    submission: syncedResult.submission,
    reused: false,
  };
};

export const submitDonationForStaffWaybill = async ({
  userId = null,
  submission,
  databaseUserId,
  donationDriveId = null,
}) => {
  if (!submission?.submission_id) {
    return { success: false, error: 'A valid donation submission is required before submitting.' };
  }
  const isEventDonation = Number(donationDriveId || submission?.donation_drive_id) > 0;

  const syncedResult = await syncIndependentDonationSubmission({
    userId,
    databaseUserId,
    submission,
    status: 'Submitted',
    logisticsStatus: isEventDonation ? 'Pending' : 'Submitted',
    logisticsNotes: isEventDonation
      ? 'Hair donation details are linked to this event. Waiting for Hair for Hope receiving update.'
      : 'Donation submitted. Waiting for staff to issue the waybill QR from the website.',
    trackingStatus: isEventDonation ? '' : 'donation_submitted',
    trackingTitle: isEventDonation ? '' : 'Donation submitted',
    trackingDescription: isEventDonation ? '' : 'The donor confirmed the hair submission. Waybill QR will be provided by staff.',
    shouldTrack: !isEventDonation,
    shouldNotify: true,
    donationDriveId,
    qrStatus: submission?.qr_status || 'Pending Staff QR',
    qrGeneratedAt: submission?.qr_generated_at || undefined,
  });

  if (!syncedResult.success) {
    return {
      success: false,
      error: syncedResult.error || 'Unable to submit donation right now.',
    };
  }

  return {
    success: true,
    submission: syncedResult.submission || submission,
    logistics: syncedResult.logistics || null,
  };
};

export const startIndependentDonationDraft = async ({
  userId = null,
  submission,
  databaseUserId,
  donationDriveId = null,
  logisticsMethod = 'shipping',
}) => {
  const logisticsType = resolveIndependentLogisticsType(logisticsMethod);
  if (!logisticsType) {
    return {
      success: false,
      error: 'Request Pickup is no longer available. Choose Walk-in Drop-off or Ship by Courier.',
    };
  }
  if (logisticsType === 'Walk-in Drop-off') {
    return {
      success: false,
      error: 'Choose and confirm an open walk-in date and expected arrival time before creating a logistics donation.',
    };
  }
  const isDropoffDraft = false;

  if (!submission?.submission_id) {
    if (Number(donationDriveId) > 0) {
      return {
        success: false,
        error: 'Event donation starts only after staff checks in the donor as present.',
      };
    }
    if (!userId || !databaseUserId) {
      return { success: false, error: 'Your session is not ready.' };
    }

    return {
      success: false,
      error: 'Confirm the courier delivery method before creating a logistics donation.',
    };

  }

  const syncedResult = await syncIndependentDonationSubmission({
    userId,
    databaseUserId,
    submission,
    status: 'Draft',
    logisticsStatus: isDropoffDraft ? null : 'Pending',
    logisticsNotes: isDropoffDraft
      ? 'Walk-in drop-off draft saved. Confirm an expected arrival before submitting.'
      : 'Independent donation draft saved. Add hair items and generate each QR before submitting.',
    trackingStatus: 'Draft',
    trackingTitle: isDropoffDraft ? 'Walk-in drop-off draft saved' : 'Independent donation draft saved',
    trackingDescription: isDropoffDraft
      ? 'The donor started a walk-in drop-off donation and still needs to confirm an expected arrival.'
      : 'The donor started an independent donation transaction.',
    shouldTrack: true,
    shouldNotify: false,
    donationDriveId: donationDriveId || null,
    logisticsType,
  });

  if (!syncedResult.success) {
    return {
      success: false,
      error: syncedResult.error || 'Could not start donation flow right now.',
    };
  }

  return {
    success: true,
    submission: syncedResult.submission || submission,
    logistics: syncedResult.logistics || null,
  };
};

export const activateIndependentDonationQr = async ({
  userId = null,
  submission,
  databaseUserId,
}) => {
  if (!submission?.submission_id) {
    return { success: false, error: 'A valid donation submission is required before activation.' };
  }

  const currentMetadata = getIndependentQrMetadata(submission);
  if (!currentMetadata?.reference) {
    return { success: false, error: 'A valid QR is required before activation.' };
  }

  if (currentMetadata.is_activated) {
    return {
      success: true,
      qrState: getIndependentDonationQrState({ submission }),
      submission,
      alreadyActivated: true,
    };
  }

  const activatedAt = new Date().toISOString();
  const syncedResult = await syncIndependentDonationSubmission({
    userId,
    databaseUserId,
    submission,
    status: 'Cut',
    logisticsStatus: 'Pending',
    logisticsNotes: 'Your donation QR is active and ready for shipment tracking.',
    trackingStatus: 'waybill_ready',
    trackingTitle: 'Donation QR activated',
    trackingDescription: 'The donor scanned the saved donation QR and activated donation tracking.',
    shouldTrack: true,
    shouldNotify: true,
    qrStatus: 'Scanned',
    qrGeneratedAt: submission?.qr_generated_at || currentMetadata.generated_at || activatedAt,
  });

  if (!syncedResult.success) {
    return {
      success: false,
      error: syncedResult.error || 'The QR could not be activated right now.',
    };
  }

  return {
    success: true,
    qrState: getIndependentDonationQrState({ submission: syncedResult.submission }),
    submission: syncedResult.submission,
    alreadyActivated: false,
  };
};

export const activateIndependentDonationQrByScan = async ({
  userId = null,
  submission,
  databaseUserId,
  scannedPayload = '',
}) => {
  if (!submission?.submission_id) {
    return { success: false, error: 'A valid donation submission is required before activation.' };
  }

  const currentMetadata = getIndependentQrMetadata(submission);
  if (!currentMetadata?.reference) {
    return { success: false, error: 'No saved donation QR is available for this donation flow.' };
  }

  const scannedQr = parseDonationTrackingQrPayload(scannedPayload);
  if (!scannedQr.donation_reference) {
    return { success: false, error: 'The scanned code is not a valid Donivra donation QR.' };
  }

  if (
    scannedQr.donation_reference !== submission.donation_reference
    || (scannedQr.submission_id && Number(scannedQr.submission_id) !== Number(submission.submission_id))
  ) {
    return { success: false, error: 'The scanned QR does not match your current donation.' };
  }

  return await activateIndependentDonationQr({
    userId,
    submission,
    databaseUserId,
  });
};

export const addDonationBundleFromAnalysis = async ({
  userId = null,
  databaseUserId = null,
  submission = null,
  screening = null,
  referenceDetail = null,
  donorType = 'own',
  donorName = '',
  donorBirthdate = '',
  donorAge = null,
  donorIsMinor = null,
  relationshipToSubmitter = '',
  consentConfirmed = false,
}) => {
  if (!userId || !databaseUserId) {
    return { success: false, error: 'Your session is not ready.' };
  }
  if (!submission?.submission_id) {
    return { success: false, error: 'No active donation record found.' };
  }
  if (!screening) {
    return { success: false, error: 'No hair analysis result is available for bundle attachment.' };
  }
  if (!screening?.ai_screening_id) {
    return { success: false, error: 'A saved Hair Analysis is required for this donation.' };
  }
  const eligibilityResult = await fetchCurrentHairEligibility(screening.ai_screening_id);
  if (eligibilityResult.error || !eligibilityResult.data?.isQualified) {
    return {
      success: false,
      error: eligibilityResult.error?.message
        || eligibilityResult.data?.reason
        || 'This Hair Analysis does not satisfy the current donation requirements.',
    };
  }
  const ownerError = validateHairOwnerPayload({
    donorType,
    donorName,
    relationshipToSubmitter,
    consentConfirmed,
  });
  if (ownerError) {
    return { success: false, error: ownerError };
  }
  const ownerPayload = normalizeHairOwnerPayload({
    donorType,
    donorName,
    relationshipToSubmitter,
    consentConfirmed,
  });

  const detailNotes = buildAdditionalBundleNotes({
    donorType,
    inputMethod: 'scan',
    detailNotes: screening?.summary || '',
    donorName,
    donorBirthdate,
    donorAge,
    donorIsMinor,
  });

  const detailResult = await createHairSubmissionDetail({
    submission_id: submission.submission_id,
    declared_length: referenceDetail?.declared_length ?? null,
    declared_color: referenceDetail?.declared_color || null,
    declared_texture: referenceDetail?.declared_texture || null,
    declared_density: referenceDetail?.declared_density || null,
    declared_condition: referenceDetail?.declared_condition || 'Pending donation verification',
    is_chemically_treated: referenceDetail?.is_chemically_treated ?? false,
    is_colored: referenceDetail?.is_colored ?? false,
    is_bleached: referenceDetail?.is_bleached ?? false,
    is_rebonded: referenceDetail?.is_rebonded ?? false,
    detail_notes: detailNotes,
    input_method: 'Donation verification',
    ...ownerPayload,
    status: 'Draft',
    current_tracking_status: 'Draft',
    updated_by: databaseUserId,
  });

  if (detailResult.error || !detailResult.data?.submission_detail_id) {
    return {
      success: false,
      error: detailResult.error?.message || 'Unable to add the scanned bundle right now.',
    };
  }

  const qrResult = await ensureHairItemQr({
    submission,
    detail: detailResult.data,
    databaseUserId,
  });

  if (!qrResult.success) {
    return {
      success: false,
      error: qrResult.error || 'Hair item was saved but QR generation failed.',
    };
  }

  const submissionResult = await updateHairSubmissionById(submission.submission_id, {
    ai_screening_id: screening.ai_screening_id,
    status: 'Draft',
    donation_source: submission?.donation_source || 'Independent',
    donor_notes: mergeDonationNotes(
      submission?.donor_notes || '',
      [
        `Added bundle via scan (${donorType === 'different' ? 'different donor' : 'own hair'}).`,
      ],
      null,
    ),
  });

  if (submissionResult.error) {
    return {
      success: false,
      error: submissionResult.error?.message || 'Bundle was added but donation summary could not be refreshed.',
    };
  }

  const trackingResult = await createHairBundleTrackingEntry({
    submission_id: submission.submission_id,
    submission_detail_id: detailResult.data.submission_detail_id,
    status: 'QR Generated',
    title: 'Hair item added',
    description: donorType === 'different'
      ? 'A hair item from another person was added using hair analysis.'
      : 'A hair item from the donor was added using hair analysis.',
    changed_by: databaseUserId,
  });

  if (trackingResult.error) {
    return {
      success: false,
      error: trackingResult.error.message || 'Unable to update the donation timeline after adding a bundle.',
    };
  }

  return {
    success: true,
    submission: submissionResult.data || submission,
    detail: qrResult.detail || detailResult.data,
  };
};

export const addDonationBundleFromManualDetails = async ({
  userId = null,
  databaseUserId = null,
  submission = null,
  manualDetails = null,
  photo = null,
  donorType = 'different',
}) => {
  if (!userId || !databaseUserId) {
    return { success: false, error: 'Your session is not ready.' };
  }
  if (!submission?.submission_id) {
    return { success: false, error: 'No active donation record found.' };
  }
  if (!manualDetails) {
    return { success: false, error: 'Manual bundle details are required.' };
  }
  if (!photo) {
    return { success: false, error: 'Please upload a clear bundle photo before saving.' };
  }
  const ownerError = validateHairOwnerPayload({
    donorType,
    donorName: manualDetails?.donor_name,
    relationshipToSubmitter: manualDetails?.relationship_to_submitter,
    consentConfirmed: manualDetails?.consent_confirmed,
  });
  if (ownerError) {
    return { success: false, error: ownerError };
  }

  const normalizedLengthInches = convertLengthToInches(manualDetails?.length_value, manualDetails?.length_unit);
  if (!normalizedLengthInches || normalizedLengthInches <= 0) {
    return { success: false, error: 'Enter a valid hair length for the additional bundle.' };
  }

  const detailNotes = buildAdditionalBundleNotes({
    donorType,
    inputMethod: 'manual',
    detailNotes: buildManualDonationNotes({
      manualDetails: {
        ...manualDetails,
        bundle_quantity: 1,
      },
      evaluation: null,
      donorType,
    }),
    donorName: manualDetails?.donor_name || '',
    donorBirthdate: manualDetails?.donor_birthdate || '',
    donorAge: manualDetails?.donor_age ?? null,
    donorIsMinor: manualDetails?.donor_is_minor ?? null,
  });

  const detailResult = await createHairSubmissionDetail({
    submission_id: submission.submission_id,
    declared_length: normalizedLengthInches,
    declared_color: manualDetails?.hair_color || null,
    declared_texture: manualDetails?.texture || null,
    declared_density: manualDetails?.density || null,
    declared_condition: donorType === 'different' ? 'Other person hair' : 'Own hair',
    is_chemically_treated: normalizeYesNoChoice(manualDetails?.treated),
    is_colored: normalizeYesNoChoice(manualDetails?.colored),
    is_bleached: false,
    is_rebonded: false,
    detail_notes: detailNotes,
    input_method: 'Manual',
    ...normalizeHairOwnerPayload({
      donorType,
      donorName: manualDetails?.donor_name,
      relationshipToSubmitter: manualDetails?.relationship_to_submitter,
      consentConfirmed: manualDetails?.consent_confirmed,
    }),
    status: 'Draft',
    current_tracking_status: 'Draft',
    updated_by: databaseUserId,
  });

  if (detailResult.error || !detailResult.data?.submission_detail_id) {
    return {
      success: false,
      error: detailResult.error?.message || 'Unable to save manual bundle details right now.',
    };
  }

  const uploadPayload = await getPhotoUploadPayload(photo);
  const filePath = `${userId}/${submission.submission_id}/bundle-${detailResult.data.submission_detail_id}-${Date.now()}.jpg`;
  const uploadResult = await uploadHairSubmissionImage({
    path: filePath,
    fileBody: uploadPayload.fileBody,
    contentType: uploadPayload.contentType,
    bucket: hairSubmissionStorageBucket,
  });

  if (uploadResult.error) {
    return {
      success: false,
      error: uploadResult.error.message || 'Unable to upload the additional bundle photo right now.',
    };
  }

  const imageInsertResult = await createHairSubmissionImages([{
    submission_detail_id: detailResult.data.submission_detail_id,
    file_path: filePath,
    image_type: 'manual_donation_hair_photo',
  }]);

  if (imageInsertResult.error) {
    return {
      success: false,
      error: imageInsertResult.error.message || 'Unable to save the additional bundle photo record.',
    };
  }

  const qrResult = await ensureHairItemQr({
    submission,
    detail: detailResult.data,
    databaseUserId,
  });

  if (!qrResult.success) {
    return {
      success: false,
      error: qrResult.error || 'Bundle was saved but QR generation failed.',
    };
  }

  const submissionResult = await updateHairSubmissionById(submission.submission_id, {
    status: 'Draft',
    donation_source: submission?.donation_source || 'Independent',
    donor_notes: mergeDonationNotes(
      submission?.donor_notes || '',
      [
        `Added bundle via manual entry (${donorType === 'different' ? 'different donor' : 'own hair'}).`,
      ],
      null,
    ),
  });

  if (submissionResult.error) {
    return {
      success: false,
      error: submissionResult.error?.message || 'Bundle was added but donation summary could not be refreshed.',
    };
  }

  const trackingResult = await createHairBundleTrackingEntry({
    submission_id: submission.submission_id,
    submission_detail_id: detailResult.data.submission_detail_id,
    status: 'QR Generated',
    title: 'Hair item added',
    description: donorType === 'different'
      ? 'An additional bundle from a different donor was added using manual details.'
      : 'An additional bundle from the donor was added using manual details.',
    changed_by: databaseUserId,
  });

  if (trackingResult.error) {
    return {
      success: false,
      error: trackingResult.error.message || 'Unable to update the donation timeline after adding a bundle.',
    };
  }

  await persistDonationNotifications({
    userId,
    notifications: [
      buildDonationNotification({
        dedupeKey: `${notificationTypes.logisticsUpdated}:${submission.submission_id}:bundle-added:${detailResult.data.submission_detail_id}`,
        title: 'Additional bundle added',
        message: donorType === 'different'
          ? 'A bundle from a different donor was added to this donation package.'
          : 'An additional donor bundle was added to this donation package.',
        createdAt: new Date().toISOString(),
        referenceId: submission.submission_id,
      }),
    ],
  });

  return {
    success: true,
    submission: submissionResult.data || submission,
    detail: qrResult.detail || detailResult.data,
  };
};

export const updateManualDonationDetail = async ({
  userId = null,
  databaseUserId = null,
  submission = null,
  detail = null,
  manualDetails = null,
  photo = null,
  donorType = 'own',
  donationRequirement = null,
}) => {
  if (!userId || !databaseUserId) {
    return { success: false, error: 'Your session is not ready.' };
  }
  if (!submission?.submission_id || !detail?.submission_detail_id) {
    return { success: false, error: 'No saved hair detail was found to edit.' };
  }
  if (!manualDetails) {
    return { success: false, error: 'Manual hair details are required.' };
  }

  const evaluation = evaluateManualDonationEligibility({
    manualDetails,
    donationRequirement,
  });
  const ownerError = validateHairOwnerPayload({
    donorType,
    donorName: manualDetails?.donor_name,
    relationshipToSubmitter: manualDetails?.relationship_to_submitter,
    consentConfirmed: manualDetails?.consent_confirmed,
  });
  if (ownerError) {
    return { success: false, error: ownerError };
  }
  const detailNotes = buildManualDonationNotes({ manualDetails, evaluation, donorType });
  const detailResult = await updateHairSubmissionDetailById(detail.submission_detail_id, {
    declared_length: evaluation.normalized_length_inches,
    declared_color: manualDetails?.hair_color || null,
    declared_texture: manualDetails?.texture || null,
    declared_density: manualDetails?.density || null,
    declared_condition: donorType === 'different'
      ? 'Other person hair'
      : (evaluation.isQualified ? 'Ready for donation' : (evaluation.reason || 'Needs review')),
    is_chemically_treated: normalizeYesNoChoice(manualDetails?.treated),
    is_colored: normalizeYesNoChoice(manualDetails?.colored),
    is_bleached: false,
    is_rebonded: false,
    detail_notes: detailNotes,
    input_method: 'Manual',
    ...normalizeHairOwnerPayload({
      donorType,
      donorName: manualDetails?.donor_name,
      relationshipToSubmitter: manualDetails?.relationship_to_submitter,
      consentConfirmed: manualDetails?.consent_confirmed,
    }),
    status: detail?.qr_token ? 'QR Generated' : 'Draft',
    current_tracking_status: detail?.qr_token ? 'QR Generated' : 'Draft',
    updated_by: databaseUserId,
  });

  if (detailResult.error || !detailResult.data?.submission_detail_id) {
    return {
      success: false,
      error: detailResult.error?.message || 'Unable to update this hair detail right now.',
    };
  }

  if (photo) {
    const uploadPayload = await getPhotoUploadPayload(photo);
    const filePath = `${userId}/${submission.submission_id}/manual-hair-edit-${detail.submission_detail_id}-${Date.now()}.jpg`;
    const uploadResult = await uploadHairSubmissionImage({
      path: filePath,
      fileBody: uploadPayload.fileBody,
      contentType: uploadPayload.contentType,
      bucket: hairSubmissionStorageBucket,
    });

    if (uploadResult.error) {
      return {
        success: false,
        error: uploadResult.error.message || 'Hair details were updated but the new photo could not be uploaded.',
      };
    }

    const imageInsertResult = await createHairSubmissionImages([{
      submission_detail_id: detail.submission_detail_id,
      file_path: filePath,
      image_type: MANUAL_HAIR_PHOTO_IMAGE_TYPE,
    }]);

    if (imageInsertResult.error) {
      return {
        success: false,
        error: imageInsertResult.error.message || 'Hair details were updated but the new photo record could not be saved.',
      };
    }
  }

  const qrResult = await ensureHairItemQr({
    submission,
    detail: detailResult.data,
    databaseUserId,
  });

  if (!qrResult.success) {
    return {
      success: false,
      error: qrResult.error || 'Hair detail was updated but QR generation failed.',
    };
  }

  const submissionResult = await updateHairSubmissionById(submission.submission_id, {
    donor_notes: mergeDonationNotes(
      submission?.donor_notes || '',
      [
        'Manual hair donation details edited from the donor Donations module.',
        detailNotes,
      ],
      null,
    ),
    status: submission?.donation_drive_id ? 'Pending' : 'Draft',
  });

  if (submissionResult.error) {
    return {
      success: false,
      error: submissionResult.error?.message || 'Hair detail was updated but the donation record could not be refreshed.',
    };
  }

  await createHairBundleTrackingEntry({
    submission_id: submission.submission_id,
    submission_detail_id: detail.submission_detail_id,
    status: 'waybill_ready',
    title: 'Hair details edited',
    description: 'The donor updated the saved hair donation details before QR submission.',
    changed_by: databaseUserId,
  });

  return {
    success: true,
    canProceed: evaluation.isQualified,
    qualification: evaluation,
    submission: submissionResult.data || submission,
    detail: qrResult.detail || detailResult.data,
  };
};

export const saveManualDonationQualification = async ({
  userId,
  databaseUserId,
  donorType = 'own',
  donationDriveId = null,
  recipientType = 'organization',
  recipientPatientId = null,
  manualDetails,
  photo,
  donationRequirement = null,
}) => {
  if (!userId || !databaseUserId) {
    return { success: false, error: 'Your session is not ready.' };
  }

  if (!photo) {
    return { success: false, error: 'Please upload or capture a hair photo before continuing.' };
  }

  const permission = await canSubmitHairDonation(databaseUserId);
  if (!permission.allowed) {
    return {
      success: false,
      error: mapDonationPermissionError(permission.reason),
      errorCode: permission.reason,
    };
  }

  const evaluation = evaluateManualDonationEligibility({
    manualDetails,
    donationRequirement,
  });
  const ownerError = validateHairOwnerPayload({
    donorType,
    donorName: manualDetails?.donor_name,
    relationshipToSubmitter: manualDetails?.relationship_to_submitter,
    consentConfirmed: manualDetails?.consent_confirmed,
  });
  if (ownerError) {
    return { success: false, error: ownerError };
  }
  const submissionNotes = buildManualDonationNotes({ manualDetails, evaluation, donorType });
  const uploadPayload = await getPhotoUploadPayload(photo);

  const screeningResult = await fetchLatestCurrentlyEligibleScreening(databaseUserId);
  if (screeningResult.error || !screeningResult.data?.ai_screening_id) {
    return {
      success: false,
      error: screeningResult.error?.message || 'Pass Hair Analysis before starting a donation.',
    };
  }

  if (!donationDriveId) {
    const existingSubmissionsResult = await fetchHairSubmissionSummariesByUserId(databaseUserId, 50);
    if (existingSubmissionsResult.error) {
      return {
        success: false,
        error: existingSubmissionsResult.error.message || 'Unable to verify the selected hair screening.',
      };
    }
    const screeningAlreadyInUse = (existingSubmissionsResult.data || []).some((candidate) => (
      Number(candidate?.ai_screening_id) === Number(screeningResult.data.ai_screening_id)
      && !['cancelled', 'canceled'].includes(String(candidate?.status || '').trim().toLowerCase())
    ));
    if (screeningAlreadyInUse) {
      return {
        success: false,
        error: 'This eligible hair screening is already attached to an active donation.',
      };
    }
  }

  let submissionResult;
  if (donationDriveId) {
    submissionResult = await fetchHairSubmissionForEventByUserId({
      userId: databaseUserId,
      eventRequestId: donationDriveId,
    });
    if (!submissionResult.data?.submission_id) {
      return {
        success: false,
        error: 'Event donation starts only after staff checks in the donor as present.',
      };
    }
  } else {
    submissionResult = await createHairSubmission({
      user_id: userId,
      database_user_id: databaseUserId,
      ai_screening_id: screeningResult.data.ai_screening_id,
      donation_drive_id: null,
      donation_reference: createDonationReference('MAN'),
      donation_source: 'Independent',
      donor_notes: submissionNotes,
      guardian_consent_id: permission.guardianConsentId || null,
      donor_age_at_submission: permission.donorAge,
      consent_checked_at: new Date().toISOString(),
      recipient_type: recipientType === 'patient' ? 'Patient' : 'Organization',
      recipient_patient_id: recipientType === 'patient' ? Number(recipientPatientId || 0) || null : null,
      status: 'Draft',
    });
  }

  if (submissionResult.error || !submissionResult.data?.submission_id) {
    return {
      success: false,
      error: submissionResult.error?.message || 'Unable to save manual donor details right now.',
    };
  }

  const detailResult = await createHairSubmissionDetail({
    submission_id: submissionResult.data.submission_id,
    declared_length: evaluation.normalized_length_inches,
    declared_color: manualDetails?.hair_color || null,
    declared_texture: null,
    declared_density: manualDetails?.density || null,
    declared_condition: donorType === 'different'
      ? 'Other person hair'
      : (evaluation.isQualified ? 'Ready for donation' : (evaluation.reason || 'Needs review')),
    is_chemically_treated: normalizeYesNoChoice(manualDetails?.treated),
    is_colored: normalizeYesNoChoice(manualDetails?.colored),
    is_bleached: false,
    is_rebonded: false,
    detail_notes: submissionNotes,
    input_method: 'Manual',
    ...normalizeHairOwnerPayload({
      donorType,
      donorName: manualDetails?.donor_name,
      relationshipToSubmitter: manualDetails?.relationship_to_submitter,
      consentConfirmed: manualDetails?.consent_confirmed,
    }),
    status: 'Draft',
    current_tracking_status: 'Draft',
    updated_by: databaseUserId,
  });

  if (detailResult.error || !detailResult.data?.submission_detail_id) {
    return {
      success: false,
      error: detailResult.error?.message || 'Unable to save manual donor details right now.',
    };
  }

  const filePath = `${userId}/${submissionResult.data.submission_id}/manual-hair-${detailResult.data.submission_detail_id}-${Date.now()}.jpg`;
  const uploadResult = await uploadHairSubmissionImage({
    path: filePath,
    fileBody: uploadPayload.fileBody,
    contentType: uploadPayload.contentType,
    bucket: hairSubmissionStorageBucket,
  });

  if (uploadResult.error) {
    return {
      success: false,
      error: uploadResult.error.message || 'Unable to upload the manual hair photo right now.',
    };
  }

  const imageInsertResult = await createHairSubmissionImages([{
    submission_detail_id: detailResult.data.submission_detail_id,
    file_path: filePath,
    image_type: MANUAL_HAIR_PHOTO_IMAGE_TYPE,
  }]);

  if (imageInsertResult.error) {
    return {
      success: false,
      error: imageInsertResult.error.message || 'Unable to save the manual hair photo record.',
    };
  }

  const qrResult = !donationDriveId
    ? await ensureHairItemQr({
      submission: submissionResult.data,
      detail: detailResult.data,
      databaseUserId,
    })
    : { success: true, detail: detailResult.data };

  if (!qrResult.success) {
    return {
      success: false,
      error: qrResult.error || 'Hair item was saved but QR generation failed.',
    };
  }

  const trackingResult = await createHairBundleTrackingEntry({
    submission_id: submissionResult.data.submission_id,
    submission_detail_id: detailResult.data.submission_detail_id,
    status: donationDriveId ? 'waybill_ready' : 'QR Generated',
    title: 'Manual donor details saved',
    description: [
      evaluation.reason,
      donorType === 'different'
        ? `Hair owner: ${manualDetails?.donor_name || 'Other person'}`
        : 'Hair owner: Account owner',
      'Hair photo uploaded from the donor Donations module.',
    ].filter(Boolean).join(' '),
    changed_by: databaseUserId,
  });

  if (trackingResult.error) {
    return {
      success: false,
      error: trackingResult.error.message || 'Unable to save the donation log entry for manual donor details.',
    };
  }

  await persistDonationNotifications({
    userId,
    notifications: buildImmediateNotificationEvents({
      role: 'donor',
      payload: {
        submission: submissionResult.data,
      },
    }),
  });

  return {
    success: true,
    canProceed: evaluation.isQualified,
    qualification: evaluation,
    submission: submissionResult.data,
    detail: qrResult.detail || detailResult.data,
  };
};

export const linkDonationRecipient = async ({
  submission,
  databaseUserId,
  recipientType = 'organization',
  recipientPatientId = null,
}) => {
  if (!submission?.submission_id) {
    return { success: false, error: 'A saved donation is required before setting recipient.' };
  }

  const normalizedRecipientType = recipientType === 'patient' ? 'Patient' : 'Organization';
  const normalizedRecipientPatientId = normalizedRecipientType === 'Patient'
    ? Number(recipientPatientId || 0) || null
    : null;
  const noChange = (
    String(submission?.recipient_type || '').trim().toLowerCase() === normalizedRecipientType.toLowerCase()
    && Number(submission?.recipient_patient_id || 0) === Number(normalizedRecipientPatientId || 0)
  );

  if (noChange) {
    return { success: true, submission };
  }

  const submissionResult = await updateHairSubmissionById(submission.submission_id, {
    recipient_type: normalizedRecipientType,
    recipient_patient_id: normalizedRecipientPatientId,
  });

  if (submissionResult.error || !submissionResult.data?.submission_id) {
    return {
      success: false,
      error: submissionResult.error?.message || 'Unable to save recipient referral.',
    };
  }

  await createHairBundleTrackingEntry({
    submission_id: submission.submission_id,
    submission_detail_id: null,
    status: 'recipient_linked',
    title: normalizedRecipientType === 'Patient' ? 'Patient referral linked' : 'Organization recipient selected',
    description: normalizedRecipientType === 'Patient'
      ? `Recipient patient ID ${normalizedRecipientPatientId} was linked to this donation.`
      : 'Donation recipient is the partner organization.',
    changed_by: databaseUserId || null,
  });

  return { success: true, submission: submissionResult.data };
};

const normalizeItemStatus = (status = '') => String(status || '').trim().toLowerCase();

export const recalculateSubmissionStatus = async (submissionId) => {
  const detailsResult = await fetchHairSubmissionDetailsBySubmissionId(submissionId);
  if (detailsResult.error) {
    return { success: false, error: detailsResult.error.message || 'Unable to load hair items.' };
  }

  const details = detailsResult.data || [];
  if (!details.length) {
    return { success: true, status: 'Draft' };
  }

  const statuses = details.map((detail) => normalizeItemStatus(detail.current_tracking_status || detail.status));
  const every = (tokens) => statuses.every((status) => tokens.some((token) => status.includes(token)));
  const some = (tokens) => statuses.some((status) => tokens.some((token) => status.includes(token)));
  const allResolved = statuses.every((status) => status.includes('accepted') || status.includes('rejected'));

  let nextStatus = 'Draft';
  if (every(['draft'])) nextStatus = 'Draft';
  else if (every(['ready for shipping'])) nextStatus = 'Submitted';
  else if (some(['shipped']) && !some(['received', 'accepted', 'rejected'])) nextStatus = 'In Transit';
  else if (some(['received']) && !every(['received', 'under qa review', 'accepted', 'rejected'])) nextStatus = 'Partially Received';
  else if (every(['received', 'under qa review']) && !some(['accepted', 'rejected'])) nextStatus = 'Under Review';
  else if (some(['accepted']) && some(['rejected'])) nextStatus = 'Partially Accepted';
  else if (some(['accepted']) && !allResolved) nextStatus = 'Partially Accepted';
  else if (every(['accepted'])) nextStatus = 'Accepted';
  else if (every(['rejected'])) nextStatus = 'Rejected';
  else if (allResolved && some(['accepted'])) nextStatus = some(['rejected']) ? 'Partially Accepted' : 'Accepted';
  else if (some(['under qa review', 'received'])) nextStatus = 'Under Review';
  else if (some(['ready for shipping', 'qr generated'])) nextStatus = 'Submitted';

  const updateResult = await updateHairSubmissionById(submissionId, {
    status: nextStatus,
  });

  if (updateResult.error) {
    return { success: false, error: updateResult.error.message || 'Unable to update parent donation status.' };
  }

  return {
    success: true,
    status: nextStatus,
    submission: updateResult.data,
  };
};

const buildHairItemStatusCopy = (status = '', reason = '') => {
  const normalized = normalizeItemStatus(status);
  if (normalized.includes('received')) {
    return {
      title: 'Hair item received',
      description: 'Hair for Hope received this hair item.',
    };
  }
  if (normalized.includes('under qa')) {
    return {
      title: 'Hair item under QA review',
      description: 'This hair item is being assessed by QA_Stylist.',
    };
  }
  if (normalized.includes('accepted')) {
    return {
      title: 'Hair item accepted',
      description: 'This hair item was accepted by QA_Stylist.',
    };
  }
  if (normalized.includes('rejected')) {
    return {
      title: 'Hair item rejected',
      description: `This hair item was rejected.${reason ? ` Reason: ${reason}` : ''}`,
    };
  }
  if (normalized.includes('missing')) {
    return {
      title: 'Hair item marked missing',
      description: 'This hair item was marked missing during QR scanning.',
    };
  }
  if (normalized.includes('shipped')) {
    return {
      title: 'Hair item shipped',
      description: 'This hair item was included in the submitted shipment.',
    };
  }
  return {
    title: 'Hair item status updated',
    description: `This hair item status was updated to ${status}.`,
  };
};

export const updateHairItemStatus = async (submissionDetailId, newStatus, reason = '', changedBy = null) => {
  const detailResult = await fetchHairSubmissionDetailById(submissionDetailId);
  if (detailResult.error || !detailResult.data?.submission_detail_id) {
    return { success: false, error: detailResult.error?.message || 'Hair item was not found.' };
  }

  const detail = detailResult.data;
  const submissionResult = await fetchHairSubmissionById(detail.submission_id);
  if (submissionResult.error || !submissionResult.data?.submission_id) {
    return { success: false, error: submissionResult.error?.message || 'Parent donation was not found.' };
  }

  const isRejected = normalizeItemStatus(newStatus).includes('rejected');
  if (isRejected && !String(reason || '').trim()) {
    return { success: false, error: 'Rejection reason is required.' };
  }

  const updateResult = await updateHairSubmissionDetailById(submissionDetailId, {
    status: newStatus,
    current_tracking_status: newStatus,
    rejection_reason: isRejected ? reason : null,
    updated_by: changedBy || null,
  });

  if (updateResult.error) {
    return { success: false, error: updateResult.error.message || 'Unable to update hair item status.' };
  }

  const copy = buildHairItemStatusCopy(newStatus, reason);
  const trackingResult = await createHairBundleTrackingEntry({
    submission_id: detail.submission_id,
    submission_detail_id: submissionDetailId,
    status: newStatus,
    title: copy.title,
    description: copy.description,
    changed_by: changedBy,
  });

  if (trackingResult.error) {
    return { success: false, error: trackingResult.error.message || 'Unable to save hair item timeline.' };
  }

  const detailDisplay = getHairItemDisplayName(updateResult.data, updateResult.data?.submission_detail_id);
  const parentSubmission = submissionResult.data;
  await persistDonationNotifications({
    userId: parentSubmission.user_id,
    notifications: [
      buildDonationNotification({
        dedupeKey: `${notificationTypes.logisticsUpdated}:${submissionDetailId}:${normalizeItemStatus(newStatus)}:${Date.now()}`,
        title: normalizeItemStatus(newStatus).includes('accepted')
          ? `Hair item accepted: ${updateResult.data?.hair_item_code || submissionDetailId}`
          : normalizeItemStatus(newStatus).includes('rejected')
            ? `Hair item rejected: ${updateResult.data?.hair_item_code || submissionDetailId}`
            : `Hair item update: ${updateResult.data?.hair_item_code || submissionDetailId}`,
        message: normalizeItemStatus(newStatus).includes('rejected')
          ? `Your hair item "${detailDisplay}" was rejected. Reason: ${reason}`
          : `Your hair item "${detailDisplay}" is now ${newStatus}.`,
        referenceId: parentSubmission.submission_id,
      }),
    ],
  });

  const statusResult = await recalculateSubmissionStatus(detail.submission_id);
  await updateHairSubmissionLogisticsItemsByDetailIds({
    submissionDetailIds: [submissionDetailId],
    itemLogisticsStatus: newStatus,
    lastScannedAt: new Date().toISOString(),
    receivedAt: normalizeItemStatus(newStatus).includes('received') ? new Date().toISOString() : null,
    receivedBy: changedBy || null,
  });

  return {
    success: true,
    detail: updateResult.data,
    submission: statusResult.submission || parentSubmission,
  };
};

export const resolveHairItemFromQrToken = async (qrToken) => {
  const detailResult = await fetchHairSubmissionDetailByQrToken(qrToken);
  if (detailResult.error || !detailResult.data?.submission_detail_id) {
    return { success: false, error: detailResult.error?.message || 'Hair item QR was not found.' };
  }
  const submissionResult = await fetchHairSubmissionById(detailResult.data.submission_id);
  if (submissionResult.error || !submissionResult.data?.submission_id) {
    return { success: false, error: submissionResult.error?.message || 'Parent donation was not found.' };
  }
  return {
    success: true,
    detail: detailResult.data,
    submission: submissionResult.data,
  };
};

export const saveDriveDonationParticipation = async ({
  userId,
  databaseUserId,
  drive,
  submission,
  detail,
  recipientType = 'organization',
  recipientPatientId = null,
  qualificationSource = '',
}) => {
  if (!userId || !databaseUserId) {
    return {
      success: false,
      error: 'Your donor account is required before selecting a donation drive.',
      submission: null,
    };
  }

  if (!drive?.donation_drive_id || !submission?.submission_id || !detail?.submission_detail_id) {
    return {
      success: false,
      error: 'A saved donation entry is required before selecting a donation drive.',
      submission: null,
    };
  }

  const nextSubmissionNotes = mergeDonationNotes(
    submission?.donor_notes || '',
    [
      'Donation path: drive donation.',
      qualificationSource ? `Qualification source: ${qualificationSource}.` : '',
      drive?.event_title ? `Donation drive selected: ${drive.event_title}.` : 'Donation drive selected.',
    ],
    null,
  );

  // All event-based donations must have RSVP context (public or private).
  const shouldCreateDriveRsvp = Boolean(drive?.donation_drive_id);
  let registrationResult = { data: null, error: null, alreadyRegistered: false };

  if (shouldCreateDriveRsvp) {
    registrationResult = await createDonationDriveRegistration({
      driveId: drive.donation_drive_id,
      databaseUserId,
      hasEligibleHairScan: true,
    });

    if (registrationResult.error || !registrationResult.data?.registration_id) {
      return {
        success: false,
        error: registrationResult.error?.message || 'Drive registration could not be saved.',
        errorCode: registrationResult.error?.code || null,
        submission: null,
        registration: null,
      };
    }
  }

  const submissionResult = await updateHairSubmissionById(submission.submission_id, {
    donation_drive_id: drive.donation_drive_id,
    donation_source: DRIVE_DONATION_SOURCE,
    recipient_type: recipientType === 'patient' ? 'Patient' : 'Organization',
    recipient_patient_id: recipientType === 'patient' ? Number(recipientPatientId || 0) || null : null,
    donor_notes: nextSubmissionNotes,
    status: 'Pending',
  });

  if (submissionResult.error || !submissionResult.data?.submission_id) {
    return {
      success: false,
      error: submissionResult.error?.message || 'Drive participation could not be linked to the donation submission.',
      submission: null,
      registration: registrationResult.data || null,
    };
  }

  const shouldTrackDriveParticipation = (
    submission?.donation_drive_id !== drive.donation_drive_id
    || String(submission?.donation_source || '').trim().toLowerCase() !== DRIVE_DONATION_SOURCE
  );

  if (shouldTrackDriveParticipation) {
    const trackingResult = await createHairBundleTrackingEntry({
      submission_id: submissionResult.data.submission_id,
      submission_detail_id: detail.submission_detail_id,
      status: 'event_rsvp',
      title: 'Donation drive selected',
      description: `The donor selected ${drive?.event_title || 'the selected drive'} for this donation.`,
      changed_by: databaseUserId,
    });

    if (trackingResult.error) {
      return {
        success: false,
        error: trackingResult.error.message || 'Unable to save the drive participation timeline update.',
        submission: null,
        registration: registrationResult.data || null,
      };
    }

    await persistDonationNotifications({
      userId,
      notifications: [
        buildDonationNotification({
          dedupeKey: `${notificationTypes.driveRsvpConfirmed}:${registrationResult.data?.registration_id || drive.donation_drive_id}`,
          type: notificationTypes.driveRsvpConfirmed,
          title: 'RSVP confirmed',
          message: `You are registered to participate in ${drive?.event_title || 'the donation event'}.`,
          createdAt: new Date().toISOString(),
          referenceType: 'donation_drive',
          referenceId: drive.donation_drive_id,
        }),
      ],
    });
  }

  return {
    success: true,
    submission: submissionResult.data,
    registration: registrationResult.data || null,
    alreadyRegistered: registrationResult.alreadyRegistered,
    regenerated: false,
  };
};

export const buildCertificatePreviewModel = ({ certificateRow, submissionEntry, donorName = 'Donor' }) => {
  if (!certificateRow) return null;

  return {
    certificate_id: certificateRow.certificate_id || null,
    certificateNumber: certificateRow.certificate_number || 'Pending certificate number',
    donorName,
    submissionId: certificateRow.submission_id || submissionEntry?.submission?.submission_id || null,
    donationReference: submissionEntry?.submission?.donation_reference || 'Pending donation reference',
    donationDate: submissionEntry?.submission?.created_at || certificateRow.issued_at || '',
    donationDateLabel: formatDateShort(submissionEntry?.submission?.created_at || certificateRow.issued_at || ''),
    bundleQuantity: Array.isArray(submissionEntry?.submission?.submission_details)
      ? submissionEntry.submission.submission_details.length
      : 0,
    decision: 'Staff-approved donation',
    summary: submissionEntry?.screening?.summary || certificateRow.remarks || '',
    issuedAt: certificateRow.issued_at || null,
    certificateType: certificateRow.certificate_type || '',
    fileUrl: certificateRow.file_url || '',
  };
};
