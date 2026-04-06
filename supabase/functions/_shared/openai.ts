const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

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
  const openAiKey = (
    Deno.env.get('OPEN_API_KEY')
    || Deno.env.get('OPENAI_API_KEY')
    || Deno.env.get('EXPO_PUBLIC_OPEN_API_KEY')
    || Deno.env.get('EXPO_PUBLIC_OPENAI_API_KEY')
    || ''
  ).trim();

  if (!openAiKey) {
    throw new Error('OpenAI API key is not configured. Add OPEN_API_KEY to your .env file.');
  }

  return openAiKey;
};

export const getDefaultOpenAiModel = () => (
  Deno.env.get('OPENAI_MODEL')
  || Deno.env.get('EXPO_PUBLIC_OPENAI_MODEL')
  || 'gpt-4o-mini'
);

export const createStructuredResponse = async ({
  input,
  schemaName,
  schema,
  instructions,
  maxOutputTokens = 1200,
  model = getDefaultOpenAiModel(),
}: StructuredResponseOptions) => {
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
