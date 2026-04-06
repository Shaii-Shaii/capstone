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
    .order('priority_order', { ascending: true })
    .limit(30)
);

export const fetchLatestChatbotConversation = async ({ userId, role }) => {
  const resolvedUser = await resolveChatUserId(userId);
  if (resolvedUser.error) {
    return { data: null, error: resolvedUser.error };
  }

  return await supabase
    .from('chatbot_conversations')
    .select('*')
    .eq('user_id', resolvedUser.userId)
    .eq('role', role)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
};

export const createChatbotConversation = async (payload) => {
  const resolvedUser = await resolveChatUserId(payload?.user_id);
  if (resolvedUser.error) {
    return { data: null, error: resolvedUser.error };
  }

  return await supabase
    .from('chatbot_conversations')
    .insert([{
      ...payload,
      user_id: resolvedUser.userId,
    }])
    .select()
    .single();
};

export const updateChatbotConversation = async (conversationId, updates) => (
  await supabase
    .from('chatbot_conversations')
    .update(updates)
    .eq('id', conversationId)
    .select()
    .maybeSingle()
);

export const fetchChatbotMessages = async (conversationId) => (
  await supabase
    .from('chatbot_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(80)
);

export const createChatbotMessages = async (rows) => (
  await supabase
    .from('chatbot_messages')
    .insert(rows)
    .select()
);
