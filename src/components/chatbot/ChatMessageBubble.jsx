import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../design-system/theme';
import chatbotIcon from '../../assets/images/chatbot_icon.png';
import { useAuth } from '../../providers/AuthProvider';

const formatTime = (value) => {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat('en-PH', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
};

function AttachmentPreview({ attachment }) {
  if (attachment?.uri) {
    return <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} resizeMode="cover" />;
  }

  return (
    <View style={styles.attachmentFallback}>
      <Text numberOfLines={2} style={styles.attachmentFallbackText}>
        {attachment?.name || 'Attachment'}
      </Text>
    </View>
  );
}

export function ChatMessageBubble({ message }) {
  const { resolvedTheme } = useAuth();
  const isUser = message.sender === 'user';
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const actions = Array.isArray(message.actions) ? message.actions : [];
  const timestamp = formatTime(message.createdAt);
  const assistantLabel = resolvedTheme?.brandName ? `${resolvedTheme.brandName} AI` : 'AI Assistant';

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      {!isUser ? (
        <View style={styles.assistantAvatarWrap}>
          <Image source={chatbotIcon} style={styles.assistantAvatar} resizeMode="contain" />
        </View>
      ) : null}

      <View style={[styles.contentColumn, isUser ? styles.contentColumnUser : null]}>
        {!isUser ? <Text style={styles.assistantName}>{assistantLabel}</Text> : null}

        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          {attachments.length ? (
            <View style={styles.attachmentRow}>
              {attachments.slice(0, 3).map((attachment) => (
                <AttachmentPreview key={attachment.id || attachment.uri || attachment.name} attachment={attachment} />
              ))}
            </View>
          ) : null}

          {message.text ? (
            <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
              {message.text}
            </Text>
          ) : null}

          {actions.length ? (
            <View style={styles.actionRow}>
              {actions.slice(0, 3).map((action) => (
                <Pressable
                  key={action.id || action.label}
                  onPress={() => action?.url ? Linking.openURL(action.url) : null}
                  style={({ pressed }) => [
                    styles.actionChip,
                    pressed ? styles.actionChipPressed : null,
                  ]}
                >
                  <Text style={styles.actionChipText}>{action.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <Text style={[styles.timestamp, isUser ? styles.timestampUser : null]}>
          {timestamp || (isUser ? 'You' : 'Assistant')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    marginBottom: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowAssistant: {
    justifyContent: 'flex-start',
  },
  assistantAvatarWrap: {
    width: 28,
    height: 28,
    marginTop: 10,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  assistantAvatar: {
    width: 22,
    height: 22,
  },
  contentColumn: {
    flexShrink: 1,
    maxWidth: '82%',
    gap: 3,
  },
  contentColumnUser: {
    alignItems: 'flex-end',
  },
  assistantName: {
    marginLeft: 2,
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textMuted,
  },
  bubble: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  userBubble: {
    backgroundColor: theme.colors.brandPrimary,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  assistantBubble: {
    backgroundColor: '#fbf8fa',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  messageText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  userText: {
    color: theme.colors.textInverse,
  },
  assistantText: {
    color: theme.colors.textPrimary,
  },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  actionChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.brandPrimaryMuted,
  },
  actionChipPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  actionChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
  },
  attachmentImage: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.lg,
  },
  attachmentFallback: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    paddingHorizontal: theme.spacing.xs,
  },
  attachmentFallbackText: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  timestamp: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    color: theme.colors.textMuted,
    marginLeft: 2,
    marginTop: 1,
  },
  timestampUser: {
    marginRight: 2,
  },
});
