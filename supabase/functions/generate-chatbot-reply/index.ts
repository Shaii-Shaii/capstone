import { createJsonResponse, handleCorsPreflight } from '../_shared/cors';
import { createStructuredResponse } from '../_shared/openai';

const replySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: {
          type: 'string',
        },
        source: {
          type: 'string',
          enum: ['ai'],
        },
      },
      required: ['text', 'source'],
    },
  },
  required: ['reply'],
};

const instructions = [
  'You are Donivra AI inside a mobile app for donors and patients.',
  'Return JSON only.',
  'Answer only with information supported by the provided FAQs, settings, and recent conversation.',
  'Do not invent policies, statuses, contact details, medical claims, or database values.',
  'If the answer is not supported by the provided context, say that the app does not have a saved answer for that yet and suggest contacting support.',
  'Keep the reply concise, clear, and user-facing.',
].join(' ');

Deno.serve(async (request) => {
  const preflightResponse = handleCorsPreflight(request);
  if (preflightResponse) return preflightResponse;

  try {
    const body = await request.json();
    const role = typeof body?.role === 'string' ? body.role : 'user';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const faqs = Array.isArray(body?.faqs) ? body.faqs : [];
    const settings = body?.settings || {};
    const recentMessages = Array.isArray(body?.recent_messages) ? body.recent_messages : [];

    if (!message) {
      return createJsonResponse({ error: 'A message is required.' }, 400);
    }

    console.info('[generate-chatbot-reply] invoked', {
      role,
      hasMessage: Boolean(message),
      faqCount: faqs.length,
      recentMessageCount: recentMessages.length,
      hasFallbackMessage: Boolean(settings?.fallbackMessage),
    });

    const result = await createStructuredResponse({
      instructions,
      schemaName: 'chatbot_reply',
      schema: replySchema,
      maxOutputTokens: 500,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                role,
                user_message: message,
                settings: {
                  welcomeMessage: settings?.welcomeMessage || '',
                  fallbackMessage: settings?.fallbackMessage || '',
                  quickSuggestions: Array.isArray(settings?.quickSuggestions) ? settings.quickSuggestions : [],
                },
                faqs: faqs.map((faq) => ({
                  question: faq?.question || '',
                  answer: faq?.answer || '',
                  keywords: Array.isArray(faq?.keywords) ? faq.keywords : [],
                })),
                recent_messages: recentMessages.map((entry) => ({
                  sender: entry?.sender || '',
                  text: entry?.text || '',
                  source: entry?.source || '',
                })),
              }),
            },
          ],
        },
      ],
    });

    console.info('[generate-chatbot-reply] openai result ready', {
      hasReply: Boolean(result?.reply?.text),
      responseKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    });

    return createJsonResponse(result);
  } catch (error) {
    console.error('[generate-chatbot-reply]', error);

    return createJsonResponse({
      error: 'We could not respond right now. Please try again.',
    }, 500);
  }
});
