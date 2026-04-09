import { invokeEdgeFunction } from '../api/supabase/client';
import { hairAnalysisFunctionName } from './hairSubmission.constants';
import { normalizeHairAnalyzerAnswers } from './hairSubmission.schema';
import { getErrorMessage, logAppError, logAppEvent } from '../utils/appErrors';

const WEB_ANALYSIS_IMAGE_MAX_SIZE = 1280;
const WEB_ANALYSIS_IMAGE_QUALITY = 0.72;

const normalizeRecommendations = (source = []) => (
  source
    .map((item, index) => {
      const recommendationText = item?.recommendation_text || item?.recommendation || item?.message || item?.text || '';
      const parsedPriority = Number(item?.priority_order ?? item?.priority ?? item?.rank);

      return {
        title: item?.title || item?.heading || '',
        recommendation_text: recommendationText.trim(),
        priority_order: Number.isFinite(parsedPriority) && parsedPriority > 0 ? parsedPriority : index + 1,
      };
    })
    .filter((item) => item.recommendation_text)
    .sort((left, right) => left.priority_order - right.priority_order)
);

const normalizeViewNotes = (source = []) => (
  source
    .map((item) => ({
      view: item?.view || '',
      clearly_visible: item?.clearly_visible !== false,
      notes: item?.notes || '',
    }))
    .filter((item) => item.view)
);

const normalizeAnalysis = (data) => ({
  is_hair_detected: data?.is_hair_detected !== false,
  invalid_image_reason: data?.invalid_image_reason || '',
  missing_views: Array.isArray(data?.missing_views) ? data.missing_views : [],
  per_view_notes: normalizeViewNotes(data?.per_view_notes || []),
  estimated_length: data?.estimated_length ?? null,
  detected_texture: data?.detected_texture || '',
  detected_density: data?.detected_density || '',
  detected_condition: data?.detected_condition || '',
  visible_damage_notes: data?.visible_damage_notes || '',
  confidence_score: data?.confidence_score ?? null,
  decision: data?.decision || '',
  summary: data?.summary || '',
  recommendations: normalizeRecommendations(data?.recommendations || []),
});

const hasStructuredAnalysisContent = (analysis) => Boolean(
  analysis?.summary
  || analysis?.decision
  || analysis?.detected_texture
  || analysis?.detected_density
  || analysis?.detected_condition
  || (Array.isArray(analysis?.recommendations) && analysis.recommendations.length)
);

const optimizeWebImageForAnalysis = async (image) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return image;
  }

  if (typeof image?.dataUrl !== 'string' || !image.dataUrl.startsWith('data:')) {
    return image;
  }

  const optimizedAsset = await new Promise((resolve, reject) => {
    const previewImage = new Image();
    previewImage.onload = () => {
      try {
        const width = Number(previewImage.naturalWidth || previewImage.width || 0);
        const height = Number(previewImage.naturalHeight || previewImage.height || 0);

        if (!width || !height) {
          resolve(image);
          return;
        }

        const scale = Math.min(1, WEB_ANALYSIS_IMAGE_MAX_SIZE / Math.max(width, height));
        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const context = canvas.getContext('2d');
        if (!context) {
          resolve(image);
          return;
        }

        context.drawImage(previewImage, 0, 0, targetWidth, targetHeight);
        const optimizedDataUrl = canvas.toDataURL('image/jpeg', WEB_ANALYSIS_IMAGE_QUALITY);
        const [, optimizedBase64 = ''] = optimizedDataUrl.split(',');

        resolve({
          ...image,
          uri: optimizedDataUrl,
          dataUrl: optimizedDataUrl,
          base64: optimizedBase64,
          mimeType: 'image/jpeg',
          width: targetWidth,
          height: targetHeight,
        });
      } catch (error) {
        reject(error);
      }
    };
    previewImage.onerror = () => reject(new Error('The uploaded hair photo could not be prepared for analysis.'));
    previewImage.src = image.dataUrl;
  });

  return optimizedAsset;
};

const prepareImagesForAnalysis = async (images = []) => (
  await Promise.all((images || []).map((image) => optimizeWebImageForAnalysis(image)))
);

const resolveFunctionErrorMessage = async (error) => {
  const response = error?.context;

  if (!response || typeof response.clone !== 'function') {
    return getErrorMessage(error);
  }

  try {
    const payload = await response.clone().json();
    if (typeof payload?.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }
    if (typeof payload?.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }
  } catch (_jsonError) {
    // Fall back to plain text parsing.
  }

  try {
    const text = await response.clone().text();
    if (text?.trim()) {
      return text.trim();
    }
  } catch (_textError) {
    // Fall back to the original error message.
  }

  return getErrorMessage(error);
};

export const analyzeHairPhotos = async ({
  images,
  questionnaireAnswers,
  complianceContext = null,
  donationRequirementContext = null,
  submissionContext = null,
}) => {
  try {
    if (!images?.length) {
      throw new Error('Please upload at least one hair photo before analysis.');
    }

    const preparedImages = await prepareImagesForAnalysis(images);
    const invalidImages = preparedImages.filter((image) => !image?.dataUrl || !image?.mimeType);
    if (invalidImages.length) {
      throw new Error('One or more uploaded photos could not be read. Please upload or retake the unclear image again.');
    }

    const normalizedAnswers = normalizeHairAnalyzerAnswers(questionnaireAnswers);
    if (!normalizedAnswers?.questionnaire_answers?.screening_intent) {
      throw new Error('Please complete the guided donation questions before analysis.');
    }

    if (!complianceContext?.acknowledged) {
      throw new Error('Please confirm the photo compliance checklist before analysis.');
    }

    const payload = {
      concern_type: normalizedAnswers.concern_type,
      questionnaire_answers: normalizedAnswers.questionnaire_answers,
      compliance_context: {
        acknowledged: Boolean(complianceContext?.acknowledged),
      },
      images: preparedImages.map((image) => ({
        mimeType: image.mimeType,
        dataUrl: image.dataUrl,
        viewKey: image.viewKey,
        viewLabel: image.viewLabel,
      })),
      donation_requirement_context: donationRequirementContext
        ? {
            donation_requirement_id: donationRequirementContext.donation_requirement_id || null,
            minimum_hair_length: donationRequirementContext.minimum_hair_length ?? null,
            chemical_treatment_status: donationRequirementContext.chemical_treatment_status ?? null,
            colored_hair_status: donationRequirementContext.colored_hair_status ?? null,
            bleached_hair_status: donationRequirementContext.bleached_hair_status ?? null,
            rebonded_hair_status: donationRequirementContext.rebonded_hair_status ?? null,
            hair_texture_status: donationRequirementContext.hair_texture_status || '',
            notes: donationRequirementContext.notes || '',
          }
        : null,
      submission_context: submissionContext
        ? {
            submission_id: submissionContext.submission_id || null,
            donation_drive_id: submissionContext.donation_drive_id || null,
            organization_id: submissionContext.organization_id || null,
            detail_id: submissionContext.submission_detail_id || null,
            declared_length: submissionContext.declared_length ?? null,
            declared_texture: submissionContext.declared_texture || '',
            declared_density: submissionContext.declared_density || '',
            declared_condition: submissionContext.declared_condition || '',
          }
        : null,
    };

    logAppEvent('hairAnalysis.invoke', 'Invoking hair analysis edge function.', {
      functionName: hairAnalysisFunctionName,
      concernType: payload.concern_type,
      hasDonationRequirementContext: Boolean(payload.donation_requirement_context),
      hasSubmissionContext: Boolean(payload.submission_context?.submission_id),
      questionKeys: Object.keys(payload.questionnaire_answers || {}),
      imageCount: payload.images.length,
      imageViews: payload.images.map((image) => image.viewLabel || image.viewKey).filter(Boolean),
      usesWebOptimizedImages: preparedImages.some((image, index) => image?.dataUrl !== images?.[index]?.dataUrl),
    });

    const functionResult = await invokeEdgeFunction(hairAnalysisFunctionName, {
      body: payload,
    });

    if (functionResult.error) {
      throw new Error(await resolveFunctionErrorMessage(functionResult.error));
    }

    const analysisPayload = functionResult.data?.analysis ? functionResult.data.analysis : functionResult.data;
    logAppEvent('hairAnalysis.invoke', 'Hair analysis edge function returned.', {
      functionName: hairAnalysisFunctionName,
      success: functionResult.data?.success ?? null,
      responseKeys: functionResult.data ? Object.keys(functionResult.data) : [],
      analysisKeys: analysisPayload ? Object.keys(analysisPayload) : [],
      recommendationCount: Array.isArray(analysisPayload?.recommendations)
        ? analysisPayload.recommendations.length
        : Array.isArray(functionResult.data?.recommendations)
          ? functionResult.data.recommendations.length
          : 0,
    });

    if (!analysisPayload) {
      throw new Error('The AI analysis response was incomplete.');
    }

    const normalizedAnalysis = normalizeAnalysis({
      ...analysisPayload,
      recommendations: analysisPayload?.recommendations || functionResult.data?.recommendations || [],
    });

    if (!hasStructuredAnalysisContent(normalizedAnalysis)) {
      throw new Error('The uploaded photos were not clear enough for a reliable hair analysis. Please retake the photos in better lighting and try again.');
    }

    return {
      analysis: normalizedAnalysis,
      error: null,
    };
  } catch (error) {
    const resolvedMessage = await resolveFunctionErrorMessage(error);
    const technicalMessage = resolvedMessage.toLowerCase();

    if (
      !technicalMessage.includes('requested function was not found')
      && !technicalMessage.includes('not_found')
      && !technicalMessage.includes('invalid jwt')
    ) {
      logAppError('hairAnalysis.analyzeHairPhotos', error, {
        imageCount: images?.length || 0,
        functionName: hairAnalysisFunctionName,
      });
    }

    const userMessage = technicalMessage.includes('at least one hair photo')
      ? 'Please upload at least one clear hair photo before running the analysis.'
      : technicalMessage.includes('guided donation questions')
        ? 'Please complete the guided questions before analysis.'
      : technicalMessage.includes('compliance checklist')
        ? 'Please confirm the photo checklist before analysis.'
        : technicalMessage.includes('could not be read')
          ? 'One of the selected photos could not be read. Please upload or retake that image again.'
          : technicalMessage.includes('invalid jwt')
            ? 'Your session has expired. Please sign in again, then retry the hair analysis.'
            : technicalMessage.includes('requested function was not found') || technicalMessage.includes('not_found')
              ? 'Hair analysis is still being connected on the server. Please try again in a moment.'
            : technicalMessage.includes('required hair views') || technicalMessage.includes('please add these required hair views')
              ? resolvedMessage
            : technicalMessage.includes('too large for analysis')
              ? resolvedMessage
            : technicalMessage.includes('could not be processed for ai analysis')
              ? resolvedMessage
            : technicalMessage.includes('front view photo') || technicalMessage.includes('back view photo') || technicalMessage.includes('hair ends close-up') || technicalMessage.includes('side view photo')
              ? resolvedMessage
            : technicalMessage.includes('does not clearly show hair') || technicalMessage.includes('not look like hair')
              ? resolvedMessage
            : technicalMessage.includes('not clear enough for a reliable hair analysis')
              ? resolvedMessage
            : technicalMessage.includes('incomplete')
              ? 'Hair analysis could not be completed right now.'
              : 'Hair analysis could not be completed right now.';

    return {
      analysis: null,
      error: userMessage,
    };
  }
};
