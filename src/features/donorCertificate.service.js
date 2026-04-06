import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fetchHairSubmissionsByUserId } from './hairSubmission.api';

const QUALIFIED_DECISION_KEYWORDS = ['eligible', 'qualified', 'approved', 'accepted'];

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

export const isQualifiedDonationDecision = (decision = '') => {
  const normalizedDecision = decision.trim().toLowerCase();
  return QUALIFIED_DECISION_KEYWORDS.some((keyword) => normalizedDecision.includes(keyword));
};

const normalizeCertificateRecord = ({ profile, submission, screening }) => {
  const donorName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || profile?.email || 'Donor';

  return {
    donorName,
    submissionId: submission.id,
    submissionCode: submission.submission_code || 'Pending submission code',
    donationDate: submission.created_at,
    donationDateLabel: formatCertificateDate(submission.created_at),
    bundleQuantity: submission.bundle_quantity || 0,
    donationStatus: submission.status || '',
    decision: screening?.decision || '',
    confidenceScore: screening?.confidence_score ?? null,
    summary: screening?.summary || '',
  };
};

export const getLatestQualifiedDonationCertificate = async ({ userId, profile }) => {
  try {
    if (!userId) {
      throw new Error('Your session is not ready yet.');
    }

    const { data, error } = await fetchHairSubmissionsByUserId(userId, 12);
    if (error) {
      throw new Error(error.message || 'Unable to load donor certificates right now.');
    }

    const qualifiedSubmission = (data || []).find((submission) => {
      const screening = Array.isArray(submission.ai_screenings)
        ? submission.ai_screenings[0]
        : submission.ai_screenings;

      return screening && isQualifiedDonationDecision(screening.decision);
    });

    if (!qualifiedSubmission) {
      return {
        certificate: null,
        error: null,
      };
    }

    const screening = Array.isArray(qualifiedSubmission.ai_screenings)
      ? qualifiedSubmission.ai_screenings[0]
      : qualifiedSubmission.ai_screenings;

    return {
      certificate: normalizeCertificateRecord({
        profile,
        submission: qualifiedSubmission,
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

export const buildDonorCertificateHtml = (certificate) => {
  const confidenceText = certificate.confidenceScore != null
    ? `${Math.round(Number(certificate.confidenceScore) * 100)}%`
    : 'Not available';

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            margin: 0;
            padding: 32px;
            font-family: Georgia, "Times New Roman", serif;
            background: #f5efe6;
            color: #2b2118;
          }
          .certificate {
            border: 4px solid #b77b4f;
            padding: 44px 38px;
            background: linear-gradient(180deg, #fffaf3 0%, #f8eee1 100%);
          }
          .eyebrow {
            text-align: center;
            text-transform: uppercase;
            letter-spacing: 4px;
            font-size: 12px;
            color: #8f5c38;
            margin-bottom: 16px;
          }
          .title {
            text-align: center;
            font-size: 38px;
            margin: 0 0 12px;
            color: #5d2f18;
          }
          .subtitle {
            text-align: center;
            font-size: 17px;
            margin: 0 0 28px;
            color: #6e5241;
          }
          .recipient {
            text-align: center;
            font-size: 32px;
            margin: 0 0 24px;
            color: #2b2118;
          }
          .body {
            font-size: 17px;
            line-height: 1.7;
            text-align: center;
            margin: 0 0 28px;
            color: #4d3b31;
          }
          .details {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          .details td {
            padding: 10px 0;
            border-bottom: 1px solid #dfc6ad;
            font-size: 14px;
          }
          .details td:first-child {
            color: #7b5d49;
            width: 38%;
          }
          .details td:last-child {
            font-weight: bold;
            color: #2b2118;
          }
          .summary {
            margin-top: 24px;
            padding: 18px;
            background: rgba(183, 123, 79, 0.08);
            border: 1px solid rgba(183, 123, 79, 0.2);
            font-size: 14px;
            color: #5d4638;
          }
          .footer {
            margin-top: 34px;
            text-align: center;
            font-size: 13px;
            color: #7b5d49;
          }
        </style>
      </head>
      <body>
        <div class="certificate">
          <div class="eyebrow">Donivra Hair Donation Platform</div>
          <h1 class="title">Certificate of Appreciation</h1>
          <p class="subtitle">Presented in recognition of a qualified hair donation milestone.</p>
          <h2 class="recipient">${escapeHtml(certificate.donorName)}</h2>
          <p class="body">
            This certificate recognizes your hair donation submission to Donivra.
            Your contribution supports patients who need wig assistance and helps move the donation journey forward.
          </p>

          <table class="details">
            <tr>
              <td>Submission code</td>
              <td>${escapeHtml(certificate.submissionCode)}</td>
            </tr>
            <tr>
              <td>Donation date</td>
              <td>${escapeHtml(certificate.donationDateLabel)}</td>
            </tr>
            <tr>
              <td>Qualified result</td>
              <td>${escapeHtml(certificate.decision || 'Qualified')}</td>
            </tr>
            <tr>
              <td>Bundle quantity</td>
              <td>${escapeHtml(String(certificate.bundleQuantity || 0))}</td>
            </tr>
            <tr>
              <td>AI confidence</td>
              <td>${escapeHtml(confidenceText)}</td>
            </tr>
          </table>

          <div class="summary">
            <strong>Review summary:</strong>
            ${escapeHtml(certificate.summary || 'Your submission reached a qualified donation milestone in the current donor review flow.')}
          </div>

          <div class="footer">
            Issued by Donivra on ${escapeHtml(formatCertificateDate(new Date().toISOString()))}
          </div>
        </div>
      </body>
    </html>
  `;
};

export const generateDonorCertificatePdf = async (certificate) => {
  const html = buildDonorCertificateHtml(certificate);
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
