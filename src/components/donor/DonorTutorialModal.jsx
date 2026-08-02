import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/AppIcon';
import { resolveThemeRoles, theme } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

const DONOR_TUTORIALS = {
  homeOverview: {
    title: 'Home Overview',
    subtitle: 'Use this page to see what needs attention.',
    steps: [
      { icon: 'home', title: 'Read your summary', body: 'Check your latest status, reminders, and next suggested action.' },
      { icon: 'updates', title: 'Review progress', body: 'Look for updates from event registration, donation, or staff scanning.' },
      { icon: 'donations', title: 'Continue donation', body: 'Open the suggested action if you need to scan hair, register, or donate.' },
      { icon: 'notifications', title: 'Check alerts', body: 'Tap the bell for reminders, status changes, and app notices.' },
    ],
  },
  homeEvents: {
    title: 'Donation Events',
    subtitle: 'Find and join an event donation drive.',
    steps: [
      { icon: 'search', title: 'Browse events', body: 'Use the event list, search, and filters to find a suitable drive.' },
      { icon: 'shield', title: 'Unlock private events', body: 'Tap the lock button and enter the organizer code if the event is private.' },
      { icon: 'appointment', title: 'Open details', body: 'Check event date, location, available slots, and requirements.' },
      { icon: 'checkmarkCircle', title: 'Join event', body: 'Register for the event when your details are ready.' },
      { icon: 'donations', title: 'Prepare QR', body: 'Go to Donate, open Hair Event Donation, and show your QR to staff.' },
    ],
  },
  analysisOverview: {
    title: 'Analysis Overview',
    subtitle: 'Review your latest hair condition result.',
    steps: [
      { icon: 'sparkle', title: 'Check current result', body: 'Review condition, score, length, and donation readiness.' },
      { icon: 'info', title: 'Read the reason', body: 'If not eligible, check the reason shown from your latest analysis.' },
      { icon: 'updates', title: 'Open history', body: 'Review past scans and compare older hair condition results.' },
      { icon: 'camera', title: 'Run a new scan', body: 'Tap the scan button if your hair changed or the result is outdated.' },
    ],
  },
  analysisCheckHair: {
    title: 'Check Hair Condition',
    subtitle: 'Scan your hair before creating a donation.',
    steps: [
      { icon: 'camera', title: 'Start scan', body: 'Tap the scan button and allow camera access if prompted.' },
      { icon: 'image', title: 'Take clear photos', body: 'Follow each photo prompt. Use good light and keep hair visible.' },
      { icon: 'requests', title: 'Answer questions', body: 'Enter hair details such as treatment, texture, and condition.' },
      { icon: 'sparkle', title: 'Review result', body: 'Check the estimated length, detected details, and eligibility message.' },
      { icon: 'donations', title: 'Use for donation', body: 'If eligible, go to Donate and continue with event or logistic donation.' },
    ],
  },
  donateHairEvent: {
    title: 'Hair Event Donation',
    subtitle: 'Use this when donating through an event.',
    steps: [
      { icon: 'appointment', title: 'Register first', body: 'Join an event from Home before expecting an event donation record here.' },
      { icon: 'donations', title: 'Open event card', body: 'Select your event donation to view details and current status.' },
      { icon: 'checkHair', title: 'Show QR to staff', body: 'At the event, let staff scan your QR to update your timeline.' },
      { icon: 'updates', title: 'Track timeline', body: 'Refresh after scanning to see Cut, Wig in Production, or Wig Created updates.' },
      { icon: 'success', title: 'Check certificate', body: 'After completion, open achievements or certificates when available.' },
    ],
  },
  donateLogistic: {
    title: 'Logistic Donation',
    subtitle: 'Use this for ship or drop-off donations.',
    steps: [
      { icon: 'checkHair', title: 'Confirm eligibility', body: 'Complete Analysis first. The app blocks donation if hair is not ready.' },
      { icon: 'location', title: 'Tap Add Donation', body: 'Use Add Donation only when you want to create a new logistic donation.' },
      { icon: 'editProfile', title: 'Enter hair details', body: 'Confirm length, color, texture, notes, and upload a photo if needed.' },
      { icon: 'appointment', title: 'Choose send-off', body: 'Select drop-off or shipping. For drop-off, pick date and time.' },
      { icon: 'checkmarkCircle', title: 'Confirm donation', body: 'Submit the donation or appointment to generate a tracked record.' },
      { icon: 'updates', title: 'Follow status', body: 'Refresh to see Submitted, Received, Cut, or production updates.' },
    ],
  },
  profile: {
    title: 'Profile Guide',
    subtitle: 'Keep your account ready for donation.',
    steps: [
      { icon: 'profile', title: 'Open edit mode', body: 'Tap Edit Profile to update your personal details.' },
      { icon: 'phone', title: 'Update contacts', body: 'Keep phone, email, and address correct for donation updates.' },
      { icon: 'shield', title: 'Add consent', body: 'If the donor is a minor, complete guardian consent before donating.' },
      { icon: 'save', title: 'Save changes', body: 'Review your entries, then save before leaving the page.' },
      { icon: 'signOut', title: 'Manage account', body: 'Change password or log out from the account actions.' },
    ],
  },
};

const FALLBACK_TUTORIAL = {
  title: 'Tutorial Guide',
  subtitle: 'Choose a tab to see how its feature works.',
  steps: [
    { icon: 'info', title: 'Open a section', body: 'Use the active tab and tap the tutorial icon again for specific steps.' },
  ],
};

const withOpacity = (color, opacity) => {
  if (!color || typeof color !== 'string') return color;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    const raw = color.slice(1);
    const expanded = raw.length === 3
      ? raw.split('').map((part) => part + part).join('')
      : raw;
    const red = parseInt(expanded.slice(0, 2), 16);
    const green = parseInt(expanded.slice(2, 4), 16);
    const blue = parseInt(expanded.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }
  return color;
};

export function DonorTutorialModal({ visible, tabKey = 'home', onClose }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const content = DONOR_TUTORIALS[tabKey] || DONOR_TUTORIALS.homeOverview || FALLBACK_TUTORIAL;
  const accentColor = roles.primaryActionBackground;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: roles.defaultCardBackground,
              borderColor: roles.defaultCardBorder,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={[styles.heroIcon, { backgroundColor: withOpacity(accentColor, 0.12) }]}>
              <AppIcon name="tutorial" size="lg" state="default" color={accentColor} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close tutorial"
              onPress={onClose}
              style={styles.closeButton}
            >
              <AppIcon name="closeCircle" size="md" state="default" color={roles.metaText} />
            </Pressable>
          </View>

          <Text style={[styles.title, { color: roles.headingText }]}>{content?.title || FALLBACK_TUTORIAL.title}</Text>
          <Text style={[styles.subtitle, { color: roles.bodyText }]}>{content?.subtitle || FALLBACK_TUTORIAL.subtitle}</Text>

          <ScrollView
            style={styles.stepScroll}
            contentContainerStyle={styles.stepList}
            showsVerticalScrollIndicator={false}
          >
            {(Array.isArray(content?.steps) && content.steps.length ? content.steps : FALLBACK_TUTORIAL.steps).map((step, index) => (
              <View
                key={step.title}
                style={[
                  styles.stepRow,
                  {
                    backgroundColor: roles.pageBackground,
                    borderColor: roles.defaultCardBorder,
                  },
                ]}
              >
                <View style={[styles.stepIcon, { backgroundColor: withOpacity(accentColor, 0.1) }]}>
                  <AppIcon name={step.icon} size="sm" state="default" color={accentColor} />
                </View>
                <View style={styles.stepCopy}>
                  <Text style={[styles.stepTitle, { color: roles.headingText }]}>
                    {index + 1}. {step.title}
                  </Text>
                  <Text style={[styles.stepBody, { color: roles.bodyText }]}>{step.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '82%',
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    shadowColor: theme.colors.palette.black,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    marginBottom: theme.spacing.md,
  },
  stepScroll: {
    maxHeight: 300,
  },
  stepList: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCopy: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  stepBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
});
