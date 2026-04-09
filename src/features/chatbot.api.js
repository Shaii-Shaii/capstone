import { supabase } from '../api/supabase/client';
import { resolveDatabaseUserId } from './profile/api/profile.api';
import { logAppError, logAppEvent } from '../utils/appErrors';

const chatbotSettingsTable = 'Chatbot_Settings';
const chatbotFaqsTable = 'Chatbot_FAQS';
const chatbotConversationsTable = 'Chatbot_Conversations';
const chatbotMessagesTable = 'Chatbot_Messages';

const chatbotSettingsSelect = `
  chatbot_settings_id:Chatbot_Settings_ID,
  welcome_message:Welcome_Message,
  fallback_message:Fallback_Message,
  is_chatbot_enabled:Is_Chatbot_Enabled,
  updated_by:Updated_By,
  updated_at:Updated_At
`;

const chatbotFaqSelect = `
  faq_id:FAQ_ID,
  question:Question,
  answer:Answer,
  category:Category,
  priority_order:Priority_Order,
  is_active:Is_Active,
  created_by:Created_By,
  created_at:Created_At,
  updated_at:Updated_At
`;

const chatbotConversationSelect = `
  conversation_id:Conversation_ID,
  user_id:User_ID,
  title:Title,
  status:Status,
  created_at:Created_At,
  updated_at:Updated_At
`;

const chatbotMessageSelect = `
  message_id:Message_ID,
  conversation_id:Conversation_ID,
  sender_type:Sender_Type,
  message_text:Message_Text,
  created_at:Created_At
`;

const logChatbotQuery = (source, extras = {}) => {
  logAppEvent('chatbot.query', 'Chatbot query started.', {
    source,
    ...extras,
  });
};

const resolveChatUserId = async (userId) => {
  const result = await resolveDatabaseUserId(userId, { ensure: false });
  if (result.error || !result.data) {
    return {
      userId: null,
      error: result.error || new Error('The logged-in account is not linked to a chat profile.'),
    };
  }

  return {
    userId: result.data,
    error: null,
  };
};

const normalizeConversation = (row) => ({
  id: row?.conversation_id || null,
  conversation_id: row?.conversation_id || null,
  user_id: row?.user_id || null,
  title: row?.title || '',
  status: row?.status || 'Active',
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
});

const normalizeMessage = (row) => ({
  id: row?.message_id || null,
  message_id: row?.message_id || null,
  conversation_id: row?.conversation_id || null,
  sender_type: row?.sender_type || '',
  message_text: row?.message_text || '',
  created_at: row?.created_at || null,
});

export const fetchChatbotSettings = async () => (
  (logChatbotQuery('fetchChatbotSettings', {
    table: chatbotSettingsTable,
    phase: 'bootstrap',
    columns: ['Chatbot_Settings_ID', 'Welcome_Message', 'Fallback_Message', 'Is_Chatbot_Enabled', 'Updated_By', 'Updated_At'],
  }),
  await supabase
    .from(chatbotSettingsTable)
    .select(chatbotSettingsSelect)
    .limit(1)
    .maybeSingle())
);

export const fetchChatbotFaqs = async () => (
  (logChatbotQuery('fetchChatbotFaqs', {
    table: chatbotFaqsTable,
    phase: 'bootstrap',
    filters: { Is_Active: true },
    columns: ['FAQ_ID', 'Question', 'Answer', 'Category', 'Priority_Order', 'Is_Active'],
  }),
  await supabase
    .from(chatbotFaqsTable)
    .select(chatbotFaqSelect)
    .eq('Is_Active', true)
    .order('Priority_Order', { ascending: true })
    .limit(30))
);

export const fetchLatestChatbotConversation = async ({ userId }) => {
  const resolvedUser = await resolveChatUserId(userId);
  if (resolvedUser.error) {
    return { data: null, error: resolvedUser.error };
  }

  logChatbotQuery('fetchLatestChatbotConversation', {
    table: chatbotConversationsTable,
    phase: 'bootstrap',
    filters: { User_ID: resolvedUser.userId },
    columns: ['Conversation_ID', 'User_ID', 'Title', 'Status', 'Created_At', 'Updated_At'],
  });

  const result = await supabase
    .from(chatbotConversationsTable)
    .select(chatbotConversationSelect)
    .eq('User_ID', resolvedUser.userId)
    .order('Updated_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeConversation(result.data) : null,
    error: result.error,
  };
};

export const createChatbotConversation = async (payload) => {
  const resolvedUser = await resolveChatUserId(payload?.user_id);
  if (resolvedUser.error) {
    return { data: null, error: resolvedUser.error };
  }

  logChatbotQuery('createChatbotConversation', {
    table: chatbotConversationsTable,
    phase: 'create',
    filters: { User_ID: resolvedUser.userId },
    columns: ['User_ID', 'Title', 'Status', 'Updated_At'],
  });

  const result = await supabase
    .from(chatbotConversationsTable)
    .insert([{
      User_ID: resolvedUser.userId,
      Title: payload?.title || 'Support conversation',
      Status: payload?.status || 'Active',
      Updated_At: payload?.updated_at || new Date().toISOString(),
    }])
    .select(chatbotConversationSelect)
    .single();

  return {
    data: result.data ? normalizeConversation(result.data) : null,
    error: result.error,
  };
};

export const updateChatbotConversation = async (conversationId, updates) => {
  logChatbotQuery('updateChatbotConversation', {
    table: chatbotConversationsTable,
    phase: 'update',
    filters: { Conversation_ID: conversationId },
    columns: ['Title', 'Status', 'Updated_At'],
  });

  const result = await supabase
    .from(chatbotConversationsTable)
    .update({
      Title: updates?.title ?? undefined,
      Status: updates?.status ?? undefined,
      Updated_At: updates?.updated_at || new Date().toISOString(),
    })
    .eq('Conversation_ID', conversationId)
    .select(chatbotConversationSelect)
    .maybeSingle();

  return {
    data: result.data ? normalizeConversation(result.data) : null,
    error: result.error,
  };
};

export const fetchChatbotMessages = async (conversationId) => {
  logChatbotQuery('fetchChatbotMessages', {
    table: chatbotMessagesTable,
    phase: 'bootstrap',
    filters: { Conversation_ID: conversationId },
    columns: ['Message_ID', 'Conversation_ID', 'Sender_Type', 'Message_Text', 'Created_At'],
  });

  const result = await supabase
    .from(chatbotMessagesTable)
    .select(chatbotMessageSelect)
    .eq('Conversation_ID', conversationId)
    .order('Created_At', { ascending: true })
    .limit(80);

  return {
    data: (result.data || []).map(normalizeMessage),
    error: result.error,
  };
};

export const createChatbotMessages = async (rows) => {
  const insertRows = rows.map((row) => ({
    Conversation_ID: row?.conversation_id || null,
    Sender_Type: row?.sender_type || null,
    Message_Text: row?.message_text || null,
  }));

  logChatbotQuery('createChatbotMessages', {
    table: chatbotMessagesTable,
    phase: 'create',
    rowCount: insertRows.length,
    columns: ['Conversation_ID', 'Sender_Type', 'Message_Text'],
  });

  const result = await supabase
    .from(chatbotMessagesTable)
    .insert(insertRows)
    .select(chatbotMessageSelect);

  if (result.error) {
    logAppError('chatbot.query.createChatbotMessages', result.error, {
      table: chatbotMessagesTable,
      phase: 'create',
      rowCount: insertRows.length,
    });
  }

  return {
    data: (result.data || []).map(normalizeMessage),
    error: result.error,
  };
};
