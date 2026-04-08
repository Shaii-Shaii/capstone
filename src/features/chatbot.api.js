import { supabase } from '../api/supabase/client';
import { resolveDatabaseUserId } from './profile/api/profile.api';

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
  await supabase
    .from('chatbot_settings')
    .select('*')
    .limit(1)
    .maybeSingle()
);

export const fetchChatbotFaqs = async () => (
  await supabase
    .from('chatbot_faqs')
    .select('*')
    .eq('is_active', true)
    .order('priority_order', { ascending: true })
    .limit(30)
);

export const fetchLatestChatbotConversation = async ({ userId }) => {
  const resolvedUser = await resolveChatUserId(userId);
  if (resolvedUser.error) {
    return { data: null, error: resolvedUser.error };
  }

  const result = await supabase
    .from('chatbot_conversations')
    .select('*')
    .eq('user_id', resolvedUser.userId)
    .order('updated_at', { ascending: false })
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

  const result = await supabase
    .from('chatbot_conversations')
    .insert([{
      user_id: resolvedUser.userId,
      title: payload?.title || 'Support conversation',
      status: payload?.status || 'Active',
      updated_at: payload?.updated_at || new Date().toISOString(),
    }])
    .select('*')
    .single();

  return {
    data: result.data ? normalizeConversation(result.data) : null,
    error: result.error,
  };
};

export const updateChatbotConversation = async (conversationId, updates) => {
  const result = await supabase
    .from('chatbot_conversations')
    .update({
      title: updates?.title ?? undefined,
      status: updates?.status ?? undefined,
      updated_at: updates?.updated_at || new Date().toISOString(),
    })
    .eq('conversation_id', conversationId)
    .select('*')
    .maybeSingle();

  return {
    data: result.data ? normalizeConversation(result.data) : null,
    error: result.error,
  };
};

export const fetchChatbotMessages = async (conversationId) => {
  const result = await supabase
    .from('chatbot_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(80);

  return {
    data: (result.data || []).map(normalizeMessage),
    error: result.error,
  };
};

export const createChatbotMessages = async (rows) => {
  const result = await supabase
    .from('chatbot_messages')
    .insert(rows)
    .select('*');

  return {
    data: (result.data || []).map(normalizeMessage),
    error: result.error,
  };
};
