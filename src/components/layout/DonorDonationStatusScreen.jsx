import React from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { DashboardLayout } from './DashboardLayout';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { AppInput } from '../ui/AppInput';
import { StatusBanner } from '../ui/StatusBanner';
import { DonorTopBar } from '../donor/DonorTopBar';
import { DonorCertificatePreview } from '../donor/DonorCertificatePreview';
import { donorDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuthActions } from '../../features/auth/hooks/useAuthActions';
import { useDonorCertificate } from '../../hooks/useDonorCertificate';
import { createDonationDriveRsvp, fetchDonationDrivePreview } from '../../features/donorHome.api';
import {
  buildDriveInvitationQrPayload,
  buildIndependentDonationQrPayload,
  buildQrImageUrl,
  generateDonationQrPdf,
  getDonorDonationsModuleData,
  isQrSharingSupported,
  saveManualDonationQualification,
  saveIndependentDonationParcelLog,
  shareDonationQrPdf,
} from '../../features/donorDonations.service';
import { resolveThemeRoles, theme } from '../../design-system/theme';

const AGREEMENT_COPY = [
  'This donation is voluntary and made independently by the donor.',
  'You agree to prepare and ship the parcel yourself.',
  'The parcel will be sent to Hair for Hope for monitoring and next-step handling.',
  'The generated QR code must be attached to the parcel so staff can scan it and update donation status.',
];

const MANUAL_ENTRY_PATHS = {
  ai: 'ai',
  manual: 'manual',
};

const MANUAL_FORM_DEFAULTS = {
  lengthValue: '',
  lengthUnit: 'in',
  treated: 'no',
  colored: 'no',
  trimmed: 'no',
  hairColor: 'Natural black',
  density: 'Medium density',
};

const LENGTH_UNIT_OPTIONS = [
  { label: 'Inches', value: 'in' },
  { label: 'Centimeters', value: 'cm' },
];

const YES_NO_OPTIONS = [
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' },
];

const HAIR_COLOR_OPTIONS = [
  { label: 'Natural black', value: 'Natural black' },
  { label: 'Dark brown', value: 'Dark brown' },
  { label: 'Medium brown', value: 'Medium brown' },
  { label: 'Light brown', value: 'Light brown' },
  { label: 'Blonde', value: 'Blonde' },
  { label: 'Gray', value: 'Gray' },
  { label: 'Other natural shade', value: 'Other natural shade' },
];

const MANUAL_DENSITY_OPTIONS = [
  { label: 'Light density', value: 'Light density' },
  { label: 'Medium density', value: 'Medium density' },
  { label: 'Heavy density', value: 'Heavy density' },
];

const formatDriveDate = (startDate, endDate) => {
  if (!startDate) return 'Date to follow';
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  const formatter = new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (!end) return formatter.format(start);
  return `${formatter.format(start)} - ${formatter.format(end)}`;
};

const buildDonorIdentity = ({ profile, user }) => ({
  databaseUserId: profile?.user_id || null,
  name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || user?.email || 'Donor',
  email: user?.email || profile?.email || '',
});

function SectionTitle({ eyebrow, title, body }) {
  return (
    <View style={styles.sectionTitleWrap}>
      {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {body ? <Text style={styles.sectionBody}>{body}</Text> : null}
    </View>
  );
}

function DriveListCard({ drive, onPress }) {
  return (
    <Pressable onPress={() => onPress?.(drive)} style={({ pressed }) => [styles.drivePressable, pressed ? styles.pressableActive : null]}>
      <AppCard variant="default" radius="xl" padding="md" style={styles.driveCard}>
        <View style={styles.driveCardTop}>
          <View style={styles.driveOrganizationWrap}>
            {drive.organization_logo_url ? (
              <Image source={{ uri: drive.organization_logo_url }} style={styles.driveLogo} resizeMode="cover" />
            ) : (
              <View style={styles.driveLogoFallback}>
                <AppIcon name="organization" size="sm" state="active" />
              </View>
            )}
            <View style={styles.driveCardCopy}>
              <Text style={styles.driveStatus}>{drive.status || 'Upcoming'}</Text>
              <Text numberOfLines={2} style={styles.driveTitle}>{drive.event_title || 'Donation drive'}</Text>
            </View>
          </View>
          <AppIcon name="chevron-right" size="sm" state="muted" />
        </View>

        <View style={styles.driveMetaBlock}>
          <View style={styles.inlineMeta}>
            <AppIcon name="appointment" size="sm" state="muted" />
            <Text style={styles.inlineMetaText}>{formatDriveDate(drive.start_date, drive.end_date)}</Text>
          </View>
          <View style={styles.inlineMeta}>
            <AppIcon name="location" size="sm" state="muted" />
            <Text style={styles.inlineMetaText}>{drive.location_label || drive.address_label || 'Location to follow'}</Text>
          </View>
          <View style={styles.inlineMeta}>
            <AppIcon name="organization" size="sm" state="muted" />
            <Text style={styles.inlineMetaText}>{drive.organization_name || 'Partner organization'}</Text>
          </View>
        </View>
      </AppCard>
    </Pressable>
  );
}

function PathCard({ icon, title, body, actionLabel, onPress, disabled = false }) {
  return (
    <AppCard variant="elevated" radius="xl" padding="lg">
      <View style={styles.pathHeader}>
        <View style={styles.pathIconWrap}>
          <AppIcon name={icon} size="md" state="active" />
        </View>
        <View style={styles.pathCopy}>
          <Text style={styles.pathTitle}>{title}</Text>
          <Text style={styles.pathBody}>{body}</Text>
        </View>
      </View>
      <AppButton title={actionLabel} fullWidth={false} onPress={onPress} disabled={disabled} />
    </AppCard>
  );
}

function ChoiceField({ label, value, options, onChange, helperText }) {
  return (
    <View style={styles.choiceField}>
      <Text style={styles.choiceFieldLabel}>{label}</Text>
      <View style={styles.choiceChipWrap}>
        {options.map((option) => {
          const isActive = value === option.value;
          return (
            <Pressable
              key={`${label}-${option.value}`}
              onPress={() => onChange?.(option.value)}
              style={[styles.choiceChip, isActive ? styles.choiceChipActive : null]}
            >
              <Text style={[styles.choiceChipText, isActive ? styles.choiceChipTextActive : null]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {helperText ? <Text style={styles.choiceFieldHelper}>{helperText}</Text> : null}
    </View>
  );
}

function TimelineStageCard({ stage }) {
  return (
    <View style={[styles.timelineStageCard, stage.state === 'completed' ? styles.timelineStageCompleted : null, stage.state === 'current' ? styles.timelineStageCurrent : null]}>
      <View style={styles.timelineStageHeader}>
        <View style={[styles.timelineDot, stage.state === 'completed' ? styles.timelineDotCompleted : stage.state === 'current' ? styles.timelineDotCurrent : styles.timelineDotUpcoming]} />
        <View style={styles.timelineStageCopy}>
          <Text style={styles.timelineStageTitle}>{stage.label}</Text>
          <Text style={styles.timelineStageDescription}>{stage.description}</Text>
        </View>
        <Text style={styles.timelineStageBadge}>
          {stage.state === 'completed' ? 'Done' : stage.state === 'current' ? 'Current' : 'Waiting'}
        </Text>
      </View>
      {stage.timestampLabel ? <Text style={styles.timelineTimestamp}>{stage.timestampLabel}</Text> : null}
      {stage.images?.length ? (
        <View style={styles.timelineImageRow}>
          {stage.images.slice(0, 2).map((image) => (
            image?.signed_url ? (
              <Image
                key={image.image_id || image.file_path}
                source={{ uri: image.signed_url }}
                style={styles.timelineImage}
                resizeMode="cover"
              />
            ) : null
          ))}
        </View>
      ) : null}
    </View>
  );
}

function UpdateEventCard({ event }) {
  return (
    <View style={styles.updateEventCard}>
      <View style={styles.updateTopRow}>
        <Text style={styles.updateTitle}>{event.title}</Text>
        {event.badge ? <Text style={styles.updateBadge}>{event.badge}</Text> : null}
      </View>
      <Text style={styles.updateBody}>{event.description}</Text>
      {event.imageUrl ? <Image source={{ uri: event.imageUrl }} style={styles.updateImage} resizeMode="cover" /> : null}
      {event.timestamp ? <Text style={styles.updateTimestamp}>{event.timestamp}</Text> : null}
    </View>
  );
}

function QrModal({
  visible,
  title,
  subtitle,
  helperText,
  qrPayload,
  onClose,
  onSave,
  isSaving,
}) {
  if (!visible || !qrPayload) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalBody}>{subtitle}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>

          <View style={styles.qrPreviewWrap}>
            <Image source={{ uri: buildQrImageUrl(qrPayload, 420) }} style={styles.qrPreviewImage} resizeMode="contain" />
          </View>

          {helperText ? <Text style={styles.qrHelper}>{helperText}</Text> : null}

          <View style={styles.modalActionRow}>
            <AppButton title="Close" variant="outline" fullWidth={false} onPress={onClose} />
            <AppButton title="Save QR PDF" fullWidth={false} onPress={onSave} loading={isSaving} />
          </View>
        </AppCard>
      </View>
    </Modal>
  );
}

function AgreementModal({
  visible,
  accepted,
  onToggle,
  onClose,
  onContinue,
}) {
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>Independent donor agreement</Text>
              <Text style={styles.modalBody}>Review and accept this before generating the parcel-tracking QR.</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>

          <View style={styles.agreementList}>
            {AGREEMENT_COPY.map((item) => (
              <View key={item} style={styles.agreementRow}>
                <View style={styles.agreementDot} />
                <Text style={styles.agreementText}>{item}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={onToggle} style={styles.checkboxRow}>
            <View style={[styles.checkboxBox, accepted ? styles.checkboxBoxActive : null]}>
              <AppIcon name={accepted ? 'checkbox-marked' : 'checkbox-blank-outline'} state={accepted ? 'inverse' : 'muted'} />
            </View>
            <Text style={styles.checkboxLabel}>I understand and agree to continue as an independent donor.</Text>
          </Pressable>

          <View style={styles.modalActionRow}>
            <AppButton title="Cancel" variant="outline" fullWidth={false} onPress={onClose} />
            <AppButton title="Continue" fullWidth={false} onPress={onContinue} disabled={!accepted} />
          </View>
        </AppCard>
      </View>
    </Modal>
  );
}

function DriveDetailModal({
  visible,
  drive,
  onClose,
  onRsvp,
  onViewQr,
  isSubmitting,
  feedbackMessage,
  feedbackVariant,
}) {
  if (!visible || !drive) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>{drive.event_title || 'Donation drive'}</Text>
              <Text style={styles.modalBody}>{drive.organization_name || 'Partner organization'}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>

          {drive.organization_logo_url ? (
            <Image source={{ uri: drive.organization_logo_url }} style={styles.detailBannerImage} resizeMode="cover" />
          ) : (
            <View style={styles.detailBannerFallback}>
              <AppIcon name="organization" size="lg" state="active" />
            </View>
          )}

          <View style={styles.driveMetaBlock}>
            <View style={styles.inlineMeta}>
              <AppIcon name="appointment" size="sm" state="muted" />
              <Text style={styles.inlineMetaText}>{formatDriveDate(drive.start_date, drive.end_date)}</Text>
            </View>
            <View style={styles.inlineMeta}>
              <AppIcon name="location" size="sm" state="muted" />
              <Text style={styles.inlineMetaText}>{drive.address_label || drive.location_label || 'Location to follow'}</Text>
            </View>
            <View style={styles.inlineMeta}>
              <AppIcon name="organization" size="sm" state="muted" />
              <Text style={styles.inlineMetaText}>{drive.organization_name || 'Partner organization'}</Text>
            </View>
          </View>

          {feedbackMessage ? <StatusBanner message={feedbackMessage} variant={feedbackVariant} style={styles.inlineBanner} /> : null}

          {drive.short_overview || drive.event_overview ? (
            <Text style={styles.modalOverviewText}>{drive.event_overview || drive.short_overview}</Text>
          ) : null}

          <View style={styles.modalActionRow}>
            <AppButton title="Close" variant="outline" fullWidth={false} onPress={onClose} />
            {drive.registration ? (
              <AppButton title="View invitation QR" variant="secondary" fullWidth={false} onPress={onViewQr} />
            ) : null}
            <AppButton
              title={drive.registration ? 'RSVP saved' : 'RSVP'}
              fullWidth={false}
              onPress={onRsvp}
              disabled={Boolean(drive.registration)}
              loading={isSubmitting}
            />
          </View>
        </AppCard>
      </View>
    </Modal>
  );
}

export function DonorDonationStatusScreen() {
  const router = useRouter();
  const { user, profile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const { logout, isLoading: isLoggingOut } = useAuthActions();
  const { unreadCount } = useNotifications({ role: 'donor', userId: user?.id, databaseUserId: profile?.user_id });
  const {
    certificate,
    generatedFileUri,
    isLoadingCertificate,
    isGeneratingCertificate,
    isSharingAvailable,
    certificateError,
    generateCertificate,
    shareCertificate,
  } = useDonorCertificate({ userId: user?.id, profile: { ...profile, email: user?.email || '' } });

  const [moduleData, setModuleData] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [screenError, setScreenError] = React.useState('');
  const [selectedDrive, setSelectedDrive] = React.useState(null);
  const [isDriveDetailOpen, setIsDriveDetailOpen] = React.useState(false);
  const [isLoadingDrivePreview, setIsLoadingDrivePreview] = React.useState(false);
  const [driveFeedback, setDriveFeedback] = React.useState({ message: '', variant: 'info' });
  const [isSubmittingRsvp, setIsSubmittingRsvp] = React.useState(false);
  const [isAgreementOpen, setIsAgreementOpen] = React.useState(false);
  const [agreementAccepted, setAgreementAccepted] = React.useState(false);
  const [hasUnlockedIndependentFlow, setHasUnlockedIndependentFlow] = React.useState(false);
  const [qrSheet, setQrSheet] = React.useState(null);
  const [isSavingQr, setIsSavingQr] = React.useState(false);
  const [qrSharingAvailable, setQrSharingAvailable] = React.useState(false);
  const [isUploadingParcel, setIsUploadingParcel] = React.useState(false);
  const [parcelFeedback, setParcelFeedback] = React.useState({ message: '', variant: 'info' });
  const [entryPath, setEntryPath] = React.useState(null);
  const [manualForm, setManualForm] = React.useState(MANUAL_FORM_DEFAULTS);
  const [manualFormErrors, setManualFormErrors] = React.useState({});
  const [manualPhoto, setManualPhoto] = React.useState(null);
  const [manualFeedback, setManualFeedback] = React.useState({ message: '', variant: 'info' });
  const [isSavingManual, setIsSavingManual] = React.useState(false);

  const donorIdentity = React.useMemo(
    () => buildDonorIdentity({ profile, user }),
    [profile, user]
  );
  const avatarInitials = `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.trim();

  const loadModuleData = React.useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setScreenError('');

    const result = await getDonorDonationsModuleData({
      userId: user.id,
      databaseUserId: profile?.user_id || null,
    });

    setModuleData(result);
    setIsLoading(false);
    if (result.error) {
      setScreenError(result.error);
    }
  }, [profile?.user_id, user?.id]);

  React.useEffect(() => {
    loadModuleData();
  }, [loadModuleData]);

  React.useEffect(() => {
    let isMounted = true;

    const loadQrSharing = async () => {
      const supported = await isQrSharingSupported();
      if (isMounted) {
        setQrSharingAvailable(supported);
      }
    };

    loadQrSharing();

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (moduleData?.isAiEligible) {
      if (!entryPath) {
        setEntryPath(MANUAL_ENTRY_PATHS.ai);
      }
      return;
    }

    if (!entryPath || entryPath === MANUAL_ENTRY_PATHS.ai) {
      setEntryPath(MANUAL_ENTRY_PATHS.manual);
    }
  }, [entryPath, moduleData?.isAiEligible]);

  const latestAnalysisDecision = moduleData?.latestScreening?.decision || '';
  const latestAnalysisCondition = moduleData?.latestScreening?.detected_condition || '';
  const latestAiDonation = moduleData?.latestAiDonation || null;
  const latestManualDonation = moduleData?.latestManualDonation || null;
  const selectedDonationRecord = entryPath === MANUAL_ENTRY_PATHS.manual
    ? latestManualDonation
    : latestAiDonation;
  const selectedPathIsQualified = Boolean(selectedDonationRecord?.qualification?.isQualified);
  const fallbackQualifiedRecord = latestManualDonation?.qualification?.isQualified
    ? latestManualDonation
    : latestAiDonation?.qualification?.isQualified
      ? latestAiDonation
      : null;
  const qualifiedDonationRecord = selectedPathIsQualified ? selectedDonationRecord : fallbackQualifiedRecord;
  const qualifiedSubmission = qualifiedDonationRecord?.submission || null;
  const qualifiedDetail = qualifiedDonationRecord?.detail || null;
  const qualifiedScreening = qualifiedDonationRecord?.screening || null;
  const latestRecommendations = qualifiedDonationRecord?.recommendations || moduleData?.latestRecommendations || [];
  const manualQualificationReason = moduleData?.latestManualDonation?.qualification?.reason || '';
  const donationReady = Boolean(qualifiedDonationRecord?.qualification?.isQualified);
  const aiPathReady = Boolean(moduleData?.isAiEligible);
  const activeQualificationSource = selectedPathIsQualified
    ? qualifiedDonationRecord?.source || ''
    : moduleData?.activeQualificationSource || '';
  const hasIndependentProgress = Boolean(
    moduleData?.parcelImages?.length
    || moduleData?.logistics
    || moduleData?.trackingEntries?.length
    || moduleData?.certificate
  );

  const activeEntryHeadline = donationReady
    ? activeQualificationSource === 'manual'
      ? 'Manual donor details are active'
      : 'Latest hair analysis is active'
    : 'Choose how you want to qualify for donation';

  const handleNavPress = React.useCallback((item) => {
    if (!item.route || item.route === '/donor/status') return;
    router.navigate(item.route);
  }, [router]);

  const updateManualField = React.useCallback((field, value) => {
    setManualForm((current) => ({
      ...current,
      [field]: value,
    }));
    setManualFormErrors((current) => ({
      ...current,
      [field]: '',
      photo: field === 'photo' ? '' : current.photo,
    }));
  }, []);

  const handlePickManualPhoto = React.useCallback(async (mode = 'library') => {
    const picker = mode === 'camera'
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await picker({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.72,
      base64: true,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];
    setManualPhoto({
      uri: asset.uri,
      base64: asset.base64 || '',
      mimeType: asset.mimeType || 'image/jpeg',
      fileName: asset.fileName || '',
    });
    setManualFormErrors((current) => ({
      ...current,
      photo: '',
    }));
  }, []);

  const handleSaveManualDetails = React.useCallback(async () => {
    const nextErrors = {};
    const numericLength = Number(manualForm.lengthValue);

    if (!Number.isFinite(numericLength) || numericLength <= 0) {
      nextErrors.lengthValue = 'Enter the current hair length using numbers only.';
    }

    if (!manualPhoto) {
      nextErrors.photo = 'Please upload or capture a hair photo for the donation record.';
    }

    if (Object.keys(nextErrors).length) {
      setManualFormErrors(nextErrors);
      return;
    }

    setIsSavingManual(true);
    const result = await saveManualDonationQualification({
      userId: user?.id,
      databaseUserId: profile?.user_id || null,
      manualDetails: {
        length_value: numericLength,
        length_unit: manualForm.lengthUnit,
        treated: manualForm.treated,
        colored: manualForm.colored,
        trimmed: manualForm.trimmed,
        hair_color: manualForm.hairColor,
        density: manualForm.density,
      },
      photo: manualPhoto,
      donationRequirement: moduleData?.latestDonationRequirement || null,
    });
    setIsSavingManual(false);

    if (!result.success) {
      setManualFeedback({
        message: result.error || 'Unable to save manual donor details right now.',
        variant: 'error',
      });
      return;
    }

    setManualFeedback({
      message: result.canProceed
        ? 'Manual donor details saved. You can now continue to donation drives or the independent donation flow.'
        : result.qualification?.reason || 'Manual donor details were saved, but the current criteria do not qualify for donation yet.',
      variant: result.canProceed ? 'success' : 'info',
    });
    setEntryPath(MANUAL_ENTRY_PATHS.manual);
    setHasUnlockedIndependentFlow(false);
    await loadModuleData();
  }, [loadModuleData, manualForm, manualPhoto, moduleData?.latestDonationRequirement, profile?.user_id, user?.id]);

  const handleOpenDrive = React.useCallback(async (drive) => {
    if (!drive?.donation_drive_id) return;

    setIsDriveDetailOpen(true);
    setDriveFeedback({ message: '', variant: 'info' });
    setSelectedDrive(drive);
    setIsLoadingDrivePreview(true);

    const result = await fetchDonationDrivePreview(drive.donation_drive_id, profile?.user_id || null);
    setIsLoadingDrivePreview(false);
    if (result.error) {
      setDriveFeedback({ message: 'Drive details could not be refreshed right now.', variant: 'error' });
    }
    if (result.data) {
      setSelectedDrive(result.data);
    }
  }, [profile?.user_id]);

  const handleRsvp = React.useCallback(async () => {
    if (!selectedDrive?.donation_drive_id || !profile?.user_id) {
      setDriveFeedback({ message: 'Your donor account is required before sending an RSVP.', variant: 'info' });
      return;
    }

    setIsSubmittingRsvp(true);
    const result = await createDonationDriveRsvp({
      driveId: selectedDrive.donation_drive_id,
      databaseUserId: profile.user_id,
      organizationId: selectedDrive.organization_id || null,
    });
    setIsSubmittingRsvp(false);

    if (result.error) {
      setDriveFeedback({ message: 'RSVP could not be saved right now. Please try again.', variant: 'error' });
      return;
    }

    const nextDrive = {
      ...selectedDrive,
      registration: result.data,
      can_rsvp: false,
    };
    setSelectedDrive(nextDrive);
    setDriveFeedback({
      message: result.alreadyRegistered ? 'You already saved an RSVP for this drive.' : 'RSVP saved. Your invitation QR is ready.',
      variant: 'success',
    });

    const qrPayload = buildDriveInvitationQrPayload({
      drive: nextDrive,
      registration: result.data,
      donor: donorIdentity,
    });
    setQrSheet({
      title: 'Drive invitation QR',
      subtitle: 'Present this QR when you arrive at the donation drive so staff can scan your RSVP.',
      helperText: 'Keep this QR ready on your phone or save it as a PDF before your visit.',
      payload: qrPayload,
    });
  }, [donorIdentity, profile?.user_id, selectedDrive]);

  const handleViewSavedDriveQr = React.useCallback(() => {
    if (!selectedDrive?.registration) return;

    const qrPayload = buildDriveInvitationQrPayload({
      drive: selectedDrive,
      registration: selectedDrive.registration,
      donor: donorIdentity,
    });

    setQrSheet({
      title: 'Drive invitation QR',
      subtitle: 'Present this QR when you arrive at the donation drive so staff can scan your RSVP.',
      helperText: 'Keep this QR ready on your phone or save it as a PDF before your visit.',
      payload: qrPayload,
    });
  }, [donorIdentity, selectedDrive]);

  const handleContinueIndependentDonation = React.useCallback(() => {
    if (!qualifiedSubmission || !qualifiedDetail) {
      setParcelFeedback({ message: 'Save a qualified donation entry first before generating the parcel QR.', variant: 'info' });
      return;
    }

    setHasUnlockedIndependentFlow(true);
    setIsAgreementOpen(false);

    const qrPayload = buildIndependentDonationQrPayload({
      submission: qualifiedSubmission,
      detail: qualifiedDetail,
      screening: qualifiedScreening,
      donor: donorIdentity,
      qualificationSource: qualifiedDonationRecord?.source || entryPath,
    });

    setQrSheet({
      title: 'Independent parcel-tracking QR',
      subtitle: 'Attach this QR to your parcel before shipment so staff can scan and update donation progress.',
      helperText: 'Upload your parcel image after this so the first donor-side timeline entry is recorded.',
      payload: qrPayload,
    });
  }, [donorIdentity, entryPath, qualifiedDetail, qualifiedDonationRecord?.source, qualifiedScreening, qualifiedSubmission]);

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

      setParcelFeedback({
        message: qrSharingAvailable ? 'QR PDF is ready to save or share.' : `QR PDF generated at ${file.uri}.`,
        variant: 'success',
      });
    } catch (error) {
      setParcelFeedback({ message: error.message || 'Unable to save the QR PDF right now.', variant: 'error' });
    } finally {
      setIsSavingQr(false);
    }
  }, [qrSheet, qrSharingAvailable]);

  const handleUploadParcel = React.useCallback(async () => {
    if (!qualifiedSubmission || !qualifiedDetail) {
      setParcelFeedback({ message: 'A qualified donation entry is required before parcel logging.', variant: 'error' });
      return;
    }

    const pickResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.72,
      base64: true,
    });

    if (pickResult.canceled || !pickResult.assets?.length) {
      return;
    }

    const asset = pickResult.assets[0];
    setIsUploadingParcel(true);

    const qrPayload = buildIndependentDonationQrPayload({
      submission: qualifiedSubmission,
      detail: qualifiedDetail,
      screening: qualifiedScreening,
      donor: donorIdentity,
      qualificationSource: qualifiedDonationRecord?.source || entryPath,
    });

    const result = await saveIndependentDonationParcelLog({
      userId: user?.id,
      databaseUserId: profile?.user_id || null,
      submission: qualifiedSubmission,
      detail: qualifiedDetail,
      photo: {
        uri: asset.uri,
        base64: asset.base64 || '',
        mimeType: asset.mimeType || 'image/jpeg',
        fileName: asset.fileName || '',
      },
      qrPayloadText: qrPayload,
    });

    setIsUploadingParcel(false);

    if (!result.success) {
      setParcelFeedback({ message: result.error || 'Unable to save the parcel log.', variant: 'error' });
      return;
    }

    setParcelFeedback({ message: 'Parcel image uploaded. The independent donation timeline is now active.', variant: 'success' });
    await loadModuleData();
  }, [donorIdentity, entryPath, loadModuleData, profile?.user_id, qualifiedDetail, qualifiedDonationRecord?.source, qualifiedScreening, qualifiedSubmission, user?.id]);

  const latestCertificateEmail = user?.email || profile?.email || '';

  return (
    <DashboardLayout
      showSupportChat={false}
      navItems={donorDashboardNavItems}
      activeNavKey="donations"
      navVariant="donor"
      onNavPress={handleNavPress}
      screenVariant="default"
      header={(
        <DonorTopBar
          title="Donations"
          subtitle={donationReady ? 'Active donation paths are ready' : 'Use AI or manual donor details to continue'}
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url || profile?.photo_path || ''}
          unreadCount={unreadCount}
          onNotificationsPress={() => router.navigate('/donor/notifications')}
          onProfilePress={() => router.navigate('/profile')}
          onLogoutPress={logout}
          isLoggingOut={isLoggingOut}
        />
      )}
    >
      {screenError ? <StatusBanner message={screenError} variant="info" /> : null}
      {parcelFeedback.message ? <StatusBanner message={parcelFeedback.message} variant={parcelFeedback.variant} /> : null}
      {certificateError ? <StatusBanner message={certificateError} variant="info" /> : null}

      {isLoading ? (
        <AppCard variant="default" radius="xl" padding="lg">
          <View style={styles.loadingState}>
            <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
            <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading donation module</Text>
          </View>
        </AppCard>
      ) : (
        <>
          <AppCard variant="default" radius="xl" padding="lg">
            <SectionTitle
              eyebrow="Donation entry"
              title={activeEntryHeadline}
              body={
                moduleData?.latestScreening
                  ? `${latestAnalysisDecision || 'Latest result available'}${latestAnalysisCondition ? ` • ${latestAnalysisCondition}` : ''}`
                  : 'You can continue through an eligible AI hair analysis or by entering donor hair details manually.'
              }
            />

            {moduleData?.latestScreening ? (
              <View style={styles.analysisMetaGrid}>
                <View style={styles.analysisMetaCard}>
                  <Text style={styles.analysisMetaLabel}>Decision</Text>
                  <Text style={styles.analysisMetaValue}>{latestAnalysisDecision || 'Not available'}</Text>
                </View>
                <View style={styles.analysisMetaCard}>
                  <Text style={styles.analysisMetaLabel}>Condition</Text>
                  <Text style={styles.analysisMetaValue}>{latestAnalysisCondition || 'Not available'}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.pathGrid}>
              <PathCard
                icon="checkHair"
                title="Use latest hair analysis"
                body={
                  aiPathReady
                    ? 'Use your latest eligible CheckHair result to continue directly into donation options.'
                    : moduleData?.latestScreening
                      ? 'Your latest AI result is not eligible right now, so continue through the manual donor details path instead.'
                      : 'No usable AI analysis is saved right now. You can still continue by entering donor hair details manually.'
                }
                actionLabel={aiPathReady ? 'Use AI result' : 'Open CheckHair'}
                onPress={() => {
                  if (aiPathReady) {
                    setEntryPath(MANUAL_ENTRY_PATHS.ai);
                    return;
                  }
                  router.navigate('/donor/donations');
                }}
              />
              <PathCard
                icon="donations"
                title="Enter hair details manually"
                body="Save controlled donor hair details and a current hair photo into the real donation submission flow."
                actionLabel={entryPath === MANUAL_ENTRY_PATHS.manual ? 'Manual form open' : 'Enter details'}
                onPress={() => setEntryPath(MANUAL_ENTRY_PATHS.manual)}
              />
            </View>

            {donationReady ? (
              <StatusBanner
                message={
                  activeQualificationSource === 'manual'
                    ? 'Manual donor details are the active qualification source for this donation flow.'
                    : 'Your latest eligible AI hair analysis is the active qualification source for this donation flow.'
                }
                variant="success"
                style={styles.inlineBanner}
              />
            ) : null}

            {!donationReady ? (
              <View style={styles.lockedState}>
                <View style={styles.lockedIconWrap}>
                  <AppIcon name="shield" size="md" state="active" />
                </View>
                <View style={styles.lockedCopy}>
                  <Text style={styles.lockedTitle}>Donation options unlock after qualification.</Text>
                  <Text style={styles.lockedBody}>
                    {entryPath === MANUAL_ENTRY_PATHS.manual
                      ? (manualQualificationReason || 'Hair length must be at least 14 inches, and the declared donor details must fit the current donation requirement.')
                      : 'Switch to manual donor details if the latest AI analysis is missing, unavailable, or not eligible.'}
                  </Text>
                </View>
              </View>
            ) : null}
          </AppCard>

          {entryPath === MANUAL_ENTRY_PATHS.manual ? (
            <AppCard variant="default" radius="xl" padding="lg">
              <SectionTitle
                eyebrow="Manual donor details"
                title="Enter donation criteria manually"
                body="Use controlled choices for donor screening. Hair length stays numeric, and a current hair photo is required for the DB-backed donation record."
              />

              {manualFeedback.message ? <StatusBanner message={manualFeedback.message} variant={manualFeedback.variant} style={styles.inlineBanner} /> : null}

              <View style={styles.manualFormRow}>
                <View style={styles.manualLengthWrap}>
                  <AppInput
                    label="Hair length"
                    required
                    value={manualForm.lengthValue}
                    onChangeText={(value) => updateManualField('lengthValue', value.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="14"
                    error={manualFormErrors.lengthValue}
                    helperText="Current hair length must be 14 inches or more to qualify."
                  />
                </View>
                <View style={styles.manualUnitWrap}>
                  <ChoiceField
                    label="Unit"
                    value={manualForm.lengthUnit}
                    options={LENGTH_UNIT_OPTIONS}
                    onChange={(value) => updateManualField('lengthUnit', value)}
                  />
                </View>
              </View>

              <ChoiceField label="Treated" value={manualForm.treated} options={YES_NO_OPTIONS} onChange={(value) => updateManualField('treated', value)} />
              <ChoiceField label="Colored" value={manualForm.colored} options={YES_NO_OPTIONS} onChange={(value) => updateManualField('colored', value)} />
              <ChoiceField label="Trimmed" value={manualForm.trimmed} options={YES_NO_OPTIONS} onChange={(value) => updateManualField('trimmed', value)} />
              <ChoiceField label="Hair color" value={manualForm.hairColor} options={HAIR_COLOR_OPTIONS} onChange={(value) => updateManualField('hairColor', value)} />
              <ChoiceField label="Density / weight" value={manualForm.density} options={MANUAL_DENSITY_OPTIONS} onChange={(value) => updateManualField('density', value)} />

              <View style={styles.manualPhotoCard}>
                <View style={styles.manualPhotoCopy}>
                  <Text style={styles.manualPhotoTitle}>Hair photo for donation record</Text>
                  <Text style={styles.manualPhotoBody}>
                    Upload or capture the current hair photo that should be stored with this manual donation entry.
                  </Text>
                </View>

                {manualPhoto?.uri ? (
                  <Image source={{ uri: manualPhoto.uri }} style={styles.manualPhotoPreview} resizeMode="cover" />
                ) : (
                  <View style={styles.manualPhotoPlaceholder}>
                    <AppIcon name="camera" size="md" state="muted" />
                    <Text style={styles.emptyText}>No hair photo selected yet.</Text>
                  </View>
                )}

                <View style={styles.independentActions}>
                  <AppButton title="Upload photo" variant="outline" fullWidth={false} onPress={() => handlePickManualPhoto('library')} />
                  <AppButton title="Capture photo" fullWidth={false} onPress={() => handlePickManualPhoto('camera')} />
                </View>

                {manualFormErrors.photo ? <Text style={styles.manualPhotoError}>{manualFormErrors.photo}</Text> : null}
              </View>

              <AppButton
                title={isSavingManual ? 'Saving details...' : 'Save manual donor details'}
                onPress={handleSaveManualDetails}
                loading={isSavingManual}
              />
            </AppCard>
          ) : null}

          {donationReady ? (
            <>
              <View style={styles.pathGrid}>
                <PathCard
                  icon="donations"
                  title="Join a donation drive"
                  body="Browse active drives, open event details, and save your RSVP invitation QR."
                  actionLabel="Browse drives"
                  onPress={() => {
                    if (moduleData.drives?.length) {
                      handleOpenDrive(moduleData.drives[0]);
                    }
                  }}
                  disabled={!moduleData.drives?.length}
                />
                <PathCard
                  icon="truck-delivery-outline"
                  title="I want to donate independently"
                  body="Review the donor agreement, generate the parcel-tracking QR, and log your parcel before shipment."
                  actionLabel={hasUnlockedIndependentFlow ? 'Continue independent flow' : 'Review agreement'}
                  onPress={() => setIsAgreementOpen(true)}
                />
              </View>

              <AppCard variant="default" radius="xl" padding="lg">
                <SectionTitle
                  eyebrow="Donation drives"
                  title="Active drives you can join"
                  body="This list reuses the same drive source and card language as the donor home experience."
                />

                {moduleData.drives?.length ? (
                  <View style={styles.driveList}>
                    {moduleData.drives.map((drive) => (
                      <DriveListCard key={drive.donation_drive_id} drive={drive} onPress={handleOpenDrive} />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>No active donation drives are available right now.</Text>
                )}
              </AppCard>

              <AppCard variant="default" radius="xl" padding="lg">
                <SectionTitle
                  eyebrow="Independent donation"
                  title="Prepare your parcel with the donor QR"
                  body={
                    activeQualificationSource === 'manual'
                      ? 'The QR references your saved manual donor details so staff can monitor parcel progress through the same donation timeline.'
                      : 'The QR references your latest eligible saved hair analysis so staff can monitor parcel progress through the donation timeline.'
                  }
                />

                {activeQualificationSource === 'ai' && latestRecommendations.length ? (
                  <View style={styles.recommendationStack}>
                    <Text style={styles.recommendationTitle}>Latest recommendation context</Text>
                    {latestRecommendations.slice(0, 3).map((item) => (
                      <View key={`${item.priority_order}-${item.title || item.recommendation_text}`} style={styles.recommendationChipRow}>
                        <Text style={styles.recommendationChip}>{item.title || `Priority ${item.priority_order || 1}`}</Text>
                        <Text style={styles.recommendationText}>{item.recommendation_text}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.independentActions}>
                  <AppButton title="Review donor agreement" variant="outline" fullWidth={false} onPress={() => setIsAgreementOpen(true)} />
                  <AppButton title="Show parcel QR" fullWidth={false} onPress={handleContinueIndependentDonation} disabled={!hasUnlockedIndependentFlow} />
                  <AppButton title={isUploadingParcel ? 'Uploading parcel...' : 'Upload parcel image'} fullWidth={false} onPress={handleUploadParcel} loading={isUploadingParcel} disabled={!hasUnlockedIndependentFlow} />
                </View>

                <Text style={styles.helperText}>
                  Upload a parcel image after the QR is ready. That image becomes the donor-side timeline entry for &quot;Ready for shipment.&quot;
                </Text>
              </AppCard>
            </>
          ) : null}

          {(donationReady && (hasIndependentProgress || hasUnlockedIndependentFlow)) ? (
            <AppCard variant="default" radius="xl" padding="lg">
              <SectionTitle
                eyebrow="Donation timeline"
                title="Track parcel progress from shipment to patient receipt"
                body="Each stage uses real logistics, tracking, parcel image, and certificate records when they exist."
              />

              <View style={styles.timelineStack}>
                {(moduleData?.timelineStages || []).map((stage) => (
                  <TimelineStageCard key={stage.key} stage={stage} />
                ))}
              </View>

              {(moduleData?.timelineEvents || []).length ? (
                <View style={styles.updateList}>
                  <Text style={styles.updateListTitle}>Recent updates</Text>
                  {moduleData.timelineEvents.map((event) => (
                    <UpdateEventCard key={event.key} event={event} />
                  ))}
                </View>
              ) : null}
            </AppCard>
          ) : null}

          <AppCard variant="default" radius="xl" padding="lg">
            <SectionTitle
              eyebrow="Certificate"
              title={certificate ? 'Certificate available' : 'Certificate pending organization approval'}
              body={
                certificate
                  ? `Your certificate is now available in the app and should also be sent to ${latestCertificateEmail || 'your registered email'}.`
                  : 'A certificate appears only after the organization receives and approves the donation.'
              }
            />

            {isLoadingCertificate ? (
              <View style={styles.loadingInline}>
                <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
                <Text style={styles.loadingInlineText}>Checking certificate status</Text>
              </View>
            ) : certificate ? (
              <DonorCertificatePreview
                certificate={certificate}
                isGenerating={isGeneratingCertificate}
                isSharingAvailable={isSharingAvailable}
                generatedFileUri={generatedFileUri}
                onGenerate={generateCertificate}
                onShare={shareCertificate}
              />
            ) : (
              <View style={styles.emptyCertificateState}>
                <AppIcon name="certificate-outline" size="md" state="muted" />
                <Text style={styles.emptyText}>No certificate is ready yet. It stays locked until organization receipt and approval are complete.</Text>
              </View>
            )}
          </AppCard>
        </>
      )}

      {isLoadingDrivePreview && isDriveDetailOpen ? (
        <DriveDetailModal
          visible={isDriveDetailOpen}
          drive={{
            event_title: 'Loading drive details',
            organization_name: 'Please wait',
          }}
          onClose={() => setIsDriveDetailOpen(false)}
          onRsvp={() => {}}
          onViewQr={() => {}}
          isSubmitting={false}
          feedbackMessage=""
          feedbackVariant="info"
        />
      ) : (
        <DriveDetailModal
          visible={isDriveDetailOpen}
          drive={selectedDrive}
          onClose={() => {
            setIsDriveDetailOpen(false);
            setDriveFeedback({ message: '', variant: 'info' });
          }}
          onRsvp={handleRsvp}
          onViewQr={handleViewSavedDriveQr}
          isSubmitting={isSubmittingRsvp}
          feedbackMessage={driveFeedback.message}
          feedbackVariant={driveFeedback.variant}
        />
      )}

      <AgreementModal
        visible={isAgreementOpen}
        accepted={agreementAccepted}
        onToggle={() => setAgreementAccepted((current) => !current)}
        onClose={() => setIsAgreementOpen(false)}
        onContinue={handleContinueIndependentDonation}
      />

      <QrModal
        visible={Boolean(qrSheet)}
        title={qrSheet?.title || ''}
        subtitle={qrSheet?.subtitle || ''}
        helperText={qrSheet?.helperText || ''}
        qrPayload={qrSheet?.payload || ''}
        onClose={() => setQrSheet(null)}
        onSave={handleSaveQr}
        isSaving={isSavingQr}
      />
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
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
  sectionTitleWrap: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  sectionEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  sectionBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  choiceField: {
    marginBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  choiceFieldLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.label,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  choiceChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  choiceChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  choiceChipActive: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  choiceChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  choiceChipTextActive: {
    color: theme.colors.brandPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  choiceFieldHelper: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textMuted,
  },
  manualFormRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  manualLengthWrap: {
    flex: 1,
    minWidth: 180,
  },
  manualUnitWrap: {
    minWidth: 180,
    flex: 1,
  },
  manualPhotoCard: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
    gap: theme.spacing.md,
  },
  manualPhotoCopy: {
    gap: theme.spacing.xs,
  },
  manualPhotoTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  manualPhotoBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  manualPhotoPreview: {
    width: '100%',
    height: 220,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  manualPhotoPlaceholder: {
    minHeight: 140,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  manualPhotoError: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textError,
    fontWeight: theme.typography.weights.medium,
  },
  analysisMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  analysisMetaCard: {
    flex: 1,
    minWidth: 140,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  analysisMetaLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  analysisMetaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  lockedState: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: theme.spacing.md,
  },
  lockedIconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  lockedCopy: {
    gap: theme.spacing.xs,
  },
  lockedTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  lockedBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  pathGrid: {
    gap: theme.spacing.md,
  },
  pathHeader: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  pathIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  pathCopy: {
    flex: 1,
    gap: 4,
  },
  pathTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  pathBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  driveList: {
    gap: theme.spacing.sm,
  },
  drivePressable: {
    borderRadius: theme.radius.xl,
  },
  pressableActive: {
    opacity: 0.92,
  },
  driveCard: {
    gap: theme.spacing.sm,
  },
  driveCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  driveOrganizationWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  driveLogo: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceSoft,
  },
  driveLogoFallback: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  driveCardCopy: {
    flex: 1,
    gap: 2,
  },
  driveStatus: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
  driveTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  driveMetaBlock: {
    gap: theme.spacing.sm,
  },
  inlineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  inlineMetaText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  recommendationStack: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  recommendationTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  recommendationChipRow: {
    gap: 6,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  recommendationChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.backgroundPrimary,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
  },
  recommendationText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  independentActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  helperText: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  timelineStack: {
    gap: theme.spacing.sm,
  },
  timelineStageCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  timelineStageCompleted: {
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  timelineStageCurrent: {
    borderColor: theme.colors.brandPrimary,
  },
  timelineStageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  timelineDot: {
    width: 12,
    height: 12,
    marginTop: 6,
    borderRadius: theme.radius.full,
  },
  timelineDotCompleted: {
    backgroundColor: theme.colors.brandPrimary,
  },
  timelineDotCurrent: {
    backgroundColor: theme.colors.brandPrimary,
  },
  timelineDotUpcoming: {
    backgroundColor: theme.colors.borderStrong,
  },
  timelineStageCopy: {
    flex: 1,
    gap: 4,
  },
  timelineStageTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  timelineStageDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  timelineStageBadge: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textMuted,
  },
  timelineTimestamp: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
  timelineImageRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  timelineImage: {
    width: 92,
    height: 92,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  updateList: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  updateListTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  updateEventCard: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  updateTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  updateTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  updateBadge: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.brandPrimary,
  },
  updateBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  updateImage: {
    width: '100%',
    height: 180,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  updateTimestamp: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
  emptyText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  loadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  loadingInlineText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  emptyCertificateState: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  modalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  modalBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  detailBannerImage: {
    width: '100%',
    height: 168,
    borderRadius: theme.radius.xl,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSoft,
  },
  detailBannerFallback: {
    width: '100%',
    height: 120,
    borderRadius: theme.radius.xl,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  modalOverviewText: {
    marginTop: theme.spacing.md,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  inlineBanner: {
    marginTop: theme.spacing.sm,
  },
  modalActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  agreementList: {
    gap: theme.spacing.sm,
  },
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  agreementDot: {
    width: 8,
    height: 8,
    marginTop: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
  },
  agreementText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  checkboxBox: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  checkboxBoxActive: {
    backgroundColor: theme.colors.brandPrimary,
  },
  checkboxLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textPrimary,
  },
  qrPreviewWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
  },
  qrPreviewImage: {
    width: 240,
    height: 240,
  },
  qrHelper: {
    marginTop: theme.spacing.md,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
});
