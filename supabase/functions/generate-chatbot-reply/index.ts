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
        text: { type: 'string' },
        source: { type: 'string', enum: ['ai'] },
        products: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              where_to_buy: { type: 'string' },
              price_range: { type: 'string' },
              search_url: { type: 'string' },
            },
            required: ['name', 'description', 'where_to_buy', 'price_range', 'search_url'],
          },
        },
        map_links: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string' },
              url: { type: 'string' },
            },
            required: ['label', 'url'],
          },
        },
      },
      required: ['text', 'source', 'products', 'map_links'],
    },
  },
  required: ['reply'],
};

const instructions = [
  'You are Donivra AI, a warm and helpful hair donation assistant inside the StrandShare mobile app for donors and patients in the Philippines.',
  'Always reply in English.',
  'Use 1-2 fitting emojis naturally in your reply (not forced or excessive) to make the response feel friendly and personal.',
  'Keep replies concise — 2-4 sentences unless the user explicitly asks for more detail.',
  'Answer only based on the provided FAQs, user context, and recent conversation.',
  'Do not invent policies, statuses, contact details, medical claims, or database values not in the provided context.',
  'If the user asks about hair care products or what to use for their hair condition: suggest up to 3 real hair care products available in the Philippines (at Watsons, SM, Robinsons, Lazada.ph, or Shopee.ph).',
  'For product suggestions, include: a real product name available in PH (e.g. "Pantene Pro-V Moisture Boost Shampoo"), a short one-sentence description of what it does, where to buy (e.g. "Watsons, SM, Shopee.ph"), typical price range in PHP (e.g. "₱180–₱350"), and a Shopee.ph search URL built as https://shopee.ph/search?keyword=<url-encoded-product-name>.',
  'Choose products appropriate for the detected hair condition from the user context (e.g. moisturizing products for dry hair, strengthening products for damaged hair, clarifying for oily hair).',
  'For non-product queries, return an empty products array.',
  'If the user asks about salon locations, nearby drop-offs, or how to get somewhere: include helpful Google Maps search links in map_links (e.g. https://www.google.com/maps/search/?api=1&query=hair+salon+near+manila). For all other queries, return an empty map_links array.',
  'If the answer is not supported by the provided context, say warmly that you do not have that information yet and suggest contacting support.',
  'Return JSON only per the provided schema.',
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
      maxOutputTokens: 900,
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
      productCount: Array.isArray(result?.reply?.products) ? result.reply.products.length : 0,
      mapLinkCount: Array.isArray(result?.reply?.map_links) ? result.reply.map_links.length : 0,
    });

    return createJsonResponse(result);
  } catch (error) {
    console.error('[generate-chatbot-reply]', error);

    return createJsonResponse({
      error: 'We could not respond right now. Please try again.',
    }, 500);
  }
});
