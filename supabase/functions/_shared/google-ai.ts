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
  provider_attempt_count?: number;
  provider_retry_exhausted?: boolean;
  provider_fallback_used?: boolean;
  provider_error_type?: string;
  retry_after_seconds?: number | null;
};

type RetryDecision = {
  retryable: boolean;
  reason: string;
};

const parseRetryAfterSeconds = (message: string) => {
  const normalizedMessage = String(message || '');
  const retryMatch = normalizedMessage.match(/retry\s+in\s+(\d+(?:\.\d+)?)s/i);
  if (!retryMatch?.[1]) return null;

  const parsedSeconds = Number(retryMatch[1]);
  if (!Number.isFinite(parsedSeconds) || parsedSeconds <= 0) return null;

  return Math.max(1, Math.ceil(parsedSeconds));
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

const sleep = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

const classifyRetryableProviderError = ({
  status,
  message,
}: {
  status: number | null;
  message: string;
}): RetryDecision => {
  const normalizedMessage = String(message || '').toLowerCase();

  if ([429, 500, 502, 503, 504].includes(Number(status))) {
    if (
      normalizedMessage.includes('invalid')
      || normalizedMessage.includes('malformed')
      || normalizedMessage.includes('unsupported')
      || normalizedMessage.includes('schema')
      || normalizedMessage.includes('api key')
      || normalizedMessage.includes('permission')
    ) {
      return { retryable: false, reason: 'non_retryable_status_with_request_error' };
    }

    return { retryable: true, reason: 'retryable_status_code' };
  }

  if (
    normalizedMessage.includes('high demand')
    || normalizedMessage.includes('overloaded')
    || normalizedMessage.includes('temporarily unavailable')
    || normalizedMessage.includes('temporary unavailable')
    || normalizedMessage.includes('retry later')
    || normalizedMessage.includes('rate limit')
    || normalizedMessage.includes('quota')
    || normalizedMessage.includes('resource exhausted')
    || normalizedMessage.includes('try again later')
    || normalizedMessage.includes('service unavailable')
  ) {
    return { retryable: true, reason: 'retryable_message_match' };
  }

  return { retryable: false, reason: 'non_retryable_provider_error' };
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

const getCandidateModels = (primaryModel: string) => {
  const fallbackModel = String(Deno.env.get('GOOGLE_AI_FALLBACK_MODEL') || '').trim();
  return [primaryModel, fallbackModel]
    .filter(Boolean)
    .filter((model, index, source) => source.indexOf(model) === index);
};

const requestStructuredContentOnce = async ({
  apiKey,
  endpoint,
  contents,
  maxOutputTokens,
  responseJsonSchema,
  systemInstruction,
  temperature,
}: {
  apiKey: string;
  endpoint: string;
  contents: Array<Record<string, unknown>>;
  maxOutputTokens: number;
  responseJsonSchema: Record<string, unknown>;
  systemInstruction: string;
  temperature: number;
}) => {
  return await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      system_instruction: systemInstruction
        ? {
            parts: [{ text: systemInstruction }],
          }
        : undefined,
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseJsonSchema,
      },
    }),
  });
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

  const repairResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      system_instruction: {
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
        responseJsonSchema,
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
    provider_attempt_count: 0,
    provider_retry_exhausted: false,
    provider_fallback_used: false,
  };
  const candidateModels = getCandidateModels(model);
  const retryDelaysMs = [350, 900];

  console.info('[google-ai] structured response requested', {
    model,
    endpoint,
    candidateModels,
    hasApiKey: Boolean(apiKey),
    contentCount: Array.isArray(contents) ? contents.length : 0,
    contentPartCounts: Array.isArray(contents)
      ? contents.map((content, index) => {
          const parts = Array.isArray((content as { parts?: unknown[] })?.parts)
            ? (content as { parts?: unknown[] }).parts || []
            : [];
          return {
            index,
            role: typeof (content as { role?: string })?.role === 'string' ? (content as { role?: string }).role : 'unknown',
            totalParts: parts.length,
            textParts: parts.filter((part) => typeof (part as { text?: unknown })?.text === 'string').length,
            imageParts: parts.filter((part) => Boolean((part as { inline_data?: unknown })?.inline_data)).length,
          };
        })
      : [],
    hasSystemInstruction: Boolean(systemInstruction),
    maxOutputTokens,
    temperature,
  });

  if (!apiKey) {
    throw createGoogleAiError('Google AI API key is not configured in Edge Function Secrets.', diagnostics);
  }

  let response: Response | null = null;
  let activeModel = model;
  let lastErrorMessage = '';
  let attemptCount = 0;
  let lastRetryableDecision: RetryDecision = { retryable: false, reason: 'not_started' };

  modelLoop:
  for (let modelIndex = 0; modelIndex < candidateModels.length; modelIndex += 1) {
    activeModel = candidateModels[modelIndex];
    diagnostics.provider_model = activeModel;
    diagnostics.provider_endpoint = `${GOOGLE_AI_API_URL}/${activeModel}:generateContent`;
    diagnostics.provider_fallback_used = modelIndex > 0;

    for (let retryIndex = 0; retryIndex <= retryDelaysMs.length; retryIndex += 1) {
      attemptCount += 1;
      diagnostics.provider_attempt_count = attemptCount;
      diagnostics.provider_request_attempted = true;

      console.info('[google-ai] provider request attempt started', {
        model: activeModel,
        attempt: attemptCount,
        retryIndex,
        usesFallbackModel: modelIndex > 0,
        endpoint: diagnostics.provider_endpoint,
      });

      try {
        response = await requestStructuredContentOnce({
          apiKey,
          endpoint: diagnostics.provider_endpoint,
          contents,
          maxOutputTokens,
          responseJsonSchema,
          systemInstruction,
          temperature,
        });
      } catch (networkError) {
        lastErrorMessage = networkError instanceof Error ? networkError.message : String(networkError);
        lastRetryableDecision = { retryable: true, reason: 'network_fetch_failure' };
        console.warn('[google-ai] provider request network failure', {
          model: activeModel,
          attempt: attemptCount,
          message: lastErrorMessage,
        });

        if (retryIndex < retryDelaysMs.length) {
          const delayMs = retryDelaysMs[retryIndex];
          console.info('[google-ai] backoff delay applied', {
            model: activeModel,
            attempt: attemptCount,
            delayMs,
            retryReason: lastRetryableDecision.reason,
          });
          await sleep(delayMs);
          continue;
        }

        break;
      }

      console.info('[google-ai] response received', {
        model: activeModel,
        attempt: attemptCount,
        status: response.status,
        ok: response.ok,
      });
      diagnostics.provider_response_status = response.status;

      if (response.ok) {
        break modelLoop;
      }

      lastErrorMessage = await extractGoogleAiError(response);
      lastRetryableDecision = classifyRetryableProviderError({
        status: response.status,
        message: lastErrorMessage,
      });
      diagnostics.provider_error_type = classifyProviderErrorType({
        status: response.status,
        message: lastErrorMessage,
      });
      diagnostics.retry_after_seconds = parseRetryAfterSeconds(lastErrorMessage);

      console.warn('[google-ai] provider error classified', {
        model: activeModel,
        attempt: attemptCount,
        status: response.status,
        retryable: lastRetryableDecision.retryable,
        reason: lastRetryableDecision.reason,
        providerErrorType: diagnostics.provider_error_type,
        retryAfterSeconds: diagnostics.retry_after_seconds,
        messagePreview: buildResponsePreview(lastErrorMessage),
      });

      if (!lastRetryableDecision.retryable) {
        throw createGoogleAiError(lastErrorMessage, diagnostics);
      }

      if (retryIndex < retryDelaysMs.length) {
        const delayMs = retryDelaysMs[retryIndex];
        console.info('[google-ai] retryable provider error detected', {
          model: activeModel,
          attempt: attemptCount,
          delayMs,
          reason: lastRetryableDecision.reason,
        });
        console.info('[google-ai] backoff delay applied', {
          model: activeModel,
          attempt: attemptCount,
          delayMs,
          retryReason: lastRetryableDecision.reason,
        });
        await sleep(delayMs);
        continue;
      }

      console.warn('[google-ai] retries exhausted for model', {
        model: activeModel,
        attempt: attemptCount,
        reason: lastRetryableDecision.reason,
      });
      break;
    }

    if (modelIndex < candidateModels.length - 1 && lastRetryableDecision.retryable) {
      console.info('[google-ai] fallback model selected after retry exhaustion', {
        previousModel: activeModel,
        fallbackModel: candidateModels[modelIndex + 1],
        attemptsSoFar: attemptCount,
      });
      continue;
    }

    break;
  }

  if (!response || !response.ok) {
    diagnostics.provider_retry_exhausted = Boolean(lastRetryableDecision.retryable);
    diagnostics.provider_error_type = diagnostics.provider_error_type
      || classifyProviderErrorType({
        status: diagnostics.provider_response_status,
        message: lastErrorMessage,
      });
    diagnostics.retry_after_seconds = diagnostics.retry_after_seconds ?? parseRetryAfterSeconds(lastErrorMessage);
    const finalMessage = diagnostics.provider_retry_exhausted
      ? 'Google AI is temporarily busy right now. Please try again later.'
      : (lastErrorMessage || 'Google AI request failed.');
    console.error('[google-ai] provider request failed after retries', {
      model: activeModel,
      attemptCount,
      retryExhausted: diagnostics.provider_retry_exhausted,
      lastRetryReason: lastRetryableDecision.reason,
      providerErrorType: diagnostics.provider_error_type,
      retryAfterSeconds: diagnostics.retry_after_seconds,
      fallbackUsed: diagnostics.provider_fallback_used,
      messagePreview: buildResponsePreview(finalMessage),
    });
    throw createGoogleAiError(finalMessage, diagnostics);
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
      model: activeModel,
      error: error instanceof Error ? error.message : String(error),
      responsePreview: buildResponsePreview(responseText),
      extractedPreview: buildResponsePreview(jsonCandidate),
    });
    throw createGoogleAiError('Google AI returned invalid JSON.', diagnostics);
  }
};
