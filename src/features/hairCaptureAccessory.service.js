import { invokeEdgeFunction } from '../api/supabase/client';

const normalizeDetectedAccessories = (value = []) => (
  Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
    : []
);

const buildDetectedMessage = (items = []) => {
  const label = items.length ? items.join(' and ').toLowerCase() : 'an accessory';
  return `We found ${label} covering the hair needed for this view. Move or remove it, then take this photo again.`;
};

const buildPresentationMessage = (issues = []) => {
  if (issues.length) {
    return `${issues.join(' and ')}. Wear your hair loose and fully visible, then take this photo again.`;
  }
  return 'Wear your hair loose and fully visible with no cap, tie, bun, ponytail, or covering, then take this photo again.';
};

export const checkHairCaptureAccessories = async ({ photo, view } = {}) => {
  if (!photo?.dataUrl) {
    return {
      ok: false,
      blocked: false,
      retryable: true,
      title: 'Photo Check Unavailable',
      message: 'We could not check this photo. Please try again.',
      detectedAccessories: [],
    };
  }

  const result = await invokeEdgeFunction('validate-hair-capture-accessories', {
    body: {
      image: {
        dataUrl: photo.dataUrl,
        mimeType: photo.mimeType || 'image/jpeg',
      },
      view: {
        key: view?.key || '',
        label: view?.label || 'Hair photo',
      },
    },
  });

  if (result.error) {
    return {
      ok: false,
      blocked: false,
      retryable: true,
      title: 'Accessory Check Unavailable',
      message: 'We could not check for accessories. Please try again.',
      detectedAccessories: [],
    };
  }

  const check = result.data?.check || {};
  const detectedAccessories = normalizeDetectedAccessories(check.detected_accessories);
  const presentationIssues = normalizeDetectedAccessories(check.presentation_issues);
  const screeningCompleted = check.visual_screening_completed === true;
  const blocked = check.accessory_detected === true || detectedAccessories.length > 0;
  const hasPresentationDecision = typeof check.hair_fully_visible === 'boolean'
    && typeof check.hair_loose_and_down === 'boolean';
  const presentationBlocked = check.hair_fully_visible !== true
    || check.hair_loose_and_down !== true
    || presentationIssues.length > 0;
  const usabilityBlocked = check.view_correct !== true
    || check.image_clear !== true
    || check.lighting_acceptable !== true;
  const photoVerificationToken = String(result.data?.photo_verification_token || '').trim();

  if (blocked) {
    return {
      ok: false,
      blocked: true,
      retryable: false,
      title: 'Show the Required Hair Area',
      message: `${buildDetectedMessage(detectedAccessories)} Wear your hair loose and fully visible.`,
      detectedAccessories,
      presentationIssues,
      confidence: Number(check.confidence || 0),
    };
  }

  if (!screeningCompleted || typeof check.accessory_detected !== 'boolean' || !hasPresentationDecision) {
    return {
      ok: false,
      blocked: false,
      retryable: true,
      title: 'Accessory Check Unavailable',
      message: 'We could not finish checking this photo. Please try again.',
      detectedAccessories: [],
    };
  }

  if (presentationBlocked || usabilityBlocked || check.can_capture !== true) {
    return {
      ok: false,
      blocked: true,
      retryable: false,
      title: usabilityBlocked ? 'Retake This Hair View' : 'Show Your Hair Properly',
      message: usabilityBlocked
        ? String(check.reason || 'Use the requested angle with clear, even lighting and keep the required hair area in frame.')
        : buildPresentationMessage(presentationIssues),
      detectedAccessories: [],
      presentationIssues,
      confidence: Number(check.confidence || 0),
    };
  }

  if (!photoVerificationToken) {
    return {
      ok: false,
      blocked: false,
      retryable: true,
      title: 'Photo Check Unavailable',
      message: 'The photo passed visually, but its secure verification could not be completed. Please try again.',
      detectedAccessories: [],
    };
  }

  return {
    ok: true,
    blocked: false,
    retryable: false,
    title: '',
    message: '',
    detectedAccessories: [],
    confidence: Number(check.confidence || 0),
    photoVerificationToken,
  };
};
