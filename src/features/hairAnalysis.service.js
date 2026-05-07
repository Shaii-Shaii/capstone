import { invokeEdgeFunction } from '../api/supabase/client';
import { hairAnalysisFunctionName } from './hairSubmission.constants';
import { normalizeHairAnalyzerAnswers } from './hairSubmission.schema';
import { getErrorMessage, logAppError, logAppEvent } from '../utils/appErrors';

const WEB_ANALYSIS_IMAGE_MAX_SIZE = 1400;
const WEB_ANALYSIS_IMAGE_QUALITY = 0.8;
const HAIR_ANALYSIS_MAX_INVOKE_ATTEMPTS = 3;
const HAIR_ANALYSIS_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const waitFor = async (milliseconds = 0) => (
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(milliseconds) || 0)))
);

const resolveRetryDelayMs = ({ attempt = 1, retryAfterSeconds = null }) => {
  const retryAfter = Number(retryAfterSeconds);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(Math.ceil(retryAfter * 1000), 12000);
  }

  const backoff = 700 * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(backoff, 4200);
};

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
  shine_level: data?.shine_level ?? null,
  frizz_level: data?.frizz_level ?? null,
  dryness_level: data?.dryness_level ?? null,
  oiliness_level: data?.oiliness_level ?? null,
  damage_level: data?.damage_level ?? null,
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

const isSupportedAiProviderMarker = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'gemini' || normalized === 'google-ai' || normalized === 'openai';
};

const resolvePhotoQualityIssueMessage = (analysis = {}) => {
  const rawMessage = String(analysis?.invalid_image_reason || '').trim();
  const normalized = rawMessage.toLowerCase();
  const missingViews = Array.isArray(analysis?.missing_views) ? analysis.missing_views.filter(Boolean) : [];
  const isPlaceholderMessage = !rawMessage || ['n/a', 'na', 'none', 'null', 'not applicable'].includes(normalized);

  if (missingViews.length) {
    return `Photos incomplete. Please retake or add these required views: ${missingViews.join(', ')}.`;
  }

  if (analysis?.is_hair_detected === false) {
    return isPlaceholderMessage
      ? 'We could not reliably analyze the photos. Please retake the front view, side profile, and hair ends close-up in bright light with one person visible and no accessories covering the face or hair.'
      : rawMessage;
  }

  if (isPlaceholderMessage) return '';

  if (normalized.includes('too dark') || normalized.includes('dark') || normalized.includes('underexposed')) {
    return 'The photo looks too dark. Please move near bright indirect light and retake it.';
  }

  if (normalized.includes('no person') || normalized.includes('no human')) {
    return 'We could not detect a person in the photo. Please retake it with your hair clearly visible.';
  }

  if (normalized.includes('multiple subject') || normalized.includes('multiple people') || normalized.includes('more than one')) {
    return 'Multiple subjects detected. Please retake the photo with only one person in the frame.';
  }

  if (
    normalized.includes('accessor')
    || normalized.includes('hat')
    || normalized.includes('cap')
    || normalized.includes('clip')
    || normalized.includes('headband')
    || normalized.includes('glasses')
    || normalized.includes('sunglasses')
    || normalized.includes('eyeglasses')
    || normalized.includes('mask')
    || normalized.includes('scarf')
    || normalized.includes('headphones')
  ) {
    return 'Accessories detected. Remove glasses, sunglasses, masks, caps, headbands, clips, pins, hair ties, scarves, headphones, and anything covering the face or hair, then retake the required view.';
  }

  if (normalized.includes('blur') || normalized.includes('not clear') || normalized.includes('unclear')) {
    return 'Photos are not clear enough. Please retake them with a steady camera and good lighting.';
  }

  if (normalized.includes('background') || normalized.includes('distracting') || normalized.includes('clutter')) {
    return 'The background makes the analysis harder. Please retake the photo against a plain, uncluttered background.';
  }

  return rawMessage;
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

const isIncompleteProviderAnalysisMessage = (message = '') => {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('incomplete analysis')
    || normalized.includes('response was incomplete')
    || normalized.includes('ai returned an incomplete')
  );
};

const buildLowConfidenceFallbackAnalysis = ({ images = [], message = '' } = {}) => {
  const providedViews = (images || [])
    .map((image) => image?.viewLabel || image?.viewKey || '')
    .filter(Boolean);

  return normalizeAnalysis({
    is_hair_detected: true,
    invalid_image_reason: '',
    missing_views: [],
    per_view_notes: providedViews.map((view) => ({
      view,
      clearly_visible: true,
      notes: 'The AI provider received this photo but returned an incomplete structured result, so this view needs manual review or a clearer retake.',
    })),
    estimated_length: null,
    detected_color: 'Unclear',
    detected_texture: 'Unclear',
    detected_density: 'Unclear',
    detected_condition: 'Low-confidence image review',
    visible_damage_notes: 'The AI provider did not return enough structured detail to confirm visible damage from the current images.',
    confidence_score: 0.35,
    shine_level: 5,
    frizz_level: 5,
    dryness_level: 5,
    oiliness_level: 3,
    damage_level: 5,
    decision: 'Improve hair condition',
    summary: message
      ? `The photos reached the AI provider, but the returned analysis was incomplete. ${message}`
      : 'The photos reached the AI provider, but the returned analysis was incomplete. Please retake clear front, side profile, and hair ends photos if this result does not look accurate. Final screening requires manual review.',
    length_assessment: 'The AI provider did not return enough structured detail to estimate visible root-to-end hair length reliably.',
    donation_readiness_note: '',
    history_assessment: '',
    recommendations: [
      {
        title: 'Retake Clear Required Views',
        recommendation_text: 'Capture the front view, side profile, and hair ends close-up in bright lighting. Keep the hair fully visible without glasses, clips, caps, or other accessories.',
        priority_order: 1,
      },
      {
        title: 'Use a Plain Background',
        recommendation_text: 'Stand in front of a plain wall so the AI can separate the hair from the background. Avoid clutter, shadows, and other people in the frame.',
        priority_order: 2,
      },
      {
        title: 'Keep Hair Uncovered',
        recommendation_text: 'Remove anything covering the face, hairline, hair shaft, or ends before scanning. This helps the system check length, condition, and donation readiness more reliably.',
        priority_order: 3,
      },
    ],
  });
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

    let functionResult = null;
    for (let attempt = 1; attempt <= HAIR_ANALYSIS_MAX_INVOKE_ATTEMPTS; attempt += 1) {
      functionResult = await invokeEdgeFunction(hairAnalysisFunctionName, {
        body: payload,
      });

      if (!functionResult.error) break;

      const errorPayload = await extractErrorPayloadFromResponse(functionResult.error?.context);
      const edgeFunctionInvoked = errorPayload?.edge_function_invoked === true;
      const providerRequestAttempted = errorPayload?.provider_request_attempted === true;
      const providerResponseStatus = errorPayload?.provider_response_status ?? null;
      const providerParseSuccess = errorPayload?.provider_parse_success ?? null;
      const resolvedErrorMessage = errorPayload?.error || await resolveFunctionErrorMessage(functionResult.error);
      const normalizedErrorType = String(errorPayload?.error_type || '').trim().toLowerCase();
      const retryAfterSeconds = providerRequestAttempted ? errorPayload?.retry_after_seconds ?? null : null;
      const isRetryableProviderBusyError = (
        edgeFunctionInvoked
        && providerRequestAttempted
        && HAIR_ANALYSIS_RETRYABLE_STATUS.has(Number(providerResponseStatus))
        && (isTemporaryUnavailableError(resolvedErrorMessage, normalizedErrorType) || isQuotaLikeError(resolvedErrorMessage, normalizedErrorType))
      );
      const canRetry = isRetryableProviderBusyError && attempt < HAIR_ANALYSIS_MAX_INVOKE_ATTEMPTS;

      logAppEvent('hairAnalysis.invoke', 'Hair analysis edge invoke failed before a usable result was returned.', {
        functionName: hairAnalysisFunctionName,
        hasErrorContext: Boolean(functionResult.error?.context),
        edgeFunctionInvoked,
        providerRequestAttempted,
        providerResponseStatus,
        providerParseSuccess,
        attempt,
        maxAttempts: HAIR_ANALYSIS_MAX_INVOKE_ATTEMPTS,
        willRetry: canRetry,
      }, 'warn');

      if (
        edgeFunctionInvoked
        && providerRequestAttempted
        && providerResponseStatus === 200
        && providerParseSuccess === true
        && isIncompleteProviderAnalysisMessage(resolvedErrorMessage)
      ) {
        const fallbackAnalysis = buildLowConfidenceFallbackAnalysis({
          images: payload.images,
          message: 'The result below is marked low-confidence instead of blocking your check.',
        });

        logAppEvent('hairAnalysis.invoke', 'Recovered from incomplete provider analysis with a low-confidence fallback result.', {
          functionName: hairAnalysisFunctionName,
          imageCount: payload.images.length,
          providerResponseStatus,
          providerParseSuccess,
          attempt,
        }, 'warn');

        return {
          analysis: fallbackAnalysis,
          provider: 'gemini',
          error: null,
          recoveredFromIncompleteProviderResponse: true,
        };
      }

      if (canRetry) {
        const retryDelayMs = resolveRetryDelayMs({ attempt, retryAfterSeconds });
        logAppEvent('hairAnalysis.invoke', 'Retrying hair analysis after provider temporary-unavailable response.', {
          functionName: hairAnalysisFunctionName,
          attempt,
          maxAttempts: HAIR_ANALYSIS_MAX_INVOKE_ATTEMPTS,
          retryDelayMs,
          retryAfterSeconds: retryAfterSeconds ?? null,
          providerResponseStatus,
          errorType: normalizedErrorType || null,
        }, 'warn');
        await waitFor(retryDelayMs);
        continue;
      }

      throw buildStructuredAnalysisError(
        resolvedErrorMessage,
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
      throw new Error('Hair analysis did not reach the AI provider.');
    }

    if (functionResult.data?.provider_parse_success === false) {
      throw new Error('The AI provider returned a response that could not be parsed.');
    }

    const normalizedAnalysis = normalizeAnalysis({
      ...analysisPayload,
      recommendations: analysisPayload?.recommendations || functionResult.data?.recommendations || [],
    });

    const photoQualityIssueMessage = resolvePhotoQualityIssueMessage(normalizedAnalysis);
    if (photoQualityIssueMessage) {
      throw buildStructuredAnalysisError(photoQualityIssueMessage, {
        errorType: 'photo_quality',
        edgeFunctionInvoked: true,
        providerRequestAttempted: functionResult.data?.provider_request_attempted ?? true,
        providerResponseStatus: functionResult.data?.provider_response_status ?? null,
        providerParseSuccess: functionResult.data?.provider_parse_success ?? null,
      });
    }

    logAppEvent('hairAnalysis.invoke', 'Hair analysis fields preserved from AI provider response.', {
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
      providerMarkerRecognized: isSupportedAiProviderMarker(providerMarker),
      edgeFunctionInvoked: functionResult.data?.edge_function_invoked ?? null,
      providerRequestAttempted: functionResult.data?.provider_request_attempted ?? null,
      providerResponseStatus: functionResult.data?.provider_response_status ?? null,
      providerParseSuccess: functionResult.data?.provider_parse_success ?? null,
      usedStructuredAnalysisValidation: true,
    });

    if (!isSupportedAiProviderMarker(providerMarker)) {
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
    const canRecoverIncompleteProviderResponse = (
      edgeFunctionInvoked
      && providerRequestAttempted
      && providerResponseStatus === 200
      && isIncompleteProviderAnalysisMessage(resolvedMessage)
    );

    if (canRecoverIncompleteProviderResponse) {
      const fallbackAnalysis = buildLowConfidenceFallbackAnalysis({
        images,
        message: 'The result below is marked low-confidence instead of blocking your check.',
      });

      logAppEvent('hairAnalysis.analyzeHairPhotos', 'Recovered from incomplete AI provider analysis in catch path.', {
        imageCount: images?.length || 0,
        functionName: hairAnalysisFunctionName,
        edgeFunctionInvoked,
        providerRequestAttempted,
        providerResponseStatus,
        errorType: errorType || null,
      }, 'warn');

      return {
        analysis: fallbackAnalysis,
        provider: 'gemini',
        error: null,
        edgeFunctionInvoked,
        providerRequestAttempted,
        providerResponseStatus,
        recoveredFromIncompleteProviderResponse: true,
      };
    }

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
        logAppEvent('hairAnalysis.analyzeHairPhotos', 'AI provider request returned a retryable quota or rate-limit response.', {
          ...logContext,
          message: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? `Cannot analyze hair, please try again in ${retryAfterSeconds} seconds.`
            : 'Cannot analyze hair right now. Please try again later.',
        }, 'warn');
      } else if (isTemporaryBusyError) {
        logAppEvent('hairAnalysis.analyzeHairPhotos', 'AI provider request returned a temporary-unavailable response.', {
          ...logContext,
          message: 'Hair analysis is temporarily busy right now. Please try again in a moment.',
        }, 'warn');
      } else if (errorType === 'photo_quality') {
        logAppEvent('hairAnalysis.analyzeHairPhotos', 'AI provider marked the uploaded photos as unsuitable for reliable analysis.', {
          ...logContext,
          message: resolvedMessage || 'Photo quality did not meet the analysis requirements.',
        }, 'info');
      } else if (!edgeFunctionInvoked) {
        logAppEvent('hairAnalysis.analyzeHairPhotos', 'Hair analysis invoke failed before the edge function was reached.', {
          ...logContext,
          message: resolvedMessage || 'Hair analysis could not reach the server function.',
        }, 'warn');
      } else if (!providerRequestAttempted) {
        logAppEvent('hairAnalysis.analyzeHairPhotos', 'Hair analysis failed on the server before the AI provider was called.', {
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
            : errorType === 'photo_quality'
              ? ['n/a', 'na', 'none', 'null', 'not applicable'].includes(technicalMessage.trim())
                ? 'We could not reliably analyze the photos. Please retake the front view, side profile, and hair ends close-up in bright light with one person visible and no accessories covering the face or hair.'
                : resolvedMessage
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
