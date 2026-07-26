import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { DonorTopBar } from "../../src/components/donor/DonorTopBar";
import { DashboardLayout } from "../../src/components/layout/DashboardLayout";
import { AppButton } from "../../src/components/ui/AppButton";
import { AppCard } from "../../src/components/ui/AppCard";
import { AppIcon } from "../../src/components/ui/AppIcon";
import { StatusBanner } from "../../src/components/ui/StatusBanner";
import { patientDashboardNavItems } from "../../src/constants/dashboard";
import { resolveThemeRoles, theme } from "../../src/design-system/theme";
import { submitFeedback } from "../../src/features/feedback.api";
import { useNotifications } from "../../src/hooks/useNotifications";
import { useAuth } from "../../src/providers/AuthProvider";

const FEEDBACK_TYPES = [
  { key: "issue", label: "Issue", icon: "error" },
  { key: "suggestion", label: "Suggestion", icon: "sparkle" },
  { key: "experience", label: "Experience", icon: "success" },
];
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;

export default function PatientFeedbackScreen() {
  const router = useRouter();
  const { user, profile, resolvedTheme } = useAuth();
  const { unreadCount } = useNotifications({
    role: "patient",
    userId: user?.id,
    databaseUserId: profile?.user_id,
  });
  const roles = resolveThemeRoles(resolvedTheme);
  const [selectedType, setSelectedType] = React.useState(
    FEEDBACK_TYPES[0].key,
  );
  const [message, setMessage] = React.useState("");
  const [feedback, setFeedback] = React.useState(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = React.useCallback(async () => {
    const trimmedMessage = message.trim();

    if (trimmedMessage.length < MIN_MESSAGE_LENGTH) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback({
        type: "error",
        title: "Add more detail",
        message: `Please write at least ${MIN_MESSAGE_LENGTH} characters before submitting feedback.`,
      });
      return;
    }

    setIsSubmitting(true);
    const result = await submitFeedback({
      databaseUserId: profile?.user_id,
      feedbackType: selectedType,
      message: trimmedMessage,
      appRole: "patient",
      sourceRoute: "/patient/feedback",
    });
    setIsSubmitting(false);

    if (result.error || !result.data?.feedback_id) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback({
        type: "error",
        title: "Not submitted",
        message:
          result.error?.message || "Feedback could not be saved right now.",
      });
      return;
    }

    setMessage("");
    await Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    );
    setFeedback({
      type: "success",
      title: "Feedback submitted",
      message: "Thank you. Your feedback was sent to the Donivra team.",
    });
  }, [message, profile?.user_id, selectedType]);

  const messageLength = message.trim().length;
  const canSubmit = messageLength >= MIN_MESSAGE_LENGTH && !isSubmitting;

  const handleMessageChange = React.useCallback((value) => {
    if (value.length > MAX_MESSAGE_LENGTH) {
      setFeedback({
        type: "info",
        title: "Limit reached",
        message: `Feedback can be up to ${MAX_MESSAGE_LENGTH} characters.`,
      });
      setMessage(value.slice(0, MAX_MESSAGE_LENGTH));
      return;
    }
    setMessage(value);
  }, []);

  return (
    <DashboardLayout
      header={
        <DonorTopBar
          title="Feedback"
          subtitle="Help us improve your experience"
          showBack
          showFeedbackAction={false}
          unreadCount={unreadCount}
          onBackPress={() => router.back()}
          onNotificationsPress={() =>
            router.navigate("/patient/notifications")
          }
          onProfilePress={() => router.navigate("/profile")}
        />
      }
      navItems={patientDashboardNavItems}
      activeNavKey=""
      navVariant="patient"
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

      <View style={styles.intro}>
        <Text style={[styles.introTitle, { color: roles.headingText }]}>
          Share your feedback
        </Text>
        <Text style={[styles.introBody, { color: roles.bodyText }]}>
          Tell us about an issue, suggestion, or experience. Your feedback
          helps us improve patient care.
        </Text>
      </View>

      <AppCard
        variant="outline"
        radius="lg"
        padding="md"
        style={styles.card}
      >
        <View style={styles.formHeader}>
          <Text style={[styles.formTitle, { color: roles.headingText }]}>
            Category
          </Text>
          <Text style={[styles.formMeta, { color: roles.metaText }]}>
            Select the option that best fits your message
          </Text>
        </View>

        <View style={styles.typeGrid}>
          {FEEDBACK_TYPES.map((item) => {
            const isActive = item.key === selectedType;
            return (
              <Pressable
                key={item.key}
                onPress={async () => {
                  setSelectedType(item.key);
                  await Haptics.selectionAsync();
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: isActive }}
                style={({ pressed }) => [
                  styles.typeButton,
                  {
                    backgroundColor: isActive
                      ? roles.supportCardBackground
                      : roles.pageBackground,
                    borderColor: isActive
                      ? roles.primaryActionBackground
                      : roles.defaultCardBorder,
                  },
                  pressed ? styles.typeButtonPressed : null,
                ]}
              >
                <AppIcon
                  name={item.icon}
                  size="sm"
                  color={
                    isActive
                      ? roles.primaryActionBackground
                      : roles.metaText
                  }
                />
                <Text
                  style={[
                    styles.typeButtonLabel,
                    { color: isActive ? roles.headingText : roles.metaText },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.fieldGroup}>
          <View style={styles.fieldHeader}>
            <Text style={[styles.label, { color: roles.headingText }]}>
              Message
            </Text>
            <Text style={[styles.counter, { color: roles.metaText }]}>
              {messageLength}/{MAX_MESSAGE_LENGTH}
            </Text>
          </View>
          <TextInput
            value={message}
            onChangeText={handleMessageChange}
            multiline
            textAlignVertical="top"
            placeholder="Describe your feedback in detail..."
            placeholderTextColor={roles.metaText}
            maxLength={MAX_MESSAGE_LENGTH}
            style={[
              styles.messageInput,
              {
                color: roles.headingText,
                backgroundColor: roles.pageBackground,
                borderColor: roles.defaultCardBorder,
              },
            ]}
          />
          <Text style={[styles.helperText, { color: roles.metaText }]}>
            Please provide at least {MIN_MESSAGE_LENGTH} characters.
          </Text>
        </View>

        <AppButton
          title={isSubmitting ? "Submitting..." : "Submit Feedback"}
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={!canSubmit}
          leading={<AppIcon name="feedback" size="sm" state="inverse" />}
          fullWidth
        />
      </AppCard>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  introTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
  },
  introBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  card: {
    gap: theme.spacing.md,
    shadowOpacity: 0,
    elevation: 0,
  },
  formHeader: {
    gap: 2,
  },
  formTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  formMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  typeGrid: {
    flexDirection: "row",
    gap: theme.spacing.xs,
  },
  typeButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  typeButtonPressed: {
    opacity: 0.78,
  },
  typeButtonLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  counter: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  messageInput: {
    minHeight: 148,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  helperText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
});
