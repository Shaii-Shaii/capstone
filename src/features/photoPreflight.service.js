import { invokeEdgeFunction } from '../api/supabase/client';

const toSafeMessage = (value, fallback = '') => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value.message === 'string' && value.message.trim()) return value.message.trim();
  if (value && typeof value.error === 'string' && value.error.trim()) return value.error.trim();
  return fallback;
};

const isQuotaOrRateLimitMessage = (value = '') => {
  const normalized = String(value || '').toLowerCase();
  return (
    normalized.includes('quota')
    || normalized.includes('rate limit')
    || normalized.includes('resource_exhausted')
    || normalized.includes('resource exhausted')
    || normalized.includes('retry in')
    || normalized.includes('retrydelay')
  );
};

const simplifyProviderErrorMessage = (value = '') => {
  const message = toSafeMessage(value, '');
  if (!message) return '';

  if (isQuotaOrRateLimitMessage(message)) {
    const retryMatch = message.match(/retry\s+in\s+(\d+(?:\.\d+)?)s/i)
      || message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
    const retrySeconds = retryMatch?.[1] ? Math.ceil(Number(retryMatch[1])) : null;
    return retrySeconds
      ? `Photo checker is temporarily busy. Please try again in about ${retrySeconds} seconds.`
      : 'Photo checker is temporarily busy because the AI quota or rate limit was reached. Please try again later.';
  }

  return message;
};

const readFunctionErrorMessage = async (error) => {
  const fallback = 'Photo validation could not run. Please try again before analysis.';
  const response = error?.context;

  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      const message = toSafeMessage(payload?.message || payload?.error || payload, '');
      if (message) return message;
    } catch (_jsonError) {
      // Fall through to text parsing.
    }

    try {
      const text = await response.clone().text();
      if (typeof text === 'string' && text.trim()) return text.trim();
    } catch (_textError) {
      // Fall through to fallback.
    }
  }

  const message = toSafeMessage(error, fallback);
  if (message.toLowerCase().includes('requested function was not found')) {
    return 'Photo checker is not deployed yet. Deploy validate-hair-photo-set before running hair analysis.';
  }
  return message;
};

const runServerPhotoSetValidation = async ({ photos = [], requiredViews = [] } = {}) => {
  const payload = {
    images: photos.map((photo, index) => ({
      dataUrl: photo?.dataUrl || '',
      mimeType: photo?.mimeType || 'image/jpeg',
      viewKey: requiredViews[index]?.key || null,
      viewLabel: requiredViews[index]?.label || `Photo ${index + 1}`,
    })),
  };

  const result = await invokeEdgeFunction('validate-hair-photo-set', {
    body: payload,
  });
  if (result.error) {
    const message = await readFunctionErrorMessage(result.error);
    return {
      ok: false,
      title: 'Photo Validation Unavailable',
      message,
      details: [],
      serverValidationFailed: true,
    };
  }

  const validation = result.data?.validation || {};
  const reason = simplifyProviderErrorMessage(validation.reason)
    || 'The required photos do not look consistent. Retake all views with the same person and same current hair.';
  if (validation.is_acceptable !== true) {
    const providerBusy = isQuotaOrRateLimitMessage(validation.reason);
    return {
      ok: false,
      title: providerBusy ? 'Photo Checker Busy' : 'Photos Do Not Match',
      message: reason,
      details: Array.isArray(validation.failed_views)
        ? validation.failed_views.map((viewLabel) => ({
          viewLabel: toSafeMessage(viewLabel, 'Photo'),
          error: reason,
        }))
        : [],
      serverValidationFailed: false,
      providerBusy,
    };
  }

  return {
    ok: true,
    title: 'Photos Ready',
    message: 'Photo validation passed. The images are ready for AI hair analysis.',
    details: [],
    serverValidationFailed: false,
  };
};

export const validateHairPhotosBeforeAnalysis = async ({ photos = [], requiredViews = [] } = {}) => {
  const filledPhotos = photos.filter(Boolean);
  if (!filledPhotos.length || filledPhotos.length !== requiredViews.length) {
    return {
      ok: false,
      skipped: false,
      title: 'Photos Incomplete',
      message: 'Complete all required photos before running analysis.',
      details: [],
    };
  }

  const serverValidation = await runServerPhotoSetValidation({ photos, requiredViews });
  if (!serverValidation.ok) {
    return {
      ...serverValidation,
      skipped: false,
    };
  }

  return {
    ok: true,
    skipped: false,
    title: 'Photos Ready',
    message: toSafeMessage(serverValidation.message, 'Photo validation passed. The images are ready for AI hair analysis.'),
    details: serverValidation.details || [],
  };
};
