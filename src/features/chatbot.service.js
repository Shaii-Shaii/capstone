import { invokeEdgeFunction } from '../api/supabase/client';
import * as ChatbotAPI from './chatbot.api';
import { chatbotAiFunctionName } from './chatbot.constants';
import { getProcessTracking } from './processTracking.service';
import {
  fetchDonorRecommendationsBySubmissionId,
  fetchHairSubmissionsByUserId,
  fetchLatestHairSubmissionByUserId,
} from './hairSubmission.api';
import {
  fetchLatestWigAllocationByPatientDetailsId,
  fetchLatestWigRequestByPatientDetailsId,
} from './wigRequest.api';
import { getProfileBundle } from './profile/services/profile.service';
import { logAppError } from '../utils/appErrors';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';
const openAiClientKey = (
  process.env.EXPO_PUBLIC_OPEN_API_KEY
  || process.env.EXPO_PUBLIC_OPENAI_API_KEY
  || process.env.OPEN_API_KEY
  || ''
).trim();
const openAiModel = process.env.EXPO_PUBLIC_OPENAI_MODEL || 'gpt-4o-mini';
const openAiImageModel = process.env.EXPO_PUBLIC_OPENAI_IMAGE_MODEL || 'gpt-image-1';

const getNormalizedErrorMessage = (error) => (
  error?.message
  || error?.error_description
  || error?.details
  || ''
);

const isMissingChatTableError = (error) => (
  getNormalizedErrorMessage(error).toLowerCase().includes("could not find the table 'public.chatbot_")
);

const extractFunctionErrorMessage = async (error) => {
  const response = error?.context;

  if (!response || typeof response.clone !== 'function') {
    return getNormalizedErrorMessage(error);
  }

  try {
    const payload = await response.clone().json();
    if (typeof payload?.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }
    if (typeof payload?.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }
    if (typeof payload?.code === 'string' && payload.code.trim()) {
      return payload.code.trim();
    }
  } catch (_jsonError) {
    // Fall through to text.
  }

  try {
    const text = await response.clone().text();
    if (text?.trim()) {
      return text.trim();
    }
  } catch (_textError) {
    // Fall back to the original error object message.
  }

  return getNormalizedErrorMessage(error);
};

const buildBootstrapConversation = (settings) => (
  settings?.welcomeMessage
    ? [
        {
          id: `welcome-${Date.now()}`,
          sender: 'assistant',
          text: settings.welcomeMessage,
          createdAt: new Date().toISOString(),
          source: 'welcome',
        },
      ]
    : []
);

const normalizeSettings = (row) => {
  const quickSuggestions = Array.isArray(row?.quick_suggestions)
    ? row.quick_suggestions
    : Array.isArray(row?.suggestions)
      ? row.suggestions
      : [];

  return {
    welcomeMessage: row?.welcome_message || row?.greeting_message || '',
    fallbackMessage: row?.fallback_message || row?.no_answer_message || '',
    quickSuggestions,
  };
};

const normalizeFaq = (row) => ({
  id: row?.id || row?.question || Math.random().toString(36).slice(2),
  question: row?.question || row?.title || '',
  answer: row?.answer || row?.response || row?.content || '',
  keywords: Array.isArray(row?.keywords)
    ? row.keywords
    : typeof row?.keywords === 'string'
      ? row.keywords.split(',').map((item) => item.trim()).filter(Boolean)
      : [],
  priorityOrder: Number(row?.priority_order) || 0,
});

const normalizeMessage = (row) => ({
  id: row?.id || `${row?.created_at || Date.now()}-${row?.sender_role || row?.sender_type || 'assistant'}`,
  sender: row?.sender_role || row?.sender_type || row?.author || 'assistant',
  text: row?.message_text || row?.content || row?.body || '',
  createdAt: row?.created_at || new Date().toISOString(),
  source: row?.message_kind || row?.message_type || 'chat',
});

const matchesTopic = (text, topics) => {
  const normalized = text.toLowerCase();
  return topics.some((topic) => normalized.includes(topic));
};

const findFaqMatch = ({ faqs, text }) => {
  const normalized = text.toLowerCase();

  return faqs.find((faq) => (
    faq.question.toLowerCase().includes(normalized)
    || normalized.includes(faq.question.toLowerCase())
    || faq.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  )) || null;
};

const normalizeAiReply = (data) => {
  const replyText = data?.reply?.text || data?.text || '';

  return {
    text: replyText.trim(),
    source: data?.reply?.source || data?.source || 'ai',
    attachments: Array.isArray(data?.reply?.attachments) ? data.reply.attachments : [],
    actions: Array.isArray(data?.reply?.actions) ? data.reply.actions : [],
  };
};

const formatAddress = (profile, roleProfile) => (
  [
    roleProfile?.street,
    profile?.street,
    roleProfile?.barangay,
    profile?.barangay,
    roleProfile?.city,
    profile?.city,
    roleProfile?.province,
    profile?.province,
    roleProfile?.region,
    profile?.region,
    roleProfile?.country,
    profile?.country || 'Philippines',
  ]
    .filter(Boolean)
    .filter((value, index, source) => source.indexOf(value) === index)
    .join(', ')
);

const buildMapsSearchLink = (query) => (
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
);

const buildMapActions = (links = []) => (
  links.map((item, index) => ({
    id: `map-${index}-${item.label.toLowerCase().replace(/\s+/g, '-')}`,
    label: item.label,
    url: item.url,
  }))
);

const matchesLocationIntent = (text = '') => (
  matchesTopic(text, ['near me', 'nearby', 'near', 'location', 'map', 'maps', 'salon', 'drop-off', 'drop off', 'pickup point', 'collection point'])
);

const matchesImageIntent = (text = '') => {
  const normalized = text.toLowerCase();
  const imageCue = ['generate', 'create', 'show me', 'make', 'sample', 'preview', 'image', 'picture', 'photo', 'mockup', 'visual'];
  const subjectCue = ['wig', 'hair', 'hairstyle', 'style', 'look', 'cut'];
  return imageCue.some((cue) => normalized.includes(cue)) && subjectCue.some((cue) => normalized.includes(cue));
};

const extractLocationHint = (text = '') => {
  const match = text.match(/\b(?:near|around|in|at)\s+([a-z0-9\s,.-]{3,})/i);
  return match?.[1]?.trim() || '';
};

const buildMapLinks = ({ text, savedAddress, role }) => {
  const locationHint = extractLocationHint(text) || savedAddress;
  if (!locationHint) return [];

  const linkSets = [
    {
      label: 'Open suggested location',
      url: buildMapsSearchLink(locationHint),
    },
    {
      label: role === 'donor' ? 'Open nearby salons' : 'Open nearby support salons',
      url: buildMapsSearchLink(`${role === 'donor' ? 'salon' : 'wig salon'} near ${locationHint}`),
    },
    {
      label: role === 'donor' ? 'Open drop-off search' : 'Open support centers',
      url: buildMapsSearchLink(`${role === 'donor' ? 'hair donation drop-off' : 'cancer support salon'} near ${locationHint}`),
    },
  ];

  return linkSets;
};

const directChatReplySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string' },
        source: { type: 'string' },
      },
      required: ['text', 'source'],
    },
  },
  required: ['reply'],
};

const extractOpenAiErrorMessage = (payload = {}) => (
  payload?.error?.message
  || payload?.message
  || 'OpenAI request failed.'
);

const extractOpenAiOutputText = (payload = {}) => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const contentItems = Array.isArray(payload?.output)
    ? payload.output.flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    : [];

  const textItem = contentItems.find((item) => typeof item?.text === 'string' && item.text.trim());
  return textItem?.text?.trim() || '';
};

const buildSupportContextBundle = async ({ role, userId, text }) => {
  const supportContext = {
    savedAddress: '',
    mapLinks: [],
    latestScreeningSummary: '',
    latestDonorRecommendations: [],
    latestWigSummary: '',
    latestTrackingSummary: '',
  };

  const { profile, roleProfile } = await getProfileBundle(userId, role).catch(() => ({
    profile: null,
    roleProfile: null,
  }));

  supportContext.savedAddress = formatAddress(profile, roleProfile);

  if (role === 'donor') {
    const [{ data: latestSubmission }, { data: submissionRows }] = await Promise.all([
      fetchLatestHairSubmissionByUserId(userId).catch(() => ({ data: null })),
      fetchHairSubmissionsByUserId(userId, 1).catch(() => ({ data: [] })),
    ]);

    const latestScreening = submissionRows?.[0]?.ai_screenings?.[0] || null;
    supportContext.latestScreeningSummary = latestScreening
      ? [
        latestScreening.decision ? `Decision: ${latestScreening.decision}.` : '',
        latestScreening.summary || '',
        latestScreening.confidence_score != null
          ? `Confidence: ${Math.round(Number(latestScreening.confidence_score) * 100)}%.`
          : '',
      ].filter(Boolean).join(' ')
      : '';

    if (latestSubmission?.id) {
      const { data: recommendations } = await fetchDonorRecommendationsBySubmissionId(latestSubmission.id, 3)
        .catch(() => ({ data: [] }));

      supportContext.latestDonorRecommendations = (recommendations || [])
        .map((item) => item?.recommendation_text)
        .filter(Boolean);
    }

    if (matchesLocationIntent(text)) {
      const trackerResult = await getProcessTracking({ role: 'donor', userId }).catch(() => ({ tracker: null }));
      if (trackerResult?.tracker) {
        supportContext.latestTrackingSummary = trackerResult.tracker.summary?.helperText || trackerResult.tracker.summary?.label || '';
      }
    }
  }

  if (role === 'patient' && roleProfile?.id) {
    const [{ data: wigRequest }, { data: latestAllocation }] = await Promise.all([
      fetchLatestWigRequestByPatientDetailsId(roleProfile.id).catch(() => ({ data: null })),
      fetchLatestWigAllocationByPatientDetailsId(roleProfile.id).catch(() => ({ data: null })),
    ]);

    const wig = latestAllocation?.wigs;
    supportContext.latestWigSummary = [
      wig?.wig_name ? `Latest wig: ${wig.wig_name}.` : '',
      latestAllocation?.release_status ? `Release status: ${latestAllocation.release_status}.` : '',
      wigRequest?.notes || latestAllocation?.notes || '',
    ].filter(Boolean).join(' ');
  }

  if (matchesLocationIntent(text)) {
    supportContext.mapLinks = buildMapLinks({
      text,
      savedAddress: supportContext.savedAddress,
      role,
    });
  }

  return supportContext;
};

const buildSupportContextText = (supportContext = {}) => ([
  supportContext.savedAddress ? `Saved user location: ${supportContext.savedAddress}` : '',
  supportContext.latestScreeningSummary ? `Latest donor screening: ${supportContext.latestScreeningSummary}` : '',
  supportContext.latestDonorRecommendations?.length
    ? `Latest donor recommendations: ${supportContext.latestDonorRecommendations.join(' | ')}`
    : '',
  supportContext.latestWigSummary ? `Latest wig support summary: ${supportContext.latestWigSummary}` : '',
  supportContext.latestTrackingSummary ? `Latest tracking summary: ${supportContext.latestTrackingSummary}` : '',
].filter(Boolean).join('\n\n'));

const buildGeneratedImageAttachment = (payload = {}) => {
  const imageEntry = Array.isArray(payload?.data) ? payload.data[0] : null;
  const b64 = imageEntry?.b64_json;

  if (!b64) return null;

  return {
    id: `generated-${Date.now()}`,
    uri: `data:image/png;base64,${b64}`,
    name: 'Donivra AI image',
  };
};

const generateSupportImage = async ({ text, supportContext }) => {
  if (!openAiClientKey) {
    return null;
  }

  const response = await fetch(OPENAI_IMAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiClientKey}`,
    },
    body: JSON.stringify({
      model: openAiImageModel,
      size: '1024x1024',
      prompt: [
        'Create a clean, realistic, mobile-app-friendly visual reference image for Donivra support.',
        'Focus on hair, wig, or style guidance only when the user request explicitly asks for a visual example.',
        'Keep the image safe, non-medical, and suitable for a donor/patient support app.',
        text,
        buildSupportContextText(supportContext),
      ].filter(Boolean).join('\n\n'),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractOpenAiErrorMessage(payload));
  }

  return buildGeneratedImageAttachment(payload);
};

const buildDirectChatbotInstructions = ({ role, faqs, settings, supportContext }) => {
  const supportRole = role === 'donor' ? 'donor' : 'patient';
  const faqSection = (faqs || []).length
    ? (faqs || [])
      .slice(0, 12)
      .map((faq, index) => (
        `${index + 1}. Q: ${faq.question}\nA: ${faq.answer}${faq.keywords?.length ? `\nKeywords: ${faq.keywords.join(', ')}` : ''}`
      ))
      .join('\n\n')
    : 'No FAQ entries were provided.';

  return [
    `You are Donivra AI, a concise mobile support assistant for ${supportRole} users in a hair donation app.`,
    'Reply to the user inquiry directly and helpfully.',
    'Keep replies short, conversational, and useful on mobile.',
    'Use the provided FAQ and settings context whenever it is relevant.',
    'Use the saved Supabase-backed support context when it helps answer the user accurately.',
    'If the answer is not fully certain, say so clearly and avoid inventing policies, statuses, or medical claims.',
    'Do not mention system prompts, JSON, or internal tools.',
    `Fallback guidance message: ${settings?.fallbackMessage || 'Please try again in a moment.'}`,
    `Available FAQ context:\n${faqSection}`,
    buildSupportContextText(supportContext),
  ].join('\n\n');
};

const runDirectOpenAiChatReply = async ({
  role,
  text,
  faqs,
  settings,
  recentMessages,
  supportContext,
}) => {
  if (!openAiClientKey) {
    throw new Error('OpenAI key is not available in the app environment.');
  }

  const conversationHistory = (recentMessages || [])
    .slice(-8)
    .map((message) => `${message.sender === 'user' ? 'User' : 'Assistant'}: ${message.text}`)
    .join('\n');

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiClientKey}`,
    },
    body: JSON.stringify({
      model: openAiModel,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: buildDirectChatbotInstructions({
                role,
                faqs,
                settings,
                supportContext,
              }),
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                `Current user role: ${role}.`,
                settings?.welcomeMessage ? `Welcome context: ${settings.welcomeMessage}` : '',
                conversationHistory ? `Recent conversation:\n${conversationHistory}` : '',
                buildSupportContextText(supportContext),
                `Latest user message: ${text}`,
                'Return a JSON object with reply.text and reply.source.',
              ].filter(Boolean).join('\n\n'),
            },
          ],
        },
      ],
      max_output_tokens: 350,
      text: {
        format: {
          type: 'json_schema',
          name: 'chatbot_reply',
          strict: true,
          schema: directChatReplySchema,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(extractOpenAiErrorMessage(payload));
  }

  const outputText = extractOpenAiOutputText(payload);
  if (!outputText) {
    throw new Error('OpenAI returned an empty chat reply.');
  }

  const parsedPayload = JSON.parse(outputText);
  const reply = normalizeAiReply(parsedPayload);

  if (!reply.text) {
    throw new Error('The chatbot AI response was incomplete.');
  }

  if (supportContext?.mapLinks?.length) {
    reply.actions = [
      ...(Array.isArray(reply.actions) ? reply.actions : []),
      ...buildMapActions(supportContext.mapLinks),
    ];
  }

  if (matchesImageIntent(text)) {
    try {
      const generatedImage = await generateSupportImage({ text, supportContext });
      if (generatedImage) {
        reply.attachments = [generatedImage];
        reply.text = `${reply.text}\n\nI added a visual reference below based on your request.`.trim();
      }
    } catch (imageError) {
      logAppError('chatbot.generateSupportImage', imageError, {
        role,
        hasSavedAddress: Boolean(supportContext?.savedAddress),
      });
    }
  }

  return reply;
};

const invokeChatbotAiReply = async ({
  role,
  text,
  faqs,
  settings,
  recentMessages,
}) => {
  const { data, error } = await invokeEdgeFunction(chatbotAiFunctionName, {
    body: {
      role,
      message: text,
      faqs: (faqs || []).map((faq) => ({
        question: faq.question,
        answer: faq.answer,
        keywords: faq.keywords || [],
      })),
      settings: {
        welcomeMessage: settings?.welcomeMessage || '',
        fallbackMessage: settings?.fallbackMessage || '',
        quickSuggestions: settings?.quickSuggestions || [],
      },
      recent_messages: (recentMessages || []).slice(-6).map((message) => ({
        sender: message.sender,
        text: message.text,
        source: message.source,
      })),
    },
  });

  if (error) {
    throw error;
  }

  const reply = normalizeAiReply(data);
  if (!reply.text) {
    throw new Error('The chatbot AI response was incomplete.');
  }

  return reply;
};

const buildScreeningResultAnswer = async (userId) => {
  const { data, error } = await fetchHairSubmissionsByUserId(userId, 1);
  if (error) {
    throw new Error(error.message || 'Unable to load the latest screening result.');
  }

  const submission = data?.[0];
  const screening = Array.isArray(submission?.ai_screenings)
    ? submission.ai_screenings[0]
    : submission?.ai_screenings;

  if (!screening) {
    return 'I could not find a saved screening result yet. Try uploading hair photos first so the AI can review them.';
  }

  const confidence = screening.confidence_score != null
    ? `${Math.round(Number(screening.confidence_score) * 100)}%`
    : 'not available';

  return `Your latest screening result is ${screening.decision || 'still being reviewed'}. ${screening.summary || 'A detailed summary is not available yet.'} Confidence: ${confidence}.`;
};

const buildTrackingAnswer = async ({ role, userId }) => {
  const { tracker, error } = await getProcessTracking({ role, userId });
  if (error) {
    throw new Error(error);
  }

  if (!tracker) {
    return role === 'donor'
      ? 'I could not find a donation record yet. Save a hair submission first and the status tracker will appear.'
      : 'I could not find a wig request record yet. Save a wig request first and the status tracker will appear.';
  }

  const currentStep = tracker.steps.find((step) => step.state === 'current' || step.state === 'attention')
    || tracker.steps.find((step) => step.state === 'completed')
    || tracker.steps[0];

  return `${tracker.summary.label}. ${currentStep?.title || 'Current step'}: ${currentStep?.description || 'No extra details yet.'}`;
};

const buildLogisticsAnswer = async (userId) => {
  const { tracker, error } = await getProcessTracking({ role: 'donor', userId });
  if (error) {
    throw new Error(error);
  }

  if (!tracker) {
    return 'I could not find any logistics record yet. Logistics details will appear after a donor submission is saved and transport updates are added.';
  }

  const logisticsStep = tracker.steps.find((step) => step.key === 'logistics');
  return `${logisticsStep?.label || 'Waiting for logistics'}. ${logisticsStep?.description || 'Pickup or courier details are not available yet.'}`;
};

const buildWigRequestAnswer = async (userId) => (
  await buildTrackingAnswer({ role: 'patient', userId })
);

const buildPostRequestAnswer = async (userId) => {
  const { tracker } = await getProcessTracking({ role: 'patient', userId });
  if (!tracker) {
    return 'After you save a wig request, it is linked to your patient record and the request status tracker starts showing progress updates.';
  }

  return `After the request is saved, the next visible step is ${tracker.steps[1]?.title || 'preference review'}. The tracker will keep updating as the wig record and allocation move forward.`;
};

const persistConversationToBackend = async ({
  role,
  userId,
  conversationId,
  messages,
}) => {
  try {
    let resolvedConversationId = conversationId;

    if (!resolvedConversationId) {
      const conversationPayload = {
        user_id: userId,
        role,
        title: role === 'donor' ? 'Donor quick inquiries' : 'Patient quick inquiries',
        updated_at: new Date().toISOString(),
      };

      const conversationResult = await ChatbotAPI.createChatbotConversation(conversationPayload);
      if (conversationResult.error) {
        throw new Error(conversationResult.error.message);
      }

      resolvedConversationId = conversationResult.data?.id || null;
    } else {
      await ChatbotAPI.updateChatbotConversation(resolvedConversationId, {
        updated_at: new Date().toISOString(),
      });
    }

    if (!resolvedConversationId || !messages.length) {
      return {
        conversationId: resolvedConversationId,
        error: null,
      };
    }

    const rows = messages.map((message) => ({
      conversation_id: resolvedConversationId,
      sender_role: message.sender,
      message_text: message.text,
      message_kind: message.source || 'chat',
    }));

    const insertResult = await ChatbotAPI.createChatbotMessages(rows);
    if (insertResult.error) {
      throw new Error(insertResult.error.message);
    }

    return {
      conversationId: resolvedConversationId,
      error: null,
    };
  } catch (error) {
    if (!isMissingChatTableError(error)) {
      logAppError('chatbot.persistConversationToBackend', error, {
        role,
        userId,
        conversationId,
        messageCount: messages?.length || 0,
      });
    }

    return {
      conversationId,
      error: isMissingChatTableError(error)
        ? null
        : 'Your messages may not be saved right now.',
    };
  }
};

export const loadChatbotBootstrap = async ({ userId, role }) => {
  const defaultSettings = normalizeSettings(null);

  try {
    const [
      settingsResult,
      faqResult,
      conversationResult,
    ] = await Promise.all([
      ChatbotAPI.fetchChatbotSettings().catch(() => ({ data: null, error: null })),
      ChatbotAPI.fetchChatbotFaqs().catch(() => ({ data: [], error: null })),
      ChatbotAPI.fetchLatestChatbotConversation({ userId, role }).catch(() => ({ data: null, error: null })),
    ]);

    const settings = normalizeSettings(settingsResult.data);
    const faqs = (faqResult.data || []).map(normalizeFaq).filter((faq) => faq.question && faq.answer);
    let messages = [];
    let conversationId = conversationResult.data?.id || null;

    if (conversationId) {
      const messageResult = await ChatbotAPI.fetchChatbotMessages(conversationId).catch(() => ({ data: [], error: null }));
      const serverMessages = (messageResult.data || []).map(normalizeMessage).filter((message) => message.text);

      if (serverMessages.length) {
        messages = serverMessages;
      }
    }

    if (!messages.length) {
      messages = buildBootstrapConversation(settings);
    }

    return {
      settings,
      faqs,
      quickSuggestions: settings.quickSuggestions || [],
      conversationId,
      messages,
      error: null,
    };
  } catch (error) {
    logAppError('chatbot.loadChatbotBootstrap', error, {
      role,
      userId,
    });

    const messages = buildBootstrapConversation(defaultSettings);

    return {
      settings: defaultSettings,
      faqs: [],
      quickSuggestions: [],
      conversationId: null,
      messages,
      error: 'We could not open the chat right now. Please try again.',
    };
  }
};

export const resolveChatbotReply = async ({
  role,
  userId,
  text,
  faqs,
  settings,
  recentMessages = [],
}) => {
  const trimmedText = text.trim();
  const faqMatch = findFaqMatch({ faqs, text: trimmedText });

  if (faqMatch) {
    return {
      text: faqMatch.answer,
      source: 'faq',
    };
  }

  if (role === 'donor' && matchesTopic(trimmedText, ['screening', 'analysis result', 'screening result', 'ai result'])) {
    return {
      text: await buildScreeningResultAnswer(userId),
      source: 'status',
    };
  }

  if (role === 'donor' && matchesTopic(trimmedText, ['submission status', 'donation status', 'track submission', 'track donation', 'status'])) {
    return {
      text: await buildTrackingAnswer({ role: 'donor', userId }),
      source: 'status',
    };
  }

  if (role === 'patient' && matchesTopic(trimmedText, ['wig request status', 'wig status', 'request status', 'allocation status', 'status'])) {
    return {
      text: await buildWigRequestAnswer(userId),
      source: 'status',
    };
  }

  if (matchesTopic(trimmedText, ['logistics', 'pickup', 'courier', 'delivery'])) {
    return {
      text: await buildLogisticsAnswer(userId),
      source: 'status',
    };
  }

  if (role === 'patient' && matchesTopic(trimmedText, ['after i save', 'after request', 'next after wig request'])) {
    return {
      text: await buildPostRequestAnswer(userId),
      source: 'faq',
    };
  }

  const supportContext = await buildSupportContextBundle({
    role,
    userId,
    text: trimmedText,
  }).catch(() => ({
    savedAddress: '',
    mapLinks: [],
    latestScreeningSummary: '',
    latestDonorRecommendations: [],
    latestWigSummary: '',
    latestTrackingSummary: '',
  }));

  try {
    if (openAiClientKey) {
      return await runDirectOpenAiChatReply({
        role,
        text: trimmedText,
        faqs,
        settings,
        recentMessages,
        supportContext,
      });
    }

    return await invokeChatbotAiReply({
      role,
      text: trimmedText,
      faqs,
      settings,
      recentMessages,
    });
  } catch (error) {
    const errorMessage = (await extractFunctionErrorMessage(error)).toLowerCase();

    if (
      !errorMessage.includes('requested function was not found')
      && !errorMessage.includes('not_found')
    ) {
      logAppError('chatbot.resolveChatbotReply', error, {
        role,
        userId,
        functionName: chatbotAiFunctionName,
      });
    }

    return {
      text: errorMessage.includes('requested function was not found') || errorMessage.includes('not_found')
        ? [
          'Chat support is still being connected on the server.',
          supportContext.mapLinks?.length ? 'You can still open a suggested location below.' : '',
        ].filter(Boolean).join('\n\n')
        : settings?.fallbackMessage || 'I could not answer that right now. Please try again in a moment.',
      source: 'fallback',
      attachments: [],
      actions: buildMapActions(supportContext.mapLinks || []),
    };
  }
};

export const appendChatbotMessages = async ({
  role,
  userId,
  conversationId,
  existingMessages,
  newMessages,
}) => {
  const mergedMessages = [...existingMessages, ...newMessages];

  const persistenceResult = await persistConversationToBackend({
    role,
    userId,
    conversationId,
    messages: newMessages,
  });

  return {
    messages: mergedMessages,
    conversationId: persistenceResult.conversationId,
    persistenceError: persistenceResult.error,
  };
};
