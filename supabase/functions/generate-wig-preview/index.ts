import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { createImageEdit, createStructuredResponse } from '../_shared/openai.ts';

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
  'You are generating a realistic wig preview plan for a patient support mobile app.',
  'Return JSON only.',
  'Use the provided preference data and optional front reference image.',
  'Prepare the structured wig recommendation that will drive an actual image-generation step.',
  'Keep the response donor-safe, patient-safe, and concise.',
  'Summary should explain the suggested wig direction.',
  'Style notes should mention color, length, silhouette, and fit considerations only when supported by the input.',
  'recommended_style_name should be a short patient-facing wig style label.',
  'recommended_style_family should be a short category such as soft bob, layered waves, or natural pixie.',
  'options should contain 2 or 3 concise wig options, each with a name and a short note.',
  'Do not invent percentages, stock counts, or medical claims.',
].join(' ');

const normalizePreview = (preview: Record<string, unknown>, generatedImageDataUrl: string) => ({
  generated_image_data_url: generatedImageDataUrl,
  preview_url: generatedImageDataUrl,
  summary: typeof preview?.summary === 'string' ? preview.summary.trim() : '',
  style_notes: typeof preview?.style_notes === 'string' ? preview.style_notes.trim() : '',
  recommended_style_name: typeof preview?.recommended_style_name === 'string'
    ? preview.recommended_style_name.trim()
    : '',
  recommended_style_family: typeof preview?.recommended_style_family === 'string'
    ? preview.recommended_style_family.trim()
    : '',
  options: Array.isArray(preview?.options)
    ? preview.options
      .map((item) => ({
        name: typeof item?.name === 'string' ? item.name.trim() : '',
        note: typeof item?.note === 'string' ? item.note.trim() : '',
      }))
      .filter((item) => item.name || item.note)
      .slice(0, 3)
    : [],
});

const buildImagePrompt = ({
  preferredColor,
  preferredLength,
  notes,
  preview,
}: {
  preferredColor: string;
  preferredLength: string;
  notes: string;
  preview: Record<string, unknown>;
}) => [
  'Create one photorealistic wig try-on preview by editing the provided front-facing patient photo.',
  'Keep the same person, face identity, pose, camera angle, lighting direction, clothing, and background.',
  'Only replace or restyle the visible hair with a realistic wig.',
  'The final image must look like a believable patient-facing wig preview, not an illustration or collage.',
  'Do not add extra people, accessories, hats, text overlays, split screens, or watermarks.',
  'Keep the face unobstructed and preserve natural proportions.',
  `Suggested wig style name: ${typeof preview?.recommended_style_name === 'string' ? preview.recommended_style_name : 'Natural patient wig'}.`,
  `Suggested wig family: ${typeof preview?.recommended_style_family === 'string' ? preview.recommended_style_family : 'Natural wearable style'}.`,
  `Suggested style notes: ${typeof preview?.style_notes === 'string' ? preview.style_notes : 'Natural patient-safe styling.'}.`,
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

    console.info('[generate-wig-preview] structured wig guidance ready', {
      hasPreview: Boolean(result?.preview),
      styleName: result?.preview?.recommended_style_name || '',
      responseKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    });

    const generatedImage = await createImageEdit({
      prompt: buildImagePrompt({
        preferredColor,
        preferredLength,
        notes,
        preview: result?.preview || {},
      }),
      images: [{ image_url: referenceImage }],
      quality: 'medium',
      size: '1024x1024',
      outputFormat: 'png',
      moderation: 'low',
    });

    const generatedImageDataUrl = generatedImage?.imageDataUrl || generatedImage?.imageUrl || '';
    if (!generatedImageDataUrl) {
      throw new Error('OpenAI did not return a usable wig preview image.');
    }

    const normalizedPreview = normalizePreview(result?.preview || {}, generatedImageDataUrl);

    console.info('[generate-wig-preview] openai result ready', {
      hasPreview: Boolean(normalizedPreview),
      hasGeneratedImage: Boolean(normalizedPreview.generated_image_data_url),
      optionCount: normalizedPreview.options.length,
      responseKeys: normalizedPreview ? Object.keys(normalizedPreview) : [],
    });

    return createJsonResponse({
      success: true,
      preview_url: normalizedPreview.preview_url,
      generated_image_data_url: normalizedPreview.generated_image_data_url,
      preview: normalizedPreview,
    });
  } catch (error) {
    console.error('[generate-wig-preview]', error);

    return createJsonResponse({
      error: 'We could not generate the wig preview right now. Please try again.',
    }, 500);
  }
});
