import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { DashboardHeader } from '../../src/components/ui/DashboardHeader';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { patientDashboardNavItems } from '../../src/constants/dashboard';
import { theme } from '../../src/design-system/theme';
import { useAuth } from '../../src/providers/AuthProvider';
import { useNotifications } from '../../src/hooks/useNotifications';
import { usePatientWigRequest } from '../../src/hooks/usePatientWigRequest';
import { useProcessTracking } from '../../src/hooks/useProcessTracking';

export default function PatientHomeScreen() {
  const router = useRouter();
  const { user, profile, patientProfile } = useAuth();
  const { unreadCount } = useNotifications({ role: 'patient', userId: user?.id, databaseUserId: profile?.user_id });
  const {
    latestWigRequest,
    isLoadingContext,
    error,
  } = usePatientWigRequest({ userId: user?.id });
  const {
    tracker,
    trackingError,
    isLoadingTracking,
  } = useProcessTracking({ role: 'patient', userId: user?.id, databaseUserId: profile?.user_id });

  const firstName = (profile?.first_name || '').trim();
  const lastName = (profile?.last_name || '').trim();
  const avatarUri = profile?.avatar_url || profile?.photo_path || patientProfile?.patient_picture || '';
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim();

  const handleNavPress = (item) => {
    if (!item.route || item.route === '/patient/home') return;
    router.navigate(item.route);
  };

  return (
    <DashboardLayout
      navItems={patientDashboardNavItems}
      activeNavKey="home"
      navVariant="patient"
      onNavPress={handleNavPress}
      header={(
        <DashboardHeader
          title={firstName ? `Welcome, ${firstName}` : 'Patient Home'}
          subtitle=""
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={avatarUri}
          variant="patient"
          minimal
          showAvatar
          utilityActions={[
            {
              key: 'notifications',
              icon: 'notifications',
              badge: unreadCount ? String(Math.min(unreadCount, 99)) : undefined,
              onPress: () => router.navigate('/patient/notifications'),
            },
          ]}
        />
      )}
    >
      {isLoadingContext || isLoadingTracking ? (
        <StatusBanner
          title="Loading request status"
          message="Checking your latest wig request."
          variant="info"
        />
      ) : null}

      {error || trackingError ? (
        <StatusBanner
          title="Status unavailable"
          message={error?.message || trackingError || 'We could not load your request status right now.'}
          variant="error"
        />
      ) : null}

      <View style={styles.stack}>
        <AppCard variant="patientTint" radius="xl" padding="lg" style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryIcon}>
              <AppIcon name="requests" state="active" />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.eyebrow}>Current request</Text>
              <Text style={styles.title}>
                {latestWigRequest?.req_id ? 'Track your wig request' : 'No wig request yet'}
              </Text>
              <Text style={styles.body}>
                {latestWigRequest?.req_id
                  ? `Status: ${tracker?.summary?.label || latestWigRequest.status || 'Pending'}`
                  : 'Start a request when you are ready.'}
              </Text>
            </View>
          </View>

          <AppButton
            title={latestWigRequest?.req_id ? 'Open tracking' : 'Request a wig'}
            onPress={() => router.navigate('/patient/requests')}
            leading={<AppIcon name={latestWigRequest?.req_id ? 'updates' : 'requests'} state="inverse" />}
          />
        </AppCard>

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <View style={styles.aiIcon}>
              <AppIcon name="sparkle" state="active" />
            </View>
            <View style={styles.aiCopy}>
              <Text style={styles.aiTitle}>Try AI Generated Wig</Text>
              <Text style={styles.body}>Preview styles only. This does not submit a request.</Text>
            </View>
          </View>
          <AppButton
            title="Try AI Wig"
            variant="secondary"
            onPress={() => router.navigate('/patient/requests')}
            leading={<AppIcon name="sparkle" state="muted" />}
          />
        </AppCard>
      </View>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: theme.spacing.md,
  },
  summaryCard: {
    gap: theme.spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  summaryIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  emptyCard: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  eyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  body: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  aiCard: {
    gap: theme.spacing.md,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  aiIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  aiCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  aiTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
});
