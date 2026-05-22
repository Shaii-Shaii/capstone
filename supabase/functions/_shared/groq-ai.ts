const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MAX_ATTEMPTS = 2;
const GROQ_RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const GROQ_DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

type GenerateStructuredContentParams = {
  model?: string;
  systemInstruction?: string;
  contents: Array<Record<string, unknown>>;
  responseJsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
  includeDiagnostics?: boolean;
};

type GroqDiagnostics = {
  provider: 'groq';
  provider_request_attempted: boolean;
  provider_response_status: number | null;
  provider_parse_success: boolean;
  provider_endpoint: string;
  provider_model: string;
  provider_error_type?: string;
  retry_after_seconds?: number | null;
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

const parseRetryAfterSeconds = (message: string) => {
  const normalized = String(message || '');
  const retryMatch = normalized.match(/retry\s+(?:in|after)\s+(\d+(?:\.\d+)?)s?/i);
  if (!retryMatch?.[1]) return null;

  const parsedSeconds = Number(retryMatch[1]);
  return Number.isFinite(parsedSeconds) && parsedSeconds > 0
    ? Math.max(1, Math.ceil(parsedSeconds))
    : null;
};

const extractRetryAfterSecondsFromResponse = async (response: Response, message = '') => {
  const headerValue = parseRetryAfterHeaderValue(response.headers.get('retry-after'));
  if (headerValue) return headerValue;

  try {
    const payload = await response.clone().json();
    const candidates = [
      payload?.retry_after_seconds,
      payload?.retryAfterSeconds,
      payload?.error?.retry_after_seconds,
      payload?.error?.retryAfterSeconds,
      payload?.error?.metadata?.retryAfter,
      payload?.error?.metadata?.retry_after,
    ];

    for (const candidate of candidates) {
      if (candidate == null) continue;
      const raw = String(candidate).trim();
      const numeric = Number(raw);
      if (Number.isFinite(numeric) && numeric > 0) return Math.max(1, Math.ceil(numeric));

      const durationMatch = raw.match(/(\d+(?:\.\d+)?)s/i);
      if (durationMatch?.[1]) {
        const seconds = Number(durationMatch[1]);
        if (Number.isFinite(seconds) && seconds > 0) return Math.max(1, Math.ceil(seconds));
      }
    }
  } catch {
    // Ignore payload parsing issues and fall back to message parsing.
  }

  return parseRetryAfterSeconds(message);
};

const classifyProviderErrorType = ({
  status,
  message,
}: {
  status: number | null;
  message: string;
}) => {
  const normalizedMessage = String(message || '').toLowerCase();

  if (
    Number(status) === 429
    || normalizedMessage.includes('quota')
    || normalizedMessage.includes('rate limit')
    || normalizedMessage.includes('too many requests')
    || normalizedMessage.includes('resource exhausted')
  ) {
    return 'quota_exceeded';
  }

  if (
    Number(status) === 503
    || normalizedMessage.includes('overloaded')
    || normalizedMessage.includes('temporarily unavailable')
    || normalizedMessage.includes('service unavailable')
  ) {
    return 'temporary_unavailable';
  }

  if (
    Number(status) === 404
    || normalizedMessage.includes('model not found')
    || normalizedMessage.includes('model_not_found')
    || normalizedMessage.includes('does not exist')
  ) {
    return 'model_unavailable';
  }

  if (
    Number(status) === 401
    || Number(status) === 403
    || normalizedMessage.includes('invalid api key')
    || normalizedMessage.includes('incorrect api key')
    || normalizedMessage.includes('permission denied')
    || normalizedMessage.includes('access denied')
    || normalizedMessage.includes('forbidden')
    || normalizedMessage.includes('unauthorized')
  ) {
    return 'provider_access_denied';
  }

  return 'provider_error';
};

const waitFor = async (milliseconds: number) => (
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)))
);

const resolveRetryDelayMs = (attempt: number, retryAfterSeconds: number | null | undefined) => {
  const retryAfter = Number(retryAfterSeconds);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(Math.ceil(retryAfter * 1000), 12000);
  }

  return Math.min(700 * Math.pow(2, Math.max(0, attempt - 1)), 4200);
};

const createGroqError = (message: string, diagnostics: GroqDiagnostics) => {
  const error = new Error(message) as Error & { diagnostics?: GroqDiagnostics };
  error.diagnostics = { ...diagnostics };
  return error;
};

const extractGroqError = async (response: Response) => {
  try {
    const payload = await response.clone().json();
    const message = payload?.error?.message || payload?.message || payload?.error;
    if (typeof message === 'string' && message.trim()) return message.trim();
  } catch {
    // Fall through to text parsing.
  }

  try {
    const text = await response.clone().text();
    if (text?.trim()) return text.trim();
  } catch {
    // Fall through to generic message.
  }

  return 'Groq request failed.';
};

const getResponseText = (payload: any) => {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  for (const choice of choices) {
    const content = choice?.message?.content;
    if (typeof content === 'string' && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
        .trim();
      if (text) return text;
    }
  }
  return '';
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

const partToGroqContent = (part: Record<string, unknown>) => {
  if (typeof part?.text === 'string') {
    return { type: 'text', text: part.text };
  }

  const inlineData = part?.inlineData as { mimeType?: string; data?: string } | undefined;
  if (inlineData?.data) {
    const mimeType = inlineData.mimeType || 'image/jpeg';
    const data = inlineData.data.startsWith('data:')
      ? inlineData.data
      : `data:${mimeType};base64,${inlineData.data}`;
    return {
      type: 'image_url',
      image_url: { url: data },
    };
  }

  return null;
};

const toGroqMessages = (systemInstruction: string, contents: Array<Record<string, unknown>>) => {
  const messages: Array<Record<string, unknown>> = [];

  if (systemInstruction.trim()) {
    messages.push({
      role: 'system',
      content: `${systemInstruction}\n\nReturn one valid JSON object only. Do not use markdown.`,
    });
  }

  for (const content of contents) {
    const role = typeof content?.role === 'string' ? content.role : 'user';
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    const groqContent = parts
      .map((part) => part && typeof part === 'object' ? partToGroqContent(part as Record<string, unknown>) : null)
      .filter(Boolean);

    if (groqContent.length) {
      messages.push({
        role: ['user', 'assistant', 'system'].includes(role) ? role : 'user',
        content: groqContent,
      });
    }
  }

  return messages;
};

export const createStructuredResponse = async ({
  model = Deno.env.get('GROQ_VISION_MODEL') || Deno.env.get('GROQ_MODEL') || GROQ_DEFAULT_MODEL,
  systemInstruction = '',
  contents,
  responseJsonSchema: _responseJsonSchema,
  maxOutputTokens = 2048,
  temperature = 0.2,
  includeDiagnostics = false,
}: GenerateStructuredContentParams) => {
  const apiKey = (
    Deno.env.get('GROQ_DONIVRA_API')
    || Deno.env.get('GROQ_API_KEY')
    || ''
  ).trim();
  const diagnostics: GroqDiagnostics = {
    provider: 'groq',
    provider_request_attempted: false,
    provider_response_status: null,
    provider_parse_success: false,
    provider_endpoint: GROQ_API_URL,
    provider_model: model,
  };

  console.info('[groq-ai] structured response requested', {
    model,
    endpoint: GROQ_API_URL,
    hasApiKey: Boolean(apiKey),
    contentCount: Array.isArray(contents) ? contents.length : 0,
    hasSystemInstruction: Boolean(systemInstruction),
    maxOutputTokens,
    temperature,
  });

  if (!apiKey) {
    throw createGroqError('Groq API key is not configured in Edge Function Secrets.', diagnostics);
  }

  const messages = toGroqMessages(systemInstruction, contents);
  if (!messages.length) {
    throw createGroqError('No valid Groq message content was provided.', diagnostics);
  }

  diagnostics.provider_request_attempted = true;
  let response: Response | null = null;

  for (let attempt = 1; attempt <= GROQ_MAX_ATTEMPTS; attempt += 1) {
    response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_completion_tokens: maxOutputTokens,
        response_format: { type: 'json_object' },
        stream: false,
      }),
    });

    diagnostics.provider_response_status = response.status;
    console.info('[groq-ai] response received', {
      model,
      status: response.status,
      ok: response.ok,
      attempt,
      maxAttempts: GROQ_MAX_ATTEMPTS,
    });

    if (response.ok) break;

    const providerErrorMessage = await extractGroqError(response);
    const providerErrorType = classifyProviderErrorType({
      status: response.status,
      message: providerErrorMessage,
    });
    const retryAfterSeconds = await extractRetryAfterSecondsFromResponse(response, providerErrorMessage);
    const canRetry = (
      GROQ_RETRYABLE_STATUS.has(response.status)
      && providerErrorType === 'temporary_unavailable'
      && attempt < GROQ_MAX_ATTEMPTS
    );

    diagnostics.provider_error_type = providerErrorType;
    diagnostics.retry_after_seconds = retryAfterSeconds;

    console.warn('[groq-ai] provider error classified', {
      model,
      status: response.status,
      providerErrorType,
      retryAfterSeconds,
      messagePreview: buildResponsePreview(providerErrorMessage),
      attempt,
      maxAttempts: GROQ_MAX_ATTEMPTS,
      willRetry: canRetry,
    });

    if (!canRetry) {
      throw createGroqError(providerErrorMessage, diagnostics);
    }

    await waitFor(resolveRetryDelayMs(attempt, retryAfterSeconds));
  }

  if (!response || !response.ok) {
    throw createGroqError('Groq request failed.', diagnostics);
  }

  const payload = await response.json();
  const responseText = getResponseText(payload);

  console.info('[groq-ai] response parsed', {
    model,
    hasChoices: Array.isArray(payload?.choices) && payload.choices.length > 0,
    hasResponseText: Boolean(responseText),
    responsePreview: buildResponsePreview(responseText),
  });

  if (!responseText) {
    throw createGroqError('Groq returned an empty response.', diagnostics);
  }

  try {
    const parsed = parseJsonLeniently(responseText);
    diagnostics.provider_parse_success = true;
    return includeDiagnostics ? { parsed, diagnostics } : parsed;
  } catch (error) {
    console.error('[groq-ai] invalid json response', {
      model,
      error: error instanceof Error ? error.message : String(error),
      responsePreview: buildResponsePreview(responseText),
      extractedPreview: buildResponsePreview(extractJsonCandidate(responseText)),
    });
    throw createGroqError('Groq returned invalid JSON.', diagnostics);
  }
};
