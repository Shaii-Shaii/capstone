import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fetchHairSubmissionsByUserId, fetchLatestDonationCertificateByUserId } from './hairSubmission.api';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const formatCertificateDate = (value) => {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

export const getCertificateRecipientFontSize = (value = '', { max = 52, min = 32 } = {}) => {
  const normalizedLength = String(value || '').trim().length;
  if (!normalizedLength) return max;
  if (normalizedLength <= 14) return max;
  return clampNumber(Math.round(max - ((normalizedLength - 14) * 1.2)), min, max);
};

export const getCertificateOrganizationFontSize = (value = '', { max = 40, min = 22 } = {}) => {
  const normalizedLength = String(value || '').trim().length;
  if (!normalizedLength) return max;
  if (normalizedLength <= 18) return max;
  return clampNumber(Math.round(max - ((normalizedLength - 18) * 0.7)), min, max);
};

export const getCertificateMetaValueFontSize = (value = '', { max = 18, min = 11 } = {}) => {
  const normalizedLength = String(value || '').trim().length;
  if (!normalizedLength) return max;
  if (normalizedLength <= 18) return max;
  return clampNumber(Math.round(max - ((normalizedLength - 18) * 0.35)), min, max);
};

const templateAsset = Asset.fromModule(require('../assets/images/donivra_certificate_template.png'));
let templateDataUriPromise = null;

const getCertificateTemplateDataUri = async () => {
  if (!templateDataUriPromise) {
    templateDataUriPromise = (async () => {
      if (!templateAsset.localUri) {
        await templateAsset.downloadAsync();
      }

      const resolvedUri = templateAsset.localUri || templateAsset.uri || '';
      if (!resolvedUri) {
        throw new Error('The donor certificate template image could not be resolved.');
      }

      const base64 = await FileSystem.readAsStringAsync(resolvedUri, {
        encoding: 'base64',
      });

      if (!base64) {
        throw new Error('The donor certificate template image could not be loaded.');
      }

      return `data:image/png;base64,${base64}`;
    })();
  }

  return templateDataUriPromise;
};

export const buildDonorFullName = (profile = null, fallback = '') => (
  [
    profile?.first_name,
    profile?.middle_name,
    profile?.last_name,
    profile?.suffix,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || fallback
);

export const buildDonorCertificateModel = ({
  profile,
  certificateRow = null,
  submission = null,
  screening = null,
  organizationName = '',
}) => {
  const donorName = buildDonorFullName(profile, profile?.email || '');

  return {
    donorName,
    certificateId: certificateRow?.certificate_id || certificateRow?.id || null,
    certificateNumber: certificateRow?.certificate_number || '',
    certificateType: certificateRow?.certificate_type || 'Certificate of Donation',
    fileUrl: certificateRow?.file_url || '',
    issuedAt: certificateRow?.issued_at || submission?.created_at || null,
    issuedAtLabel: formatCertificateDate(certificateRow?.issued_at || submission?.created_at || ''),
    remarks: certificateRow?.remarks || '',
    organizationName: organizationName || '',
    submissionId: submission?.submission_id || certificateRow?.submission_id || null,
    submissionCode: submission?.submission_code || certificateRow?.certificate_number || 'Pending submission code',
    donationDate: submission?.created_at || certificateRow?.issued_at || null,
    donationDateLabel: formatCertificateDate(submission?.created_at || certificateRow?.issued_at || ''),
    bundleQuantity: submission?.bundle_quantity || 0,
    donationStatus: submission?.status || '',
    decision: screening?.decision || '',
    detectedCondition: screening?.detected_condition || '',
    confidenceScore: screening?.confidence_score ?? null,
    summary: screening?.summary || '',
  };
};

export const getLatestQualifiedDonationCertificate = async ({ userId, profile }) => {
  try {
    if (!userId) {
      throw new Error('Your session is not ready yet.');
    }

    const [certificateResult, submissionsResult] = await Promise.all([
      fetchLatestDonationCertificateByUserId(userId),
      fetchHairSubmissionsByUserId(userId, 12),
    ]);

    if (certificateResult.error) {
      throw new Error(certificateResult.error.message || 'Unable to load donor certificates right now.');
    }
    if (submissionsResult.error) {
      throw new Error(submissionsResult.error.message || 'Unable to load donor certificates right now.');
    }

    if (!certificateResult.data) {
      return {
        certificate: null,
        error: null,
      };
    }

    const linkedSubmission = (submissionsResult.data || []).find((submission) => (
      submission?.submission_id === certificateResult.data?.submission_id
    )) || null;
    const screening = Array.isArray(linkedSubmission?.ai_screenings)
      ? linkedSubmission.ai_screenings[0]
      : linkedSubmission?.ai_screenings;

    return {
      certificate: buildDonorCertificateModel({
        profile,
        certificateRow: certificateResult.data,
        submission: linkedSubmission || {
          submission_id: certificateResult.data.submission_id,
          submission_code: certificateResult.data.certificate_number || 'Issued certificate',
          created_at: certificateResult.data.issued_at,
          bundle_quantity: 0,
          status: 'Certificate issued',
        },
        screening,
      }),
      error: null,
    };
  } catch (error) {
    return {
      certificate: null,
      error: error.message || 'Unable to load donor certificates right now.',
    };
  }
};

export const buildDonorCertificateHtml = async (certificate) => {
  const templateDataUri = await getCertificateTemplateDataUri();
  const certificateNumber = certificate?.certificateNumber || 'Pending certificate number';
  const issuedDate = certificate?.issuedAtLabel || formatCertificateDate(certificate?.issuedAt || '');
  const donorName = String(certificate?.donorName || '').trim();
  const recipientFontSize = getCertificateRecipientFontSize(donorName);
  const certificateValueFontSize = getCertificateMetaValueFontSize(certificateNumber, { max: 16, min: 10 });
  const issuedValueFontSize = getCertificateMetaValueFontSize(issuedDate, { max: 17, min: 11 });

  if (!donorName) {
    throw new Error('Your donor name is missing from the account profile. Please update your profile before generating a certificate.');
  }

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page {
            size: A4 landscape;
            margin: 0;
          }
          body {
            margin: 0;
            font-family: Georgia, "Times New Roman", serif;
            background: #ffffff;
          }
          .page {
            width: 1123px;
            height: 794px;
            position: relative;
            overflow: hidden;
            background-image: url("${templateDataUri}");
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
          }
          .recipient-block {
            position: absolute;
            top: 286px;
            left: 92px;
            width: 632px;
            min-height: 94px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 18px;
            box-sizing: border-box;
          }
          .name {
            text-align: center;
            font-size: ${recipientFontSize}px;
            font-weight: 700;
            color: #1d1d1f;
            line-height: 1.04;
            letter-spacing: 0.2px;
            word-break: break-word;
          }
          .meta-block {
            position: absolute;
            top: 150px;
            right: 262px;
            width: 208px;
            padding: 14px 16px 12px;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.92);
            box-shadow: 0 8px 24px rgba(40, 76, 140, 0.08);
            box-sizing: border-box;
          }
          .meta-label {
            font-size: 11px;
            color: #5b7fc7;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            margin-bottom: 2px;
          }
          .meta-value {
            font-size: 16px;
            color: #1f2530;
            margin-bottom: 10px;
            line-height: 1.2;
            word-break: break-word;
            overflow-wrap: anywhere;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="recipient-block">
            <div class="name">${escapeHtml(donorName)}</div>
          </div>

          <div class="meta-block">
            <div class="meta-label">Certificate No.</div>
            <div class="meta-value" style="font-size:${certificateValueFontSize}px;">${escapeHtml(certificateNumber)}</div>

            <div class="meta-label">Issued</div>
            <div class="meta-value" style="font-size:${issuedValueFontSize}px; margin-bottom:0;">${escapeHtml(issuedDate)}</div>
          </div>
        </div>
      </body>
    </html>
  `;
};

export const generateDonorCertificatePdf = async (certificate) => {
  const html = await buildDonorCertificateHtml(certificate);
  return await Print.printToFileAsync({
    html,
    base64: false,
  });
};

export const isCertificateSharingSupported = async () => (
  await Sharing.isAvailableAsync()
);

export const shareDonorCertificatePdf = async (uri) => {
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share donor certificate',
    UTI: '.pdf',
  });
};
