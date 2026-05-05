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
import { donorDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuthActions } from '../../features/auth/hooks/useAuthActions';
import {
  fetchDonationDrivePreview,
  joinOrganizationMembership,
} from '../../features/donorHome.api';
import {
  buildDriveInvitationQrPayload,
  buildDonationTrackingQrPayload,
  buildQrImageUrl,
  getDonorDonationsModuleData,
  saveDriveDonationParticipation,
  saveManualDonationQualification,
} from '../../features/donorDonations.service';
import { buildProfileCompletionMeta } from '../../features/profile/services/profile.service';
import { resolveThemeRoles, theme } from '../../design-system/theme';

const MANUAL_FORM_DEFAULTS = {
  lengthValue: '',
  lengthUnit: 'in',
  bundleQuantity: '1',
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

function SectionTitle({ eyebrow, title, body }) {
  return (
    <View style={styles.sectionTitleWrap}>
      {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {body ? <Text style={styles.sectionBody}>{body}</Text> : null}
    </View>
  );
}

function ModalShell({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
  scrollContent = false,
  contentContainerStyle,
}) {
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

          <View style={styles.modalContent}>
            {scrollContent ? (
              <ScrollView
                style={styles.modalScrollView}
                contentContainerStyle={[styles.modalScrollContent, contentContainerStyle]}
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
            ) : children}
          </View>

          {footer ? <View style={styles.modalFooter}>{footer}</View> : null}
        </AppCard>
      </View>
    </Modal>
  );
}

function ModuleHeader({ eyebrow, title, body, roles }) {
  return (
    <View style={styles.moduleHeader}>
      {eyebrow ? <Text style={[styles.moduleEyebrow, { color: roles.primaryActionBackground }]}>{eyebrow}</Text> : null}
      <Text style={[styles.moduleTitle, { color: roles.headingText }]}>{title}</Text>
      {body ? <Text style={[styles.moduleBody, { color: roles.bodyText }]}>{body}</Text> : null}
    </View>
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
      <View style={[styles.entryCard, active ? styles.entryCardActive : null, disabled ? styles.entryCardDisabled : null]}>
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
      </View>
    </Pressable>
  );
}

function DonationHeroModule({ roles, isProfileComplete, isEligibilityFresh, isReady, hasOngoingDonation }) {
  const title = !isProfileComplete
    ? 'Finish your donor profile.'
    : !isEligibilityFresh
      ? 'Check your hair readiness.'
      : hasOngoingDonation
        ? 'Donation is in progress.'
        : isReady
          ? 'Ready to join a donation drive.'
          : 'Donation details are next.';
  const body = !isProfileComplete
    ? 'Complete your profile before requesting a hair donation.'
    : !isEligibilityFresh
      ? 'A recent hair eligibility result is required before continuing.'
      : hasOngoingDonation
        ? 'Track the current donation before starting another one.'
        : isReady
          ? 'Your hair eligibility and donation details are saved.'
          : 'Save your hair length, bundle count, and photo to generate your donation QR.';

  return (
    <View style={[styles.donationHeroModule, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}>
      <View style={[styles.heroBadge, { backgroundColor: roles.primaryActionBackground }]}>
        <Text style={[styles.heroBadgeText, { color: roles.primaryActionText }]}>Donation Readiness</Text>
      </View>
      <Text style={[styles.heroTitle, { color: roles.headingText }]}>{title}</Text>
      <Text style={[styles.heroBody, { color: roles.bodyText }]}>{body}</Text>
    </View>
  );
}

function ProfilePendingModule({ roles, completionMeta, onManageProfile }) {
  const missingItems = (completionMeta?.missingFieldLabels || []).slice(0, 3);
  const items = missingItems.length ? missingItems : ['Profile details'];

  return (
    <View style={styles.moduleBlock}>
      <View style={styles.pendingHeaderRow}>
        <ModuleHeader
          eyebrow="Pending items"
          title="Complete your account setup"
          body="These details are required before a donation request."
          roles={roles}
        />
        <View style={[styles.stepsPill, { backgroundColor: roles.tertiaryAccentBackground }]}>
          <Text style={[styles.stepsPillText, { color: roles.tertiaryAccentText }]}>{items.length} left</Text>
        </View>
      </View>

      <View style={styles.moduleList}>
        {items.map((label, index) => (
          <Pressable
            key={`${label}-${index}`}
            onPress={onManageProfile}
            style={({ pressed }) => [
              styles.moduleListRow,
              { borderBottomColor: roles.defaultCardBorder, opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <View style={[styles.moduleIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
              <AppIcon name={index === 0 ? 'profile' : index === 1 ? 'location' : 'editProfile'} size="sm" color={roles.iconPrimaryColor} />
            </View>
            <View style={styles.moduleRowCopy}>
              <Text style={[styles.moduleRowTitle, { color: roles.headingText }]}>{label}</Text>
              <Text style={[styles.moduleRowBody, { color: roles.bodyText }]}>Add this information in your profile.</Text>
            </View>
            <AppIcon name="chevronRight" size="sm" color={roles.metaText} />
          </Pressable>
        ))}
      </View>

      <View style={styles.moduleActionRow}>
        <AppButton title="Complete Profile" fullWidth={false} onPress={onManageProfile} />
      </View>
    </View>
  );
}

function DonationHistoryCard({ item }) {
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyIconWrap}>
        <AppIcon name="donations" size="sm" state="active" />
      </View>
      <View style={styles.historyCopy}>
        <Text numberOfLines={1} style={styles.historyTitle}>{item?.submission_code || 'Donation record'}</Text>
        <Text numberOfLines={1} style={styles.historyMeta}>{item?.date_label || 'Date unavailable'}</Text>
      </View>
      <Text style={styles.historyMeta}>{item?.bundle_quantity ? `${item.bundle_quantity} bundle${item.bundle_quantity === 1 ? '' : 's'}` : 'No bundle count'}</Text>
    </View>
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
  const imageUrl = drive?.event_image_url || drive?.organization_logo_url || '';

  return (
    <Pressable onPress={() => onPress?.(drive)} style={({ pressed }) => [styles.driveRowPressable, pressed ? styles.pressableActive : null]}>
      <View style={styles.driveRow}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.driveLogo} resizeMode="cover" />
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
        Join this organization first to view its donation drive details.
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
          {isDetailView ? (
            <AppButton
              title={selectedDrive?.registration ? 'View QR' : 'Join drive'}
              fullWidth={false}
              onPress={onRsvp}
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
          {selectedDrive?.event_image_url || selectedDrive?.organization_logo_url ? (
            <Image source={{ uri: selectedDrive.event_image_url || selectedDrive.organization_logo_url }} style={styles.driveDetailImage} resizeMode="cover" />
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
              {selectedDrive?.membership?.is_active ? 'Organization member' : 'Join organization first'}
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

function DriveQrModal({ visible, drive, payload, onClose }) {
  if (!visible || !payload) return null;

  return (
    <ModalShell
      visible={visible}
      title="Drive QR"
      subtitle={drive?.event_title || 'Donation drive registration'}
      onClose={onClose}
    >
      <View style={styles.driveQrWrap}>
        <Image source={{ uri: buildQrImageUrl(payload, 320) }} style={styles.driveQrImage} resizeMode="contain" />
      </View>
      <Text style={styles.driveQrText}>
        This QR uses your Donation_Drive_Registrations record for this drive.
      </Text>
    </ModalShell>
  );
}

function DonationQrModal({ visible, payload, onClose }) {
  if (!payload) return null;

  return (
    <ModalShell
      visible={visible}
      title="Donation QR Code"
      subtitle="Attach this QR to the hair donation package."
      onClose={onClose}
    >
      <View style={styles.driveQrWrap}>
        <Image source={{ uri: buildQrImageUrl(payload, 320) }} style={styles.driveQrImage} resizeMode="contain" />
      </View>
      <Text style={styles.driveQrText}>
        This QR uses the saved Hair_Submissions and Hair_Submission_Details records.
      </Text>
    </ModalShell>
  );
}

function HairEligibilityGate({ hasLatestScreening, latestLabel, onCheckHair }) {
  return (
    <View style={styles.moduleBlock}>
      <SectionTitle
        eyebrow="Hair eligibility"
        title="Hair eligibility check required"
        body={hasLatestScreening
          ? `Your latest hair eligibility check is older than one month${latestLabel ? ` (${latestLabel})` : ''}.`
          : 'Complete CheckHair before requesting to donate.'}
      />
      <View style={styles.gateActionRow}>
        <AppButton title="Go to Hair Eligibility" fullWidth={false} onPress={onCheckHair} />
      </View>
    </View>
  );
}

function EligibilityResultModule({
  roles,
  decision,
  condition,
  screening,
  latestLabel,
  donationReady,
  onOpenDetails,
  onRecheck,
}) {
  return (
    <View style={[styles.readinessModule, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      <View style={styles.readinessTop}>
        <View>
          <Text style={[styles.readinessTitle, { color: roles.headingText }]}>{decision || 'Eligible result available'}</Text>
          <Text style={[styles.readinessMeta, { color: roles.bodyText }]}>{latestLabel ? `Analyzed ${latestLabel}` : 'Hair check saved'}</Text>
        </View>
        <View style={[styles.readinessIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
          <AppIcon name={donationReady ? 'success' : 'checkHair'} color={roles.iconPrimaryColor} />
        </View>
      </View>

      <View style={styles.readinessGrid}>
        <View style={[styles.readinessMetric, { backgroundColor: roles.supportCardBackground }]}>
          <View style={styles.metricLabelRow}>
            <Text style={[styles.metricLabel, { color: roles.bodyText }]}>Hair Length</Text>
            <AppIcon name="ruler" size="sm" color={roles.primaryActionBackground} />
          </View>
          <Text style={[styles.metricValue, { color: roles.headingText }]}>{screening?.estimated_length ? `${screening.estimated_length} in` : 'Not recorded'}</Text>
        </View>
        <View style={[styles.readinessMetric, { backgroundColor: roles.supportCardBackground }]}>
          <View style={styles.metricLabelRow}>
            <Text style={[styles.metricLabel, { color: roles.bodyText }]}>Condition</Text>
            <AppIcon name="leaf" size="sm" color={roles.primaryActionBackground} />
          </View>
          <Text style={[styles.metricValue, { color: roles.headingText }]}>{condition || 'Not recorded'}</Text>
        </View>
      </View>

      <View style={styles.primaryActionStack}>
        <AppButton title={donationReady ? 'Update Donation Details' : 'Continue with Donation'} onPress={onOpenDetails} />
        <AppButton title="Re-check Hair" variant="outline" onPress={onRecheck} />
      </View>
    </View>
  );
}

function NextStepModule({ roles, donationReady, hasDrives, onOpenDetails }) {
  return (
    <View style={[styles.nextStepModule, { backgroundColor: roles.supportCardBackground }]}>
      <ModuleHeader
        eyebrow="Next step"
        title={donationReady ? 'Choose a drive to join' : 'Save donation details'}
        body={donationReady
          ? hasDrives ? 'Open a drive module below to review the event and generate your registration QR.' : 'Your donation details are ready. New drives will appear here.'
          : 'Add the hair length, bundle count, and donation photo before joining a drive.'}
        roles={roles}
      />
      {!donationReady ? (
        <View style={styles.moduleActionRow}>
          <AppButton title="Open Donation Details" fullWidth={false} onPress={onOpenDetails} />
        </View>
      ) : null}
    </View>
  );
}

function DriveModule({ roles, drives, donationReady, onOpenDrive }) {
  return (
    <View style={styles.moduleBlock}>
      <ModuleHeader
        eyebrow="Donation drives"
        title="Available drive modules"
        body={donationReady ? 'Select one drive to review details and join.' : 'Save donation details first to unlock drive joining.'}
        roles={roles}
      />

      {drives?.length ? (
        <View style={styles.driveModuleList}>
          {drives.map((drive) => (
            <Pressable
              key={drive.donation_drive_id}
              onPress={() => onOpenDrive?.(drive)}
              disabled={!donationReady}
              style={({ pressed }) => [
                styles.driveModuleRow,
                {
                  backgroundColor: roles.defaultCardBackground,
                  borderColor: roles.defaultCardBorder,
                  opacity: !donationReady ? 0.56 : pressed ? 0.84 : 1,
                },
              ]}
            >
              {drive?.event_image_url || drive?.organization_logo_url ? (
                <Image source={{ uri: drive.event_image_url || drive.organization_logo_url }} style={styles.driveModuleLogo} resizeMode="cover" />
              ) : (
                <View style={[styles.driveModuleLogo, styles.driveModuleLogoFallback, { backgroundColor: roles.iconPrimarySurface }]}>
                  <AppIcon name="organization" size="sm" color={roles.iconPrimaryColor} />
                </View>
              )}
              <View style={styles.driveModuleCopy}>
                <Text numberOfLines={1} style={[styles.driveModuleTitle, { color: roles.headingText }]}>{drive?.event_title || 'Donation drive'}</Text>
                <Text numberOfLines={1} style={[styles.driveModuleText, { color: roles.bodyText }]}>{drive?.organization_name || 'Organization'}</Text>
                <Text numberOfLines={1} style={[styles.driveModuleText, { color: roles.metaText }]}>{formatDriveDate(drive?.start_date, drive?.end_date)}</Text>
              </View>
              <AppIcon name="chevronRight" size="sm" color={roles.metaText} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={[styles.infoModule, { backgroundColor: roles.supportCardBackground }]}>
          <AppIcon name="calendar" color={roles.iconPrimaryColor} />
          <Text style={[styles.infoModuleText, { color: roles.bodyText }]}>No active drives right now.</Text>
        </View>
      )}
    </View>
  );
}

function CurrentDonationModule({ roles, flowLabel, statusLabel }) {
  return (
    <View style={[styles.nextStepModule, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      <ModuleHeader
        eyebrow="Current donation"
        title="Donation in progress"
        body="Complete or wait for the current donation process before starting another one."
        roles={roles}
      />
      <View style={styles.currentStatusGrid}>
        <View style={[styles.currentStatusTile, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.sourceSummaryLabel, { color: roles.metaText }]}>Current flow</Text>
          <Text style={[styles.sourceSummaryValue, { color: roles.headingText }]}>{flowLabel}</Text>
        </View>
        <View style={[styles.currentStatusTile, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.sourceSummaryLabel, { color: roles.metaText }]}>Current status</Text>
          <Text style={[styles.sourceSummaryValue, { color: roles.headingText }]}>{statusLabel}</Text>
        </View>
      </View>
    </View>
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
      title="Donation details"
      subtitle="Save the hair length, bundle count, and donation photo."
      onClose={onClose}
      scrollContent
      contentContainerStyle={styles.manualModalScroll}
      footer={(
        <View style={styles.inlineActions}>
          <AppButton title="Close" variant="outline" fullWidth={false} onPress={onClose} />
          <AppButton title={isSaving ? 'Saving...' : 'Save details'} fullWidth={false} onPress={onSave} loading={isSaving} />
        </View>
      )}
    >
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

        <AppInput
          label="Number of bundles"
          required
          value={form.bundleQuantity}
          onChangeText={(value) => onChangeField('bundleQuantity', value.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="1"
          error={errors.bundleQuantity}
        />

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
    </ModalShell>
  );
}

export function DonorDonationStatusScreen() {
  const router = useRouter();
  const { user, profile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const { logout, isLoading: isLoggingOut } = useAuthActions();
  const {
    unreadCount,
  } = useNotifications({
    role: 'donor',
    userId: user?.id,
    userEmail: user?.email || profile?.email || '',
    databaseUserId: profile?.user_id,
    mode: 'badge',
    liveUpdates: true,
  });
  const [moduleData, setModuleData] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [screenError, setScreenError] = React.useState('');
  const [moduleFeedback, setModuleFeedback] = React.useState({ message: '', variant: 'info' });
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
  const [driveQrPayload, setDriveQrPayload] = React.useState('');
  const [donationQrPayload, setDonationQrPayload] = React.useState('');
  const [isMembershipPromptOpen, setIsMembershipPromptOpen] = React.useState(false);
  const [membershipFeedback, setMembershipFeedback] = React.useState({ message: '', variant: 'info' });
  const [isJoiningOrganization, setIsJoiningOrganization] = React.useState(false);

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

  const donorProfileCompletionMeta = React.useMemo(() => buildProfileCompletionMeta({
    photo_path: profile?.photo_path || profile?.avatar_url || '',
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    birthdate: profile?.birthdate || '',
    gender: profile?.gender || '',
    contact_number: profile?.contact_number || profile?.phone || '',
    street: profile?.street || '',
    barangay: profile?.barangay || '',
    city: profile?.city || '',
    province: profile?.province || '',
    region: profile?.region || '',
    country: profile?.country || 'Philippines',
  }), [
    profile?.avatar_url,
    profile?.barangay,
    profile?.birthdate,
    profile?.city,
    profile?.contact_number,
    profile?.country,
    profile?.first_name,
    profile?.gender,
    profile?.last_name,
    profile?.phone,
    profile?.photo_path,
    profile?.province,
    profile?.region,
    profile?.street,
  ]);
  const isDonorProfileComplete = donorProfileCompletionMeta.isComplete;
  const latestAnalysisDecision = moduleData?.latestScreening?.decision || '';
  const latestAnalysisCondition = moduleData?.latestScreening?.detected_condition || '';
  const latestScreeningCreatedAt = moduleData?.latestScreening?.created_at || '';
  const latestScreeningLabel = latestScreeningCreatedAt ? formatDriveDate(latestScreeningCreatedAt) : '';
  const isHairEligibilityFresh = Boolean(
    latestScreeningCreatedAt
    && Date.now() - new Date(latestScreeningCreatedAt).getTime() <= 30 * 24 * 60 * 60 * 1000
  );
  const latestManualDonation = moduleData?.latestManualDonation || null;
  const manualDetailsCreatedAt = latestManualDonation?.created_at || latestManualDonation?.submission?.created_at || '';
  const hasDonationDetailsAfterEligibility = Boolean(
    latestManualDonation?.qualification?.isQualified
    && manualDetailsCreatedAt
    && latestScreeningCreatedAt
    && new Date(manualDetailsCreatedAt).getTime() >= new Date(latestScreeningCreatedAt).getTime()
  );
  const qualifiedDonationRecord = hasDonationDetailsAfterEligibility ? latestManualDonation : null;
  const qualifiedSubmission = qualifiedDonationRecord?.submission || null;
  const qualifiedDetail = qualifiedDonationRecord?.detail || null;
  const activeSubmission = moduleData?.latestSubmission || qualifiedSubmission || null;
  const donationReady = Boolean(isHairEligibilityFresh && qualifiedDonationRecord?.qualification?.isQualified);
  const aiPathReady = Boolean(moduleData?.isAiEligible);
  const hasOngoingDonation = Boolean(moduleData?.hasOngoingDonation);
  const activeFlowType = moduleData?.activeFlowType || '';
  const ongoingDonationMessage = moduleData?.ongoingDonationMessage || 'You already have an ongoing donation. Please complete or wait for the current donation process to finish before starting a new one.';
  const currentFlowLabel = activeFlowType === 'drive'
    ? 'Donation drive'
    : 'Donation in progress';
  const currentStatusLabel = activeSubmission?.status || 'In progress';

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
    const numericBundleQuantity = Number.parseInt(manualForm.bundleQuantity, 10);

    if (!Number.isFinite(numericLength) || numericLength <= 0) {
      nextErrors.lengthValue = 'Enter the current hair length using numbers only.';
    }

    if (!Number.isInteger(numericBundleQuantity) || numericBundleQuantity <= 0) {
      nextErrors.bundleQuantity = 'Enter at least 1 bundle.';
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
        bundle_quantity: numericBundleQuantity,
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

    setIsManualModalOpen(false);
    setManualFeedback({ message: '', variant: 'info' });
    setModuleFeedback({
      message: result.canProceed
        ? 'Donation details saved. Attach the generated QR to the package.'
        : result.qualification?.reason || 'Manual donor details were saved, but they do not qualify yet.',
      variant: result.canProceed ? 'success' : 'info',
    });
    if (result.canProceed) {
      setDonationQrPayload(buildDonationTrackingQrPayload({
        submission: result.submission,
        detail: result.detail,
        trackingStatus: result.submission?.status || result.detail?.status || '',
      }));
    }

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
      message: result.alreadyMember ? 'You are already a member.' : 'Organization joined.',
      variant: 'success',
    });
    setIsMembershipPromptOpen(false);
  }, [profile?.user_id, selectedDrive]);

  const handleDriveRsvp = React.useCallback(async () => {
    if (!selectedDrive) return;

    const shouldLinkDonationToDrive = Boolean(
      user?.id
      && profile?.user_id
      && qualifiedSubmission?.submission_id
      && qualifiedDetail?.submission_detail_id
      && (
        Number(qualifiedSubmission?.donation_drive_id || 0) !== Number(selectedDrive?.donation_drive_id || 0)
        || String(qualifiedSubmission?.donation_source || '').trim().toLowerCase() !== 'drive_donation'
      )
    );

    if (selectedDrive?.registration?.registration_id && !shouldLinkDonationToDrive) {
      setDriveQrPayload(buildDriveInvitationQrPayload({
        drive: selectedDrive,
        registration: selectedDrive.registration,
      }));
      return;
    }

    if (hasOngoingDonation) {
      setDriveFeedback({
        message: ongoingDonationMessage,
        variant: 'info',
      });
      return;
    }

    if (!selectedDrive?.membership?.is_active) {
      setMembershipFeedback({ message: '', variant: 'info' });
      setIsMembershipPromptOpen(true);
      return;
    }

    if (!user?.id || !profile?.user_id || !qualifiedSubmission?.submission_id || !qualifiedDetail?.submission_detail_id) {
      setDriveFeedback({
        message: 'A qualified donor entry is required before joining a drive.',
        variant: 'info',
      });
      return;
    }

    setIsSubmittingRsvp(true);
    const result = await saveDriveDonationParticipation({
      userId: user.id,
      databaseUserId: profile.user_id,
      drive: selectedDrive,
      submission: qualifiedSubmission,
      detail: qualifiedDetail,
      qualificationSource: qualifiedDonationRecord?.source || 'manual',
    });
    setIsSubmittingRsvp(false);

    if (result.error || !result.success) {
      setDriveFeedback({ message: result.error || 'Drive join could not be saved right now.', variant: 'error' });
      return;
    }

    const refreshed = await fetchDonationDrivePreview(selectedDrive.donation_drive_id, profile.user_id);
    if (refreshed.data) {
      setSelectedDrive(refreshed.data);
      if (refreshed.data?.registration?.registration_id) {
        setDonationQrPayload(buildDonationTrackingQrPayload({
          submission: result.submission,
          detail: qualifiedDetail,
          drive: refreshed.data,
          registration: refreshed.data.registration,
          trackingStatus: result.submission?.status || qualifiedDetail?.status || '',
        }));
      }
    } else if (result.registration?.registration_id) {
      setDonationQrPayload(buildDonationTrackingQrPayload({
        submission: result.submission,
        detail: qualifiedDetail,
        drive: selectedDrive,
        registration: result.registration,
        trackingStatus: result.submission?.status || qualifiedDetail?.status || '',
      }));
    }

    setDriveFeedback({
      message: result.alreadyRegistered
        ? 'Drive registration linked to your donation. Attach the generated donation QR to the package.'
        : 'Drive joined. Attach the generated donation QR to the package.',
      variant: 'success',
    });
    await loadModuleData();
  }, [
    hasOngoingDonation,
    loadModuleData,
    ongoingDonationMessage,
    profile?.user_id,
    qualifiedDetail,
    qualifiedDonationRecord?.source,
    qualifiedSubmission,
    selectedDrive,
    user?.id,
  ]);

  const handleOpenManualModal = React.useCallback(() => {
    if (!isDonorProfileComplete) {
      router.navigate('/profile');
      return;
    }

    if (!isHairEligibilityFresh) {
      router.navigate('/donor/donations');
      return;
    }

    if (hasOngoingDonation) {
      setModuleFeedback({
        message: ongoingDonationMessage,
        variant: 'info',
      });
      return;
    }

    setManualFeedback({ message: '', variant: 'info' });
    setIsManualModalOpen(true);
  }, [hasOngoingDonation, isDonorProfileComplete, isHairEligibilityFresh, ongoingDonationMessage, router]);

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

      {isLoading ? (
        <View style={[styles.loadingModule, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <View style={styles.loadingState}>
            <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
            <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading donations</Text>
          </View>
        </View>
      ) : (
        <View style={styles.donationPage}>
          <DonationHeroModule
            roles={roles}
            isProfileComplete={isDonorProfileComplete}
            isEligibilityFresh={isHairEligibilityFresh}
            isReady={donationReady}
            hasOngoingDonation={hasOngoingDonation}
          />
          {!isDonorProfileComplete ? (
            <ProfilePendingModule
              roles={roles}
              completionMeta={donorProfileCompletionMeta}
              onManageProfile={() => router.navigate('/profile')}
            />
          ) : !isHairEligibilityFresh ? (
            <HairEligibilityGate
              hasLatestScreening={Boolean(moduleData?.latestScreening)}
              latestLabel={latestScreeningLabel}
              onCheckHair={() => router.navigate('/donor/donations')}
            />
          ) : hasOngoingDonation ? (
            <CurrentDonationModule
              roles={roles}
              flowLabel={currentFlowLabel}
              statusLabel={currentStatusLabel}
            />
          ) : (
            <>
              <EligibilityResultModule
                roles={roles}
                decision={latestAnalysisDecision}
                condition={latestAnalysisCondition}
                screening={moduleData?.latestScreening}
                latestLabel={latestScreeningLabel}
                donationReady={donationReady}
                onOpenDetails={handleOpenManualModal}
                onRecheck={() => router.navigate('/donor/donations')}
              />

              <NextStepModule
                roles={roles}
                donationReady={donationReady}
                hasDrives={Boolean(moduleData?.drives?.length)}
                onOpenDetails={handleOpenManualModal}
              />
              {false ? (
                <>
                <SectionTitle
                  eyebrow="Hair eligibility result"
                  title={latestAnalysisDecision || 'Eligible result available'}
                  body={
                    moduleData?.latestScreening
                      ? `${latestAnalysisCondition || 'Hair check saved'}${latestScreeningLabel ? ` • ${latestScreeningLabel}` : ''}`
                      : 'Complete CheckHair before requesting to donate.'
                  }
                />

                <View style={styles.entryGrid}>
                  <EntryCard
                    icon="donations"
                    title="Continue with donation details"
                    body="Enter hair length, number of bundles, and a donation photo."
                    actionLabel={donationReady ? 'Update details' : 'Open details'}
                    onPress={handleOpenManualModal}
                    disabled={hasOngoingDonation}
                    active={donationReady}
                  />
                  <EntryCard
                    icon="checkHair"
                    title="Re-check hair eligibility"
                    body="Run CheckHair again if you want a newer eligibility result."
                    actionLabel="Re-check"
                    onPress={() => router.navigate('/donor/donations')}
                    disabled={hasOngoingDonation}
                    active={false}
                  />
                </View>

                <View style={styles.sourceSummary}>
                  <Text style={styles.sourceSummaryLabel}>Eligibility source</Text>
                  <Text style={styles.sourceSummaryValue}>
                    {aiPathReady ? 'Latest hair analysis within one month' : 'Hair analysis result saved'}
                  </Text>
                </View>
                </>
              ) : null}
            </>
          )}

          {isDonorProfileComplete && isHairEligibilityFresh && !hasOngoingDonation ? (
            <DriveModule
              roles={roles}
              drives={moduleData?.drives || []}
              donationReady={donationReady}
              onOpenDrive={handleOpenDrive}
            />
          ) : null}

          {moduleData?.completedDonationHistory?.length ? (
            <View style={styles.contentSection}>
              <ModuleHeader
                eyebrow="Donation history"
                title="Completed donations"
                body="Past completed donation records."
                roles={roles}
              />
              <View style={styles.historyList}>
                {moduleData.completedDonationHistory.map((item) => (
                  <DonationHistoryCard key={item.submission_id} item={item} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
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
      />

      <MembershipRequiredModal
        visible={isMembershipPromptOpen}
        drive={selectedDrive}
        feedback={membershipFeedback}
        isJoining={isJoiningOrganization}
        onClose={() => setIsMembershipPromptOpen(false)}
        onJoin={handleJoinOrganization}
      />

      <DriveQrModal
        visible={Boolean(driveQrPayload)}
        drive={selectedDrive}
        payload={driveQrPayload}
        onClose={() => setDriveQrPayload('')}
      />

      <DonationQrModal
        visible={Boolean(donationQrPayload)}
        payload={donationQrPayload}
        onClose={() => setDonationQrPayload('')}
      />
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  donationPage: {
    gap: theme.spacing.lg,
  },
  loadingModule: {
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
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
  moduleBlock: {
    gap: theme.spacing.md,
  },
  moduleHeader: {
    gap: theme.spacing.xs,
  },
  moduleEyebrow: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimaryMuted,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  moduleTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
  },
  moduleBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  donationHeroModule: {
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
  },
  heroBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  heroTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.title,
    lineHeight: theme.typography.semantic.title * 1.16,
  },
  heroBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
  },
  pendingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  stepsPill: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
  },
  stepsPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
  },
  moduleList: {
    gap: 0,
  },
  moduleListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: 72,
    borderBottomWidth: 1,
  },
  moduleIconWrap: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleRowCopy: {
    flex: 1,
    gap: 3,
  },
  moduleRowTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  moduleRowBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  moduleActionRow: {
    alignItems: 'flex-start',
  },
  readinessModule: {
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  readinessTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  readinessTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  readinessMeta: {
    marginTop: 4,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  readinessIconWrap: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readinessGrid: {
    gap: theme.spacing.md,
  },
  readinessMetric: {
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  metricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  metricLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  metricValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
  },
  primaryActionStack: {
    gap: theme.spacing.sm,
  },
  nextStepModule: {
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  driveModuleList: {
    gap: theme.spacing.sm,
  },
  driveModuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: 82,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
  },
  driveModuleLogo: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.lg,
  },
  driveModuleLogoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  driveModuleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  driveModuleTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  driveModuleText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  infoModule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
  },
  infoModuleText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  currentStatusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  currentStatusTile: {
    flex: 1,
    minWidth: 140,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    gap: 4,
  },
  entryGrid: {
    gap: theme.spacing.md,
  },
  cardPressed: {
    opacity: 0.82,
  },
  profileGateCard: {
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceElevated,
    padding: theme.spacing.lg,
  },
  profileGateTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  profileGateIcon: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  profileGateCopy: {
    flex: 1,
    gap: 4,
  },
  profileGateTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  profileGateBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  gateActionRow: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
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
  historyList: {
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    paddingVertical: theme.spacing.sm,
  },
  historyIconWrap: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  historyCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    backgroundColor: theme.colors.overlay,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '82%',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  modalContent: {
    flexShrink: 1,
    minHeight: 0,
  },
  modalScrollView: {
    flexShrink: 1,
    minHeight: 0,
  },
  modalScrollContent: {
    paddingBottom: theme.spacing.md,
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
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
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
  driveQrWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
  },
  driveQrImage: {
    width: 240,
    height: 240,
  },
  driveQrText: {
    marginTop: theme.spacing.md,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
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
    paddingBottom: theme.spacing.lg,
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
  emptyText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
});
