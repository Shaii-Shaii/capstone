import { invokeEdgeFunction } from '../api/supabase/client';
import { wigGenerationFunctionName } from './wigRequest.constants';
import { getErrorMessage, logAppError } from '../utils/appErrors';

const normalizePreview = (data) => ({
  summary: data?.summary || '',
  style_notes: data?.style_notes || '',
  recommended_style_name: data?.recommended_style_name || '',
  recommended_style_family: data?.recommended_style_family || '',
  generated_image_data_url: data?.generated_image_data_url || '',
  options: Array.isArray(data?.options)
    ? data.options
        .map((item, index) => ({
          id: item?.id || item?.name || `option-${index}`,
          name: item?.name || '',
          note: item?.note || '',
          family: item?.family || '',
          match_label: item?.match_label || item?.matchLabel || '',
          generated_image_data_url: item?.generated_image_data_url || item?.generatedImageDataUrl || '',
        }))
        .filter((item) => item.name || item.note || item.generated_image_data_url)
    : [],
});

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

const normalizeReferenceImage = (referenceImage = {}) => {
  const dataUrl = typeof referenceImage?.dataUrl === 'string' ? referenceImage.dataUrl.trim() : '';
  const uri = typeof referenceImage?.uri === 'string' ? referenceImage.uri.trim() : '';

  return {
    dataUrl: dataUrl.startsWith('data:') ? dataUrl : '',
    imageUrl: uri.startsWith('http://') || uri.startsWith('https://') ? uri : '',
  };
};

export const generatePatientWigPreview = async ({ preferences, referenceImage }) => {
  try {
    const normalizedReferenceImage = normalizeReferenceImage(referenceImage);
    if (!normalizedReferenceImage.dataUrl && !normalizedReferenceImage.imageUrl) {
      throw new Error('A front photo is required before generating a wig preview.');
    }

    const payload = {
      preferred_color: preferences?.preferredColor?.trim() || '',
      preferred_length: preferences?.preferredLength?.trim() || '',
      notes: preferences?.notes?.trim() || '',
      reference_image: normalizedReferenceImage,
    };

    const { data, error } = await invokeEdgeFunction(wigGenerationFunctionName, {
      body: payload,
    });

    if (error) {
      throw new Error(await resolveFunctionErrorMessage(error));
    }

    const previewPayload = data?.preview ? data.preview : data;
    const preview = normalizePreview(previewPayload);

    if (!preview.summary && !preview.recommended_style_name && !preview.options.length) {
      throw new Error('The wig preview response was incomplete.');
    }

    return {
      preview,
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
      logAppError('wigGeneration.generatePatientWigPreview', error, {
        hasReferenceImage: Boolean(referenceImage?.uri || referenceImage?.dataUrl),
        functionName: wigGenerationFunctionName,
      });
    }

    const userMessage = technicalMessage.includes('front photo')
      ? 'Please upload a clear front photo first.'
      : technicalMessage.includes('invalid jwt')
        ? 'Your session has expired. Please sign in again, then retry the wig preview.'
        : technicalMessage.includes('requested function was not found') || technicalMessage.includes('not_found')
          ? 'Wig preview is still being connected on the server. Please try again in a moment.'
          : technicalMessage.includes('incomplete')
            ? 'Preview could not be generated right now.'
            : 'Preview could not be generated right now.';

    return {
      preview: null,
      error: userMessage,
    };
  }
};
