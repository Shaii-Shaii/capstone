const GOOGLE_AI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

type GenerateStructuredContentParams = {
  model?: string;
  systemInstruction?: string;
  contents: Array<Record<string, unknown>>;
  responseJsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
  includeDiagnostics?: boolean;
};

type GoogleAiDiagnostics = {
  provider: 'gemini';
  provider_request_attempted: boolean;
  provider_response_status: number | null;
  provider_parse_success: boolean;
  provider_endpoint: string;
  provider_model: string;
  provider_error_type?: string;
  retry_after_seconds?: number | null;
};

const parseRetryAfterSeconds = (message: string) => {
  const normalizedMessage = String(message || '');
  const retryMatch = normalizedMessage.match(/retry\s+in\s+(\d+(?:\.\d+)?)s/i);
  if (!retryMatch?.[1]) return null;

  const parsedSeconds = Number(retryMatch[1]);
  if (!Number.isFinite(parsedSeconds) || parsedSeconds <= 0) return null;

  return Math.max(1, Math.ceil(parsedSeconds));
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

const extractRetryAfterSecondsFromPayload = (payload: any) => {
  const candidates = [
    payload?.retry_after_seconds,
    payload?.retryAfterSeconds,
    payload?.error?.retry_after_seconds,
    payload?.error?.retryAfterSeconds,
    ...(Array.isArray(payload?.error?.details) ? payload.error.details.flatMap((detail: any) => [
      detail?.retryDelay,
      detail?.retry_after_seconds,
      detail?.retryAfterSeconds,
      detail?.metadata?.retryDelay,
      detail?.metadata?.retry_after_seconds,
      detail?.metadata?.retryAfterSeconds,
    ]) : []),
  ];

  for (const candidate of candidates) {
    if (candidate == null) continue;

    const rawValue = String(candidate).trim();
    const numericValue = Number(rawValue);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return Math.max(1, Math.ceil(numericValue));
    }

    const durationMatch = rawValue.match(/(\d+(?:\.\d+)?)s/i);
    if (durationMatch?.[1]) {
      const parsedSeconds = Number(durationMatch[1]);
      if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
        return Math.max(1, Math.ceil(parsedSeconds));
      }
    }
  }

  return null;
};

const extractRetryAfterSecondsFromResponse = async (response: Response, message = '') => {
  const headerValue = parseRetryAfterHeaderValue(response.headers.get('retry-after'));
  if (headerValue) return headerValue;

  try {
    const payload = await response.clone().json();
    const payloadRetryAfter = extractRetryAfterSecondsFromPayload(payload);
    if (payloadRetryAfter) return payloadRetryAfter;
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
    || normalizedMessage.includes('quota exceeded')
    || normalizedMessage.includes('free tier request limit')
    || normalizedMessage.includes('rate limit')
    || normalizedMessage.includes('resource exhausted')
    || normalizedMessage.includes('quota')
  ) {
    return 'quota_exceeded';
  }

  if (
    Number(status) === 503
    || normalizedMessage.includes('high demand')
    || normalizedMessage.includes('overloaded')
    || normalizedMessage.includes('temporarily unavailable')
    || normalizedMessage.includes('temporary unavailable')
    || normalizedMessage.includes('service unavailable')
  ) {
    return 'temporary_unavailable';
  }

  return 'provider_error';
};

const createGoogleAiError = (message: string, diagnostics: GoogleAiDiagnostics) => {
  const error = new Error(message) as Error & { diagnostics?: GoogleAiDiagnostics };
  error.diagnostics = { ...diagnostics };
  return error;
};

const extractGoogleAiError = async (response: Response) => {
  try {
    const payload = await response.clone().json();
    const message = payload?.error?.message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  } catch (_error) {
    // Fall through to text parsing.
  }

  try {
    const text = await response.clone().text();
    if (text?.trim()) {
      return text.trim();
    }
  } catch (_error) {
    // Fall through to generic message.
  }

  return 'Google AI request failed.';
};

const getResponseText = (payload: any) => {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = parts
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();

    if (text) return text;
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
      if (depth === 0) {
        return value.slice(startIndex, index + 1).trim();
      }
    }
  }

  return '';
};

const extractBalancedJsonArray = (value: string) => {
  const startIndex = value.indexOf('[');
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

    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return value.slice(startIndex, index + 1).trim();
      }
    }
  }

  return '';
};

const extractJsonCandidate = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  const withoutFences = stripMarkdownCodeFences(trimmed);
  if (withoutFences.startsWith('{') && withoutFences.endsWith('}')) {
    return withoutFences;
  }
  if (withoutFences.startsWith('[') && withoutFences.endsWith(']')) {
    return withoutFences;
  }

  const balancedObject = extractBalancedJsonObject(withoutFences);
  if (balancedObject) return balancedObject;

  const balancedArray = extractBalancedJsonArray(withoutFences);
  if (balancedArray) return balancedArray;

  return withoutFences;
};

const buildResponsePreview = (value: string) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized.length > 220
    ? `${normalized.slice(0, 217)}...`
    : normalized;
};

const repairMalformedJsonResponse = async ({
  apiKey,
  endpoint,
  model,
  responseJsonSchema,
  malformedText,
}: {
  apiKey: string;
  endpoint: string;
  model: string;
  responseJsonSchema: Record<string, unknown>;
  malformedText: string;
}) => {
  console.info('[google-ai] repair request started', {
    model,
    endpoint,
    malformedPreview: buildResponsePreview(malformedText),
  });

  const repairUrl = `${endpoint}?key=${encodeURIComponent(apiKey)}`;

  const repairResponse = await fetch(repairUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: [
            'You repair malformed JSON returned by another model call.',
            'Return one valid JSON object only.',
            'Do not use markdown.',
            'Do not use code fences.',
            'Do not add explanation before or after the JSON.',
            'Preserve the original meaning as closely as possible.',
          ].join('\n'),
        }],
      },
      contents: [{
        role: 'user',
        parts: [{
          text: [
            'Repair this content into valid JSON that matches the provided schema.',
            'If the content is wrapped in markdown or explanation, remove that wrapper and keep only the JSON.',
            '',
            malformedText,
          ].join('\n'),
        }],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: responseJsonSchema,
      },
    }),
  });

  console.info('[google-ai] repair response received', {
    model,
    status: repairResponse.status,
    ok: repairResponse.ok,
  });

  if (!repairResponse.ok) {
    throw new Error(await extractGoogleAiError(repairResponse));
  }

  const repairPayload = await repairResponse.json();
  const repairText = getResponseText(repairPayload);

  console.info('[google-ai] repair text extracted', {
    model,
    hasRepairText: Boolean(repairText),
    repairPreview: buildResponsePreview(repairText),
  });

  return repairText;
};

const normalizeJsonLikeText = (value: string) => (
  String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
);

const tryParseJsonValue = (value: string) => JSON.parse(normalizeJsonLikeText(value));

const parseJsonLeniently = (value: string) => {
  const attempts: string[] = [];
  const initialCandidate = extractJsonCandidate(value);
  const candidates = [
    initialCandidate,
    stripMarkdownCodeFences(initialCandidate),
    normalizeJsonLikeText(initialCandidate),
  ].filter(Boolean);

  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      attempts.push(`direct:${candidate.length}`);
      let parsed = tryParseJsonValue(candidate);

      if (typeof parsed === 'string') {
        attempts.push('string-reparse');
        parsed = tryParseJsonValue(parsed);
      }

      if (Array.isArray(parsed) && parsed.length === 1 && parsed[0] && typeof parsed[0] === 'object') {
        attempts.push('single-item-array-unwrapped');
        parsed = parsed[0];
      }

      if (parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).analysis === 'string') {
        attempts.push('analysis-string-reparse');
        const reparsedAnalysis = tryParseJsonValue(String((parsed as Record<string, unknown>).analysis));
        parsed = {
          ...(parsed as Record<string, unknown>),
          analysis: reparsedAnalysis,
        };
      }

      return {
        parsed,
        attempts,
        candidate,
      };
    } catch (error) {
      lastError = error;
      attempts.push(`failed:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`JSON parse attempts failed: ${attempts.join(' | ')} | ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};

export const createStructuredResponse = async ({
  model = 'gemini-2.5-flash',
  systemInstruction = '',
  contents,
  responseJsonSchema,
  maxOutputTokens = 2048,
  temperature = 0.45,
  includeDiagnostics = false,
}: GenerateStructuredContentParams) => {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
  const endpoint = `${GOOGLE_AI_API_URL}/${model}:generateContent`;
  const diagnostics: GoogleAiDiagnostics = {
    provider: 'gemini',
    provider_request_attempted: false,
    provider_response_status: null,
    provider_parse_success: false,
    provider_endpoint: endpoint,
    provider_model: model,
  };

  console.info('[google-ai] structured response requested', {
    model,
    endpoint,
    hasApiKey: Boolean(apiKey),
    contentCount: Array.isArray(contents) ? contents.length : 0,
    hasSystemInstruction: Boolean(systemInstruction),
    maxOutputTokens,
    temperature,
  });

  if (!apiKey) {
    throw createGoogleAiError('Google AI API key is not configured in Edge Function Secrets.', diagnostics);
  }

  const requestUrl = `${endpoint}?key=${encodeURIComponent(apiKey)}`;

  console.info('[google-ai] request started', {
    model,
    endpoint,
  });
  diagnostics.provider_request_attempted = true;

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: systemInstruction
        ? {
            parts: [{ text: systemInstruction }],
          }
        : undefined,
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: responseJsonSchema,
      },
    }),
  });

  console.info('[google-ai] response received', {
    model,
    status: response.status,
    ok: response.ok,
  });
  diagnostics.provider_response_status = response.status;

  if (!response.ok) {
    const providerErrorMessage = await extractGoogleAiError(response);
    diagnostics.provider_error_type = classifyProviderErrorType({
      status: response.status,
      message: providerErrorMessage,
    });
    diagnostics.retry_after_seconds = await extractRetryAfterSecondsFromResponse(
      response,
      providerErrorMessage,
    );

    console.warn('[google-ai] provider error classified', {
      model,
      status: response.status,
      providerErrorType: diagnostics.provider_error_type,
      retryAfterSeconds: diagnostics.retry_after_seconds,
      messagePreview: buildResponsePreview(providerErrorMessage),
    });

    throw createGoogleAiError(providerErrorMessage, diagnostics);
  }

  const payload = await response.json();
  const responseText = getResponseText(payload);
  const jsonCandidate = extractJsonCandidate(responseText);

  console.info('[google-ai] response parsed', {
    model,
    hasCandidates: Array.isArray(payload?.candidates) && payload.candidates.length > 0,
    hasResponseText: Boolean(responseText),
    responsePreview: buildResponsePreview(responseText),
  });

  if (!responseText) {
    throw createGoogleAiError('Google AI returned an empty response.', diagnostics);
  }

  console.info('[google-ai] extracted text', {
    model,
    extractedPreview: buildResponsePreview(jsonCandidate),
    extractionChangedText: responseText.trim() !== jsonCandidate.trim(),
    jsonExtractionAttempted: true,
  });

  try {
    const parseResult = parseJsonLeniently(responseText);
    const parsed = parseResult.parsed;
    diagnostics.provider_parse_success = true;
    console.info('[google-ai] json parsed successfully', {
      model,
      topLevelKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : [],
      parseAttempts: parseResult.attempts,
    });
    return includeDiagnostics
      ? { parsed, diagnostics }
      : parsed;
  } catch (error) {
    console.warn('[google-ai] primary json parse failed, attempting repair', {
      model,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      const repairedText = await repairMalformedJsonResponse({
        apiKey,
        endpoint,
        model,
        responseJsonSchema,
        malformedText: jsonCandidate || responseText,
      });
      const repairParseResult = parseJsonLeniently(repairedText);
      const repairedParsed = repairParseResult.parsed;
      diagnostics.provider_parse_success = true;
      console.info('[google-ai] repair json parsed successfully', {
        model,
        topLevelKeys: repairedParsed && typeof repairedParsed === 'object' ? Object.keys(repairedParsed) : [],
        parseAttempts: repairParseResult.attempts,
      });
      return includeDiagnostics
        ? { parsed: repairedParsed, diagnostics }
        : repairedParsed;
    } catch (repairError) {
      console.error('[google-ai] repair attempt failed', {
        model,
        error: repairError instanceof Error ? repairError.message : String(repairError),
      });
    }

    console.error('[google-ai] invalid json response', {
      model,
      error: error instanceof Error ? error.message : String(error),
      responsePreview: buildResponsePreview(responseText),
      extractedPreview: buildResponsePreview(jsonCandidate),
    });
    throw createGoogleAiError('Google AI returned invalid JSON.', diagnostics);
  }
};
