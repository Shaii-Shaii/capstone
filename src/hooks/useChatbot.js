import { useCallback, useEffect, useState } from 'react';
import {
  appendChatbotMessages,
  loadChatbotBootstrap,
  resolveChatbotReply,
} from '../features/chatbot.service';
import { getErrorMessage, logAppError } from '../utils/appErrors';

const buildChatMessage = ({
  sender,
  text,
  source = 'chat',
  attachments = [],
  actions = [],
  inputMode = 'text',
}) => ({
  id: `${sender}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  sender,
  text,
  source,
  createdAt: new Date().toISOString(),
  attachments,
  actions,
  inputMode,
});

export const useChatbot = ({ role, userId }) => {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [settings, setSettings] = useState(null);
  const [faqs, setFaqs] = useState([]);
  const [quickSuggestions, setQuickSuggestions] = useState([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatError, setChatError] = useState(null);

  const getChatUserError = (type, error) => {
    const message = getErrorMessage(error).toLowerCase();

    if (type === 'load') {
      return 'We could not open the chat right now. Please try again.';
    }

    if (type === 'send' && message.includes('empty')) {
      return 'Please enter a message first.';
    }

    if (type === 'send' && message.includes('generate a reply')) {
      return 'We could not generate a reply right now.';
    }

    if (type === 'save') {
      return 'Your message was sent, but chat history may not update right away.';
    }

    return 'We could not send your message right now. Please try again.';
  };

  const refreshChat = useCallback(async () => {
    if (!role || !userId) return;

    setIsLoadingChat(true);
    const result = await loadChatbotBootstrap({ role, userId });
    setIsLoadingChat(false);

    setSettings(result.settings);
    setFaqs(result.faqs);
    setQuickSuggestions(result.quickSuggestions);
    setMessages(result.messages);
    setConversationId(result.conversationId);
    setChatError(result.error ? getChatUserError('load', result.error) : null);
  }, [role, userId]);

  useEffect(() => {
    refreshChat();
  }, [refreshChat]);

  const sendMessage = async (payload) => {
    const text = typeof payload === 'string' ? payload : payload?.text || '';
    const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
    const inputMode = payload?.inputMode || 'text';
    const trimmedText = text.trim();
    if (!trimmedText || !settings) {
      return { success: false, error: getChatUserError('send', 'empty') };
    }

    setIsSendingMessage(true);
    setChatError(null);

    try {
      const userMessage = buildChatMessage({
        sender: 'user',
        text: trimmedText,
        source: 'question',
        attachments,
        inputMode,
      });

      const userAppendResult = await appendChatbotMessages({
        role,
        userId,
        conversationId,
        existingMessages: messages,
        newMessages: [userMessage],
      });

      setMessages(userAppendResult.messages);
      setConversationId(userAppendResult.conversationId);

      const reply = await resolveChatbotReply({
        role,
        userId,
        text: trimmedText,
        faqs,
        settings,
        recentMessages: userAppendResult.messages,
      });

      const assistantMessage = buildChatMessage({
        sender: 'assistant',
        text: reply.text,
        source: reply.source,
        attachments: Array.isArray(reply.attachments) ? reply.attachments : [],
        actions: Array.isArray(reply.actions) ? reply.actions : [],
      });

      const replyAppendResult = await appendChatbotMessages({
        role,
        userId,
        conversationId: userAppendResult.conversationId,
        existingMessages: userAppendResult.messages,
        newMessages: [assistantMessage],
      });

      setMessages(replyAppendResult.messages);
      setConversationId(replyAppendResult.conversationId);

      if (replyAppendResult.persistenceError) {
        setChatError(getChatUserError('save', replyAppendResult.persistenceError));
      }

      setIsSendingMessage(false);

      return {
        success: true,
        messages: replyAppendResult.messages,
      };
    } catch (error) {
      logAppError('chatbot.sendMessage', error, {
        role,
        userId,
        hasConversationId: Boolean(conversationId),
      });

      const userMessage = getChatUserError('send', error);
      setIsSendingMessage(false);
      setChatError(userMessage);
      return {
        success: false,
        error: userMessage,
      };
    }
  };

  return {
    messages,
    quickSuggestions,
    isLoadingChat,
    isSendingMessage,
    chatError,
    refreshChat,
    sendMessage,
  };
};
