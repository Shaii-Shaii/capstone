import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as WigRequestAPI from './wigRequest.api';
import {
  buildImmediateNotificationEvents,
  recordNotifications,
} from './notification.service';
import {
  createPatientDetails,
  fetchPatientDetailsByUserId,
  resolveSystemUser,
  updatePatientPictureByPatientId,
} from './profile/api/profile.api';
import { ensureActiveSession } from '../api/supabase/client';
import { wigRequestStatuses } from './wigRequest.constants';
import { logAppError, logAppEvent, writeAuditLog } from '../utils/appErrors';

const getFileExtension = (mimeType = 'image/jpeg') => {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
};

const buildUploadedWigRequestImageUrl = async ({
  userId,
  image,
  fileNamePrefix = 'wig-reference',
}) => {
  if (!image?.uri) return null;

  const sessionResult = await ensureActiveSession();
  const activeAuthUserId = sessionResult?.session?.user?.id || '';
  if (sessionResult?.error || !activeAuthUserId) {
    throw new Error('Please sign in again before uploading your wig request image.');
  }

  if (userId && activeAuthUserId !== userId) {
    throw new Error('Your session changed. Please sign in again before submitting a wig request.');
  }

  const fileResponse = await fetch(image.uri);
  const fileBody = await fileResponse.arrayBuffer();
  const extension = getFileExtension(image.mimeType);
  const filePath = `${activeAuthUserId}/${fileNamePrefix}-${Date.now()}.${extension}`;

  const uploadResult = await WigRequestAPI.uploadWigReferenceImage({
    path: filePath,
    fileBody,
    contentType: image.mimeType || 'image/jpeg',
  });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message || 'Unable to upload the wig request image.');
  }

  const { data } = WigRequestAPI.getStoragePublicUrl({ path: filePath });
  return data?.publicUrl || filePath;
};

const buildReferenceImageUrl = async ({ userId, referenceImage }) =>
  buildUploadedWigRequestImageUrl({
    userId,
    image: referenceImage,
    fileNamePrefix: 'wig-reference',
  });

const buildPreviewImageUrl = async ({ userId, previewImage }) =>
  buildUploadedWigRequestImageUrl({
    userId,
    image: previewImage,
    fileNamePrefix: 'wig-preview',
  });

const COMPLETED_REQUEST_TOKENS = ['completed', 'claimed', 'released', 'cancelled', 'canceled', 'rejected', 'closed'];
const TERMINAL_WIG_REQUEST_STATUSES = new Set(['released', 'returned - completed', 'rejected', 'cancelled', 'canceled']);

const normalizeWigRequestStatus = (value) => String(value || '').trim().toLowerCase();
const WIG_REQUEST_CANCELLATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const WIG_REQUEST_CANCELLATION_BLOCKERS = [
  'accepted',
  'approved',
  'preparing',
  'production',
  'to be release',
  'releasing',
  'released',
  'ready for claiming',
  'claimed',
  'completed',
  'cancelled',
  'canceled',
  'rejected',
  'closed',
];

const isOngoingWigRequest = (request) => {
  if (!request?.req_id) return false;
  const status = String(request.status || '').trim().toLowerCase();
  if (!status) return true;
  return !COMPLETED_REQUEST_TOKENS.some((token) => status.includes(token));
};

export const getWigRequestCancellationEligibility = (request, now = Date.now()) => {
  if (!request?.req_id) {
    return { canCancel: false, daysRemaining: 0, expiresAt: null, reason: 'No active request was found.' };
  }

  const status = String(request.status || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (WIG_REQUEST_CANCELLATION_BLOCKERS.some((token) => status.includes(token))) {
    return {
      canCancel: false,
      daysRemaining: 0,
      expiresAt: null,
      reason: 'Cancellation is no longer available because wig preparation has started or the request is already closed.',
    };
  }

  const requestedAt = new Date(request.request_date || '').getTime();
  if (!Number.isFinite(requestedAt)) {
    return {
      canCancel: false,
      daysRemaining: 0,
      expiresAt: null,
      reason: 'The cancellation window could not be verified. Please contact support for help.',
    };
  }

  const expiresAtMs = requestedAt + WIG_REQUEST_CANCELLATION_WINDOW_MS;
  const remainingMs = expiresAtMs - now;
  if (remainingMs < 0) {
    return {
      canCancel: false,
      daysRemaining: 0,
      expiresAt: new Date(expiresAtMs).toISOString(),
      reason: 'The seven-day cancellation window has ended.',
    };
  }

  return {
    canCancel: true,
    daysRemaining: Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))),
    expiresAt: new Date(expiresAtMs).toISOString(),
    reason: '',
  };
};

const escapeReceiptHtml = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatReceiptDate = (value) => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

const uploadPrivateReleaseFile = async ({ userId, relativePath, asset, contentType }) => {
  const sessionResult = await ensureActiveSession();
  const authUserId = sessionResult?.session?.user?.id || '';
  if (!authUserId || sessionResult?.error || (userId && authUserId !== userId)) {
    throw new Error('Please sign in again before uploading this file.');
  }
  if (!asset?.uri) throw new Error('Choose a valid file first.');
  const response = await fetch(asset.uri);
  const fileBody = await response.arrayBuffer();
  const path = `${authUserId}/${relativePath}`;
  const result = await WigRequestAPI.uploadWigReleaseDocument({
    path,
    fileBody,
    contentType: contentType || asset.mimeType || 'application/octet-stream',
  });
  if (result.error) throw new Error(result.error.message || 'Unable to upload the file.');
  return path;
};

const buildReleaseReceiptHtml = ({ request, receipt, wig }) => `
  <html><head><meta charset="utf-8" /><style>
    @page { size: A4; margin: 0; }
    body { margin: 0; padding: 52px; color: #3B171D; font-family: Arial, sans-serif; }
    .header { padding: 28px; border-radius: 18px; color: white; background: #740D24; }
    h1 { margin: 8px 0 0; font-size: 30px; } .brand { font-weight: 800; letter-spacing: 3px; }
    .grid { margin-top: 28px; border: 1px solid #E1CCD1; border-radius: 16px; overflow: hidden; }
    .row { display: flex; border-bottom: 1px solid #E1CCD1; } .row:last-child { border-bottom: 0; }
    .label, .value { padding: 14px 16px; } .label { width: 34%; font-weight: 700; background: #FAF3F5; }
    .value { width: 66%; } .statement { margin-top: 28px; line-height: 1.6; }
  </style></head><body>
    <div class="header"><div class="brand">DONIVRA</div><h1>Wig Release Receipt</h1></div>
    <div class="grid">
      <div class="row"><div class="label">Receipt ID</div><div class="value">${escapeReceiptHtml(receipt?.receipt_id)}</div></div>
      <div class="row"><div class="label">Request Code</div><div class="value">${escapeReceiptHtml(request?.request_code)}</div></div>
      <div class="row"><div class="label">Release Cycle</div><div class="value">${escapeReceiptHtml(receipt?.release_cycle || 1)}</div></div>
      <div class="row"><div class="label">Wig</div><div class="value">${escapeReceiptHtml(wig?.wig_name || 'Allocated wig')}${wig?.wig_code ? ` (${escapeReceiptHtml(wig.wig_code)})` : ''}</div></div>
      <div class="row"><div class="label">Cap Size</div><div class="value">${escapeReceiptHtml(request?.requested_cap_size || 'Not specified')}</div></div>
      <div class="row"><div class="label">Released At</div><div class="value">${escapeReceiptHtml(formatReceiptDate(receipt?.released_at))}</div></div>
      <div class="row"><div class="label">Received At</div><div class="value">${escapeReceiptHtml(formatReceiptDate(receipt?.received_confirmed_at))}</div></div>
      <div class="row"><div class="label">Terms Version</div><div class="value">${escapeReceiptHtml(receipt?.terms_version)}</div></div>
    </div>
    <p class="statement">The patient confirmed physical receipt of the wig and accepted the release terms for this release cycle.</p>
  </body></html>`;

const ensurePatientDetails = async (userId) => {
  const { data: existingPatientDetails, error: patientDetailsError } = await fetchPatientDetailsByUserId(userId);
  if (patientDetailsError) {
    throw new Error(patientDetailsError.message || 'Unable to load patient details.');
  }

  if (existingPatientDetails?.id) {
    return existingPatientDetails;
  }

  const { data: createdPatientDetails, error: createPatientDetailsError } = await createPatientDetails({
    user_id: userId,
  });

  if (!createPatientDetailsError && createdPatientDetails?.id) {
    return createdPatientDetails;
  }

  const createErrorMessage = String(createPatientDetailsError?.message || '').toLowerCase();
  if (createErrorMessage.includes('duplicate') || createErrorMessage.includes('already exists')) {
    const { data: retriedPatientDetails, error: retriedPatientDetailsError } = await fetchPatientDetailsByUserId(userId);
    if (retriedPatientDetailsError) {
      throw new Error(retriedPatientDetailsError.message || 'Unable to load patient details.');
    }

    if (retriedPatientDetails?.id) {
      return retriedPatientDetails;
    }
  }

  throw new Error(
    createPatientDetailsError?.message
    || 'Unable to prepare the patient record needed for wig requests.'
  );
};

export const getPatientWigRequestContext = async (userId) => {
  try {
    if (!userId) {
      throw new Error('Your session is not ready.');
    }

    const sessionResult = await ensureActiveSession();
    const activeAuthUserId = sessionResult?.session?.user?.id || '';
    if (sessionResult?.error || !activeAuthUserId) {
      throw new Error('Your session has expired. Please sign in again.');
    }
    if (activeAuthUserId !== userId) {
      throw new Error('Your session changed. Please sign in again.');
    }

    logAppEvent('wig_request.context', 'Loading wig request context.', {
      userId,
    });

    const patientDetails = await ensurePatientDetails(userId);

    const { data: patientRequests, error: wigRequestError } =
      await WigRequestAPI.fetchPatientWigRequestsByPatientId(patientDetails.patient_id);

    if (wigRequestError) {
      throw new Error(wigRequestError.message || 'Unable to load wig requests.');
    }

    const { data: requestReceipts, error: requestReceiptsError } =
      await WigRequestAPI.fetchWigReleaseReceiptsByRequestIds((patientRequests || []).map((request) => request.req_id));
    if (requestReceiptsError) {
      throw new Error(requestReceiptsError.message || 'Unable to load wig release receipts.');
    }
    const { data: requestWigs, error: requestWigsError } = await WigRequestAPI.fetchWigSummariesByIds(
      (patientRequests || []).map((request) => request.allocated_wig_id || request.requested_wig_id)
    );
    if (requestWigsError) {
      throw new Error(requestWigsError.message || 'Unable to load wig request summaries.');
    }
    const requestWigById = new Map((requestWigs || []).map((wig) => [String(wig.wig_id), wig]));
    const latestReceiptByRequestId = new Map();
    (requestReceipts || []).forEach((receipt) => {
      if (!latestReceiptByRequestId.has(String(receipt.req_id))) {
        latestReceiptByRequestId.set(String(receipt.req_id), receipt);
      }
    });
    const activeRequest = (patientRequests || []).find((request) => (
      !TERMINAL_WIG_REQUEST_STATUSES.has(normalizeWigRequestStatus(request.status))
    )) || null;
    const confirmationRequest = !activeRequest
      ? (patientRequests || []).find((request) => {
          const receipt = latestReceiptByRequestId.get(String(request.req_id));
          return normalizeWigRequestStatus(request.status) === 'released'
            && receipt
            && !receipt.received_confirmed_at;
        }) || null
      : null;
    const latestWigRequest = activeRequest || confirmationRequest;
    const activeRequestMode = activeRequest
      ? 'active'
      : confirmationRequest
        ? 'receipt_confirmation'
        : 'none';
    const previousRequests = (patientRequests || [])
      .filter((request) => String(request.req_id) !== String(latestWigRequest?.req_id || ''))
      .map((request) => ({
        ...request,
        latest_release_receipt: latestReceiptByRequestId.get(String(request.req_id)) || null,
        wig: requestWigById.get(String(request.allocated_wig_id || request.requested_wig_id)) || null,
      }));

    const shouldLoadRequestDetails = Boolean(latestWigRequest?.req_id);
    const { data: latestAllocation, error: allocationError } = shouldLoadRequestDetails
      ? await WigRequestAPI.fetchLatestWigAllocationByPatientDetailsId(patientDetails.patient_id, latestWigRequest.req_id)
      : { data: null, error: null };

    if (allocationError) throw new Error(allocationError.message || 'Unable to load the latest wig allocation.');

    const { data: latestWigSpecification, error: wigSpecificationError } = shouldLoadRequestDetails
      ? await WigRequestAPI.fetchLatestWigSpecificationByRequestId(latestWigRequest.req_id)
      : { data: null, error: null };

    if (wigSpecificationError) {
      throw new Error(wigSpecificationError.message || 'Unable to load the latest wig specification.');
    }

    const hospitalId = latestWigRequest?.hospital_id || patientDetails.hospital_id || null;
    const selectedWigId = shouldLoadRequestDetails
      ? latestWigRequest?.allocated_wig_id
        || latestAllocation?.wig_id
        || latestWigRequest?.requested_wig_id
        || null
      : null;

    const [
      { data: requestHospital, error: hospitalError },
      { data: requestWig, error: requestWigError },
      { data: latestReleaseSchedule, error: releaseScheduleError },
      { data: safetyAssessment, error: safetyAssessmentError },
      { data: tryOnSelections, error: tryOnSelectionsError },
    ] = await Promise.all([
      hospitalId ? WigRequestAPI.fetchHospitalById(hospitalId) : { data: null, error: null },
      selectedWigId ? WigRequestAPI.fetchWigDetailsById(selectedWigId) : { data: null, error: null },
      shouldLoadRequestDetails
        ? WigRequestAPI.fetchLatestReleaseScheduleByRequestId(latestWigRequest.req_id)
        : { data: null, error: null },
      shouldLoadRequestDetails
        ? WigRequestAPI.fetchPatientWigSafetyAssessmentByRequestId(latestWigRequest.req_id)
        : { data: null, error: null },
      shouldLoadRequestDetails
        ? WigRequestAPI.fetchPatientWigTryOnSelections(latestWigRequest.req_id)
        : { data: [], error: null },
    ]);

    if (hospitalError) {
      throw new Error(hospitalError.message || 'Unable to load the request hospital.');
    }

    if (requestWigError) {
      throw new Error(requestWigError.message || 'Unable to load the request wig specification.');
    }

    if (releaseScheduleError) {
      throw new Error(releaseScheduleError.message || 'Unable to load the release schedule.');
    }

    if (safetyAssessmentError) {
      throw new Error(safetyAssessmentError.message || 'Unable to load the wig safety assessment.');
    }

    if (tryOnSelectionsError) {
      throw new Error(tryOnSelectionsError.message || 'Unable to load the saved try-on choices.');
    }

    const releaseReceipt = latestWigRequest?.req_id
      ? latestReceiptByRequestId.get(String(latestWigRequest.req_id)) || null
      : null;
    const { data: releaseAppeal, error: releaseAppealError } = releaseReceipt?.receipt_id
      ? await WigRequestAPI.fetchPatientWigReleaseAppeal(releaseReceipt.receipt_id)
      : { data: null, error: null };
    if (releaseAppealError) {
      throw new Error(releaseAppealError.message || 'Unable to load the wig release appeal.');
    }

    return {
      patientDetails,
      latestWigRequest,
      latestWigSpecification,
      latestAllocation,
      requestHospital,
      requestWig,
      latestReleaseSchedule,
      safetyAssessment,
      tryOnSelections,
      releaseReceipt,
      releaseAppeal,
      activeRequestMode,
      previousRequests,
      error: null,
    };
  } catch (error) {
    return {
      patientDetails: null,
      latestWigRequest: null,
      latestWigSpecification: null,
      latestAllocation: null,
      requestHospital: null,
      requestWig: null,
      latestReleaseSchedule: null,
      safetyAssessment: null,
      tryOnSelections: [],
      releaseReceipt: null,
      releaseAppeal: null,
      activeRequestMode: 'none',
      previousRequests: [],
      error: error.message || 'Unable to load the patient wig request context.',
    };
  }
};

export const getActiveWigTryOnFilters = async () => {
  try {
    const [{ data, error }, { data: physicalSpecs, error: physicalSpecError }] = await Promise.all([
      WigRequestAPI.fetchActiveWigAiFilters(),
      WigRequestAPI.fetchWigPhysicalSpecifications(),
    ]);

    if (error) {
      throw new Error(error.message || 'Unable to load available wigs.');
    }

    if (physicalSpecError) {
      throw new Error(physicalSpecError.message || 'Unable to load wig specifications.');
    }

    const physicalSpecsByWigId = new Map(
      (physicalSpecs || []).map((specification) => [String(specification.wig_id), specification])
    );
    const wigs = (data || []).map((wig) => ({
      ...wig,
      physical_specification: physicalSpecsByWigId.get(String(wig.wig_id)) || {
        wig_id: wig.wig_id || null,
        length: wig.pending_hair_length ?? null,
        color: wig.pending_hair_color || '',
        hair_texture: wig.pending_hair_texture || '',
        hair_density: wig.pending_hair_density || '',
        cap_size: wig.pending_cap_size || '',
        style: wig.pending_style || '',
      },
    }));

    return {
      wigs,
      error: null,
    };
  } catch (error) {
    logAppError('wig_request.try_on_filters', error);
    return {
      wigs: [],
      error: error.message || 'Unable to load available wigs.',
    };
  }
};

const normalizePreferenceText = (value) => String(value ?? '').trim();

const formatLengthPreference = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return '';
  return Number.isInteger(numericValue) ? String(numericValue) : String(Number(numericValue.toFixed(2)));
};

const collectUnique = (items, mapper) => {
  const values = [];
  const seen = new Set();

  items.forEach((item) => {
    const value = normalizePreferenceText(mapper(item));
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    values.push(value);
  });

  return values;
};

export const getWigPreferenceOptions = async () => {
  try {
    const { data, error } = await WigRequestAPI.fetchWigPhysicalSpecifications();

    if (error) {
      throw new Error(error.message || 'Unable to load wig preference options.');
    }

    const specifications = data || [];

    return {
      options: {
        lengths: collectUnique(specifications, (item) => formatLengthPreference(item.length)),
        colors: collectUnique(specifications, (item) => item.color),
        textures: collectUnique(specifications, (item) => item.hair_texture),
        densities: collectUnique(specifications, (item) => item.hair_density),
        capSizes: collectUnique(specifications, (item) => item.cap_size),
        styles: collectUnique(specifications, (item) => item.style),
      },
      error: null,
    };
  } catch (error) {
    logAppError('wig_request.preference_options', error);
    return {
      options: {
        lengths: [],
        colors: [],
        textures: [],
        densities: [],
        capSizes: [],
        styles: [],
      },
      error: error.message || 'Unable to load wig preference options.',
    };
  }
};

export const getPatientWigRequestHistoryDetails = async (request) => {
  try {
    if (!request?.req_id) throw new Error('Wig request not found.');
    const wigId = request.allocated_wig_id || request.requested_wig_id || null;
    const [specificationResult, wigResult, receiptsResult, appealsResult] = await Promise.all([
      WigRequestAPI.fetchLatestWigSpecificationByRequestId(request.req_id),
      wigId ? WigRequestAPI.fetchWigDetailsById(wigId) : Promise.resolve({ data: null, error: null }),
      WigRequestAPI.fetchPatientWigReleaseReceipts(request.req_id),
      WigRequestAPI.fetchPatientWigReleaseAppealsByRequestId(request.req_id),
    ]);
    const firstError = specificationResult.error || wigResult.error || receiptsResult.error || appealsResult.error;
    if (firstError) throw new Error(firstError.message || 'Unable to load request history.');
    return {
      details: {
        request,
        specification: specificationResult.data || null,
        wig: wigResult.data || null,
        receipts: receiptsResult.data || [],
        appeals: appealsResult.data || [],
      },
      error: null,
    };
  } catch (error) {
    return { details: null, error: error.message || 'Unable to load request history.' };
  }
};

export const beginPatientWigRequestFlow = async ({ userId }) => {
  try {
    if (!userId) throw new Error('Your session is not ready.');
    const sessionResult = await ensureActiveSession();
    if (sessionResult?.error || sessionResult?.session?.user?.id !== userId) {
      throw new Error('Your session has expired. Please sign in again.');
    }

    // Patient_ID, Requested_By, and Hospital_ID are resolved inside the RPC.
    // The client never supplies ownership or staff-controlled fields.
    const { data, error } = await WigRequestAPI.beginOrResumePatientWigRequest();
    if (error) throw new Error(error.message || 'Unable to start the wig request.');
    return { wigRequest: data, error: null };
  } catch (error) {
    logAppError('wig_request.begin', error, { userId });
    return { wigRequest: null, error: error.message || 'Unable to start the wig request.' };
  }
};

export const discardPatientWigRequestDraft = async ({ userId, reqId }) => {
  try {
    if (!userId || !reqId) return { discarded: true, error: null };
    const sessionResult = await ensureActiveSession();
    if (sessionResult?.error || sessionResult?.session?.user?.id !== userId) {
      throw new Error('Your session has expired. Please sign in again.');
    }

    const { data, error } = await WigRequestAPI.discardIncompletePatientWigRequest(reqId);
    if (error) throw new Error(error.message || 'Unable to discard the unfinished request.');
    if (!data) throw new Error('The unfinished request was not discarded.');

    return { discarded: true, error: null };
  } catch (error) {
    logAppEvent('wig_request.discard_draft', 'Unable to discard an unfinished wig request.', {
      userId,
      reqId,
      message: error.message || 'Unknown discard error',
    });
    return {
      discarded: false,
      error: error.message || 'Unable to discard the unfinished request.',
    };
  }
};

export const savePatientWigCapSize = async ({ userId, reqId, capSize }) => {
  try {
    if (!userId || !reqId) throw new Error('Start the wig request first.');
    const { data, error } = await WigRequestAPI.setPatientWigRequestCapSize({ reqId, capSize });
    if (error) throw new Error(error.message || 'Unable to save the cap size.');
    return { wigRequest: data, error: null };
  } catch (error) {
    return { wigRequest: null, error: error.message || 'Unable to save the cap size.' };
  }
};

export const confirmPatientWigTryOnCandidates = async ({ userId, reqId, wigs }) => {
  try {
    if (!userId || !reqId) throw new Error('Start the wig request first.');
    if (!Array.isArray(wigs) || wigs.length !== 3 || new Set(wigs.map((wig) => String(wig?.wig_id))).size !== 3) {
      throw new Error('Select exactly three unique wigs.');
    }
    const candidates = wigs.map((wig) => ({
      wig_id: wig.wig_id,
      wig_specification_id: wig?.physical_specification?.id,
      filter_id: wig.filter_id || wig.id,
    }));
    if (candidates.some((candidate) => !candidate.wig_id || !candidate.wig_specification_id || !candidate.filter_id)) {
      throw new Error('One of the selected catalog wigs is missing its try-on configuration.');
    }
    const { data, error } = await WigRequestAPI.replacePatientWigTryOnCandidates({ reqId, candidates });
    if (error) throw new Error(error.message || 'Unable to confirm the three wigs.');
    return { selections: data, error: null };
  } catch (error) {
    return { selections: [], error: error.message || 'Unable to confirm the three wigs.' };
  }
};

export const savePatientWigTryOnResults = async ({ userId, reqId, referenceImage, preview }) => {
  try {
    const options = Array.isArray(preview?.options) ? preview.options : [];
    if (!userId || !reqId || options.length !== 3) {
      throw new Error('Exactly three try-on results are required.');
    }
    const results = options.map((option, index) => ({
      wig_id: option?.selected_wig?.wig_id || option?.id,
      rank: option?.option_index || index + 1,
      score: option?.score ?? null,
      reason: option?.suitability_reason || option?.note || '',
      generated_image_url: option?.generated_image_data_url || option?.preview_url || '',
      generated_image_path: '',
      provider: preview?.provider || 'openrouter',
    }));
    const sourceImageUrl = /^https?:\/\//i.test(String(referenceImage?.uri || ''))
      ? referenceImage.uri
      : 'inline-patient-photo';
    const { data, error } = await WigRequestAPI.recordPatientWigTryOnResults({
      reqId,
      sourceImagePath: sourceImageUrl,
      sourceImageUrl,
      results,
    });
    if (error) throw new Error(error.message || 'Unable to save the try-on results.');
    return { selections: data, error: null };
  } catch (error) {
    return { selections: [], error: error.message || 'Unable to save the try-on results.' };
  }
};

export const finalizePatientWigRequestFlow = async ({
  userId,
  reqId,
  preview,
  selectedWigId,
  specialNotes = '',
}) => {
  try {
    if (!userId || !reqId || !selectedWigId) throw new Error('Choose one final wig first.');
    const options = Array.isArray(preview?.options) ? preview.options : [];
    const selectedOption = options.find((option) => (
      String(option?.selected_wig?.wig_id || option?.id) === String(selectedWigId)
    ));
    if (!selectedOption) throw new Error('Choose one of your three generated wig previews.');

    const previewUrl = selectedOption.generated_image_data_url || selectedOption.preview_url || '';
    const { data: wigRequest, error } = await WigRequestAPI.finalizePatientWigRequest({
      reqId,
      wigId: selectedWigId,
      previewUrl,
      specialNotes,
    });
    if (error) throw new Error(error.message || 'Unable to submit the wig request.');

    const notificationEvents = buildImmediateNotificationEvents({ role: 'patient', payload: { wigRequest } });
    if (notificationEvents.length) {
      void recordNotifications({ userId, role: 'patient', notifications: notificationEvents }).catch(() => {});
    }
    return { wigRequest, error: null };
  } catch (error) {
    logAppError('wig_request.finalize', error, { userId, reqId });
    return { wigRequest: null, error: error.message || 'Unable to submit the wig request.' };
  }
};

export const acceptPatientWigRelease = async ({ userId, request, receipt, wig, confirmationPhoto }) => {
  let confirmationPhotoPath = '';
  try {
    if (!receipt?.receipt_id || !request?.req_id) {
      throw new Error('A valid wig release receipt is required.');
    }
    if (confirmationPhoto?.uri) {
      const extension = getFileExtension(confirmationPhoto.mimeType || 'image/jpeg');
      confirmationPhotoPath = await uploadPrivateReleaseFile({
        userId,
        relativePath: `receipts/request-${request.req_id}/receipt-${receipt.receipt_id}/cycle-${receipt.release_cycle || 1}/confirmation.${extension}`,
        asset: confirmationPhoto,
        contentType: confirmationPhoto.mimeType || 'image/jpeg',
      });
    }
    const { data, error } = await WigRequestAPI.acceptPatientWigReleaseReceipt({
      receiptId: receipt.receipt_id,
      confirmationPhotoPath: confirmationPhotoPath || null,
    });
    if (error) throw new Error(error.message || 'Unable to confirm receipt.');

    let confirmedReceipt = data;
    let pdfWarning = null;
    try {
      const pdf = await Print.printToFileAsync({
        html: buildReleaseReceiptHtml({ request, receipt: confirmedReceipt, wig }),
        base64: false,
      });
      const pdfPath = await uploadPrivateReleaseFile({
        userId,
        relativePath: `receipts/request-${request.req_id}/receipt-${receipt.receipt_id}/cycle-${receipt.release_cycle || 1}/release-receipt.pdf`,
        asset: { uri: pdf.uri, mimeType: 'application/pdf' },
        contentType: 'application/pdf',
      });
      const savedPdf = await WigRequestAPI.savePatientWigReleaseReceiptPdfPath({
        receiptId: receipt.receipt_id,
        pdfPath,
      });
      if (savedPdf.error) throw savedPdf.error;
      confirmedReceipt = savedPdf.data || { ...confirmedReceipt, pdf_path: pdfPath };
    } catch (pdfError) {
      pdfWarning = pdfError?.message || 'The receipt was confirmed, but its PDF is not ready yet.';
    }
    return { receipt: confirmedReceipt, error: null, pdfWarning };
  } catch (error) {
    if (confirmationPhotoPath) {
      await WigRequestAPI.removeWigReleaseDocuments([confirmationPhotoPath]).catch(() => {});
    }
    return { receipt: null, error: error.message || 'Unable to confirm receipt.' };
  }
};

export const uploadPatientWigAppealPhotos = async ({ userId, request, receipt, photos = [] }) => {
  const uploadedPaths = [];
  try {
    if (photos.length < 1 || photos.length > 4) throw new Error('Attach 1 to 4 wig photos.');
    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      const extension = getFileExtension(photo?.mimeType || 'image/jpeg');
      const path = await uploadPrivateReleaseFile({
        userId,
        relativePath: `appeals/request-${request.req_id}/receipt-${receipt.receipt_id}/cycle-${receipt.release_cycle || 1}/photo-${index + 1}-${Date.now()}.${extension}`,
        asset: photo,
        contentType: photo?.mimeType || 'image/jpeg',
      });
      uploadedPaths.push(path);
    }
    return { paths: uploadedPaths, error: null };
  } catch (error) {
    if (uploadedPaths.length) await WigRequestAPI.removeWigReleaseDocuments(uploadedPaths).catch(() => {});
    return { paths: [], error: error.message || 'Unable to upload appeal photos.' };
  }
};

export const submitPatientWigAppeal = async ({ receiptId, reason, description, evidencePaths = [], requestedResolution }) => {
  const { data, error } = await WigRequestAPI.submitPatientWigReleaseAppeal({
    receiptId,
    reason,
    description,
    evidencePaths,
    requestedResolution,
  });
  if (error && evidencePaths.length) {
    await WigRequestAPI.removeWigReleaseDocuments(evidencePaths).catch(() => {});
  }
  return { appeal: data, error: error?.message || null };
};

export const downloadPatientWigReleaseReceipt = async (receipt) => {
  try {
    if (!receipt?.pdf_path) throw new Error('The receipt PDF is not ready yet.');
    const signed = await WigRequestAPI.createWigReleaseDocumentSignedUrl(receipt.pdf_path, 120);
    if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message || 'Unable to access the receipt PDF.');
    if (!FileSystem.cacheDirectory) throw new Error('Downloads are unavailable on this device.');
    const uri = `${FileSystem.cacheDirectory}wig-release-receipt-${receipt.receipt_id}-cycle-${receipt.release_cycle || 1}.pdf`;
    await FileSystem.downloadAsync(signed.data.signedUrl, uri);
    if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Save Wig Release Receipt' });
    return { success: true, uri, error: null };
  } catch (error) {
    return { success: false, error: error.message || 'Unable to download the receipt PDF.' };
  }
};

export const savePatientWigRequestFlow = async ({
  userId,
  preferences,
  preview,
  previewImage,
  referenceImage,
  selectedWigId = null,
}) => {
  try {
    if (!userId) throw new Error('Your session is not ready.');

    logAppEvent('wig_request.save', 'Saving wig request flow.', {
      userId,
      hasReferenceImage: Boolean(referenceImage?.uri),
      hasPreviewImage: Boolean(previewImage?.uri),
      hasPreview: Boolean(preview),
      previewKeys: preview ? Object.keys(preview) : [],
      selectedOptionId: preview?.selected_option_id || '',
      selectedOptionIndex: preview?.selected_option_index || null,
    });

    const patientDetails = await ensurePatientDetails(userId);

    const { data: existingWigRequest, error: existingWigRequestError } =
      await WigRequestAPI.fetchLatestWigRequestByPatientDetailsId(patientDetails.patient_id);

    if (existingWigRequestError) {
      throw new Error(existingWigRequestError.message || 'Unable to check existing wig requests.');
    }

    if (isOngoingWigRequest(existingWigRequest)) {
      logAppEvent('wig_request.save', 'Existing ongoing wig request found; skipping duplicate create.', {
        userId,
        reqId: existingWigRequest.req_id || null,
      }, 'info');

      return {
        wigRequest: existingWigRequest,
        wigSpecification: null,
        alreadyExists: true,
        warning: null,
        error: null,
      };
    }

    const { data: systemUser, error: systemUserError } = await resolveSystemUser(userId);
    if (systemUserError) {
      throw new Error(systemUserError.message || 'Unable to resolve the patient account.');
    }

    let savedPreviewImageUrl = null;
    if (previewImage?.uri) {
      try {
        savedPreviewImageUrl = await buildPreviewImageUrl({ userId, previewImage });
      } catch (uploadError) {
        logAppEvent('wig_request.save', 'Adjusted wig preview upload failed.', {
          userId,
          patientId: patientDetails.patient_id,
          uploadError: uploadError.message || 'Wig preview upload error',
        }, 'warn');
        throw uploadError;
      }
    }

    // Create main wig request first (BEFORE uploading reference image)
    const { data: wigRequest, error: wigRequestError } = await WigRequestAPI.createWigRequest({
      patient_id: patientDetails.patient_id,
      hospital_id: patientDetails.hospital_id || null,
      requested_by: systemUser?.user_id || null,
      request_date: new Date().toISOString(),
      status: wigRequestStatuses.pending,
      requested_wig_id: selectedWigId || null,
      requested_cap_size: preferences.capSize || null,
      is_wish_request: !selectedWigId,
      fulfillment_status: 'catalog_review',
    });

    if (wigRequestError) {
      throw new Error(wigRequestError.message || 'Unable to create the wig request.');
    }

    // Upload reference image AFTER wig request is created
    // If upload fails, the request still succeeds (reference photo is optional)
    let referenceImageUrl = null;
    if (referenceImage?.uri) {
      try {
        referenceImageUrl = await buildReferenceImageUrl({ userId, referenceImage });
        
        if (referenceImageUrl && patientDetails.patient_id) {
          logAppEvent('wig_request.save', 'Updating patient reference image after wig request creation.', {
            userId,
            patientId: patientDetails.patient_id,
          });

          const patientPictureResult = await updatePatientPictureByPatientId(patientDetails.patient_id, referenceImageUrl);
          if (patientPictureResult.error) {
            logAppEvent('wig_request.save', 'Failed to update patient picture, but wig request is created.', {
              userId,
              patientId: patientDetails.patient_id,
              error: patientPictureResult.error.message || 'Unable to save the patient reference photo.',
            }, 'warn');
            // Don't throw - reference photo update is not critical
          }
        }
      } catch (uploadError) {
        logAppEvent('wig_request.save', 'Reference image upload failed, but wig request is created and will continue.', {
          userId,
          patientId: patientDetails.patient_id,
          uploadError: uploadError.message || 'Reference image upload error',
        }, 'warn');
        // Don't throw - reference photo is optional
      }
    }

    logAppEvent('wig_request.save', 'Wig request row created.', {
      userId,
      reqId: wigRequest?.req_id || null,
      patientId: patientDetails.patient_id,
    });

    const preferenceNotes = [
      preferences.hairDensity ? `Hair density preference: ${preferences.hairDensity}` : '',
      preferences.specialNotes,
      preview?.style_notes,
      preview?.summary,
    ].filter(Boolean).join('\n\n') || null;

    const { data: wigSpecification, error: wigSpecificationError } = await WigRequestAPI.createWigSpecification({
      wig_request_id: wigRequest.req_id,
      preferred_color: preferences.preferredColor,
      preferred_length: preferences.preferredLength,
      hair_texture: preferences.hairTexture || null,
      cap_size: preferences.capSize || null,
      style_preference: preferences.stylePreference || preview?.recommended_style_name || null,
      notes: preferenceNotes,
      ai_wig_preview_url: savedPreviewImageUrl || preview?.preview_url || preview?.generated_image_data_url || null,
    });

    logAppEvent('wig_request.save', 'Wig specification payload prepared.', {
      userId,
      reqId: wigRequest?.req_id || null,
      previewPayloadKeys: preview ? Object.keys(preview) : [],
      selectedOptionId: preview?.selected_option_id || '',
      selectedPreviewUrl: savedPreviewImageUrl || preview?.preview_url || preview?.generated_image_data_url || '',
      dbPayloadKeys: [
        'preferred_color',
        'preferred_length',
        'hair_texture',
        'cap_size',
        'style_preference',
        'special_notes',
        'ai_wig_preview_url',
      ],
      renderKey: 'ai_wig_preview_url',
    });

    let savedWigSpecification = wigSpecification;
    let specificationWarning = null;
    if (wigSpecificationError) {
      specificationWarning = wigSpecificationError.message || 'Wig request saved without preferences.';
      savedWigSpecification = null;
      logAppEvent('wig_request.save', 'Wig specification save failed after request row creation.', {
        userId,
        reqId: wigRequest?.req_id || null,
        error: specificationWarning,
      }, 'warn');
    } else {
      logAppEvent('wig_request.save', 'Wig specification row saved.', {
        userId,
        reqId: wigRequest?.req_id || null,
        reqSpecId: savedWigSpecification?.req_spec_id || null,
        hasPreviewUrl: Boolean(savedWigSpecification?.ai_wig_preview_url),
      });
    }

    const notificationEvents = buildImmediateNotificationEvents({
      role: 'patient',
      payload: {
        wigRequest,
      },
    });

    try {
      if (notificationEvents.length) {
        void recordNotifications({
          userId,
          role: 'patient',
          notifications: notificationEvents,
        }).catch((notificationError) => {
          logAppError('wig_request.save.notifications', notificationError, {
            userId,
            reqId: wigRequest?.req_id || null,
          });
        });
      }
    } catch (notificationError) {
      logAppError('wig_request.save.notifications', notificationError, {
        userId,
        reqId: wigRequest?.req_id || null,
      });
    }

    try {
      void writeAuditLog({
        authUserId: userId,
        databaseUserId: systemUser?.user_id || null,
        action: 'wig_request.create',
        description: `Created wig request ${wigRequest.req_id || wigRequest.id}.`,
        resource: 'wig_requests',
        status: 'success',
      }).catch((auditError) => {
        logAppError('wig_request.save.audit', auditError, {
          userId,
          reqId: wigRequest?.req_id || null,
        });
      });
    } catch (auditError) {
      logAppError('wig_request.save.audit', auditError, {
        userId,
        reqId: wigRequest?.req_id || null,
      });
    }

    return {
      wigRequest,
      wigSpecification: savedWigSpecification,
      warning: specificationWarning,
      error: null,
    };
  } catch (error) {
    try {
      await writeAuditLog({
        authUserId: userId,
        action: 'wig_request.create',
        description: error.message || 'Unable to save wig request.',
        resource: 'wig_requests',
        status: 'failed',
      });
    } catch (auditError) {
      logAppError('wig_request.save.failed_audit', auditError, { userId });
    }

    return {
      wigRequest: null,
      wigSpecification: null,
      error: error.message || 'Unable to save the wig request.',
    };
  }
};

export const cancelPatientWigRequest = async ({ userId, wigRequestId }) => {
  try {
    if (!userId) throw new Error('Your session is not ready.');
    if (!wigRequestId) throw new Error('No request selected.');

    const patientDetails = await ensurePatientDetails(userId);
    const { data: latestWigRequest, error: latestWigRequestError } =
      await WigRequestAPI.fetchLatestWigRequestByPatientDetailsId(patientDetails.patient_id);

    if (latestWigRequestError) {
      throw new Error(latestWigRequestError.message || 'Unable to check this request.');
    }

    if (!latestWigRequest?.req_id || String(latestWigRequest.req_id) !== String(wigRequestId)) {
      throw new Error('This request is no longer active.');
    }

    const cancellationEligibility = getWigRequestCancellationEligibility(latestWigRequest);
    if (!cancellationEligibility.canCancel) {
      throw new Error(cancellationEligibility.reason || 'This request can no longer be cancelled.');
    }

    const { data: cancelledRequest, error: cancelError } = await WigRequestAPI.cancelPendingWigRequest({
      reqId: latestWigRequest.req_id,
      patientId: patientDetails.patient_id,
    });

    if (cancelError) {
      throw new Error(cancelError.message || 'Unable to cancel this request.');
    }

    if (!cancelledRequest?.req_id) {
      const { data: refreshedWigRequest } =
        await WigRequestAPI.fetchLatestWigRequestByPatientDetailsId(patientDetails.patient_id);

      if (String(refreshedWigRequest?.status || '').trim().toLowerCase() === 'cancelled') {
        return {
          wigRequest: refreshedWigRequest,
          error: null,
        };
      }

      throw new Error('Unable to cancel this request. Please apply the patient cancel policy in Supabase.');
    }

    try {
      const { data: systemUser } = await resolveSystemUser(userId);
      await writeAuditLog({
        authUserId: userId,
        databaseUserId: systemUser?.user_id || null,
        action: 'wig_request.cancel',
        description: `Cancelled wig request ${latestWigRequest.req_id}.`,
        resource: 'wig_requests',
        status: 'success',
      });
    } catch (auditError) {
      logAppError('wig_request.cancel.audit', auditError, {
        userId,
        reqId: latestWigRequest.req_id,
      });
    }

    return {
      wigRequest: cancelledRequest,
      error: null,
    };
  } catch (error) {
    logAppError('wig_request.cancel', error, {
      userId,
      wigRequestId,
    });

    return {
      wigRequest: null,
      error: error.message || 'Unable to cancel this request.',
    };
  }
};
