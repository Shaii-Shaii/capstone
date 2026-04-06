import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeader } from '../ui/DashboardHeader';
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { useNotifications } from '../../hooks/useNotifications';
import { theme } from '../../design-system/theme';
import { patientDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';

function SupportTip({ icon, text }) {
  return (
    <View style={styles.tipRow}>
      <View style={styles.tipIconWrap}>
        <AppIcon name={icon} state="active" size="sm" />
      </View>
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

export function PatientSupportChatScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { unreadCount } = useNotifications({ role: 'patient', userId: user?.id });

  const firstName = profile?.first_name || 'Patient';
  const avatarInitials = `${profile?.first_name?.[0] || firstName[0] || ''}${profile?.last_name?.[0] || ''}`.trim() || 'SS';

  const handleNavPress = (item) => {
    if (!item.route || item.route === '/patient/support') return;
    router.navigate(item.route);
  };

  return (
    <DashboardLayout
      navItems={patientDashboardNavItems}
      activeNavKey="support"
      navVariant="patient"
      onNavPress={handleNavPress}
      header={(
        <DashboardHeader
          title="Support Center"
          subtitle="Quick help, request guidance, and status answers stay available from every patient screen."
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url}
          variant="patient"
          quickTools={[
            {
              key: 'profile',
              label: 'Profile',
              icon: 'profile',
              onPress: () => router.navigate('/profile'),
            },
          ]}
          utilityActions={[
            {
              key: 'notifications',
              icon: 'notifications',
              badge: unreadCount ? String(Math.min(unreadCount, 99)) : undefined,
              onPress: () => router.navigate('/patient/notifications'),
            },
          ]}
          onSearchPress={() => {}}
          searchPlaceholder="Search support and patient updates"
        />
      )}
    >
      <AppCard variant="patientTint" radius="xl" padding="lg">
        <Text style={styles.eyebrow}>Quick Inquiry</Text>
        <Text style={styles.heroTitle}>Use the floating chat bubble for fast help.</Text>
        <Text style={styles.heroBody}>
          The messenger-style bubble stays available across the signed-in app so you can ask about wig requests, updates, or practical support without leaving your current screen.
        </Text>
      </AppCard>

      <AppCard variant="elevated" radius="xl" padding="lg">
        <DashboardSectionHeader
          title="How Support Works"
          description="Keep the shared support flow consistent no matter where you are in the patient dashboard."
          style={styles.sectionHeader}
        />

        <View style={styles.badgeRow}>
          <AppIcon name="message-text-outline" state="active" size="sm" />
          <Text style={styles.badgeText}>Tap the chat bubble on the lower right to open quick support</Text>
        </View>

        <View style={styles.tipList}>
          <SupportTip icon="requests" text="Ask for request status updates while staying on the current screen." />
          <SupportTip icon="support" text="Get practical guidance about requirements, timelines, and next steps." />
          <SupportTip icon="notifications" text="Use notifications for pushed updates and the chat bubble for immediate questions." />
        </View>
      </AppCard>

      <AppCard variant="elevated" radius="xl" padding="lg">
        <DashboardSectionHeader
          title="Helpful Shortcuts"
          description="Open the patient areas that usually go hand in hand with support questions."
          style={styles.sectionHeader}
        />

        <View style={styles.actionRow}>
          <AppButton
            title="Open Wig Requests"
            fullWidth={false}
            onPress={() => router.navigate('/patient/requests')}
            leading={<AppIcon name="requests" state="inverse" />}
          />
          <AppButton
            title="View Notifications"
            variant="secondary"
            fullWidth={false}
            onPress={() => router.navigate('/patient/notifications')}
            leading={<AppIcon name="notifications" state="muted" />}
          />
        </View>
      </AppCard>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: theme.spacing.xs,
  },
  heroTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  heroBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  sectionHeader: {
    marginBottom: theme.spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  tipList: {
    gap: theme.spacing.sm,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  tipIconWrap: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  tipText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
});
