import * as HairSubmissionAPI from './hairSubmission.api';
import {
  buildImmediateNotificationEvents,
  recordNotifications,
} from './notification.service';
import {
  hairDonationModeOptions,
  hairSubmissionImageTypes,
  hairSubmissionStatuses,
  hairSubmissionStorageBucket,
} from './hairSubmission.constants';
import { normalizeHairAnalyzerAnswers } from './hairSubmission.schema';
import { logAppEvent, writeAuditLog } from '../utils/appErrors';

const buildSubmissionCode = () => `HS-${Date.now().toString(36).toUpperCase()}`;

const getFileExtension = (mimeType = 'image/jpeg') => {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
};

const uploadSelectedImages = async ({ userId, submissionId, detailId, photos }) => {
  const uploadedRows = [];

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const fileResponse = await fetch(photo.uri);
    const fileBody = await fileResponse.arrayBuffer();
    const extension = getFileExtension(photo.mimeType);
    const filePath = `${userId}/${submissionId}/${detailId}-${photo.viewKey || `view-${index + 1}`}.${extension}`;
    const uploadResult = await HairSubmissionAPI.uploadHairSubmissionImage({
      path: filePath,
      fileBody,
      contentType: photo.mimeType || 'image/jpeg',
      bucket: hairSubmissionStorageBucket,
    });

    if (uploadResult.error) {
      throw new Error(uploadResult.error.message || 'Failed to upload one of the selected photos.');
    }

    logAppEvent('hair_submission.save', 'Hair submission photo uploaded.', {
      userId,
      submissionId,
      detailId,
      index,
      viewKey: photo.viewKey || null,
      bucket: hairSubmissionStorageBucket,
    });

    uploadedRows.push({
      submission_detail_id: detailId,
      file_path: filePath,
      image_type: photo.viewKey || hairSubmissionImageTypes.donorUpload,
    });
  }

  return uploadedRows;
};

const buildRecommendationRows = ({ submissionId, recommendations = [] }) => (
  recommendations
    .filter((item) => item?.recommendation_text)
    .map((item, index) => ({
      submission_id: submissionId,
      title: item.title || null,
      recommendation_text: item.recommendation_text,
      priority_order: Number(item.priority_order) || index + 1,
    }))
);

const resolveSelectedDonationMode = (value = '') => (
  hairDonationModeOptions.find((item) => item.value === value) || null
);

const buildLogisticsRowPayload = ({ submissionId, donationMode, logisticsSettings }) => {
  if (!donationMode?.logistics_type) return null;

  const notes = [];
  if (donationMode.value === 'shipping') {
    notes.push('Donor selected logistics / shipping after AI screening.');
  }
  if (donationMode.value === 'onsite_delivery') {
    notes.push('Donor selected onsite delivery after AI screening.');
  }
  if (donationMode.value === 'pickup') {
    notes.push('Donor requested pickup after AI screening.');
    if (logisticsSettings?.pickup_notes) {
      notes.push(logisticsSettings.pickup_notes);
    }
  }

  return {
    submission_id: submissionId,
    logistics_type: donationMode.logistics_type,
    shipment_status: donationMode.shipment_status || null,
    notes: notes.filter(Boolean).join(' '),
  };
};

export const saveHairSubmissionFlow = async ({
  userId,
  photos,
  aiAnalysis,
  confirmedValues,
  questionnaireAnswers,
  donationModeValue = '',
  logisticsSettings = null,
}) => {
  try {
    if (!userId) throw new Error('Your session is not ready.');
    if (!photos?.length) throw new Error('Please upload at least one photo.');
    if (!aiAnalysis) throw new Error('Run the AI analysis before saving.');

    logAppEvent('hair_submission.save', 'Saving analyzed hair submission.', {
      userId,
      photoCount: photos.length,
      hasAnalysis: Boolean(aiAnalysis),
      analysisKeys: aiAnalysis ? Object.keys(aiAnalysis) : [],
      donationModeValue,
    });

    const normalizedEstimatedLength = aiAnalysis?.estimated_length != null
      ? Number(aiAnalysis.estimated_length)
      : null;
    const normalizedConfidenceScore = aiAnalysis?.confidence_score != null
      ? Number(aiAnalysis.confidence_score)
      : null;
    const normalizedAnswers = normalizeHairAnalyzerAnswers(questionnaireAnswers);
    const normalizedQuestionnaire = normalizedAnswers.questionnaire_answers || {};
    const selectedDonationMode = resolveSelectedDonationMode(donationModeValue);
    const hasTreatmentHistory = normalizedQuestionnaire.has_treatment_history === 'yes';
    const colorStatus = normalizedQuestionnaire.color_status || '';

    const { data: submission, error: submissionError } = await HairSubmissionAPI.createHairSubmission({
      user_id: userId,
      submission_code: buildSubmissionCode(),
      bundle_quantity: 1,
      donation_source: 'mobile_app',
      delivery_method: selectedDonationMode?.delivery_method
        || (normalizedQuestionnaire.screening_intent === 'checking_eligibility_first' ? 'eligibility_check' : null),
      pickup_request: selectedDonationMode?.pickup_request ?? false,
      status: hairSubmissionStatuses.submission.submitted,
      donor_notes: confirmedValues.detailNotes || null,
    });

    if (submissionError) {
      throw new Error(submissionError.message || 'Unable to create the hair submission.');
    }

    logAppEvent('hair_submission.save', 'Hair submission row created.', {
      userId,
      submissionId: submission?.submission_id || null,
    });

    const { data: detail, error: detailError } = await HairSubmissionAPI.createHairSubmissionDetail({
      submission_id: submission.submission_id,
      bundle_number: 1,
      declared_length: Number(confirmedValues.declaredLength),
      declared_color: colorStatus && colorStatus !== 'no' ? colorStatus : null,
      declared_texture: confirmedValues.declaredTexture,
      declared_density: confirmedValues.declaredDensity,
      declared_condition: confirmedValues.declaredCondition,
      is_chemically_treated: hasTreatmentHistory,
      is_colored: ['colored', 'both'].includes(colorStatus),
      is_bleached: ['bleached', 'both'].includes(colorStatus),
      is_rebonded: Array.isArray(normalizedQuestionnaire.chemical_treatments)
        ? normalizedQuestionnaire.chemical_treatments.includes('rebonded')
        : false,
      detail_notes: confirmedValues.detailNotes || null,
      status: hairSubmissionStatuses.detail.pending,
    });

    if (detailError) {
      throw new Error(detailError.message || 'Unable to save the donor-confirmed hair details.');
    }

    logAppEvent('hair_submission.save', 'Hair submission detail row created.', {
      userId,
      submissionId: submission?.submission_id || null,
      detailId: detail?.submission_detail_id || null,
    });

    const imageRows = await uploadSelectedImages({
      userId,
      submissionId: submission.submission_id,
      detailId: detail.submission_detail_id,
      photos,
    });

    const { error: imageInsertError } = await HairSubmissionAPI.createHairSubmissionImages(imageRows);
    if (imageInsertError) {
      throw new Error(imageInsertError.message || 'Unable to save the uploaded image references.');
    }

    logAppEvent('hair_submission.save', 'Hair submission image references saved.', {
      userId,
      submissionId: submission?.submission_id || null,
      detailId: detail?.submission_detail_id || null,
      imageRowCount: imageRows.length,
    });

    const logisticsPayload = buildLogisticsRowPayload({
      submissionId: submission.submission_id,
      donationMode: selectedDonationMode,
      logisticsSettings,
    });

    if (logisticsPayload) {
      const { error: logisticsError } = await HairSubmissionAPI.createHairSubmissionLogistics(logisticsPayload);

      if (logisticsError) {
        throw new Error(logisticsError.message || 'Unable to save the selected donation logistics path.');
      }

      logAppEvent('hair_submission.save', 'Hair submission logistics row created.', {
        userId,
        submissionId: submission?.submission_id || null,
        logisticsType: logisticsPayload.logistics_type,
      });
    }

    const { data: screening, error: screeningError } = await HairSubmissionAPI.createAiScreening({
      submission_id: submission.submission_id,
      estimated_length: Number.isFinite(normalizedEstimatedLength) ? normalizedEstimatedLength : null,
      detected_texture: aiAnalysis.detected_texture || null,
      detected_density: aiAnalysis.detected_density || null,
      detected_condition: aiAnalysis.detected_condition || null,
      visible_damage_notes: aiAnalysis.visible_damage_notes || null,
      confidence_score: Number.isFinite(normalizedConfidenceScore) ? normalizedConfidenceScore : null,
      decision: aiAnalysis.decision || null,
      summary: aiAnalysis.summary || null,
    });

    logAppEvent('hair_submission.save', 'AI screening payload prepared.', {
      userId,
      submissionId: submission?.submission_id || null,
      analysisKeys: aiAnalysis ? Object.keys(aiAnalysis) : [],
      dbPayloadKeys: [
        'estimated_length',
        'detected_texture',
        'detected_density',
        'detected_condition',
        'visible_damage_notes',
        'confidence_score',
        'decision',
        'summary',
      ],
      recommendationCount: Array.isArray(aiAnalysis?.recommendations) ? aiAnalysis.recommendations.length : 0,
    });

    if (screeningError) {
      throw new Error(screeningError.message || 'Unable to save the AI screening result.');
    }

    logAppEvent('hair_submission.save', 'AI screening row created.', {
      userId,
      submissionId: submission?.submission_id || null,
      screeningId: screening?.ai_screening_id || null,
    });

    const recommendationRows = buildRecommendationRows({
      submissionId: submission.submission_id,
      recommendations: aiAnalysis.recommendations,
    });

    if (recommendationRows.length) {
      const { error: recommendationError } = await HairSubmissionAPI.createDonorRecommendations(recommendationRows);

      if (recommendationError) {
        throw new Error(recommendationError.message || 'Unable to save the donor guidance recommendations.');
      }

      logAppEvent('hair_submission.save', 'Donor recommendations saved.', {
        userId,
        submissionId: submission?.submission_id || null,
        recommendationCount: recommendationRows.length,
      });
    }

    const notificationEvents = buildImmediateNotificationEvents({
      role: 'donor',
      payload: {
        submission,
        screening,
        recommendations: recommendationRows,
      },
    });

    if (notificationEvents.length) {
      await recordNotifications({
        userId,
        role: 'donor',
        notifications: notificationEvents,
      });
    }

    await writeAuditLog({
      authUserId: userId,
      action: 'hair_submission.create',
      description: `Created hair submission ${submission.submission_code || submission.submission_id}.`,
      resource: 'hair_submissions',
      status: 'success',
    });

    return {
      submission,
      detail,
      screening,
      recommendations: recommendationRows,
      error: null,
    };
  } catch (error) {
    await writeAuditLog({
      authUserId: userId,
      action: 'hair_submission.create',
      description: error.message || 'Unable to save hair submission.',
      resource: 'hair_submissions',
      status: 'failed',
    });

    return {
      submission: null,
      detail: null,
      screening: null,
      recommendations: [],
      error: error.message || 'Unable to save your hair submission.',
    };
  }
};

export const getHairAnalyzerContext = async (userId) => {
  try {
    if (!userId) {
      throw new Error('Your session is not ready.');
    }

    logAppEvent('hair_submission.context', 'Loading hair analyzer context.', {
      userId,
    });

    const [
      { data: donationRequirement, error: donationRequirementError },
      { data: latestSubmission, error: latestSubmissionError },
      { data: logisticsSettings, error: logisticsSettingsError },
      { data: upcomingHaircutSchedules, error: haircutSchedulesError },
      { data: latestHaircutReservation, error: haircutReservationError },
      { data: latestCertificate, error: latestCertificateError },
    ] = await Promise.all([
      HairSubmissionAPI.fetchLatestDonationRequirement(),
      HairSubmissionAPI.fetchLatestHairSubmissionByUserId(userId),
      HairSubmissionAPI.fetchLatestLogisticsSettings(),
      HairSubmissionAPI.fetchUpcomingHaircutSchedules(),
      HairSubmissionAPI.fetchLatestHaircutReservationByUserId(userId),
      HairSubmissionAPI.fetchLatestDonationCertificateByUserId(userId),
    ]);

    if (donationRequirementError) {
      throw new Error(donationRequirementError.message || 'Unable to load the current donation requirement.');
    }

    if (latestSubmissionError) {
      throw new Error(latestSubmissionError.message || 'Unable to load your latest donation submission.');
    }
    if (logisticsSettingsError) {
      throw new Error(logisticsSettingsError.message || 'Unable to load the logistics settings.');
    }
    if (haircutSchedulesError) {
      throw new Error(haircutSchedulesError.message || 'Unable to load haircut schedules.');
    }
    if (haircutReservationError) {
      throw new Error(haircutReservationError.message || 'Unable to load your haircut reservation status.');
    }
    if (latestCertificateError) {
      throw new Error(latestCertificateError.message || 'Unable to load your certificate status.');
    }

    const { data: latestSubmissionDetail, error: latestDetailError } = latestSubmission?.submission_id
      ? await HairSubmissionAPI.fetchLatestHairSubmissionDetailBySubmissionId(latestSubmission.submission_id)
      : { data: null, error: null };

    if (latestDetailError) {
      throw new Error(latestDetailError.message || 'Unable to load your latest donation detail.');
    }

    logAppEvent('hair_submission.context', 'Hair analyzer context ready.', {
      userId,
      hasDonationRequirement: Boolean(donationRequirement?.donation_requirement_id),
      latestSubmissionId: latestSubmission?.submission_id || null,
      latestSubmissionDetailId: latestSubmissionDetail?.submission_detail_id || null,
      pickupEnabled: logisticsSettings?.is_pickup_enabled ?? null,
      haircutScheduleCount: Array.isArray(upcomingHaircutSchedules) ? upcomingHaircutSchedules.length : 0,
      latestReservationId: latestHaircutReservation?.reservation_id || null,
      latestCertificateId: latestCertificate?.certificate_id || null,
    });

    return {
      donationRequirement,
      logisticsSettings,
      upcomingHaircutSchedules,
      latestHaircutReservation,
      latestCertificate,
      latestSubmission,
      latestSubmissionDetail,
      error: null,
    };
  } catch (error) {
    return {
      donationRequirement: null,
      logisticsSettings: null,
      upcomingHaircutSchedules: [],
      latestHaircutReservation: null,
      latestCertificate: null,
      latestSubmission: null,
      latestSubmissionDetail: null,
      error: error.message || 'Unable to load the hair analyzer context.',
    };
  }
};

export const getHairDonationModuleContext = getHairAnalyzerContext;
