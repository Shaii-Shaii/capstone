import { invokeEdgeFunction } from '../api/supabase/client';
import { hairAnalysisFunctionName } from './hairSubmission.constants';
import { getErrorMessage, logAppError, logAppEvent } from '../utils/appErrors';

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

export const analyzeHairPhotos = async ({ images }) => {
  try {
    if (!images?.length) {
      throw new Error('Please upload at least one hair photo before analysis.');
    }

    const invalidImages = images.filter((image) => !image?.dataUrl || !image?.mimeType);
    if (invalidImages.length) {
      throw new Error('One or more uploaded photos could not be read. Please upload or retake the unclear image again.');
    }

    const payload = {
      images: images.map((image) => ({
        mimeType: image.mimeType,
        dataUrl: image.dataUrl,
        viewKey: image.viewKey,
        viewLabel: image.viewLabel,
      })),
    };

    logAppEvent('hairAnalysis.invoke', 'Invoking hair analysis edge function.', {
      functionName: hairAnalysisFunctionName,
      imageCount: payload.images.length,
      imageViews: payload.images.map((image) => image.viewLabel || image.viewKey).filter(Boolean),
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
      : technicalMessage.includes('could not be read')
        ? 'One of the selected photos could not be read. Please upload or retake that image again.'
        : technicalMessage.includes('invalid jwt')
          ? 'Your session has expired. Please sign in again, then retry the hair analysis.'
          : technicalMessage.includes('requested function was not found') || technicalMessage.includes('not_found')
            ? 'Hair analysis is still being connected on the server. Please try again in a moment.'
            : technicalMessage.includes('required hair views') || technicalMessage.includes('please add these required hair views')
              ? resolvedMessage
            : technicalMessage.includes('top (scalp)') || technicalMessage.includes('front') || technicalMessage.includes('side') || technicalMessage.includes('back')
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
