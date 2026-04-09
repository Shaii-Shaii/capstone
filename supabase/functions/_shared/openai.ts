const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_IMAGE_EDITS_URL = 'https://api.openai.com/v1/images/edits';

type OpenAiInputMessage = {
  role: 'system' | 'user' | 'assistant';
  content: Record<string, unknown>[];
};

type StructuredResponseOptions = {
  input: OpenAiInputMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  instructions?: string;
  maxOutputTokens?: number;
  model?: string;
};

type ImageEditReference = {
  image_url?: string;
  file_id?: string;
};

type ImageEditOptions = {
  prompt: string;
  images: ImageEditReference[];
  model?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  size?: '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
  outputFormat?: 'png' | 'jpeg' | 'webp';
  moderation?: 'auto' | 'low';
};

const extractErrorMessage = (payload: any) => (
  payload?.error?.message
  || payload?.message
  || 'OpenAI request failed.'
);

const extractOutputText = (payload: any) => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const contentItems = Array.isArray(payload?.output)
    ? payload.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    : [];

  const textItem = contentItems.find((item: any) => typeof item?.text === 'string' && item.text.trim());
  return textItem?.text?.trim() || '';
};

export const readOpenAiKey = () => {
  const openAiKey = (Deno.env.get('OPENAI_API_KEY') || '').trim();

  if (!openAiKey) {
    throw new Error('OpenAI API key is not configured in Edge Function Secrets.');
  }

  return openAiKey;
};

export const getDefaultOpenAiModel = () => (
  Deno.env.get('OPENAI_MODEL')
  || 'gpt-4o-mini'
);

export const getDefaultOpenAiImageModel = () => (
  Deno.env.get('OPENAI_IMAGE_MODEL')
  || 'gpt-image-1.5'
);

export const createStructuredResponse = async ({
  input,
  schemaName,
  schema,
  instructions,
  maxOutputTokens = 1200,
  model = getDefaultOpenAiModel(),
}: StructuredResponseOptions) => {
  console.info('[openai] preparing structured response request', {
    schemaName,
    model,
    hasInstructions: Boolean(instructions),
    inputMessageCount: Array.isArray(input) ? input.length : 0,
    hasOpenAiKey: Boolean(Deno.env.get('OPENAI_API_KEY')),
  });

  const openAiKey = readOpenAiKey();
  const requestBody = {
    model,
    input: instructions
      ? [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: instructions,
              },
            ],
          },
          ...input,
        ]
      : input,
    max_output_tokens: maxOutputTokens,
    text: {
      format: {
        type: 'json_schema',
        name: schemaName,
        strict: true,
        schema,
      },
    },
  };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const payload = await response.json().catch(() => ({}));

  console.info('[openai] response received', {
    schemaName,
    ok: response.ok,
    status: response.status,
    payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
  });

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload));
  }

  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new Error('OpenAI returned an empty response.');
  }

  try {
    return JSON.parse(outputText);
  } catch {
    throw new Error('OpenAI returned invalid JSON.');
  }
};

export const createImageEdit = async ({
  prompt,
  images,
  model = getDefaultOpenAiImageModel(),
  quality = 'medium',
  size = '1024x1024',
  outputFormat = 'png',
  moderation = 'auto',
}: ImageEditOptions) => {
  if (!prompt?.trim()) {
    throw new Error('OpenAI image prompt is required.');
  }

  const validImages = Array.isArray(images)
    ? images.filter((image) => image?.image_url || image?.file_id)
    : [];

  if (!validImages.length) {
    throw new Error('At least one source image is required for image editing.');
  }

  console.info('[openai] preparing image edit request', {
    model,
    imageCount: validImages.length,
    hasPrompt: Boolean(prompt.trim()),
    quality,
    size,
    outputFormat,
    moderation,
    hasOpenAiKey: Boolean(Deno.env.get('OPENAI_API_KEY')),
  });

  const openAiKey = readOpenAiKey();
  const response = await fetch(OPENAI_IMAGE_EDITS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      images: validImages,
      quality,
      size,
      moderation,
      output_format: outputFormat,
      n: 1,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  console.info('[openai] image edit response received', {
    ok: response.ok,
    status: response.status,
    payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
    dataLength: Array.isArray(payload?.data) ? payload.data.length : 0,
  });

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload));
  }

  const firstImage = Array.isArray(payload?.data) ? payload.data[0] : null;
  const b64Json = typeof firstImage?.b64_json === 'string' ? firstImage.b64_json.trim() : '';
  const imageUrl = typeof firstImage?.url === 'string' ? firstImage.url.trim() : '';

  if (b64Json) {
    return {
      imageDataUrl: `data:image/${outputFormat};base64,${b64Json}`,
      outputFormat,
      raw: payload,
    };
  }

  if (imageUrl) {
    return {
      imageUrl,
      outputFormat,
      raw: payload,
    };
  }

  throw new Error('OpenAI image edit returned no usable image output.');
};
