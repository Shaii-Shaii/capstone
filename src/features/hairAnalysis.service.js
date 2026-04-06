import { invokeEdgeFunction } from '../api/supabase/client';
import { hairAnalysisFunctionName } from './hairSubmission.constants';
import { getErrorMessage, logAppError } from '../utils/appErrors';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const openAiClientKey = (
  process.env.EXPO_PUBLIC_OPEN_API_KEY
  || process.env.EXPO_PUBLIC_OPENAI_API_KEY
  || process.env.OPEN_API_KEY
  || ''
).trim();
const openAiModel = process.env.EXPO_PUBLIC_OPENAI_MODEL || 'gpt-4o-mini';

const analysisSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    analysis: {
      type: 'object',
      additionalProperties: false,
      properties: {
        is_hair_detected: { type: 'boolean' },
        invalid_image_reason: { type: 'string' },
        missing_views: {
          type: 'array',
          items: { type: 'string' },
        },
        per_view_notes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              view: { type: 'string' },
              clearly_visible: { type: 'boolean' },
              notes: { type: 'string' },
            },
            required: ['view', 'clearly_visible', 'notes'],
          },
        },
        estimated_length: { type: ['number', 'null'] },
        detected_texture: { type: 'string' },
        detected_density: { type: 'string' },
        detected_condition: { type: 'string' },
        visible_damage_notes: { type: 'string' },
        confidence_score: { type: ['number', 'null'] },
        decision: { type: 'string' },
        summary: { type: 'string' },
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              recommendation_text: { type: 'string' },
              priority_order: { type: 'integer' },
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

const analysisInstructions = [
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

const extractOpenAiErrorMessage = (payload = {}) => (
  payload?.error?.message
  || payload?.message
  || 'OpenAI request failed.'
);

const extractOpenAiOutputText = (payload = {}) => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const contentItems = Array.isArray(payload?.output)
    ? payload.output.flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    : [];

  const textItem = contentItems.find((item) => typeof item?.text === 'string' && item.text.trim());
  return textItem?.text?.trim() || '';
};

const runDirectOpenAiHairAnalysis = async ({ images }) => {
  if (!openAiClientKey) {
    throw new Error('OpenAI key is not available in the app environment.');
  }

  const input = [
    {
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: analysisInstructions,
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: [
            'Analyze these donor hair photos and return the requested JSON structure.',
            'Expected views: Top (Scalp), Front, Side, Back.',
            'Only treat the upload as valid if the images clearly show human hair.',
            'Use the actual photo content as the source of truth and do not guess any value that is not visible.',
          ].join(' '),
        },
        ...images.flatMap((image, index) => ([
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
      ],
    },
  ];

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiClientKey}`,
    },
    body: JSON.stringify({
      model: openAiModel,
      input,
      max_output_tokens: 900,
      text: {
        format: {
          type: 'json_schema',
          name: 'hair_analysis',
          strict: true,
          schema: analysisSchema,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(extractOpenAiErrorMessage(payload));
  }

  const outputText = extractOpenAiOutputText(payload);
  if (!outputText) {
    throw new Error('OpenAI returned an empty response.');
  }

  const parsedPayload = JSON.parse(outputText);
  return parsedPayload?.analysis ? parsedPayload : { analysis: parsedPayload };
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

    let data = null;
    if (openAiClientKey) {
      data = await runDirectOpenAiHairAnalysis({ images: payload.images });
    } else {
      const functionResult = await invokeEdgeFunction(hairAnalysisFunctionName, {
        body: payload,
      });

      if (functionResult.error) {
        throw new Error(await resolveFunctionErrorMessage(functionResult.error));
      }

      data = functionResult.data;
    }

    if (!data?.analysis) {
      throw new Error('The AI analysis response was incomplete.');
    }

    if (
      data.analysis?.is_hair_detected !== false
      && !data.analysis?.summary
      && !data.analysis?.detected_texture
      && !data.analysis?.detected_condition
      && !data.analysis?.detected_density
    ) {
      throw new Error('The uploaded photos were not clear enough for a reliable hair analysis. Please retake the photos in better lighting and try again.');
    }

    return {
      analysis: normalizeAnalysis({
        ...data.analysis,
        recommendations: data.analysis?.recommendations || data.recommendations || [],
      }),
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
      : 'We could not analyze your hair photos right now. Please try again.';

    return {
      analysis: null,
      error: userMessage,
    };
  }
};
