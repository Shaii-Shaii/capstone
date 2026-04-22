import { invokeEdgeFunction } from '../api/supabase/client';
import { hairAnalysisFunctionName } from './hairSubmission.constants';
import { normalizeHairAnalyzerAnswers } from './hairSubmission.schema';
import { getErrorMessage, logAppError, logAppEvent } from '../utils/appErrors';

const WEB_ANALYSIS_IMAGE_MAX_SIZE = 1400;
const WEB_ANALYSIS_IMAGE_QUALITY = 0.8;

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
  detected_color: data?.detected_color || '',
  detected_texture: data?.detected_texture || '',
  detected_density: data?.detected_density || '',
  detected_condition: data?.detected_condition || '',
  visible_damage_notes: data?.visible_damage_notes || '',
  confidence_score: data?.confidence_score ?? null,
  decision: data?.decision || '',
  summary: data?.summary || '',
  length_assessment: data?.length_assessment || '',
  donation_readiness_note: data?.donation_readiness_note || '',
  history_assessment: data?.history_assessment || '',
  recommendations: normalizeRecommendations(data?.recommendations || []),
});

const hasStructuredAnalysisContent = (analysis) => Boolean(
  analysis?.summary
  || analysis?.decision
  || analysis?.detected_color
  || analysis?.detected_texture
  || analysis?.detected_density
  || analysis?.detected_condition
  || (Array.isArray(analysis?.recommendations) && analysis.recommendations.length)
);

const isGeminiProviderMarker = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'gemini' || normalized === 'google-gemini';
};

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

const estimateImagePayloadBytes = (images = []) => (
  (images || []).reduce((total, image) => total + (image?.base64 ? image.base64.length : 0), 0)
);

const isGatewayFailureResponse = (message = '') => {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('502 bad gateway')
    || normalized.includes('<title>502 bad gateway</title>')
    || normalized.includes('<h1>502 bad gateway</h1>')
  );
};

const extractErrorPayloadFromResponse = async (response) => {
  if (!response || typeof response.clone !== 'function') {
    return null;
  }

  try {
    const payload = await response.clone().json();
    return payload && typeof payload === 'object' ? payload : null;
  } catch (_jsonError) {
    return null;
  }
};

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

const buildStructuredAnalysisError = (message, extras = {}) => {
  const error = new Error(message || 'Hair analysis could not be completed right now.');
  Object.assign(error, extras);
  return error;
};

const isQuotaLikeError = (message = '', errorType = '') => {
  const normalizedMessage = String(message || '').toLowerCase();
  const normalizedType = String(errorType || '').trim().toLowerCase();

  return (
    normalizedType === 'quota_exceeded'
    || normalizedMessage.includes('quota exceeded')
    || normalizedMessage.includes('free tier request limit')
    || normalizedMessage.includes('rate limit')
    || normalizedMessage.includes('retry in')
  );
};

const isTemporaryUnavailableError = (message = '', errorType = '') => {
  const normalizedMessage = String(message || '').toLowerCase();
  const normalizedType = String(errorType || '').trim().toLowerCase();

  return (
    normalizedType === 'temporary_unavailable'
    || normalizedMessage.includes('high demand')
    || normalizedMessage.includes('temporarily busy')
    || normalizedMessage.includes('temporarily unavailable')
    || normalizedMessage.includes('service unavailable')
    || normalizedMessage.includes('retry later')
    || normalizedMessage.includes('resource exhausted')
    || normalizedMessage.includes('overloaded')
  );
};

const isServerConfigurationError = (message = '') => {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('api key is not configured')
    || normalized.includes('not configured in edge function secrets')
    || normalized.includes('hair analysis is not configured on the server')
  );
};

const isInvokeTransportError = (message = '') => {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('network request failed')
    || normalized.includes('failed to fetch')
    || normalized.includes('load failed')
    || normalized.includes('fetcherror')
    || normalized.includes('could not connect')
  );
};

export const analyzeHairPhotos = async ({
  images,
  questionnaireAnswers,
  complianceContext = null,
  donationRequirementContext = null,
  submissionContext = null,
  historyContext = null,
  correctedDetails = null,
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
      throw new Error('Please complete the guided hair questions before analysis.');
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
      history_context: historyContext
        ? {
            total_checks: Number(historyContext.total_checks) || 0,
            latest_condition: historyContext.latest_condition || '',
            latest_check_at: historyContext.latest_check_at || '',
            latest_result: historyContext.latest_result
              ? {
                  created_at: historyContext.latest_result.created_at || '',
                  detected_condition: historyContext.latest_result.detected_condition || '',
                  decision: historyContext.latest_result.decision || '',
                  summary: historyContext.latest_result.summary || '',
                  estimated_length: historyContext.latest_result.estimated_length ?? null,
                }
              : null,
            latest_recommendations: Array.isArray(historyContext.latest_recommendations)
              ? historyContext.latest_recommendations.map((recommendation, index) => ({
                  title: recommendation?.title || '',
                  recommendation_text: recommendation?.recommendation_text || '',
                  priority_order: recommendation?.priority_order ?? index + 1,
                }))
              : [],
            entries: Array.isArray(historyContext.entries)
              ? historyContext.entries.map((entry) => ({
                  created_at: entry.created_at || '',
                  detected_condition: entry.detected_condition || '',
                  decision: entry.decision || '',
                  summary: entry.summary || '',
                  estimated_length: entry.estimated_length ?? null,
                  recommendations: Array.isArray(entry.recommendations)
                    ? entry.recommendations.map((recommendation, index) => ({
                        title: recommendation?.title || '',
                        recommendation_text: recommendation?.recommendation_text || '',
                        priority_order: recommendation?.priority_order ?? index + 1,
                      }))
                    : [],
                }))
              : [],
          }
        : null,
      corrected_details: correctedDetails
        ? {
            length_value: correctedDetails.length_value ?? null,
            length_unit: correctedDetails.length_unit || '',
            normalized_length_cm: correctedDetails.normalized_length_cm ?? null,
            texture: correctedDetails.texture || '',
            density: correctedDetails.density || '',
          }
        : null,
    };

    logAppEvent('hairAnalysis.invoke', 'Invoking hair analysis edge function.', {
      functionName: hairAnalysisFunctionName,
      concernType: payload.concern_type,
      hasDonationRequirementContext: Boolean(payload.donation_requirement_context),
      hasSubmissionContext: Boolean(payload.submission_context?.submission_id),
      hasHistoryContext: Boolean(payload.history_context?.entries?.length),
      hasCorrectedDetails: Boolean(payload.corrected_details),
      questionKeys: Object.keys(payload.questionnaire_answers || {}),
      imageCount: payload.images.length,
      imageViews: payload.images.map((image) => image.viewLabel || image.viewKey).filter(Boolean),
      usesWebOptimizedImages: preparedImages.some((image, index) => image?.dataUrl !== images?.[index]?.dataUrl),
      estimatedImagePayloadBytes: estimateImagePayloadBytes(preparedImages),
    });

    const functionResult = await invokeEdgeFunction(hairAnalysisFunctionName, {
      body: payload,
    });

    if (functionResult.error) {
      const errorPayload = await extractErrorPayloadFromResponse(functionResult.error?.context);
      const edgeFunctionInvoked = errorPayload?.edge_function_invoked === true;
      const providerRequestAttempted = errorPayload?.provider_request_attempted === true;
      const providerResponseStatus = errorPayload?.provider_response_status ?? null;
      const providerParseSuccess = errorPayload?.provider_parse_success ?? null;

      logAppEvent('hairAnalysis.invoke', 'Hair analysis edge invoke failed before a usable result was returned.', {
        functionName: hairAnalysisFunctionName,
        hasErrorContext: Boolean(functionResult.error?.context),
        edgeFunctionInvoked,
        providerRequestAttempted,
        providerResponseStatus,
        providerParseSuccess,
      }, 'warn');

      throw buildStructuredAnalysisError(
        errorPayload?.error || await resolveFunctionErrorMessage(functionResult.error),
        {
          errorType: providerRequestAttempted ? errorPayload?.error_type || null : null,
          retryAfterSeconds: providerRequestAttempted ? errorPayload?.retry_after_seconds ?? null : null,
          edgeFunctionInvoked,
          providerRequestAttempted,
          providerResponseStatus,
          providerParseSuccess,
        }
      );
    }

    const analysisPayload = functionResult.data?.analysis ? functionResult.data.analysis : functionResult.data;
    logAppEvent('hairAnalysis.invoke', 'Hair analysis edge function returned.', {
      functionName: hairAnalysisFunctionName,
      success: functionResult.data?.success ?? null,
      provider: functionResult.data?.provider || '',
      edgeFunctionInvoked: functionResult.data?.edge_function_invoked ?? null,
      providerRequestAttempted: functionResult.data?.provider_request_attempted ?? null,
      providerResponseStatus: functionResult.data?.provider_response_status ?? null,
      providerParseSuccess: functionResult.data?.provider_parse_success ?? null,
      responseKeys: functionResult.data ? Object.keys(functionResult.data) : [],
      analysisKeys: analysisPayload ? Object.keys(analysisPayload) : [],
      hasLengthAssessment: Boolean(analysisPayload?.length_assessment),
      hasEstimatedLength: analysisPayload?.estimated_length != null,
      usedCorrectedDetails: Boolean(payload.corrected_details),
      recommendationCount: Array.isArray(analysisPayload?.recommendations)
        ? analysisPayload.recommendations.length
        : Array.isArray(functionResult.data?.recommendations)
          ? functionResult.data.recommendations.length
          : 0,
    });

    if (!analysisPayload) {
      throw new Error('The AI analysis response was incomplete.');
    }

    if (functionResult.data?.edge_function_invoked === false) {
      throw new Error('Hair analysis did not reach the server function.');
    }

    if (functionResult.data?.provider_request_attempted === false) {
      throw new Error('Hair analysis did not reach Gemini.');
    }

    if (functionResult.data?.provider_parse_success === false) {
      throw new Error('Gemini returned a response that could not be parsed.');
    }

    const normalizedAnalysis = normalizeAnalysis({
      ...analysisPayload,
      recommendations: analysisPayload?.recommendations || functionResult.data?.recommendations || [],
    });

    logAppEvent('hairAnalysis.invoke', 'Hair analysis fields preserved from Gemini response.', {
      functionName: hairAnalysisFunctionName,
      usedAiSummary: Boolean(normalizedAnalysis.summary),
      usedAiLengthAssessment: Boolean(normalizedAnalysis.length_assessment),
      usedAiEstimatedLength: normalizedAnalysis.estimated_length != null,
      usedAiColor: Boolean(normalizedAnalysis.detected_color),
      usedAiCondition: Boolean(normalizedAnalysis.detected_condition),
      usedAiTexture: Boolean(normalizedAnalysis.detected_texture),
      usedAiDensity: Boolean(normalizedAnalysis.detected_density),
      usedAiRecommendations: Array.isArray(normalizedAnalysis.recommendations)
        ? normalizedAnalysis.recommendations.length
        : 0,
    });

    if (!hasStructuredAnalysisContent(normalizedAnalysis)) {
      throw new Error('The uploaded photos were not clear enough for a reliable hair analysis. Please retake the photos in better lighting and try again.');
    }

    const providerMarker = functionResult.data?.provider || '';
    logAppEvent('hairAnalysis.invoke', 'Hair analysis response validated.', {
      functionName: hairAnalysisFunctionName,
      providerMarker,
      providerMarkerRecognized: isGeminiProviderMarker(providerMarker),
      edgeFunctionInvoked: functionResult.data?.edge_function_invoked ?? null,
      providerRequestAttempted: functionResult.data?.provider_request_attempted ?? null,
      providerResponseStatus: functionResult.data?.provider_response_status ?? null,
      providerParseSuccess: functionResult.data?.provider_parse_success ?? null,
      usedStructuredAnalysisValidation: true,
    });

    if (!isGeminiProviderMarker(providerMarker)) {
      throw new Error('Hair analysis returned an unexpected AI provider response.');
    }

    return {
      analysis: normalizedAnalysis,
      provider: providerMarker,
      error: null,
    };
  } catch (error) {
    const resolvedMessage = await resolveFunctionErrorMessage(error);
    const technicalMessage = resolvedMessage.toLowerCase();
    const providerRequestAttempted = error?.providerRequestAttempted === true;
    const edgeFunctionInvoked = error?.edgeFunctionInvoked === true;
    const providerResponseStatus = Number.isFinite(Number(error?.providerResponseStatus))
      ? Number(error.providerResponseStatus)
      : null;
    const directRetryAfterSeconds = Number(error?.retryAfterSeconds);
    const retryAfterSeconds = Number.isFinite(directRetryAfterSeconds) && directRetryAfterSeconds > 0
      ? Math.max(1, Math.ceil(directRetryAfterSeconds))
      : null;
    const errorType = providerRequestAttempted
      ? String(error?.errorType || '').trim().toLowerCase()
      : '';
    const isRateLimitError = providerRequestAttempted && isQuotaLikeError(resolvedMessage, errorType);
    const isTemporaryBusyError = providerRequestAttempted && isTemporaryUnavailableError(resolvedMessage, errorType);

    if (
      !technicalMessage.includes('requested function was not found')
      && !technicalMessage.includes('not_found')
      && !technicalMessage.includes('invalid jwt')
    ) {
      const logContext = {
        imageCount: images?.length || 0,
        functionName: hairAnalysisFunctionName,
        edgeFunctionInvoked,
        providerRequestAttempted,
        providerResponseStatus,
        errorType: isRateLimitError
          ? 'quota_exceeded'
          : isTemporaryBusyError
            ? 'temporary_unavailable'
            : errorType || null,
        retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
      };

      if (isRateLimitError) {
        logAppEvent('hairAnalysis.analyzeHairPhotos', 'Gemini request returned a retryable quota or rate-limit response.', {
          ...logContext,
          message: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? `Cannot analyze hair, please try again in ${retryAfterSeconds} seconds.`
            : 'Cannot analyze hair right now. Please try again later.',
        }, 'warn');
      } else if (isTemporaryBusyError) {
        logAppEvent('hairAnalysis.analyzeHairPhotos', 'Gemini request returned a temporary-unavailable response.', {
          ...logContext,
          message: 'Hair analysis is temporarily busy right now. Please try again in a moment.',
        }, 'warn');
      } else if (!edgeFunctionInvoked) {
        logAppEvent('hairAnalysis.analyzeHairPhotos', 'Hair analysis invoke failed before the edge function was reached.', {
          ...logContext,
          message: resolvedMessage || 'Hair analysis could not reach the server function.',
        }, 'warn');
      } else if (!providerRequestAttempted) {
        logAppEvent('hairAnalysis.analyzeHairPhotos', 'Hair analysis failed on the server before Gemini was called.', {
          ...logContext,
          message: resolvedMessage || 'Hair analysis failed before the provider request started.',
        }, 'warn');
      } else {
        logAppError('hairAnalysis.analyzeHairPhotos', error, logContext);
      }
    }

    const userMessage = technicalMessage.includes('at least one hair photo')
      ? 'Please upload at least one clear hair photo before running the analysis.'
      : isRateLimitError
        ? Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? `Cannot analyze hair, please try again in ${retryAfterSeconds} seconds.`
          : 'Cannot analyze hair right now. Please try again later.'
      : isGatewayFailureResponse(resolvedMessage)
        ? 'Hair analysis is temporarily unavailable on the server right now. Please try again in a moment.'
      : isTemporaryBusyError
        ? 'Hair analysis is temporarily busy right now. Please try again in a moment.'
      : isServerConfigurationError(resolvedMessage)
        ? 'Hair analysis is not configured on the server right now. Please try again later.'
      : !edgeFunctionInvoked && isInvokeTransportError(resolvedMessage)
        ? 'Hair analysis could not reach the server right now. Please try again.'
      : !edgeFunctionInvoked
        ? 'Cannot start hair analysis right now. Please try again.'
      : edgeFunctionInvoked && !providerRequestAttempted
        ? 'Hair analysis could not start on the server right now. Please try again.'
      : technicalMessage.includes('guided donation questions') || technicalMessage.includes('guided hair questions')
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
            : technicalMessage.includes('does not represent a valid image')
              ? resolvedMessage
            : technicalMessage.includes('could not be processed for ai analysis')
              ? resolvedMessage
            : technicalMessage.includes('front view photo')
              || technicalMessage.includes('side profile photo')
              || technicalMessage.includes('side view photo')
              || technicalMessage.includes('back view photo')
              || technicalMessage.includes('hair ends close-up')
              ? resolvedMessage
            : technicalMessage.includes('does not clearly show hair') || technicalMessage.includes('not look like hair')
              ? resolvedMessage
            : technicalMessage.includes('not clear enough for a reliable hair analysis')
              ? resolvedMessage
            : technicalMessage.includes('invalid json') || technicalMessage.includes('could not be parsed')
              ? 'The AI response could not be read properly. Please try the hair analysis again.'
            : technicalMessage.includes('incomplete')
              ? 'Hair analysis could not be completed right now.'
              : 'Hair analysis could not be completed right now.';

    return {
      analysis: null,
      error: userMessage,
      errorType: isRateLimitError ? 'quota_exceeded' : errorType || null,
      retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
      edgeFunctionInvoked,
      providerRequestAttempted,
      providerResponseStatus,
    };
  }
};
