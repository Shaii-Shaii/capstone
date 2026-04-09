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
  'If the images do not clearly show hair, set is_hair_detected to false, explain the issue in invalid_image_reason, and leave the other fields empty or null.',
  'Review each uploaded image using its provided view label and use per_view_notes to explain whether that view is clearly usable.',
  'Use missing_views to list any expected views that are absent or unclear: Top (Scalp), Front, Side, Back.',
  'Describe only visible hair characteristics from the provided images.',
  'Do not diagnose medical conditions and do not invent details that are not visible.',
  'If a field is uncertain, return an empty string or null instead of guessing.',
  'Set decision to one short donor-facing screening status.',
  'Keep summary concise and actionable.',
  'Recommendations must be short, donor-facing, and ordered by priority.',
].join(' ');

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
    const expectedViews = ['Top (Scalp)', 'Front', 'Side', 'Back'];
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

    const analysis = result?.analysis;

    console.info('[analyze-hair-submission] openai result ready', {
      hasAnalysis: Boolean(analysis),
      isHairDetected: analysis?.is_hair_detected ?? null,
      missingViews: Array.isArray(analysis?.missing_views) ? analysis.missing_views : [],
      responseKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    });

    if (!analysis?.is_hair_detected) {
      return createJsonResponse({
        error: analysis?.invalid_image_reason || 'The uploaded photos do not clearly show hair. Please upload clear hair photos only.',
      }, 422);
    }

    if (Array.isArray(analysis?.missing_views) && analysis.missing_views.length) {
      return createJsonResponse({
        error: `Please upload clear photos for these hair views: ${analysis.missing_views.join(', ')}.`,
      }, 422);
    }

    return createJsonResponse(result);
  } catch (error) {
    console.error('[analyze-hair-submission]', error);

    return createJsonResponse({
      error: 'We could not analyze the hair photos right now. Please try again.',
    }, 500);
  }
});
