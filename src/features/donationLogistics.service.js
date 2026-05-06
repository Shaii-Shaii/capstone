import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { logAppError, logAppEvent } from '../utils/appErrors';
import {
    buildDonationCertificatePayload,
    buildDonationQrPayload,
    buildDonationSubmittedNotification,
    validateQrCodeScan,
} from './donationLogisticsFlow.service';
import {
    buildDonationNotification,
    buildQrImageUrl,
    createDonationQrReference,
    recordNotifications
} from './donorDonations.service';
import {
    createHairBundleTrackingEntry,
    createHairSubmission,
    createHairSubmissionDetail,
    createHairSubmissionImages,
    createHairSubmissionLogistics,
    uploadHairSubmissionImage,
} from './hairSubmission.api';
import { hairSubmissionStorageBucket } from './hairSubmission.constants';
import { notificationTypes } from './notification.constants';

const QR_IMAGE_SIZE = 512;

/**
 * Complete Donation Submission Process
 * 
 * This handles:
 * 1. Creating submission record with logistics
 * 2. Uploading hair photo
 * 3. Generating QR code
 * 4. Notifying staff
 * 5. Creating tracking entry
 */
export const submitDonation = async ({
  userId = '',
  userProfile = {},
  donationDetails = {},
  hairPhotoPath = '',
  hairPhotoFileName = '',
  sourceType = 'independent_donation',
  driveId = null,
  organizationId = null,
} = {}) => {
  try {
    logAppEvent('donation_logistics', 'Starting donation submission');

    // Validate inputs
    if (!userId || !donationDetails.hairLengthValue || !hairPhotoPath) {
      throw new Error('Missing required donation information');
    }

    // Create submission code
    const submissionCode = createDonationQrReference('DON');
    const qrReference = createDonationQrReference('QR');

    // Build QR payload
    const qrPayload = buildDonationQrPayload({
      submissionCode,
      donorId: userId,
      donationDetails,
      timestamp: new Date().toISOString(),
    });

    // Generate QR code image URL
    const qrCodeUrl = buildQrImageUrl(JSON.stringify(qrPayload), QR_IMAGE_SIZE);

    // Create hair submission record
    const submissionResult = await createHairSubmission({
      user_id: userId,
      submission_code: submissionCode,
      donation_source: sourceType,
      bundle_quantity: donationDetails.bundleQuantity || 1,
      donor_notes: `Donation from logistics flow - ${donationDetails.hairLengthValue}${donationDetails.hairLengthUnit}`,
      status: 'Pending',
    });

    if (submissionResult.error || !submissionResult.data?.submission_id) {
      throw submissionResult.error || new Error('Unable to create donation submission');
    }

    const createdSubmission = submissionResult.data;
    logAppEvent('donation_logistics', 'Hair submission created', { submissionCode, submissionId: createdSubmission.submission_id });

    // Create submission detail
    const detailResult = await createHairSubmissionDetail({
      submission_id: createdSubmission.submission_id,
      bundle_number: 1,
      declared_length: donationDetails.hairLengthValue || null,
      declared_color: donationDetails.detectedColor || null,
      declared_texture: donationDetails.detectedTexture || null,
      declared_density: donationDetails.detectedDensity || null,
      declared_condition: 'Pending review',
      is_chemically_treated: donationDetails.isChemicallyTreated || false,
      is_colored: donationDetails.isColored || false,
      is_bleached: donationDetails.isBeached || false,
      is_rebonded: donationDetails.isRebonded || false,
      detail_notes: donationDetails.recentAssessmentMetadata ? 'Auto-filled from recent assessment' : 'Donor provided details',
      status: 'Pending',
    });

    if (detailResult.error || !detailResult.data?.submission_detail_id) {
      throw detailResult.error || new Error('Unable to create submission detail');
    }

    const createdDetail = detailResult.data;

    // Upload hair photo if path provided
    if (hairPhotoPath) {
      try {
        // Read file into ArrayBuffer
        const response = await fetch(hairPhotoPath);
        if (!response.ok) throw new Error('Failed to read hair photo');
        const fileBody = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const fileName = hairPhotoFileName || `donation_${Date.now()}.jpg`;
        const filePath = `${userId}/${createdSubmission.submission_id}/donation-${createdDetail.submission_detail_id}-${Date.now()}.${fileName.split('.').pop()}`;

        const uploadResult = await uploadHairSubmissionImage({
          path: filePath,
          fileBody,
          contentType,
          bucket: hairSubmissionStorageBucket,
        });

        if (uploadResult.error) {
          logAppError('donation_logistics', uploadResult.error);
        } else {
          await createHairSubmissionImages([{
            submission_detail_id: createdDetail.submission_detail_id,
            file_path: filePath,
            image_type: 'donation_hair_photo',
          }]);
        }
      } catch (photoErr) {
        logAppError('donation_logistics', photoErr);
        // Continue even if photo upload fails
      }
    }

    // Create hair submission logistics record linked to the created submission
    const logisticsData = {
      submission_id: createdSubmission.submission_id,
      logistics_type: 'shipping',
      shipment_status: 'Pending',
      notes: `Donation submitted via logistics flow. QR attached.`,
    };

    const logisticsRecord = await createHairSubmissionLogistics(logisticsData);
    logAppEvent('donation_logistics', 'Logistics record created', { submissionCode, logisticsId: logisticsRecord.data?.submission_logistics_id });

    // Create bundle tracking entry
    try {
      await createHairBundleTrackingEntry({
        user_id: userId,
        submission_id: createdSubmission.submission_id,
        submission_detail_id: createdDetail.submission_detail_id,
        bundle_count: donationDetails.bundleQuantity,
        hair_length: donationDetails.hairLengthValue,
        hair_length_unit: donationDetails.hairLengthUnit,
        status: 'submitted',
        qr_code: submissionCode,
      });

      logAppEvent('donation_logistics', 'Bundle tracking entry created');
    } catch (trackErr) {
      logAppError('donation_logistics', trackErr);
    }

    // Build notification for staff
    const staffNotification = buildDonationSubmittedNotification({
      donorId: userId,
      donorName: `${userProfile?.first_name || ''} ${userProfile?.last_name || ''}`.trim(),
      submissionCode,
      donationDetails,
      qrCodeUrl,
    });

    // Record notification
    try {
      await recordNotifications([
        buildDonationNotification({
          dedupeKey: `donation_submitted_${submissionCode}`,
          type: notificationTypes.logisticsUpdated,
          title: staffNotification.title,
          message: staffNotification.message,
          metadata: staffNotification.metadata,
        }),
      ]);

      logAppEvent('donation_logistics', 'Staff notification recorded');
    } catch (notifErr) {
      logAppError('donation_logistics', notifErr);
    }

    return {
      success: true,
      submissionCode,
      qrReference,
      qrCodeUrl,
      logisticsRecord,
      staffNotification,
    };
  } catch (err) {
    logAppError('submitDonation', err);
    throw err;
  }
};

/**
 * Generate printable QR code PDF
 */
export const generateDonationQrPdf = async ({
  submissionCode = '',
  qrCodeUrl = '',
  donorName = '',
  hairLength = 0,
  bundleQuantity = 0,
} = {}) => {
  try {
    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .qr-section { text-align: center; margin: 30px 0; }
            .qr-image { max-width: 300px; margin: 20px 0; }
            .details { margin: 20px 0; font-size: 14px; }
            .detail-row { margin: 10px 0; padding: 5px; border-bottom: 1px solid #eee; }
            .label { font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="title">Donation QR Code</div>
              <p>Attach this to your hair donation package</p>
            </div>
            
            <div class="qr-section">
              <img src="${qrCodeUrl}" class="qr-image" alt="Donation QR Code" />
            </div>
            
            <div class="details">
              <div class="detail-row">
                <span class="label">Submission Code:</span> ${submissionCode}
              </div>
              <div class="detail-row">
                <span class="label">Donor Name:</span> ${donorName || 'Anonymous'}
              </div>
              <div class="detail-row">
                <span class="label">Hair Length:</span> ${hairLength} inches
              </div>
              <div class="detail-row">
                <span class="label">Bundle Quantity:</span> ${bundleQuantity}
              </div>
              <div class="detail-row">
                <span class="label">Generated:</span> ${new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const result = await Print.printToFileAsync({
      html: htmlContent,
      fileName: `donation_qr_${submissionCode}`,
    });

    logAppEvent('donation_logistics', 'QR PDF generated');
    return result;
  } catch (err) {
    logAppError('generateDonationQrPdf', err);
    throw err;
  }
};

/**
 * Share QR code PDF
 */
export const shareDonationQrPdf = async (pdfUri) => {
  try {
    if (!pdfUri) throw new Error('No PDF URI provided');

    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share Donation QR Code',
      UTI: 'com.adobe.pdf',
    });

    logAppEvent('donation_logistics', 'QR PDF shared');
  } catch (err) {
    logAppError('shareDonationQrPdf', err);
    throw err;
  }
};

/**
 * Staff: Scan and validate QR code
 */
export const processDonationQrScan = async ({
  qrData = '',
  staffId = '',
  scanTimestamp = null,
} = {}) => {
  try {
    logAppEvent('donation_logistics', 'Processing QR scan');

    if (!qrData) {
      throw new Error('No QR data to process');
    }

    // Parse QR payload
    let qrPayload;
    try {
      qrPayload = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    } catch {
      throw new Error('Invalid QR code format');
    }

    // Validate QR code
    const validation = validateQrCodeScan({ qrPayload });
    if (!validation.isValid) {
      return {
        success: false,
        errors: validation.errors,
        validationTimestamp: validation.validationTimestamp,
      };
    }

    // Update logistics status
    const updateData = {
      status: 'received_by_staff',
      qr_scanned_at: scanTimestamp || new Date().toISOString(),
      scanned_by_staff_id: staffId,
    };

    try {
      // This would need implementation in the API layer
      // await updateHairSubmissionLogisticsById(
      //   qrPayload.submissionCode,
      //   updateData
      // );
      logAppEvent('donation_logistics', 'QR scan processed', { submissionCode: qrPayload.submissionCode });
    } catch (updateErr) {
      logAppError('donation_logistics', updateErr);
    }

    return {
      success: true,
      qrPayload,
      processingTimestamp: validation.validationTimestamp,
      message: 'Donation received successfully',
    };
  } catch (err) {
    logAppError('processDonationQrScan', err);
    return {
      success: false,
      errors: [err.message || 'Failed to process QR scan'],
    };
  }
};

/**
 * Generate donation certificate after verification
 */
export const generateDonationCertificate = async ({
  submissionCode = '',
  donorId = '',
  donorName = '',
  donationDate = '',
  bundleQuantity = 0,
  hairLength = 0,
  hairLengthUnit = 'in',
} = {}) => {
  try {
    const certificateData = buildDonationCertificatePayload({
      donorId,
      donorName,
      donationDate: donationDate || new Date().toISOString(),
      bundleQuantity,
      hairLength,
      hairLengthUnit,
    });

    const htmlContent = `
      <html>
        <head>
          <style>
            body {
              font-family: 'Georgia', serif;
              margin: 0;
              padding: 40px;
              background: linear-gradient(135deg, #f5e6e8 0%, #e8dfe5 100%);
            }
            .certificate {
              background: white;
              border: 3px solid #8b4a5f;
              border-radius: 20px;
              padding: 60px;
              text-align: center;
              box-shadow: 0 10px 30px rgba(0,0,0,0.1);
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              border-bottom: 2px solid #8b4a5f;
              padding-bottom: 20px;
              margin-bottom: 40px;
            }
            .title {
              font-size: 48px;
              color: #8b4a5f;
              font-weight: bold;
              margin: 0;
            }
            .subtitle {
              font-size: 18px;
              color: #666;
              margin-top: 10px;
            }
            .body {
              margin: 40px 0;
              font-size: 16px;
              line-height: 1.8;
              color: #333;
            }
            .donor-name {
              font-size: 32px;
              font-weight: bold;
              color: #8b4a5f;
              margin: 20px 0;
            }
            .details {
              margin: 30px 0;
              font-size: 14px;
              color: #666;
            }
            .detail-line {
              margin: 8px 0;
            }
            .footer {
              margin-top: 40px;
              border-top: 2px solid #8b4a5f;
              padding-top: 20px;
              font-size: 12px;
              color: #999;
            }
            .certificate-id {
              font-family: monospace;
              font-size: 11px;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="certificate">
            <div class="header">
              <h1 class="title">Certificate of Donation</h1>
              <p class="subtitle">Hair for Wig Generation</p>
            </div>
            
            <div class="body">
              <p>This is to certify that</p>
              <div class="donor-name">${donorName || 'Anonymous Donor'}</div>
              <p>has generously contributed to our hair donation initiative</p>
            </div>
            
            <div class="details">
              <div class="detail-line">
                <strong>Donation Date:</strong> ${new Date(donationDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
              <div class="detail-line">
                <strong>Hair Length:</strong> ${hairLength} ${hairLengthUnit}
              </div>
              <div class="detail-line">
                <strong>Bundle Quantity:</strong> ${bundleQuantity}
              </div>
              <div class="detail-line">
                <strong>Submission Code:</strong> ${submissionCode}
              </div>
            </div>
            
            <div class="footer">
              <p>Your generous donation will help provide quality wigs to those in need.</p>
              <div class="certificate-id">
                Certificate ID: ${certificateData.certificateId}
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const pdfResult = await Print.printToFileAsync({
      html: htmlContent,
      fileName: `certificate_${submissionCode}`,
    });

    logAppEvent('donation_logistics', 'Certificate generated', { submissionCode });

    return {
      certificateData,
      pdfUri: pdfResult.uri,
      fileName: pdfResult.fileName,
    };
  } catch (err) {
    logAppError('generateDonationCertificate', err);
    throw err;
  }
};

/**
 * Share certificate PDF
 */
export const shareDonationCertificate = async (pdfUri, certificateId = '') => {
  try {
    if (!pdfUri) throw new Error('No PDF URI provided');

    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share Your Donation Certificate',
      UTI: 'com.adobe.pdf',
    });

    logAppEvent('donation_logistics', 'Certificate shared');
  } catch (err) {
    logAppError('shareDonationCertificate', err);
    throw err;
  }
};

/**
 * Get donation summary for tracking
 */
export const getDonationSummary = async (submissionCode = '') => {
  try {
    if (!submissionCode) throw new Error('Submission code required');

    // This would fetch from the database
    // const summary = await fetchDonationSummary(submissionCode);

    return {
      submissionCode,
      status: 'pending', // Would be actual status from DB
      createdAt: new Date().toISOString(),
      // Additional fields would come from DB
    };
  } catch (err) {
    logAppError('getDonationSummary', err);
    throw err;
  }
};
