import React from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import {
  fetchDonationDrivePreview,
  joinOrganizationMembership,
} from '../../features/donorHome.api';
import {
  buildDriveInvitationQrPayload,
  buildIndependentDonationQrPayload,
  buildQrImageUrl,
  ensureIndependentDonationQr,
  expireIndependentDonationQr,
  formatQrCountdownLabel,
  generateDonationQrPdf,
  getDonorDonationsModuleData,
  getIndependentDonationQrState,
  isQrSharingSupported,
  printDonationQrPdf,
  saveDriveDonationParticipation,
  saveIndependentDonationParcelLog,
  saveManualDonationQualification,
  shareDonationQrPdf,
} from '../../features/donorDonations.service';
import { resolveThemeRoles, theme } from '../../design-system/theme';

const AGREEMENT_COPY = [
  'Donation is voluntary.',
  'You will handle shipping.',
  'The parcel goes to Hair for Hope.',
  'Attach the QR to the parcel.',
  'Staff will scan the QR for tracking.',
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

const getLatestSubmissionDetailRecord = (submission = null, fallbackDetail = null) => (
  [...(submission?.submission_details || [])]
    .sort((left, right) => (
      new Date(right?.updated_at || right?.created_at || 0).getTime()
      - new Date(left?.updated_at || left?.created_at || 0).getTime()
    ))[0] || fallbackDetail || null
);

const formatQrStatusLabel = (status = '') => {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'Pending';
  if (normalized === 'activated') return 'Activated';
  if (normalized === 'expired') return 'Expired';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

function SectionTitle({ eyebrow, title, body }) {
  return (
    <View style={styles.sectionTitleWrap}>
      {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {body ? <Text style={styles.sectionBody}>{body}</Text> : null}
    </View>
  );
}

function ModalShell({ visible, title, subtitle, onClose, children, footer }) {
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>{title}</Text>
              {subtitle ? <Text style={styles.modalBody}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>

          {children}

          {footer ? <View style={styles.modalFooter}>{footer}</View> : null}
        </AppCard>
      </View>
    </Modal>
  );
}

function EntryCard({
  icon,
  title,
  body,
  actionLabel,
  onPress,
  disabled = false,
  active = false,
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.entryCardPressable, pressed ? styles.pressableActive : null]}>
      <AppCard variant="default" radius="xl" padding="md" style={[styles.entryCard, active ? styles.entryCardActive : null, disabled ? styles.entryCardDisabled : null]}>
        <View style={styles.entryCardTop}>
          <View style={styles.entryIconWrap}>
            <AppIcon name={icon} size="sm" state="active" />
          </View>
          <View style={styles.entryCardCopy}>
            <Text style={styles.entryCardTitle}>{title}</Text>
            <Text style={styles.entryCardBody}>{body}</Text>
          </View>
        </View>
        <AppButton title={actionLabel} variant={active ? 'primary' : 'outline'} fullWidth={false} onPress={onPress} disabled={disabled} />
      </AppCard>
    </Pressable>
  );
}

function DriveCarouselCard({ drive, onPress, disabled = false }) {
  return (
    <Pressable onPress={() => onPress?.(drive)} disabled={disabled} style={({ pressed }) => [styles.driveCardPressable, pressed ? styles.pressableActive : null]}>
      <AppCard variant="default" radius="xl" padding="md" style={[styles.driveCard, disabled ? styles.entryCardDisabled : null]}>
        <View style={styles.driveCardTop}>
          {drive?.organization_logo_url ? (
            <Image source={{ uri: drive.organization_logo_url }} style={styles.driveCardLogo} resizeMode="cover" />
          ) : (
            <View style={styles.driveCardLogoFallback}>
              <AppIcon name="organization" size="sm" state="active" />
            </View>
          )}
          <View style={styles.driveCardMeta}>
            <Text numberOfLines={2} style={styles.driveCardTitle}>{drive?.event_title || 'Donation drive'}</Text>
            <Text numberOfLines={1} style={styles.driveCardText}>{drive?.organization_name || 'Organization'}</Text>
            <Text numberOfLines={1} style={styles.driveCardText}>{formatDriveDate(drive?.start_date, drive?.end_date)}</Text>
            <Text numberOfLines={1} style={styles.driveCardText}>{drive?.location_label || drive?.address_label || 'Location to follow'}</Text>
          </View>
        </View>
        <AppButton title="View drive" fullWidth={false} onPress={() => onPress?.(drive)} disabled={disabled} />
      </AppCard>
    </Pressable>
  );
}

function DonationHistoryCard({ item }) {
  return (
    <AppCard variant="default" radius="xl" padding="md" style={styles.historyCard}>
      <Text style={styles.historyTitle}>{item?.submission_code || 'Donation record'}</Text>
      <Text style={styles.historyMeta}>{item?.date_label || 'Date unavailable'}</Text>
      <Text style={styles.historyMeta}>{item?.donation_source === 'manual_donor_details' ? 'Manual donor entry' : 'Hair analysis entry'}</Text>
      <Text style={styles.historyMeta}>{item?.bundle_quantity ? `${item.bundle_quantity} bundle${item.bundle_quantity === 1 ? '' : 's'}` : 'Bundle count unavailable'}</Text>
    </AppCard>
  );
}

function DonationLogCard({ event }) {
  return (
    <AppCard variant="default" radius="xl" padding="md" style={styles.logCard}>
      <View style={styles.logHeaderRow}>
        <Text style={styles.logTitle}>{event?.title || 'Donation update'}</Text>
        {event?.badge ? <Text style={styles.logBadge}>{event.badge}</Text> : null}
      </View>
      <Text style={styles.logDescription}>{event?.description || 'A donation update was recorded.'}</Text>
      {event?.imageUrl ? (
        <Image source={{ uri: event.imageUrl }} style={styles.logImage} resizeMode="cover" />
      ) : null}
      {event?.timestamp ? <Text style={styles.logTimestamp}>{event.timestamp}</Text> : null}
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

function DriveListItem({ drive, onPress }) {
  return (
    <Pressable onPress={() => onPress?.(drive)} style={({ pressed }) => [styles.driveRowPressable, pressed ? styles.pressableActive : null]}>
      <View style={styles.driveRow}>
        {drive.organization_logo_url ? (
          <Image source={{ uri: drive.organization_logo_url }} style={styles.driveLogo} resizeMode="cover" />
        ) : (
          <View style={styles.driveLogoFallback}>
            <AppIcon name="organization" size="sm" state="active" />
          </View>
        )}

        <View style={styles.driveRowCopy}>
          <Text numberOfLines={1} style={styles.driveRowTitle}>{drive.event_title || 'Donation drive'}</Text>
          <Text numberOfLines={1} style={styles.driveRowMeta}>{drive.organization_name || 'Organization'}</Text>
          <Text numberOfLines={1} style={styles.driveRowMeta}>{formatDriveDate(drive.start_date, drive.end_date)}</Text>
          <Text numberOfLines={1} style={styles.driveRowMeta}>{drive.location_label || drive.address_label || 'Location to follow'}</Text>
        </View>

        <AppIcon name="chevron-right" size="sm" state="muted" />
      </View>
    </Pressable>
  );
}

function TimelinePreview({ stages, onOpenStage }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineScrollContent}>
      {stages.map((stage, index) => (
        <View key={stage.key} style={styles.timelineNodeWrap}>
          {index > 0 ? <View style={[styles.timelineConnector, stage.state === 'completed' ? styles.timelineConnectorCompleted : null]} /> : null}
          <Pressable onPress={() => onOpenStage?.(stage)} style={({ pressed }) => [styles.timelineNodePressable, pressed ? styles.pressableActive : null]}>
            <View style={[
              styles.timelineDot,
              stage.state === 'completed' ? styles.timelineDotDone : stage.state === 'current' ? styles.timelineDotCurrent : styles.timelineDotWaiting,
            ]} />
            <View style={[styles.timelineCard, stage.state === 'current' ? styles.timelineCardCurrent : null]}>
              <Text numberOfLines={2} style={styles.timelineCardTitle}>{stage.label}</Text>
              <Text style={styles.timelineCardStatus}>
                {stage.state === 'completed' ? 'Done' : stage.state === 'current' ? 'Current' : 'Waiting'}
              </Text>
            </View>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function StageDetailModal({
  visible,
  stage,
  onClose,
  onViewQr,
  canViewQr = false,
}) {
  const parcelImages = (stage?.parcelImages || stage?.images || []).filter((image) => image?.signed_url);
  const stageStatus = stage?.statusLabel
    || (stage?.state === 'completed' ? 'Completed' : stage?.state === 'current' ? 'Current stage' : 'Waiting for update');

  return (
    <ModalShell
      visible={visible}
      title={stage?.label || 'Timeline stage'}
      subtitle={stageStatus}
      onClose={onClose}
    >
      <View style={styles.stageDetailBody}>
        {stage?.savedNote ? <Text style={styles.stageDetailText}>{stage.savedNote}</Text> : null}
        {stage?.timestampLabel ? <Text style={styles.stageDetailTimestamp}>{stage.timestampLabel}</Text> : null}
        <View style={styles.stageSection}>
          <Text style={styles.stageSectionLabel}>Parcel photo</Text>
          {parcelImages.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stageImageRow}>
              {parcelImages.map((image) => (
                <Image
                  key={image.image_id || image.file_path}
                  source={{ uri: image.signed_url }}
                  style={styles.stageImage}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.stageEmptyState}>
              <Text style={styles.stageEmptyText}>No parcel photo uploaded yet.</Text>
            </View>
          )}
        </View>
        {canViewQr ? <AppButton title="View my QR" variant="outline" fullWidth={false} onPress={onViewQr} /> : null}
      </View>
    </ModalShell>
  );
}

function QrModal({
  visible,
  title,
  subtitle,
  helperText,
  payload,
  countdownText,
  statusLabel,
  onClose,
  onDownload,
  onPrint,
  onRegenerate,
  onNext,
  nextLabel = 'Next',
  isDownloading,
  isPrinting,
  canRegenerate = false,
  isConfirmed = false,
}) {
  if (!visible || !payload) return null;

  return (
    <ModalShell
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={(
        <View style={styles.qrActionWrap}>
          <AppButton title="Close" variant="outline" fullWidth={false} onPress={onClose} />
          <AppButton title="Print" variant="outline" fullWidth={false} onPress={onPrint} loading={isPrinting} />
          <AppButton title="Download" fullWidth={false} onPress={onDownload} loading={isDownloading} />
          {canRegenerate && onRegenerate ? (
            <AppButton title="Generate new QR" variant="outline" fullWidth={false} onPress={onRegenerate} />
          ) : null}
          {onNext ? <AppButton title={nextLabel} fullWidth={false} onPress={onNext} /> : null}
        </View>
      )}
    >
      <View style={styles.qrPreviewWrap}>
        <Image source={{ uri: buildQrImageUrl(payload, 420) }} style={styles.qrPreviewImage} resizeMode="contain" />
      </View>
      {statusLabel ? <Text style={styles.qrStatus}>Status: {statusLabel}</Text> : null}
      {countdownText ? <Text style={styles.qrCountdown}>{countdownText}</Text> : null}
      {helperText ? <Text style={styles.qrHelper}>{helperText}</Text> : null}
    </ModalShell>
  );
}

function MembershipRequiredModal({
  visible,
  drive,
  feedback,
  isJoining,
  onClose,
  onJoin,
}) {
  return (
    <ModalShell
      visible={visible}
      title="Join organization first"
      subtitle={drive?.organization_name || 'Organization membership is required for this drive.'}
      onClose={onClose}
      footer={(
        <View style={styles.inlineActions}>
          <AppButton title="Cancel" variant="outline" fullWidth={false} onPress={onClose} />
          <AppButton title={isJoining ? 'Joining...' : 'Join organization'} fullWidth={false} onPress={onJoin} loading={isJoining} />
        </View>
      )}
    >
      {feedback?.message ? <StatusBanner message={feedback.message} variant={feedback.variant} style={styles.inlineBanner} /> : null}
      <Text style={styles.modalBody}>
        Join this organization first to RSVP for its donation drive.
      </Text>
    </ModalShell>
  );
}

function DriveBrowserModal({
  visible,
  drives,
  selectedDrive,
  isLoadingPreview,
  isSubmittingRsvp,
  feedback,
  onClose,
  onBack,
  onSelectDrive,
  onRsvp,
  onViewQr,
}) {
  const isDetailView = Boolean(selectedDrive);

  return (
    <ModalShell
      visible={visible}
      title={isDetailView ? (selectedDrive?.event_title || 'Drive details') : 'Donation drives'}
      subtitle={isDetailView ? (selectedDrive?.organization_name || 'Drive details') : 'Browse active drives'}
      onClose={onClose}
      footer={(
        <View style={styles.inlineActions}>
          {isDetailView ? <AppButton title="Back" variant="outline" fullWidth={false} onPress={onBack} /> : null}
          <AppButton title="Close" variant="outline" fullWidth={false} onPress={onClose} />
          {isDetailView && selectedDrive?.registration?.qr?.is_valid ? (
            <AppButton title="View QR" variant="outline" fullWidth={false} onPress={onViewQr} />
          ) : null}
          {isDetailView ? (
            <AppButton
              title={selectedDrive?.registration?.qr?.can_regenerate ? 'Generate new QR' : selectedDrive?.registration?.qr?.is_valid ? 'Show my QR' : 'RSVP'}
              fullWidth={false}
              onPress={selectedDrive?.registration?.qr?.is_valid ? onViewQr : onRsvp}
              disabled={Boolean(selectedDrive?.registration?.qr?.is_activated)}
              loading={isSubmittingRsvp}
            />
          ) : null}
        </View>
      )}
    >
      {feedback?.message ? <StatusBanner message={feedback.message} variant={feedback.variant} style={styles.inlineBanner} /> : null}

      {!isDetailView ? (
        drives?.length ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.driveListWrap}>
            {drives.map((drive) => (
              <DriveListItem key={drive.donation_drive_id} drive={drive} onPress={onSelectDrive} />
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.emptyText}>No active drives right now.</Text>
        )
      ) : isLoadingPreview ? (
        <View style={styles.modalLoadingState}>
          <ActivityIndicator color={theme.colors.brandPrimary} />
          <Text style={styles.modalLoadingText}>Loading drive</Text>
        </View>
      ) : (
        <View style={styles.driveDetailWrap}>
          {selectedDrive?.organization_logo_url ? (
            <Image source={{ uri: selectedDrive.organization_logo_url }} style={styles.driveDetailImage} resizeMode="cover" />
          ) : (
            <View style={styles.driveDetailFallback}>
              <AppIcon name="organization" size="lg" state="active" />
            </View>
          )}

          <View style={styles.driveMetaGroup}>
            <Text style={styles.driveDetailMeta}>{selectedDrive?.organization_name || 'Organization'}</Text>
            <Text style={styles.driveDetailMeta}>{formatDriveDate(selectedDrive?.start_date, selectedDrive?.end_date)}</Text>
            <Text style={styles.driveDetailMeta}>{selectedDrive?.address_label || selectedDrive?.location_label || 'Location to follow'}</Text>
            <Text style={styles.driveDetailMeta}>
              {selectedDrive?.registration?.qr?.is_activated
                ? 'QR activated for this drive'
                : selectedDrive?.registration?.qr?.is_expired
                  ? 'QR expired. Generate a new one to continue.'
                  : selectedDrive?.registration?.qr?.is_pending
                    ? `Pending activation. ${formatQrCountdownLabel(selectedDrive?.registration?.qr?.expires_at)}`
                    : selectedDrive?.membership?.is_active ? 'Organization member' : 'Membership required before RSVP'}
            </Text>
          </View>

          {selectedDrive?.short_overview || selectedDrive?.event_overview ? (
            <Text style={styles.driveDetailBody}>{selectedDrive.event_overview || selectedDrive.short_overview}</Text>
          ) : null}
        </View>
      )}
    </ModalShell>
  );
}

function AgreementModal({ visible, accepted, onToggle, onClose, onContinue }) {
  return (
    <ModalShell
      visible={visible}
      title="Independent donation"
      subtitle="Review the agreement first."
      onClose={onClose}
      footer={(
        <View style={styles.inlineActions}>
          <AppButton title="Cancel" variant="outline" fullWidth={false} onPress={onClose} />
          <AppButton title="Generate QR" fullWidth={false} onPress={onContinue} disabled={!accepted} />
        </View>
      )}
    >
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
        <Text style={styles.checkboxLabel}>I understand and agree.</Text>
      </Pressable>
    </ModalShell>
  );
}

function ParcelUploadModal({
  visible,
  feedback,
  isUploading,
  onClose,
  onUpload,
}) {
  return (
    <ModalShell
      visible={visible}
      title="Upload parcel photo"
      subtitle="Add the packed parcel photo before shipment."
      onClose={onClose}
      footer={(
        <View style={styles.inlineActions}>
          <AppButton title="Close" variant="outline" fullWidth={false} onPress={onClose} />
          <AppButton title={isUploading ? 'Uploading...' : 'Upload photo'} fullWidth={false} onPress={onUpload} loading={isUploading} />
        </View>
      )}
    >
      {feedback?.message ? <StatusBanner message={feedback.message} variant={feedback.variant} style={styles.inlineBanner} /> : null}
      <Text style={styles.modalBody}>
        Upload a clear photo of the packed parcel before shipment. This becomes your first shipment log.
      </Text>
    </ModalShell>
  );
}

function ManualEntryModal({
  visible,
  form,
  errors,
  photo,
  feedback,
  isSaving,
  onClose,
  onChangeField,
  onPickPhoto,
  onSave,
}) {
  return (
    <ModalShell
      visible={visible}
      title="Manual donor entry"
      subtitle="Save donor hair details for screening."
      onClose={onClose}
      footer={(
        <View style={styles.inlineActions}>
          <AppButton title="Close" variant="outline" fullWidth={false} onPress={onClose} />
          <AppButton title={isSaving ? 'Saving...' : 'Save details'} fullWidth={false} onPress={onSave} loading={isSaving} />
        </View>
      )}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.manualModalScroll}>
        {feedback?.message ? <StatusBanner message={feedback.message} variant={feedback.variant} style={styles.inlineBanner} /> : null}

        <View style={styles.manualFormRow}>
          <View style={styles.manualLengthWrap}>
            <AppInput
              label="Hair length"
              required
              value={form.lengthValue}
              onChangeText={(value) => onChangeField('lengthValue', value.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="14"
              error={errors.lengthValue}
              helperText="Minimum is 14 inches."
            />
          </View>
          <View style={styles.manualUnitWrap}>
            <ChoiceField
              label="Unit"
              value={form.lengthUnit}
              options={LENGTH_UNIT_OPTIONS}
              onChange={(value) => onChangeField('lengthUnit', value)}
            />
          </View>
        </View>

        <ChoiceField label="Treated" value={form.treated} options={YES_NO_OPTIONS} onChange={(value) => onChangeField('treated', value)} />
        <ChoiceField label="Colored" value={form.colored} options={YES_NO_OPTIONS} onChange={(value) => onChangeField('colored', value)} />
        <ChoiceField label="Trimmed" value={form.trimmed} options={YES_NO_OPTIONS} onChange={(value) => onChangeField('trimmed', value)} />
        <ChoiceField label="Hair color" value={form.hairColor} options={HAIR_COLOR_OPTIONS} onChange={(value) => onChangeField('hairColor', value)} />
        <ChoiceField label="Density" value={form.density} options={MANUAL_DENSITY_OPTIONS} onChange={(value) => onChangeField('density', value)} />

        <View style={styles.manualPhotoCard}>
          <Text style={styles.manualPhotoTitle}>Donation photo</Text>
          <Text style={styles.manualPhotoBody}>Upload or capture a current hair photo for the donation log.</Text>

          {photo?.uri ? (
            <Image source={{ uri: photo.uri }} style={styles.manualPhotoPreview} resizeMode="cover" />
          ) : (
            <View style={styles.manualPhotoPlaceholder}>
              <AppIcon name="camera" size="md" state="muted" />
              <Text style={styles.emptyText}>No photo selected</Text>
            </View>
          )}

          <View style={styles.inlineActions}>
            <AppButton title="Upload" variant="outline" fullWidth={false} onPress={() => onPickPhoto('library')} />
            <AppButton title="Capture" fullWidth={false} onPress={() => onPickPhoto('camera')} />
          </View>

          {errors.photo ? <Text style={styles.manualPhotoError}>{errors.photo}</Text> : null}
        </View>
      </ScrollView>
    </ModalShell>
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
    isGeneratingCertificate,
    isSharingAvailable,
    certificateError,
    generateCertificate,
    shareCertificate,
  } = useDonorCertificate({ userId: user?.id, profile: { ...profile, email: user?.email || '' } });

  const [moduleData, setModuleData] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [screenError, setScreenError] = React.useState('');
  const [moduleFeedback, setModuleFeedback] = React.useState({ message: '', variant: 'info' });
  const [entryPath, setEntryPath] = React.useState(null);

  const [isManualModalOpen, setIsManualModalOpen] = React.useState(false);
  const [manualForm, setManualForm] = React.useState(MANUAL_FORM_DEFAULTS);
  const [manualFormErrors, setManualFormErrors] = React.useState({});
  const [manualPhoto, setManualPhoto] = React.useState(null);
  const [manualFeedback, setManualFeedback] = React.useState({ message: '', variant: 'info' });
  const [isSavingManual, setIsSavingManual] = React.useState(false);

  const [selectedDrive, setSelectedDrive] = React.useState(null);
  const [isLoadingDrivePreview, setIsLoadingDrivePreview] = React.useState(false);
  const [driveFeedback, setDriveFeedback] = React.useState({ message: '', variant: 'info' });
  const [isSubmittingRsvp, setIsSubmittingRsvp] = React.useState(false);
  const [isMembershipPromptOpen, setIsMembershipPromptOpen] = React.useState(false);
  const [membershipFeedback, setMembershipFeedback] = React.useState({ message: '', variant: 'info' });
  const [isJoiningOrganization, setIsJoiningOrganization] = React.useState(false);

  const [isAgreementOpen, setIsAgreementOpen] = React.useState(false);
  const [agreementAccepted, setAgreementAccepted] = React.useState(false);
  const [isParcelModalOpen, setIsParcelModalOpen] = React.useState(false);
  const [isUploadingParcel, setIsUploadingParcel] = React.useState(false);

  const [qrSheet, setQrSheet] = React.useState(null);
  const [qrNowMs, setQrNowMs] = React.useState(Date.now());
  const [isDownloadingQr, setIsDownloadingQr] = React.useState(false);
  const [isPrintingQr, setIsPrintingQr] = React.useState(false);
  const [qrSharingAvailable, setQrSharingAvailable] = React.useState(false);

  const [selectedTimelineStage, setSelectedTimelineStage] = React.useState(null);

  const donorIdentity = React.useMemo(
    () => buildDonorIdentity({ profile, user }),
    [profile, user]
  );
  const qrOpenTimerRef = React.useRef(null);
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

    return result;
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
    return () => {
      if (qrOpenTimerRef.current) {
        clearTimeout(qrOpenTimerRef.current);
        qrOpenTimerRef.current = null;
      }
    };
  }, []);

  const showQrSheet = React.useCallback((nextQrSheet, deferMs = 0) => {
    if (!nextQrSheet) {
      return;
    }

    if (qrOpenTimerRef.current) {
      clearTimeout(qrOpenTimerRef.current);
      qrOpenTimerRef.current = null;
    }

    if (deferMs > 0) {
      qrOpenTimerRef.current = setTimeout(() => {
        setQrSheet(nextQrSheet);
        qrOpenTimerRef.current = null;
      }, deferMs);
      return;
    }

    setQrSheet(nextQrSheet);
  }, []);

  React.useEffect(() => {
    const activePendingExpiry = qrSheet?.expiresAt && !qrSheet?.isConfirmed
      ? qrSheet.expiresAt
      : independentQrState?.is_pending
        ? independentQrState.expires_at
        : '';

    if (!activePendingExpiry) {
      return undefined;
    }

    setQrNowMs(Date.now());
    const timer = setInterval(() => {
      setQrNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [independentQrState?.expires_at, independentQrState?.is_pending, qrSheet?.expiresAt, qrSheet?.isConfirmed]);

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
  const activeSubmission = moduleData?.latestSubmission || qualifiedSubmission || null;
  const activeDetail = moduleData?.latestDetail || getLatestSubmissionDetailRecord(activeSubmission, qualifiedDetail);
  const activeScreening = moduleData?.activeScreening || qualifiedScreening || null;
  const activeQualificationSource = selectedPathIsQualified
    ? qualifiedDonationRecord?.source || ''
    : moduleData?.activeQualificationSource || '';
  const donationReady = Boolean(qualifiedDonationRecord?.qualification?.isQualified);
  const aiPathReady = Boolean(moduleData?.isAiEligible);
  const independentQrState = moduleData?.independentQrState || null;
  const hasOngoingDonation = Boolean(moduleData?.hasOngoingDonation);
  const activeFlowType = moduleData?.activeFlowType || '';
  const activeDrive = moduleData?.activeDrive || null;
  const activeQrState = moduleData?.activeQrState || null;
  const ongoingDonationMessage = moduleData?.ongoingDonationMessage || 'You already have an ongoing donation. Please complete or wait for the current donation process to finish before starting a new one.';
  const hasTimelinePreview = Boolean(
    activeSubmission?.submission_id
    && moduleData?.timelineStages?.length
  );
  const hasTimelineLog = Boolean(
    activeSubmission?.submission_id
    && moduleData?.timelineEvents?.length
  );
  const hasActiveQrAction = Boolean(
    hasOngoingDonation
    && (
      activeFlowType === 'drive'
        ? activeDrive?.registration?.registration_id
        : activeQrState?.reference
    )
  );
  const currentTimelineStage = moduleData?.timelineStages?.find((stage) => stage?.state === 'current')
    || [...(moduleData?.timelineStages || [])].reverse().find((stage) => stage?.state === 'completed')
    || null;
  const currentFlowLabel = activeFlowType === 'drive'
    ? 'Donation drive'
    : activeFlowType === 'independent'
      ? 'Independent donation'
      : 'Donation in progress';
  const currentStatusLabel = currentTimelineStage?.label || formatQrStatusLabel(activeQrState?.status || '') || 'In progress';

  React.useEffect(() => {
    if (!independentQrState?.is_pending || !independentQrState?.expires_at || !activeSubmission?.submission_id) {
      return undefined;
    }

    if (new Date(independentQrState.expires_at).getTime() > qrNowMs) {
      return undefined;
    }

    let cancelled = false;

    const expireQr = async () => {
      const result = await expireIndependentDonationQr({
        submission: activeSubmission,
        databaseUserId: profile?.user_id || null,
      });

      if (!cancelled && result.success) {
        if (qrSheet?.type === 'independent') {
          setQrSheet((current) => current ? {
            ...current,
            helperText: 'This QR expired before staff activated it. Generate a new QR to continue.',
            isConfirmed: false,
            canRegenerate: true,
            expiresAt: result.qrState?.expires_at || current.expiresAt,
            qrStatus: 'expired',
          } : current);
        }
        loadModuleData();
      }
    };

    expireQr();
    return () => {
      cancelled = true;
    };
  }, [activeSubmission, independentQrState?.expires_at, independentQrState?.is_pending, loadModuleData, profile?.user_id, qrNowMs, qrSheet?.type]);

  React.useEffect(() => {
    if (!qrSheet?.expiresAt || qrSheet?.isConfirmed || qrSheet?.type !== 'drive') {
      return;
    }

    if (new Date(qrSheet.expiresAt).getTime() > qrNowMs || qrSheet?.qrStatus === 'expired') {
      return;
    }

    setQrSheet((current) => current ? {
      ...current,
      helperText: 'This QR expired before staff used it. Generate a new QR to continue.',
      canRegenerate: true,
      qrStatus: 'expired',
    } : current);
  }, [qrNowMs, qrSheet?.expiresAt, qrSheet?.isConfirmed, qrSheet?.qrStatus, qrSheet?.type]);

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

  const handleUseLatestAnalysis = React.useCallback(() => {
    if (hasOngoingDonation) {
      setModuleFeedback({
        message: ongoingDonationMessage,
        variant: 'info',
      });
      return;
    }

    if (!aiPathReady) {
      setModuleFeedback({
        message: 'No eligible saved hair analysis is ready. Use manual donor entry instead.',
        variant: 'info',
      });
      return;
    }

    setEntryPath(MANUAL_ENTRY_PATHS.ai);
    setModuleFeedback({
      message: 'Latest eligible hair analysis selected.',
      variant: 'success',
    });
  }, [aiPathReady, hasOngoingDonation, ongoingDonationMessage]);

  const handleSaveManualDetails = React.useCallback(async () => {
    const nextErrors = {};
    const numericLength = Number(manualForm.lengthValue);

    if (!Number.isFinite(numericLength) || numericLength <= 0) {
      nextErrors.lengthValue = 'Enter the current hair length using numbers only.';
    }

    if (!manualPhoto) {
      nextErrors.photo = 'Please upload or capture a hair photo.';
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

    setEntryPath(MANUAL_ENTRY_PATHS.manual);
    setIsManualModalOpen(false);
    setManualFeedback({ message: '', variant: 'info' });
    setModuleFeedback({
      message: result.canProceed
        ? 'Manual donor details saved. Donation options are ready.'
        : result.qualification?.reason || 'Manual donor details were saved, but they do not qualify yet.',
      variant: result.canProceed ? 'success' : 'info',
    });

    await loadModuleData();
  }, [loadModuleData, manualForm, manualPhoto, moduleData?.latestDonationRequirement, profile?.user_id, user?.id]);

  const handleOpenDrive = React.useCallback(async (drive) => {
    if (!drive?.donation_drive_id) return;

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

  const buildDriveQrSheet = React.useCallback((drive, registration) => {
    const qrState = registration?.qr || null;
    const payload = buildDriveInvitationQrPayload({
      drive,
      registration,
      donor: donorIdentity,
    });

    setQrSheet({
      type: 'drive',
      title: 'Drive invitation QR',
      subtitle: 'Present this QR at the donation drive.',
      helperText: qrState?.is_activated
        ? 'This QR is activated and stays official for this drive registration.'
        : qrState?.is_expired
          ? 'This QR expired before staff used it. Generate a new QR to continue.'
          : 'This QR stays valid for 15 minutes unless staff activates it first.',
      payload,
      isConfirmed: Boolean(qrState?.is_activated),
      canRegenerate: Boolean(qrState?.can_regenerate),
      expiresAt: qrState?.expires_at || '',
      qrStatus: qrState?.status || 'pending',
    });
  }, [donorIdentity]);

  const performDriveRsvp = React.useCallback(async () => {
    if (!selectedDrive?.donation_drive_id || !profile?.user_id || !user?.id) {
      setDriveFeedback({ message: 'Your donor account is required before sending an RSVP.', variant: 'info' });
      return;
    }

    if (!qualifiedSubmission?.submission_id || !qualifiedDetail?.submission_detail_id) {
      setDriveFeedback({ message: 'Save a donation entry first before joining a drive.', variant: 'info' });
      return;
    }

    setIsSubmittingRsvp(true);
    const result = await saveDriveDonationParticipation({
      userId: user.id,
      databaseUserId: profile.user_id,
      drive: selectedDrive,
      submission: qualifiedSubmission,
      detail: qualifiedDetail,
      qualificationSource: qualifiedDonationRecord?.source || entryPath,
    });
    setIsSubmittingRsvp(false);

    if (result.error) {
      setDriveFeedback({ message: 'RSVP could not be saved right now.', variant: 'error' });
      return;
    }

    const nextDrive = {
      ...selectedDrive,
      registration: result.registration,
      can_rsvp: false,
    };
    setSelectedDrive(nextDrive);
    setDriveFeedback({
      message: result.regenerated ? 'Expired QR replaced with a new one.' : result.alreadyRegistered ? 'RSVP already saved.' : 'RSVP saved.',
      variant: 'success',
    });
    buildDriveQrSheet(nextDrive, result.registration);
    await loadModuleData();
  }, [buildDriveQrSheet, entryPath, loadModuleData, profile?.user_id, qualifiedDetail, qualifiedDonationRecord?.source, qualifiedSubmission, selectedDrive, user?.id]);

  const handleDriveRsvp = React.useCallback(async () => {
    if (!selectedDrive) return;

    if (hasOngoingDonation) {
      setDriveFeedback({
        message: ongoingDonationMessage,
        variant: 'info',
      });
      return;
    }

    if (selectedDrive.organization_id && !selectedDrive.membership?.is_active) {
      setMembershipFeedback({ message: '', variant: 'info' });
      setIsMembershipPromptOpen(true);
      return;
    }

    await performDriveRsvp();
  }, [hasOngoingDonation, ongoingDonationMessage, performDriveRsvp, selectedDrive]);

  const handleJoinOrganization = React.useCallback(async () => {
    if (!selectedDrive?.organization_id || !profile?.user_id) {
      setMembershipFeedback({
        message: 'Your donor account is required before joining an organization.',
        variant: 'info',
      });
      return;
    }

    setIsJoiningOrganization(true);
    const result = await joinOrganizationMembership({
      organizationId: selectedDrive.organization_id,
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

    const refreshed = await fetchDonationDrivePreview(selectedDrive.donation_drive_id, profile.user_id);
    if (refreshed.data) {
      setSelectedDrive(refreshed.data);
    }

    setMembershipFeedback({
      message: result.alreadyMember ? 'You are already a member.' : 'Organization joined. You can continue to RSVP.',
      variant: 'success',
    });
    setIsMembershipPromptOpen(false);
    await performDriveRsvp();
  }, [performDriveRsvp, profile?.user_id, selectedDrive]);

  const handleViewDriveQr = React.useCallback(() => {
    if (!selectedDrive?.registration) return;
    buildDriveQrSheet(selectedDrive, selectedDrive.registration);
  }, [buildDriveQrSheet, selectedDrive]);

  const createIndependentQrSheet = React.useCallback(({
    submission = qualifiedSubmission,
    detail = qualifiedDetail,
    screening = qualifiedScreening,
    qualificationSource = qualifiedDonationRecord?.source || entryPath,
    qrState = moduleData?.independentQrState || null,
  } = {}) => {
    const resolvedDetail = getLatestSubmissionDetailRecord(submission, detail);

    if (!submission || !qrState?.reference) {
      return null;
    }

    const payload = buildIndependentDonationQrPayload({
      submission,
      detail: resolvedDetail,
      screening,
      donor: donorIdentity,
      qualificationSource,
      qrReference: qrState.reference,
      generatedAt: qrState.generated_at || '',
      confirmedAt: qrState.activated_at || '',
    });

    return {
      type: 'independent',
      title: 'Parcel QR',
      subtitle: 'Attach this QR to the parcel.',
      helperText: qrState.is_activated
        ? 'This QR is activated and is now the official QR for your donation flow.'
        : qrState.is_expired
          ? 'This QR expired before staff activated it. Generate a new QR to continue.'
          : 'Wait for staff to scan and activate this QR before continuing to parcel upload.',
      payload,
      qrReference: qrState.reference,
      generatedAt: qrState.generated_at || '',
      expiresAt: qrState.expires_at || '',
      isConfirmed: Boolean(qrState.is_activated),
      canRegenerate: Boolean(qrState.can_regenerate),
      qrStatus: qrState.status || 'pending',
    };
  }, [donorIdentity, entryPath, moduleData?.independentQrState, qualifiedDetail, qualifiedDonationRecord?.source, qualifiedScreening, qualifiedSubmission]);

  const openIndependentQrSheet = React.useCallback(async ({
    data = null,
    submission = null,
    detail = null,
    screening = null,
    qualificationSource = '',
    qrState = null,
    openAfterClose = false,
  } = {}) => {
    const sourceData = data || await loadModuleData();
    const resolvedSubmission = submission || sourceData?.latestSubmission || qualifiedSubmission || null;
    const resolvedDetail = getLatestSubmissionDetailRecord(
      resolvedSubmission,
      detail || sourceData?.latestDetail || qualifiedDetail,
    );
    const resolvedQrState = qrState
      || sourceData?.independentQrState
      || moduleData?.independentQrState
      || getIndependentDonationQrState({
        submission: resolvedSubmission,
        logistics: sourceData?.logistics || moduleData?.logistics || null,
        trackingEntries: sourceData?.trackingEntries || moduleData?.trackingEntries || [],
      })
      || null;
    const nextQrSheet = createIndependentQrSheet({
      submission: resolvedSubmission,
      detail: resolvedDetail,
      screening: screening || sourceData?.activeScreening || qualifiedScreening,
      qualificationSource: qualificationSource || sourceData?.activeQualificationSource || qualifiedDonationRecord?.source || entryPath,
      qrState: resolvedQrState,
    });

    if (!nextQrSheet) {
      return false;
    }

    showQrSheet(nextQrSheet, openAfterClose ? 260 : 0);

    return true;
  }, [
    createIndependentQrSheet,
    entryPath,
    loadModuleData,
    moduleData?.logistics,
    moduleData?.independentQrState,
    moduleData?.trackingEntries,
    qualifiedDetail,
    qualifiedDonationRecord?.source,
    qualifiedScreening,
    qualifiedSubmission,
    showQrSheet,
  ]);

  const buildIndependentQrSheet = React.useCallback(async () => {
    const didOpenQr = await openIndependentQrSheet();
    if (!didOpenQr) {
      setModuleFeedback({
        message: 'No QR is ready yet. Generate a new QR first.',
        variant: 'info',
      });
    }
  }, [openIndependentQrSheet]);

  const handleViewCurrentDonationQr = React.useCallback(async () => {
    if (!hasOngoingDonation) {
      return;
    }

    if (activeFlowType === 'drive' && activeDrive?.registration?.registration_id) {
      buildDriveQrSheet(activeDrive, activeDrive.registration);
      return;
    }

    if (activeFlowType === 'independent' && independentQrState?.reference) {
      await buildIndependentQrSheet();
      return;
    }

    setModuleFeedback({
      message: 'No valid QR is available for the current donation yet.',
      variant: 'info',
    });
  }, [
    activeDrive,
    activeFlowType,
    buildDriveQrSheet,
    buildIndependentQrSheet,
    hasOngoingDonation,
    independentQrState?.reference,
  ]);

  const handleAgreementContinue = React.useCallback(async () => {
    if (hasOngoingDonation && !qualifiedSubmission?.submission_id) {
      setModuleFeedback({
        message: ongoingDonationMessage,
        variant: 'info',
      });
      setIsAgreementOpen(false);
      return;
    }

    setIsAgreementOpen(false);
    const result = await ensureIndependentDonationQr({
      userId: user?.id,
      submission: qualifiedSubmission,
      databaseUserId: profile?.user_id || null,
    });

    if (!result.success) {
      setModuleFeedback({
        message: result.error || 'A QR could not be prepared right now.',
        variant: 'error',
      });
      return;
    }

    const openSavedQrFromResult = async ({ refreshedData = null } = {}) => {
      const didOpenQr = await openIndependentQrSheet({
        data: refreshedData,
        submission: result.submission || activeSubmission || qualifiedSubmission,
        detail: qualifiedDetail,
        screening: qualifiedScreening,
        qualificationSource: qualifiedDonationRecord?.source || entryPath,
        qrState: result.qrState || null,
        openAfterClose: true,
      });

      if (didOpenQr) {
        return true;
      }

      if (!result.qrState?.reference) {
        return false;
      }

      const fallbackSubmission = result.submission
        || refreshedData?.latestSubmission
        || activeSubmission
        || qualifiedSubmission
        || null;
      const fallbackSheet = createIndependentQrSheet({
        submission: fallbackSubmission,
        detail: getLatestSubmissionDetailRecord(
          fallbackSubmission,
          qualifiedDetail || refreshedData?.latestDetail || moduleData?.latestDetail || null,
        ),
        screening: qualifiedScreening || refreshedData?.activeScreening || moduleData?.activeScreening || null,
        qualificationSource: qualifiedDonationRecord?.source || refreshedData?.activeQualificationSource || entryPath,
        qrState: result.qrState
          || refreshedData?.independentQrState
          || moduleData?.independentQrState
          || null,
      });

      if (!fallbackSheet) {
        return false;
      }

      showQrSheet(fallbackSheet, 260);
      return true;
    };

    if (result.submission) {
      const refreshedData = await loadModuleData();
      const didOpenQr = await openSavedQrFromResult({ refreshedData });

      if (!didOpenQr) {
        setModuleFeedback({
          message: 'QR is saved, but it could not be displayed right now.',
          variant: 'error',
        });
        return;
      }
    } else {
      const didOpenQr = await openSavedQrFromResult();

      if (!didOpenQr) {
        setModuleFeedback({
          message: 'QR is saved, but it could not be displayed right now.',
          variant: 'error',
        });
        return;
      }
    }

    setModuleFeedback({
      message: result.reused ? 'Your current valid QR was loaded.' : 'A new QR is ready. It will expire in 15 minutes unless staff activates it first.',
      variant: 'success',
    });
  }, [activeSubmission, createIndependentQrSheet, entryPath, hasOngoingDonation, loadModuleData, moduleData?.activeScreening, moduleData?.independentQrState, moduleData?.latestDetail, ongoingDonationMessage, openIndependentQrSheet, profile?.user_id, qualifiedDetail, qualifiedDonationRecord?.source, qualifiedScreening, qualifiedSubmission, showQrSheet, user?.id]);

  const handleDownloadQr = React.useCallback(async () => {
    if (!qrSheet?.payload) return;

    setIsDownloadingQr(true);
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

      setModuleFeedback({
        message: qrSharingAvailable ? 'QR PDF is ready to save or share.' : `QR PDF generated at ${file.uri}.`,
        variant: 'success',
      });
    } catch (error) {
      setModuleFeedback({
        message: error.message || 'Unable to save the QR PDF right now.',
        variant: 'error',
      });
    } finally {
      setIsDownloadingQr(false);
    }
  }, [qrSheet, qrSharingAvailable]);

  const handlePrintQr = React.useCallback(async () => {
    if (!qrSheet?.payload) return;

    setIsPrintingQr(true);
    try {
      await printDonationQrPdf({
        title: qrSheet.title,
        subtitle: qrSheet.subtitle,
        helperText: qrSheet.helperText,
        qrPayloadText: qrSheet.payload,
      });

      setModuleFeedback({
        message: 'QR is ready to print.',
        variant: 'success',
      });
    } catch (error) {
      setModuleFeedback({
        message: error.message || 'Unable to open the print view right now.',
        variant: 'error',
      });
    } finally {
      setIsPrintingQr(false);
    }
  }, [qrSheet]);

  const handleCloseQrSheet = React.useCallback(() => {
    if (qrOpenTimerRef.current) {
      clearTimeout(qrOpenTimerRef.current);
      qrOpenTimerRef.current = null;
    }
    setQrSheet(null);
  }, []);

  const handleRegenerateQr = React.useCallback(async () => {
    if (qrSheet?.type === 'independent') {
      const expireResult = await expireIndependentDonationQr({
        userId: user?.id,
        submission: qualifiedSubmission,
        databaseUserId: profile?.user_id || null,
      });

      if (!expireResult.success) {
        setModuleFeedback({
          message: expireResult.error || 'The expired QR could not be cleared right now.',
          variant: 'error',
        });
        return;
      }

      const result = await ensureIndependentDonationQr({
        userId: user?.id,
        submission: expireResult.submission || qualifiedSubmission,
        databaseUserId: profile?.user_id || null,
      });

      if (!result.success || !result.qrState?.reference) {
        setModuleFeedback({
          message: result.error || 'A new QR could not be generated right now.',
          variant: 'error',
        });
        return;
      }

      const nextSubmission = result.submission || expireResult.submission || qualifiedSubmission;
      const nextDetail = getLatestSubmissionDetailRecord(nextSubmission, qualifiedDetail);

      const nextPayload = buildIndependentDonationQrPayload({
        submission: nextSubmission,
        detail: nextDetail,
        screening: qualifiedScreening,
        donor: donorIdentity,
        qualificationSource: qualifiedDonationRecord?.source || entryPath,
        qrReference: result.qrState.reference,
        generatedAt: result.qrState.generated_at || '',
        confirmedAt: result.qrState.activated_at || '',
      });

      setQrSheet((current) => current ? {
        ...current,
        payload: nextPayload,
        qrReference: result.qrState.reference,
        generatedAt: result.qrState.generated_at || '',
        expiresAt: result.qrState.expires_at || '',
        helperText: 'A new QR is ready. It will expire in 15 minutes unless staff activates it first.',
        isConfirmed: Boolean(result.qrState.is_activated),
        canRegenerate: Boolean(result.qrState.can_regenerate),
        qrStatus: result.qrState.status || 'pending',
      } : current);

      setModuleFeedback({
        message: 'A new parcel QR was generated.',
        variant: 'success',
      });
      await loadModuleData();
      return;
    }

    if (qrSheet?.type === 'drive' && selectedDrive?.donation_drive_id && profile?.user_id) {
      const result = await saveDriveDonationParticipation({
        userId: user?.id,
        databaseUserId: profile.user_id,
        drive: selectedDrive,
        submission: qualifiedSubmission,
        detail: qualifiedDetail,
        qualificationSource: qualifiedDonationRecord?.source || entryPath,
      });

      if (result.error || !result.registration) {
        setDriveFeedback({ message: 'A new drive QR could not be generated right now.', variant: 'error' });
        return;
      }

      const nextDrive = {
        ...selectedDrive,
        registration: result.registration,
        can_rsvp: false,
      };
      setSelectedDrive(nextDrive);
      buildDriveQrSheet(nextDrive, result.registration);
      setDriveFeedback({
        message: result.regenerated ? 'A new drive QR is ready.' : 'Your current drive QR is still valid.',
        variant: 'success',
      });
      await loadModuleData();
    }
  }, [buildDriveQrSheet, donorIdentity, entryPath, loadModuleData, profile?.user_id, qualifiedDetail, qualifiedDonationRecord?.source, qualifiedScreening, qualifiedSubmission, qrSheet?.type, selectedDrive, user?.id]);

  const handleUploadParcel = React.useCallback(async () => {
    if (!activeSubmission || !activeDetail) {
      setModuleFeedback({
        message: 'A qualified donation entry is required before parcel logging.',
        variant: 'error',
      });
      return;
    }

    if (!moduleData?.independentQrState?.is_activated || !moduleData?.independentQrState?.reference) {
      setModuleFeedback({
        message: 'Wait until staff scans and activates your QR before uploading the parcel photo.',
        variant: 'info',
      });
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
      submission: activeSubmission,
      detail: activeDetail,
      screening: activeScreening,
      donor: donorIdentity,
      qualificationSource: qualifiedDonationRecord?.source || entryPath,
      qrReference: moduleData.independentQrState.reference,
      generatedAt: moduleData.independentQrState.generated_at,
      confirmedAt: moduleData.independentQrState.activated_at,
    });

    const result = await saveIndependentDonationParcelLog({
      userId: user?.id,
      databaseUserId: profile?.user_id || null,
      submission: activeSubmission,
      detail: activeDetail,
      qrState: moduleData?.independentQrState || null,
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
      setModuleFeedback({
        message: result.error || 'Unable to save the parcel log.',
        variant: 'error',
      });
      return;
    }

    setIsParcelModalOpen(false);
    setQrSheet(null);
    setModuleFeedback({
      message: 'Parcel image uploaded. Timeline is now active.',
      variant: 'success',
    });
    await loadModuleData();
  }, [activeDetail, activeScreening, activeSubmission, donorIdentity, entryPath, loadModuleData, moduleData?.independentQrState, profile?.user_id, qualifiedDonationRecord?.source, user?.id]);

  const handleViewQrFromStage = React.useCallback(async () => {
    setSelectedTimelineStage(null);
    await handleViewCurrentDonationQr();
  }, [handleViewCurrentDonationQr]);

  const handleOpenManualModal = React.useCallback(() => {
    if (hasOngoingDonation) {
      setModuleFeedback({
        message: ongoingDonationMessage,
        variant: 'info',
      });
      return;
    }

    setManualFeedback({ message: '', variant: 'info' });
    setIsManualModalOpen(true);
  }, [hasOngoingDonation, ongoingDonationMessage]);

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
          subtitle={donationReady ? 'Donation actions ready' : 'Choose how to continue'}
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
      {moduleFeedback.message ? <StatusBanner message={moduleFeedback.message} variant={moduleFeedback.variant} /> : null}
      {certificateError && certificate ? <StatusBanner message={certificateError} variant="info" /> : null}

      {isLoading ? (
        <AppCard variant="default" radius="xl" padding="lg">
          <View style={styles.loadingState}>
            <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
            <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading donations</Text>
          </View>
        </AppCard>
      ) : (
        <>
          {hasOngoingDonation ? (
            <View style={styles.ongoingSummaryStrip}>
              <View style={styles.ongoingSummaryTop}>
                <View style={styles.ongoingSummaryCopy}>
                  <Text style={styles.ongoingSummaryTitle}>Current donation in progress</Text>
                  <Text style={styles.ongoingSummaryCaption}>Tracking is active for your saved donation flow.</Text>
                </View>
                {hasActiveQrAction ? (
                  <AppButton title="View my QR" variant="outline" fullWidth={false} onPress={handleViewCurrentDonationQr} />
                ) : null}
              </View>
              <View style={styles.ongoingSummaryMetaRow}>
                <View style={styles.ongoingSummaryMetaBlock}>
                  <Text style={styles.sourceSummaryLabel}>Current flow</Text>
                  <Text style={styles.sourceSummaryValue}>{currentFlowLabel}</Text>
                </View>
                <View style={styles.ongoingSummaryMetaBlock}>
                  <Text style={styles.sourceSummaryLabel}>Current status</Text>
                  <Text style={styles.sourceSummaryValue}>{currentStatusLabel}</Text>
                </View>
              </View>
            </View>
          ) : (
            <AppCard variant="default" radius="xl" padding="lg">
              <>
                <SectionTitle
                  eyebrow="Donation entry"
                  title={donationReady ? 'Donation source ready' : 'Choose entry'}
                  body={
                    moduleData?.latestScreening
                      ? `${latestAnalysisDecision || 'Latest result available'}${latestAnalysisCondition ? ` • ${latestAnalysisCondition}` : ''}`
                      : 'Use the latest result or enter details manually.'
                  }
                />

                <View style={styles.entryGrid}>
                  <EntryCard
                    icon="checkHair"
                    title="Use latest hair analysis"
                    body={aiPathReady ? 'Use the latest eligible saved result.' : 'No eligible saved result right now.'}
                    actionLabel={aiPathReady && entryPath === MANUAL_ENTRY_PATHS.ai ? 'Selected' : aiPathReady ? 'Use analysis' : 'Not ready'}
                    onPress={handleUseLatestAnalysis}
                    disabled={!aiPathReady || hasOngoingDonation}
                    active={entryPath === MANUAL_ENTRY_PATHS.ai && aiPathReady}
                  />
                  <EntryCard
                    icon="donations"
                    title="Manual donor entry"
                    body="Open the donor details module and save a current photo."
                    actionLabel="Open manual entry"
                    onPress={handleOpenManualModal}
                    disabled={hasOngoingDonation}
                    active={entryPath === MANUAL_ENTRY_PATHS.manual}
                  />
                </View>

                <View style={styles.sourceSummary}>
                  <Text style={styles.sourceSummaryLabel}>Active source</Text>
                  <Text style={styles.sourceSummaryValue}>
                    {donationReady
                      ? activeQualificationSource === 'manual'
                        ? 'Manual donor details'
                        : 'Latest hair analysis'
                      : entryPath === MANUAL_ENTRY_PATHS.manual
                        ? 'Manual donor entry'
                        : 'Latest hair analysis'}
                  </Text>
                </View>
              </>
            </AppCard>
          )}

          {!hasOngoingDonation ? (
            <>
              <View style={styles.contentSection}>
                <SectionTitle
                  eyebrow="Donation drives"
                  title="Join a drive"
                  body={donationReady ? 'Open a drive card to view details and RSVP.' : 'Finish donor entry first to join a drive.'}
                />

                {moduleData?.drives?.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.driveCarouselContent}>
                    {moduleData.drives.map((drive) => (
                      <DriveCarouselCard
                        key={drive.donation_drive_id}
                        drive={drive}
                        onPress={handleOpenDrive}
                        disabled={!donationReady}
                      />
                    ))}
                  </ScrollView>
                ) : (
                  <AppCard variant="default" radius="xl" padding="md">
                    <Text style={styles.emptyText}>No active drives right now.</Text>
                  </AppCard>
                )}
              </View>

              <View style={styles.contentSection}>
                <SectionTitle
                  eyebrow="Independent donation"
                  title="Donate independently"
                  body={donationReady ? 'Agreement, QR, then parcel upload.' : 'Finish donor entry first to continue.'}
                />

                <Pressable
                  onPress={async () => {
                    if (independentQrState?.show_my_qr) {
                      await buildIndependentQrSheet();
                      return;
                    }
                    setIsAgreementOpen(true);
                  }}
                  disabled={!donationReady}
                  style={({ pressed }) => [styles.independentPressable, pressed ? styles.pressableActive : null]}
                >
                  <AppCard variant="default" radius="xl" padding="md" style={[styles.independentCard, !donationReady ? styles.entryCardDisabled : null]}>
                    <View style={styles.independentCardRow}>
                      <View style={styles.independentIconWrap}>
                        <AppIcon name="truck-delivery-outline" size="sm" state="active" />
                      </View>
                      <View style={styles.independentCopy}>
                        <Text style={styles.independentTitle}>
                          {independentQrState?.show_my_qr ? 'Show my QR' : 'I want to donate independently'}
                        </Text>
                        <Text style={styles.independentBody}>
                          {independentQrState?.is_activated
                            ? 'Your official active QR is ready to view.'
                            : independentQrState?.is_pending
                              ? `${formatQrCountdownLabel(independentQrState.expires_at, qrNowMs)}. Waiting for staff activation.`
                              : 'Review agreement, generate QR, then wait for staff activation.'}
                        </Text>
                      </View>
                      <AppIcon name="chevron-right" size="sm" state="muted" />
                    </View>
                    {independentQrState?.show_my_qr ? (
                      <View style={styles.ongoingQrAction}>
                        <AppButton title="View my QR" variant="outline" fullWidth={false} onPress={() => { void buildIndependentQrSheet(); }} />
                      </View>
                    ) : null}
                  </AppCard>
                </Pressable>
              </View>
            </>
          ) : null}

          {(hasTimelinePreview || hasTimelineLog) ? (
            <AppCard variant="default" radius="xl" padding="lg" style={styles.contentSection}>
              <SectionTitle
                eyebrow="Timeline"
                title="Donation progress"
                body={hasTimelinePreview ? 'Tap a stage for details.' : 'Latest donation activity from your current saved record.'}
              />

              {hasTimelinePreview ? (
                <TimelinePreview stages={moduleData.timelineStages} onOpenStage={setSelectedTimelineStage} />
              ) : null}

              {hasTimelineLog ? (
                <View style={styles.logList}>
                  {moduleData.timelineEvents.map((event) => (
                    <DonationLogCard key={event.key} event={event} />
                  ))}
                </View>
              ) : null}
            </AppCard>
          ) : null}

          {certificate ? (
            <AppCard variant="default" radius="xl" padding="lg" style={styles.contentSection}>
              <SectionTitle
                eyebrow="Certificate"
                title="Certificate available"
                body={`Your certificate is ready${latestCertificateEmail ? ` and can be shared from ${latestCertificateEmail}.` : '.'}`}
              />

              <DonorCertificatePreview
                certificate={certificate}
                isGenerating={isGeneratingCertificate}
                isSharingAvailable={isSharingAvailable}
                generatedFileUri={generatedFileUri}
                onGenerate={generateCertificate}
                onShare={shareCertificate}
              />
            </AppCard>
          ) : null}

          {moduleData?.completedDonationHistory?.length ? (
            <View style={styles.contentSection}>
              <SectionTitle
                eyebrow="Donation history"
                title="Completed donations"
                body="Past completed donation records."
              />
              <View style={styles.historyList}>
                {moduleData.completedDonationHistory.map((item) => (
                  <DonationHistoryCard key={item.submission_id} item={item} />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}

      <ManualEntryModal
        visible={isManualModalOpen}
        form={manualForm}
        errors={manualFormErrors}
        photo={manualPhoto}
        feedback={manualFeedback}
        isSaving={isSavingManual}
        onClose={() => setIsManualModalOpen(false)}
        onChangeField={updateManualField}
        onPickPhoto={handlePickManualPhoto}
        onSave={handleSaveManualDetails}
      />

      <DriveBrowserModal
        visible={Boolean(selectedDrive)}
        drives={moduleData?.drives || []}
        selectedDrive={selectedDrive}
        isLoadingPreview={isLoadingDrivePreview}
        isSubmittingRsvp={isSubmittingRsvp}
        feedback={driveFeedback}
        onClose={() => {
          setSelectedDrive(null);
          setDriveFeedback({ message: '', variant: 'info' });
        }}
        onBack={() => {
          setSelectedDrive(null);
          setDriveFeedback({ message: '', variant: 'info' });
        }}
        onSelectDrive={handleOpenDrive}
        onRsvp={handleDriveRsvp}
        onViewQr={handleViewDriveQr}
      />

      <MembershipRequiredModal
        visible={isMembershipPromptOpen}
        drive={selectedDrive}
        feedback={membershipFeedback}
        isJoining={isJoiningOrganization}
        onClose={() => setIsMembershipPromptOpen(false)}
        onJoin={handleJoinOrganization}
      />

      <AgreementModal
        visible={isAgreementOpen}
        accepted={agreementAccepted}
        onToggle={() => setAgreementAccepted((current) => !current)}
        onClose={() => setIsAgreementOpen(false)}
        onContinue={handleAgreementContinue}
      />

      <QrModal
        visible={Boolean(qrSheet)}
        title={qrSheet?.title || ''}
        subtitle={qrSheet?.subtitle || ''}
        helperText={qrSheet?.helperText || ''}
        payload={qrSheet?.payload || ''}
        statusLabel={formatQrStatusLabel(qrSheet?.qrStatus || '')}
        countdownText={qrSheet?.isConfirmed ? '' : formatQrCountdownLabel(qrSheet?.expiresAt || '', qrNowMs)}
        onClose={handleCloseQrSheet}
        onDownload={handleDownloadQr}
        onPrint={handlePrintQr}
        onRegenerate={handleRegenerateQr}
        onNext={qrSheet?.type === 'independent' && qrSheet?.isConfirmed ? () => {
          handleCloseQrSheet();
          setIsParcelModalOpen(true);
        } : null}
        nextLabel="Continue to upload"
        isDownloading={isDownloadingQr}
        isPrinting={isPrintingQr}
        canRegenerate={Boolean(qrSheet?.canRegenerate)}
        isConfirmed={Boolean(qrSheet?.isConfirmed)}
      />

      <ParcelUploadModal
        visible={isParcelModalOpen}
        feedback={moduleFeedback}
        isUploading={isUploadingParcel}
        onClose={() => setIsParcelModalOpen(false)}
        onUpload={handleUploadParcel}
      />

      <StageDetailModal
        visible={Boolean(selectedTimelineStage)}
        stage={selectedTimelineStage}
        canViewQr={hasActiveQrAction}
        onViewQr={handleViewQrFromStage}
        onClose={() => setSelectedTimelineStage(null)}
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
  entryGrid: {
    gap: theme.spacing.md,
  },
  contentSection: {
    marginTop: theme.spacing.lg,
  },
  entryCardPressable: {
    borderRadius: theme.radius.xl,
  },
  entryCard: {
    gap: theme.spacing.md,
  },
  entryCardActive: {
    borderWidth: 1,
    borderColor: theme.colors.brandPrimary,
  },
  entryCardDisabled: {
    opacity: 0.56,
  },
  entryCardTop: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  entryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  entryCardCopy: {
    flex: 1,
    gap: 4,
  },
  entryCardTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  entryCardBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  sourceSummary: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    gap: 4,
  },
  sourceSummaryLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: theme.colors.textMuted,
  },
  sourceSummaryValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  ongoingSummaryStrip: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: theme.spacing.md,
  },
  ongoingSummaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  ongoingSummaryCopy: {
    flex: 1,
    gap: 4,
  },
  ongoingSummaryTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  ongoingSummaryCaption: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  ongoingSummaryMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  ongoingSummaryMetaBlock: {
    minWidth: 140,
    flex: 1,
    gap: 4,
  },
  ongoingQrAction: {
    marginTop: theme.spacing.md,
    alignItems: 'flex-start',
  },
  driveCarouselContent: {
    paddingRight: theme.spacing.md,
    gap: theme.spacing.md,
  },
  driveCardPressable: {
    borderRadius: theme.radius.xl,
  },
  driveCard: {
    width: 260,
    gap: theme.spacing.md,
  },
  driveCardTop: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  driveCardLogo: {
    width: 56,
    height: 56,
    borderRadius: 16,
  },
  driveCardLogoFallback: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  driveCardMeta: {
    flex: 1,
    gap: 4,
  },
  driveCardTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  driveCardText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  independentPressable: {
    borderRadius: theme.radius.xl,
  },
  independentCard: {
    gap: theme.spacing.sm,
  },
  independentCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  independentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  independentCopy: {
    flex: 1,
    gap: 4,
  },
  independentTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  independentBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  historyList: {
    gap: theme.spacing.md,
  },
  historyCard: {
    gap: theme.spacing.xs,
  },
  historyTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  historyMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  logList: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  logCard: {
    gap: theme.spacing.sm,
  },
  logHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  logTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  logBadge: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.brandPrimary,
  },
  logDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  logImage: {
    width: '100%',
    height: 180,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  logTimestamp: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
  timelineScrollContent: {
    alignItems: 'center',
    paddingRight: theme.spacing.md,
  },
  timelineNodeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineConnector: {
    width: 18,
    height: 2,
    marginHorizontal: theme.spacing.xs,
    backgroundColor: theme.colors.borderSubtle,
  },
  timelineConnectorCompleted: {
    backgroundColor: theme.colors.brandPrimary,
  },
  timelineNodePressable: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: theme.radius.full,
  },
  timelineDotDone: {
    backgroundColor: theme.colors.brandPrimary,
  },
  timelineDotCurrent: {
    backgroundColor: theme.colors.brandPrimary,
    borderWidth: 3,
    borderColor: theme.colors.brandPrimaryMuted,
  },
  timelineDotWaiting: {
    backgroundColor: theme.colors.borderStrong,
  },
  timelineCard: {
    width: 126,
    minHeight: 74,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    justifyContent: 'space-between',
  },
  timelineCardCurrent: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  timelineCardTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  timelineCardStatus: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
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
    maxHeight: '88%',
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
  modalFooter: {
    marginTop: theme.spacing.md,
  },
  inlineBanner: {
    marginBottom: theme.spacing.md,
  },
  pressableActive: {
    opacity: 0.92,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    justifyContent: 'flex-end',
  },
  qrActionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    justifyContent: 'flex-end',
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
  qrStatus: {
    marginTop: theme.spacing.md,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  qrCountdown: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.brandPrimary,
  },
  qrHelper: {
    marginTop: theme.spacing.md,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  driveListWrap: {
    gap: theme.spacing.sm,
  },
  driveRowPressable: {
    borderRadius: theme.radius.xl,
  },
  driveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  driveLogo: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceSoft,
  },
  driveLogoFallback: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  driveRowCopy: {
    flex: 1,
    gap: 2,
  },
  driveRowTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  driveRowMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textSecondary,
  },
  driveDetailWrap: {
    gap: theme.spacing.md,
  },
  driveDetailImage: {
    width: '100%',
    height: 164,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
  },
  driveDetailFallback: {
    width: '100%',
    height: 124,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  driveMetaGroup: {
    gap: 4,
  },
  driveDetailMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  driveDetailBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textPrimary,
  },
  modalLoadingState: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  modalLoadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
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
    color: theme.colors.textPrimary,
  },
  manualModalScroll: {
    paddingBottom: theme.spacing.sm,
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
  },
  manualLengthWrap: {
    flex: 1,
    minWidth: 170,
  },
  manualUnitWrap: {
    flex: 1,
    minWidth: 170,
  },
  manualPhotoCard: {
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
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
  stageDetailBody: {
    gap: theme.spacing.md,
  },
  stageDetailText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textPrimary,
  },
  stageDetailTimestamp: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
  stageSection: {
    gap: theme.spacing.sm,
  },
  stageSectionLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  stageEmptyState: {
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  stageEmptyText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  stageImageRow: {
    gap: theme.spacing.sm,
  },
  stageImage: {
    width: 112,
    height: 112,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  emptyText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
});
