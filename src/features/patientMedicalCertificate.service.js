import { invokeEdgeFunction } from '../api/supabase/client';
import { uploadPatientOnboardingMedia, updatePatientDetails } from './profile/api/profile.api';
import { logAppError, logAppEvent } from '../utils/appErrors';

export const medicalCertificateVerificationFunctionName =
  process.env.EXPO_PUBLIC_MEDICAL_CERTIFICATE_VERIFICATION_FUNCTION
  || 'verify-medical-certificate';

const VERIFICATION_REQUEST_TIMEOUT_MS = 18000;

const base64ToArrayBuffer = (base64Value = '') => {
  const base64 = String(base64Value || '').replace(/\s/g, '');
  const binary = typeof globalThis.atob === 'function'
    ? globalThis.atob(base64)
    : '';
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
};

const normalizeText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const extractDoctorName = (text = '') => {
  const match = normalizeText(text).match(/(?:dr\.?|doctor|physician)\s+([a-z][a-z\s.,-]{2,80})/i);
  return match?.[1]?.replace(/\b(prc|license|lic|ptr|md)\b.*$/i, '').trim() || '';
};

const extractLicenseNumber = (text = '') => {
  const normalized = normalizeText(text);
  const patterns = [
    /\b(?:prc|license|lic\.?|registration)\s*(?:no\.?|number|#)?\s*[:#-]?\s*([a-z0-9-]{4,24})/i,
    /\b(?:medical\s+license)\s*(?:no\.?|number|#)?\s*[:#-]?\s*([a-z0-9-]{4,24})/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1].replace(/[^a-z0-9-]/gi, '').toUpperCase();
  }
  return '';
};

const validateCertificateText = (text = '') => {
  const normalized = normalizeText(text);
  const doctorName = extractDoctorName(normalized);
  const licenseNumber = extractLicenseNumber(normalized);
  const hasCertificateKeyword = /\b(medical certificate|certificate|certification|clinical abstract|doctor'?s certificate)\b/i.test(normalized);
  const hasDiagnosisKeyword = /\b(cancer|oncology|chemotherapy|alopecia|diagnosis|diagnosed|medical condition|patient)\b/i.test(normalized);
  const missing = [];

  if (!hasCertificateKeyword) missing.push('medical certificate label');
  if (!doctorName) missing.push('doctor name');
  if (!licenseNumber) missing.push('PRC/license number');
  if (!hasDiagnosisKeyword) missing.push('diagnosis or medical condition');

  return {
    passed: missing.length === 0,
    status: missing.length === 0 ? 'ocr_passed_prc_pending' : 'ocr_failed',
    missing,
    doctorName,
    licenseNumber,
    extractedText: normalized,
  };
};

const normalizeVerifierResponse = (payload = {}, fallbackText = '') => {
  const extractedText = normalizeText(
    payload.extracted_text
    || payload.extractedText
    || payload.text
    || fallbackText
  );
  const local = validateCertificateText(extractedText);
  const status = payload.status || payload.verification_status || local.status;
  return {
    ...local,
    passed: Boolean(payload.passed ?? payload.valid ?? local.passed),
    status,
    provider: payload.provider || 'edge_function',
    documentLegitimacy: payload.document_legitimacy || payload.documentLegitimacy || 'requires_prc_staff_review',
    doctorName: payload.doctor_name || payload.doctorName || local.doctorName,
    licenseNumber: payload.license_number || payload.licenseNumber || local.licenseNumber,
    extractedText,
    raw: payload,
  };
};

const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        error: new Error(timeoutMessage),
        data: null,
      });
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const readResponseMessage = async (response) => {
  if (!response) return '';

  try {
    const clonedResponse = typeof response.clone === 'function' ? response.clone() : response;
    const payload = await clonedResponse.json();
    return normalizeText(
      payload?.error
      || payload?.message
      || payload?.details
      || ''
    );
  } catch (_) {
    try {
      const clonedResponse = typeof response.clone === 'function' ? response.clone() : response;
      return normalizeText(await clonedResponse.text());
    } catch (__) {
      return '';
    }
  }
};

const getEdgeFunctionErrorMessage = async (error, fallback = 'Medical certificate verifier is unavailable.') => {
  const responseMessage = await readResponseMessage(error?.context);
  const status = error?.context?.status ? `HTTP ${error.context.status}` : '';
  const technicalMessage = normalizeText(error?.message || '');

  return responseMessage
    || [status, technicalMessage].filter(Boolean).join(': ')
    || fallback;
};

export const verifyMedicalCertificateAsset = async ({
  authUserId,
  patientId,
  asset,
}) => {
  if (!authUserId) {
    return { success: false, error: 'Your session is not ready.' };
  }
  if (!asset?.uri) {
    return { success: false, error: 'Select or scan the medical certificate first.' };
  }

  const contentType = asset.mimeType || asset.mime || asset.contentType || 'image/jpeg';
  const fileName = asset.fileName || `medical-certificate-${Date.now()}.${contentType.includes('pdf') ? 'pdf' : 'jpg'}`;
  let documentUrl = asset.publicUrl || asset.documentUrl || '';

  if (!documentUrl) {
    let fileBody = asset.fileBody || null;
    if (!fileBody && asset.base64) {
      fileBody = base64ToArrayBuffer(asset.base64);
    }
    if (!fileBody) {
      const response = await fetch(asset.uri);
      fileBody = await response.arrayBuffer();
    }

    const uploadResult = await uploadPatientOnboardingMedia({
      authUserId,
      fileBody,
      contentType,
      fileName,
      documentType: 'patient-medical-certificate',
    });

    if (uploadResult.error || !uploadResult.data?.publicUrl) {
      return {
        success: false,
        error: uploadResult.error?.message || 'Unable to upload the medical certificate.',
      };
    }

    documentUrl = uploadResult.data.publicUrl;
  }
  let verification = validateCertificateText(asset.ocrText || '');
  let verificationErrorMessage = '';
  try {
    const edgeResult = await withTimeout(
      invokeEdgeFunction(medicalCertificateVerificationFunctionName, {
        body: {
          document_url: documentUrl,
          mime_type: contentType,
          file_name: fileName,
          patient_id: patientId || null,
        },
      }),
      VERIFICATION_REQUEST_TIMEOUT_MS,
      'Document verification timed out. Please try scanning a clearer photo.'
    );

    if (!edgeResult.error && edgeResult.data) {
      verification = normalizeVerifierResponse(edgeResult.data, asset.ocrText || '');
    } else if (edgeResult.error) {
      verificationErrorMessage = await getEdgeFunctionErrorMessage(edgeResult.error);
      logAppEvent('patient.medical_certificate.verify.edge_unavailable', 'Medical certificate verifier returned an error.', {
        message: verificationErrorMessage,
        status: edgeResult.error?.context?.status || null,
      }, 'warn');
    }
  } catch (error) {
    verificationErrorMessage = await getEdgeFunctionErrorMessage(
      error,
      error?.message || 'Medical certificate verifier failed.'
    );
    logAppError('patient.medical_certificate.verify.edge_failed', error);
  }

  await updatePatientDetails(authUserId, {
    medical_document: documentUrl,
    medical_document_verification_status: verification.status,
    doctor_name: verification.doctorName || null,
    doctor_license_number: verification.licenseNumber || null,
    medical_document_ocr_text: verification.extractedText || null,
    medical_document_verified_at: new Date().toISOString(),
  });

  return {
    success: verification.passed,
    documentUrl,
    verification,
    error: verification.passed
      ? ''
      : verificationErrorMessage || `Certificate OCR validation failed. Missing: ${verification.missing.join(', ')}.`,
  };
};
