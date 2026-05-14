import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { logAppError } from '../utils/appErrors';
import { createDonationDriveRegistration, fetchDonationDrivePreview, fetchUpcomingDonationDrives } from './donorHome.api';
import {
    createHairBundleTrackingEntry,
    createHairSubmission,
    createHairSubmissionDetail,
    createHairSubmissionImages,
    createHairSubmissionLogistics,
    fetchHairBundleTrackingHistory,
    fetchHairSubmissionLogisticsBySubmissionId,
    fetchHairSubmissionsByUserId,
    fetchLatestDonationCertificateByUserId,
    fetchLatestDonationRequirement,
    getHairSubmissionImageSignedUrl,
    updateHairSubmissionDetailById,
    updateHairSubmissionById,
    updateHairSubmissionLogisticsById,
    uploadHairSubmissionImage,
} from './hairSubmission.api';
import { hairSubmissionStorageBucket } from './hairSubmission.constants';
import { notificationTypes } from './notification.constants';
import { buildImmediateNotificationEvents, recordNotifications } from './notification.service';
import { canSubmitHairDonation, mapDonationPermissionError } from './donorCompliance.service';

const ELIGIBLE_DECISION = 'eligible for hair donation';
const MANUAL_DONATION_SOURCE = 'manual_donor_details';
const INDEPENDENT_DONATION_SOURCE = 'independent_donation';
const DRIVE_DONATION_SOURCE = 'drive_donation';
const MANUAL_HAIR_PHOTO_IMAGE_TYPE = 'manual_donation_hair_photo';
const MANUAL_DONATION_NOTE_MARKER = 'Manual donor details saved from the donor Donations module.';
const MINIMUM_MANUAL_LENGTH_INCHES = 14;
const CM_PER_INCH = 2.54;
const PARCEL_IMAGE_TYPES = ['independent_parcel_photo', 'parcel_photo', 'parcel_log'];
const QR_IMAGE_BASE_URL = 'https://api.qrserver.com/v1/create-qr-code/';
const QR_META_START = '[DONIVRA_QR_META]';
const QR_META_END = '[/DONIVRA_QR_META]';

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const normalizeDecision = (value = '') => String(value || '').trim().toLowerCase();
const normalizeStatus = (value = '') => String(value || '').trim().toLowerCase();
const TERMINAL_DONATION_STATUSES = new Set(['completed', 'cancelled', 'canceled', 'rejected', 'closed']);

const isTerminalDonationStatus = (status = '') => (
  TERMINAL_DONATION_STATUSES.has(normalizeStatus(status))
);

export const isEligibleHairAnalysisDecision = (decision = '') => (
  normalizeDecision(decision) === ELIGIBLE_DECISION
);

const flattenScreeningEntries = (submissions = []) => (
  submissions.flatMap((submission) => {
    const latestDetail = [...(submission?.submission_details || [])]
      .sort((left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime())[0] || null;

    return (submission?.ai_screenings || []).map((screening) => ({
      screening,
      submission,
      detail: latestDetail,
      recommendations: submission?.donor_recommendations || [],
      images: latestDetail?.images || [],
    }));
  })
);

const sortScreeningEntries = (entries = []) => (
  [...entries].sort((left, right) => (
    new Date(right?.screening?.created_at || 0).getTime() - new Date(left?.screening?.created_at || 0).getTime()
  ))
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
  const minimumLengthCm = resolveMinimumLengthCm(donationRequirement);
  return toRoundedNumber(minimumLengthCm / CM_PER_INCH, 1) || MINIMUM_MANUAL_LENGTH_INCHES;
};

const buildManualDonationReason = (reasons = []) => (
  reasons.filter(Boolean).join(' ')
);

const pushUniqueReason = (target, value) => {
  const nextValue = String(value || '').trim();
  if (!nextValue) return;
  if (!target.includes(nextValue)) {
    target.push(nextValue);
  }
};

const getScreeningLogMessage = (screening = null, { preferSummary = false } = {}) => {
  const values = preferSummary
    ? [screening?.summary, screening?.visible_damage_notes, screening?.detected_condition, screening?.decision]
    : [screening?.decision, screening?.summary, screening?.visible_damage_notes, screening?.detected_condition];

  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
};

const buildAiConditionReasons = (screening = null) => {
  const sourceText = [
    screening?.detected_condition,
    screening?.visible_damage_notes,
    screening?.summary,
  ].filter(Boolean).join(' ').toLowerCase();
  const screeningLogMessage = getScreeningLogMessage(screening, { preferSummary: true });
  const detectedConditionText = String(screening?.detected_condition || '').toLowerCase();
  const damageLevel = Number(screening?.damage_level);
  const drynessLevel = Number(screening?.dryness_level);
  const frizzLevel = Number(screening?.frizz_level);
  const oilinessLevel = Number(screening?.oiliness_level);
  const hasPositiveMention = (patterns = [], negatedPatterns = []) => (
    patterns.some((pattern) => pattern.test(sourceText))
    && !negatedPatterns.some((pattern) => pattern.test(sourceText))
  );

  const conditionReasons = [];

  const hasDrynessConcern = hasPositiveMention(
    [/\bdry(?:ness)?\b/, /\bdehydrat(?:ed|ion)\b/],
    [/\bno\s+(?:visible\s+)?dry(?:ness)?\b/, /\bnot\s+dry\b/, /\bmoisture\s+level\s+looks\s+balanced\b/, /\bbalanced\s+moisture\b/],
  );
  if (hasDrynessConcern && (!Number.isFinite(drynessLevel) || drynessLevel >= 3)) {
    pushUniqueReason(conditionReasons, screeningLogMessage);
  }

  const hasDamageConcern = hasPositiveMention(
    [/\bdamage(?:d)?\b/, /\bbreakage\b/, /\bsplit\s+ends?\b/, /\bfray(?:ed|ing)?\b/],
    [
      /\bno\s+(?:visible\s+|structural\s+|hair\s+)?damage\b/,
      /\bno\s+(?:visible\s+)?breakage\b/,
      /\bno\s+(?:visible\s+)?split\s+ends?\b/,
      /\bwithout\s+(?:visible\s+|structural\s+|hair\s+)?damage\b/,
      /\bfree\s+of\s+(?:visible\s+|structural\s+|hair\s+)?damage\b/,
      /\bnot\s+damaged\b/,
    ],
  );
  const conditionLooksHealthy = /\b(healthy|good|excellent|balanced|no structural damage|no visible damage)\b/.test(detectedConditionText);
  if (hasDamageConcern && (Number.isFinite(damageLevel) ? damageLevel >= 3 : !conditionLooksHealthy)) {
    pushUniqueReason(conditionReasons, screeningLogMessage);
  }

  const hasFrizzConcern = hasPositiveMention(
    [/\bfrizz(?:y)?\b/],
    [/\bno\s+(?:visible\s+)?frizz\b/, /\blow\s+frizz\b/, /\bminimal\s+frizz\b/],
  );
  if (hasFrizzConcern && (!Number.isFinite(frizzLevel) || frizzLevel >= 4)) {
    pushUniqueReason(conditionReasons, screeningLogMessage);
  }

  const hasOilinessConcern = hasPositiveMention(
    [/\boily\b/, /\boiliness\b/],
    [/\bnot\s+oily\b/, /\bno\s+(?:visible\s+)?oiliness\b/, /\bbalanced\s+oil\b/],
  );
  if (hasOilinessConcern && (!Number.isFinite(oilinessLevel) || oilinessLevel >= 4)) {
    pushUniqueReason(conditionReasons, screeningLogMessage);
  }
  if (
    sourceText.includes('thin')
    || sourceText.includes('sparse')
    || sourceText.includes('low density')
    || sourceText.includes('light density')
  ) {
    pushUniqueReason(conditionReasons, screeningLogMessage);
  }

  return conditionReasons;
};

const buildLengthRequirementMessage = ({ screening = null, minimumLengthCm = 0 }) => {
  const logMessage = getScreeningLogMessage(screening);
  const minimumInches = toRoundedNumber(minimumLengthCm / CM_PER_INCH, 1);
  const minimumCm = toRoundedNumber(minimumLengthCm, 1);
  const requirementMessage = `Minimum hair length: ${minimumInches} inches (${minimumCm} cm).`;
  return [logMessage, requirementMessage].filter(Boolean).join(' ');
};

const resolveMinimumLengthCm = (donationRequirement = null) => {
  const defaultMinimumCm = MINIMUM_MANUAL_LENGTH_INCHES * CM_PER_INCH;
  const configuredLength = Number(donationRequirement?.minimum_hair_length);
  if (Number.isFinite(configuredLength) && configuredLength > 0) {
    return Math.max(defaultMinimumCm, configuredLength);
  }
  return defaultMinimumCm;
};

const screeningLooksDonationReady = ({
  screening = null,
  normalizedLengthCm = null,
  minimumLengthCm = null,
  conditionReasons = [],
}) => {
  if (!screening) return false;
  if (!normalizedLengthCm || !minimumLengthCm || normalizedLengthCm < minimumLengthCm) return false;
  if (conditionReasons.length) return false;

  const conditionText = String(screening?.detected_condition || '').toLowerCase();
  const summaryText = String(screening?.summary || '').toLowerCase();
  const visibleDamageText = String(screening?.visible_damage_notes || '').toLowerCase();
  const mergedText = `${conditionText} ${summaryText} ${visibleDamageText}`;
  const confidenceScore = Number(screening?.confidence_score);
  const damageLevel = Number(screening?.damage_level);

  if (Number.isFinite(confidenceScore) && confidenceScore < 0.55) return false;
  if (Number.isFinite(damageLevel) && damageLevel >= 3) return false;

  const hasHealthySignal = /\b(healthy|good|excellent|balanced|suitable|donatable)\b/.test(mergedText)
    || /\bno\s+(?:visible\s+|structural\s+|hair\s+)?damage\b/.test(mergedText)
    || /\bno\s+(?:visible\s+)?breakage\b/.test(mergedText);
  const hasBlockingSignal = /\b(unclear|low-confidence|low confidence|not detected|not ready|too short)\b/.test(mergedText);

  return hasHealthySignal && !hasBlockingSignal;
};

const evaluateManualDonationEligibility = ({ manualDetails = {}, donationRequirement = null }) => {
  const minimumLengthInches = resolveMinimumLengthInches(donationRequirement);
  const normalizedLengthInches = convertLengthToInches(manualDetails?.length_value, manualDetails?.length_unit);
  const isTreated = normalizeYesNoChoice(manualDetails?.treated);
  const isColored = normalizeYesNoChoice(manualDetails?.colored);
  const reasons = [];

  if (!normalizedLengthInches || normalizedLengthInches < minimumLengthInches) {
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

const evaluateAiDonationEligibility = ({ screening = null, detail = null, donationRequirement = null }) => {
  const minimumLengthCm = resolveMinimumLengthCm(donationRequirement);
  const normalizedLengthCm = toRoundedNumber(screening?.estimated_length, 1);
  const reasons = [];
  const conditionReasons = screening ? buildAiConditionReasons(screening) : [];
  const inferredEligibleFromFields = screeningLooksDonationReady({
    screening,
    normalizedLengthCm,
    minimumLengthCm,
    conditionReasons,
  });

  if (!screening) return {
    isQualified: false,
    normalized_length_cm: normalizedLengthCm,
    minimum_length_cm: minimumLengthCm,
    reasons,
    reason: '',
  };

  if (screening && !isEligibleHairAnalysisDecision(screening?.decision || '') && !inferredEligibleFromFields) {
    conditionReasons.forEach((reason) => pushUniqueReason(reasons, reason));

    if (!conditionReasons.length) {
      const logMessage = getScreeningLogMessage(screening);
      if (logMessage) pushUniqueReason(reasons, logMessage);
    }
  }

  if (!normalizedLengthCm || normalizedLengthCm < minimumLengthCm) {
    reasons.push(buildLengthRequirementMessage({ screening, minimumLengthCm }));
  }

  if (donationRequirement?.chemical_treatment_status === false && detail?.is_chemically_treated) {
    reasons.push('Current donation rules do not allow chemically treated hair.');
  }

  if (donationRequirement?.colored_hair_status === false && detail?.is_colored) {
    reasons.push('Current donation rules do not allow colored hair.');
  }

  if (donationRequirement?.bleached_hair_status === false && detail?.is_bleached) {
    reasons.push('Current donation rules do not allow bleached hair.');
  }

  if (donationRequirement?.rebonded_hair_status === false && detail?.is_rebonded) {
    reasons.push('Current donation rules do not allow rebonded hair.');
  }

  return {
    isQualified: reasons.length === 0,
    normalized_length_cm: normalizedLengthCm,
    minimum_length_cm: minimumLengthCm,
    reasons,
    reason: reasons.length
      ? buildManualDonationReason(reasons)
      : isEligibleHairAnalysisDecision(screening?.decision || '')
        ? screening?.decision
        : getScreeningLogMessage(screening, { preferSummary: true }),
  };
};

const createDonationSubmissionCode = (prefix = 'DON') => (
  `${prefix}-${Date.now().toString(36).toUpperCase()}`
);

export const createDonationQrReference = (prefix = 'QR') => (
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
);

const stripQrMetadata = (value = '') => String(value || '')
  .replace(new RegExp(`${escapeRegExp(QR_META_START)}[\\s\\S]*?${escapeRegExp(QR_META_END)}\\s*`, 'g'), '')
  .trim();

const parseQrMetadata = (value = '') => {
  const normalized = String(value || '');
  const match = normalized.match(
    new RegExp(`${escapeRegExp(QR_META_START)}([\\s\\S]*?)${escapeRegExp(QR_META_END)}`),
  );
  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const mergeQrMetadataIntoNotes = (notes = '', metadata = null) => {
  const cleanNotes = stripQrMetadata(notes);
  if (!metadata) return cleanNotes;

  const serialized = `${QR_META_START}${JSON.stringify(metadata)}${QR_META_END}`;
  return [serialized, cleanNotes].filter(Boolean).join(' ').trim();
};

const mergeDonationNotes = (notes = '', additions = [], metadata = null) => {
  const baseText = stripQrMetadata(notes);
  const fragments = [baseText, ...additions]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const uniqueFragments = [...new Set(fragments)];
  return mergeQrMetadataIntoNotes(uniqueFragments.join(' '), metadata);
};

const buildDonationNotification = ({
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

const getIndependentQrMetadata = (submission = null) => {
  const metadata = parseQrMetadata(submission?.donor_notes || '');
  if (!metadata || metadata.type !== 'independent' || !metadata.reference) {
    return null;
  }

  const normalizedStatus = String(metadata.status || '').trim().toLowerCase();
  const generatedAt = metadata.generated_at || metadata.confirmed_at || '';
  const activatedAt = metadata.activated_at || metadata.confirmed_at || '';
  const isActivated = ['activated', 'active'].includes(normalizedStatus) || metadata.confirmed === true;

  return {
    reference: metadata.reference,
    generated_at: generatedAt,
    expires_at: '',
    activated_at: activatedAt,
    version: metadata.version ?? 1,
    status: isActivated ? 'active' : 'inactive',
    is_activated: isActivated,
    is_inactive: !isActivated,
    is_expired: false,
    is_pending: !isActivated,
    can_regenerate: false,
  };
};

const buildIndependentQrMetadata = ({
  reference = '',
  status = 'inactive',
  generatedAt = new Date().toISOString(),
  activatedAt = '',
  version = 1,
  updatedBy = null,
}) => ({
  type: 'independent',
  reference,
  status,
  generated_at: generatedAt,
  expires_at: '',
  activated_at: activatedAt || '',
  version,
  updated_by: updatedBy || null,
});

const buildIndependentQrMetadataFromState = ({
  qrState = null,
  fallbackMetadata = null,
  updatedBy = null,
}) => {
  if (!qrState?.reference) {
    return fallbackMetadata;
  }

  return buildIndependentQrMetadata({
    reference: qrState.reference,
    status: qrState.is_activated ? 'active' : 'inactive',
    generatedAt: qrState.generated_at || fallbackMetadata?.generated_at || new Date().toISOString(),
    activatedAt: qrState.activated_at || fallbackMetadata?.activated_at || '',
    version: Number(fallbackMetadata?.version || 0) + 1,
    updatedBy,
  });
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

const upsertSubmissionLogistics = async ({
  submissionId,
  logisticsType,
  shipmentStatus,
  notes,
  courierName = undefined,
  trackingNumber = undefined,
  pickupScheduleDate = undefined,
  pickupScheduledAt = undefined,
  pickupApprovedAt = undefined,
  receivedBy = undefined,
  receivedAt = undefined,
}) => {
  if (!submissionId) {
    return { data: null, error: new Error('Submission ID is required for logistics updates.') };
  }

  const existingResult = await fetchHairSubmissionLogisticsBySubmissionId(submissionId);
  const currentLogistics = existingResult.data || null;
  const payload = {
    submission_id: submissionId,
    logistics_type: logisticsType || currentLogistics?.logistics_type || null,
    courier_name: courierName ?? currentLogistics?.courier_name ?? null,
    tracking_number: trackingNumber ?? currentLogistics?.tracking_number ?? null,
    shipment_status: shipmentStatus || currentLogistics?.shipment_status || null,
    pickup_schedule_date: pickupScheduleDate ?? currentLogistics?.pickup_schedule_date ?? null,
    pickup_scheduled_at: pickupScheduledAt ?? currentLogistics?.pickup_scheduled_at ?? currentLogistics?.pickup_schedule_at ?? null,
    pickup_approved_at: pickupApprovedAt ?? currentLogistics?.pickup_approved_at ?? null,
    received_by: receivedBy ?? currentLogistics?.received_by ?? null,
    received_at: receivedAt ?? currentLogistics?.received_at ?? null,
    notes: notes || currentLogistics?.notes || null,
  };

  return currentLogistics?.submission_logistics_id
    ? await updateHairSubmissionLogisticsById(currentLogistics.submission_logistics_id, {
        ...currentLogistics,
        ...payload,
      })
    : await createHairSubmissionLogistics(payload);
};

const syncIndependentDonationSubmission = async ({
  userId,
  databaseUserId,
  submission,
  qrMetadata = null,
  status,
  logisticsStatus,
  logisticsNotes,
  trackingTitle = '',
  trackingDescription = '',
  shouldTrack = false,
  shouldNotify = false,
  donationDriveId = null,
}) => {
  if (!submission?.submission_id) {
    return { success: false, error: 'A valid donation submission is required.' };
  }

  const nextNotes = mergeDonationNotes(
    submission?.donor_notes || '',
    [donationDriveId ? 'Donation path: public donation drive.' : 'Donation path: independent donation.'],
    qrMetadata,
  );

  const submissionResult = await updateHairSubmissionById(submission.submission_id, {
    donation_drive_id: donationDriveId ?? submission?.donation_drive_id ?? undefined,
    donation_source: donationDriveId ? DRIVE_DONATION_SOURCE : INDEPENDENT_DONATION_SOURCE,
    donor_notes: nextNotes,
    status,
  });

  if (submissionResult.error || !submissionResult.data?.submission_id) {
    return {
      success: false,
      error: submissionResult.error?.message || 'Unable to update the independent donation submission.',
    };
  }

  const logisticsResult = await upsertSubmissionLogistics({
    submissionId: submissionResult.data.submission_id,
    logisticsType: 'shipping',
    shipmentStatus: logisticsStatus,
    notes: logisticsNotes,
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
      status: logisticsStatus,
      title: trackingTitle || logisticsStatus,
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

const isSubmissionCompleted = ({ submission = null, certificate = null }) => (
  Boolean(
    !submission?.submission_id
    || isTerminalDonationStatus(submission?.status)
    || (certificate?.submission_id && certificate.submission_id === submission.submission_id)
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
      recommendations: submission?.donor_recommendations || [],
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
  certificate = null,
  fallbackRecord = null,
}) => {
  const sortedSubmissions = sortSubmissionsByCreatedAt(submissions);

  const flowMatchedRecord = sortedSubmissions
    .filter((submission) => !isSubmissionCompleted({ submission, certificate }))
    .find((submission) => (
      Boolean(submission?.donation_drive_id)
      || Boolean(getIndependentQrMetadata(submission)?.reference)
      || Boolean(getSubmissionParcelImages(submission).length)
      || [INDEPENDENT_DONATION_SOURCE, DRIVE_DONATION_SOURCE].includes(String(submission?.donation_source || '').trim().toLowerCase())
      || hasCurrentFlowStatus(submission)
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

  if (fallbackRecord?.submission && !isSubmissionCompleted({ submission: fallbackRecord.submission, certificate })) {
    return fallbackRecord;
  }

  return null;
};

const resolveCurrentFlowSubmission = ({
  submissions = [],
  certificate = null,
} = {}) => {
  const sortedSubmissions = sortSubmissionsByCreatedAt(submissions);

  return sortedSubmissions
    .filter((submission) => !isSubmissionCompleted({ submission, certificate }))
    .find((submission) => (
      Boolean(submission?.donation_drive_id)
      || Boolean(getIndependentQrMetadata(submission)?.reference)
      || Boolean(getSubmissionParcelImages(submission).length)
      || [INDEPENDENT_DONATION_SOURCE, DRIVE_DONATION_SOURCE].includes(String(submission?.donation_source || '').trim().toLowerCase())
      || hasCurrentFlowStatus(submission)
    )) || null;
};

const resolveCurrentFlowSubmissions = ({
  submissions = [],
  certificate = null,
} = {}) => {
  const sortedSubmissions = sortSubmissionsByCreatedAt(submissions);

  return sortedSubmissions
    .filter((submission) => !isSubmissionCompleted({ submission, certificate }))
    .filter((submission) => (
      Boolean(submission?.donation_drive_id)
      || Boolean(getIndependentQrMetadata(submission)?.reference)
      || Boolean(getSubmissionParcelImages(submission).length)
      || [INDEPENDENT_DONATION_SOURCE, DRIVE_DONATION_SOURCE].includes(String(submission?.donation_source || '').trim().toLowerCase())
      || hasCurrentFlowStatus(submission)
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
      submission_code: submission.submission_code || '',
      status: submission.status || '',
      donation_source: submission.donation_source || '',
      created_at: submission.created_at || '',
      updated_at: submission.updated_at || '',
      date_label: formatHistoryDateLabel(submission.updated_at || submission.created_at || ''),
      bundle_quantity: Array.isArray(submission?.submission_details) ? submission.submission_details.length : 0,
    }))
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

const buildTimelineProgressLabel = ({ stageState, index, currentIndex }) => {
  if (stageState === 'completed') return 'Complete';
  if (stageState === 'current') return 'Ongoing';

  const distanceFromCurrent = index - currentIndex;
  if (distanceFromCurrent === 1) {
    return 'To receive';
  }

  return 'On waiting';
};

const resolveTimelineStages = ({ logistics, trackingEntries, parcelImages, certificate }) => {
  const readyEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(entry?.status, ['ready for shipment', 'parcel logged', 'parcel prepared'])
    || matchesAnyToken(entry?.title, ['ready for shipment', 'parcel logged', 'parcel prepared'])
    || matchesAnyToken(entry?.description, ['ready for shipment', 'parcel logged', 'parcel prepared'])
  ));
  const readyEvidenceAt = parcelImages[0]?.uploaded_at || readyEntry?.updated_at || logistics?.created_at || null;
  const transitEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(entry?.status, ['transit', 'shipped', 'shipping'])
    || matchesAnyToken(entry?.title, ['transit', 'shipped', 'shipping'])
    || matchesAnyToken(entry?.description, ['transit', 'shipped', 'shipping'])
  ));
  const transitEvidenceAt = transitEntry?.updated_at
    || (matchesAnyToken(logistics?.shipment_status, ['transit', 'shipped']) ? logistics?.created_at || null : null);
  const receivedOrgEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(entry?.status, ['received by the organization', 'organization received', 'received'])
    || matchesAnyToken(entry?.title, ['received by the organization', 'organization received', 'received'])
    || matchesAnyToken(entry?.description, ['received by the organization', 'organization received'])
  ));
  const receivedOrgEvidenceAt = receivedOrgEntry?.updated_at
    || logistics?.received_at
    || (matchesAnyToken(logistics?.shipment_status, ['received by the organization', 'organization received']) ? logistics?.created_at || null : null);
  const qualityEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(entry?.status, ['quality', 'checking', 'assessment', 'qa'])
    || matchesAnyToken(entry?.title, ['quality', 'checking', 'assessment', 'qa'])
    || matchesAnyToken(entry?.description, ['quality', 'checking', 'assessment', 'qa'])
  ));
  const qualityEvidenceAt = qualityEntry?.updated_at || null;
  const receiverShipmentEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(entry?.status, ['ready for shipment to the receiver', 'shipment to the receiver', 'receiver shipment'])
    || matchesAnyToken(entry?.title, ['ready for shipment to the receiver', 'shipment to the receiver', 'receiver shipment'])
    || matchesAnyToken(entry?.description, ['ready for shipment to the receiver', 'shipment to the receiver', 'receiver shipment'])
  ));
  const receiverShipmentEvidenceAt = receiverShipmentEntry?.updated_at || null;
  const patientReceivedEntry = findTimelineMatch(trackingEntries, (entry) => (
    matchesAnyToken(entry?.status, ['received by patient', 'patient received', 'delivered'])
    || matchesAnyToken(entry?.title, ['received by patient', 'patient received', 'delivered'])
    || matchesAnyToken(entry?.description, ['received by patient', 'patient received'])
  ));
  const patientReceivedEvidenceAt = patientReceivedEntry?.updated_at || certificate?.issued_at || null;

  const stages = [
    {
      key: 'ready_for_shipment',
      label: 'Ready for shipment',
      statusLabel: readyEntry?.status || logistics?.shipment_status || '',
      savedNote: readyEntry?.description || logistics?.notes || '',
      evidenceAt: readyEvidenceAt,
      parcelImages,
    },
    {
      key: 'in_transit',
      label: 'In transit',
      statusLabel: transitEntry?.status || (matchesAnyToken(logistics?.shipment_status, ['transit', 'shipped']) ? logistics?.shipment_status : ''),
      savedNote: transitEntry?.description || '',
      evidenceAt: transitEvidenceAt,
      entry: transitEntry,
      parcelImages,
    },
    {
      key: 'received_by_organization',
      label: 'Received by the organization',
      statusLabel: receivedOrgEntry?.status || (logistics?.received_at ? 'Received by the organization' : ''),
      savedNote: receivedOrgEntry?.description || logistics?.notes || '',
      evidenceAt: receivedOrgEvidenceAt,
      entry: receivedOrgEntry,
      parcelImages,
    },
    {
      key: 'quality_checking',
      label: 'Quality checking',
      statusLabel: qualityEntry?.status || '',
      savedNote: qualityEntry?.description || '',
      evidenceAt: qualityEvidenceAt,
      entry: qualityEntry,
      parcelImages,
    },
    {
      key: 'ready_for_shipment_to_receiver',
      label: 'Ready for shipment to the receiver',
      statusLabel: receiverShipmentEntry?.status || '',
      savedNote: receiverShipmentEntry?.description || '',
      evidenceAt: receiverShipmentEvidenceAt,
      entry: receiverShipmentEntry,
      parcelImages,
    },
    {
      key: 'received_by_patient',
      label: 'Received by patient',
      statusLabel: patientReceivedEntry?.status || (certificate?.issued_at ? 'Received by patient' : ''),
      savedNote: patientReceivedEntry?.description || certificate?.remarks || '',
      evidenceAt: patientReceivedEvidenceAt,
      entry: patientReceivedEntry,
      parcelImages,
    },
  ];

  const reachedStageIndexes = stages.reduce((indexes, stage, index) => (
    stage?.evidenceAt ? [...indexes, index] : indexes
  ), []);
  const resolvedCurrentIndex = reachedStageIndexes.length
    ? reachedStageIndexes[reachedStageIndexes.length - 1]
    : 0;
  const isDonationCompleted = Boolean(patientReceivedEvidenceAt);

  return stages.map((stage, index) => {
    const stageState = isDonationCompleted
      ? index <= resolvedCurrentIndex ? 'completed' : 'upcoming'
      : index < resolvedCurrentIndex ? 'completed' : index === resolvedCurrentIndex ? 'current' : 'upcoming';
    const completedAt = stageState === 'completed' ? stage.evidenceAt : null;

    return {
      ...stage,
      completedAt,
      state: stageState,
      progressLabel: buildTimelineProgressLabel({
        stageState,
        index,
        currentIndex: resolvedCurrentIndex,
      }),
      timestampLabel: stage.evidenceAt ? `Updated ${formatDateTime(stage.evidenceAt)}` : '',
    };
  });
};

const buildTimelineEvents = ({ logistics, trackingEntries, parcelImages, certificate }) => {
  const parcelEvents = parcelImages.map((image, index) => ({
    key: `parcel-${image.image_id || index}`,
    title: index === 0 ? 'Parcel image uploaded' : 'Additional parcel image uploaded',
    description: 'The donor uploaded a parcel image before shipment.',
    timestamp: formatDateTime(image.uploaded_at),
    imageUrl: image.signed_url || '',
    badge: 'Parcel log',
  }));

  const trackingEvents = (trackingEntries || []).map((entry) => ({
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
        timestamp: formatDateTime(logistics.received_at || logistics.updated_at || logistics.created_at),
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
    Payload_Type: 'Donation_Drive_Registration',
    Registration_ID: registration?.registration_id || null,
    Donation_Drive_ID: registration?.donation_drive_id || drive?.donation_drive_id || null,
    User_ID: registration?.user_id || null,
    Registration_Status: registration?.registration_status || '',
    Attendance_Status: registration?.attendance_status || '',
    Registered_At: registration?.registered_at || '',
    Updated_At: registration?.updated_at || '',
    Attendance_Marked_At: registration?.attendance_marked_at || '',
    Event_Title: drive?.event_title || '',
    Start_Date: drive?.start_date || '',
    End_Date: drive?.end_date || '',
    Street: drive?.street || '',
    Barangay: drive?.barangay || '',
    City: drive?.city || '',
    Province: drive?.province || '',
    Country: drive?.country || '',
    Organization_ID: drive?.organization_id || null,
    Organization_Name: drive?.organization_name || '',
  })
);

export const buildIndependentDonationQrPayload = ({
  submission,
  detail = null,
}) => (
  JSON.stringify({
    type: 'hair_submission',
    submission_id: submission?.submission_id || null,
    submission_code: submission?.submission_code || '',
    submission_detail_id: detail?.submission_detail_id || null,
    donation_drive_id: submission?.donation_drive_id || null,
  })
);

export const buildDonationTrackingQrPayload = ({
  submission = null,
  detail = null,
  drive = null,
} = {}) => {
  return JSON.stringify({
    type: 'hair_submission',
    submission_id: submission?.submission_id || null,
    submission_code: submission?.submission_code || '',
    submission_detail_id: detail?.submission_detail_id || null,
    donation_drive_id: submission?.donation_drive_id || drive?.donation_drive_id || null,
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
  if (rawPayload.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawPayload);
      if (parsed?.type === 'hair_submission') {
        return {
          submission_id: parsed?.submission_id != null ? String(parsed.submission_id) : '',
          submission_code: parsed?.submission_code || '',
          submission_detail_id: parsed?.submission_detail_id != null ? String(parsed.submission_detail_id) : '',
          user_id: parsed?.user_id != null ? String(parsed.user_id) : '',
          donation_source: parsed?.donation_source || '',
          donation_status: parsed?.status || parsed?.tracking_status || '',
          donation_drive_id: parsed?.donation_drive_id != null ? String(parsed.donation_drive_id) : '',
        };
      }
    } catch (_error) {
      // Fall back to legacy line-based parsing below.
    }
  }

  return {
    submission_id: getDonationQrPayloadValue(payloadText, 'Hair_Submissions.Submission_ID')
      || getDonationQrPayloadValue(payloadText, 'Submission_ID'),
    submission_code: getDonationQrPayloadValue(payloadText, 'Hair_Submissions.Submission_Code')
      || getDonationQrPayloadValue(payloadText, 'Submission_Code'),
    submission_detail_id: getDonationQrPayloadValue(payloadText, 'Hair_Submission_Details.Submission_Detail_ID')
      || getDonationQrPayloadValue(payloadText, 'Submission_Detail_ID'),
    user_id: getDonationQrPayloadValue(payloadText, 'Hair_Submissions.User_ID')
      || getDonationQrPayloadValue(payloadText, 'User_ID'),
    donation_source: getDonationQrPayloadValue(payloadText, 'Hair_Submissions.Donation_Source')
      || getDonationQrPayloadValue(payloadText, 'Donation_Source'),
    donation_status: getDonationQrPayloadValue(payloadText, 'Hair_Submissions.Status')
      || getDonationQrPayloadValue(payloadText, 'Status'),
    donation_drive_id: getDonationQrPayloadValue(payloadText, 'Donation_Drive_ID'),
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
  `${QR_IMAGE_BASE_URL}?size=${size}x${size}&data=${encodeURIComponent(payloadText)}`
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
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) {
      return {
        success: false,
        error: 'Allow photo library access so Donivra can save the QR image to this device.',
      };
    }

    if (!FileSystem.cacheDirectory) {
      return { success: false, error: 'Device storage cache is not available right now.' };
    }

    const safeFileName = sanitizeFileName(fileName);
    const targetUri = `${FileSystem.cacheDirectory}${safeFileName}-${Date.now()}.png`;
    const downloadResult = await FileSystem.downloadAsync(
      buildQrImageUrl(qrPayloadText, size),
      targetUri
    );

    const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
    return {
      success: true,
      uri: asset?.uri || downloadResult.uri,
      asset,
    };
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
      timelineStages: [],
      timelineEvents: [],
      certificate: null,
      error: 'Your session is not ready.',
    };
  }

  const [submissionsResult, drivesResult, certificateResult, donationRequirementResult] = await Promise.all([
    fetchHairSubmissionsByUserId(userId, 12),
    fetchUpcomingDonationDrives(driveLimit, databaseUserId || null),
    fetchLatestDonationCertificateByUserId(userId),
    fetchLatestDonationRequirement(),
  ]);

  if (submissionsResult.error) {
    return {
      latestAnalysisEntry: null,
      latestAiEligibility: null,
      latestDonationRequirement: donationRequirementResult.data || null,
      isEligible: false,
      isAiEligible: false,
      isDonationReady: false,
      drives: drivesResult.data || [],
      timelineStages: [],
      timelineEvents: [],
      certificate: certificateResult.data || null,
      error: submissionsResult.error.message || 'Unable to load donation data.',
    };
  }

  const submissions = submissionsResult.data || [];
  const sortedEntries = sortScreeningEntries(flattenScreeningEntries(submissions));
  const latestAnalysisEntry = sortedEntries[0] || null;
  const latestScreening = latestAnalysisEntry?.screening || null;
  const latestAiEligibility = evaluateAiDonationEligibility({
    screening: latestAnalysisEntry?.screening || null,
    detail: latestAnalysisEntry?.detail || null,
    donationRequirement: donationRequirementResult.data || null,
  });
  const aiRecord = resolveAiDonationRecord(latestAnalysisEntry, donationRequirementResult.data || null);
  const manualRecord = resolveManualDonationRecord({
    submissions,
    donationRequirement: donationRequirementResult.data || null,
  });
  const latestQualifiedRecord = resolveActiveDonationRecord({ aiRecord, manualRecord });
  const activeRecord = resolveCurrentDonationRecord({
    submissions,
    donationRequirement: donationRequirementResult.data || null,
    certificate: certificateResult.data || null,
    fallbackRecord: latestQualifiedRecord,
  });
  const activeFlowSubmission = resolveCurrentFlowSubmission({
    submissions,
    certificate: certificateResult.data || null,
  });
  const activeFlowSubmissions = resolveCurrentFlowSubmissions({
    submissions,
    certificate: certificateResult.data || null,
  });
  const isAiEligible = Boolean(aiRecord?.qualification?.isQualified);
  const isManualQualified = Boolean(manualRecord?.qualification?.isQualified);
  const isDonationReady = Boolean(activeRecord?.qualification?.isQualified);
  const activeSubmission = activeFlowSubmission || activeRecord?.submission || null;
  const activeDetail = activeRecord?.detail || getLatestSubmissionDetail(activeSubmission);
  const activeScreening = activeRecord?.screening || [...(activeSubmission?.ai_screenings || [])]
    .sort((left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime())[0] || null;

  let logistics = null;
  let logisticsError = null;
  let trackingEntries = [];
  let trackingError = null;
  let parcelImages = [];

  if (activeSubmission?.submission_id && activeDetail?.submission_detail_id) {
    const [logisticsResult, trackingResult, parcelImagesResult] = await Promise.all([
      fetchHairSubmissionLogisticsBySubmissionId(activeSubmission.submission_id),
      fetchHairBundleTrackingHistory({
        submissionId: activeSubmission.submission_id,
        submissionDetailId: activeDetail.submission_detail_id,
        limit: 16,
      }),
      getParcelImagesWithUrls(activeDetail),
    ]);

    logistics = logisticsResult.data || null;
    logisticsError = logisticsResult.error;
    trackingEntries = trackingResult.data || [];
    trackingError = trackingResult.error;
    parcelImages = parcelImagesResult;
  }

  const certificate = certificateResult.data || null;
  const independentQrState = getIndependentDonationQrState({
    submission: activeSubmission,
    logistics,
    trackingEntries,
  });
  const matchingDriveFromList = (drivesResult.data || [])
    .find((drive) => drive?.donation_drive_id === activeSubmission?.donation_drive_id) || null;
  let activeDrive = matchingDriveFromList;
  let activeDriveError = null;

  if (activeSubmission?.donation_drive_id && databaseUserId && !matchingDriveFromList?.registration) {
    const activeDriveResult = await fetchDonationDrivePreview(activeSubmission.donation_drive_id, databaseUserId);
    activeDrive = activeDriveResult.data || matchingDriveFromList || null;
    activeDriveError = activeDriveResult.error || null;
  }

  const timelineStages = activeSubmission
    ? resolveTimelineStages({ logistics, trackingEntries, parcelImages, certificate })
    : [];
  const timelineEvents = activeSubmission
    ? buildTimelineEvents({ logistics, trackingEntries, parcelImages, certificate })
    : [];
  const latestStage = timelineStages[timelineStages.length - 1] || null;
  const hasCompletedDonation = Boolean(
    (certificate?.submission_id && certificate.submission_id === activeSubmission?.submission_id)
    || latestStage?.key === 'received_by_patient' && latestStage?.state === 'completed'
    || isTerminalDonationStatus(activeSubmission?.status)
  );
  const hasIndependentFlow = Boolean(
    independentQrState?.reference
    || logistics
    || parcelImages.length
    || hasMeaningfulTrackingEntries(trackingEntries)
  );
  const hasDriveFlow = Boolean(
    activeSubmission?.donation_drive_id
    || activeDrive?.registration?.registration_id
  );
  const activeFlowType = hasDriveFlow ? 'drive' : hasIndependentFlow ? 'independent' : '';
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

  return {
    latestAnalysisEntry,
    latestScreening,
    latestAiEligibility,
    latestEligibleAnalysisEntry: aiRecord ? latestAnalysisEntry : null,
    latestAiDonation: aiRecord,
    latestDonationRequirement: donationRequirementResult.data || null,
    latestManualDonation: manualRecord,
    latestSubmission: activeSubmission,
    activeSubmissions: activeFlowSubmissions,
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
    logistics,
    independentQrState,
    trackingEntries,
    parcelImages,
    timelineStages,
    timelineEvents,
    certificate,
    error: submissionsResult.error?.message
      || drivesResult.error?.message
      || logisticsError?.message
      || trackingError?.message
      || activeDriveError?.message
      || certificateResult.error?.message
      || donationRequirementResult.error?.message
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
  qrPayloadText,
  qrState: currentQrState = null,
}) => {
  if (!userId || !databaseUserId) {
    return { success: false, error: 'Your session is not ready.' };
  }
  if (!submission?.submission_id || !detail?.submission_detail_id) {
    return { success: false, error: 'A qualified donation record is required before parcel logging.' };
  }
  if (!photo) {
    return { success: false, error: 'Please upload a parcel image before continuing.' };
  }

  const qrState = currentQrState || getIndependentDonationQrState({ submission });
  if (!qrState?.is_activated) {
    return { success: false, error: 'Scan your saved donation QR first to activate donation tracking before uploading the parcel photo.' };
  }
  const nextQrMetadata = buildIndependentQrMetadataFromState({
    qrState,
    fallbackMetadata: parseQrMetadata(submission?.donor_notes || ''),
    updatedBy: databaseUserId || null,
  });

  const uploadPayload = await getPhotoUploadPayload(photo);
  const filePath = `${userId}/${submission.submission_id}/parcel-${detail.submission_detail_id}-${Date.now()}.jpg`;
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
    submission_detail_id: detail.submission_detail_id,
    file_path: filePath,
    image_type: 'independent_parcel_photo',
  }]);

  if (imageInsertResult.error) {
    return {
      success: false,
      error: imageInsertResult.error.message || 'Unable to save the parcel image record.',
    };
  }

  const logisticsResult = await fetchHairSubmissionLogisticsBySubmissionId(submission.submission_id);
  const logisticsPayload = {
    logistics_type: 'shipping',
    shipment_status: 'Pending',
    notes: `Independent donor parcel prepared. QR payload attached for monitoring. ${qrPayloadText ? 'QR reference generated.' : ''}`.trim(),
  };

  const saveLogisticsResult = logisticsResult.data?.submission_logistics_id
    ? await updateHairSubmissionLogisticsById(logisticsResult.data.submission_logistics_id, {
        ...logisticsResult.data,
        ...logisticsPayload,
      })
    : await createHairSubmissionLogistics({
        submission_id: submission.submission_id,
        ...logisticsPayload,
      });

  if (saveLogisticsResult.error) {
    return {
      success: false,
      error: saveLogisticsResult.error.message || 'Unable to save shipment status.',
    };
  }

  const trackingResult = await createHairBundleTrackingEntry({
    submission_id: submission.submission_id,
    submission_detail_id: detail.submission_detail_id,
    status: 'Pending',
    title: 'Parcel logged by donor',
    description: 'The donor uploaded a parcel image and prepared the independent donation QR for shipment.',
    changed_by: databaseUserId,
  });

  if (trackingResult.error) {
    return {
      success: false,
      error: trackingResult.error.message || 'Unable to save the timeline update.',
    };
  }

  const submissionUpdateResult = await updateHairSubmissionById(submission.submission_id, {
    donation_source: INDEPENDENT_DONATION_SOURCE,
    donor_notes: mergeDonationNotes(
      submission?.donor_notes || '',
      ['Donation path: independent donation.', 'Parcel image uploaded by donor before shipment.'],
      nextQrMetadata,
    ),
    status: 'Pending',
  });

  if (submissionUpdateResult.error) {
    return {
      success: false,
      error: submissionUpdateResult.error.message || 'Unable to update the donation submission state.',
    };
  }

  await persistDonationNotifications({
    userId,
    notifications: [
      buildDonationNotification({
        dedupeKey: `${notificationTypes.logisticsUpdated}:${submission.submission_id}:parcel-ready`,
        title: 'Parcel ready for shipment',
        message: 'Your parcel image was saved and your donation is ready for shipment.',
        createdAt: new Date().toISOString(),
        referenceId: submission.submission_id,
      }),
    ],
  });

  return {
    success: true,
    submission: submissionUpdateResult.data || submission,
    logistics: saveLogisticsResult.data || null,
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

  if (isTerminalDonationStatus(submission?.status)) {
    return { success: false, error: 'This donation is already closed and cannot be cancelled.' };
  }

  const normalizedReason = String(reason || '').trim();
  const cancellationNote = normalizedReason
    ? `Donation cancelled by donor. Reason: ${normalizedReason}`
    : 'Donation cancelled by donor from the donor module.';
  const existingQrMetadata = parseQrMetadata(submission?.donor_notes || '');
  const updatedNotes = mergeDonationNotes(
    submission?.donor_notes || '',
    [
      'Donation status changed to cancelled by donor.',
      cancellationNote,
    ],
    existingQrMetadata,
  );

  const submissionResult = await updateHairSubmissionById(submission.submission_id, {
    status: 'Cancelled',
    donor_notes: updatedNotes,
  });

  if (submissionResult.error || !submissionResult.data?.submission_id) {
    return {
      success: false,
      error: submissionResult.error?.message || 'Unable to cancel the donation right now.',
    };
  }

  const logisticsResult = await upsertSubmissionLogistics({
    submissionId: submission.submission_id,
    logisticsType: 'shipping',
    shipmentStatus: 'Cancelled',
    notes: cancellationNote,
  });

  if (logisticsResult.error) {
    return {
      success: false,
      error: logisticsResult.error.message || 'Unable to update donation logistics after cancellation.',
    };
  }

  if (detail?.submission_detail_id) {
    const trackingResult = await createHairBundleTrackingEntry({
      submission_id: submission.submission_id,
      submission_detail_id: detail.submission_detail_id,
      status: 'Cancelled',
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
        dedupeKey: `${notificationTypes.logisticsUpdated}:${submission.submission_id}:cancelled`,
        title: 'Donation cancelled',
        message: 'You cancelled your current donation. You can start a new donation anytime.',
        createdAt: new Date().toISOString(),
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
  const reference = currentQr?.reference || createDonationQrReference('IND');
  const qrPayload = buildDonationTrackingQrPayload({
    submission,
    detail: getLatestSubmissionDetailSnapshot(submission),
  });

  // Build QR image URL immediately (no network call)
  const qrImageUrl = buildQrImageUrl(qrPayload, 420);

  // Sync database in background (don't await)
  if (!currentQr?.is_valid) {
    const currentMetadata = getIndependentQrMetadata(submission);
    const generatedAt = new Date().toISOString();
    const nextMetadata = buildIndependentQrMetadata({
      reference,
      status: 'inactive',
      generatedAt,
      version: Number(currentMetadata?.version || 0) + 1,
      updatedBy: databaseUserId || null,
    });

    // Fire and forget - don't block UI
    syncIndependentDonationSubmission({
      userId,
      databaseUserId,
      submission,
      qrMetadata: nextMetadata,
      status: 'Pending',
      logisticsStatus: 'Pending',
      logisticsNotes: 'Your donation QR is saved and inactive until you scan it to activate donation tracking.',
      trackingTitle: 'Donation QR ready',
      trackingDescription: 'A donation QR was generated for the donor shipment flow and saved to the current donation record.',
      shouldTrack: true,
      shouldNotify: true,
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

export const ensureIndependentDonationQr = async ({
  userId = null,
  submission,
  databaseUserId,
  donationDriveId = null,
}) => {
  if (!submission?.submission_id) {
    return { success: false, error: 'A valid donation submission is required before generating a QR.' };
  }

  const currentQr = getIndependentDonationQrState({ submission });
  if (currentQr?.is_valid && currentQr.reference) {
    const syncedResult = await syncIndependentDonationSubmission({
      userId,
      databaseUserId,
      submission,
      qrMetadata: parseQrMetadata(submission?.donor_notes || ''),
      status: 'Submitted',
      logisticsStatus: currentQr.is_activated ? 'QR Active' : 'Submitted',
      logisticsNotes: currentQr.is_activated
        ? 'Donation submitted and the QR has been scanned by staff.'
        : 'Donation submitted. Attach the generated QR to the matching hair plastic for staff scanning.',
      shouldTrack: false,
      shouldNotify: false,
      donationDriveId,
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

  const currentMetadata = getIndependentQrMetadata(submission);
  const generatedAt = new Date().toISOString();
  const nextMetadata = buildIndependentQrMetadata({
    reference: createDonationQrReference('IND'),
    status: 'inactive',
    generatedAt,
    version: Number(currentMetadata?.version || 0) + 1,
    updatedBy: databaseUserId || null,
  });

  const syncedResult = await syncIndependentDonationSubmission({
    userId,
    databaseUserId,
    submission,
    qrMetadata: nextMetadata,
    status: 'Submitted',
    logisticsStatus: 'Submitted',
    logisticsNotes: 'Donation submitted. QR generated for staff scanning at the donation drive.',
    trackingTitle: 'Donation submitted',
    trackingDescription: 'The donor confirmed the hair submission and generated its QR.',
    shouldTrack: true,
    shouldNotify: true,
    donationDriveId,
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
      reference: nextMetadata.reference,
      generated_at: nextMetadata.generated_at || generatedAt,
      activated_at: '',
      version: nextMetadata.version ?? 1,
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

export const startIndependentDonationDraft = async ({
  userId = null,
  submission,
  databaseUserId,
  donationDriveId = null,
}) => {
  if (!submission?.submission_id) {
    return { success: false, error: 'A valid donation submission is required before starting donation flow.' };
  }

  const existingMetadata = parseQrMetadata(submission?.donor_notes || '');
  const syncedResult = await syncIndependentDonationSubmission({
    userId,
    databaseUserId,
    submission,
    qrMetadata: existingMetadata,
    status: 'Pending',
    logisticsStatus: 'Pending',
    logisticsNotes: 'Donation details saved. Submit the donation to generate the QR for the saved hair detail.',
    trackingTitle: 'Donation details saved',
    trackingDescription: 'Donation details are saved from Hair_Submissions and Hair_Submission_Details. Submit the donation to generate its QR.',
    shouldTrack: true,
    shouldNotify: false,
    donationDriveId,
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
  const nextMetadata = buildIndependentQrMetadata({
    reference: currentMetadata.reference,
    status: 'active',
    generatedAt: currentMetadata.generated_at,
    activatedAt,
    version: currentMetadata.version ?? 1,
    updatedBy: databaseUserId || null,
  });

  const syncedResult = await syncIndependentDonationSubmission({
    userId,
    databaseUserId,
    submission,
    qrMetadata: nextMetadata,
    status: 'Pending',
    logisticsStatus: 'Pending',
    logisticsNotes: 'Your donation QR is active and ready for shipment tracking.',
    trackingTitle: 'Donation QR activated',
    trackingDescription: 'The donor scanned the saved donation QR and activated donation tracking.',
    shouldTrack: true,
    shouldNotify: true,
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
  if (!scannedQr.submission_code) {
    return { success: false, error: 'The scanned code is not a valid Donivra donation QR.' };
  }

  if (
    scannedQr.submission_code !== submission.submission_code
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
    declared_length: screening?.estimated_length ?? referenceDetail?.declared_length ?? null,
    declared_color: screening?.detected_color || referenceDetail?.declared_color || null,
    declared_texture: screening?.detected_texture || referenceDetail?.declared_texture || null,
    declared_density: screening?.detected_density || referenceDetail?.declared_density || null,
    declared_condition: screening?.detected_condition || referenceDetail?.declared_condition || 'Analyzed',
    is_chemically_treated: referenceDetail?.is_chemically_treated ?? false,
    is_colored: referenceDetail?.is_colored ?? false,
    is_bleached: referenceDetail?.is_bleached ?? false,
    is_rebonded: referenceDetail?.is_rebonded ?? false,
    detail_notes: detailNotes,
    status: 'Pending',
  });

  if (detailResult.error || !detailResult.data?.submission_detail_id) {
    return {
      success: false,
      error: detailResult.error?.message || 'Unable to add the scanned bundle right now.',
    };
  }

  const submissionResult = await updateHairSubmissionById(submission.submission_id, {
    status: 'Pending',
    donor_notes: mergeDonationNotes(
      submission?.donor_notes || '',
      [
        `Added bundle via scan (${donorType === 'different' ? 'different donor' : 'own hair'}).`,
      ],
      parseQrMetadata(submission?.donor_notes || ''),
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
    status: 'Pending',
    title: 'Additional bundle added',
    description: donorType === 'different'
      ? 'An additional bundle from a different donor was added using scanned hair analysis.'
      : 'An additional bundle from the donor was added using scanned hair analysis.',
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
    detail: detailResult.data,
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
    status: 'Pending',
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

  const submissionResult = await updateHairSubmissionById(submission.submission_id, {
    status: 'Pending',
    donor_notes: mergeDonationNotes(
      submission?.donor_notes || '',
      [
        `Added bundle via manual entry (${donorType === 'different' ? 'different donor' : 'own hair'}).`,
      ],
      parseQrMetadata(submission?.donor_notes || ''),
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
    status: 'Pending',
    title: 'Additional bundle added',
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
    detail: detailResult.data,
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
    status: 'Pending',
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

  const submissionResult = await updateHairSubmissionById(submission.submission_id, {
    donor_notes: mergeDonationNotes(
      submission?.donor_notes || '',
      [
        'Manual hair donation details edited from the donor Donations module.',
        detailNotes,
      ],
      parseQrMetadata(submission?.donor_notes || ''),
    ),
    status: 'Pending',
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
    status: 'Pending',
    title: 'Hair details edited',
    description: 'The donor updated the saved hair donation details before QR submission.',
    changed_by: databaseUserId,
  });

  return {
    success: true,
    canProceed: evaluation.isQualified,
    qualification: evaluation,
    submission: submissionResult.data || submission,
    detail: detailResult.data,
  };
};

export const saveManualDonationQualification = async ({
  userId,
  databaseUserId,
  donorType = 'own',
  donationDriveId = null,
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
  const submissionNotes = buildManualDonationNotes({ manualDetails, evaluation, donorType });
  const uploadPayload = await getPhotoUploadPayload(photo);

  const submissionResult = await createHairSubmission({
    user_id: userId,
    database_user_id: databaseUserId,
    donation_drive_id: donationDriveId || null,
    submission_code: createDonationSubmissionCode('MAN'),
    donation_source: MANUAL_DONATION_SOURCE,
    donor_notes: submissionNotes,
    guardian_consent_id: permission.guardianConsentId || null,
    donor_age_at_submission: permission.donorAge,
    consent_checked_at: new Date().toISOString(),
    status: 'Pending',
  });

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
    status: 'Pending',
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

  const trackingResult = await createHairBundleTrackingEntry({
    submission_id: submissionResult.data.submission_id,
    submission_detail_id: detailResult.data.submission_detail_id,
    status: 'Pending',
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
    detail: detailResult.data,
  };
};

export const saveDriveDonationParticipation = async ({
  userId,
  databaseUserId,
  drive,
  submission,
  detail,
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

  const registrationResult = await createDonationDriveRegistration({
    driveId: drive.donation_drive_id,
    databaseUserId,
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

  const submissionResult = await updateHairSubmissionById(submission.submission_id, {
    donation_drive_id: drive.donation_drive_id,
    donation_source: DRIVE_DONATION_SOURCE,
    donor_notes: nextSubmissionNotes,
    status: 'Pending',
  });

  if (submissionResult.error || !submissionResult.data?.submission_id) {
    return {
      success: false,
      error: submissionResult.error?.message || 'Drive participation could not be linked to the donation submission.',
      submission: null,
      registration: registrationResult.data,
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
      status: 'Pending',
      title: 'Donation drive selected',
      description: `The donor selected ${drive?.event_title || 'the selected drive'} for this donation.`,
      changed_by: databaseUserId,
    });

    if (trackingResult.error) {
      return {
        success: false,
        error: trackingResult.error.message || 'Unable to save the drive participation timeline update.',
        submission: null,
        registration: registrationResult.data,
      };
    }

    await persistDonationNotifications({
      userId,
      notifications: [
        buildDonationNotification({
          dedupeKey: `${notificationTypes.logisticsUpdated}:${submissionResult.data.submission_id}:drive-selected:${drive.donation_drive_id}`,
          title: 'Donation drive selected',
          message: `${drive?.event_title || 'The donation drive'} was linked to your donation.`,
          createdAt: new Date().toISOString(),
          referenceId: submissionResult.data.submission_id,
        }),
      ],
    });
  }

  return {
    success: true,
    submission: submissionResult.data,
    registration: registrationResult.data,
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
    submissionCode: submissionEntry?.submission?.submission_code || 'Pending submission code',
    donationDate: submissionEntry?.submission?.created_at || certificateRow.issued_at || '',
    donationDateLabel: formatDateShort(submissionEntry?.submission?.created_at || certificateRow.issued_at || ''),
    bundleQuantity: Array.isArray(submissionEntry?.submission?.submission_details)
      ? submissionEntry.submission.submission_details.length
      : 0,
    decision: submissionEntry?.screening?.decision || 'Approved donation',
    summary: submissionEntry?.screening?.summary || certificateRow.remarks || '',
    issuedAt: certificateRow.issued_at || null,
    certificateType: certificateRow.certificate_type || '',
    fileUrl: certificateRow.file_url || '',
  };
};
