import { createStructuredResponse as createGoogleStructuredResponse } from './google-ai.ts';
import { createStructuredResponse as createOpenAiStructuredResponse } from './openai-vision.ts';

type GenerateStructuredContentParams = {
  model?: string;
  systemInstruction?: string;
  contents: Array<Record<string, unknown>>;
  responseJsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
  includeDiagnostics?: boolean;
};

const hasGoogleAiKey = () => Boolean((Deno.env.get('GOOGLE_AI_API_KEY') || '').trim());
const hasOpenAiKey = () => Boolean((Deno.env.get('OPENAI_API_KEY') || '').trim());

const resolveOpenAiFallbackModel = (model?: string) => {
  const normalizedModel = String(model || '').trim();
  if (normalizedModel.toLowerCase().startsWith('gpt')) return normalizedModel;

  return Deno.env.get('OPENAI_VISION_MODEL')
    || Deno.env.get('OPENAI_MODEL')
    || undefined;
};

const getProviderErrorType = (error: unknown) => (
  (error as { diagnostics?: { provider_error_type?: string } })?.diagnostics?.provider_error_type || ''
);

export const createStructuredResponse = async (params: GenerateStructuredContentParams) => {
  const googleConfigured = hasGoogleAiKey();
  const openAiConfigured = hasOpenAiKey();

  if (googleConfigured) {
    try {
      console.info('[ai-vision] calling Google AI provider', {
        requestedModel: params.model || null,
        hasOpenAiFallback: openAiConfigured,
      });
      return await createGoogleStructuredResponse(params);
    } catch (error) {
      if (!openAiConfigured) {
        throw error;
      }

      console.warn('[ai-vision] Google AI failed; falling back to OpenAI', {
        googleModel: params.model || '',
        providerErrorType: getProviderErrorType(error) || null,
        providerResponseStatus: (error as { diagnostics?: { provider_response_status?: number | null } })?.diagnostics?.provider_response_status ?? null,
      });
    }
  }

  if (openAiConfigured) {
    console.info('[ai-vision] calling OpenAI vision provider', {
      requestedModel: resolveOpenAiFallbackModel(params.model) || null,
      googleConfigured,
    });
    return await createOpenAiStructuredResponse({
      ...params,
      model: resolveOpenAiFallbackModel(params.model),
    });
  }

  throw new Error('No AI provider API key is configured. Set GOOGLE_AI_API_KEY or OPENAI_API_KEY.');
};
