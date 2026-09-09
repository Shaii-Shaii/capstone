import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { PermissionsAndroid, Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { theme } from '../design-system/theme';
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

const buildCertificateHtmlColors = (colors = {}) => ({
  pageBackground: colors.background || theme.colors.backgroundCanvas,
  cardBackground: colors.surface || theme.colors.backgroundPrimary,
  nameText: colors.primary || theme.colors.brandPrimary,
  metaLabel: colors.secondary || theme.colors.textSecondary,
  metaText: colors.onSurface || theme.colors.textPrimary,
});

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

const getCertificateTemplateDataUri = async () => {
  const templateAsset = Asset.fromModule(require('../assets/images/donivra_certificate_template.png'));
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
    donationReference: submission?.donation_reference || certificateRow?.certificate_number || 'Pending donation reference',
    bundleId: submission?.bundle_id || null,
    recipientPatientId: submission?.recipient_patient_id || null,
    donationDate: submission?.created_at || certificateRow?.issued_at || null,
    donationDateLabel: formatCertificateDate(submission?.created_at || certificateRow?.issued_at || ''),
    declaredLength: Array.isArray(submission?.submission_details)
      ? submission.submission_details[0]?.declared_length ?? null
      : submission?.submission_details?.declared_length ?? null,
    estimatedLength: screening?.estimated_length ?? null,
    bundleQuantity: submission?.bundle_quantity || 0,
    donationStatus: submission?.status || '',
    decision: 'Staff-approved donation',
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
          donation_reference: certificateResult.data.certificate_number || 'Issued certificate',
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

export const buildDonorCertificateHtml = async (certificate, options = {}) => {
  const templateDataUri = await getCertificateTemplateDataUri();
  const colors = buildCertificateHtmlColors(options.colors);
  const certificateNumber = certificate?.certificateNumber || 'Pending certificate number';
  const issuedDate = formatCertificateDate(certificate?.issuedAt || '') || certificate?.issuedAtLabel;
  const donorName = String(certificate?.donorName || '').trim();
  const recipientFontSize = getCertificateRecipientFontSize(donorName, { max: 44, min: 26 });
  const certificateValueFontSize = getCertificateMetaValueFontSize(certificateNumber, { max: 16, min: 13 });
  const issuedValueFontSize = getCertificateMetaValueFontSize(issuedDate, { max: 16, min: 13 });

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
            background: ${colors.pageBackground};
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
            top: 380px;
            left: 76px;
            width: 470px;
            min-height: 58px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 18px;
            box-sizing: border-box;
          }
          .name {
            text-align: center;
            font-size: ${recipientFontSize}px;
            font-weight: 600;
            color: ${colors.nameText};
            line-height: 1.04;
            letter-spacing: 0.2px;
            word-break: break-word;
          }
          .certificate-value,
          .issued-value {
            position: absolute;
            color: ${colors.metaText};
            font-weight: 600;
            line-height: 1.25;
            word-break: break-word;
            overflow-wrap: anywhere;
          }
          .certificate-value {
            top: 659px;
            left: 300px;
            width: 398px;
          }
          .issued-value {
            top: 716px;
            left: 218px;
            width: 300px;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="recipient-block">
            <div class="name">${escapeHtml(donorName)}</div>
          </div>

          <div class="certificate-value" style="font-size:${certificateValueFontSize}px;">${escapeHtml(certificateNumber)}</div>
          <div class="issued-value" style="font-size:${issuedValueFontSize}px;">${escapeHtml(issuedDate)}</div>
        </div>
      </body>
    </html>
  `;
};

export const generateDonorCertificatePdf = async (certificate, options = {}) => {
  const html = await buildDonorCertificateHtml(certificate, options);
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

const sanitizeCertificateFilePart = (value = '') => String(value || '')
  .trim()
  .replace(/[^a-z0-9_-]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 72);

const toNativeFilePath = (uri = '') => {
  const path = String(uri || '').replace(/^file:\/\//i, '');
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

export const saveDonorCertificatePdfToDownloads = async (uri, certificate = null) => {
  if (!uri) {
    throw new Error('The certificate PDF has not been prepared yet.');
  }

  const certificateReference = sanitizeCertificateFilePart(
    certificate?.certificateNumber || certificate?.certificateId || Date.now()
  );
  const fileName = `Donivra-Certificate-${certificateReference || Date.now()}.pdf`;

  if (Platform.OS !== 'android') {
    await shareDonorCertificatePdf(uri);
    return { fileName, location: 'file-picker', uri };
  }

  const sourcePath = toNativeFilePath(uri);
  const androidVersion = Number(Platform.Version) || 0;

  if (androidVersion >= 29) {
    const savedUri = await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
      {
        name: fileName,
        parentFolder: '',
        mimeType: 'application/pdf',
      },
      'Download',
      sourcePath
    );

    if (!savedUri) {
      throw new Error('Android could not save the certificate to Downloads.');
    }

    return { fileName, location: 'Downloads', uri: savedUri };
  }

  const permission = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
    {
      title: 'Save certificate',
      message: 'Allow Donivra to save your certificate in the Downloads folder.',
      buttonPositive: 'Allow',
      buttonNegative: 'Cancel',
    }
  );

  if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('Storage permission is needed to save the certificate to Downloads.');
  }

  const destinationPath = `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${fileName}`;
  await ReactNativeBlobUtil.fs.cp(sourcePath, destinationPath);
  await ReactNativeBlobUtil.fs.scanFile([{ path: destinationPath, mime: 'application/pdf' }]);

  return { fileName, location: 'Downloads', uri: `file://${destinationPath}` };
};
