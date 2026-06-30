import { invokeEdgeFunction } from '../api/supabase/client';
import { wigGenerationFunctionName } from './wigRequest.constants';
import { getErrorMessage, logAppError, logAppEvent } from '../utils/appErrors';

const normalizePreviewOption = (item, index) => ({
  id: item?.id || `variant-${item?.option_index || index + 1}`,
  option_index: Number.isFinite(Number(item?.option_index)) ? Number(item.option_index) : index + 1,
  name: item?.recommended_style_name || item?.name || `Style ${index + 1}`,
  note: item?.note || item?.style_notes || item?.summary || '',
  summary: item?.summary || item?.note || '',
  style_notes: item?.style_notes || item?.note || '',
  family: item?.recommended_style_family || item?.family || '',
  match_label: item?.match_label || item?.matchLabel || `Option ${index + 1}`,
  preview_url: item?.preview_url || item?.generated_image_data_url || item?.generatedImageDataUrl || '',
  generated_image_data_url: item?.generated_image_data_url || item?.generatedImageDataUrl || item?.preview_url || '',
});

const normalizePreview = (data) => {
  const rawPreviews = Array.isArray(data?.previews)
    ? data.previews
    : Array.isArray(data?.options)
      ? data.options
      : [];

  const options = rawPreviews
    .map((item, index) => normalizePreviewOption(item, index))
    .filter((item) => item.name || item.note || item.generated_image_data_url);

  const primaryOption = options[0] || null;

  return {
    summary: data?.summary || primaryOption?.summary || '',
    style_notes: data?.style_notes || primaryOption?.style_notes || '',
    recommended_style_name: data?.recommended_style_name || primaryOption?.name || '',
    recommended_style_family: data?.recommended_style_family || primaryOption?.family || '',
    preview_url: data?.preview_url || data?.generated_image_data_url || primaryOption?.preview_url || primaryOption?.generated_image_data_url || '',
    generated_image_data_url: data?.generated_image_data_url || data?.preview_url || primaryOption?.generated_image_data_url || primaryOption?.preview_url || '',
    options,
  };
};

const buildFallbackPreview = ({ preferences, referenceImage }) => {
  const normalizedReferenceImage = normalizeReferenceImage(referenceImage);
  const visualReference = normalizedReferenceImage.dataUrl || normalizedReferenceImage.imageUrl;
  const color = preferences?.preferredColor?.trim() || 'available';
  const length = preferences?.preferredLength?.trim() || 'Available length';
  const texture = preferences?.hairTexture?.trim() || 'available texture';
  const density = preferences?.hairDensity?.trim() || '';
  const capSize = preferences?.capSize?.trim() || 'available cap size';
  const baseOptions = [
    {
      id: 'fallback-soft-natural',
      option_index: 1,
      name: `${length} ${texture}`,
      note: `${color} tone with a simple ${texture.toLowerCase()} finish.`,
      summary: `A ${length.toLowerCase()} ${texture.toLowerCase()} option based on your selected preferences.`,
      style_notes: `Color: ${color}. ${density ? `Density: ${density}. ` : ''}Cap size: ${capSize}.`,
      family: 'Natural daily style',
      match_label: 'Suggested',
    },
    {
      id: 'fallback-face-frame',
      option_index: 2,
      name: 'Face Frame',
      note: 'Soft layers around the face.',
      summary: 'A gentle face-framing option for a natural look.',
      style_notes: `Length: ${length}. Texture: ${texture}.`,
      family: 'Face-framing style',
      match_label: 'Option 2',
    },
    {
      id: 'fallback-lightweight',
      option_index: 3,
      name: 'Light Fit',
      note: 'Lightweight everyday fit.',
      summary: 'A comfortable style option for daily wear.',
      style_notes: `Cap size: ${capSize}.`,
      family: 'Comfort fit',
      match_label: 'Option 3',
    },
  ];

  const options = baseOptions.map((option) => ({
    ...option,
    preview_url: visualReference,
    generated_image_data_url: visualReference,
  }));

  return {
    summary: 'Preview suggestions are ready. Live AI styling is temporarily unavailable.',
    style_notes: 'These are preference-based suggestions and can still be submitted with your request.',
    recommended_style_name: options[0].name,
    recommended_style_family: options[0].family,
    preview_url: visualReference,
    generated_image_data_url: visualReference,
    options,
    is_fallback: true,
  };
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
      hair_texture: preferences?.hairTexture?.trim() || '',
      hair_density: preferences?.hairDensity?.trim() || '',
      cap_size: preferences?.capSize?.trim() || '',
      style_preference: preferences?.stylePreference?.trim() || '',
      notes: preferences?.specialNotes?.trim() || '',
      reference_image: normalizedReferenceImage,
    };

    logAppEvent('wigGeneration.invoke', 'Invoking wig preview edge function.', {
      functionName: wigGenerationFunctionName,
      provider: 'gemini',
      hasReferenceImageDataUrl: Boolean(normalizedReferenceImage.dataUrl),
      hasReferenceImageUrl: Boolean(normalizedReferenceImage.imageUrl),
      payloadKeys: Object.keys(payload),
    });

    const { data, error } = await invokeEdgeFunction(wigGenerationFunctionName, {
      body: payload,
    });

    if (error) {
      throw new Error(await resolveFunctionErrorMessage(error));
    }

    const previewPayload = data?.preview
      ? {
          ...data.preview,
          previews: Array.isArray(data?.previews) ? data.previews : data.preview?.options || [],
          preview_url: data.preview.preview_url || data.preview.generated_image_data_url || data?.preview_url || '',
          generated_image_data_url: data.preview.generated_image_data_url || data.preview.preview_url || data?.generated_image_data_url || '',
        }
      : {
          ...data,
          previews: Array.isArray(data?.previews) ? data.previews : [],
        };
    const preview = normalizePreview(previewPayload);

    logAppEvent('wigGeneration.invoke', 'Wig preview edge function returned.', {
      functionName: wigGenerationFunctionName,
      responseKeys: data ? Object.keys(data) : [],
      previewKeys: previewPayload ? Object.keys(previewPayload) : [],
      provider: data?.provider || 'gemini',
      hasGeneratedImage: Boolean(preview.generated_image_data_url),
      optionCount: preview.options.length,
    });

    if (
      preview.options.length < 3
      || !preview.generated_image_data_url
      || (!preview.summary && !preview.recommended_style_name && !preview.options.length)
    ) {
      throw new Error('The wig preview response was incomplete.');
    }

    return {
      preview,
      previews: preview.options,
      error: null,
    };
  } catch (error) {
    const resolvedMessage = await resolveFunctionErrorMessage(error);
    const technicalMessage = resolvedMessage.toLowerCase();
    const fallbackPreview = buildFallbackPreview({ preferences, referenceImage });
    const canUseFallback = Boolean(fallbackPreview.generated_image_data_url)
      && !technicalMessage.includes('front photo')
      && !technicalMessage.includes('invalid jwt')
      && !technicalMessage.includes('session has expired');

    if (
      !canUseFallback
      &&
      !technicalMessage.includes('requested function was not found')
      && !technicalMessage.includes('not_found')
      && !technicalMessage.includes('invalid jwt')
    ) {
      logAppError('wigGeneration.generatePatientWigPreview', error, {
        hasReferenceImage: Boolean(referenceImage?.uri || referenceImage?.dataUrl),
        functionName: wigGenerationFunctionName,
      });
    }

    if (canUseFallback) {
      logAppEvent('wigGeneration.generatePatientWigPreview.fallback', 'Using local wig preview fallback.', {
        functionName: wigGenerationFunctionName,
        reason: resolvedMessage,
        hasReferenceImage: Boolean(referenceImage?.uri || referenceImage?.dataUrl),
      }, 'warn');

      return {
        preview: fallbackPreview,
        previews: fallbackPreview.options,
        error: null,
      };
    }

    const userMessage = technicalMessage.includes('front photo')
      ? 'Please upload a clear front photo first.'
      : technicalMessage.includes('invalid jwt')
        ? 'Your session has expired. Please sign in again, then retry the wig preview.'
        : technicalMessage.includes('not configured') || technicalMessage.includes('google ai api key')
          ? 'Wig preview is not configured on the server. Please try again later.'
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
