import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { createStructuredResponse } from '../_shared/openai.ts';

const analysisSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    analysis: {
      type: 'object',
      additionalProperties: false,
      properties: {
        is_hair_detected: {
          type: 'boolean',
        },
        invalid_image_reason: {
          type: 'string',
        },
        missing_views: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        per_view_notes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              view: {
                type: 'string',
              },
              clearly_visible: {
                type: 'boolean',
              },
              notes: {
                type: 'string',
              },
            },
            required: ['view', 'clearly_visible', 'notes'],
          },
        },
        estimated_length: {
          type: ['number', 'null'],
        },
        detected_texture: {
          type: 'string',
        },
        detected_density: {
          type: 'string',
        },
        detected_condition: {
          type: 'string',
        },
        visible_damage_notes: {
          type: 'string',
        },
        confidence_score: {
          type: ['number', 'null'],
        },
        decision: {
          type: 'string',
        },
        summary: {
          type: 'string',
        },
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: {
                type: 'string',
              },
              recommendation_text: {
                type: 'string',
              },
              priority_order: {
                type: 'integer',
              },
            },
            required: ['title', 'recommendation_text', 'priority_order'],
          },
        },
      },
      required: [
        'is_hair_detected',
        'invalid_image_reason',
        'missing_views',
        'per_view_notes',
        'estimated_length',
        'detected_texture',
        'detected_density',
        'detected_condition',
        'visible_damage_notes',
        'confidence_score',
        'decision',
        'summary',
        'recommendations',
      ],
    },
  },
  required: ['analysis'],
};

type HairImage = {
  mimeType?: string;
  dataUrl?: string;
  viewKey?: string;
  viewLabel?: string;
};

const instructions = [
  'You are analyzing donor hair photos for a hair donation mobile app.',
  'Return JSON only.',
  'First decide whether the uploaded images clearly show human hair intended for donation review.',
  'If the images do not clearly show hair, set is_hair_detected to false, explain the issue in invalid_image_reason, and set decision to "Retake Photos".',
  'Review each uploaded image using its provided view label and use per_view_notes to explain whether that view is clearly usable.',
  'Use missing_views to list any expected views that are absent or unclear: Top (Scalp), Front, Side, Back.',
  'Describe only visible hair characteristics from the provided images.',
  'Do not diagnose medical conditions and do not invent details that are not visible.',
  'If a field is uncertain, return an empty string or null instead of guessing.',
  'Set decision to one short donor-facing screening status such as Eligible, Needs Review, or Retake Photos.',
  'Keep summary concise and actionable so the mobile app can show it directly.',
  'Recommendations must be short, donor-facing, and ordered by priority.',
  'estimated_length must be a numeric centimeter estimate when visible.',
  'confidence_score must be a decimal between 0 and 1.',
  'detected_texture should use concise values like Straight, Wavy, Curly, Coily, or Mixed.',
  'detected_density should use concise values like Light, Medium, Thick, or Dense.',
  'detected_condition should use concise values like Healthy, Dry, Frizzy, Damaged, Chemically Treated, or Needs Better Photos.',
].join(' ');

const expectedViews = ['Top (Scalp)', 'Front', 'Side', 'Back'];

const normalizeString = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeConfidence = (value: unknown) => {
  const parsed = normalizeNumber(value);
  if (parsed === null) return null;
  if (parsed > 1 && parsed <= 100) return Math.max(0, Math.min(1, parsed / 100));
  return Math.max(0, Math.min(1, parsed));
};

const normalizeMissingViews = (source: unknown) => {
  const list = Array.isArray(source)
    ? source.map((item) => normalizeString(item)).filter(Boolean)
    : [];
  const seen = new Set<string>();

  return list.filter((item) => {
    const normalized = item.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

const normalizeRecommendations = (source: unknown, decision: string, summary: string) => {
  const rows = Array.isArray(source)
    ? source
      .map((item, index) => {
        const title = normalizeString(item?.title) || `Recommendation ${index + 1}`;
        const recommendationText = normalizeString(item?.recommendation_text);
        const priority = Number(item?.priority_order);

        return {
          title,
          recommendation_text: recommendationText,
          priority_order: Number.isFinite(priority) && priority > 0 ? priority : index + 1,
        };
      })
      .filter((item) => item.recommendation_text)
      .sort((left, right) => left.priority_order - right.priority_order)
    : [];

  if (rows.length) return rows.slice(0, 3);

  if (decision === 'Retake Photos') {
    return [{
      title: 'Retake Photo Set',
      recommendation_text: summary || 'Retake the required hair photos in brighter lighting and keep the tied hair centered.',
      priority_order: 1,
    }];
  }

  return [{
    title: 'Review Hair Result',
    recommendation_text: summary || 'Review the detected hair condition and confirm the result before continuing.',
    priority_order: 1,
  }];
};

const normalizeAnalysisPayload = (analysis: Record<string, unknown>, providedViews: string[]) => {
  const isHairDetected = analysis?.is_hair_detected !== false;
  const normalizedMissingViews = normalizeMissingViews(analysis?.missing_views);
  const normalizedViewNotes = Array.isArray(analysis?.per_view_notes)
    ? analysis.per_view_notes
      .map((item) => ({
        view: normalizeString(item?.view),
        clearly_visible: item?.clearly_visible !== false,
        notes: normalizeString(item?.notes),
      }))
      .filter((item) => item.view)
    : [];
  const estimatedLength = normalizeNumber(analysis?.estimated_length);
  const detectedTexture = normalizeString(analysis?.detected_texture);
  const detectedDensity = normalizeString(analysis?.detected_density);
  const detectedCondition = normalizeString(analysis?.detected_condition);
  const invalidImageReason = normalizeString(analysis?.invalid_image_reason);
  const visibleDamageNotes = normalizeString(analysis?.visible_damage_notes);
  const confidenceScore = normalizeConfidence(analysis?.confidence_score);
  const inferredMissingViews = expectedViews.filter((view) => !providedViews.includes(view));
  const missingViews = [...new Set([...inferredMissingViews, ...normalizedMissingViews])];

  let decision = normalizeString(analysis?.decision);
  if (!decision) {
    decision = !isHairDetected || missingViews.length
      ? 'Retake Photos'
      : detectedCondition.toLowerCase().includes('damage')
        || detectedCondition.toLowerCase().includes('treated')
        || detectedCondition.toLowerCase().includes('frizz')
        ? 'Needs Review'
        : 'Eligible';
  }

  let summary = normalizeString(analysis?.summary);
  if (!summary) {
    summary = !isHairDetected
      ? (invalidImageReason || 'The uploaded photos did not clearly show the donor hair for screening.')
      : missingViews.length
        ? `Please retake these required views clearly: ${missingViews.join(', ')}.`
        : `Detected ${detectedTexture || 'hair'} with ${detectedDensity || 'unspecified'} density and ${detectedCondition || 'an unspecified condition'}.`;
  }

  return {
    is_hair_detected: isHairDetected,
    invalid_image_reason: invalidImageReason,
    missing_views: missingViews,
    per_view_notes: normalizedViewNotes,
    estimated_length: estimatedLength,
    detected_texture: detectedTexture || (!isHairDetected ? '' : 'Unclear'),
    detected_density: detectedDensity || (!isHairDetected ? '' : 'Unclear'),
    detected_condition: detectedCondition || (!isHairDetected ? 'Needs Better Photos' : 'Needs Better Photos'),
    visible_damage_notes: visibleDamageNotes,
    confidence_score: confidenceScore,
    decision,
    summary,
    recommendations: normalizeRecommendations(analysis?.recommendations, decision, summary),
  };
};

Deno.serve(async (request) => {
  const preflightResponse = handleCorsPreflight(request);
  if (preflightResponse) return preflightResponse;

  try {
    const body = await request.json();
    const images = Array.isArray(body?.images) ? body.images.filter(Boolean) as HairImage[] : [];

    if (!images.length) {
      return createJsonResponse({ error: 'Please upload at least one clear hair photo before analysis.' }, 400);
    }

    const validImages = images.filter((image) => typeof image?.dataUrl === 'string' && image.dataUrl.startsWith('data:'));
    const providedViews = new Set(
      validImages
        .map((image) => image.viewLabel || image.viewKey)
        .filter(Boolean)
    );
    const missingProvidedViews = expectedViews.filter((view) => !providedViews.has(view));

    if (missingProvidedViews.length) {
      return createJsonResponse({
        error: `Please add these required hair views before analysis: ${missingProvidedViews.join(', ')}.`,
      }, 422);
    }

    console.info('[analyze-hair-submission] invoked', {
      imageCount: images.length,
      validImageCount: validImages.length,
      providedViews: Array.from(providedViews),
      missingProvidedViews,
    });

    const userContent = [
      {
        type: 'input_text',
        text: [
          'Analyze these donor hair photos and return the requested JSON structure.',
          'Expected views: Top (Scalp), Front, Side, Back.',
          'Only treat the upload as valid if the images clearly show human hair.',
          'Use the actual photo content as the source of truth and do not guess any value that is not visible.',
        ].join(' '),
      },
      ...validImages
        .flatMap((image, index) => ([
          {
            type: 'input_text',
            text: `Image ${index + 1} view: ${image.viewLabel || image.viewKey || `Photo ${index + 1}`}.`,
          },
          {
            type: 'input_image',
            image_url: image.dataUrl,
            detail: 'high',
          },
        ])),
    ];

    if (userContent.length === 1) {
      return createJsonResponse({ error: 'No valid image payload was provided.' }, 400);
    }

    const result = await createStructuredResponse({
      instructions,
      schemaName: 'hair_analysis',
      schema: analysisSchema,
      maxOutputTokens: 900,
      input: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    });

    const analysis = normalizeAnalysisPayload(result?.analysis || {}, Array.from(providedViews));

    console.info('[analyze-hair-submission] openai result ready', {
      hasAnalysis: Boolean(analysis),
      isHairDetected: analysis?.is_hair_detected ?? null,
      missingViews: Array.isArray(analysis?.missing_views) ? analysis.missing_views : [],
      decision: analysis?.decision || '',
      recommendationCount: Array.isArray(analysis?.recommendations) ? analysis.recommendations.length : 0,
      responseKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    });

    return createJsonResponse({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('[analyze-hair-submission]', error);

    return createJsonResponse({
      error: 'We could not analyze the hair photos right now. Please try again.',
    }, 500);
  }
});
