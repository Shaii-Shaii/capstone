import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { createStructuredResponse } from '../_shared/google-ai.ts';

const validationSchema = {
  type: 'object',
  properties: {
    validation: {
      type: 'object',
      properties: {
        is_acceptable: { type: 'boolean' },
        reason: { type: 'string' },
        failed_views: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['is_acceptable', 'reason', 'failed_views'],
    },
  },
  required: ['validation'],
};

const normalizeString = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const extractBase64Data = (dataUrl: string) => {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
};

const extractMimeType = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] || 'image/jpeg';
};

const instructions = [
  'You validate hair-screening photos before a separate hair analysis step.',
  'Return JSON only.',
  'Do not identify the person. Do not infer age, ethnicity, or other sensitive identity traits.',
  'Only decide whether the submitted photo set is acceptable for hair analysis.',
  '',
  'Rules:',
  '1. There must be exactly one visible subject in front and side views.',
  '2. Front View Photo must be face-forward and show the current hair clearly.',
  '3. Side Profile Photo must show the same current hair from the side; reject if it appears to be a different person or unrelated stock/model image.',
  '4. Hair Ends Close-Up must show the hair ends/tips, not the scalp/crown/top part, not a random hair photo, and not a watermarked stock-like image.',
  '5. All required views must visually match as one submission using non-identifying cues: hair color, length, texture, density, hairline/parting when visible, clothing/shoulder area when visible, and overall framing.',
  '6. Reject mixed submissions where one view shows short hair and another shows long hair, or where the ends close-up does not plausibly belong to the front/side hair.',
  '7. Reject if there is a visible watermark, stock-photo text, unrelated background model image, or obvious downloaded/reference image.',
  '',
  'If any rule fails, set is_acceptable=false, give one concise user-facing reason, and list failed view labels.',
].join('\n');

Deno.serve(async (request) => {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  try {
    const body = await request.json();
    const images = Array.isArray(body?.images) ? body.images.filter(Boolean) : [];
    const model = Deno.env.get('GOOGLE_AI_HAIR_VALIDATION_MODEL')
      || Deno.env.get('GOOGLE_AI_HAIR_ANALYSIS_MODEL')
      || Deno.env.get('GOOGLE_AI_MODEL')
      || 'gemini-2.5-flash';

    if (!Deno.env.get('GOOGLE_AI_API_KEY')) {
      return createJsonResponse({
        error: 'Photo validation is not configured on the server.',
        errorType: 'configuration_error',
      }, 500);
    }

    if (images.length < 3) {
      return createJsonResponse({
        validation: {
          is_acceptable: false,
          reason: 'Complete the front view, side profile, and hair ends close-up before analysis.',
          failed_views: ['Front View Photo', 'Side Profile Photo', 'Hair Ends Close-Up'],
        },
      }, 200);
    }

    const parts: Record<string, unknown>[] = [
      {
        text: [
          'Validate this exact photo set before hair analysis.',
          'Required views are provided in order and labels are included before each image.',
          'Return only the validation JSON.',
        ].join('\n'),
      },
    ];

    images.slice(0, 3).forEach((image, index) => {
      const label = normalizeString(image?.viewLabel || image?.viewKey) || `Photo ${index + 1}`;
      const dataUrl = normalizeString(image?.dataUrl);
      parts.push({ text: `Image ${index + 1}: ${label}` });
      parts.push({
        inlineData: {
          mimeType: extractMimeType(dataUrl),
          data: extractBase64Data(dataUrl),
        },
      });
    });

    const result = await createStructuredResponse({
      systemInstruction: instructions,
      responseJsonSchema: validationSchema,
      maxOutputTokens: 500,
      model,
      temperature: 0,
      includeDiagnostics: true,
      contents: [{ role: 'user', parts }],
    });

    const validation = result?.parsed?.validation || {};
    return createJsonResponse({
      validation: {
        is_acceptable: validation?.is_acceptable === true,
        reason: normalizeString(validation?.reason) || 'The photos could not be validated for analysis.',
        failed_views: Array.isArray(validation?.failed_views)
          ? validation.failed_views.map(normalizeString).filter(Boolean)
          : [],
      },
      diagnostics: result?.diagnostics || null,
    });
  } catch (error) {
    console.error('[validate-hair-photo-set]', error);
    const message = error instanceof Error ? error.message : String(error || '');
    return createJsonResponse({
      error: message || 'Photo validation could not be completed right now.',
      errorType: 'validation_failed',
    }, 500);
  }
});
