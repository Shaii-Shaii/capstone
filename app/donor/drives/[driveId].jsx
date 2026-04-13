import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DashboardLayout } from '../../../src/components/layout/DashboardLayout';
import { DashboardHeader } from '../../../src/components/ui/DashboardHeader';
import { AppButton } from '../../../src/components/ui/AppButton';
import { AppCard } from '../../../src/components/ui/AppCard';
import { AppIcon } from '../../../src/components/ui/AppIcon';
import { StatusBanner } from '../../../src/components/ui/StatusBanner';
import { donorDashboardNavItems } from '../../../src/constants/dashboard';
import { useNotifications } from '../../../src/hooks/useNotifications';
import { useAuth } from '../../../src/providers/AuthProvider';
import { createDonationDriveRsvp, fetchDonationDriveDetail } from '../../../src/features/donorHome.api';
import { resolveThemeRoles, theme } from '../../../src/design-system/theme';

const formatDriveDate = (startDate, endDate) => {
  if (!startDate) return 'Date to follow';
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (!end) {
    return formatter.format(start);
  }

  return `${formatter.format(start)} - ${formatter.format(end)}`;
};

function DetailMetaRow({ icon, text }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  if (!text) return null;

  return (
    <View style={styles.metaRow}>
      <AppIcon name={icon} size="sm" state="muted" />
      <Text style={[styles.metaText, { color: roles.bodyText }]}>{text}</Text>
    </View>
  );
}

export default function DonorDriveDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const driveId = Array.isArray(params.driveId) ? params.driveId[0] : params.driveId;
  const { user, profile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const { unreadCount } = useNotifications({ role: 'donor', userId: user?.id, databaseUserId: profile?.user_id });
  const [isLoading, setIsLoading] = React.useState(true);
  const [drive, setDrive] = React.useState(null);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [feedbackMessage, setFeedbackMessage] = React.useState('');
  const [feedbackVariant, setFeedbackVariant] = React.useState('info');
  const [isSubmittingRsvp, setIsSubmittingRsvp] = React.useState(false);

  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim();

  const loadDrive = React.useCallback(async () => {
    if (!driveId) {
      setErrorMessage('Drive details are not available right now.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    const result = await fetchDonationDriveDetail(Number(driveId), profile?.user_id || null);
    if (result.error) {
      setErrorMessage('Drive details could not be loaded right now.');
    }

    setDrive(result.data || null);
    setIsLoading(false);
  }, [driveId, profile?.user_id]);

  React.useEffect(() => {
    loadDrive();
  }, [loadDrive]);

  const handleRsvp = React.useCallback(async () => {
    if (!drive?.donation_drive_id || !profile?.user_id) {
      setFeedbackMessage('Your donor account is required before sending an RSVP.');
      setFeedbackVariant('info');
      return;
    }

    setIsSubmittingRsvp(true);
    setFeedbackMessage('');

    const result = await createDonationDriveRsvp({
      driveId: drive.donation_drive_id,
      databaseUserId: profile.user_id,
      organizationId: drive.organization_id || null,
    });

    setIsSubmittingRsvp(false);

    if (result.error) {
      setFeedbackMessage('RSVP could not be saved right now. Please try again.');
      setFeedbackVariant('error');
      return;
    }

    setDrive((current) => (
      current
        ? {
          ...current,
          registration: result.data,
          can_rsvp: false,
        }
        : current
    ));
    setFeedbackMessage(result.alreadyRegistered ? 'You already saved an RSVP for this drive.' : 'RSVP saved.');
    setFeedbackVariant('success');
  }, [drive, profile?.user_id]);

  const handleNavPress = (item) => {
    if (!item.route) return;
    router.navigate(item.route);
  };

  return (
    <DashboardLayout
      showSupportChat={false}
      navItems={donorDashboardNavItems}
      activeNavKey="home"
      navVariant="donor"
      onNavPress={handleNavPress}
      screenVariant="default"
      header={(
        <DashboardHeader
          title={drive?.event_title || 'Drive details'}
          subtitle={drive?.organization_name || 'Donation drive'}
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url}
          variant="donor"
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
      <AppButton
        title="Back to home"
        variant="ghost"
        fullWidth={false}
        leading={<AppIcon name="arrowLeft" state="muted" />}
        onPress={() => router.back()}
        style={styles.backButton}
      />

      {errorMessage ? (
        <StatusBanner message={errorMessage} variant="info" style={styles.bannerGap} />
      ) : null}

      {feedbackMessage ? (
        <StatusBanner message={feedbackMessage} variant={feedbackVariant} style={styles.bannerGap} />
      ) : null}

      {isLoading ? (
        <AppCard variant="default" radius="xl" padding="lg">
          <View style={styles.loadingState}>
            <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
            <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading drive details</Text>
          </View>
        </AppCard>
      ) : drive ? (
        <>
          <AppCard variant="default" radius="xl" padding="lg" style={styles.sectionGap}>
            <View style={styles.titleRow}>
              <View style={[styles.iconChip, { backgroundColor: roles.iconPrimarySurface }]}>
                <AppIcon name="donations" size="md" state="default" color={roles.iconPrimaryColor} />
              </View>
              <View style={styles.titleCopy}>
                <Text style={[styles.statusText, { color: roles.metaText }]}>
                  {drive.registration ? 'RSVP saved' : (drive.status || 'Upcoming')}
                </Text>
                <Text style={[styles.driveTitle, { color: roles.headingText }]}>{drive.event_title}</Text>
              </View>
            </View>

            <View style={styles.metaBlock}>
              <DetailMetaRow icon="organization" text={drive.organization_name} />
              <DetailMetaRow icon="appointment" text={formatDriveDate(drive.start_date, drive.end_date)} />
              <DetailMetaRow icon="location" text={drive.address_label || drive.location_label} />
            </View>

            <AppButton
              title={drive.registration ? 'RSVP saved' : 'RSVP'}
              fullWidth={false}
              onPress={handleRsvp}
              disabled={Boolean(drive.registration) || isSubmittingRsvp}
              loading={isSubmittingRsvp}
              style={styles.rsvpButton}
            />
          </AppCard>

          {drive.event_overview ? (
            <AppCard variant="default" radius="xl" padding="lg">
              <Text style={[styles.sectionTitle, { color: roles.headingText }]}>Overview</Text>
              <Text style={[styles.overviewText, { color: roles.bodyText }]}>{drive.event_overview}</Text>
            </AppCard>
          ) : null}
        </>
      ) : (
        <Text style={[styles.emptyText, { color: roles.bodyText }]}>Drive details are not available right now.</Text>
      )}
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  backButton: {
    marginBottom: theme.spacing.sm,
  },
  bannerGap: {
    marginBottom: theme.spacing.sm,
  },
  sectionGap: {
    marginBottom: theme.spacing.md,
  },
  loadingState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  titleCopy: {
    flex: 1,
  },
  iconChip: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    marginBottom: 2,
  },
  driveTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
  },
  metaBlock: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  metaText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  rsvpButton: {
    alignSelf: 'flex-start',
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    marginBottom: theme.spacing.sm,
  },
  overviewText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  emptyText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    paddingVertical: theme.spacing.xs,
  },
});
