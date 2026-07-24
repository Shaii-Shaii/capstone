import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { DonorTopBar } from '../../src/components/donor/DonorTopBar';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';
import { useAuth } from '../../src/providers/AuthProvider';
import { useNotifications } from '../../src/hooks/useNotifications';
import { submitDonorFeedback } from '../../src/features/feedback.api';

const FEEDBACK_TYPES = [
  { key: 'issue', label: 'Issue', icon: 'error' },
  { key: 'suggestion', label: 'Suggestion', icon: 'sparkle' },
  { key: 'experience', label: 'Experience', icon: 'success' },
];
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;

export default function DonorFeedbackScreen() {
  const router = useRouter();
  const { user, profile, resolvedTheme } = useAuth();
  const { unreadCount } = useNotifications(user?.id, 'donor');
  const roles = resolveThemeRoles(resolvedTheme);
  const [selectedType, setSelectedType] = React.useState(FEEDBACK_TYPES[0].key);
  const [message, setMessage] = React.useState('');
  const [feedback, setFeedback] = React.useState(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = React.useCallback(async () => {
    const trimmedMessage = message.trim();

    if (trimmedMessage.length < MIN_MESSAGE_LENGTH) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback({
        type: 'error',
        title: 'Add more detail',
        message: `Please write at least ${MIN_MESSAGE_LENGTH} characters before submitting feedback.`,
      });
      return;
    }

    setIsSubmitting(true);

    const result = await submitDonorFeedback({
      databaseUserId: profile?.user_id,
      feedbackType: selectedType,
      message: trimmedMessage,
      sourceRoute: '/donor/feedback',
    });

    setIsSubmitting(false);

    if (result.error || !result.data?.feedback_id) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback({
        type: 'error',
        title: 'Not submitted',
        message: result.error?.message || 'Feedback could not be saved right now.',
      });
      return;
    }

    setMessage('');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setFeedback({
      type: 'success',
      title: 'Feedback submitted',
      message: 'Your feedback was saved to the database.',
    });
  }, [message, profile?.user_id, selectedType]);

  const messageLength = message.trim().length;
  const canSubmit = messageLength >= MIN_MESSAGE_LENGTH && !isSubmitting;

  const handleSelectType = React.useCallback(async (type) => {
    setSelectedType(type);
    await Haptics.selectionAsync();
  }, []);

  const handleMessageChange = React.useCallback((value) => {
    if (value.length > MAX_MESSAGE_LENGTH) {
      setFeedback({
        type: 'info',
        title: 'Limit reached',
        message: `Feedback can be up to ${MAX_MESSAGE_LENGTH} characters.`,
      });
      setMessage(value.slice(0, MAX_MESSAGE_LENGTH));
      return;
    }
    setMessage(value);
  }, []);

  return (
    <DashboardLayout
      header={(
        <DonorTopBar
          title="Feedback"
          subtitle="Send a note to the team"
          showBack
          showFeedbackAction={false}
          unreadCount={unreadCount}
          onBackPress={() => router.back()}
          onNotificationsPress={() => router.navigate('/donor/notifications')}
          onProfilePress={() => router.navigate('/profile')}
        />
      )}
      navItems={donorDashboardNavItems}
      activeNavKey=""
      navVariant="donor"
      screenVariant="default"
      onNavPress={(item) => item?.route && router.replace(item.route)}
    >
      {feedback ? (
        <StatusBanner
          variant={feedback.type}
          title={feedback.title}
          message={feedback.message}
          presentation="floating"
          visible={Boolean(feedback.message)}
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      <AppCard variant="outline" radius="md" padding="md" style={styles.card}>
        <View style={styles.formHeader}>
          <Text style={[styles.formTitle, { color: roles.headingText }]}>Category</Text>
          <Text style={[styles.formMeta, { color: roles.metaText }]}>Saved with your donor account</Text>
        </View>

        <View style={[styles.typeGrid, { borderColor: roles.defaultCardBorder }]}>
          {FEEDBACK_TYPES.map((item) => {
            const isActive = item.key === selectedType;
            return (
              <Pressable
                key={item.key}
                onPress={() => handleSelectType(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [
                  styles.typeButton,
                  {
                    backgroundColor: isActive ? roles.supportCardBackground : 'transparent',
                    borderColor: isActive ? roles.defaultCardBorder : 'transparent',
                  },
                  pressed ? styles.typeButtonPressed : null,
                ]}
              >
                <AppIcon name={item.icon} size="sm" color={isActive ? roles.iconPrimaryColor : roles.metaText} />
                <Text style={[styles.typeButtonLabel, { color: isActive ? roles.headingText : roles.metaText }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.fieldGroup}>
          <View style={styles.fieldHeader}>
            <Text style={[styles.label, { color: roles.headingText }]}>Message</Text>
            <Text style={[styles.counter, { color: messageLength >= MIN_MESSAGE_LENGTH ? roles.metaText : roles.iconPrimaryColor }]}>
              {messageLength}
            </Text>
          </View>
          <TextInput
            value={message}
            onChangeText={handleMessageChange}
            multiline
            textAlignVertical="top"
            placeholder="Describe the issue, suggestion, or experience."
            placeholderTextColor={roles.metaText}
            style={[
              styles.messageInput,
              {
                color: roles.headingText,
                backgroundColor: 'transparent',
                borderColor: roles.defaultCardBorder,
              },
            ]}
          />
          <Text style={[styles.helperText, { color: roles.metaText }]}>
            Minimum {MIN_MESSAGE_LENGTH} characters.
          </Text>
        </View>

        <View style={styles.submitRow}>
          <AppButton
            title={isSubmitting ? 'Submitting...' : 'Submit feedback'}
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={!canSubmit}
            leading={<AppIcon name="feedback" size="sm" color={roles.primaryActionText} />}
            style={styles.submitButton}
          />
        </View>
      </AppCard>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.sm,
    borderRadius: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  formHeader: {
    gap: 2,
  },
  formTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
  },
  formMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  typeGrid: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    flexDirection: 'row',
    gap: 3,
  },
  typeButton: {
    flex: 1,
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  typeButtonPressed: {
    opacity: 0.86,
  },
  typeButtonLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  label: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  counter: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  messageInput: {
    minHeight: 128,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  helperText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  submitRow: {
    marginTop: theme.spacing.xs,
  },
  submitButton: {
    borderRadius: 12,
  },
});
