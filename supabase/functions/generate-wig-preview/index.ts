import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { createStructuredResponse } from '../_shared/openai.ts';

const previewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    preview: {
      type: 'object',
      additionalProperties: false,
      properties: {
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
        options: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: {
                type: 'string',
              },
              note: {
                type: 'string',
              },
            },
            required: ['name', 'note'],
          },
        },
      },
      required: [
        'summary',
        'style_notes',
        'recommended_style_name',
        'recommended_style_family',
        'options',
      ],
    },
  },
  required: ['preview'],
};

const instructions = [
  'You are generating textual wig guidance for a patient support mobile app.',
  'Return JSON only.',
  'Use the provided preference data and optional front reference image.',
  'Do not generate images, image URLs, file IDs, or visual assets.',
  'Keep the response donor-safe, patient-safe, and concise.',
  'Summary should explain the suggested wig direction.',
  'Style notes should mention color, length, and fit considerations only when supported by the input.',
  'recommended_style_name should be a short patient-facing wig style label.',
  'recommended_style_family should be a short category such as soft bob, layered waves, or natural pixie.',
  'options should contain 2 or 3 concise wig options, each with a name and a short note.',
  'Do not invent percentages, stock counts, or medical claims.',
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
      schemaName: 'wig_guidance',
      schema: previewSchema,
      maxOutputTokens: 700,
      input: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    });

    console.info('[generate-wig-preview] openai result ready', {
      hasPreview: Boolean(result?.preview),
      optionCount: Array.isArray(result?.preview?.options) ? result.preview.options.length : 0,
      responseKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    });

    return createJsonResponse(result);
  } catch (error) {
    console.error('[generate-wig-preview]', error);

    return createJsonResponse({
      error: 'We could not generate wig guidance right now. Please try again.',
    }, 500);
  }
});
