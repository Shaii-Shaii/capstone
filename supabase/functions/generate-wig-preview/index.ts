import { createJsonResponse, handleCorsPreflight } from '../_shared/cors';
import { createStructuredResponse } from '../_shared/google-ai';

const MAX_PREVIEW_VARIANTS = 3;
const GOOGLE_WIG_MODEL = 'gemini-2.5-flash';

const previewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    previews: {
      type: 'array',
      minItems: MAX_PREVIEW_VARIANTS,
      maxItems: MAX_PREVIEW_VARIANTS,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          option_index: { type: 'integer', minimum: 1, maximum: MAX_PREVIEW_VARIANTS },
          summary: { type: 'string' },
          style_notes: { type: 'string' },
          recommended_style_name: { type: 'string' },
          recommended_style_family: { type: 'string' },
          match_label: { type: 'string' },
          image_prompt_hint: { type: 'string' },
        },
        required: [
          'option_index',
          'summary',
          'style_notes',
          'recommended_style_name',
          'recommended_style_family',
          'match_label',
          'image_prompt_hint',
        ],
      },
    },
  },
  required: ['previews'],
};

const instructions = [
  'You are a patient wig adviser for a mobile patient-support app.',
  'Use Google Gemini vision only. Return JSON only.',
  'Analyze the current front-facing reference image and the current patient preferences.',
  'Assess visible skin tone, face shape, hairline/forehead framing, and practical comfort needs.',
  'Preserve the patient identity exactly in any visual reference instruction: do not change facial features, facial proportions, skin tone, eyes, nose, lips, jaw, expression, or face shape.',
  'The intended visual edit is hair/wig only. Only alter hairstyle, wig silhouette, hair color, hair texture, length, volume, bangs, and face-framing hair.',
  'Create exactly 3 distinct wearable wig reference options.',
  'The generated options are references only and do not guarantee final wig design or availability.',
  'Avoid costume styles, medical claims, product claims, stock claims, or unrealistic styling.',
  'Make each option visually distinct through length, silhouette, texture, volume, or face framing.',
  'Every option summary must briefly explain how the suggestion uses the visible skin tone, face shape, hairline, or selected preferences.',
  'Every image_prompt_hint must be written as a hair-only edit instruction that preserves the original face and identity.',
  'Keep summaries concise and patient-friendly.',
].join(' ');

const extractMimeTypeFromDataUrl = (value: string) => {
  const match = /^data:([^;]+);base64,/i.exec(value || '');
  return match?.[1] || '';
};

const extractBase64Payload = (value: string) => {
  const commaIndex = value.indexOf(',');
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : '';
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
};

const loadReferenceImagePart = async (referenceImageDataUrl: string, referenceImageUrl: string) => {
  if (referenceImageDataUrl.startsWith('data:')) {
    const mimeType = extractMimeTypeFromDataUrl(referenceImageDataUrl) || 'image/jpeg';
    const data = extractBase64Payload(referenceImageDataUrl);
    if (!data) return null;
    return { inlineData: { mimeType, data } };
  }

  if (referenceImageUrl.startsWith('http://') || referenceImageUrl.startsWith('https://')) {
    const response = await fetch(referenceImageUrl);
    if (!response.ok) return null;
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    const data = arrayBufferToBase64(await response.arrayBuffer());
    return { inlineData: { mimeType, data } };
  }

  return null;
};

const normalizeVariant = (variant: Record<string, unknown>, visualReference: string, fallbackIndex: number) => {
  const optionIndex = Number.isFinite(Number(variant?.option_index))
    ? Math.min(Math.max(Number(variant.option_index), 1), MAX_PREVIEW_VARIANTS)
    : fallbackIndex + 1;

  return {
    id: `variant-${optionIndex}`,
    option_index: optionIndex,
    generated_image_data_url: visualReference,
    preview_url: visualReference,
    summary: typeof variant?.summary === 'string' ? variant.summary.trim() : '',
    style_notes: typeof variant?.style_notes === 'string' ? variant.style_notes.trim() : '',
    recommended_style_name: typeof variant?.recommended_style_name === 'string'
      ? variant.recommended_style_name.trim()
      : `Reference Style ${optionIndex}`,
    recommended_style_family: typeof variant?.recommended_style_family === 'string'
      ? variant.recommended_style_family.trim()
      : 'Wearable patient wig',
    match_label: typeof variant?.match_label === 'string' ? variant.match_label.trim() : `Option ${optionIndex}`,
    image_prompt_hint: typeof variant?.image_prompt_hint === 'string' ? variant.image_prompt_hint.trim() : '',
  };
};

const buildPreviewPayload = (normalizedPreviews: Array<Record<string, unknown>>) => {
  const previews = normalizedPreviews.slice(0, MAX_PREVIEW_VARIANTS);
  const primaryPreview = previews[0] || null;
  const options = previews.map((preview) => ({
    id: preview.id,
    option_index: preview.option_index,
    name: preview.recommended_style_name,
    note: preview.style_notes || preview.summary,
    summary: preview.summary,
    style_notes: preview.style_notes,
    family: preview.recommended_style_family,
    match_label: preview.match_label,
    generated_image_data_url: preview.generated_image_data_url,
    preview_url: preview.preview_url,
  }));

  return {
    preview_url: typeof primaryPreview?.preview_url === 'string' ? primaryPreview.preview_url : '',
    generated_image_data_url: typeof primaryPreview?.generated_image_data_url === 'string'
      ? primaryPreview.generated_image_data_url
      : '',
    preview: primaryPreview
      ? {
        ...primaryPreview,
        options,
      }
      : null,
    previews,
    selected_preview_url: null,
  };
};

Deno.serve(async (request) => {
  const preflightResponse = handleCorsPreflight(request);
  if (preflightResponse) return preflightResponse;

  try {
    const body = await request.json();
    const preferredColor = typeof body?.preferred_color === 'string' ? body.preferred_color.trim() : '';
    const preferredLength = typeof body?.preferred_length === 'string' ? body.preferred_length.trim() : '';
    const hairTexture = typeof body?.hair_texture === 'string' ? body.hair_texture.trim() : '';
    const capSize = typeof body?.cap_size === 'string' ? body.cap_size.trim() : '';
    const stylePreference = typeof body?.style_preference === 'string' ? body.style_preference.trim() : '';
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
    const referenceImageDataUrl = typeof body?.reference_image?.dataUrl === 'string'
      ? body.reference_image.dataUrl
      : '';
    const referenceImageUrl = typeof body?.reference_image?.imageUrl === 'string'
      ? body.reference_image.imageUrl
      : '';
    const visualReference = referenceImageDataUrl || referenceImageUrl;
    const hasGoogleAiApiKey = Boolean(Deno.env.get('GOOGLE_AI_API_KEY'));

    if (!visualReference) {
      return createJsonResponse({ error: 'A front photo is required before generating a wig preview.' }, 400);
    }

    console.info('[generate-wig-preview] invoked', {
      provider: 'gemini',
      model: GOOGLE_WIG_MODEL,
      hasGoogleAiApiKey,
      hasReferenceImageDataUrl: Boolean(referenceImageDataUrl),
      hasReferenceImageUrl: Boolean(referenceImageUrl),
    });

    if (!hasGoogleAiApiKey) {
      console.error('[generate-wig-preview] google ai key missing');
      return createJsonResponse({
        error: 'Wig preview is not configured on the server. Please try again later.',
        errorType: 'configuration_error',
        provider: 'gemini',
      }, 500);
    }

    const imagePart = await loadReferenceImagePart(referenceImageDataUrl, referenceImageUrl);
    if (!imagePart) {
      return createJsonResponse({ error: 'The front photo could not be prepared for analysis.' }, 400);
    }

    const providerResult = await createStructuredResponse({
      systemInstruction: instructions,
      responseJsonSchema: previewSchema,
      maxOutputTokens: 1200,
      model: GOOGLE_WIG_MODEL,
      includeDiagnostics: true,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                'Create wig reference options from this current patient request.',
                'Analyze the provided image directly. Do not reuse stale recommendations.',
                'Base recommendations on visible skin tone, face shape, hairline/forehead framing, and the selected preferences.',
                'For visual guidance, preserve the exact same face and skin tone. Modify only the wig/hair region.',
                `Preferred color: ${preferredColor || 'not provided'}`,
                `Preferred length: ${preferredLength || 'not provided'}`,
                `Preferred texture: ${hairTexture || 'not provided'}`,
                `Cap size: ${capSize || 'not sure'}`,
                `Style preference: ${stylePreference || 'not provided'}`,
                `Special notes: ${notes || 'none'}`,
              ].join('\n'),
            },
            imagePart,
          ],
        },
      ],
    });

    const rawVariants = Array.isArray(providerResult?.parsed?.previews)
      ? providerResult.parsed.previews.slice(0, MAX_PREVIEW_VARIANTS)
      : [];

    if (rawVariants.length !== MAX_PREVIEW_VARIANTS) {
      throw new Error('Gemini did not return the required wig preview variants.');
    }

    const normalizedPreviews = rawVariants.map((variant, index) =>
      normalizeVariant(variant || {}, visualReference, index)
    );
    const payload = buildPreviewPayload(normalizedPreviews);

    console.info('[generate-wig-preview] gemini response ready', {
      provider: 'gemini',
      previewCount: payload.previews.length,
      providerRequestAttempted: providerResult?.diagnostics?.provider_request_attempted ?? true,
      providerResponseStatus: providerResult?.diagnostics?.provider_response_status ?? null,
      parseSuccess: providerResult?.diagnostics?.provider_parse_success ?? true,
    });

    return createJsonResponse({
      success: true,
      provider: 'gemini',
      model: GOOGLE_WIG_MODEL,
      ...payload,
    });
  } catch (error) {
    console.error('[generate-wig-preview]', error);
    const errorMessage = error instanceof Error ? error.message : String(error || '');
    const isConfigurationError = errorMessage.toLowerCase().includes('google ai api key');

    return createJsonResponse({
      error: isConfigurationError
        ? 'Wig preview is not configured on the server. Please try again later.'
        : 'We could not generate the wig preview right now. Please try again.',
      errorType: isConfigurationError ? 'configuration_error' : 'provider_error',
      provider: 'gemini',
    }, isConfigurationError ? 500 : 502);
  }
});
