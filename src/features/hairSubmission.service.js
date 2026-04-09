import * as HairSubmissionAPI from './hairSubmission.api';
import {
  buildImmediateNotificationEvents,
  recordNotifications,
} from './notification.service';
import {
  hairSubmissionImageTypes,
  hairSubmissionStatuses,
  hairSubmissionStorageBucket,
} from './hairSubmission.constants';
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
      image_type: hairSubmissionImageTypes.donorUpload,
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

export const saveHairSubmissionFlow = async ({
  userId,
  photos,
  aiAnalysis,
  confirmedValues,
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
    });

    const { data: submission, error: submissionError } = await HairSubmissionAPI.createHairSubmission({
      user_id: userId,
      submission_code: buildSubmissionCode(),
      bundle_quantity: 1,
      donation_source: 'mobile_app',
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
      declared_texture: confirmedValues.declaredTexture,
      declared_density: confirmedValues.declaredDensity,
      declared_condition: confirmedValues.declaredCondition,
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

    const { data: screening, error: screeningError } = await HairSubmissionAPI.createAiScreening({
      submission_id: submission.submission_id,
      estimated_length: aiAnalysis.estimated_length ? Number(aiAnalysis.estimated_length) : null,
      detected_texture: aiAnalysis.detected_texture || null,
      detected_density: aiAnalysis.detected_density || null,
      detected_condition: aiAnalysis.detected_condition || null,
      visible_damage_notes: aiAnalysis.visible_damage_notes || null,
      confidence_score: aiAnalysis.confidence_score ? Number(aiAnalysis.confidence_score) : null,
      decision: aiAnalysis.decision || null,
      summary: aiAnalysis.summary || null,
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
