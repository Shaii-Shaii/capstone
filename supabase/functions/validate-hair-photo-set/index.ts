import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { createStructuredResponse } from '../_shared/ai-vision.ts';

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

const isInternalValidationReason = (value: unknown) => {
  const normalized = normalizeString(value).toLowerCase();
  return (
    normalized.includes('incomplete json')
    || normalized.includes('invalid json')
    || normalized.includes('json input')
    || normalized.includes('json schema')
    || normalized.includes('schema')
    || normalized.includes('provider')
    || normalized.includes('api')
  );
};

const extractBase64Data = (dataUrl: string) => {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
};

const extractMimeType = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] || 'image/jpeg';
};

const resolveSafeValidationError = (error: unknown) => {
  const message = normalizeString(error instanceof Error ? error.message : String(error || ''));
  const normalized = message.toLowerCase();

  if (
    normalized.includes('quota exceeded')
    || normalized.includes('rate limit')
    || normalized.includes('resource exhausted')
    || normalized.includes('free tier')
    || normalized.includes('retry in')
  ) {
    return {
      status: 429,
      message: 'Photo validation is busy right now. Please wait a moment, then try again.',
      errorType: 'quota_exceeded',
    };
  }

  if (
    normalized.includes('api key is not configured')
    || normalized.includes('not configured in edge function secrets')
  ) {
    return {
      status: 500,
      message: 'Photo validation is not configured on the server.',
      errorType: 'configuration_error',
    };
  }

  return {
    status: 500,
    message: message || 'Photo validation could not be completed right now.',
    errorType: 'validation_failed',
  };
};

const shouldSoftPassValidationError = (safeError: { errorType?: string }) => (
  [
    'quota_exceeded',
    'validation_failed',
    'provider_error',
    'temporary_unavailable',
    'model_unavailable',
    'provider_access_denied',
  ].includes(String(safeError?.errorType || ''))
);

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
  '4. Hair Scalp must show the scalp/crown/top part clearly with the hair parted enough to assess visible scalp coverage, density, flakes, oiliness, or buildup. It must not be a random hair photo or a watermarked stock-like image.',
  '5. All required views must visually match as one submission using non-identifying cues: hair color, texture, density, hairline/parting when visible, clothing/shoulder area when visible, and overall framing. Do not require the face to be visible in the Hair Scalp photo.',
  '6. For Hair Scalp, accept a top/crown/part-line image even when the face is cropped or the subject is looking down. Compare it to front/side only by current hair cues, not facial identity.',
  '7. Accept normal pose changes between front and side views. Do not reject only because the face angle, cheek shape, lighting, or framing changes between required views.',
  '8. Reject mixed submissions only when the hair clearly belongs to a different person or different current hair, such as obviously different color/texture/density or an unrelated stock/model image.',
  '9. Reject if there is a visible watermark, stock-photo text, unrelated background model image, or obvious downloaded/reference image.',
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
      || Deno.env.get('GOOGLE_AI_VISION_MODEL')
      || Deno.env.get('GOOGLE_AI_MODEL')
      || Deno.env.get('GEMINI_MODEL')
      || 'gemini-2.5-flash';
    const hasGoogleAiKey = Boolean(
      Deno.env.get('GOOGLE_AI_API_KEY')
    );
    const hasOpenAiKey = Boolean(Deno.env.get('OPENAI_API_KEY'));

    if (!hasGoogleAiKey && !hasOpenAiKey) {
      return createJsonResponse({
        error: 'Photo validation is not configured on the server.',
        errorType: 'configuration_error',
      }, 500);
    }

    if (images.length < 3) {
      return createJsonResponse({
        validation: {
          is_acceptable: false,
          reason: 'Complete the front view, side profile, and hair scalp photo before analysis.',
          failed_views: ['Front View Photo', 'Side Profile Photo', 'Hair Scalp'],
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

    const parsed = result?.parsed && typeof result.parsed === 'object'
      ? result.parsed as Record<string, unknown>
      : {};
    const validationSource = parsed.validation && typeof parsed.validation === 'object'
      ? parsed.validation as Record<string, unknown>
      : parsed;
    const hasExplicitDecision = typeof validationSource?.is_acceptable === 'boolean';
    const reason = normalizeString(validationSource.reason);

    if (!hasExplicitDecision) {
      console.warn('[validate-hair-photo-set] Google AI response did not include validation envelope; allowing analysis to continue', {
        model,
        parsedKeys: Object.keys(parsed),
        providerResponseStatus: result?.diagnostics?.provider_response_status ?? null,
        providerParseSuccess: result?.diagnostics?.provider_parse_success ?? null,
      });

      return createJsonResponse({
        validation: {
          is_acceptable: true,
          reason: 'Photo validation could not return a strict decision, so the photos will be checked by the full hair analysis.',
          failed_views: [],
        },
        diagnostics: result?.diagnostics || null,
        validation_warning: 'missing_validation_decision',
      });
    }

    if (validationSource.is_acceptable === false && isInternalValidationReason(reason)) {
      console.warn('[validate-hair-photo-set] Provider returned internal validation reason; allowing analysis to continue', {
        model,
        reason,
        failedViews: Array.isArray(validationSource.failed_views) ? validationSource.failed_views : [],
        provider: result?.diagnostics?.provider || null,
        providerResponseStatus: result?.diagnostics?.provider_response_status ?? null,
        providerParseSuccess: result?.diagnostics?.provider_parse_success ?? null,
      });

      return createJsonResponse({
        validation: {
          is_acceptable: true,
          reason: 'Photo validation could not make a clean decision, so the full hair analysis will check these photos.',
          failed_views: [],
        },
        diagnostics: result?.diagnostics || null,
        validation_warning: 'internal_validation_reason',
      });
    }

    return createJsonResponse({
      validation: {
        is_acceptable: validationSource.is_acceptable === true,
        reason: reason || (
          validationSource.is_acceptable === true
            ? 'Photo validation passed. The images are ready for AI hair analysis.'
            : 'The photos do not look ready for analysis. Please retake unclear views.'
        ),
        failed_views: Array.isArray(validationSource.failed_views)
          ? validationSource.failed_views.map(normalizeString).filter(Boolean)
          : [],
      },
      diagnostics: result?.diagnostics || null,
    });
  } catch (error) {
    console.error('[validate-hair-photo-set]', error);
    const safeError = resolveSafeValidationError(error);
    const diagnostics = (error as { diagnostics?: {
      provider?: string;
      provider_request_attempted?: boolean;
      provider_response_status?: number | null;
      provider_parse_success?: boolean;
      provider_error_type?: string;
      retry_after_seconds?: number | null;
    } })?.diagnostics;

    const effectiveErrorType = diagnostics?.provider_error_type || safeError.errorType;
    if (shouldSoftPassValidationError({ errorType: effectiveErrorType })) {
      return createJsonResponse({
        validation: {
          is_acceptable: true,
          reason: 'Photo match check could not finish, so the full hair analysis will verify these photos.',
          failed_views: [],
        },
        diagnostics: diagnostics || null,
        validation_warning: effectiveErrorType || 'validation_failed',
        provider: diagnostics?.provider || null,
        provider_response_status: diagnostics?.provider_response_status ?? null,
      }, 200);
    }

    return createJsonResponse({
      error: safeError.message,
      errorType: effectiveErrorType,
      provider: diagnostics?.provider || 'gemini',
      provider_request_attempted: diagnostics?.provider_request_attempted ?? false,
      provider_response_status: diagnostics?.provider_response_status ?? null,
      provider_parse_success: diagnostics?.provider_parse_success ?? false,
      retry_after_seconds: diagnostics?.retry_after_seconds ?? null,
    }, safeError.status);
  }
});
