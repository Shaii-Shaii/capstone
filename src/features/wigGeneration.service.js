import { getErrorMessage, logAppError } from '../utils/appErrors';

const OPENAI_IMAGE_EDITS_URL = 'https://api.openai.com/v1/images/edits';

const getImageModel = () => (
  process.env.EXPO_PUBLIC_OPENAI_IMAGE_MODEL
  || 'gpt-image-1'
).trim();

const normalizePreview = (data) => ({
  summary: data?.summary || '',
  style_notes: data?.style_notes || '',
  recommended_style_name: data?.recommended_style_name || '',
  recommended_style_family: data?.recommended_style_family || '',
  generated_image_data_url: data?.generated_image_data_url || '',
  options: Array.isArray(data?.options)
    ? data.options
        .map((item, index) => ({
          id: item?.id || item?.name || `option-${index}`,
          name: item?.name || '',
          note: item?.note || '',
          family: item?.family || '',
          match_label: item?.match_label || item?.matchLabel || '',
          generated_image_data_url: item?.generated_image_data_url || item?.generatedImageDataUrl || '',
        }))
        .filter((item) => item.name || item.note || item.generated_image_data_url)
    : [],
});

const getResolvedApiKey = () => {
  const publicKey = (process.env.EXPO_PUBLIC_OPEN_API_KEY || '').trim();
  const privateKey = (process.env.OPEN_API_KEY || '').trim();
  const fallbackKey = (process.env.EXPO_PUBLIC_OPENAI_API_KEY || '').trim();

  if (publicKey && !publicKey.startsWith('${')) {
    return publicKey;
  }

  if (privateKey && !privateKey.startsWith('${')) {
    return privateKey;
  }

  if (fallbackKey && !fallbackKey.startsWith('${')) {
    return fallbackKey;
  }

  return '';
};

const getImageSource = (referenceImage = {}) => (
  referenceImage?.dataUrl
  || referenceImage?.uri
  || ''
);

const buildImagePrompt = (preferences = {}) => (
  [
    'Edit the uploaded front-facing patient photo and generate one realistic wig preview.',
    'Preserve the exact same person, identity, face structure, head shape, skin tone, eyes, nose, lips, expression, pose, and camera framing.',
    'Use the submitted face structure and head shape to choose a wig that fits the person naturally.',
    'Only change the visible hair into a realistic wig.',
    'Do not change the clothing, body, background, lighting direction, or camera angle.',
    preferences.preferredColor ? `Preferred wig color: ${preferences.preferredColor}.` : 'Use a natural flattering wig color.',
    preferences.preferredLength ? `Preferred wig length: ${preferences.preferredLength}.` : 'Use a balanced patient-friendly wig length.',
    preferences.notes ? `Additional notes: ${preferences.notes}.` : 'Keep the result clean and photorealistic.',
    'Return a realistic patient wig try-on result.',
  ].join(' ')
);

const getStyleCatalog = (preferences = {}) => {
  const preferredLength = preferences.preferredLength?.trim().toLowerCase() || '';
  const preferredColor = preferences.preferredColor?.trim() || 'Natural Brown';
  const styleSets = {
    short: [
      { id: 'bob', name: 'Bob', family: 'Structured short cut', note: 'Clean bob framing the jawline.', matchLabel: '95% Hair Match' },
      { id: 'pixie', name: 'Pixie', family: 'Soft pixie cut', note: 'Lightweight short wig with soft texture.', matchLabel: '82% Hair Match' },
      { id: 'crop', name: 'Layered Crop', family: 'Tapered crop', note: 'Modern short layers for a neat profile.', matchLabel: '74% Hair Match' },
    ],
    medium: [
      { id: 'lob', name: 'Lob', family: 'Shoulder-length lob', note: 'Balanced shoulder-length style with soft ends.', matchLabel: '94% Hair Match' },
      { id: 'waves', name: 'Soft Waves', family: 'Layered waves', note: 'Gentle waves that soften the face shape.', matchLabel: '88% Hair Match' },
      { id: 'straight', name: 'Straight Layers', family: 'Smooth layers', note: 'Straight silhouette with light layers.', matchLabel: '78% Hair Match' },
    ],
    long: [
      { id: 'long-waves', name: 'Long Waves', family: 'Long flowing waves', note: 'Face-framing waves with a natural fall.', matchLabel: '96% Hair Match' },
      { id: 'sleek-long', name: 'Sleek Long', family: 'Straight long style', note: 'Elegant long wig with a refined outline.', matchLabel: '87% Hair Match' },
      { id: 'curtain-layers', name: 'Curtain Layers', family: 'Layered long cut', note: 'Long layers designed around the cheek line.', matchLabel: '79% Hair Match' },
    ],
    default: [
      { id: 'bob', name: 'Bob', family: 'Structured short cut', note: 'Clean bob framing the jawline.', matchLabel: '95% Hair Match' },
      { id: 'long-waves', name: 'Long Waves', family: 'Long flowing waves', note: 'Face-framing waves with a natural fall.', matchLabel: '88% Hair Match' },
      { id: 'pixie', name: 'Pixie', family: 'Soft pixie cut', note: 'Lightweight short wig with soft texture.', matchLabel: '70% Hair Match' },
    ],
  };

  const styleSet = preferredLength.includes('short')
    ? styleSets.short
    : preferredLength.includes('medium') || preferredLength.includes('shoulder')
      ? styleSets.medium
      : preferredLength.includes('long')
        ? styleSets.long
        : styleSets.default;

  return styleSet.map((style) => ({
    ...style,
    color: preferredColor,
  }));
};

const buildVariantPrompt = ({ preferences = {}, style }) => (
  [
    buildImagePrompt(preferences),
    `Generate this exact wig style variation: ${style.name}.`,
    `Style family: ${style.family}.`,
    `Design note: ${style.note}.`,
    `Use wig color direction: ${style.color}.`,
  ].join(' ')
);

const buildFallbackPreview = (preferences = {}, generatedImageDataUrl) => {
  const preferredColor = preferences.preferredColor?.trim();
  const preferredLength = preferences.preferredLength?.trim();
  const styleName = [
    preferredLength || 'Natural',
    preferredColor || 'Custom',
    'Wig',
  ]
    .filter(Boolean)
    .join(' ');

  return normalizePreview({
    summary: preferences.notes?.trim()
      || 'This wig preview was generated from your submitted front photo to match your face structure.',
    style_notes: 'Generated directly from the submitted front photo.',
    recommended_style_name: styleName,
    recommended_style_family: preferredLength || 'Patient wig recommendation',
    generated_image_data_url: generatedImageDataUrl,
    options: [],
  });
};

const extractOpenAiErrorMessage = (payload = {}) => (
  payload?.error?.message
  || payload?.message
  || 'OpenAI request failed.'
);

const extractBase64Image = (payload = {}) => {
  if (!Array.isArray(payload?.data)) return '';
  return payload.data.find((item) => item?.b64_json)?.b64_json || '';
};

const requestGeneratedImage = async ({ prompt, referenceImage, apiKey }) => {
  const imageModel = getImageModel();
  const imageSource = getImageSource(referenceImage);
  if (!imageSource) {
    throw new Error('A front photo source is required for image generation.');
  }

  const requestBody = {
    model: imageModel,
    prompt,
    images: [
      {
        image_url: imageSource,
      },
    ],
    size: '1024x1024',
    quality: 'medium',
    output_format: 'png',
    background: 'opaque',
    n: 1,
  };

  if (imageModel === 'gpt-image-1') {
    requestBody.input_fidelity = 'high';
  }

  const response = await fetch(OPENAI_IMAGE_EDITS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractOpenAiErrorMessage(payload));
  }

  const base64Image = extractBase64Image(payload);
  if (!base64Image) {
    throw new Error('The wig image response was incomplete.');
  }

  return `data:image/png;base64,${base64Image}`;
};

export const generatePatientWigPreview = async ({ preferences, referenceImage }) => {
  try {
    const apiKey = getResolvedApiKey();
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured in EXPO_PUBLIC_OPEN_API_KEY.');
    }

    if (!referenceImage?.uri) {
      throw new Error('A front photo is required before generating a wig preview.');
    }

    const styleCatalog = getStyleCatalog(preferences);
    const successfulOptions = [];

    for (const style of styleCatalog) {
      try {
        const generatedImageDataUrl = await requestGeneratedImage({
          prompt: buildVariantPrompt({ preferences, style }),
          referenceImage,
          apiKey,
        });

        successfulOptions.push({
          id: style.id,
          name: style.name,
          note: style.note,
          match_label: style.matchLabel,
          family: style.family,
          generated_image_data_url: generatedImageDataUrl,
        });
      } catch (optionError) {
        logAppError('wigGeneration.generatePatientWigPreview.option', optionError, {
          styleId: style.id,
          styleName: style.name,
        });
      }
    }

    if (!successfulOptions.length) {
      throw new Error('The wig image response was incomplete.');
    }

    const primaryOption = successfulOptions[0];

    return {
      preview: normalizePreview({
        ...buildFallbackPreview(preferences, primaryOption.generated_image_data_url),
        summary: preferences.notes?.trim()
          || `Three wig recommendations were generated from your submitted front photo based on your face structure.`,
        style_notes: primaryOption.note,
        recommended_style_name: primaryOption.name,
        recommended_style_family: primaryOption.family,
        generated_image_data_url: primaryOption.generated_image_data_url,
        options: successfulOptions,
      }),
      error: null,
    };
  } catch (error) {
    logAppError('wigGeneration.generatePatientWigPreview', error, {
      hasReferenceImage: Boolean(referenceImage),
      imageModel: getImageModel(),
      openAiModel: process.env.EXPO_PUBLIC_OPENAI_MODEL || 'gpt-4o-mini',
    });

    const technicalMessage = getErrorMessage(error).toLowerCase();
    const userMessage = technicalMessage.includes('api key')
      ? 'The OpenAI API key is missing or invalid for wig generation.'
      : technicalMessage.includes('network request failed')
        ? 'The app could not reach OpenAI right now. Restart Expo after confirming the API key is loaded, then try again.'
      : technicalMessage.includes('image')
        ? 'We could not turn that front photo into a wig preview right now. Please try a clearer front image.'
        : 'We could not generate the wig preview right now. Please try again.';

    return {
      preview: null,
      error: userMessage,
    };
  }
};
