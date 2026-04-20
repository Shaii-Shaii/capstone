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
  createDonationDriveRsvp,
  fetchDonationDriveDetail,
  fetchDonationDrivePreview,
  joinOrganizationMembership,
} from '../../../src/features/donorHome.api';
import {
  buildDriveInvitationQrPayload,
  buildQrImageUrl,
  formatQrCountdownLabel,
  generateDonationQrPdf,
  getDonorDonationsModuleData,
  isQrSharingSupported,
  shareDonationQrPdf,
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
            {drive?.organization_name || 'This organization'} requires membership before you can RSVP for its donation drive.
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

function DriveQrModal({
  visible,
  payload,
  title,
  subtitle,
  helperText,
  countdownText,
  isSaving,
  onClose,
  onSave,
  onRegenerate,
  canRegenerate = false,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.modalCard}>
          <Text style={[styles.modalEyebrow, { color: roles.metaText }]}>Drive QR</Text>
          <Text style={[styles.modalTitle, { color: roles.headingText }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.modalBody, { color: roles.bodyText }]}>{subtitle}</Text>
          ) : null}
          <View style={styles.qrWrap}>
            <Image source={{ uri: buildQrImageUrl(payload, 420) }} style={styles.qrImage} resizeMode="contain" />
          </View>
          {helperText ? (
            <Text style={[styles.qrHelper, { color: roles.metaText }]}>{helperText}</Text>
          ) : null}
          {countdownText ? (
            <Text style={[styles.qrHelper, { color: roles.metaText }]}>{countdownText}</Text>
          ) : null}
          <View style={styles.modalActions}>
            <AppButton title="Close" variant="ghost" fullWidth={false} onPress={onClose} />
            <AppButton title="Save QR" fullWidth={false} onPress={onSave} loading={isSaving} />
            {canRegenerate ? (
              <AppButton title="Generate new QR" variant="outline" fullWidth={false} onPress={onRegenerate} />
            ) : null}
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
  const [isSubmittingRsvp, setIsSubmittingRsvp] = React.useState(false);
  const [isJoiningOrganization, setIsJoiningOrganization] = React.useState(false);
  const [isMembershipPromptOpen, setIsMembershipPromptOpen] = React.useState(false);
  const [membershipFeedback, setMembershipFeedback] = React.useState({ message: '', variant: 'info' });
  const [qrSheet, setQrSheet] = React.useState(null);
  const [qrNowMs, setQrNowMs] = React.useState(Date.now());
  const [qrSharingAvailable, setQrSharingAvailable] = React.useState(false);
  const [isSavingQr, setIsSavingQr] = React.useState(false);
  const [donationFlowState, setDonationFlowState] = React.useState({
    hasOngoingDonation: false,
    ongoingDonationMessage: '',
  });

  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim();
  const donorIdentity = React.useMemo(() => ({
    user_id: profile?.user_id || null,
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    email: profile?.email || user?.email || '',
  }), [profile?.email, profile?.first_name, profile?.last_name, profile?.user_id, user?.email]);

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
    });
    setIsLoading(false);
  }, [driveId, profile?.user_id, user?.id]);

  React.useEffect(() => {
    loadDrive();
  }, [loadDrive]);

  React.useEffect(() => {
    let isMounted = true;

    const checkQrSharing = async () => {
      const available = await isQrSharingSupported();
      if (isMounted) {
        setQrSharingAvailable(available);
      }
    };

    checkQrSharing();
    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!qrSheet?.expiresAt || qrSheet?.isConfirmed) {
      return undefined;
    }

    setQrNowMs(Date.now());
    const timer = setInterval(() => {
      setQrNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [qrSheet?.expiresAt, qrSheet?.isConfirmed]);

  const hasOngoingDonation = Boolean(donationFlowState.hasOngoingDonation);
  const ongoingDonationMessage = donationFlowState.ongoingDonationMessage
    || 'You already have an ongoing donation. Please complete or wait for the current donation process to finish before starting a new one.';

  const buildDriveQrSheet = React.useCallback((nextDrive, registration) => {
    const payload = buildDriveInvitationQrPayload({
      drive: nextDrive,
      registration,
      donor: donorIdentity,
    });

    setQrSheet({
      title: 'Drive invitation QR',
      subtitle: 'Present this QR at the donation drive.',
      helperText: registration?.qr?.is_activated
        ? 'This QR is activated and stays official for this drive registration.'
        : registration?.qr?.is_expired
          ? 'This QR expired before staff used it. Generate a new QR to continue.'
          : 'This QR stays valid for 15 minutes unless staff activates it first.',
      payload,
      expiresAt: registration?.qr?.expires_at || '',
      isConfirmed: Boolean(registration?.qr?.is_activated),
      canRegenerate: Boolean(registration?.qr?.can_regenerate),
    });
  }, [donorIdentity]);

  const performDriveRsvp = React.useCallback(async () => {
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

    const refreshed = await fetchDonationDrivePreview(drive.donation_drive_id, profile.user_id);
    const nextDrive = refreshed.data || {
      ...drive,
      registration: result.data,
      can_rsvp: false,
    };

    setDrive(nextDrive);
    setFeedbackMessage(result.regenerated ? 'Expired QR replaced with a new one.' : result.alreadyRegistered ? 'RSVP already saved.' : 'RSVP saved.');
    setFeedbackVariant('success');
    buildDriveQrSheet(nextDrive, nextDrive.registration || result.data);
  }, [buildDriveQrSheet, drive, profile?.user_id]);

  const handleRsvp = React.useCallback(async () => {
    if (!drive) return;

    if (hasOngoingDonation && !drive.registration) {
      setFeedbackMessage(ongoingDonationMessage);
      setFeedbackVariant('info');
      return;
    }

    if (drive.organization_id && !drive.membership?.is_active && !drive.registration) {
      setMembershipFeedback({ message: '', variant: 'info' });
      setIsMembershipPromptOpen(true);
      return;
    }

    await performDriveRsvp();
  }, [drive, hasOngoingDonation, ongoingDonationMessage, performDriveRsvp]);

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
      message: result.alreadyMember ? 'You are already a member.' : 'Organization joined. You can continue to RSVP.',
      variant: 'success',
    });
    setIsMembershipPromptOpen(false);
    await performDriveRsvp();
  }, [drive, performDriveRsvp, profile?.user_id]);

  const handleViewQr = React.useCallback(() => {
    if (!drive?.registration) return;
    buildDriveQrSheet(drive, drive.registration);
  }, [buildDriveQrSheet, drive]);

  const handleRegenerateQr = React.useCallback(async () => {
    if (!drive?.donation_drive_id || !profile?.user_id) {
      return;
    }

    const result = await createDonationDriveRsvp({
      driveId: drive.donation_drive_id,
      databaseUserId: profile.user_id,
      organizationId: drive.organization_id || null,
    });

    if (result.error) {
      setFeedbackMessage('A new drive QR could not be generated right now.');
      setFeedbackVariant('error');
      return;
    }

    const refreshed = await fetchDonationDrivePreview(drive.donation_drive_id, profile.user_id);
    const nextDrive = refreshed.data || {
      ...drive,
      registration: result.data,
      can_rsvp: false,
    };
    setDrive(nextDrive);
    setFeedbackMessage(result.regenerated ? 'A new drive QR is ready.' : 'Your current drive QR is still valid.');
    setFeedbackVariant('success');
    buildDriveQrSheet(nextDrive, nextDrive.registration || result.data);
  }, [buildDriveQrSheet, drive, profile?.user_id]);

  const handleSaveQr = React.useCallback(async () => {
    if (!qrSheet?.payload) return;

    setIsSavingQr(true);
    try {
      const file = await generateDonationQrPdf({
        title: qrSheet.title,
        subtitle: qrSheet.subtitle,
        helperText: qrSheet.helperText,
        qrPayloadText: qrSheet.payload,
      });

      if (qrSharingAvailable) {
        await shareDonationQrPdf(file.uri);
      }

      setFeedbackMessage(qrSharingAvailable ? 'QR PDF is ready to save or share.' : `QR PDF generated at ${file.uri}.`);
      setFeedbackVariant('success');
    } catch (error) {
      setFeedbackMessage(error.message || 'Unable to save the QR right now.');
      setFeedbackVariant('error');
    } finally {
      setIsSavingQr(false);
    }
  }, [qrSheet, qrSharingAvailable]);

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
              <DetailMetaRow
                icon="organization"
                text={drive.registration
                  ? drive.registration?.qr?.is_activated
                    ? 'QR activated for this drive.'
                    : drive.registration?.qr?.is_expired
                      ? 'QR expired. Generate a new one to continue.'
                      : drive.registration?.qr?.is_pending
                        ? `Pending activation. ${formatQrCountdownLabel(drive.registration?.qr?.expires_at, qrNowMs)}`
                        : 'Drive RSVP already saved.'
                  : drive.membership?.is_active
                    ? 'Organization membership is active.'
                    : 'Membership required before RSVP.'}
              />
            </View>

            <View style={styles.actionRow}>
              {drive.registration?.qr?.is_valid ? (
                <AppButton
                  title="Show my QR"
                  fullWidth={false}
                  onPress={handleViewQr}
                  style={styles.rsvpButton}
                />
              ) : (
                <AppButton
                  title={drive.registration?.qr?.can_regenerate ? 'Generate new QR' : 'RSVP'}
                  fullWidth={false}
                  onPress={handleRsvp}
                  disabled={hasOngoingDonation}
                  loading={isSubmittingRsvp}
                  style={styles.rsvpButton}
                />
              )}
            </View>

            {hasOngoingDonation && !drive.registration ? (
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

      <DriveQrModal
        visible={Boolean(qrSheet)}
        title={qrSheet?.title || ''}
        subtitle={qrSheet?.subtitle || ''}
        helperText={qrSheet?.helperText || ''}
        payload={qrSheet?.payload || ''}
        countdownText={qrSheet?.isConfirmed ? '' : formatQrCountdownLabel(qrSheet?.expiresAt || '', qrNowMs)}
        isSaving={isSavingQr}
        onClose={() => setQrSheet(null)}
        onSave={handleSaveQr}
        onRegenerate={handleRegenerateQr}
        canRegenerate={Boolean(qrSheet?.canRegenerate)}
      />
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rsvpButton: {
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
