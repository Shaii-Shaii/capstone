import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AppIcon } from '../ui/AppIcon';
import { StatusBanner } from '../ui/StatusBanner';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ChatQuickSuggestions } from './ChatQuickSuggestions';
import { useChatbot } from '../../hooks/useChatbot';
import { theme } from '../../design-system/theme';
import chatbotIcon from '../../assets/images/chatbot_icon.png';
import { useAuth } from '../../providers/AuthProvider';

const MAX_ATTACHMENTS = 3;
const IMAGE_MEDIA_TYPES = ['images'];
const DEFAULT_DONOR_SUGGESTIONS = [
  'Eligibility Check',
  'Hair length guide',
  'How to cut hair',
  'Donation FAQs',
  'Status check',
];

const buildAttachmentName = (asset, index) => (
  asset?.fileName
  || asset?.assetId
  || `Image ${index + 1}`
);

const normalizeAttachmentAssets = (assets = []) => (
  assets
    .filter((asset) => asset?.uri)
    .map((asset, index) => ({
      id: asset.assetId || `${asset.uri}-${index}`,
      uri: asset.uri,
      name: buildAttachmentName(asset, index),
    }))
);

export function ChatbotSupportPanel({ role, userId, variant = 'screen' }) {
  const { resolvedTheme } = useAuth();
  const scrollRef = useRef(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [composerNotice, setComposerNotice] = useState(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const {
    messages,
    quickSuggestions,
    isLoadingChat,
    isSendingMessage,
    chatError,
    refreshChat,
    sendMessage,
  } = useChatbot({ role, userId });

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd?.({ animated: true });
    }, 60);

    return () => clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const isModal = variant === 'modal';
  const Container = isModal ? View : KeyboardAvoidingView;
  const suggestionsToShow = quickSuggestions?.length ? quickSuggestions : (role === 'donor' ? DEFAULT_DONOR_SUGGESTIONS : []);
  const shouldShowSuggestions = Boolean(suggestionsToShow.length);
  const shouldRenderSuggestions = shouldShowSuggestions && !(isModal && isKeyboardVisible);
  const hasComposerValue = Boolean(draftMessage.trim() || attachments.length);
  const roleCopy = role === 'donor'
    ? 'Hair donation guidance, screening answers, and status help.'
    : 'Support answers, request guidance, and patient status help.';
  const assistantLabel = resolvedTheme?.brandName ? `${resolvedTheme.brandName} AI` : 'AI Assistant';
  const containerProps = !isModal
    ? {
      behavior: Platform.OS === 'ios' ? 'padding' : 'height',
      keyboardVerticalOffset: 0,
    }
    : {};

  const handleSend = async (presetMessage) => {
    const typedMessage = presetMessage || draftMessage;
    const trimmedMessage = typedMessage.trim();
    const attachmentNote = attachments.length
      ? `Attached file${attachments.length > 1 ? 's' : ''}: ${attachments.map((item) => item.name).join(', ')}.`
      : '';
    const messageText = [trimmedMessage, attachmentNote].filter(Boolean).join('\n\n');

    const result = await sendMessage({
      text: messageText,
      attachments,
      inputMode: attachments.length ? 'attachment' : 'text',
    });

    if (result?.success && !presetMessage) {
      setDraftMessage('');
      setAttachments([]);
      setComposerNotice(null);
    }
  };

  const handlePickAttachment = async () => {
    setComposerNotice(null);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setComposerNotice({
          title: 'Photo Access Needed',
          message: 'Allow photo library access first so you can attach an image to your chat message.',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: IMAGE_MEDIA_TYPES,
        allowsMultipleSelection: true,
        quality: 0.7,
        selectionLimit: MAX_ATTACHMENTS,
      });

      if (result.canceled) return;

      const selectedAttachments = normalizeAttachmentAssets(result.assets).slice(0, MAX_ATTACHMENTS);

      if (!selectedAttachments.length) {
        setComposerNotice({
          title: 'No File Added',
          message: 'Please choose an image again if you want to attach a visual reference.',
        });
        return;
      }

      setAttachments(selectedAttachments);
      setComposerNotice({
        title: 'Image Ready',
        message: 'Your selected image will be sent with the next chat message as a visual reference.',
      });
    } catch (_error) {
      setComposerNotice({
        title: 'Attachment Failed',
        message: 'The image could not be attached right now. Please try again.',
      });
    }
  };

  const handleVoicePress = () => {
    setComposerNotice({
      title: 'Voice Input',
      message: 'The microphone button is available in the chat UI, but audio recording is not enabled in this build yet. Please type your message or attach an image for now.',
    });
  };

  const removeAttachment = (attachmentId) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  };

  return (
    <Container
      style={[styles.wrapper, isModal ? styles.wrapperModal : null]}
      {...containerProps}
    >
      {!isModal ? (
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroBotPill}>
              <View style={styles.heroBotAvatarWrap}>
                <Image source={chatbotIcon} style={styles.heroBotAvatar} resizeMode="contain" />
              </View>
              <View style={styles.heroBotCopy}>
                <Text style={styles.heroBotName}>{assistantLabel}</Text>
                <Text style={styles.heroBotRole}>{role === 'donor' ? 'Donor Support' : 'Patient Support'}</Text>
              </View>
            </View>

            <Pressable onPress={refreshChat} style={styles.heroActionButton}>
              <AppIcon name="refresh" state="muted" size="sm" />
            </Pressable>
          </View>
          <Text style={styles.heroBody}>{roleCopy}</Text>
        </View>
      ) : null}

      {shouldRenderSuggestions ? (
        <View style={[styles.suggestionBlock, isModal ? styles.suggestionBlockModal : null]}>
          <ChatQuickSuggestions
            suggestions={suggestionsToShow}
            disabled={isSendingMessage}
            onSelect={handleSend}
          />
        </View>
      ) : null}

      {composerNotice ? (
        <StatusBanner
          message={composerNotice.message}
          variant="info"
          title={composerNotice.title}
          style={styles.banner}
        />
      ) : null}

      {chatError ? (
        <StatusBanner
          message={chatError}
          variant="info"
          title="Chat update"
          style={styles.banner}
        />
      ) : null}

      {isLoadingChat ? (
        <StatusBanner
          message="Loading your recent conversation and suggestions."
          variant="info"
          title={`Opening ${assistantLabel}`}
          style={styles.banner}
        />
      ) : null}

      <View style={[styles.chatShell, isModal ? styles.chatShellModal : null]}>
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={[
            styles.messageContent,
            isModal ? styles.messageContentModal : null,
            isModal && isKeyboardVisible ? styles.messageContentModalKeyboard : null,
            !messages.length ? styles.messageContentEmpty : null,
            isModal && !messages.length ? styles.messageContentEmptyModal : null,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {messages.length ? (
            messages.map((message) => (
              <ChatMessageBubble key={message.id} message={message} />
            ))
          ) : (
            <View style={[styles.emptyState, isModal ? styles.emptyStateModal : null]}>
              <View style={styles.welcomeBubbleRow}>
                <View style={styles.welcomeAvatarWrap}>
                  <Image
                    source={chatbotIcon}
                    style={[styles.emptyIcon, isModal ? styles.emptyIconModal : null]}
                    resizeMode="contain"
                  />
                </View>

                <View style={styles.welcomeBubble}>
                  <Text style={[styles.emptyTitle, isModal ? styles.emptyTitleModal : null]}>
                    {assistantLabel} is ready to help
                  </Text>
                  <Text style={[styles.emptyBody, isModal ? styles.emptyBodyModal : null]}>
                    Ask about donation requirements, eligibility, next steps, or your latest donation update.
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </View>

      {attachments.length ? (
        <View style={[styles.attachmentTray, isModal ? styles.attachmentTrayModal : null]}>
          {attachments.map((attachment) => (
            <View key={attachment.id} style={styles.attachmentChip}>
              <Image source={{ uri: attachment.uri }} style={styles.attachmentPreview} resizeMode="cover" />
              <Text numberOfLines={1} style={styles.attachmentName}>{attachment.name}</Text>
              <Pressable onPress={() => removeAttachment(attachment.id)} style={styles.attachmentRemove}>
                <AppIcon name="close" state="inverse" size="sm" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.composerCard, isModal ? styles.composerCardModal : null]}>
        <View style={[styles.composerRow, isModal ? styles.composerRowModal : null]}>
          <Pressable onPress={handlePickAttachment} style={[styles.composerButton, isModal ? styles.composerButtonModal : null]}>
            <AppIcon name="paperclip" state="muted" />
          </Pressable>

          <View style={[styles.composerInputWrap, isModal ? styles.composerInputWrapModal : null]}>
            <TextInput
              style={[styles.composerInput, isModal ? styles.composerInputModal : null]}
              placeholder={role === 'donor' ? 'Ask about your hair donation...' : 'Ask about your request or support...'}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              value={draftMessage}
              onChangeText={setDraftMessage}
              editable={!isSendingMessage}
            />
          </View>

          <Pressable onPress={handleVoicePress} style={[styles.composerButton, isModal ? styles.composerButtonModal : null]}>
            <AppIcon name="microphone-outline" state="muted" />
          </Pressable>

          <Pressable
            disabled={!hasComposerValue || isSendingMessage}
            onPress={() => handleSend()}
            style={({ pressed }) => [
              styles.sendButton,
              isModal ? styles.sendButtonModal : null,
              (!hasComposerValue || isSendingMessage) ? styles.sendButtonDisabled : null,
              pressed && hasComposerValue && !isSendingMessage ? styles.sendButtonPressed : null,
            ]}
          >
            {isSendingMessage ? (
              <ActivityIndicator color={theme.colors.textInverse} />
            ) : (
              <AppIcon name="send-outline" state="inverse" />
            )}
          </Pressable>
        </View>

        {!isModal ? (
          <Text style={styles.composerHelper}>
            Type a message, attach an image, or tap the mic button for future voice input.
          </Text>
        ) : null}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing.md,
  },
  wrapperModal: {
    gap: theme.spacing.xs,
    flex: 1,
    minHeight: 0,
  },
  suggestionBlock: {
    gap: theme.spacing.xs,
  },
  suggestionBlockModal: {
    gap: 0,
    paddingHorizontal: theme.spacing.xs,
  },
  banner: {
    marginTop: 0,
  },
  heroCard: {
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
    gap: theme.spacing.sm,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  heroBotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.72)',
    flex: 1,
  },
  heroBotAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  heroBotAvatar: {
    width: 26,
    height: 26,
  },
  heroBotCopy: {
    gap: 1,
    flex: 1,
  },
  heroBotName: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  heroBotRole: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textSecondary,
  },
  heroActionButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  heroBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  chatShell: {
    minHeight: 280,
    maxHeight: 360,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: '#fbf9fb',
    overflow: 'hidden',
  },
  chatShellModal: {
    flex: 1,
    minHeight: 260,
    maxHeight: undefined,
    borderRadius: theme.radius.xl,
    backgroundColor: '#fcfafb',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  messageContentModal: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  messageContentModalKeyboard: {
    paddingTop: theme.spacing.xs,
  },
  messageContentEmpty: {
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  messageContentEmptyModal: {
    justifyContent: 'flex-start',
    paddingTop: theme.spacing.xs,
  },
  emptyState: {
    justifyContent: 'flex-start',
    paddingHorizontal: theme.spacing.xs,
  },
  emptyStateModal: {
    paddingVertical: theme.spacing.xs,
  },
  emptyIcon: {
    width: 48,
    height: 48,
  },
  emptyIconModal: {
    width: 42,
    height: 42,
  },
  emptyTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  emptyTitleModal: {
    textAlign: 'left',
  },
  emptyBody: {
    textAlign: 'left',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  emptyBodyModal: {
    maxWidth: undefined,
  },
  welcomeBubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  welcomeAvatarWrap: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    marginBottom: 6,
  },
  welcomeBubble: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 20,
    borderBottomLeftRadius: 8,
    backgroundColor: '#f8eef0',
    borderWidth: 1,
    borderColor: theme.colors.brandPrimaryMuted,
  },
  attachmentTray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  attachmentTrayModal: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
  },
  attachmentChip: {
    position: 'relative',
    width: 92,
    gap: 4,
    padding: 6,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  attachmentPreview: {
    width: '100%',
    height: 74,
    borderRadius: theme.radius.md,
  },
  attachmentName: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    color: theme.colors.textPrimary,
  },
  attachmentRemove: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.textPrimary,
  },
  composerCard: {
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  composerCardModal: {
    paddingHorizontal: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
    marginTop: 0,
    borderRadius: 0,
    backgroundColor: theme.colors.transparent,
    borderWidth: 0,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
  composerRowModal: {
    alignItems: 'center',
    padding: theme.spacing.xs,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  composerButton: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  composerButtonModal: {
    width: 38,
    height: 38,
  },
  composerInputWrap: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceSoft,
    justifyContent: 'center',
  },
  composerInputWrapModal: {
    minHeight: 42,
    maxHeight: 112,
    paddingVertical: 4,
  },
  composerInput: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textPrimary,
    paddingVertical: 6,
    minHeight: 24,
  },
  composerInputModal: {
    fontSize: theme.typography.semantic.bodySm,
    paddingVertical: 6,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimary,
  },
  sendButtonModal: {
    width: 38,
    height: 38,
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.actionDisabled,
  },
  sendButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  composerHelper: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    color: theme.colors.textMuted,
    paddingHorizontal: 4,
  },
});
