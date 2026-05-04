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

const buildStorageBucketMissingMessage = (bucketName = hairSubmissionStorageBucket) => (
  `Hair photo storage is not ready yet. Storage bucket "${bucketName}" was not found.`
);

const decodeBase64ToArrayBuffer = (base64Value = '') => {
  const normalizedBase64 = String(base64Value || '').trim();
  if (!normalizedBase64) {
    throw new Error('One of the required hair photos is missing its image data.');
  }

  if (typeof atob === 'function') {
    const binary = atob(normalizedBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const sanitizedBase64 = normalizedBase64.replace(/=+$/, '');
  const outputLength = Math.floor((sanitizedBase64.length * 3) / 4);
  const bytes = new Uint8Array(outputLength);
  let buffer = 0;
  let bitsCollected = 0;
  let outputIndex = 0;

  for (let index = 0; index < sanitizedBase64.length; index += 1) {
    const character = sanitizedBase64[index];
    const charIndex = base64Chars.indexOf(character);

    if (charIndex === -1) {
      throw new Error('The app could not decode one of the required hair photos before upload.');
    }

    buffer = (buffer << 6) | charIndex;
    bitsCollected += 6;

    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes[outputIndex] = (buffer >> bitsCollected) & 0xff;
      outputIndex += 1;
    }
  }

  return bytes.buffer.slice(0, outputIndex);
};

const getFileExtension = (mimeType = 'image/jpeg', fileName = '') => {
  const normalizedMimeType = String(mimeType || '').toLowerCase();
  const normalizedFileName = String(fileName || '').trim().toLowerCase();

  if (normalizedMimeType.includes('png') || normalizedFileName.endsWith('.png')) return 'png';
  if (normalizedMimeType.includes('webp') || normalizedFileName.endsWith('.webp')) return 'webp';
  return 'jpg';
};

const buildUploadSourceUri = (photo) => photo?.dataUrl || photo?.uri || '';

const resolveAnalysisImageType = (viewKey = '') => {
  const normalizedViewKey = String(viewKey || '').trim();
  return [
    hairSubmissionImageTypes.frontView,
    hairSubmissionImageTypes.sideProfile,
    hairSubmissionImageTypes.hairEndsCloseUp,
  ].includes(normalizedViewKey)
    ? normalizedViewKey
    : hairSubmissionImageTypes.donorUpload;
};

const getPhotoUploadPayload = async (photo) => {
  const contentType = photo?.mimeType || photo?.file?.type || 'image/jpeg';
  const fileName = photo?.fileName || photo?.file?.name || `hair-photo.${getFileExtension(contentType)}`;

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

  const uploadSourceUri = buildUploadSourceUri(photo);
  if (!uploadSourceUri) {
    throw new Error('One of the required hair photos is missing its upload source.');
  }

  const fileResponse = await fetch(uploadSourceUri);
  if (!fileResponse.ok) {
    throw new Error('Failed to read one of the required hair photos before upload.');
  }

  return {
    fileBody: await fileResponse.arrayBuffer(),
    contentType,
    fileName,
  };
};

const uploadSelectedImages = async ({ userId, submissionId, detailId, photos }) => {
  const uploadedRows = [];

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const imageType = resolveAnalysisImageType(photo?.viewKey);
    logAppEvent('hair_submission.save', 'Preparing hair submission photo upload.', {
      userId,
      submissionId,
      detailId,
      index,
      viewKey: imageType,
      sourceType: photo?.sourceType || null,
      usesFileObject: Boolean(photo?.file && typeof photo.file.arrayBuffer === 'function'),
      usesDataUrl: Boolean(photo?.dataUrl),
      hasUri: Boolean(photo?.uri),
    });

    let uploadPayload;

    try {
      uploadPayload = await getPhotoUploadPayload(photo);
    } catch (payloadError) {
      logAppEvent('hair_submission.save', 'Hair submission photo payload preparation failed.', {
        userId,
        submissionId,
        detailId,
        index,
        viewKey: imageType,
        message: payloadError?.message || 'Image payload could not be prepared.',
      }, 'warn');

      throw new Error(payloadError?.message || 'Failed to read one of the required hair photos before upload.');
    }

    const extension = getFileExtension(uploadPayload.contentType, uploadPayload.fileName);
    const filePath = `${userId}/${submissionId}/${detailId}-${imageType || `view-${index + 1}`}.${extension}`;
    const uploadResult = await HairSubmissionAPI.uploadHairSubmissionImage({
      path: filePath,
      fileBody: uploadPayload.fileBody,
      contentType: uploadPayload.contentType,
      bucket: hairSubmissionStorageBucket,
    });

    if (uploadResult.error) {
      logAppEvent('hair_submission.save', 'Hair submission photo upload failed.', {
        userId,
        submissionId,
        detailId,
        index,
        viewKey: imageType,
        bucket: hairSubmissionStorageBucket,
        message: uploadResult.error.message || 'Storage upload failed.',
      }, 'warn');

      const uploadMessage = uploadResult.error.message || 'Failed to upload one of the selected photos.';
      if (uploadMessage.toLowerCase().includes('bucket not found')) {
        throw new Error(buildStorageBucketMissingMessage());
      }

      throw new Error(uploadMessage);
    }

    logAppEvent('hair_submission.save', 'Hair submission photo uploaded.', {
      userId,
      submissionId,
      detailId,
      index,
      viewKey: imageType,
      bucket: hairSubmissionStorageBucket,
    });

    uploadedRows.push({
      submission_detail_id: detailId,
      file_path: filePath,
      image_type: imageType,
    });
  }

  return uploadedRows;
};

const rollbackHairSubmissionSave = async ({
  userId,
  submissionId = null,
  detailId = null,
  uploadedPaths = [],
  hasImageReferences = false,
  hasLogistics = false,
  hasScreening = false,
  hasRecommendations = false,
}) => {
  if (!submissionId && !detailId && !uploadedPaths.length) return;

  logAppEvent('hair_submission.save', 'Rolling back partial hair submission save.', {
    userId,
    submissionId,
    detailId,
    uploadedPathCount: uploadedPaths.length,
    hasImageReferences,
    hasLogistics,
    hasScreening,
    hasRecommendations,
  }, 'warn');

  const rollbackSteps = [
    async () => {
      if (!hasRecommendations || !submissionId) return;
      const { error } = await HairSubmissionAPI.deleteDonorRecommendationsBySubmissionId(submissionId);
      if (error) throw error;
    },
    async () => {
      if (!hasScreening || !submissionId) return;
      const { error } = await HairSubmissionAPI.deleteAiScreeningsBySubmissionId(submissionId);
      if (error) throw error;
    },
    async () => {
      if (!hasLogistics || !submissionId) return;
      const { error } = await HairSubmissionAPI.deleteHairSubmissionLogisticsBySubmissionId(submissionId);
      if (error) throw error;
    },
    async () => {
      if (!hasImageReferences || !detailId) return;
      const { error } = await HairSubmissionAPI.deleteHairSubmissionImagesByDetailId(detailId);
      if (error) throw error;
    },
    async () => {
      if (!uploadedPaths.length) return;
      const { error } = await HairSubmissionAPI.removeHairSubmissionImagesFromStorage({ paths: uploadedPaths });
      if (error) throw error;
    },
    async () => {
      if (!detailId) return;
      const { error } = await HairSubmissionAPI.deleteHairSubmissionDetailById(detailId);
      if (error) throw error;
    },
    async () => {
      if (!submissionId) return;
      const { error } = await HairSubmissionAPI.deleteHairSubmissionById(submissionId);
      if (error) throw error;
    },
  ];

  for (const rollbackStep of rollbackSteps) {
    try {
      await rollbackStep();
    } catch (rollbackError) {
      logAppEvent('hair_submission.save', 'Rollback step failed after hair submission save error.', {
        userId,
        submissionId,
        detailId,
        message: rollbackError?.message || 'Rollback step failed.',
      }, 'warn');
    }
  }
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
  if (!donationMode?.logistics_type || !['shipping', 'pickup'].includes(donationMode.value)) return null;

  const notes = [];
  if (donationMode.value === 'shipping') {
    notes.push('Donor selected logistics / shipping after AI screening.');
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
  databaseUserId = null,
  photos,
  aiAnalysis,
  confirmedValues,
  questionnaireAnswers,
  donationModeValue = '',
  logisticsSettings = null,
}) => {
  let createdSubmission = null;
  let createdDetail = null;
  let uploadedImageRows = [];
  let hasImageReferences = false;
  let hasLogistics = false;
  let hasScreening = false;
  let hasRecommendations = false;

  try {
    if (!userId && !databaseUserId) throw new Error('Your session is not ready.');
    if (!photos?.length) throw new Error('Please upload at least one photo.');
    if (!aiAnalysis) throw new Error('Run the AI analysis before saving.');

    logAppEvent('hair_submission.save', 'Saving analyzed hair submission.', {
      userId,
      databaseUserId,
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
    const hasTreatmentHistory = normalizedQuestionnaire.has_treatment_history === 'yes'
      || normalizedQuestionnaire.chemical_process_history === 'yes';
    const detailNotes = [
      confirmedValues.detailNotes || '',
      hasTreatmentHistory ? 'Questionnaire noted prior chemical processing.' : '',
    ].filter(Boolean).join(' ');
    const submissionPayload = {
      user_id: userId,
      database_user_id: databaseUserId,
      submission_code: buildSubmissionCode(),
      bundle_quantity: 1,
      donation_source: 'mobile_app',
      delivery_method: selectedDonationMode?.delivery_method
        || (normalizedQuestionnaire.screening_intent === 'checking_eligibility_first' ? 'eligibility_check' : null),
      pickup_request: selectedDonationMode?.pickup_request ?? false,
      status: hairSubmissionStatuses.submission.submitted,
      donor_notes: detailNotes || null,
    };

    logAppEvent('hair_submission.save', 'Hair submission payload built.', {
      userId,
      databaseUserId,
      donationModeValue,
      selectedDonationMode: selectedDonationMode?.value || null,
      submissionPayloadKeys: Object.keys(submissionPayload),
      deliveryMethod: submissionPayload.delivery_method,
      pickupRequest: submissionPayload.pickup_request,
    });

    const { data: submission, error: submissionError } = await HairSubmissionAPI.createHairSubmission(submissionPayload);

    if (submissionError) {
      throw new Error(submissionError.message || 'Unable to create the hair submission.');
    }
    createdSubmission = submission;

    logAppEvent('hair_submission.save', 'Hair submission row created.', {
      userId,
      submissionId: submission?.submission_id || null,
    });

    const detailPayload = {
      submission_id: submission.submission_id,
      bundle_number: 1,
      declared_length: Number(confirmedValues.declaredLength),
      declared_color: confirmedValues.declaredColor || aiAnalysis?.detected_color || null,
      declared_texture: confirmedValues.declaredTexture,
      declared_density: confirmedValues.declaredDensity,
      declared_condition: confirmedValues.declaredCondition,
      is_chemically_treated: hasTreatmentHistory,
      is_colored: false,
      is_bleached: false,
      is_rebonded: false,
      detail_notes: detailNotes || null,
      status: hairSubmissionStatuses.detail.pending,
    };

    logAppEvent('hair_submission.save', 'Hair submission detail payload built.', {
      userId,
      submissionId: submission?.submission_id || null,
      detailPayloadKeys: Object.keys(detailPayload),
      declaredLength: detailPayload.declared_length,
      declaredColor: detailPayload.declared_color,
      isChemicallyTreated: detailPayload.is_chemically_treated,
      isColored: detailPayload.is_colored,
      isBleached: detailPayload.is_bleached,
      isRebonded: detailPayload.is_rebonded,
    });

    const { data: detail, error: detailError } = await HairSubmissionAPI.createHairSubmissionDetail(detailPayload);

    if (detailError) {
      throw new Error(detailError.message || 'Unable to save the donor-confirmed hair details.');
    }
    createdDetail = detail;

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
    uploadedImageRows = imageRows;

    const { error: imageInsertError } = await HairSubmissionAPI.createHairSubmissionImages(imageRows);
    if (imageInsertError) {
      throw new Error(imageInsertError.message || 'Unable to save the uploaded image references.');
    }
    hasImageReferences = true;

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
      logAppEvent('hair_submission.save', 'Hair submission logistics payload built.', {
        userId,
        submissionId: submission?.submission_id || null,
        logisticsPayloadKeys: Object.keys(logisticsPayload),
        logisticsType: logisticsPayload.logistics_type || null,
      });

      const { error: logisticsError } = await HairSubmissionAPI.createHairSubmissionLogistics(logisticsPayload);

      if (logisticsError) {
        throw new Error(logisticsError.message || 'Unable to save the selected donation logistics path.');
      }
      hasLogistics = true;

      logAppEvent('hair_submission.save', 'Hair submission logistics row created.', {
        userId,
        submissionId: submission?.submission_id || null,
        logisticsType: logisticsPayload.logistics_type,
      });
    }

    const { data: screening, error: screeningError } = await HairSubmissionAPI.createAiScreening({
      submission_id: submission.submission_id,
      estimated_length: Number.isFinite(normalizedEstimatedLength) ? normalizedEstimatedLength : null,
      detected_color: aiAnalysis.detected_color || null,
      detected_texture: aiAnalysis.detected_texture || null,
      detected_density: aiAnalysis.detected_density || null,
      detected_condition: aiAnalysis.detected_condition || null,
      visible_damage_notes: aiAnalysis.visible_damage_notes || null,
      confidence_score: Number.isFinite(normalizedConfidenceScore) ? normalizedConfidenceScore : null,
      shine_level: aiAnalysis.shine_level ?? null,
      frizz_level: aiAnalysis.frizz_level ?? null,
      dryness_level: aiAnalysis.dryness_level ?? null,
      oiliness_level: aiAnalysis.oiliness_level ?? null,
      damage_level: aiAnalysis.damage_level ?? null,
      decision: aiAnalysis.decision || null,
      summary: aiAnalysis.summary || null,
    });

    logAppEvent('hair_submission.save', 'AI screening payload prepared.', {
      userId,
      submissionId: submission?.submission_id || null,
      analysisKeys: aiAnalysis ? Object.keys(aiAnalysis) : [],
      dbPayloadKeys: [
        'estimated_length',
        'detected_color',
        'detected_texture',
        'detected_density',
        'detected_condition',
        'visible_damage_notes',
        'confidence_score',
        'shine_level',
        'frizz_level',
        'dryness_level',
        'oiliness_level',
        'damage_level',
        'decision',
        'summary',
      ],
      recommendationCount: Array.isArray(aiAnalysis?.recommendations) ? aiAnalysis.recommendations.length : 0,
    });

    if (screeningError) {
      throw new Error(screeningError.message || 'Unable to save the AI screening result.');
    }
    hasScreening = true;

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
      hasRecommendations = true;

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
      try {
        await recordNotifications({
          userId,
          role: 'donor',
          notifications: notificationEvents,
        });
      } catch (notificationError) {
        logAppEvent('hair_submission.save', 'Notification persistence failed after submission save.', {
          userId,
          submissionId: submission?.submission_id || null,
          message: notificationError?.message || 'Unable to persist notifications.',
        }, 'warn');
      }
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
    await rollbackHairSubmissionSave({
      userId,
      submissionId: createdSubmission?.submission_id || null,
      detailId: createdDetail?.submission_detail_id || null,
      uploadedPaths: uploadedImageRows.map((row) => row?.file_path).filter(Boolean),
      hasImageReferences,
      hasLogistics,
      hasScreening,
      hasRecommendations,
    });

    logAppEvent('hair_submission.save', 'Hair submission save failed.', {
      userId,
      message: error.message || 'Unable to save your hair submission.',
    }, 'error');

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
