const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MAX_ATTEMPTS = 2;
const OPENAI_RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const OPENAI_DEFAULT_VISION_MODEL = 'gpt-4o-mini';

type GenerateStructuredContentParams = {
  model?: string;
  systemInstruction?: string;
  contents: Array<Record<string, unknown>>;
  responseJsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
  includeDiagnostics?: boolean;
};

type OpenAiDiagnostics = {
  provider: 'openai';
  provider_request_attempted: boolean;
  provider_response_status: number | null;
  provider_parse_success: boolean;
  provider_endpoint: string;
  provider_model: string;
  provider_error_type?: string;
  retry_after_seconds?: number | null;
};

const readOpenAiKey = () => {
  const openAiKey = (Deno.env.get('OPENAI_API_KEY') || '').trim();
  if (!openAiKey) {
    throw new Error('OpenAI API key is not configured in Edge Function Secrets.');
  }
  return openAiKey;
};

const parseRetryAfterHeaderValue = (value: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const numericValue = Number(normalized);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return Math.max(1, Math.ceil(numericValue));
  }

  const parsedDateMs = Date.parse(normalized);
  if (!Number.isFinite(parsedDateMs)) return null;

  const diffSeconds = Math.ceil((parsedDateMs - Date.now()) / 1000);
  return diffSeconds > 0 ? diffSeconds : null;
};

const classifyProviderErrorType = ({ status, message }: { status: number | null; message: string }) => {
  const normalized = String(message || '').toLowerCase();

  if (
    Number(status) === 429
    || normalized.includes('quota')
    || normalized.includes('rate limit')
    || normalized.includes('too many requests')
  ) {
    return 'quota_exceeded';
  }

  if (
    Number(status) === 503
    || normalized.includes('temporarily unavailable')
    || normalized.includes('overloaded')
    || normalized.includes('service unavailable')
  ) {
    return 'temporary_unavailable';
  }

  if (
    Number(status) === 401
    || Number(status) === 403
    || normalized.includes('invalid api key')
    || normalized.includes('incorrect api key')
    || normalized.includes('permission denied')
    || normalized.includes('unauthorized')
    || normalized.includes('forbidden')
  ) {
    return 'provider_access_denied';
  }

  if (
    Number(status) === 404
    || normalized.includes('model_not_found')
    || normalized.includes('model not found')
    || normalized.includes('does not exist')
  ) {
    return 'model_unavailable';
  }

  return 'provider_error';
};

const resolveRetryDelayMs = (attempt: number, retryAfterSeconds: number | null | undefined) => {
  const retryAfter = Number(retryAfterSeconds);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(Math.ceil(retryAfter * 1000), 12000);
  }

  return Math.min(700 * Math.pow(2, Math.max(0, attempt - 1)), 4200);
};

const waitFor = async (milliseconds: number) => (
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)))
);

const createOpenAiError = (message: string, diagnostics: OpenAiDiagnostics) => {
  const error = new Error(message) as Error & { diagnostics?: OpenAiDiagnostics };
  error.diagnostics = { ...diagnostics };
  return error;
};

const extractOpenAiError = (payload: any) => (
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

const stripMarkdownCodeFences = (value: string) => (
  value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
);

const extractBalancedJsonObject = (value: string) => {
  const startIndex = value.indexOf('{');
  if (startIndex < 0) return '';

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return value.slice(startIndex, index + 1).trim();
    }
  }

  return '';
};

const extractJsonCandidate = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  const withoutFences = stripMarkdownCodeFences(trimmed);
  if (withoutFences.startsWith('{') && withoutFences.endsWith('}')) return withoutFences;

  return extractBalancedJsonObject(withoutFences) || withoutFences;
};

const normalizeJsonLikeText = (value: string) => (
  String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/[â€œâ€]/g, '"')
    .replace(/[â€˜â€™]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
);

const parseJsonLeniently = (value: string) => {
  const candidate = extractJsonCandidate(value);
  const attempts = [
    candidate,
    stripMarkdownCodeFences(candidate),
    normalizeJsonLikeText(candidate),
  ].filter(Boolean);

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (typeof parsed === 'string') return JSON.parse(parsed);
      return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`JSON parse failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};

const buildResponsePreview = (value: string) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
};

const partToOpenAiContent = (part: Record<string, unknown>) => {
  if (typeof part?.text === 'string') {
    return { type: 'input_text', text: part.text };
  }

  const inlineData = part?.inlineData as { mimeType?: string; data?: string } | undefined;
  if (inlineData?.data) {
    const mimeType = inlineData.mimeType || 'image/jpeg';
    const imageUrl = inlineData.data.startsWith('data:')
      ? inlineData.data
      : `data:${mimeType};base64,${inlineData.data}`;
    return { type: 'input_image', image_url: imageUrl };
  }

  return null;
};

const toOpenAiInput = (systemInstruction: string, contents: Array<Record<string, unknown>>) => {
  const input: Array<Record<string, unknown>> = [];

  if (systemInstruction.trim()) {
    input.push({
      role: 'system',
      content: [{
        type: 'input_text',
        text: `${systemInstruction}\n\nReturn one valid JSON object only. Do not use markdown.`,
      }],
    });
  }

  for (const content of contents) {
    const role = typeof content?.role === 'string' ? content.role : 'user';
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    const openAiContent = parts
      .map((part) => part && typeof part === 'object' ? partToOpenAiContent(part as Record<string, unknown>) : null)
      .filter(Boolean);

    if (openAiContent.length) {
      input.push({
        role: ['user', 'assistant', 'system'].includes(role) ? role : 'user',
        content: openAiContent,
      });
    }
  }

  return input;
};

export const createStructuredResponse = async ({
  model = Deno.env.get('OPENAI_VISION_MODEL') || Deno.env.get('OPENAI_MODEL') || OPENAI_DEFAULT_VISION_MODEL,
  systemInstruction = '',
  contents,
  responseJsonSchema,
  maxOutputTokens = 2048,
  temperature = 0.2,
  includeDiagnostics = false,
}: GenerateStructuredContentParams) => {
  const diagnostics: OpenAiDiagnostics = {
    provider: 'openai',
    provider_request_attempted: false,
    provider_response_status: null,
    provider_parse_success: false,
    provider_endpoint: OPENAI_RESPONSES_URL,
    provider_model: model,
  };

  const input = toOpenAiInput(systemInstruction, contents);
  if (!input.length) {
    throw createOpenAiError('No valid OpenAI input content was provided.', diagnostics);
  }

  console.info('[openai-vision] structured response requested', {
    model,
    endpoint: OPENAI_RESPONSES_URL,
    hasOpenAiKey: Boolean(Deno.env.get('OPENAI_API_KEY')),
    inputMessageCount: input.length,
    maxOutputTokens,
    temperature,
  });

  const openAiKey = readOpenAiKey();
  let response: Response | null = null;
  let payload: any = null;

  diagnostics.provider_request_attempted = true;
  for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt += 1) {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model,
        input,
        temperature,
        max_output_tokens: maxOutputTokens,
        text: {
          format: {
            type: 'json_schema',
            name: 'hair_analysis_result',
            strict: false,
            schema: responseJsonSchema,
          },
        },
      }),
    });

    payload = await response.json().catch(() => ({}));
    diagnostics.provider_response_status = response.status;

    console.info('[openai-vision] response received', {
      model,
      ok: response.ok,
      status: response.status,
      attempt,
      maxAttempts: OPENAI_MAX_ATTEMPTS,
      payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
    });

    if (response.ok) break;

    const providerErrorMessage = extractOpenAiError(payload);
    const providerErrorType = classifyProviderErrorType({
      status: response.status,
      message: providerErrorMessage,
    });
    const retryAfterSeconds = parseRetryAfterHeaderValue(response.headers.get('retry-after'));
    const canRetry = (
      OPENAI_RETRYABLE_STATUS.has(response.status)
      && providerErrorType === 'temporary_unavailable'
      && attempt < OPENAI_MAX_ATTEMPTS
    );

    diagnostics.provider_error_type = providerErrorType;
    diagnostics.retry_after_seconds = retryAfterSeconds;

    console.warn('[openai-vision] provider error classified', {
      model,
      status: response.status,
      providerErrorType,
      retryAfterSeconds,
      messagePreview: buildResponsePreview(providerErrorMessage),
      attempt,
      maxAttempts: OPENAI_MAX_ATTEMPTS,
      willRetry: canRetry,
    });

    if (!canRetry) {
      throw createOpenAiError(providerErrorMessage, diagnostics);
    }

    await waitFor(resolveRetryDelayMs(attempt, retryAfterSeconds));
  }

  if (!response || !response.ok) {
    throw createOpenAiError('OpenAI request failed.', diagnostics);
  }

  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw createOpenAiError('OpenAI returned an empty response.', diagnostics);
  }

  try {
    const parsed = parseJsonLeniently(outputText);
    diagnostics.provider_parse_success = true;
    console.info('[openai-vision] parsed structured response', {
      model,
      topLevelKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : [],
      responsePreview: buildResponsePreview(outputText),
    });
    return includeDiagnostics ? { parsed, diagnostics } : parsed;
  } catch (error) {
    console.error('[openai-vision] invalid json response', {
      model,
      error: error instanceof Error ? error.message : String(error),
      responsePreview: buildResponsePreview(outputText),
      extractedPreview: buildResponsePreview(extractJsonCandidate(outputText)),
    });
    throw createOpenAiError('OpenAI returned invalid JSON.', diagnostics);
  }
};
