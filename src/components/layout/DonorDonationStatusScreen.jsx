import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeader } from '../ui/DashboardHeader';
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { ProcessStatusTracker } from '../tracking/ProcessStatusTracker';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../providers/AuthProvider';
import { useProcessTracking } from '../../hooks/useProcessTracking';
import { donorDashboardNavItems } from '../../constants/dashboard';
import { theme } from '../../design-system/theme';

export function DonorDonationStatusScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { unreadCount } = useNotifications({ role: 'donor', userId: user?.id, databaseUserId: profile?.user_id });
  const {
    tracker,
    trackingError,
    isLoadingTracking,
    isRefreshingTracking,
    refreshTracking,
  } = useProcessTracking({ role: 'donor', userId: user?.id, databaseUserId: profile?.user_id });

  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim();

  const handleNavPress = (item) => {
    if (!item.route || item.route === '/donor/status') return;
    router.navigate(item.route);
  };

  return (
    <DashboardLayout
      showSupportChat={false}
      navItems={donorDashboardNavItems}
      activeNavKey="donations"
      navVariant="donor"
      onNavPress={handleNavPress}
      header={(
        <DashboardHeader
          title="Donation Status"
          subtitle={tracker?.summary?.helperText || 'Latest donation update'}
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url}
          variant="donor"
          quickTools={[
            {
              key: 'submission',
              label: 'New Upload',
              icon: 'camera',
              onPress: () => router.navigate('/donor/donations'),
            },
          ]}
          utilityActions={[
            {
              key: 'notifications',
              icon: 'notifications',
              badge: unreadCount ? String(Math.min(unreadCount, 99)) : undefined,
              onPress: () => router.navigate('/donor/notifications'),
            },
          ]}
        />
      )}
    >
      <AppCard variant="donorTint" radius="xl" padding="lg">
        <Text style={styles.eyebrow}>Donation</Text>
        <Text style={styles.heroTitle}>{tracker?.summary?.label || 'Waiting for your first saved submission'}</Text>
        <Text style={styles.heroBody}>{tracker?.summary?.referenceValue || 'Save a submission to start tracking.'}</Text>

        {!tracker ? (
          <View style={styles.actionRow}>
            <AppButton
              title="Upload Hair Photos"
              onPress={() => router.navigate('/donor/donations')}
              leading={<AppIcon name="camera" state="inverse" />}
              fullWidth={false}
            />
          </View>
        ) : null}
      </AppCard>

      <ProcessStatusTracker
        role="donor"
        tracker={tracker}
        error={trackingError}
        isLoading={isLoadingTracking}
        isRefreshing={isRefreshingTracking}
        onRefresh={refreshTracking}
      />

      <AppCard variant="elevated" radius="xl" padding="lg">
        <DashboardSectionHeader
          title="What Happens Next"
          description="Each update comes from your latest saved donation."
          style={styles.sectionHeader}
        />

        <View style={styles.noteList}>
          <View style={styles.noteRow}>
            <View style={styles.noteIconWrap}>
              <AppIcon name="success" state="active" size="sm" />
            </View>
            <Text style={styles.noteText}>Submission appears here after save.</Text>
          </View>
          <View style={styles.noteRow}>
            <View style={styles.noteIconWrap}>
              <AppIcon name="appointment" state="active" size="sm" />
            </View>
            <Text style={styles.noteText}>Logistics updates appear when recorded.</Text>
          </View>
          <View style={styles.noteRow}>
            <View style={styles.noteIconWrap}>
              <AppIcon name="shield" state="active" size="sm" />
            </View>
            <Text style={styles.noteText}>QA and bundle updates continue here.</Text>
          </View>
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
    color: theme.colors.brandPrimary,
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
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  sectionHeader: {
    marginBottom: theme.spacing.md,
  },
  noteList: {
    gap: theme.spacing.sm,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  noteIconWrap: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  noteText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
});
