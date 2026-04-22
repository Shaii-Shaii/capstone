import { createJsonResponse, handleCorsPreflight } from '../_shared/cors';
import { createImageEdit, createStructuredResponse } from '../_shared/openai';

const MAX_PREVIEW_VARIANTS = 3;

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
          option_index: {
            type: 'integer',
            minimum: 1,
            maximum: MAX_PREVIEW_VARIANTS,
          },
          summary: {
            type: 'string',
          },
          style_notes: {
            type: 'string',
          },
          recommended_style_name: {
            type: 'string',
          },
          recommended_style_family: {
            type: 'string',
          },
          match_label: {
            type: 'string',
          },
          image_prompt_hint: {
            type: 'string',
          },
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
  'You are generating realistic wig try-on variants for a patient support mobile app.',
  'Return JSON only.',
  'Use the provided preference data and optional front reference image.',
  'Create exactly 3 distinct wig preview variants for the same person and same request.',
  'All 3 variants must remain appropriate for the same patient request and must stay wearable, natural, and patient-safe.',
  'The variants must differ meaningfully in style, silhouette, texture treatment, or volume.',
  'Do not make the 3 variants identical, and do not suggest unrelated or costume styles.',
  'summary should briefly explain why the variant fits the request.',
  'style_notes should mention color, length, silhouette, texture, and fit considerations for that specific variant.',
  'recommended_style_name should be a short patient-facing wig style label for that specific variant.',
  'recommended_style_family should be a short category such as soft bob, layered waves, or natural pixie.',
  'match_label should be a short UI label such as Closest Match, Soft Volume, or Sleek Option.',
  'image_prompt_hint should be a concise image-generation hint describing what makes the specific variant visually distinct.',
  'Do not invent medical claims, percentages, stock counts, or product availability.',
].join(' ');

const normalizeVariant = (variant: Record<string, unknown>, generatedImageDataUrl: string, fallbackIndex: number) => {
  const optionIndex = Number.isFinite(Number(variant?.option_index))
    ? Math.min(Math.max(Number(variant.option_index), 1), MAX_PREVIEW_VARIANTS)
    : fallbackIndex + 1;

  return {
    id: `variant-${optionIndex}`,
    option_index: optionIndex,
    generated_image_data_url: generatedImageDataUrl,
    preview_url: generatedImageDataUrl,
    summary: typeof variant?.summary === 'string' ? variant.summary.trim() : '',
    style_notes: typeof variant?.style_notes === 'string' ? variant.style_notes.trim() : '',
    recommended_style_name: typeof variant?.recommended_style_name === 'string'
      ? variant.recommended_style_name.trim()
      : '',
    recommended_style_family: typeof variant?.recommended_style_family === 'string'
      ? variant.recommended_style_family.trim()
      : '',
    match_label: typeof variant?.match_label === 'string' ? variant.match_label.trim() : `Option ${optionIndex}`,
    image_prompt_hint: typeof variant?.image_prompt_hint === 'string' ? variant.image_prompt_hint.trim() : '',
  };
};

const buildPreviewPayload = (normalizedPreviews: Array<Record<string, unknown>>) => {
  const previews = normalizedPreviews.slice(0, MAX_PREVIEW_VARIANTS);
  const primaryPreview = previews[0] || null;

  const optionPayload = previews.map((preview) => ({
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
          options: optionPayload,
        }
      : null,
    previews,
    selected_preview_url: null,
  };
};

const buildImagePrompt = ({
  preferredColor,
  preferredLength,
  notes,
  variant,
}: {
  preferredColor: string;
  preferredLength: string;
  notes: string;
  variant: Record<string, unknown>;
}) => [
  'Create one photorealistic wig try-on preview by editing the provided front-facing patient photo.',
  'Keep the same person, face identity, pose, camera angle, lighting direction, clothing, and background.',
  'Only replace or restyle the visible hair with a realistic wig.',
  'The final image must look like a believable patient-facing wig preview, not an illustration or collage.',
  'Do not add extra people, accessories, hats, text overlays, split screens, or watermarks.',
  'Keep the face unobstructed and preserve natural proportions.',
  `This is wig preview option ${typeof variant?.option_index === 'number' ? variant.option_index : '1'} of ${MAX_PREVIEW_VARIANTS}.`,
  `Suggested wig style name: ${typeof variant?.recommended_style_name === 'string' ? variant.recommended_style_name : 'Natural patient wig'}.`,
  `Suggested wig family: ${typeof variant?.recommended_style_family === 'string' ? variant.recommended_style_family : 'Natural wearable style'}.`,
  `Variant summary: ${typeof variant?.summary === 'string' ? variant.summary : 'Create a wearable patient-safe wig variant.'}.`,
  `Variant style notes: ${typeof variant?.style_notes === 'string' ? variant.style_notes : 'Natural patient-safe styling.'}.`,
  `Variant distinction hint: ${typeof variant?.image_prompt_hint === 'string' ? variant.image_prompt_hint : 'Make this version visually distinct from the other options while staying appropriate for the same request.'}.`,
  `Preferred color: ${preferredColor || 'keep the most natural color based on the source photo'}.`,
  `Preferred length: ${preferredLength || 'keep a wearable medical wig length based on the style recommendation'}.`,
  `Additional patient notes: ${notes || 'none provided'}.`,
  'Return a single clean final preview image.',
].join(' ');

Deno.serve(async (request) => {
  const preflightResponse = handleCorsPreflight(request);
  if (preflightResponse) return preflightResponse;

  try {
    const body = await request.json();
    const preferredColor = typeof body?.preferred_color === 'string' ? body.preferred_color : '';
    const preferredLength = typeof body?.preferred_length === 'string' ? body.preferred_length : '';
    const notes = typeof body?.notes === 'string' ? body.notes : '';
    const referenceImageDataUrl = typeof body?.reference_image?.dataUrl === 'string'
      ? body.reference_image.dataUrl
      : '';
    const referenceImageUrl = typeof body?.reference_image?.imageUrl === 'string'
      ? body.reference_image.imageUrl
      : '';
    const referenceImage = referenceImageDataUrl || referenceImageUrl;

    console.info('[generate-wig-preview] invoked', {
      hasPreferredColor: Boolean(preferredColor),
      hasPreferredLength: Boolean(preferredLength),
      hasNotes: Boolean(notes),
      hasReferenceImageDataUrl: Boolean(referenceImageDataUrl),
      hasReferenceImageUrl: Boolean(referenceImageUrl),
    });

    const userContent: Record<string, unknown>[] = [
      {
        type: 'input_text',
        text: [
          'Create wig guidance with this request data:',
          `preferred_color: ${preferredColor || 'not provided'}`,
          `preferred_length: ${preferredLength || 'not provided'}`,
          `notes: ${notes || 'not provided'}`,
        ].join('\n'),
      },
    ];

    if (
      typeof referenceImage === 'string'
      && (
        referenceImage.startsWith('data:')
        || referenceImage.startsWith('http://')
        || referenceImage.startsWith('https://')
      )
    ) {
      userContent.push({
        type: 'input_image',
        image_url: referenceImage,
        detail: 'low',
      });
    }

    const result = await createStructuredResponse({
      instructions,
      schemaName: 'wig_preview_variants',
      schema: previewSchema,
      maxOutputTokens: 1200,
      input: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    });

    const rawVariants = Array.isArray(result?.previews) ? result.previews.slice(0, MAX_PREVIEW_VARIANTS) : [];
    if (rawVariants.length !== MAX_PREVIEW_VARIANTS) {
      throw new Error('OpenAI did not return the required wig preview variants.');
    }

    console.info('[generate-wig-preview] variant plan ready', {
      variantCount: rawVariants.length,
      responseKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    });

    const normalizedPreviews: Array<Record<string, unknown>> = [];
    for (const [index, variant] of rawVariants.entries()) {
      console.info('[generate-wig-preview] generating wig preview variant', {
        optionIndex: index + 1,
        styleName: typeof variant?.recommended_style_name === 'string' ? variant.recommended_style_name : '',
      });

      const generatedImage = await createImageEdit({
        prompt: buildImagePrompt({
          preferredColor,
          preferredLength,
          notes,
          variant: variant || {},
        }),
        images: [{ image_url: referenceImage }],
        quality: 'medium',
        size: '1024x1024',
        outputFormat: 'png',
        moderation: 'low',
      });

      const generatedImageDataUrl = generatedImage?.imageDataUrl || generatedImage?.imageUrl || '';
      if (!generatedImageDataUrl) {
        throw new Error(`OpenAI did not return a usable wig preview image for option ${index + 1}.`);
      }

      normalizedPreviews.push(normalizeVariant(variant || {}, generatedImageDataUrl, index));

      console.info('[generate-wig-preview] wig preview variant completed', {
        optionIndex: index + 1,
        hasGeneratedImage: Boolean(generatedImageDataUrl),
      });
    }

    if (normalizedPreviews.length !== MAX_PREVIEW_VARIANTS) {
      throw new Error('We could not finish generating all wig preview variants.');
    }

    const payload = buildPreviewPayload(normalizedPreviews);

    console.info('[generate-wig-preview] final wig preview payload ready', {
      previewCount: payload.previews.length,
      hasPrimaryPreview: Boolean(payload.preview?.generated_image_data_url),
      responseKeys: Object.keys(payload),
    });

    return createJsonResponse({
      success: true,
      ...payload,
    });
  } catch (error) {
    console.error('[generate-wig-preview]', error);

    return createJsonResponse({
      error: 'We could not generate the wig preview right now. Please try again.',
    }, 500);
  }
});
