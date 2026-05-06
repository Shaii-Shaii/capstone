import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import {
  createDonationDriveRegistration,
  fetchDonationDriveDetail,
  fetchDonationDrivePreview,
  joinOrganizationMembership,
} from '../../../src/features/donorHome.api';
import {
  buildDriveInvitationQrPayload,
  buildQrImageUrl,
  getDonorDonationsModuleData,
} from '../../../src/features/donorDonations.service';
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

function DriveMembershipPrompt({
  visible,
  drive,
  feedbackMessage,
  feedbackVariant,
  isJoining,
  onClose,
  onJoin,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.modalCard}>
          <Text style={[styles.modalEyebrow, { color: roles.metaText }]}>Membership required</Text>
          <Text style={[styles.modalTitle, { color: roles.headingText }]}>Join organization first</Text>
          <Text style={[styles.modalBody, { color: roles.bodyText }]}>
            {drive?.organization_name || 'This organization'} requires membership before viewing its donation drive.
          </Text>
          {feedbackMessage ? (
            <StatusBanner variant={feedbackVariant || 'info'} message={feedbackMessage} style={styles.modalBanner} />
          ) : null}
          <View style={styles.modalActions}>
            <AppButton title="Cancel" variant="ghost" fullWidth={false} onPress={onClose} />
            <AppButton title={isJoining ? 'Joining...' : 'Join organization'} fullWidth={false} onPress={onJoin} loading={isJoining} />
          </View>
        </AppCard>
      </View>
    </Modal>
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
  const [isJoiningOrganization, setIsJoiningOrganization] = React.useState(false);
  const [isMembershipPromptOpen, setIsMembershipPromptOpen] = React.useState(false);
  const [membershipFeedback, setMembershipFeedback] = React.useState({ message: '', variant: 'info' });
  const [isSubmittingRsvp, setIsSubmittingRsvp] = React.useState(false);
  const [driveQrPayload, setDriveQrPayload] = React.useState('');
  const [donationFlowState, setDonationFlowState] = React.useState({
    hasOngoingDonation: false,
    ongoingDonationMessage: '',
    hasRecentHairEligibility: false,
  });

  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim();
  const driveImageUrl = drive?.event_image_url || drive?.organization_logo_url || '';
  const loadDrive = React.useCallback(async () => {
    if (!driveId) {
      setErrorMessage('Drive details are not available right now.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    const [driveResult, donationModuleResult] = await Promise.all([
      fetchDonationDriveDetail(Number(driveId), profile?.user_id || null),
      getDonorDonationsModuleData({
        userId: user?.id || null,
        databaseUserId: profile?.user_id || null,
        driveLimit: 8,
      }),
    ]);

    if (driveResult.error) {
      setErrorMessage('Drive details could not be loaded right now.');
    }

    setDrive(driveResult.data || null);
    setDonationFlowState({
      hasOngoingDonation: Boolean(donationModuleResult.hasOngoingDonation),
      ongoingDonationMessage: donationModuleResult.ongoingDonationMessage || '',
      hasRecentHairEligibility: Boolean(
        donationModuleResult.latestScreening?.created_at
        && Date.now() - new Date(donationModuleResult.latestScreening.created_at).getTime() <= 30 * 24 * 60 * 60 * 1000
      ),
    });
    setIsLoading(false);
  }, [driveId, profile?.user_id, user?.id]);

  React.useEffect(() => {
    loadDrive();
  }, [loadDrive]);

  const hasOngoingDonation = Boolean(donationFlowState.hasOngoingDonation);
  const ongoingDonationMessage = donationFlowState.ongoingDonationMessage
    || 'You already have an ongoing donation. Please complete or wait for the current donation process to finish before starting a new one.';
  const hasRecentHairEligibility = Boolean(donationFlowState.hasRecentHairEligibility);

  const refreshDriveRegistration = React.useCallback(async () => {
    if (!drive?.donation_drive_id || !profile?.user_id) return null;
    const refreshed = await fetchDonationDrivePreview(drive.donation_drive_id, profile.user_id);
    if (refreshed.data) {
      setDrive(refreshed.data);
      return refreshed.data;
    }
    return null;
  }, [drive?.donation_drive_id, profile?.user_id]);

  const handleStartCheckHair = React.useCallback(() => {
    if (!drive) return;

    if (hasOngoingDonation) {
      setFeedbackMessage(ongoingDonationMessage);
      setFeedbackVariant('info');
      return;
    }

    if (drive.organization_id && !drive.membership?.is_active) {
      setMembershipFeedback({ message: '', variant: 'info' });
      setIsMembershipPromptOpen(true);
      return;
    }

    router.navigate('/donor/donations');
  }, [drive, hasOngoingDonation, ongoingDonationMessage, router]);

  const handleDriveRsvp = React.useCallback(async () => {
    if (!drive?.donation_drive_id) return;

    if (!hasRecentHairEligibility) {
      setFeedbackMessage('Please complete CheckHair first. Hair eligibility must be assessed within the last month before joining this event.');
      setFeedbackVariant('info');
      router.navigate('/donor/donations');
      return;
    }

    if (hasOngoingDonation && !drive.registration?.registration_id) {
      setFeedbackMessage(ongoingDonationMessage);
      setFeedbackVariant('info');
      return;
    }

    if (drive.organization_id && !drive.membership?.is_active) {
      setMembershipFeedback({ message: '', variant: 'info' });
      setIsMembershipPromptOpen(true);
      return;
    }

    if (drive.registration?.registration_id) {
      setDriveQrPayload(buildDriveInvitationQrPayload({ drive, registration: drive.registration }));
      return;
    }

    if (!profile?.user_id) {
      setFeedbackMessage('Your donor account is required before joining this event.');
      setFeedbackVariant('info');
      return;
    }

    setIsSubmittingRsvp(true);
    const result = await createDonationDriveRegistration({
      driveId: drive.donation_drive_id,
      databaseUserId: profile.user_id,
    });
    setIsSubmittingRsvp(false);

    if (result.error || !result.data?.registration_id) {
      setFeedbackMessage(result.error?.message || 'Event RSVP could not be saved right now.');
      setFeedbackVariant('error');
      return;
    }

    const refreshedDrive = await refreshDriveRegistration();
    const nextDrive = refreshedDrive || drive;
    const registration = refreshedDrive?.registration || result.data;
    setDriveQrPayload(buildDriveInvitationQrPayload({ drive: nextDrive, registration }));
    setFeedbackMessage(result.alreadyRegistered ? 'Event QR loaded.' : 'Event RSVP saved. Present this QR on event day.');
    setFeedbackVariant('success');
  }, [
    drive,
    hasOngoingDonation,
    hasRecentHairEligibility,
    ongoingDonationMessage,
    profile?.user_id,
    refreshDriveRegistration,
    router,
  ]);

  const handleJoinOrganization = React.useCallback(async () => {
    if (!drive?.organization_id || !profile?.user_id) {
      setMembershipFeedback({
        message: 'Your donor account is required before joining an organization.',
        variant: 'info',
      });
      return;
    }

    setIsJoiningOrganization(true);
    const result = await joinOrganizationMembership({
      organizationId: drive.organization_id,
      databaseUserId: profile.user_id,
    });
    setIsJoiningOrganization(false);

    if (result.error) {
      setMembershipFeedback({
        message: 'Organization membership could not be saved right now.',
        variant: 'error',
      });
      return;
    }

    const refreshed = await fetchDonationDrivePreview(drive.donation_drive_id, profile.user_id);
    if (refreshed.data) {
      setDrive(refreshed.data);
    }

    setMembershipFeedback({
      message: result.alreadyMember ? 'You are already a member.' : 'Organization joined.',
      variant: 'success',
    });
    setIsMembershipPromptOpen(false);
  }, [drive, profile?.user_id]);

  const handleNavPress = (item) => {
    if (!item.route) return;
    router.navigate(item.route);
  };

  return (
    <DashboardLayout
      showSupportChat
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        style={[styles.backIconButton, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}
      >
        <AppIcon name="arrowLeft" state="muted" />
      </Pressable>

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
            {driveImageUrl ? (
              <Image source={{ uri: driveImageUrl }} style={styles.driveHeroImage} resizeMode="cover" />
            ) : null}
            <View style={styles.titleRow}>
              <View style={[styles.iconChip, { backgroundColor: roles.iconPrimarySurface }]}>
                <AppIcon name="donations" size="md" state="default" color={roles.iconPrimaryColor} />
              </View>
              <View style={styles.titleCopy}>
                <Text style={[styles.statusText, { color: roles.metaText }]}>
                  {drive.status || 'Upcoming'}
                </Text>
                <Text style={[styles.driveTitle, { color: roles.headingText }]}>{drive.event_title}</Text>
              </View>
            </View>

            <View style={styles.metaBlock}>
              <DetailMetaRow icon="organization" text={drive.organization_name} />
              <DetailMetaRow icon="appointment" text={formatDriveDate(drive.start_date, drive.end_date)} />
              <DetailMetaRow icon="location" text={drive.address_label || drive.location_label} />
              <DetailMetaRow
                icon="organization"
                text={drive.membership?.is_active
                  ? 'Organization membership is active.'
                  : 'Join organization to continue.'}
              />
            </View>

            <View style={styles.actionRow}>
              <AppButton
                title={drive.organization_id && !drive.membership?.is_active
                  ? 'Join organization'
                  : hasRecentHairEligibility
                    ? (drive.registration?.registration_id ? 'View Event QR' : 'RSVP and Generate QR')
                    : 'Start CheckHair'}
                fullWidth={false}
                onPress={drive.organization_id && !drive.membership?.is_active
                  ? () => setIsMembershipPromptOpen(true)
                  : hasRecentHairEligibility
                    ? handleDriveRsvp
                    : handleStartCheckHair}
                loading={isSubmittingRsvp}
                disabled={hasOngoingDonation && !drive.registration?.registration_id}
                style={styles.primaryActionButton}
              />
            </View>

            {hasOngoingDonation ? (
              <Text style={[styles.guardText, { color: roles.metaText }]}>
                {ongoingDonationMessage}
              </Text>
            ) : null}
          </AppCard>

          {drive.event_overview ? (
            <AppCard variant="default" radius="xl" padding="lg">
              <Text style={[styles.sectionTitle, { color: roles.headingText }]}>Overview</Text>
              <Text style={[styles.overviewText, { color: roles.bodyText }]}>{drive.event_overview}</Text>
            </AppCard>
          ) : null}

          {driveQrPayload ? (
            <AppCard variant="default" radius="xl" padding="lg">
              <Text style={[styles.sectionTitle, { color: roles.headingText }]}>Event entry QR</Text>
              <View style={styles.qrWrap}>
                <Image source={{ uri: buildQrImageUrl(driveQrPayload, 320) }} style={styles.qrImage} resizeMode="contain" />
              </View>
              <Text style={[styles.qrHelper, { color: roles.bodyText }]}>
                This QR is generated from your Donation_Drive_Registrations record for this event. Staff will scan it at the donation site.
              </Text>
            </AppCard>
          ) : null}
        </>
      ) : (
        <Text style={[styles.emptyText, { color: roles.bodyText }]}>Drive details are not available right now.</Text>
      )}

      <DriveMembershipPrompt
        visible={isMembershipPromptOpen}
        drive={drive}
        feedbackMessage={membershipFeedback.message}
        feedbackVariant={membershipFeedback.variant}
        isJoining={isJoiningOrganization}
        onClose={() => {
          setIsMembershipPromptOpen(false);
          setMembershipFeedback({ message: '', variant: 'info' });
        }}
        onJoin={handleJoinOrganization}
      />

    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  backIconButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
    alignSelf: 'flex-start',
  },
  bannerGap: {
    marginBottom: theme.spacing.sm,
  },
  sectionGap: {
    marginBottom: theme.spacing.md,
  },
  driveHeroImage: {
    width: '100%',
    height: 180,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.backgroundMuted,
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  primaryActionButton: {
    alignSelf: 'flex-start',
  },
  guardText: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(25, 21, 17, 0.44)',
  },
  modalCard: {
    gap: theme.spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
  },
  modalBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  modalBanner: {
    marginTop: theme.spacing.xs,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  qrWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
  },
  qrImage: {
    width: 240,
    height: 240,
  },
  qrHelper: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
});
