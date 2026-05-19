import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { DashboardHeader } from '../../src/components/ui/DashboardHeader';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { patientDashboardNavItems } from '../../src/constants/dashboard';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';
import { useAuth } from '../../src/providers/AuthProvider';
import { useNotifications } from '../../src/hooks/useNotifications';
import { usePatientWigRequest } from '../../src/hooks/usePatientWigRequest';
import { useProcessTracking } from '../../src/hooks/useProcessTracking';

export default function PatientHomeScreen() {
  const router = useRouter();
  const { user, profile, patientProfile, resolvedTheme } = useAuth();
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
  const roles = resolveThemeRoles(resolvedTheme);
  const trackingSteps = tracker?.steps || [];
  const completedStepCount = trackingSteps.filter((step) => step.state === 'completed').length;
  const currentStepCount = trackingSteps.some((step) => step.state === 'current') ? 1 : 0;
  const progressPercent = trackingSteps.length
    ? Math.min(100, Math.round(((completedStepCount + currentStepCount) / trackingSteps.length) * 100))
    : (latestWigRequest?.req_id ? 20 : 0);
  const requestLabel = tracker?.summary?.label || latestWigRequest?.status || 'No active request';
  const hasRequest = Boolean(latestWigRequest?.req_id);

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
          title={resolvedTheme?.brandName || 'Donivra'}
          subtitle=""
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={avatarUri}
          variant="patient"
          minimal
          showAvatar
          onProfilePress={() => router.navigate('/profile')}
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
          presentation="floating"
          visible={isLoadingContext || isLoadingTracking}
          autoDismissMs={3000}
        />
      ) : null}

      {error || trackingError ? (
        <StatusBanner
          title="Status unavailable"
          message={error?.message || trackingError || 'We could not load your request status right now.'}
          variant="error"
          presentation="floating"
          visible={Boolean(error || trackingError)}
          autoDismissMs={3000}
        />
      ) : null}

      <View style={styles.stack}>
        <View style={styles.greetingBlock}>
          <Text style={[styles.greetingTitle, { color: roles.headingText }]}>
            {firstName ? `Hello, ${firstName}` : 'Hello'}
          </Text>
          <Text style={[styles.greetingBody, { color: roles.bodyText }]}>
            We&apos;re with you every step of your journey.
          </Text>
        </View>

        {hasRequest ? (
          <AppCard variant="patientTint" radius="xl" padding="lg" style={styles.statusCard}>
            <View style={styles.statusTopRow}>
              <View style={styles.statusBadge}>
                <AppIcon name="sparkle" size="sm" state="active" />
                <Text style={[styles.statusBadgeText, { color: roles.tertiaryAccentText }]}>
                  Active request
                </Text>
              </View>
            </View>

            <View style={styles.statusContent}>
              <View style={styles.statusCopy}>
                <Text style={[styles.statusTitle, { color: roles.headingText }]}>
                  Request status: {requestLabel}
                </Text>
                <Text style={[styles.statusBody, { color: roles.bodyText }]}>
                  {tracker?.summary?.helperText || 'Track the latest progress for your wig request.'}
                </Text>
              </View>

              <View style={styles.progressBlock}>
                <View style={styles.progressLabelRow}>
                  <Text style={[styles.progressLabel, { color: roles.bodyText }]}>Progress</Text>
                  <Text style={[styles.progressValue, { color: roles.headingText }]}>{progressPercent}%</Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: roles.supportCardBackground }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${progressPercent}%`,
                        backgroundColor: roles.primaryActionBackground,
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.updateRow}>
                <AppIcon name="appointment" size="sm" state="muted" />
                <Text style={[styles.updateText, { color: roles.bodyText }]} numberOfLines={1}>
                  {tracker?.summary?.helperText || 'Updates appear after your first request.'}
                </Text>
              </View>
            </View>

            <AppButton
              title="View Journey Details"
              onPress={() => router.navigate('/patient/requests')}
              trailing={<AppIcon name="chevronRight" state="inverse" />}
            />
          </AppCard>
        ) : null}

        <View style={styles.quickGrid}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/patient/requests')}
            style={({ pressed }) => [
              styles.quickTile,
              styles.quickTilePrimary,
              { backgroundColor: roles.primaryActionBackground, borderColor: roles.primaryActionBackground },
              pressed ? styles.tilePressed : null,
            ]}
          >
            <View style={styles.quickTileTop}>
              <View style={styles.quickTileIconPrimary}>
                <AppIcon name="requests" state="inverse" />
              </View>
              <AppIcon name="chevronRight" state="inverse" />
            </View>
            <Text style={[styles.quickTileTitle, { color: roles.primaryActionText }]}>Start New Wig Request</Text>
            <Text style={[styles.quickTileBody, { color: roles.primaryActionText }]}>Begin your wig support journey.</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/patient/requests')}
            style={({ pressed }) => [
              styles.quickTile,
              { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder },
              pressed ? styles.tilePressed : null,
            ]}
          >
            <View style={styles.quickTileTop}>
              <View style={[styles.quickTileIcon, { backgroundColor: roles.supportCardBackground }]}>
                <AppIcon name="sparkle" state="active" />
              </View>
              <AppIcon name="chevronRight" state="muted" />
            </View>
            <Text style={[styles.quickTileTitle, { color: roles.headingText }]}>Try AI Wig</Text>
            <Text style={[styles.quickTileBody, { color: roles.bodyText }]}>Preview a style before submitting.</Text>
          </Pressable>
        </View>
      </View>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: theme.spacing.lg,
  },
  greetingBlock: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
  },
  greetingTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.title,
    lineHeight: theme.typography.semantic.title * theme.typography.lineHeights.tight,
  },
  greetingBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  statusCard: {
    gap: theme.spacing.md,
  },
  statusTopRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSoft,
  },
  statusBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  statusContent: {
    gap: theme.spacing.md,
  },
  statusCopy: {
    gap: theme.spacing.xs,
  },
  statusTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.tight,
  },
  statusBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  progressBlock: {
    gap: theme.spacing.xs,
  },
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.medium,
  },
  progressValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  progressTrack: {
    width: '100%',
    height: 10,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: theme.radius.full,
  },
  updateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  updateText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  quickGrid: {
    gap: theme.spacing.md,
  },
  quickTile: {
    minHeight: 154,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  },
  quickTilePrimary: {
    borderBottomWidth: 3,
  },
  quickTileTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  quickTileIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTileIconPrimary: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  quickTileTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    lineHeight: theme.typography.semantic.bodyLg * theme.typography.lineHeights.tight,
  },
  quickTileBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  tilePressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
});
