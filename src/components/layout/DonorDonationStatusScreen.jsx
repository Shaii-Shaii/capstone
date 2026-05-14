import React from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DashboardLayout } from './DashboardLayout';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { AppInput } from '../ui/AppInput';
import { StatusBanner } from '../ui/StatusBanner';
import { DonorTopBar } from '../donor/DonorTopBar';
import { donorDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuthActions } from '../../features/auth/hooks/useAuthActions';
import { supabase } from '../../api/supabase/client';
import {
  buildDonationTrackingQrPayload,
  buildQrImageUrl,
  getDonorDonationsModuleData,
  printDonationQrPdf,
  saveManualDonationQualification,
  saveDonationQrPngToDevice,
  startIndependentDonationDraft,
  addDonationBundleFromAnalysis,
  addDonationBundleFromManualDetails,
  updateManualDonationDetail,
  ensureIndependentDonationQr,
  cancelDonorDonation,
} from '../../features/donorDonations.service';
import { buildProfileCompletionMeta } from '../../features/profile/services/profile.service';
import { canSubmitHairDonation, DONOR_PERMISSION_REASONS, mapDonationPermissionError } from '../../features/donorCompliance.service';
import { resolveThemeRoles, theme } from '../../design-system/theme';

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MANUAL_FORM_DEFAULTS = {
  donorType: 'own',
  donorName: '',
  donorBirthdate: '',
  lengthValue: '',
  lengthUnit: 'in',
  treated: 'no',
  colored: 'no',
  trimmed: 'no',
  hairColor: 'Natural black',
  density: 'Medium density',
};

const ADDITIONAL_BUNDLE_DEFAULTS = {
  donorType: 'own',
  inputMethod: 'scan',
  donorName: '',
  donorBirthdate: '',
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
const DONATION_REALTIME_DEBOUNCE_MS = 420;

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

const formatDateLabel = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const isValidBirthdate = (value) => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const [year, month, day] = text.split('-').map(Number);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) {
    return false;
  }
  return parsed <= new Date();
};

const getAgeFromBirthdate = (value) => {
  if (!isValidBirthdate(value)) return null;
  const birthdate = new Date(`${String(value).trim()}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  const monthDelta = today.getMonth() - birthdate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthdate.getDate())) {
    age -= 1;
  }
  return age;
};

const getScreeningLogText = (screening = null, { preferSummary = false } = {}) => {
  const values = preferSummary
    ? [screening?.summary, screening?.visible_damage_notes, screening?.detected_condition, screening?.decision]
    : [screening?.decision, screening?.summary, screening?.visible_damage_notes, screening?.detected_condition];

  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
};

const buildDonationDecisionText = ({ screening = null, isEligible = false, ineligibilityReason = '' }) => {
  if (isEligible) {
    const decision = String(screening?.decision || '').trim().toLowerCase();
    const preferSummary = decision.includes('improve') || decision.includes('not eligible') || decision.includes('needs');
    return getScreeningLogText(screening, { preferSummary });
  }

  const reason = String(ineligibilityReason || '').trim();
  if (reason) return reason;

  return getScreeningLogText(screening);
};

const formatScreeningLengthInches = (screening = null) => {
  const lengthCm = Number(screening?.estimated_length);
  if (!Number.isFinite(lengthCm) || lengthCm <= 0) return 'N/A';
  return `${(lengthCm / 2.54).toFixed(1)}"`;
};

const getDriveDateLabel = (drive = null) => (
  drive?.start_date
    ? `${formatDateLabel(drive.start_date)}${drive?.end_date ? ` - ${formatDateLabel(drive.end_date)}` : ''}`
    : 'Schedule to be announced'
);

const getDriveOrganizationLabel = (drive = null) => (
  drive?.organization_name || drive?.organization?.organization_name || 'Partner organization'
);

const isClosedDonationStatus = (status = '') => {
  const normalized = String(status || '').trim().toLowerCase();
  return ['completed', 'cancelled', 'canceled', 'rejected', 'closed'].includes(normalized);
};

const DONATION_MODULE_SCREEN = {
  EVENTS: 'events',
  EVENT_DETAILS: 'eventDetails',
  SUMMARY: 'summary',
  ADD_HAIR_SOURCE: 'addHairSource',
  INPUT_METHOD: 'inputMethod',
  RECIPIENT: 'recipient',
  QR_CODES: 'qrCodes',
  MY_DONATIONS: 'myDonations',
  DONATION_STATUS: 'donationStatus',
};

const MY_DONATION_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'completed', label: 'Completed' },
  { key: 'past', label: 'Past' },
];

const hasDonationQrMetadata = (submission = null) => (
  String(submission?.donor_notes || '').includes('[DONIVRA_QR_META]')
);

const isSubmittedDonationStatus = (status = '') => (
  String(status || '').trim().toLowerCase().includes('submitted')
);

const isSubmittedDonationItem = (item = null) => (
  Boolean(
    item?.submission?.submission_id
    && isSubmittedDonationStatus(item.submission.status)
  )
);

const formatDateTimeLabel = (dateString) => {
  if (!dateString) return '';
  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(dateString));
  } catch {
    return String(dateString || '');
  }
};

const getDriveLocationLabel = (drive = null) => (
  drive?.location_label
  || drive?.address_label
  || [drive?.street, drive?.barangay, drive?.city, drive?.province, drive?.country].filter(Boolean).join(', ')
  || 'Location to be announced'
);

const getDriveTimeState = (drive = null) => {
  const now = Date.now();
  const startTime = drive?.start_date ? new Date(drive.start_date).getTime() : 0;
  const endTime = drive?.end_date ? new Date(drive.end_date).getTime() : startTime;

  if (Number.isFinite(endTime) && endTime && endTime < now) return 'past';
  if (Number.isFinite(startTime) && startTime && startTime > now) return 'upcoming';
  if (startTime || endTime) return 'active';
  return 'active';
};

const getDonationCardMeta = ({ submission = null, drive = null, logistics = null } = {}) => {
  const rawStatus = String(logistics?.shipment_status || submission?.status || '').trim();
  const normalized = rawStatus.toLowerCase();

  if (isClosedDonationStatus(rawStatus)) {
    return {
      label: normalized.includes('complete') ? 'Completed' : rawStatus || 'Closed',
      category: normalized.includes('complete') ? 'completed' : 'past',
      icon: 'check-circle-outline',
    };
  }

  if (submission?.submission_id) {
    if (normalized.includes('submitted')) {
      return { label: 'Submitted', category: 'submitted', icon: 'upload-check-outline' };
    }

    return {
      label: rawStatus || 'Active Now',
      category: 'active',
      icon: 'content-cut',
    };
  }

  const driveState = getDriveTimeState(drive);
  if (driveState === 'past') return { label: 'Past', category: 'past', icon: 'calendar-remove-outline' };
  if (driveState === 'upcoming') return { label: 'Upcoming', category: 'active', icon: 'calendar-clock-outline' };
  return { label: 'Active Now', category: 'active', icon: 'calendar-check-outline' };
};

const getTimelineStageDescription = (stage = {}) => {
  if (stage?.savedNote) return stage.savedNote;

  switch (stage?.key) {
    case 'ready_for_shipment':
      return 'Your hair donation record and QR have been prepared for staff scanning.';
    case 'in_transit':
      return 'The donation is moving through the logistics process.';
    case 'received_by_organization':
      return 'The organization has received the hair donation.';
    case 'quality_checking':
      return 'The organization is reviewing the hair quality and donation details.';
    case 'ready_for_shipment_to_receiver':
      return 'The donation is ready for the receiver or wig production process.';
    case 'received_by_patient':
      return 'The donation journey has reached the recipient stage.';
    default:
      return 'Waiting for the next logistics update.';
  }
};

// â”€â”€â”€ Shared UI primitives â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionHeader({ eyebrow, title, body, roles }) {
  return (
    <View style={styles.sectionHeader}>
      {eyebrow ? (
        <Text style={[styles.sectionEyebrow, { color: roles.primaryActionBackground }]}>{eyebrow}</Text>
      ) : null}
      <Text style={[styles.sectionTitle, { color: roles.headingText }]}>{title}</Text>
      {body ? <Text style={[styles.sectionBody, { color: roles.bodyText }]}>{body}</Text> : null}
    </View>
  );
}

function ModalShell({ visible, title, subtitle, onClose, children, footer, scrollContent = false }) {
  if (!visible) return null;
  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>{title}</Text>
              {subtitle ? <Text style={styles.modalSubtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} style={styles.modalCloseBtn}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>
          <View style={styles.modalBody}>
            {scrollContent ? (
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            ) : children}
          </View>
          {footer ? <View style={styles.modalFooter}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

function ChoiceField({ label, value, options, onChange }) {
  return (
    <View style={styles.choiceField}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <View style={styles.choiceChipRow}>
        {options.map((opt) => {
          const active = value === opt.value;
          const disabled = Boolean(opt.disabled);
          return (
            <Pressable
              key={opt.value}
              disabled={disabled}
              onPress={() => {
                if (!disabled) onChange?.(opt.value);
              }}
              style={[
                styles.choiceChip,
                active ? styles.choiceChipActive : null,
                disabled ? styles.choiceChipDisabled : null,
              ]}
            >
              <Text style={[
                styles.choiceChipText,
                active ? styles.choiceChipTextActive : null,
                disabled ? styles.choiceChipTextDisabled : null,
              ]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ManualSection({ icon, title, body, children, roles }) {
  return (
    <View style={[styles.manualSectionCard, { backgroundColor: roles.pageBackground, borderColor: roles.defaultCardBorder }]}>
      <View style={styles.manualSectionHeader}>
        <View style={[styles.manualSectionIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
          <AppIcon name={icon} size="sm" color={roles.iconPrimaryColor} />
        </View>
        <View style={styles.manualSectionCopy}>
          <Text style={[styles.manualSectionTitle, { color: roles.headingText }]}>{title}</Text>
          {body ? <Text style={[styles.manualSectionBody, { color: roles.bodyText }]}>{body}</Text> : null}
        </View>
      </View>
      <View style={styles.manualSectionContent}>
        {children}
      </View>
    </View>
  );
}

// â”€â”€â”€ Profile pending â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ProfilePendingCard({ roles, completionMeta, onManageProfile }) {
  const missing = (completionMeta?.missingFieldLabels || []).slice(0, 3);
  const items = missing.length ? missing : ['Profile details'];

  return (
    <View style={[styles.card, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      <SectionHeader
        eyebrow="Account setup"
        title="Complete your profile first"
        body="Your profile must be complete before you can make a donation request."
        roles={roles}
      />
      <View style={styles.pendingList}>
        {items.map((label, i) => (
          <View key={`${label}-${i}`} style={[styles.pendingRow, { borderBottomColor: roles.defaultCardBorder }]}>
            <View style={[styles.pendingIcon, { backgroundColor: roles.iconPrimarySurface }]}>
              <AppIcon name="profile" size="sm" color={roles.iconPrimaryColor} />
            </View>
            <Text style={[styles.pendingLabel, { color: roles.bodyText }]}>{label}</Text>
          </View>
        ))}
      </View>
      <AppButton title="Complete Profile" onPress={onManageProfile} fullWidth />
    </View>
  );
}

// â”€â”€â”€ Hair eligibility gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function HairEligibilityGateCard({ roles, hasScreening, screeningLabel, onCheckHair }) {
  return (
    <View style={[styles.card, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      <SectionHeader
        eyebrow="Hair eligibility"
        title="Hair check required"
        body={
          hasScreening
            ? `Your last hair check${screeningLabel ? ` (${screeningLabel})` : ''} is older than 30 days. Please redo it.`
            : 'Complete a hair eligibility check before requesting a donation.'
        }
        roles={roles}
      />
      <AppButton title="Go to Hair Check" onPress={onCheckHair} fullWidth />
    </View>
  );
}

// â”€â”€â”€ Active joined drive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DonationHomeOverview({
  roles,
  latestScreening,
  isEligible,
  joinedDrives,
  drives,
  displayDrive,
  hasOngoingDonation,
  hasGeneratedDonationQr,
  onCheckHair,
  onFindOrganizations,
  onSubmitDriveDonation,
  onSubmitDonation,
  onAddHair,
  onCancelDonation,
  isSubmittingDonation,
}) {
  const organizationCards = React.useMemo(() => {
    const seen = new Set();
    const source = [
      ...(joinedDrives || []),
      ...(drives || []).filter((drive) => drive?.organization_id),
    ];

    return source.filter((drive) => {
      const key = drive?.organization_id || getDriveOrganizationLabel(drive);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4);
  }, [drives, joinedDrives]);
  const participatedEventCards = (joinedDrives || []).slice(0, 4);
  const hasScreening = Boolean(latestScreening);
  const bannerTitle = isEligible
    ? "You're Eligible to Donate!"
    : hasScreening
      ? 'Not Ready for Donation Yet'
      : 'Complete CheckHair First';
  const bannerStatus = isEligible ? 'Ready' : hasScreening ? 'Needs care' : 'No scan';
  const upcomingTitle = displayDrive?.event_title || (hasOngoingDonation ? 'Independent hair donation' : 'No upcoming donation yet');
  const upcomingBody = displayDrive
    ? getDriveDateLabel(displayDrive)
    : hasOngoingDonation
      ? hasGeneratedDonationQr
        ? 'QR generated. Attach it to the matching hair plastic.'
        : 'Review the saved hair details, then submit to generate its QR.'
      : isEligible
        ? 'Choose a drive or start an independent donation.'
        : 'Complete an eligible CheckHair result before donating.';

  return (
    <View style={styles.donationHome}>
      <View style={[styles.eligibleBanner, { backgroundColor: isEligible ? roles.primaryActionBackground : roles.supportCardBackground }]}>
        <View style={styles.eligibleBannerHeader}>
          <View style={[styles.eligibleBannerIcon, { backgroundColor: isEligible ? 'rgba(255,255,255,0.18)' : roles.iconPrimarySurface }]}>
            <MaterialCommunityIcons
              name={isEligible ? 'check-circle-outline' : 'hair-dryer-outline'}
              size={24}
              color={isEligible ? roles.primaryActionText : roles.iconPrimaryColor}
            />
          </View>
          <Text style={[styles.eligibleBannerTitle, { color: isEligible ? roles.primaryActionText : roles.headingText }]}>
            {bannerTitle}
          </Text>
        </View>
        <View style={[styles.eligibleStatsCard, { borderColor: isEligible ? 'rgba(255,255,255,0.22)' : roles.defaultCardBorder }]}>
          <View style={styles.eligibleStat}>
            <Text style={[styles.eligibleStatLabel, { color: isEligible ? 'rgba(255,255,255,0.78)' : roles.metaText }]}>CURRENT LENGTH</Text>
            <Text style={[styles.eligibleStatValue, { color: isEligible ? roles.primaryActionText : roles.headingText }]}>
              {formatScreeningLengthInches(latestScreening)}
            </Text>
          </View>
          <View style={[styles.eligibleDivider, { backgroundColor: isEligible ? 'rgba(255,255,255,0.25)' : roles.defaultCardBorder }]} />
          <View style={[styles.eligibleStat, styles.eligibleStatCenter]}>
            <Text style={[styles.eligibleStatLabel, { color: isEligible ? 'rgba(255,255,255,0.78)' : roles.metaText }]}>HAIR TYPE</Text>
            <Text style={[styles.eligibleStatValue, { color: isEligible ? roles.primaryActionText : roles.headingText }]} numberOfLines={1}>
              {latestScreening?.detected_texture || 'N/A'}
            </Text>
          </View>
          <View style={[styles.eligibleDivider, { backgroundColor: isEligible ? 'rgba(255,255,255,0.25)' : roles.defaultCardBorder }]} />
          <View style={[styles.eligibleStat, styles.eligibleStatEnd]}>
            <Text style={[styles.eligibleStatLabel, { color: isEligible ? 'rgba(255,255,255,0.78)' : roles.metaText }]}>STATUS</Text>
            <Text style={[styles.eligibleStatValue, { color: isEligible ? roles.primaryActionText : roles.headingText }]} numberOfLines={1}>
              {bannerStatus}
            </Text>
          </View>
        </View>
        {!hasScreening ? (
          <AppButton title="Start CheckHair" variant="secondary" fullWidth={false} onPress={onCheckHair} />
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: roles.headingText }]}>Your Organizations</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.organizationScroll}>
          {organizationCards.map((drive, index) => {
            const organizationName = getDriveOrganizationLabel(drive);
            const logoUri = drive?.organization_logo_url || drive?.organization?.organization_logo_url || '';
            return (
              <View
                key={`${drive?.organization_id || drive?.donation_drive_id || organizationName}-${index}`}
                style={[styles.organizationMiniCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}
              >
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.organizationMiniLogo} resizeMode="cover" />
                ) : (
                  <View style={[styles.organizationMiniLogo, styles.organizationMiniLogoFallback, { backgroundColor: roles.iconPrimarySurface }]}>
                    <AppIcon name="organization" size="lg" color={roles.iconPrimaryColor} />
                  </View>
                )}
                <Text style={[styles.organizationMiniName, { color: roles.headingText }]} numberOfLines={2}>
                  {organizationName}
                </Text>
                <Text style={[styles.organizationMiniStatus, { color: roles.primaryActionBackground }]}>
                  {drive?.registration ? 'Verified' : drive?.membership ? 'Member' : 'Partner'}
                </Text>
              </View>
            );
          })}
          <Pressable
            onPress={onFindOrganizations}
            style={[styles.findMoreCard, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}
          >
            <View style={[styles.findMoreIcon, { backgroundColor: roles.defaultCardBackground }]}>
              <AppIcon name="plus" size="lg" color={roles.metaText} />
            </View>
            <Text style={[styles.findMoreText, { color: roles.bodyText }]}>Find More</Text>
          </Pressable>
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: roles.headingText }]}>
          {hasOngoingDonation ? 'Donation in progress' : 'Your Participated Events'}
        </Text>
        {!hasOngoingDonation && participatedEventCards.length ? (
          <View style={styles.participatedEventList}>
            {participatedEventCards.map((drive) => (
              <View
                key={`participated-${drive?.donation_drive_id || drive?.event_title}`}
                style={[styles.upcomingDonationCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}
              >
                <View style={[styles.upcomingDonationIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                  <MaterialCommunityIcons name="calendar-check-outline" size={24} color={roles.iconPrimaryColor} />
                </View>
                <View style={styles.upcomingDonationCopy}>
                  <Text style={[styles.upcomingDonationTitle, { color: roles.headingText }]} numberOfLines={2}>
                    {drive?.event_title || 'Donation drive'}
                  </Text>
                  <Text style={[styles.upcomingDonationBody, { color: roles.bodyText }]} numberOfLines={2}>
                    {getDriveDateLabel(drive)}
                  </Text>
                </View>
                <View style={styles.upcomingDonationActions}>
                  <AppButton
                    title="Submit my donation"
                    fullWidth={false}
                    size="sm"
                    style={styles.upcomingActionButton}
                    onPress={() => onSubmitDriveDonation?.(drive)}
                    disabled={isSubmittingDonation}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : !hasOngoingDonation ? (
          <View style={[styles.emptyDonationCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            <AppIcon name="donations" size="lg" color={roles.metaText} />
            <Text style={[styles.emptyDonationText, { color: roles.bodyText }]}>No participated events yet.</Text>
          </View>
        ) : null}

        {hasOngoingDonation ? (
          <View style={styles.activeDonationSummary}>
            <View style={styles.activeDonationSummaryHeader}>
              <View style={[styles.upcomingDonationIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                <MaterialCommunityIcons name="content-cut" size={24} color={roles.iconPrimaryColor} />
              </View>
              <View style={styles.upcomingDonationCopy}>
                <Text style={[styles.upcomingDonationTitle, { color: roles.headingText }]} numberOfLines={2}>
                  {upcomingTitle}
                </Text>
                <Text style={[styles.upcomingDonationBody, { color: roles.bodyText }]} numberOfLines={3}>
                  {upcomingBody}
                </Text>
              </View>
            </View>

            <View style={styles.activeDonationSummaryActions}>
              <AppButton
                title={isSubmittingDonation ? 'Opening preview...' : 'View Donation'}
                fullWidth
                size="sm"
                onPress={onSubmitDonation}
                loading={isSubmittingDonation}
                disabled={isSubmittingDonation}
              />
              <AppButton
                title="Add Another Hair"
                variant="outline"
                fullWidth
                size="sm"
                onPress={onAddHair}
                disabled={isSubmittingDonation}
              />
              <AppButton
                title="Cancel Submission"
                variant="danger"
                fullWidth
                size="sm"
                onPress={onCancelDonation}
                disabled={isSubmittingDonation}
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function JoinedDriveCard({ roles, drive }) {
  if (!drive?.registration) return null;

  const reg = drive.registration;
  const rsvpStatus = reg.attendance_status || reg.registration_status || 'Registered';
  const isApproved = ['approved', 'going', 'confirmed', 'accepted'].includes(
    String(rsvpStatus).toLowerCase()
  );

  return (
    <View style={[styles.card, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      <View style={styles.driveCardTop}>
        {drive.event_image_url || drive.organization_logo_url ? (
          <Image
            source={{ uri: drive.event_image_url || drive.organization_logo_url }}
            style={styles.driveLogo}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.driveLogo, styles.driveLogoFallback, { backgroundColor: roles.iconPrimarySurface }]}>
            <AppIcon name="organization" size="sm" color={roles.iconPrimaryColor} />
          </View>
        )}
        <View style={styles.driveMeta}>
          <Text style={[styles.driveTitle, { color: roles.headingText }]} numberOfLines={1}>
            {drive.event_title || 'Donation drive'}
          </Text>
          <Text style={[styles.driveOrg, { color: roles.bodyText }]} numberOfLines={1}>
            {drive.organization_name || 'Organization'}
          </Text>
          {drive.start_date ? (
            <Text style={[styles.driveMeta2, { color: roles.metaText }]}>
              {formatDateLabel(drive.start_date)}{drive.end_date ? ` â€“ ${formatDateLabel(drive.end_date)}` : ''}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.driveRsvpRow}>
        <Text style={[styles.driveRsvpLabel, { color: roles.metaText }]}>RSVP status</Text>
        <View style={[
          styles.rsvpBadge,
          { backgroundColor: isApproved ? roles.primaryActionBackground : roles.supportCardBackground },
        ]}>
          <Text style={[
            styles.rsvpBadgeText,
            { color: isApproved ? roles.primaryActionText : roles.bodyText },
          ]}>
            {rsvpStatus}
          </Text>
        </View>
      </View>
    </View>
  );
}

// â”€â”€â”€ Hair log card (AI path) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

void JoinedDriveCard;
void HairLogCard;

function HairLogCard({
  roles,
  screening,
  isEligible,
  screeningLabel,
  ineligibilityReason = '',
  onProceed,
  isLoading,
}) {
  const lengthCm = Number(screening?.estimated_length);
  const lengthIn = lengthCm > 0 ? (lengthCm / 2.54).toFixed(1) : null;
  const decisionText = buildDonationDecisionText({ screening, isEligible, ineligibilityReason });

  return (
    <View style={[styles.pathCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      <View style={styles.pathCardTop}>
        <View style={[styles.pathIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
          <AppIcon name="checkHair" color={roles.iconPrimaryColor} />
        </View>
        <View style={styles.pathCardCopy}>
          <Text style={[styles.pathCardTitle, { color: roles.headingText }]}>Use recent hair log</Text>
          <Text style={[styles.pathCardBody, { color: roles.bodyText }]}>
            Donate using your last hair analysis result; no extra input needed.
          </Text>
        </View>
        <View style={[
          styles.eligibilityBadge,
          { backgroundColor: isEligible ? roles.primaryActionBackground : roles.supportCardBackground },
        ]}>
          <Text style={[
            styles.eligibilityBadgeText,
            { color: isEligible ? roles.primaryActionText : roles.bodyText },
          ]}>
            {isEligible ? 'Eligible' : 'Not eligible'}
          </Text>
        </View>
      </View>

      <View style={styles.hairLogGrid}>
        <View style={[styles.hairLogTile, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.hairLogTileLabel, { color: roles.metaText }]}>Length</Text>
          <Text style={[styles.hairLogTileValue, { color: roles.headingText }]}>
            {lengthIn ? `${lengthIn} in` : 'â€”'}
          </Text>
        </View>
        <View style={[styles.hairLogTile, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.hairLogTileLabel, { color: roles.metaText }]}>Condition</Text>
          <Text style={[styles.hairLogTileValue, { color: roles.headingText }]}>
            {screening?.detected_condition || 'â€”'}
          </Text>
        </View>
        <View style={[styles.hairLogTile, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.hairLogTileLabel, { color: roles.metaText }]}>Decision</Text>
          <Text style={[styles.hairLogTileValue, { color: roles.headingText }]} numberOfLines={3}>
            {decisionText || 'â€”'}
          </Text>
        </View>
        <View style={[styles.hairLogTile, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.hairLogTileLabel, { color: roles.metaText }]}>Analyzed</Text>
          <Text style={[styles.hairLogTileValue, { color: roles.headingText }]}>
            {screeningLabel || 'â€”'}
          </Text>
        </View>
      </View>

      {isEligible ? (
        <AppButton
          title={isLoading ? 'Saving...' : 'Add hair to donate'}
          onPress={onProceed}
          loading={isLoading}
          fullWidth
        />
      ) : (
        <Text style={[styles.ineligibleNote, { color: roles.metaText }]}>
          {decisionText}
        </Text>
      )}
    </View>
  );
}

// â”€â”€â”€ Manual input path card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ManualInputCard({ roles, onOpen }) {
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.pathCard, styles.pathCardPressable, { opacity: pressed ? 0.84 : 1, borderColor: roles.defaultCardBorder }]}>
      <View style={styles.pathCardTop}>
        <View style={[styles.pathIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
          <AppIcon name="editProfile" color={roles.iconPrimaryColor} />
        </View>
        <View style={styles.pathCardCopy}>
          <Text style={[styles.pathCardTitle, { color: roles.headingText }]}>Enter hair details manually</Text>
          <Text style={[styles.pathCardBody, { color: roles.bodyText }]}>
            Input hair length and condition manually, then upload a clear photo.
          </Text>
        </View>
        <AppIcon name="chevronRight" size="sm" color={roles.metaText} />
      </View>
    </Pressable>
  );
}

// â”€â”€â”€ Manual entry modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ManualEntryModal({
  visible, form, errors, photo, feedback, isSaving, aiPrefilled,
  isEditing = false,
  onClose, onChangeField, onPickPhoto, onSave,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const isOtherPersonHair = form.donorType === 'different';

  return (
    <ModalShell
      visible={visible}
      title={isEditing ? 'Edit hair details' : 'Add hair to donate'}
      subtitle={isEditing
        ? 'Update the saved hair detail before generating the final QR.'
        : 'Add hair under this account. Use this for your own hair or hair from someone without an account.'}
      onClose={onClose}
      scrollContent
      footer={(
        <View style={styles.modalFooterActions}>
          <View style={styles.modalFooterActionHalf}>
            <AppButton title="Cancel" variant="outline" onPress={onClose} />
          </View>
          <View style={styles.modalFooterActionHalf}>
            <AppButton title={isSaving ? 'Saving...' : (isEditing ? 'Update hair' : 'Save hair')} onPress={onSave} loading={isSaving} />
          </View>
        </View>
      )}
    >
      {aiPrefilled ? (
        <StatusBanner
          message={isOtherPersonHair
            ? 'Recent AI screening is used only to pre-fill this donation form. It will not create a CheckHair log for this donor.'
            : 'Hair length pre-filled from your recent AI screening. Adjust if needed.'}
          variant="info"
          style={styles.bannerSpacing}
        />
      ) : null}
      {feedback?.message ? (
        <StatusBanner message={feedback.message} variant={feedback.variant} style={styles.bannerSpacing} />
      ) : null}

      <ManualSection
        icon="account-circle-outline"
        title="Hair owner"
        body="Choose whether this hair is yours or from another person using your account."
        roles={roles}
      >
        <ChoiceField
          label="Donor type"
          value={form.donorType}
          options={[
            { label: 'My hair', value: 'own' },
            { label: 'Other person', value: 'different' },
          ]}
          onChange={(v) => onChangeField('donorType', v)}
        />
        {errors.donorType ? <Text style={styles.inputError}>{errors.donorType}</Text> : null}
        {isOtherPersonHair ? (
          <View style={styles.donorIdentityFields}>
            <AppInput
              label="Donor full name"
              required
              value={form.donorName}
              onChangeText={(v) => onChangeField('donorName', v)}
              placeholder="Full name"
              error={errors.donorName}
              helperText="Use the name of the person who owns this hair."
            />
            <AppInput
              label="Donor birthday"
              required
              value={form.donorBirthdate}
              onChangeText={(v) => onChangeField('donorBirthdate', v.replace(/[^0-9-]/g, '').slice(0, 10))}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              error={errors.donorBirthdate}
              helperText="Used for donation identification and minor checking."
            />
          </View>
        ) : null}
      </ManualSection>

      <ManualSection
        icon="donations"
        title="Hair measurements"
        body="Enter your current hair length."
        roles={roles}
      >
        <AppInput
          label="Hair length"
          required
          value={form.lengthValue}
          onChangeText={(v) => onChangeField('lengthValue', v.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="14"
          error={errors.lengthValue}
          helperText="Minimum required is 14 inches"
        />
        <ChoiceField
          label="Unit"
          value={form.lengthUnit}
          options={LENGTH_UNIT_OPTIONS}
          onChange={(v) => onChangeField('lengthUnit', v)}
        />

      </ManualSection>

      <ManualSection
        icon="checkHair"
        title="Hair profile"
        body="Set treatment and visible hair attributes."
        roles={roles}
      >
        <View style={styles.manualChoiceGrid}>
          <ChoiceField label="Treated" value={form.treated} options={YES_NO_OPTIONS} onChange={(v) => onChangeField('treated', v)} />
          <ChoiceField label="Colored" value={form.colored} options={YES_NO_OPTIONS} onChange={(v) => onChangeField('colored', v)} />
          <ChoiceField label="Trimmed" value={form.trimmed} options={YES_NO_OPTIONS} onChange={(v) => onChangeField('trimmed', v)} />
        </View>

        <View style={styles.manualChoiceGrid}>
          <ChoiceField label="Hair color" value={form.hairColor} options={HAIR_COLOR_OPTIONS} onChange={(v) => onChangeField('hairColor', v)} />
          <ChoiceField label="Density" value={form.density} options={MANUAL_DENSITY_OPTIONS} onChange={(v) => onChangeField('density', v)} />
        </View>
      </ManualSection>

      <ManualSection
        icon="camera"
        title="Reference photo"
        body={isEditing
          ? 'Upload a new clear photo only if the existing reference needs to be changed.'
          : 'Upload one clear photo with your hair fully visible.'}
        roles={roles}
      >
        {photo?.uri ? (
          <Image source={{ uri: photo.uri }} style={styles.photoPreview} resizeMode="cover" />
        ) : (
          <View style={styles.photoPlaceholder}>
            <AppIcon name="camera" size="md" state="muted" />
            <Text style={styles.photoPlaceholderText}>No photo selected</Text>
          </View>
        )}
        <View style={styles.rowActions}>
          <AppButton title="Gallery" variant="outline" fullWidth={false} onPress={() => onPickPhoto('library')} />
          <AppButton title="Camera" fullWidth={false} onPress={() => onPickPhoto('camera')} />
        </View>
        {errors.photo ? <Text style={styles.inputError}>{errors.photo}</Text> : null}
      </ManualSection>
    </ModalShell>
  );
}

function AddBundleModal({
  visible,
  bundleForm,
  bundleErrors,
  bundlePhoto,
  bundleFeedback,
  isSaving,
  onClose,
  onChangeField,
  onPickPhoto,
  onOpenScanner,
  onAttachLatestScan,
  onSave,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const isDifferentDonor = bundleForm.donorType === 'different';
  const isManual = bundleForm.inputMethod === 'manual';

  return (
    <ModalShell
      visible={visible}
      title="Add another bundle"
      subtitle="Choose whose hair this bundle belongs to before adding it."
      onClose={onClose}
      scrollContent
      footer={(
        <View style={styles.modalFooterActions}>
          <View style={styles.modalFooterActionHalf}>
            <AppButton title="Cancel" variant="outline" onPress={onClose} disabled={isSaving} />
          </View>
          <View style={styles.modalFooterActionHalf}>
            <AppButton title={isSaving ? 'Savingâ€¦' : 'Save bundle'} onPress={onSave} loading={isSaving} disabled={isSaving} />
          </View>
        </View>
      )}
    >
      {bundleFeedback?.message ? (
        <StatusBanner message={bundleFeedback.message} variant={bundleFeedback.variant} style={styles.bannerSpacing} />
      ) : null}

      <ManualSection
        icon="account-circle-outline"
        title="Whose hair is this?"
        body="This decides how the bundle is validated and logged."
        roles={roles}
      >
        <ChoiceField
          label="Donor type"
          value={bundleForm.donorType}
          options={[
            { label: 'My hair', value: 'own' },
            { label: 'Different donor', value: 'different' },
          ]}
          onChange={(value) => onChangeField('donorType', value)}
        />
      </ManualSection>

      {isDifferentDonor ? (
        <ManualSection
          icon="radar"
          title="How will you add this bundle?"
          body="For different-donor hair, use scan or manual details."
          roles={roles}
        >
          <View style={styles.donorIdentityFields}>
            <AppInput
              label="Donor full name"
              required
              value={bundleForm.donorName}
              onChangeText={(v) => onChangeField('donorName', v)}
              placeholder="Full name"
              error={bundleErrors.donorName}
              helperText="This name will appear on the matching QR."
            />
            <AppInput
              label="Donor birthday"
              required
              value={bundleForm.donorBirthdate}
              onChangeText={(v) => onChangeField('donorBirthdate', v.replace(/[^0-9-]/g, '').slice(0, 10))}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              error={bundleErrors.donorBirthdate}
              helperText="Used for identification and minor checking."
            />
          </View>
          <ChoiceField
            label="Entry method"
            value={bundleForm.inputMethod}
            options={[
              { label: 'Scan donor hair', value: 'scan' },
              { label: 'Manual details', value: 'manual' },
            ]}
            onChange={(value) => onChangeField('inputMethod', value)}
          />

          {bundleForm.inputMethod === 'scan' ? (
            <View style={styles.bundleScanActions}>
              <AppButton title="Open CheckHair scanner" variant="outline" fullWidth={false} onPress={onOpenScanner} />
              <AppButton title="Attach latest scanned result" fullWidth={false} onPress={onAttachLatestScan} />
            </View>
          ) : null}
        </ManualSection>
      ) : (
        <ManualSection
          icon="checkHair"
          title="Use your latest hair log"
          body="Tap Save bundle to attach your latest saved scan result as an additional own-hair bundle."
          roles={roles}
        />
      )}

      {(isDifferentDonor && isManual) ? (
        <ManualSection
          icon="donations"
          title="Bundle details"
          body="Enter the details for this additional bundle."
          roles={roles}
        >
          <View style={styles.formRow}>
            <View style={styles.formRowFlex}>
              <AppInput
                label="Hair length"
                required
                value={bundleForm.lengthValue}
                onChangeText={(v) => onChangeField('lengthValue', v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="14"
                error={bundleErrors.lengthValue}
              />
            </View>
            <View style={styles.formRowUnit}>
              <ChoiceField
                label="Unit"
                value={bundleForm.lengthUnit}
                options={LENGTH_UNIT_OPTIONS}
                onChange={(value) => onChangeField('lengthUnit', value)}
              />
            </View>
          </View>
          <View style={styles.manualChoiceGrid}>
            <ChoiceField label="Treated" value={bundleForm.treated} options={YES_NO_OPTIONS} onChange={(value) => onChangeField('treated', value)} />
            <ChoiceField label="Colored" value={bundleForm.colored} options={YES_NO_OPTIONS} onChange={(value) => onChangeField('colored', value)} />
            <ChoiceField label="Trimmed" value={bundleForm.trimmed} options={YES_NO_OPTIONS} onChange={(value) => onChangeField('trimmed', value)} />
          </View>
          <View style={styles.manualChoiceGrid}>
            <ChoiceField label="Hair color" value={bundleForm.hairColor} options={HAIR_COLOR_OPTIONS} onChange={(value) => onChangeField('hairColor', value)} />
            <ChoiceField label="Density" value={bundleForm.density} options={MANUAL_DENSITY_OPTIONS} onChange={(value) => onChangeField('density', value)} />
          </View>
        </ManualSection>
      ) : null}

      {(isDifferentDonor && isManual) ? (
        <ManualSection
          icon="camera"
          title="Bundle photo"
          body="Upload one clear photo for this additional bundle."
          roles={roles}
        >
          {bundlePhoto?.uri ? (
            <Image source={{ uri: bundlePhoto.uri }} style={styles.photoPreview} resizeMode="cover" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <AppIcon name="camera" size="md" state="muted" />
              <Text style={styles.photoPlaceholderText}>No photo selected</Text>
            </View>
          )}
          <View style={styles.rowActions}>
            <AppButton title="Gallery" variant="outline" fullWidth={false} onPress={() => onPickPhoto('library')} />
            <AppButton title="Camera" fullWidth={false} onPress={() => onPickPhoto('camera')} />
          </View>
          {bundleErrors.photo ? <Text style={styles.inputError}>{bundleErrors.photo}</Text> : null}
        </ManualSection>
      ) : null}
    </ModalShell>
  );
}

function CertificateCard({ roles, certificate, donorName }) {
  if (!certificate) return null;
  const certNum = certificate.certificate_number || '';
  const issuedAt = certificate.issued_at ? new Date(certificate.issued_at).toLocaleDateString() : '';

  return (
    <View style={[styles.card, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
      <View style={[styles.certBadge, { backgroundColor: roles.primaryActionBackground }]}>
        <Text style={[styles.certBadgeText, { color: roles.primaryActionText }]}>Certificate of Donation</Text>
      </View>
      <Text style={[styles.certTitle, { color: roles.headingText }]}>
        Thank you{donorName ? `, ${donorName}` : ''}!
      </Text>
      <Text style={[styles.certBody, { color: roles.bodyText }]}>
        Your hair donation has been received and processed. A certificate has been issued for your contribution.
      </Text>
      {certNum ? (
        <View style={styles.certMeta}>
          <View style={[styles.certMetaRow, { borderTopColor: roles.defaultCardBorder }]}>
            <Text style={[styles.certMetaLabel, { color: roles.metaText }]}>Certificate no.</Text>
            <Text style={[styles.certMetaValue, { color: roles.headingText }]}>{certNum}</Text>
          </View>
          {issuedAt ? (
            <View style={[styles.certMetaRow, { borderTopColor: roles.defaultCardBorder }]}>
              <Text style={[styles.certMetaLabel, { color: roles.metaText }]}>Issued</Text>
              <Text style={[styles.certMetaValue, { color: roles.headingText }]}>{issuedAt}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// â”€â”€â”€ Donation history row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BundlePreviewPanel({
  roles,
  bundles = [],
  onPrintQr,
  printingQrKey = '',
  onSaveQr,
  savingQrKey = '',
}) {
  if (!bundles.length) return null;

  return (
    <View style={styles.bundlePreviewPanel}>
      <Text style={[styles.bundlePreviewTitle, { color: roles.headingText }]}>Hair preview before QR</Text>
      <Text style={[styles.bundlePreviewBody, { color: roles.metaText }]}>
        Review each hair separately. Each hair gets its own QR. Print each QR and paste it on the matching hair plastic before submitting at the donation site.
      </Text>
      <View style={[styles.bundlePreviewList, { borderColor: roles.defaultCardBorder }]}>
        {bundles.map((bundle, index) => (
          <View
            key={bundle.key}
            style={[
              styles.bundlePreviewRow,
              index > 0 ? { borderTopWidth: 1, borderTopColor: roles.defaultCardBorder } : null,
            ]}
          >
            <View style={styles.bundlePreviewRowTop}>
              <Text style={[styles.bundlePreviewRowTitle, { color: roles.headingText }]}>
                Hair {bundle.bundleNumber || index + 1}
              </Text>
              <View style={[styles.bundlePreviewSourceChip, { backgroundColor: roles.iconPrimarySurface }]}>
                <Text style={[styles.bundlePreviewSourceText, { color: roles.iconPrimaryColor }]}>{bundle.sourceLabel}</Text>
              </View>
            </View>
            <View style={styles.bundlePreviewMetaGrid}>
              {bundle.donorName ? (
                <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Donor: {bundle.donorName}</Text>
              ) : null}
              {bundle.donorBirthdate ? (
                <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Birthday: {bundle.donorBirthdate}</Text>
              ) : null}
              <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Length: {bundle.lengthLabel}</Text>
              <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Condition: {bundle.condition || '-'}</Text>
              <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Color: {bundle.color || '-'}</Text>
              <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Density: {bundle.density || '-'}</Text>
            </View>
            {bundle.qrPayload ? (
              <View style={[styles.previewQrCard, styles.bundlePreviewQrCard, { borderColor: roles.defaultCardBorder, backgroundColor: roles.supportCardBackground }]}>
                <Text style={[styles.previewQrTitle, { color: roles.headingText }]}>
                  Hair {bundle.bundleNumber || index + 1} QR
                </Text>
                <Text style={[styles.previewQrPayload, { color: roles.bodyText }]}>
                  Print this QR and paste it on this hair plastic for identification. Do not reuse it for another hair bundle.
                </Text>
                <Image
                  source={{ uri: buildQrImageUrl(bundle.qrPayload, 220) }}
                  style={styles.previewQrImage}
                  resizeMode="contain"
                />
                <View style={styles.previewQrActionRow}>
                  <AppButton
                    title={printingQrKey === bundle.key ? 'Printing...' : 'Print QR'}
                    variant="outline"
                    size="sm"
                    fullWidth={false}
                    onPress={() => onPrintQr?.(bundle)}
                    loading={printingQrKey === bundle.key}
                    disabled={printingQrKey === bundle.key || savingQrKey === bundle.key}
                    style={styles.previewQrActionButton}
                  />
                  <AppButton
                    title={savingQrKey === bundle.key ? 'Saving...' : 'Save QR'}
                    size="sm"
                    fullWidth={false}
                    onPress={() => onSaveQr?.(bundle)}
                    loading={savingQrKey === bundle.key}
                    disabled={savingQrKey === bundle.key || printingQrKey === bundle.key}
                    style={styles.previewQrActionButton}
                  />
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

// â”€â”€â”€ Main screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DonationStepHeader({ roles, title, body, onBack }) {
  return (
    <View style={styles.donationStepHeader}>
      {onBack ? (
        <Pressable onPress={onBack} style={[styles.stepBackButton, { backgroundColor: roles.supportCardBackground }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={roles.iconPrimaryColor} />
        </Pressable>
      ) : null}
      <View style={styles.donationStepHeaderCopy}>
        <Text style={[styles.donationStepTitle, { color: roles.headingText }]}>{title}</Text>
        {body ? <Text style={[styles.donationStepBody, { color: roles.bodyText }]}>{body}</Text> : null}
      </View>
    </View>
  );
}

function DonationJoinedEventsScreen({ roles, joinedDrives = [], onOpenDetails, onFindOrganizations }) {
  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader
        roles={roles}
        title="Your Participated Events"
        body="Choose an event you already joined, then submit hair donation details for that drive."
      />
      {joinedDrives.length ? (
        <View style={styles.flowCardList}>
          {joinedDrives.map((drive) => (
            <View
              key={`joined-flow-${drive?.donation_drive_id || drive?.event_title}`}
              style={[styles.flowEventCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}
            >
              <View style={[styles.flowIconCircle, { backgroundColor: roles.iconPrimarySurface }]}>
                <MaterialCommunityIcons name="calendar-check-outline" size={24} color={roles.iconPrimaryColor} />
              </View>
              <View style={styles.flowEventCopy}>
                <Text style={[styles.flowHost, { color: roles.bodyText }]} numberOfLines={1}>
                  Hosted by {getDriveOrganizationLabel(drive)}
                </Text>
                <Text style={[styles.flowEventTitle, { color: roles.headingText }]} numberOfLines={2}>
                  {drive?.event_title || 'Donation drive'}
                </Text>
                <Text style={[styles.flowMetaText, { color: roles.bodyText }]} numberOfLines={2}>
                  {getDriveDateLabel(drive)}
                </Text>
                <Text style={[styles.flowMetaText, { color: roles.bodyText }]} numberOfLines={2}>
                  {[drive?.city, drive?.province, drive?.country].filter(Boolean).join(', ') || 'Location to be announced'}
                </Text>
              </View>
              <AppButton
                title="Submit hair donation"
                size="sm"
                fullWidth={false}
                onPress={() => onOpenDetails?.(drive)}
                style={styles.flowEventButton}
              />
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.emptyDonationCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <AppIcon name="donations" size="lg" color={roles.metaText} />
          <Text style={[styles.emptyDonationText, { color: roles.bodyText }]}>No participated donation events yet.</Text>
          <AppButton title="Find donation drives" variant="outline" fullWidth={false} onPress={onFindOrganizations} />
        </View>
      )}
    </View>
  );
}

function DonationEventDetailsScreen({ roles, drive, onBack, onSubmit }) {
  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader
        roles={roles}
        title="Donation Event Details"
        body="Review the event before adding the hair details."
        onBack={onBack}
      />
      <View style={[styles.eventDetailsHero, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <View style={[styles.eventDetailsIcon, { backgroundColor: roles.iconPrimarySurface }]}>
          <MaterialCommunityIcons name="domain" size={28} color={roles.iconPrimaryColor} />
        </View>
        <Text style={[styles.eventDetailsHost, { color: roles.bodyText }]}>Hosted by {getDriveOrganizationLabel(drive)}</Text>
        <Text style={[styles.eventDetailsTitle, { color: roles.headingText }]}>{drive?.event_title || 'Donation drive'}</Text>
        <View style={styles.eventDetailsMetaList}>
          <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Date: {getDriveDateLabel(drive)}</Text>
          <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>
            Location: {[drive?.street, drive?.barangay, drive?.city, drive?.province, drive?.country].filter(Boolean).join(', ') || 'To be announced'}
          </Text>
          {drive?.event_overview ? <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{drive.event_overview}</Text> : null}
        </View>
        <AppButton title="Submit my hair donation" onPress={onSubmit} />
      </View>
    </View>
  );
}

function DonationHairSummaryScreen({
  roles,
  drive,
  latestScreening,
  isEligible,
  ineligibilityReason,
  hairItems = [],
  isSubmitting,
  onBack,
  onAddAnotherHair,
  onReferDonation,
  onSubmitDonation,
}) {
  const screeningText = buildDonationDecisionText({
    screening: latestScreening,
    isEligible,
    ineligibilityReason,
  }) || 'No screening result found yet.';

  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader
        roles={roles}
        title="Donation Summary"
        body="Review your hair donation details before choosing a recipient or generating QR codes."
        onBack={onBack}
      />
      <View style={[styles.summaryCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>Event</Text>
        <Text style={[styles.summaryMainText, { color: roles.headingText }]}>{drive?.event_title || 'Selected donation drive'}</Text>
        <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{getDriveDateLabel(drive)}</Text>
        <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Recipient default: {getDriveOrganizationLabel(drive)}</Text>
      </View>
      <View style={[styles.summaryCard, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
        <View style={styles.summaryHeaderRow}>
          <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>Initial screening</Text>
          <View style={[styles.summaryStatusChip, { backgroundColor: isEligible ? roles.iconPrimarySurface : roles.supportCardBackground }]}>
            <Text style={[styles.summaryStatusText, { color: isEligible ? roles.iconPrimaryColor : theme.colors.textError }]}>
              {isEligible ? 'Eligible' : 'Review needed'}
            </Text>
          </View>
        </View>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Length</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]}>{formatScreeningLengthInches(latestScreening)}</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Condition</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]}>{latestScreening?.detected_condition || 'N/A'}</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Color</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]}>{latestScreening?.detected_color || 'N/A'}</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Analyzed</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]}>{formatDateLabel(latestScreening?.created_at)}</Text>
          </View>
        </View>
        <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{screeningText}</Text>
      </View>
      <View style={styles.flowCardList}>
        <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>Hair to donate</Text>
        {hairItems.length ? hairItems.map((item, index) => (
          <View key={`summary-hair-${item.key || index}`} style={[styles.summaryHairRow, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            <View style={styles.summaryHeaderRow}>
              <Text style={[styles.summaryMainText, { color: roles.headingText }]}>Hair {index + 1}</Text>
              <View style={[styles.bundlePreviewSourceChip, { backgroundColor: roles.iconPrimarySurface }]}>
                <Text style={[styles.bundlePreviewSourceText, { color: roles.iconPrimaryColor }]}>{item.sourceLabel}</Text>
              </View>
            </View>
            {item.donorName ? <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Donor: {item.donorName}</Text> : null}
            <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Length: {item.lengthLabel}</Text>
            <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Condition: {item.condition || '-'}</Text>
            <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Color: {item.color || '-'}  Density: {item.density || '-'}</Text>
          </View>
        )) : (
          <View style={[styles.emptyDonationCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            <Text style={[styles.emptyDonationText, { color: roles.bodyText }]}>No saved hair details yet. Add hair details first.</Text>
          </View>
        )}
      </View>
      <View style={styles.summaryActions}>
        <AppButton title="Add another hair" variant="outline" onPress={onAddAnotherHair} />
        <AppButton title="Refer your donation" variant="secondary" onPress={onReferDonation} />
        <AppButton
          title={isSubmitting ? 'Submitting...' : 'Submit your donation'}
          onPress={onSubmitDonation}
          loading={isSubmitting}
          disabled={isSubmitting || !hairItems.length}
        />
      </View>
    </View>
  );
}

function AddAnotherHairSourceScreen({ roles, onBack, onUseHairLog, onOtherPerson }) {
  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader roles={roles} title="Add Another Hair" body="Select the source of the next hair donation." onBack={onBack} />
      <View style={styles.flowCardList}>
        <Pressable onPress={onUseHairLog} style={[styles.inputMethodCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <View style={[styles.flowIconCircle, { backgroundColor: roles.iconPrimarySurface }]}>
            <MaterialCommunityIcons name="account-outline" size={24} color={roles.iconPrimaryColor} />
          </View>
          <View style={styles.inputMethodCopy}>
            <Text style={[styles.inputMethodTitle, { color: roles.headingText }]}>My Hair Log</Text>
            <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Use your latest saved hair analysis details.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={roles.metaText} />
        </Pressable>
        <Pressable onPress={onOtherPerson} style={[styles.inputMethodCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <View style={[styles.flowIconCircle, { backgroundColor: roles.iconPrimarySurface }]}>
            <MaterialCommunityIcons name="account-group-outline" size={24} color={roles.iconPrimaryColor} />
          </View>
          <View style={styles.inputMethodCopy}>
            <Text style={[styles.inputMethodTitle, { color: roles.headingText }]}>Other Person</Text>
            <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Add hair from someone without an account.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={roles.metaText} />
        </Pressable>
      </View>
    </View>
  );
}

function InputMethodSelectionScreen({ roles, onBack, onUseScanner, onManualInput }) {
  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader roles={roles} title="Add Hair Details" body="How would you like to add this other person's hair details?" onBack={onBack} />
      <View style={styles.flowCardList}>
        <Pressable onPress={onUseScanner} style={[styles.inputMethodCard, styles.inputMethodRecommended, { backgroundColor: roles.defaultCardBackground, borderColor: roles.primaryActionBackground }]}>
          <View style={[styles.recommendedBadge, { backgroundColor: roles.primaryActionBackground }]}>
            <Text style={[styles.recommendedBadgeText, { color: roles.primaryActionText }]}>Recommended</Text>
          </View>
          <View style={[styles.flowIconCircle, { backgroundColor: roles.iconPrimarySurface }]}>
            <MaterialCommunityIcons name="camera-outline" size={24} color={roles.iconPrimaryColor} />
          </View>
          <View style={styles.inputMethodCopy}>
            <Text style={[styles.inputMethodTitle, { color: roles.headingText }]}>Use AI Hair Scanner</Text>
            <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Use a scan result to prefill this donation only.</Text>
          </View>
        </Pressable>
        <Pressable onPress={onManualInput} style={[styles.inputMethodCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <View style={[styles.flowIconCircle, { backgroundColor: roles.supportCardBackground }]}>
            <MaterialCommunityIcons name="pencil-outline" size={24} color={roles.iconPrimaryColor} />
          </View>
          <View style={styles.inputMethodCopy}>
            <Text style={[styles.inputMethodTitle, { color: roles.headingText }]}>Manual Input</Text>
            <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Enter the donor identity and hair details manually.</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function RecipientChoiceScreen({ roles, drive, patients = [], selectedRecipient, onBack, onSelectDefault, onSelectPatient, onConfirm }) {
  const [patientSearch, setPatientSearch] = React.useState('');
  const normalizedSearch = patientSearch.trim().toLowerCase();
  const visiblePatients = React.useMemo(() => {
    if (!normalizedSearch) return patients;
    return patients.filter((patient) => (
      [
        patient.patient_name,
        patient.medical_condition,
        patient.patient_code,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch))
    ));
  }, [normalizedSearch, patients]);

  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader
        roles={roles}
        title="Donation Recipient"
        body="Choose where your hair should go. If no patient is selected, the donation goes to the event organization."
        onBack={onBack}
      />
      <Pressable
        onPress={onSelectDefault}
        style={[styles.recipientDefaultCard, {
          backgroundColor: roles.defaultCardBackground,
          borderColor: selectedRecipient?.type === 'organization' ? roles.primaryActionBackground : roles.defaultCardBorder,
        }]}
      >
        <View style={[styles.recommendedBadge, { backgroundColor: roles.primaryActionBackground }]}>
          <Text style={[styles.recommendedBadgeText, { color: roles.primaryActionText }]}>Default</Text>
        </View>
        <View style={[styles.flowIconCircle, { backgroundColor: roles.iconPrimarySurface }]}>
          <MaterialCommunityIcons name="domain" size={24} color={roles.iconPrimaryColor} />
        </View>
        <View style={styles.inputMethodCopy}>
          <Text style={[styles.inputMethodTitle, { color: roles.headingText }]}>Donate to Organization</Text>
          <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{getDriveOrganizationLabel(drive)}</Text>
        </View>
      </Pressable>
      <View style={[styles.summaryCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>Refer to a Patient</Text>
        <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>Select a patient, or continue without referral.</Text>
        <AppInput
          label="Search patient"
          value={patientSearch}
          onChangeText={setPatientSearch}
          placeholder="Search by patient name or condition"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.patientScroll}>
          {visiblePatients.length ? visiblePatients.map((patient) => {
            const isSelected = selectedRecipient?.patient?.patient_id === patient.patient_id;
            return (
              <Pressable
                key={`patient-${patient.patient_id}`}
                onPress={() => onSelectPatient?.(patient)}
                style={[styles.patientChoiceCard, {
                  backgroundColor: roles.supportCardBackground,
                  borderColor: isSelected ? roles.primaryActionBackground : roles.defaultCardBorder,
                }]}
              >
                <View style={[styles.patientAvatar, { backgroundColor: roles.iconPrimarySurface }]}>
                  <MaterialCommunityIcons name="account-heart-outline" size={24} color={roles.iconPrimaryColor} />
                </View>
                <Text style={[styles.patientName, { color: roles.headingText }]} numberOfLines={2}>
                  {patient.patient_name || `Patient ${patient.patient_id}`}
                </Text>
                <Text style={[styles.flowMetaText, { color: roles.bodyText }]} numberOfLines={2}>
                  {patient.medical_condition || 'Wig request patient'}
                </Text>
                <Text style={[styles.patientSelectText, { color: roles.primaryActionBackground }]}>
                  {isSelected ? 'Selected' : 'Select'}
                </Text>
              </Pressable>
            );
          }) : (
            <View style={[styles.patientChoiceCard, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
              <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>
                {patients.length ? 'No patient matched your search.' : 'No patient referral list is available right now.'}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
      <AppButton title="Confirm and generate QR codes" onPress={onConfirm} />
    </View>
  );
}

function DonationQrCodesScreen({ roles, bundles = [], feedback, printingQrKey, savingQrKey, onBack, onPrintQr, onSaveQr, onDone }) {
  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader
        roles={roles}
        title="Your Hair QR Codes"
        body="Print or save each QR, then attach it to the matching hair container before passing it to the donation site."
        onBack={onBack}
      />
      <View style={[styles.successBanner, { backgroundColor: roles.iconPrimarySurface, borderColor: roles.primaryActionBackground }]}>
        <MaterialCommunityIcons name="check-circle-outline" size={22} color={roles.iconPrimaryColor} />
        <Text style={[styles.successBannerText, { color: roles.iconPrimaryColor }]}>Donation submitted successfully.</Text>
      </View>
      <View style={[styles.summaryCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>How to use your QR codes</Text>
        <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>1. Print each QR or save it to your phone.</Text>
        <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>2. Paste the QR on the matching hair container or plastic.</Text>
        <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>3. Bring the hair and QR to the donation site for staff scanning.</Text>
      </View>
      {feedback?.message ? <StatusBanner message={feedback.message} variant={feedback.variant} /> : null}
      <BundlePreviewPanel
        roles={roles}
        bundles={bundles}
        onPrintQr={onPrintQr}
        printingQrKey={printingQrKey}
        onSaveQr={onSaveQr}
        savingQrKey={savingQrKey}
      />
      <AppButton title="Done" onPress={onDone} />
    </View>
  );
}

function MyJoinedDonationsScreen({
  roles,
  donationItems = [],
  activeFilter,
  onChangeFilter,
  onBack,
  onViewDonation,
  onSubmitDriveDonation,
  onCancelDonation,
  hasOngoingDonation = false,
}) {
  const filteredItems = React.useMemo(() => (
    donationItems.filter((item) => {
      if (hasOngoingDonation && !item.submission) return false;
      if (activeFilter === 'all') return true;
      if (activeFilter === 'active') return ['active', 'submitted'].includes(item.statusCategory);
      return item.statusCategory === activeFilter;
    })
  ), [activeFilter, donationItems, hasOngoingDonation]);

  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader
        roles={roles}
        title={hasOngoingDonation ? 'Donation in progress' : 'My Donations'}
        body={hasOngoingDonation
          ? 'Continue tracking your submitted hair donation. Finish or cancel this donation before starting another event donation.'
          : 'Track donation drives you joined and view submitted hair donation logistics.'}
        onBack={onBack}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.myDonationFilters}>
        {MY_DONATION_FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              onPress={() => onChangeFilter?.(filter.key)}
              style={[
                styles.myDonationFilterChip,
                {
                  backgroundColor: isActive ? roles.primaryActionBackground : roles.supportCardBackground,
                  borderColor: isActive ? roles.primaryActionBackground : roles.defaultCardBorder,
                },
              ]}
            >
              <Text style={[styles.myDonationFilterText, { color: isActive ? roles.primaryActionText : roles.bodyText }]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filteredItems.length ? (
        <View style={styles.flowCardList}>
          {filteredItems.map((item) => (
            <View
              key={item.key}
              style={[styles.myDonationCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}
            >
              <View style={styles.myDonationCardTop}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.myDonationImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.myDonationImage, styles.myDonationImageFallback, { backgroundColor: roles.iconPrimarySurface }]}>
                    <MaterialCommunityIcons name={item.statusIcon || 'calendar-check-outline'} size={28} color={roles.iconPrimaryColor} />
                  </View>
                )}
                <View style={styles.myDonationCardCopy}>
                  <View style={styles.myDonationTitleRow}>
                    <Text style={[styles.myDonationTitle, { color: roles.headingText }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View style={[styles.myDonationStatusBadge, { backgroundColor: item.statusCategory === 'submitted' ? roles.iconPrimarySurface : roles.supportCardBackground }]}>
                      <Text style={[styles.myDonationStatusText, { color: item.statusCategory === 'submitted' ? roles.iconPrimaryColor : roles.bodyText }]} numberOfLines={1}>
                        {item.statusLabel}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.flowMetaText, { color: roles.bodyText }]} numberOfLines={1}>
                    {item.organizationName}
                  </Text>
                </View>
              </View>

              <View style={[styles.myDonationInfoBox, { backgroundColor: roles.supportCardBackground }]}>
                <View style={styles.myDonationInfoRow}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={18} color={roles.iconPrimaryColor} />
                  <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{item.dateLabel}</Text>
                </View>
                <View style={styles.myDonationInfoRow}>
                  <MaterialCommunityIcons name={item.submission ? 'content-cut' : 'map-marker-outline'} size={18} color={roles.iconPrimaryColor} />
                  <Text style={[styles.flowMetaText, { color: roles.bodyText }]} numberOfLines={2}>
                    {item.submission ? `${item.hairCount || 1} hair donation${item.hairCount === 1 ? '' : 's'}` : item.locationLabel}
                  </Text>
                </View>
              </View>

              <View style={styles.myDonationCardActions}>
                <AppButton
                  title={item.submission ? 'View My Donation' : 'Submit hair donation'}
                  onPress={() => (item.submission ? onViewDonation?.(item) : onSubmitDriveDonation?.(item.drive))}
                />
                {item.submission && !isClosedDonationStatus(item.submission?.status) ? (
                  <AppButton
                    title="Cancel My Donation"
                    variant="danger"
                    onPress={onCancelDonation}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.emptyDonationCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <AppIcon name="donations" size="lg" color={roles.metaText} />
          <Text style={[styles.emptyDonationText, { color: roles.bodyText }]}>No donations match this filter.</Text>
        </View>
      )}
    </View>
  );
}

function DonationTimelineStatusScreen({
  roles,
  item,
  previewItems = [],
  timelineStages = [],
  timelineEvents = [],
  certificate,
  accountDonorName,
  onBack,
  onCancelDonation,
}) {
  const primaryPreview = previewItems[0] || item?.previewItems?.[0] || null;
  const submittedAt = item?.submission?.created_at || item?.submission?.updated_at || '';
  const recipientLabel = item?.recipientName || item?.organizationName || 'Donation drive';
  const stages = timelineStages.length ? timelineStages : [
    {
      key: 'ready_for_shipment',
      label: 'Donation Submitted',
      state: item?.submission ? 'current' : 'upcoming',
      evidenceAt: submittedAt,
      statusLabel: item?.statusLabel || '',
      savedNote: 'Your hair donation was submitted and is ready for staff scanning.',
    },
    { key: 'quality_checking', label: 'Quality Verification', state: 'upcoming' },
    { key: 'ready_for_shipment_to_receiver', label: 'Wig Manufacturing', state: 'upcoming' },
    { key: 'received_by_patient', label: 'Recipient Delivery', state: 'upcoming' },
    { key: 'certificate', label: 'Impact Certificate', state: certificate ? 'completed' : 'upcoming', evidenceAt: certificate?.issued_at || '' },
  ];

  return (
    <View style={styles.flowScreen}>
      <DonationStepHeader
        roles={roles}
        title="Donation Status"
        body="View the logistics timeline for this hair donation."
        onBack={onBack}
      />

      <View style={[styles.timelineHero, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <View style={styles.timelineHeroTop}>
          <View style={styles.timelineHeroCopy}>
            <Text style={[styles.timelineHeroTitle, { color: roles.headingText }]} numberOfLines={2}>
              Hair #1 - {primaryPreview?.donorName || accountDonorName || 'Donor'}
            </Text>
            <View style={[styles.timelineHeroChip, { backgroundColor: roles.iconPrimarySurface }]}>
              <Text style={[styles.timelineHeroChipText, { color: roles.iconPrimaryColor }]}>
                {item?.statusLabel || 'Processing'}
              </Text>
            </View>
          </View>
          <View style={[styles.flowIconCircle, { backgroundColor: roles.iconPrimarySurface }]}>
            <MaterialCommunityIcons name="content-cut" size={24} color={roles.iconPrimaryColor} />
          </View>
        </View>
        <View style={[styles.timelineMetricGrid, { borderTopColor: roles.defaultCardBorder }]}>
          <View style={styles.timelineMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Length</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]}>{primaryPreview?.lengthLabel || 'Not recorded'}</Text>
          </View>
          <View style={styles.timelineMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Date Submitted</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]}>{submittedAt ? formatDateLabel(submittedAt) : 'Not submitted'}</Text>
          </View>
          <View style={styles.timelineMetric}>
            <Text style={[styles.summaryMetricLabel, { color: roles.metaText }]}>Recipient</Text>
            <Text style={[styles.summaryMetricValue, { color: roles.headingText }]} numberOfLines={2}>{recipientLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.timelineSection}>
        <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>Journey Timeline</Text>
        <View style={styles.timelineStageList}>
          {stages.map((stage, index) => {
            const isCompleted = stage.state === 'completed';
            const isCurrent = stage.state === 'current';
            return (
              <View key={stage.key || `${stage.label}-${index}`} style={styles.timelineStageRow}>
                <View style={styles.timelineMarkerColumn}>
                  <View style={[
                    styles.timelineMarker,
                    {
                      backgroundColor: isCompleted ? roles.primaryActionBackground : roles.defaultCardBackground,
                      borderColor: isCompleted || isCurrent ? roles.primaryActionBackground : roles.defaultCardBorder,
                    },
                  ]}>
                    {isCompleted ? (
                      <MaterialCommunityIcons name="check" size={14} color={roles.primaryActionText} />
                    ) : isCurrent ? (
                      <View style={[styles.timelineCurrentDot, { backgroundColor: roles.primaryActionBackground }]} />
                    ) : (
                      <MaterialCommunityIcons name="clock-outline" size={13} color={roles.metaText} />
                    )}
                  </View>
                  {index < stages.length - 1 ? (
                    <View style={[styles.timelineStageConnector, { backgroundColor: isCompleted ? roles.primaryActionBackground : roles.defaultCardBorder }]} />
                  ) : null}
                </View>
                <View style={[
                  styles.timelineStageCard,
                  {
                    backgroundColor: isCurrent ? roles.iconPrimarySurface : roles.defaultCardBackground,
                    borderColor: isCurrent ? roles.primaryActionBackground : roles.defaultCardBorder,
                  },
                ]}>
                  <View style={styles.timelineStageHeader}>
                    <Text style={[styles.timelineStageTitle, { color: isCurrent ? roles.iconPrimaryColor : roles.headingText }]}>
                      {stage.label || stage.title || 'Donation update'}
                    </Text>
                    <Text style={[styles.timelineStageDate, { color: roles.metaText }]}>
                      {stage.evidenceAt ? formatDateTimeLabel(stage.evidenceAt) : (stage.progressLabel || 'Waiting')}
                    </Text>
                  </View>
                  <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{getTimelineStageDescription(stage)}</Text>
                  {stage.statusLabel ? (
                    <Text style={[styles.timelineStageBadgeText, { color: roles.iconPrimaryColor }]}>{stage.statusLabel}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {timelineEvents.length ? (
        <View style={[styles.summaryCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <Text style={[styles.summarySectionTitle, { color: roles.headingText }]}>Recent updates</Text>
          {timelineEvents.slice(0, 4).map((event) => (
            <View key={event.key} style={styles.timelineEventRow}>
              <Text style={[styles.summaryMainText, { color: roles.headingText }]}>{event.title}</Text>
              <Text style={[styles.flowMetaText, { color: roles.bodyText }]}>{event.description}</Text>
              {event.timestamp ? <Text style={[styles.flowMetaText, { color: roles.metaText }]}>{event.timestamp}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {item?.submission && !isClosedDonationStatus(item.submission?.status) ? (
        <AppButton title="Cancel My Donation" variant="danger" onPress={onCancelDonation} />
      ) : null}
    </View>
  );
}

function getNoteValue(notes = '', label = '') {
  const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(notes || '').match(new RegExp(`${escapedLabel}:\\s*([^|.]+)`, 'i'));
  return match?.[1]?.trim() || '';
}

function getPreviewConditionLabel(condition = '') {
  const text = String(condition || '').trim();
  const lower = text.toLowerCase();
  if (!text) return 'Pending review';
  if (lower.includes('different donor') || lower.includes('other person')) return 'Other person hair';
  if (lower.includes('qualified for donor donation flow')) return 'Ready for donation';
  if (lower.includes('own hair')) return 'Own hair';
  return text;
}

function getLatestPreviewDetail(submission = null) {
  const submissionDetails = Array.isArray(submission?.submission_details)
    ? submission.submission_details
    : [];
  return submissionDetails.length
    ? [...submissionDetails].sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))[0]
    : null;
}

function buildHairSubmissionPreviewItems(submission = null, fallbackDetail = null, qrPayload = '', accountDonorName = '') {
  const submissionDetails = Array.isArray(submission?.submission_details)
    ? submission.submission_details
    : [];
  const latestSubmissionDetail = submissionDetails.length
    ? [...submissionDetails].sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))[0]
    : null;
  const details = fallbackDetail ? [fallbackDetail] : (latestSubmissionDetail ? [latestSubmissionDetail] : []);

  return details.map((detail, index) => {
    const rawLength = Number(detail?.declared_length);
    const lengthLabel = Number.isFinite(rawLength) && rawLength > 0
      ? `${rawLength.toFixed(1)} ${rawLength > 40 ? 'cm' : 'in'}`
      : 'Not recorded';
    const notes = [detail?.detail_notes, submission?.donor_notes].filter(Boolean).join(' ');
    const condition = getPreviewConditionLabel(detail?.declared_condition);
    const markerText = `${notes} ${condition}`.toLowerCase();
    const isOtherPersonHair = markerText.includes('different donor') || markerText.includes('other person');

    return {
      key: String(detail?.submission_detail_id || `${submission?.submission_id || 'hair'}-${index}`),
      bundleNumber: index + 1,
      sourceLabel: isOtherPersonHair ? 'Other person' : 'My hair',
      donorName: isOtherPersonHair ? getNoteValue(notes, 'Donor name') : accountDonorName,
      donorBirthdate: isOtherPersonHair ? getNoteValue(notes, 'Donor birthdate') : '',
      lengthLabel,
      condition,
      color: detail?.declared_color || '-',
      density: detail?.declared_density || '-',
      qrPayload,
    };
  });
}

function DonationSubmitPreviewModal({
  visible,
  roles,
  submission,
  detail,
  qrPayload,
  qrItems = [],
  accountDonorName = '',
  isSubmitting,
  isSubmitted = false,
  onClose,
  onEditDetails,
  onConfirm,
}) {
  const [printingQrKey, setPrintingQrKey] = React.useState('');
  const [savingQrKey, setSavingQrKey] = React.useState('');
  const [printFeedback, setPrintFeedback] = React.useState({ message: '', variant: 'info' });
  const previewItems = React.useMemo(() => {
    if (qrItems.length) {
      return qrItems.flatMap((item, index) => (
        buildHairSubmissionPreviewItems(item.submission, item.detail, item.qrPayload, accountDonorName)
          .map((previewItem) => ({
            ...previewItem,
            bundleNumber: index + 1,
            key: `${previewItem.key}-${item.qrPayload || index}`,
          }))
      ));
    }
    return buildHairSubmissionPreviewItems(submission, detail, qrPayload, accountDonorName);
  }, [accountDonorName, detail, qrItems, qrPayload, submission]);

  const handlePrintQr = React.useCallback(async (bundle) => {
    if (!bundle?.qrPayload) return;

    setPrintingQrKey(bundle.key);
    setPrintFeedback({ message: '', variant: 'info' });

    try {
      await printDonationQrPdf({
        title: `Hair ${bundle.bundleNumber || ''} QR`,
        subtitle: 'Paste this QR on the matching hair plastic before submitting at the donation site.',
        helperText: 'This QR is for identification. Do not reuse it for another hair bundle.',
        qrPayloadText: bundle.qrPayload,
        details: [
          { label: 'Hair', value: `Hair ${bundle.bundleNumber || ''}` },
          { label: 'Donor type', value: bundle.sourceLabel || '' },
          { label: 'Donor name', value: bundle.donorName || '' },
          { label: 'Birthday', value: bundle.donorBirthdate || '' },
          { label: 'Length', value: bundle.lengthLabel || '' },
          { label: 'Condition', value: bundle.condition || '' },
          { label: 'Color', value: bundle.color || '' },
          { label: 'Density', value: bundle.density || '' },
        ],
      });
      setPrintFeedback({ message: 'Print dialog opened. Paste the printed QR on the matching hair plastic before submitting it at the donation site.', variant: 'success' });
    } catch (_error) {
      setPrintFeedback({ message: 'Unable to open the print dialog right now. Please try again.', variant: 'error' });
    } finally {
      setPrintingQrKey('');
    }
  }, []);

  const handleSaveQr = React.useCallback(async (bundle) => {
    if (!bundle?.qrPayload) return;

    setSavingQrKey(bundle.key);
    setPrintFeedback({ message: '', variant: 'info' });

    const result = await saveDonationQrPngToDevice({
      qrPayloadText: bundle.qrPayload,
      fileName: `donivra-hair-${bundle.bundleNumber || 'qr'}-${bundle.donorName || 'donor'}`,
    });

    setSavingQrKey('');
    setPrintFeedback({
      message: result.success
        ? 'QR image saved to this device. Paste it on the matching hair plastic before submitting at the donation site.'
        : (result.error || 'Unable to save the QR image right now.'),
      variant: result.success ? 'success' : 'error',
    });
  }, []);

  return (
    <ModalShell
      visible={visible}
      title="Preview hair submission"
      subtitle={isSubmitted
        ? 'These QR codes are already generated. Attach each QR to the matching hair plastic.'
        : 'Confirm these details before generating the QR for the hair plastic.'}
      onClose={onClose}
      scrollContent
      footer={isSubmitted ? (
        <AppButton title="Close" onPress={onClose} disabled={isSubmitting} />
      ) : (
        <View style={styles.modalFooterActions}>
          <View style={styles.modalFooterActionHalf}>
            <AppButton title="Edit details" variant="outline" onPress={onEditDetails || onClose} disabled={isSubmitting} />
          </View>
          <View style={styles.modalFooterActionHalf}>
            <AppButton
              title={isSubmitting ? 'Submitting...' : 'Submit donation'}
              onPress={onConfirm}
              loading={isSubmitting}
              disabled={isSubmitting}
            />
          </View>
        </View>
      )}
    >
      {printFeedback.message ? (
        <StatusBanner message={printFeedback.message} variant={printFeedback.variant} style={styles.bannerSpacing} />
      ) : null}
      <BundlePreviewPanel
        roles={roles}
        bundles={previewItems}
        onPrintQr={handlePrintQr}
        printingQrKey={printingQrKey}
        onSaveQr={handleSaveQr}
        savingQrKey={savingQrKey}
      />
    </ModalShell>
  );
}

export function DonorDonationStatusScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams();
  const { user, profile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const { logout, isLoggingOut } = useAuthActions();
  const { unreadCount } = useNotifications({
    role: 'donor',
    userId: user?.id,
    userEmail: user?.email || profile?.email || '',
    databaseUserId: profile?.user_id,
    mode: 'badge',
    liveUpdates: true,
  });

  // â”€â”€ Module data
  const [moduleData, setModuleData] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [screenError, setScreenError] = React.useState('');
  const [moduleFeedback, setModuleFeedback] = React.useState({ message: '', variant: 'info' });

  // â”€â”€ Manual form
  const [isManualModalOpen, setIsManualModalOpen] = React.useState(false);
  const [manualForm, setManualForm] = React.useState(MANUAL_FORM_DEFAULTS);
  const [manualFormErrors, setManualFormErrors] = React.useState({});
  const [manualPhoto, setManualPhoto] = React.useState(null);
  const [manualFeedback, setManualFeedback] = React.useState({ message: '', variant: 'info' });
  const [isSavingManual, setIsSavingManual] = React.useState(false);
  const [manualEditTarget, setManualEditTarget] = React.useState(null);
  const [isGeneratingQr, setIsGeneratingQr] = React.useState(false);

  // â”€â”€ Parcel photo
  const [isAddBundleModalOpen, setIsAddBundleModalOpen] = React.useState(false);
  const [bundleForm, setBundleForm] = React.useState(ADDITIONAL_BUNDLE_DEFAULTS);
  const [bundleErrors, setBundleErrors] = React.useState({});
  const [bundlePhoto, setBundlePhoto] = React.useState(null);
  const [bundleFeedback, setBundleFeedback] = React.useState({ message: '', variant: 'info' });
  const [isSavingBundle, setIsSavingBundle] = React.useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = React.useState(false);
  const [isCancellingDonation, setIsCancellingDonation] = React.useState(false);
  const [isSubmitPreviewOpen, setIsSubmitPreviewOpen] = React.useState(false);
  const [selectedDriveForDonation, setSelectedDriveForDonation] = React.useState(null);
  const [donationModuleScreen, setDonationModuleScreen] = React.useState(DONATION_MODULE_SCREEN.EVENTS);
  const [recipientPatients, setRecipientPatients] = React.useState([]);
  const [selectedRecipient, setSelectedRecipient] = React.useState({ type: 'organization', patient: null });
  const [selectedDonationStatusItem, setSelectedDonationStatusItem] = React.useState(null);
  const [myDonationsFilter, setMyDonationsFilter] = React.useState('active');
  const [qrActionFeedback, setQrActionFeedback] = React.useState({ message: '', variant: 'info' });
  const [printingQrKey, setPrintingQrKey] = React.useState('');
  const [savingQrKey, setSavingQrKey] = React.useState('');

  const avatarInitials = `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.trim();
  const accountDonorName = [
    profile?.first_name,
    profile?.middle_name,
    profile?.last_name,
    profile?.suffix,
  ].map((part) => String(part || '').trim()).filter(Boolean).join(' ') || profile?.email || 'Account owner';

  // â”€â”€ Load module data
  const loadModuleData = React.useCallback(async ({ silent = false } = {}) => {
    if (!user?.id) return;
    if (!silent) {
      setIsLoading(true);
    }
    setScreenError('');
    const result = await getDonorDonationsModuleData({
      userId: user.id,
      databaseUserId: profile?.user_id || null,
    });
    setModuleData(result);
    setIsLoading(false);
    if (result.error) setScreenError(result.error);
  }, [profile?.user_id, user?.id]);

  const donationRealtimeRefreshRef = React.useRef(null);
  const scheduleDonationRealtimeRefresh = React.useCallback(() => {
    if (donationRealtimeRefreshRef.current) {
      clearTimeout(donationRealtimeRefreshRef.current);
    }

    donationRealtimeRefreshRef.current = setTimeout(() => {
      void loadModuleData({ silent: true });
    }, DONATION_REALTIME_DEBOUNCE_MS);
  }, [loadModuleData]);

  React.useEffect(() => { loadModuleData(); }, [loadModuleData]);

  React.useEffect(() => {
    if (isLoading || !moduleData?.hasOngoingDonation) return;
    if (donationModuleScreen !== DONATION_MODULE_SCREEN.EVENTS) return;

    setMyDonationsFilter('active');
    setDonationModuleScreen(DONATION_MODULE_SCREEN.MY_DONATIONS);
  }, [donationModuleScreen, isLoading, moduleData?.hasOngoingDonation]);

  React.useEffect(() => {
    let isMounted = true;
    const loadRecipientPatients = async () => {
      const { data } = await supabase
        .from('Patients')
        .select('Patient_ID, Patient_Code, Medical_Condition, Patient_Picture, User_ID')
        .limit(12);
      if (!isMounted) return;

      const patientRows = data || [];
      const patientUserIds = [
        ...new Set(patientRows.map((patient) => Number(patient.User_ID)).filter((value) => Number.isFinite(value) && value > 0)),
      ];
      let detailsByUserId = new Map();
      if (patientUserIds.length) {
        const { data: detailsData } = await supabase
          .from('user_details')
          .select('user_id, first_name, middle_name, last_name, suffix')
          .in('user_id', patientUserIds);

        if (!isMounted) return;
        detailsByUserId = new Map(
          (detailsData || []).map((detail) => {
            const fullName = [
              detail.first_name,
              detail.middle_name,
              detail.last_name,
              detail.suffix,
            ].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
            return [Number(detail.user_id), fullName];
          })
        );
      }

      setRecipientPatients((data || []).map((patient) => ({
        patient_id: patient.Patient_ID,
        patient_code: patient.Patient_Code,
        patient_name: detailsByUserId.get(Number(patient.User_ID)) || `Patient ${patient.Patient_ID}`,
        medical_condition: patient.Medical_Condition,
        patient_picture: patient.Patient_Picture,
      })));
    };

    void loadRecipientPatients();
    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (donationRealtimeRefreshRef.current) {
        clearTimeout(donationRealtimeRefreshRef.current);
      }
    };
  }, []);

  // â”€â”€ Derived state
  const donorProfileMeta = React.useMemo(() => buildProfileCompletionMeta({
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
  }), [profile]);

  const isProfileComplete = donorProfileMeta.isComplete;
  const latestScreening = moduleData?.latestScreening || null;
  const screeningDate = latestScreening?.created_at || '';
  const screeningLabel = screeningDate ? formatDateLabel(screeningDate) : '';
  const isHairFresh = Boolean(
    screeningDate && Date.now() - new Date(screeningDate).getTime() <= 30 * 24 * 60 * 60 * 1000
  );
  const isAiEligible = Boolean(moduleData?.isAiEligible);
  const hasOngoingDonation = Boolean(moduleData?.hasOngoingDonation);
  const effectiveDonationModuleScreen = (
    hasOngoingDonation && donationModuleScreen === DONATION_MODULE_SCREEN.EVENTS
      ? DONATION_MODULE_SCREEN.MY_DONATIONS
      : donationModuleScreen
  );
  const independentQrState = moduleData?.independentQrState || null;
  const hasGeneratedDonationQr = Boolean(independentQrState?.reference);

  React.useEffect(() => {
    if (!hasGeneratedDonationQr) return;
    if (!moduleFeedback?.message) return;

    const normalizedMessage = String(moduleFeedback.message).toLowerCase();
    if (normalizedMessage.includes('qr was generated but could not be persisted')) {
      setModuleFeedback({ message: '', variant: 'info' });
    }
  }, [hasGeneratedDonationQr, moduleFeedback?.message]);

  const certificate = moduleData?.certificate || null;
  // Joined drives: drives the user has already registered for
  const joinedDrives = React.useMemo(() => (
    (moduleData?.drives || []).filter((d) => Boolean(d?.registration))
  ), [moduleData?.drives]);

  React.useEffect(() => {
    const routeDriveId = Array.isArray(routeParams.driveId) ? routeParams.driveId[0] : routeParams.driveId;
    const numericRouteDriveId = Number(routeDriveId);
    if (!Number.isFinite(numericRouteDriveId) || numericRouteDriveId <= 0) return;

    const matchingDrive = (moduleData?.drives || []).find((drive) => Number(drive?.donation_drive_id) === numericRouteDriveId);
    if (matchingDrive) {
      setSelectedDriveForDonation(matchingDrive);
      setDonationModuleScreen(DONATION_MODULE_SCREEN.EVENT_DETAILS);
    }
  }, [moduleData?.drives, routeParams.driveId]);

  // Active drive from submission
  const activeDriveFromSubmission = moduleData?.activeDrive || null;
  const displayDrive = activeDriveFromSubmission || selectedDriveForDonation || joinedDrives[0] || null;
  const selectedFlowDrive = selectedDriveForDonation || displayDrive;
  const selectedDonationDriveId = (
    selectedDriveForDonation?.donation_drive_id
    || activeDriveFromSubmission?.donation_drive_id
    || (displayDrive?.registration?.registration_id ? displayDrive?.donation_drive_id : null)
    || null
  );
  const trackedSubmissionId = moduleData?.latestSubmission?.submission_id || null;
  const trackedDetailIds = React.useMemo(() => {
    const fromSubmission = Array.isArray(moduleData?.latestSubmission?.submission_details)
      ? moduleData.latestSubmission.submission_details
      : [];
    const fallback = moduleData?.latestDetail ? [moduleData.latestDetail] : [];
    const detailSource = fromSubmission.length ? fromSubmission : fallback;

    return [...new Set(
      detailSource
        .map((item) => Number(item?.submission_detail_id))
        .filter((value) => Number.isFinite(value) && value > 0)
    )];
  }, [moduleData?.latestDetail, moduleData?.latestSubmission?.submission_details]);
  const trackedDetailIdsKey = React.useMemo(
    () => trackedDetailIds.join(','),
    [trackedDetailIds]
  );

  React.useEffect(() => {
    if (!user?.id || !profile?.user_id) return undefined;

    const channel = supabase.channel(`donor-donation-live-${profile.user_id}`);
    const onRealtimeEvent = () => {
      scheduleDonationRealtimeRefresh();
    };

    channel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Donation_Drive_Requests',
      }, onRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Donation_Drive_Registrations',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Organization_Members',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Hair_Submissions',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Donation_Certificates',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onRealtimeEvent);

    if (trackedSubmissionId) {
      channel
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'Hair_Submission_Details',
          filter: `Submission_ID=eq.${trackedSubmissionId}`,
        }, onRealtimeEvent)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'Hair_Submission_Logistics',
          filter: `Submission_ID=eq.${trackedSubmissionId}`,
        }, onRealtimeEvent)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'Hair_Bundle_Tracking_History',
          filter: `Submission_ID=eq.${trackedSubmissionId}`,
        }, onRealtimeEvent)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'Donation_Certificates',
          filter: `Submission_ID=eq.${trackedSubmissionId}`,
        }, onRealtimeEvent);
    }

    trackedDetailIds.forEach((detailId) => {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Hair_Submission_Images',
        filter: `Submission_Detail_ID=eq.${detailId}`,
      }, onRealtimeEvent);
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    profile?.user_id,
    scheduleDonationRealtimeRefresh,
    trackedDetailIds,
    trackedDetailIdsKey,
    trackedSubmissionId,
    user?.id,
  ]);

  // QR payload for the active independent donation
  const activeDonationQrItems = React.useMemo(() => {
    const submissions = Array.isArray(moduleData?.activeSubmissions) && moduleData.activeSubmissions.length
      ? moduleData.activeSubmissions
      : (moduleData?.latestSubmission ? [moduleData.latestSubmission] : []);

    return submissions
      .filter((submission) => submission?.submission_id)
      .flatMap((submission) => {
        const submissionDetails = Array.isArray(submission?.submission_details)
          ? submission.submission_details
          : [];
        const fallbackDetail = Number(moduleData?.latestDetail?.submission_id) === Number(submission.submission_id)
          ? moduleData.latestDetail
          : getLatestPreviewDetail(submission);
        const details = submissionDetails.length ? submissionDetails : (fallbackDetail ? [fallbackDetail] : [null]);
        const payloadSubmission = selectedDonationDriveId && !submission?.donation_drive_id
          ? { ...submission, donation_drive_id: selectedDonationDriveId }
          : submission;

        return details.map((detail, index) => ({
          key: `${submission.submission_id}-${detail?.submission_detail_id || index}`,
          submission,
          detail,
          qrPayload: buildDonationTrackingQrPayload({
            submission: payloadSubmission,
            detail,
            drive: selectedDriveForDonation || displayDrive || null,
          }),
        }));
      });
  }, [
    displayDrive,
    moduleData?.activeSubmissions,
    moduleData?.latestDetail,
    moduleData?.latestSubmission,
    selectedDonationDriveId,
    selectedDriveForDonation,
  ]);
  const activeDonationQrPayload = activeDonationQrItems[0]?.qrPayload || '';
  const donationPreviewItems = React.useMemo(() => {
    if (activeDonationQrItems.length) {
      return activeDonationQrItems.flatMap((item, index) => (
        buildHairSubmissionPreviewItems(item.submission, item.detail, item.qrPayload, accountDonorName)
          .map((previewItem) => ({
            ...previewItem,
            bundleNumber: index + 1,
            key: `${previewItem.key}-${item.qrPayload || index}`,
          }))
      ));
    }
    return buildHairSubmissionPreviewItems(
      moduleData?.latestSubmission || null,
      moduleData?.latestDetail || null,
      activeDonationQrPayload,
      accountDonorName
    );
  }, [
    accountDonorName,
    activeDonationQrItems,
    activeDonationQrPayload,
    moduleData?.latestDetail,
    moduleData?.latestSubmission,
  ]);
  const hasSubmittedDonationQr = Boolean(
    activeDonationQrItems.length && activeDonationQrItems.every(isSubmittedDonationItem)
  );
  const hasDonationQrForOverview = (
    hasGeneratedDonationQr
    || hasSubmittedDonationQr
    || activeDonationQrItems.some((item) => hasDonationQrMetadata(item.submission))
  );
  const myDonationItems = React.useMemo(() => {
    const driveById = new Map(
      [activeDriveFromSubmission, selectedDriveForDonation, ...joinedDrives]
        .filter(Boolean)
        .map((drive) => [Number(drive?.donation_drive_id), drive])
    );
    const submissionSource = Array.isArray(moduleData?.activeSubmissions) && moduleData.activeSubmissions.length
      ? moduleData.activeSubmissions
      : (moduleData?.latestSubmission ? [moduleData.latestSubmission] : []);
    const submissionGroups = new Map();

    submissionSource
      .filter((submission) => submission?.submission_id && !isClosedDonationStatus(submission?.status))
      .forEach((submission) => {
        const driveId = Number(submission?.donation_drive_id);
        const groupKey = Number.isFinite(driveId) && driveId > 0
          ? `drive-${driveId}`
          : `submission-${submission.submission_id}`;
        const current = submissionGroups.get(groupKey) || [];
        submissionGroups.set(groupKey, [...current, submission]);
      });

    const items = Array.from(submissionGroups.entries()).map(([groupKey, submissions]) => {
      const primarySubmission = [...submissions]
        .sort((left, right) => new Date(right?.updated_at || right?.created_at || 0) - new Date(left?.updated_at || left?.created_at || 0))[0];
      const driveId = Number(primarySubmission?.donation_drive_id);
      const drive = driveById.get(driveId) || activeDriveFromSubmission || selectedDriveForDonation || null;
      const groupQrItems = activeDonationQrItems.filter((item) => (
        submissions.some((submission) => Number(submission?.submission_id) === Number(item?.submission?.submission_id))
      ));
      const previewItems = groupQrItems.flatMap((item, index) => (
        buildHairSubmissionPreviewItems(item.submission, item.detail, item.qrPayload, accountDonorName)
          .map((previewItem) => ({
            ...previewItem,
            bundleNumber: index + 1,
            key: `${previewItem.key}-${item.qrPayload || index}`,
          }))
      ));
      const statusMeta = getDonationCardMeta({
        submission: primarySubmission,
        drive,
        logistics: moduleData?.logistics || null,
      });

      return {
        key: groupKey,
        type: 'submission',
        submission: primarySubmission,
        submissions,
        previewItems,
        drive,
        title: drive?.event_title || 'Hair donation',
        organizationName: getDriveOrganizationLabel(drive),
        recipientName: selectedRecipient?.type === 'patient'
          ? selectedRecipient?.patient?.patient_name || ''
          : getDriveOrganizationLabel(drive),
        dateLabel: getDriveDateLabel(drive),
        locationLabel: getDriveLocationLabel(drive),
        imageUrl: drive?.event_image_url || drive?.organization_logo_url || '',
        statusLabel: statusMeta.label,
        statusCategory: statusMeta.category,
        statusIcon: statusMeta.icon,
        hairCount: groupQrItems.length || previewItems.length || submissions.length,
        updatedAt: primarySubmission?.updated_at || primarySubmission?.created_at || '',
      };
    });

    const activeSubmissionDriveIds = new Set(
      items
        .map((item) => Number(item?.drive?.donation_drive_id || item?.submission?.donation_drive_id))
        .filter((value) => Number.isFinite(value) && value > 0)
    );

    joinedDrives
      .filter((drive) => !activeSubmissionDriveIds.has(Number(drive?.donation_drive_id)))
      .forEach((drive) => {
        const statusMeta = getDonationCardMeta({ drive });
        items.push({
          key: `drive-${drive?.donation_drive_id || drive?.event_title}`,
          type: 'drive',
          submission: null,
          submissions: [],
          previewItems: [],
          drive,
          title: drive?.event_title || 'Donation drive',
          organizationName: getDriveOrganizationLabel(drive),
          recipientName: getDriveOrganizationLabel(drive),
          dateLabel: getDriveDateLabel(drive),
          locationLabel: getDriveLocationLabel(drive),
          imageUrl: drive?.event_image_url || drive?.organization_logo_url || '',
          statusLabel: statusMeta.label,
          statusCategory: statusMeta.category,
          statusIcon: statusMeta.icon,
          hairCount: 0,
          updatedAt: drive?.start_date || drive?.updated_at || '',
        });
      });

    return items.sort((left, right) => {
      const leftPriority = left.submission ? 0 : 1;
      const rightPriority = right.submission ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0);
    });
  }, [
    accountDonorName,
    activeDonationQrItems,
    activeDriveFromSubmission,
    joinedDrives,
    moduleData?.activeSubmissions,
    moduleData?.latestSubmission,
    moduleData?.logistics,
    selectedDriveForDonation,
    selectedRecipient?.patient?.patient_name,
    selectedRecipient?.type,
  ]);
  const selectedDonationTimelineItem = React.useMemo(() => {
    if (selectedDonationStatusItem?.key) {
      return myDonationItems.find((item) => item.key === selectedDonationStatusItem.key) || selectedDonationStatusItem;
    }
    return myDonationItems.find((item) => item.submission) || myDonationItems[0] || null;
  }, [myDonationItems, selectedDonationStatusItem]);

  const handleNavPress = React.useCallback((item) => {
    if (!item.route || item.route === '/donor/status') return;
    router.navigate(item.route);
  }, [router]);

  // â”€â”€ AI log path
  const guardDonationPermission = React.useCallback(async () => {
    const permission = await canSubmitHairDonation(profile?.user_id || null);
    if (permission.allowed) return true;

    if (permission.reason === DONOR_PERMISSION_REASONS.profileIncomplete) {
      router.navigate('/profile');
      return false;
    }

    if (permission.reason === DONOR_PERMISSION_REASONS.guardianConsentRequired) {
      router.navigate('/donor/guardian-consent');
      return false;
    }

    setModuleFeedback({ message: mapDonationPermissionError(permission.reason), variant: 'error' });
    return false;
  }, [profile?.user_id, router]);

  const handleProceedWithHairLog = React.useCallback(async () => {
    const hasPermission = await guardDonationPermission();
    if (!hasPermission) return false;

    const aiDonation = moduleData?.latestAiDonation;
    if (!aiDonation?.submission) {
      setModuleFeedback({
        message: moduleData?.latestAiEligibility?.reason || 'No eligible hair log found.',
        variant: 'error',
      });
      return false;
    }
    setModuleFeedback({ message: 'Saving donation detailsâ€¦', variant: 'info' });
    setIsGeneratingQr(true);
    const draftResult = await startIndependentDonationDraft({
      userId: user?.id,
      submission: aiDonation.submission,
      databaseUserId: profile?.user_id || null,
      donationDriveId: selectedDonationDriveId,
    });
    setIsGeneratingQr(false);
    setModuleFeedback({
      message: draftResult.success
        ? 'Hair details saved. Tap View Donation to preview and generate the QR for this hair.'
        : (draftResult.error || 'Could not save donation details right now.'),
      variant: draftResult.success ? 'success' : 'error',
    });
    await loadModuleData();
    return Boolean(draftResult.success);
  }, [
    loadModuleData,
    moduleData?.latestAiDonation,
    moduleData?.latestAiEligibility?.reason,
    profile?.user_id,
    guardDonationPermission,
    selectedDonationDriveId,
    user?.id,
  ]);

  // â”€â”€ Manual path
  void handleProceedWithHairLog;

  const handleOpenManualModal = React.useCallback(() => {
    if (!isProfileComplete) { router.navigate('/profile'); return; }
    if (!isHairFresh && !selectedDriveForDonation) { router.navigate('/donor/donations'); return; }
    setManualEditTarget(null);
    const screening = moduleData?.latestScreening;
    if (screening) {
      const estLengthCm = Number(screening.estimated_length);
      const estLengthIn = estLengthCm > 0 ? String((estLengthCm / 2.54).toFixed(1)) : '';
      setManualForm({ ...MANUAL_FORM_DEFAULTS, lengthValue: estLengthIn });
    } else {
      setManualForm(MANUAL_FORM_DEFAULTS);
    }
    setManualFormErrors({});
    setManualPhoto(null);
    setManualFeedback({ message: '', variant: 'info' });
    setIsManualModalOpen(true);
  }, [isHairFresh, isProfileComplete, moduleData?.latestScreening, router, selectedDriveForDonation]);

  const updateManualField = React.useCallback((field, value) => {
    setManualForm((prev) => ({ ...prev, [field]: value }));
    setManualFormErrors((prev) => ({
      ...prev,
      [field]: '',
      donorType: '',
      ...(field === 'donorType' ? { donorName: '', donorBirthdate: '' } : {}),
      photo: '',
    }));
  }, []);

  const handlePickManualPhoto = React.useCallback(async (mode = 'library') => {
    const picker = mode === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await picker({ mediaTypes: ['images'], allowsEditing: true, quality: 0.72, base64: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setManualPhoto({ uri: asset.uri, base64: asset.base64 || '', mimeType: asset.mimeType || 'image/jpeg', fileName: asset.fileName || '' });
    setManualFormErrors((prev) => ({ ...prev, photo: '' }));
  }, []);

  const handleSaveManualDetails = React.useCallback(async () => {
    const nextErrors = {};
    const numericLength = Number(manualForm.lengthValue);
    if (!Number.isFinite(numericLength) || numericLength <= 0) {
      nextErrors.lengthValue = 'Enter a valid hair length.';
    }
    if (manualForm.donorType === 'different') {
      if (!String(manualForm.donorName || '').trim()) {
        nextErrors.donorName = 'Enter the hair donor full name.';
      }
      if (!isValidBirthdate(manualForm.donorBirthdate)) {
        nextErrors.donorBirthdate = 'Enter a valid birthday in YYYY-MM-DD format.';
      }
    }
    if (!manualEditTarget && !manualPhoto) {
      nextErrors.photo = 'Please upload or capture a hair photo.';
    }
    if (Object.keys(nextErrors).length) {
      setManualFormErrors(nextErrors);
      return;
    }

    setIsSavingManual(true);
    if (manualEditTarget?.submission?.submission_id && manualEditTarget?.detail?.submission_detail_id) {
      const result = await updateManualDonationDetail({
        userId: user?.id,
        databaseUserId: profile?.user_id || null,
        donorType: manualForm.donorType,
        submission: manualEditTarget.submission,
        detail: manualEditTarget.detail,
        manualDetails: {
          length_value: numericLength,
          length_unit: manualForm.lengthUnit,
          bundle_quantity: 1,
          treated: manualForm.treated,
          colored: manualForm.colored,
          trimmed: manualForm.trimmed,
          hair_color: manualForm.hairColor,
          density: manualForm.density,
          donor_name: manualForm.donorType === 'different' ? String(manualForm.donorName || '').trim() : null,
          donor_birthdate: manualForm.donorType === 'different' ? String(manualForm.donorBirthdate || '').trim() : null,
          donor_age: manualForm.donorType === 'different' ? getAgeFromBirthdate(manualForm.donorBirthdate) : null,
          donor_is_minor: manualForm.donorType === 'different'
            ? Number(getAgeFromBirthdate(manualForm.donorBirthdate)) < 18
            : null,
        },
        photo: manualPhoto,
        donationRequirement: moduleData?.latestDonationRequirement || null,
      });
      setIsSavingManual(false);

      if (!result.success) {
        setManualFeedback({ message: result.error || 'Could not update details. Please try again.', variant: 'error' });
        return;
      }

      setManualEditTarget(null);
      setManualPhoto(null);
      setIsManualModalOpen(false);
      setModuleFeedback({
        message: result.canProceed
          ? 'Hair details updated. Tap View Donation to review the QR preview.'
          : (result.qualification?.reason || 'Hair details updated but do not meet donation requirements yet.'),
        variant: result.canProceed ? 'success' : 'info',
      });
      await loadModuleData();
      setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
      return;
    }

    const result = await saveManualDonationQualification({
      userId: user?.id,
      databaseUserId: profile?.user_id || null,
      donorType: manualForm.donorType,
      donationDriveId: selectedDonationDriveId,
      manualDetails: {
        length_value: numericLength,
        length_unit: manualForm.lengthUnit,
        bundle_quantity: 1,
        treated: manualForm.treated,
        colored: manualForm.colored,
        trimmed: manualForm.trimmed,
        hair_color: manualForm.hairColor,
        density: manualForm.density,
        donor_name: manualForm.donorType === 'different' ? String(manualForm.donorName || '').trim() : null,
        donor_birthdate: manualForm.donorType === 'different' ? String(manualForm.donorBirthdate || '').trim() : null,
        donor_age: manualForm.donorType === 'different' ? getAgeFromBirthdate(manualForm.donorBirthdate) : null,
        donor_is_minor: manualForm.donorType === 'different'
          ? Number(getAgeFromBirthdate(manualForm.donorBirthdate)) < 18
          : null,
      },
      photo: manualPhoto,
      donationRequirement: moduleData?.latestDonationRequirement || null,
    });
    setIsSavingManual(false);

    if (!result.success) {
      if (result.errorCode === DONOR_PERMISSION_REASONS.profileIncomplete) {
        setIsManualModalOpen(false);
        router.navigate('/profile');
        return;
      }
      if (result.errorCode === DONOR_PERMISSION_REASONS.guardianConsentRequired) {
        setIsManualModalOpen(false);
        router.navigate('/donor/guardian-consent');
        return;
      }
      setManualFeedback({ message: result.error || 'Could not save details. Please try again.', variant: 'error' });
      return;
    }

    setIsManualModalOpen(false);

    if (result.canProceed && result.submission) {
      setModuleFeedback({ message: 'Hair details saved. Starting your donation flow...', variant: 'info' });
      setIsGeneratingQr(true);
      const draftResult = await startIndependentDonationDraft({
        userId: user?.id,
        submission: result.submission,
        databaseUserId: profile?.user_id || null,
        donationDriveId: selectedDonationDriveId,
      });
      setIsGeneratingQr(false);
      setModuleFeedback({
        message: draftResult.success
          ? 'Hair details saved. Tap View Donation to preview and generate the QR for this hair.'
          : (draftResult.error || 'Details saved but donation flow could not be started.'),
        variant: draftResult.success ? 'success' : 'error',
      });
    } else {
      setModuleFeedback({
        message: result.qualification?.reason || 'Details saved but do not meet donation requirements yet.',
        variant: 'info',
      });
    }

    await loadModuleData();
    setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
  }, [
    loadModuleData,
    manualForm,
    manualPhoto,
    moduleData?.latestDonationRequirement,
    manualEditTarget,
    profile?.user_id,
    router,
    selectedDonationDriveId,
    user?.id,
  ]);

  const handleUpdateBundleField = React.useCallback((field, value) => {
    setBundleForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'donorType' && value === 'own') {
        next.inputMethod = 'scan';
      }
      return next;
    });
    setBundleErrors((prev) => ({ ...prev, [field]: '', photo: '' }));
  }, []);

  const handlePickBundlePhoto = React.useCallback(async (mode = 'library') => {
    const picker = mode === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await picker({ mediaTypes: ['images'], allowsEditing: true, quality: 0.72, base64: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setBundlePhoto({ uri: asset.uri, base64: asset.base64 || '', mimeType: asset.mimeType || 'image/jpeg', fileName: asset.fileName || '' });
    setBundleErrors((prev) => ({ ...prev, photo: '' }));
  }, []);

  const handleAttachLatestScanForBundle = React.useCallback(async (bundleOverride = {}) => {
    const effectiveBundleForm = { ...bundleForm, ...bundleOverride };
    const submission = moduleData?.latestSubmission;
    if (!submission?.submission_id) {
      setBundleFeedback({ message: 'No active donation record found.', variant: 'error' });
      return;
    }
    if (!moduleData?.latestScreening) {
      setBundleFeedback({ message: 'No recent scan was found. Open CheckHair and scan first.', variant: 'error' });
      return;
    }
    if (effectiveBundleForm.donorType === 'different') {
      const nextErrors = {};
      if (!String(effectiveBundleForm.donorName || '').trim()) {
        nextErrors.donorName = 'Enter the hair donor full name.';
      }
      if (!isValidBirthdate(effectiveBundleForm.donorBirthdate)) {
        nextErrors.donorBirthdate = 'Enter a valid birthday in YYYY-MM-DD format.';
      }
      if (Object.keys(nextErrors).length) {
        setBundleErrors(nextErrors);
        return;
      }
    }

    setIsSavingBundle(true);
    const result = await addDonationBundleFromAnalysis({
      userId: user?.id || null,
      databaseUserId: profile?.user_id || null,
      submission,
      screening: moduleData.latestScreening,
      referenceDetail: moduleData?.latestAnalysisEntry?.detail || moduleData?.latestDetail || null,
      donorType: effectiveBundleForm.donorType,
      donorName: effectiveBundleForm.donorType === 'different' ? String(effectiveBundleForm.donorName || '').trim() : '',
      donorBirthdate: effectiveBundleForm.donorType === 'different' ? String(effectiveBundleForm.donorBirthdate || '').trim() : '',
      donorAge: effectiveBundleForm.donorType === 'different' ? getAgeFromBirthdate(effectiveBundleForm.donorBirthdate) : null,
      donorIsMinor: effectiveBundleForm.donorType === 'different'
        ? Number(getAgeFromBirthdate(effectiveBundleForm.donorBirthdate)) < 18
        : null,
    });
    setIsSavingBundle(false);

    if (!result.success) {
      setBundleFeedback({ message: result.error || 'Could not attach scanned bundle right now.', variant: 'error' });
      return;
    }

    setIsAddBundleModalOpen(false);
    setModuleFeedback({ message: 'Additional scanned bundle added to this donation.', variant: 'success' });
    await loadModuleData();
    setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
  }, [
    bundleForm.donorType,
    bundleForm.donorBirthdate,
    bundleForm.donorName,
    loadModuleData,
    moduleData?.latestAnalysisEntry?.detail,
    moduleData?.latestDetail,
    moduleData?.latestScreening,
    moduleData?.latestSubmission,
    profile?.user_id,
    user?.id,
  ]);

  const handleSaveAdditionalBundle = React.useCallback(async () => {
    const submission = moduleData?.latestSubmission;
    if (!submission?.submission_id) {
      setBundleFeedback({ message: 'No active donation record found.', variant: 'error' });
      return;
    }

    const donorIdentityErrors = {};
    if (bundleForm.donorType === 'different') {
      if (!String(bundleForm.donorName || '').trim()) {
        donorIdentityErrors.donorName = 'Enter the hair donor full name.';
      }
      if (!isValidBirthdate(bundleForm.donorBirthdate)) {
        donorIdentityErrors.donorBirthdate = 'Enter a valid birthday in YYYY-MM-DD format.';
      }
    }
    if (Object.keys(donorIdentityErrors).length) {
      setBundleErrors(donorIdentityErrors);
      return;
    }

    if (bundleForm.donorType === 'own' || (bundleForm.donorType === 'different' && bundleForm.inputMethod === 'scan')) {
      await handleAttachLatestScanForBundle();
      return;
    }

    const nextErrors = {};
    const numericLength = Number(bundleForm.lengthValue);
    if (!Number.isFinite(numericLength) || numericLength <= 0) {
      nextErrors.lengthValue = 'Enter a valid hair length.';
    }
    if (!bundlePhoto) {
      nextErrors.photo = 'Please upload or capture a bundle photo.';
    }
    if (Object.keys(nextErrors).length) {
      setBundleErrors(nextErrors);
      return;
    }

    setIsSavingBundle(true);
    const result = await addDonationBundleFromManualDetails({
      userId: user?.id || null,
      databaseUserId: profile?.user_id || null,
      submission,
      donorType: bundleForm.donorType,
      manualDetails: {
        length_value: numericLength,
        length_unit: bundleForm.lengthUnit,
        treated: bundleForm.treated,
        colored: bundleForm.colored,
        trimmed: bundleForm.trimmed,
        hair_color: bundleForm.hairColor,
        density: bundleForm.density,
        donor_name: bundleForm.donorType === 'different' ? String(bundleForm.donorName || '').trim() : null,
        donor_birthdate: bundleForm.donorType === 'different' ? String(bundleForm.donorBirthdate || '').trim() : null,
        donor_age: bundleForm.donorType === 'different' ? getAgeFromBirthdate(bundleForm.donorBirthdate) : null,
        donor_is_minor: bundleForm.donorType === 'different'
          ? Number(getAgeFromBirthdate(bundleForm.donorBirthdate)) < 18
          : null,
      },
      photo: bundlePhoto,
    });
    setIsSavingBundle(false);

    if (!result.success) {
      setBundleFeedback({ message: result.error || 'Could not add this bundle right now.', variant: 'error' });
      return;
    }

    setIsAddBundleModalOpen(false);
    setModuleFeedback({
      message: bundleForm.donorType === 'different'
        ? 'Different-donor bundle added to this donation.'
        : 'Additional bundle added to this donation.',
      variant: 'success',
    });
    await loadModuleData();
    setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
  }, [
    bundleForm.colored,
    bundleForm.density,
    bundleForm.donorType,
    bundleForm.donorBirthdate,
    bundleForm.donorName,
    bundleForm.hairColor,
    bundleForm.inputMethod,
    bundleForm.lengthUnit,
    bundleForm.lengthValue,
    bundleForm.treated,
    bundleForm.trimmed,
    bundlePhoto,
    handleAttachLatestScanForBundle,
    loadModuleData,
    moduleData?.latestSubmission,
    profile?.user_id,
    user?.id,
  ]);

  const handleEditDonationDetails = React.useCallback(() => {
    const target = activeDonationQrItems[0] || (
      moduleData?.latestSubmission
        ? {
            submission: moduleData.latestSubmission,
            detail: moduleData.latestDetail || getLatestPreviewDetail(moduleData.latestSubmission),
          }
        : null
    );

    const submission = target?.submission || null;
    const detail = target?.detail || getLatestPreviewDetail(submission);
    if (!submission?.submission_id || !detail?.submission_detail_id) {
      setModuleFeedback({ message: 'No editable hair detail was found for this donation.', variant: 'error' });
      return;
    }

    const notes = [detail?.detail_notes, submission?.donor_notes].filter(Boolean).join(' ');
    const markerText = `${notes} ${detail?.declared_condition || ''}`.toLowerCase();
    const donorType = markerText.includes('different donor') || markerText.includes('other person')
      ? 'different'
      : 'own';
    const rawLength = Number(detail?.declared_length);
    const normalizedLength = Number.isFinite(rawLength) && rawLength > 0
      ? (rawLength > 40 ? rawLength / 2.54 : rawLength)
      : '';

    setManualEditTarget({ submission, detail });
    setManualForm({
      ...MANUAL_FORM_DEFAULTS,
      donorType,
      donorName: donorType === 'different' ? getNoteValue(notes, 'Donor name') : '',
      donorBirthdate: donorType === 'different' ? getNoteValue(notes, 'Donor birthdate') : '',
      lengthValue: normalizedLength ? String(Number(normalizedLength).toFixed(1)) : '',
      lengthUnit: 'in',
      treated: detail?.is_chemically_treated ? 'yes' : 'no',
      colored: detail?.is_colored ? 'yes' : 'no',
      trimmed: 'no',
      hairColor: detail?.declared_color || MANUAL_FORM_DEFAULTS.hairColor,
      density: detail?.declared_density || MANUAL_FORM_DEFAULTS.density,
    });
    setManualPhoto(null);
    setManualFormErrors({});
    setManualFeedback({
      message: 'Editing saved hair details. Upload a new photo only if you want to replace or add a clearer reference.',
      variant: 'info',
    });
    setIsSubmitPreviewOpen(false);
    setIsManualModalOpen(true);
  }, [activeDonationQrItems, moduleData?.latestDetail, moduleData?.latestSubmission]);

  const handleGenerateDonationQr = React.useCallback(async () => {
    if (!activeDonationQrItems.length) {
      setModuleFeedback({ message: 'No active donation record found.', variant: 'error' });
      return;
    }

    setIsSubmitPreviewOpen(true);
  }, [activeDonationQrItems.length]);

  const handleSubmitDriveDonation = React.useCallback((drive) => {
    if (!drive?.donation_drive_id) return;

    setSelectedDriveForDonation(drive);

    if (!isProfileComplete) {
      setModuleFeedback({
        message: 'Complete your donor profile before submitting hair for this donation drive.',
        variant: 'info',
      });
      router.navigate('/profile');
      return;
    }

    if (hasOngoingDonation) {
      setModuleFeedback({
        message: 'You already have a donation in progress. Submit its QR preview or cancel it before starting another hair submission.',
        variant: 'info',
      });
      return;
    }

    const screening = moduleData?.latestScreening;
    if (screening) {
      const estLengthCm = Number(screening.estimated_length);
      const estLengthIn = estLengthCm > 0 ? String((estLengthCm / 2.54).toFixed(1)) : '';
      setManualForm({ ...MANUAL_FORM_DEFAULTS, lengthValue: estLengthIn });
    } else {
      setManualForm(MANUAL_FORM_DEFAULTS);
    }
    setManualFormErrors({});
    setManualPhoto(null);
    setManualFeedback({
      message: `Add the hair details for ${drive.event_title || 'this donation drive'}. You can use manual details here, then preview before QR generation.`,
      variant: 'info',
    });
    setIsManualModalOpen(true);
    setModuleFeedback({
      message: `Selected ${drive.event_title || 'this donation drive'}. Add hair details, then submit to preview and generate the QR.`,
      variant: 'info',
    });
  }, [hasOngoingDonation, isProfileComplete, moduleData?.latestScreening, router]);

  const handleOpenEventDetails = React.useCallback((drive) => {
    if (!drive?.donation_drive_id) return;
    setSelectedDriveForDonation(drive);
    setDonationModuleScreen(DONATION_MODULE_SCREEN.EVENT_DETAILS);
  }, []);

  const handleSubmitSelectedEventDonation = React.useCallback(async () => {
    if (!selectedDriveForDonation?.donation_drive_id) {
      setModuleFeedback({ message: 'Select a donation drive first.', variant: 'error' });
      return;
    }

    if (!isProfileComplete) {
      setModuleFeedback({
        message: 'Complete your donor profile before submitting hair for this donation drive.',
        variant: 'info',
      });
      router.navigate('/profile');
      return;
    }

    if (hasOngoingDonation) {
      const selectedDriveId = Number(selectedDriveForDonation?.donation_drive_id);
      const activeDriveId = Number(moduleData?.latestSubmission?.donation_drive_id || activeDriveFromSubmission?.donation_drive_id);
      const isSameActiveDrive = Number.isFinite(selectedDriveId)
        && Number.isFinite(activeDriveId)
        && selectedDriveId === activeDriveId;

      setModuleFeedback({
        message: isSameActiveDrive
          ? 'You already have an active donation for this event. Open it from My Donations.'
          : 'You already have a donation in progress. Finish or cancel it before submitting hair for another event.',
        variant: 'info',
      });
      setMyDonationsFilter('active');
      setDonationModuleScreen(DONATION_MODULE_SCREEN.MY_DONATIONS);
      return;
    }

    if (moduleData?.latestAiDonation?.submission) {
      const success = await handleProceedWithHairLog();
      if (success) setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
      return;
    }

    setManualForm(MANUAL_FORM_DEFAULTS);
    setManualFormErrors({});
    setManualPhoto(null);
    setManualFeedback({
      message: 'Add the hair details first. You can preview the summary before QR generation.',
      variant: 'info',
    });
    setIsManualModalOpen(true);
    setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
  }, [
    handleProceedWithHairLog,
    activeDriveFromSubmission?.donation_drive_id,
    hasOngoingDonation,
    isProfileComplete,
    moduleData?.latestAiDonation,
    moduleData?.latestSubmission?.donation_drive_id,
    router,
    selectedDriveForDonation,
  ]);

  const handleOpenAddHairSource = React.useCallback(() => {
    setBundleForm(ADDITIONAL_BUNDLE_DEFAULTS);
    setBundleErrors({});
    setBundlePhoto(null);
    setBundleFeedback({ message: '', variant: 'info' });
    setDonationModuleScreen(DONATION_MODULE_SCREEN.ADD_HAIR_SOURCE);
  }, []);

  const handleUseOwnHairLogForAdditional = React.useCallback(async () => {
    setBundleForm({ ...ADDITIONAL_BUNDLE_DEFAULTS, donorType: 'own', inputMethod: 'scan' });
    if (moduleData?.latestSubmission?.submission_id && moduleData?.latestScreening) {
      await handleAttachLatestScanForBundle({ donorType: 'own', inputMethod: 'scan', donorName: '', donorBirthdate: '' });
      setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
      return;
    }

    const success = await handleProceedWithHairLog();
    if (success) setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY);
  }, [
    handleAttachLatestScanForBundle,
    handleProceedWithHairLog,
    moduleData?.latestScreening,
    moduleData?.latestSubmission,
  ]);

  const handleUseOtherPersonScanner = React.useCallback(() => {
    setBundleForm({
      ...ADDITIONAL_BUNDLE_DEFAULTS,
      donorType: 'different',
      inputMethod: 'scan',
    });
    setIsAddBundleModalOpen(true);
  }, []);

  const handleUseOtherPersonManual = React.useCallback(() => {
    setBundleForm({
      ...ADDITIONAL_BUNDLE_DEFAULTS,
      donorType: 'different',
      inputMethod: 'manual',
    });
    setIsAddBundleModalOpen(true);
  }, []);

  const handlePrintQrFromScreen = React.useCallback(async (bundle) => {
    if (!bundle?.qrPayload) return;
    setPrintingQrKey(bundle.key);
    setQrActionFeedback({ message: '', variant: 'info' });
    try {
      await printDonationQrPdf({
        title: `Hair ${bundle.bundleNumber || ''} QR`,
        subtitle: 'Paste this QR on the matching hair plastic before submitting at the donation site.',
        helperText: 'This QR is for identification. Do not reuse it for another hair bundle.',
        qrPayloadText: bundle.qrPayload,
        details: [
          { label: 'Hair', value: `Hair ${bundle.bundleNumber || ''}` },
          { label: 'Donor type', value: bundle.sourceLabel || '' },
          { label: 'Donor name', value: bundle.donorName || '' },
          { label: 'Birthday', value: bundle.donorBirthdate || '' },
          { label: 'Length', value: bundle.lengthLabel || '' },
          { label: 'Condition', value: bundle.condition || '' },
          { label: 'Color', value: bundle.color || '' },
          { label: 'Density', value: bundle.density || '' },
        ],
      });
      setQrActionFeedback({ message: 'Print dialog opened. Paste the printed QR on the matching hair container.', variant: 'success' });
    } catch (_error) {
      setQrActionFeedback({ message: 'Unable to open the print dialog right now.', variant: 'error' });
    } finally {
      setPrintingQrKey('');
    }
  }, []);

  const handleSaveQrFromScreen = React.useCallback(async (bundle) => {
    if (!bundle?.qrPayload) return;
    setSavingQrKey(bundle.key);
    setQrActionFeedback({ message: '', variant: 'info' });
    const result = await saveDonationQrPngToDevice({
      qrPayloadText: bundle.qrPayload,
      fileName: `donivra-hair-${bundle.bundleNumber || 'qr'}-${bundle.donorName || 'donor'}`,
    });
    setSavingQrKey('');
    setQrActionFeedback({
      message: result.success
        ? 'QR image saved to this device. Paste it on the matching hair container.'
        : (result.error || 'Unable to save the QR image right now.'),
      variant: result.success ? 'success' : 'error',
    });
  }, []);

  const handleConfirmGenerateDonationQr = React.useCallback(async () => {
    const itemsToSubmit = activeDonationQrItems.length
      ? activeDonationQrItems
      : (moduleData?.latestSubmission ? [{
          submission: moduleData.latestSubmission,
          detail: moduleData.latestDetail || null,
          qrPayload: activeDonationQrPayload,
        }] : []);

    if (!itemsToSubmit.length) {
      setModuleFeedback({ message: 'No active donation record found.', variant: 'error' });
      setIsSubmitPreviewOpen(false);
      return false;
    }

    if (itemsToSubmit.every(isSubmittedDonationItem)) {
      setIsSubmitPreviewOpen(false);
      setModuleFeedback({
        message: itemsToSubmit.length > 1
          ? 'Donation already submitted. Each hair has its own QR.'
          : 'Donation already submitted. QR is ready for this hair.',
        variant: 'info',
      });
      return true;
    }

    setModuleFeedback({
      message: itemsToSubmit.length > 1
        ? `Submitting donation and generating ${itemsToSubmit.length} hair QRs...`
        : 'Submitting donation and generating your QR...',
      variant: 'info',
    });
    setIsGeneratingQr(true);
    try {
      const submissionMap = new Map();
      itemsToSubmit.forEach((item) => {
        if (item?.submission?.submission_id && !submissionMap.has(item.submission.submission_id)) {
          submissionMap.set(item.submission.submission_id, item.submission);
        }
      });

      const qrResults = [];
      for (const submission of submissionMap.values()) {
        qrResults.push(await ensureIndependentDonationQr({
          userId: user?.id,
          submission,
          databaseUserId: profile?.user_id || null,
          donationDriveId: selectedDonationDriveId,
        }));
      }

      const failedResult = qrResults.find((result) => !result.success);
      if (failedResult) {
        setModuleFeedback({ message: failedResult.error || 'QR generation failed. Please try again.', variant: 'error' });
        return false;
      }

      const submittedIds = new Set(itemsToSubmit.map((item) => Number(item?.submission?.submission_id)).filter(Boolean));
      setModuleData((current) => (
        current
          ? {
              ...current,
              hasOngoingDonation: true,
              activeSubmission: current.activeSubmission && submittedIds.has(Number(current.activeSubmission.submission_id))
                ? { ...current.activeSubmission, status: 'Submitted' }
                : current.activeSubmission,
              latestSubmission: current.latestSubmission && submittedIds.has(Number(current.latestSubmission.submission_id))
                ? { ...current.latestSubmission, status: 'Submitted' }
                : current.latestSubmission,
              activeSubmissions: Array.isArray(current.activeSubmissions)
                ? current.activeSubmissions.map((submission) => (
                    submittedIds.has(Number(submission?.submission_id))
                      ? { ...submission, status: 'Submitted' }
                      : submission
                  ))
                : current.activeSubmissions,
            }
          : current
      ));

      setIsSubmitPreviewOpen(false);
      setModuleFeedback({
        message: itemsToSubmit.length > 1
          ? `${itemsToSubmit.length} hair QR previews are ready. Attach each QR to the matching hair plastic.`
          : 'Donation submitted. QR generated for this hair submission.',
        variant: 'success',
      });
      await loadModuleData();
      return true;
    } catch (_error) {
      setModuleFeedback({ message: 'Unable to submit donation right now. Please try again.', variant: 'error' });
      return false;
    } finally {
      setIsGeneratingQr(false);
    }
  }, [
    activeDonationQrItems,
    activeDonationQrPayload,
    loadModuleData,
    moduleData?.latestDetail,
    moduleData?.latestSubmission,
    profile?.user_id,
    selectedDonationDriveId,
    user?.id,
  ]);

  // â”€â”€ Parcel photo
  const handleSubmitDonationAndShowQr = React.useCallback(async () => {
    if (!activeDonationQrItems.length) {
      setModuleFeedback({ message: 'No saved hair donation details found yet.', variant: 'error' });
      return;
    }
    const success = await handleConfirmGenerateDonationQr();
    if (success) {
      setDonationModuleScreen(DONATION_MODULE_SCREEN.QR_CODES);
    }
  }, [activeDonationQrItems.length, handleConfirmGenerateDonationQr]);

  const handleDoneFromQrCodes = React.useCallback(async () => {
    await loadModuleData({ silent: true });
    setMyDonationsFilter('active');
    setDonationModuleScreen(DONATION_MODULE_SCREEN.MY_DONATIONS);
  }, [loadModuleData]);

  const handleViewDonationStatus = React.useCallback((item) => {
    setSelectedDonationStatusItem(item);
    setDonationModuleScreen(DONATION_MODULE_SCREEN.DONATION_STATUS);
  }, []);

  const handleConfirmCancelDonation = React.useCallback(async () => {
    const cancelItems = activeDonationQrItems.length
      ? activeDonationQrItems
      : (moduleData?.latestSubmission ? [{
          submission: moduleData.latestSubmission,
          detail: moduleData.latestDetail || null,
        }] : []);
    const openCancelItems = cancelItems.filter((item) => (
      item?.submission?.submission_id && !isClosedDonationStatus(item.submission.status)
    ));
    if (!openCancelItems.length) {
      setModuleFeedback({ message: 'No active donation record found.', variant: 'error' });
      setIsCancelModalOpen(false);
      return;
    }

    setIsCancellingDonation(true);
    const results = [];
    for (const item of openCancelItems) {
      results.push(await cancelDonorDonation({
        userId: user?.id || null,
        databaseUserId: profile?.user_id || null,
        submission: item.submission,
        detail: item.detail || null,
        reason: 'Cancelled by donor from donor donation module.',
      }));
    }
    setIsCancellingDonation(false);
    setIsCancelModalOpen(false);

    const failedResult = results.find((result) => !result.success);
    if (failedResult) {
      setModuleFeedback({ message: failedResult.error || 'Unable to cancel donation right now.', variant: 'error' });
      await loadModuleData();
      return;
    }

    setModuleData((current) => (
      current
        ? {
            ...current,
            activeSubmission: null,
            activeSubmissions: [],
            latestSubmission: null,
            latestDetail: null,
            hasOngoingDonation: false,
            independentQrState: null,
          }
        : current
    ));
    setModuleFeedback({
      message: openCancelItems.length > 1
        ? `${openCancelItems.length} donation submissions cancelled. You can start a new donation anytime.`
        : 'Donation cancelled. You can start a new donation anytime.',
      variant: 'success',
    });
    await loadModuleData();
  }, [activeDonationQrItems, loadModuleData, moduleData?.latestDetail, moduleData?.latestSubmission, profile?.user_id, user?.id]);

  // â”€â”€ Render
  const donationFlowContent = React.useMemo(() => {
    if (!isProfileComplete) {
      return (
        <ProfilePendingCard
          roles={roles}
          completionMeta={donorProfileMeta}
          onManageProfile={() => router.navigate('/profile')}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.EVENT_DETAILS) {
      return (
        <DonationEventDetailsScreen
          roles={roles}
          drive={selectedFlowDrive}
          onBack={() => setDonationModuleScreen(DONATION_MODULE_SCREEN.EVENTS)}
          onSubmit={handleSubmitSelectedEventDonation}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.SUMMARY) {
      return (
        <DonationHairSummaryScreen
          roles={roles}
          drive={selectedFlowDrive}
          latestScreening={latestScreening}
          isEligible={isAiEligible}
          ineligibilityReason={moduleData?.latestAiEligibility?.reason || ''}
          hairItems={donationPreviewItems}
          isSubmitting={isGeneratingQr}
          onBack={() => setDonationModuleScreen(DONATION_MODULE_SCREEN.EVENT_DETAILS)}
          onAddAnotherHair={handleOpenAddHairSource}
          onReferDonation={() => {
            setSelectedRecipient({ type: 'organization', patient: null });
            setDonationModuleScreen(DONATION_MODULE_SCREEN.RECIPIENT);
          }}
          onSubmitDonation={handleSubmitDonationAndShowQr}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.ADD_HAIR_SOURCE) {
      return (
        <AddAnotherHairSourceScreen
          roles={roles}
          onBack={() => setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY)}
          onUseHairLog={handleUseOwnHairLogForAdditional}
          onOtherPerson={() => setDonationModuleScreen(DONATION_MODULE_SCREEN.INPUT_METHOD)}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.INPUT_METHOD) {
      return (
        <InputMethodSelectionScreen
          roles={roles}
          onBack={() => setDonationModuleScreen(DONATION_MODULE_SCREEN.ADD_HAIR_SOURCE)}
          onUseScanner={handleUseOtherPersonScanner}
          onManualInput={handleUseOtherPersonManual}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.RECIPIENT) {
      return (
        <RecipientChoiceScreen
          roles={roles}
          drive={selectedFlowDrive}
          patients={recipientPatients}
          selectedRecipient={selectedRecipient}
          onBack={() => setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY)}
          onSelectDefault={() => setSelectedRecipient({ type: 'organization', patient: null })}
          onSelectPatient={(patient) => setSelectedRecipient({ type: 'patient', patient })}
          onConfirm={handleSubmitDonationAndShowQr}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.QR_CODES) {
      return (
        <DonationQrCodesScreen
          roles={roles}
          bundles={donationPreviewItems}
          feedback={qrActionFeedback}
          printingQrKey={printingQrKey}
          savingQrKey={savingQrKey}
          onBack={() => setDonationModuleScreen(DONATION_MODULE_SCREEN.SUMMARY)}
          onPrintQr={handlePrintQrFromScreen}
          onSaveQr={handleSaveQrFromScreen}
          onDone={handleDoneFromQrCodes}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.MY_DONATIONS) {
      return (
        <MyJoinedDonationsScreen
          roles={roles}
          donationItems={myDonationItems}
          activeFilter={myDonationsFilter}
          onChangeFilter={setMyDonationsFilter}
          onBack={() => {
            if (hasOngoingDonation) return;
            setDonationModuleScreen(DONATION_MODULE_SCREEN.EVENTS);
          }}
          onViewDonation={handleViewDonationStatus}
          onSubmitDriveDonation={handleOpenEventDetails}
          onCancelDonation={() => setIsCancelModalOpen(true)}
          hasOngoingDonation={hasOngoingDonation}
        />
      );
    }

    if (effectiveDonationModuleScreen === DONATION_MODULE_SCREEN.DONATION_STATUS) {
      return (
        <DonationTimelineStatusScreen
          roles={roles}
          item={selectedDonationTimelineItem}
          previewItems={selectedDonationTimelineItem?.previewItems?.length ? selectedDonationTimelineItem.previewItems : donationPreviewItems}
          timelineStages={moduleData?.timelineStages || []}
          timelineEvents={moduleData?.timelineEvents || []}
          certificate={certificate}
          accountDonorName={accountDonorName}
          onBack={() => setDonationModuleScreen(DONATION_MODULE_SCREEN.MY_DONATIONS)}
          onCancelDonation={() => setIsCancelModalOpen(true)}
        />
      );
    }

    return (
      <DonationJoinedEventsScreen
        roles={roles}
        joinedDrives={joinedDrives}
        onOpenDetails={handleOpenEventDetails}
        onFindOrganizations={() => router.navigate('/donor/organizations')}
      />
    );
  }, [
    displayDrive,
    effectiveDonationModuleScreen,
    donationPreviewItems,
    donorProfileMeta,
    selectedFlowDrive,
    accountDonorName,
    certificate,
    handleOpenAddHairSource,
    handleOpenEventDetails,
    handleDoneFromQrCodes,
    handlePrintQrFromScreen,
    handleSaveQrFromScreen,
    handleSubmitDonationAndShowQr,
    handleSubmitSelectedEventDonation,
    handleUseOtherPersonManual,
    handleUseOtherPersonScanner,
    handleUseOwnHairLogForAdditional,
    handleViewDonationStatus,
    hasOngoingDonation,
    isAiEligible,
    isGeneratingQr,
    isProfileComplete,
    joinedDrives,
    latestScreening,
    moduleData?.timelineEvents,
    moduleData?.timelineStages,
    moduleData?.latestAiEligibility?.reason,
    myDonationItems,
    myDonationsFilter,
    printingQrKey,
    qrActionFeedback,
    recipientPatients,
    roles,
    router,
    savingQrKey,
    selectedRecipient,
    selectedDonationTimelineItem,
  ]);

  return (
    <DashboardLayout
      showSupportChat
      navItems={donorDashboardNavItems}
      activeNavKey="donations"
      navVariant="donor"
      onNavPress={handleNavPress}
      screenVariant="default"
      header={(
        <DonorTopBar
          title="Donations"
          subtitle={hasOngoingDonation ? 'Donation in progress' : 'Manage your donation'}
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
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={theme.colors.brandPrimary} />
          <Text style={styles.loadingText}>Loading donationsâ€¦</Text>
        </View>
      ) : (
        <View style={styles.page}>
          {donationFlowContent}

          {/* â”€â”€ Profile gate */}
          {true ? null : !isHairFresh && !selectedDriveForDonation ? (
            /* â”€â”€ Hair eligibility gate */
            <HairEligibilityGateCard
              roles={roles}
              hasScreening={Boolean(latestScreening)}
              screeningLabel={screeningLabel}
              onCheckHair={() => router.navigate('/donor/donations')}
            />
          ) : (
            <>
              {/* â”€â”€ Active joined drive */}
              {/* â”€â”€ Donation paths (no ongoing donation) */}
              {!hasOngoingDonation && selectedDonationDriveId ? (
                <View style={styles.section}>
                  <SectionHeader
                    eyebrow="Hair to donate"
                    title="Add hair to donate"
                    roles={roles}
                  />

                  <ManualInputCard roles={roles} onOpen={handleOpenManualModal} />
                </View>
              ) : null}

              {/* â”€â”€ Active donation: QR + parcel photo */}
              {/* â”€â”€ Donation journey timeline */}
              {/* â”€â”€ Certificate */}
              {certificate ? (
                <CertificateCard
                  roles={roles}
                  certificate={certificate}
                  donorName={profile?.first_name || ''}
                />
              ) : null}

            </>
          )}

          {certificate ? (
            <CertificateCard
              roles={roles}
              certificate={certificate}
              donorName={profile?.first_name || ''}
            />
          ) : null}

          <View style={styles.historyRedirectOnly}>
            <AppButton
              title="View Donation History"
              variant="outline"
              fullWidth={false}
              onPress={() => router.navigate('/donor/donation-history')}
            />
          </View>
        </View>
      )}

      <ManualEntryModal
        visible={isManualModalOpen}
        form={manualForm}
        errors={manualFormErrors}
        photo={manualPhoto}
        feedback={manualFeedback}
        isSaving={isSavingManual}
        isEditing={Boolean(manualEditTarget)}
        aiPrefilled={Boolean(
          moduleData?.latestScreening
          && manualForm.lengthValue
          && manualForm.lengthValue !== MANUAL_FORM_DEFAULTS.lengthValue
        )}
        onClose={() => {
          setIsManualModalOpen(false);
          setManualEditTarget(null);
        }}
        onChangeField={updateManualField}
        onPickPhoto={handlePickManualPhoto}
        onSave={handleSaveManualDetails}
      />

      <DonationSubmitPreviewModal
        visible={isSubmitPreviewOpen}
        roles={roles}
        submission={moduleData?.latestSubmission || null}
        detail={moduleData?.latestDetail || null}
        qrPayload={activeDonationQrPayload}
        qrItems={activeDonationQrItems}
        accountDonorName={accountDonorName}
        isSubmitting={isGeneratingQr}
        isSubmitted={hasSubmittedDonationQr}
        onClose={() => {
          if (!isGeneratingQr) setIsSubmitPreviewOpen(false);
        }}
        onEditDetails={handleEditDonationDetails}
        onConfirm={handleConfirmGenerateDonationQr}
      />

      <AddBundleModal
        visible={isAddBundleModalOpen}
        bundleForm={bundleForm}
        bundleErrors={bundleErrors}
        bundlePhoto={bundlePhoto}
        bundleFeedback={bundleFeedback}
        isSaving={isSavingBundle}
        onClose={() => {
          if (!isSavingBundle) setIsAddBundleModalOpen(false);
        }}
        onChangeField={handleUpdateBundleField}
        onPickPhoto={handlePickBundlePhoto}
        onOpenScanner={() => {
          setIsAddBundleModalOpen(false);
          router.navigate('/donor/donations');
        }}
        onAttachLatestScan={handleAttachLatestScanForBundle}
        onSave={handleSaveAdditionalBundle}
      />

      <ModalShell
        visible={isCancelModalOpen}
        title="Cancel donation submission"
        subtitle={
          activeDonationQrItems.length > 1
            ? 'This action will mark all active hair donation submissions as cancelled.'
            : 'This action will mark your active hair donation submission as cancelled.'
        }
        onClose={() => {
          if (!isCancellingDonation) setIsCancelModalOpen(false);
        }}
        footer={(
          <View style={styles.rowActions}>
            <AppButton
              title="Keep donation"
              variant="outline"
              fullWidth={false}
              onPress={() => setIsCancelModalOpen(false)}
              disabled={isCancellingDonation}
            />
            <AppButton
              title={isCancellingDonation ? 'Cancellingâ€¦' : 'Yes, cancel'}
              variant="danger"
              fullWidth={false}
              onPress={handleConfirmCancelDonation}
              loading={isCancellingDonation}
              disabled={isCancellingDonation}
            />
          </View>
        )}
      >
        <Text style={styles.cancelModalText}>
          You can start a new donation after cancellation. This will close the current hair submission records, logistics, and tracking flow.
        </Text>
      </ModalShell>
    </DashboardLayout>
  );
}

// â”€â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const styles = StyleSheet.create({
  page: {
    gap: theme.spacing.xl,
  },
  flowScreen: {
    gap: theme.spacing.lg,
  },
  donationStepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  donationStepHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  donationStepTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.title,
    fontWeight: theme.typography.weights.bold,
    lineHeight: theme.typography.semantic.title * theme.typography.lineHeights.snug,
  },
  donationStepBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  stepBackButton: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowCardList: {
    gap: theme.spacing.md,
  },
  flowEventCard: {
    borderWidth: 1,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  flowIconCircle: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  flowEventCopy: {
    gap: theme.spacing.xs,
  },
  flowHost: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  flowEventTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.semibold,
  },
  flowMetaText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  flowEventButton: {
    alignSelf: 'stretch',
  },
  eventDetailsHero: {
    borderWidth: 1,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  eventDetailsIcon: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDetailsHost: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  eventDetailsTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.title,
    fontWeight: theme.typography.weights.bold,
  },
  eventDetailsMetaList: {
    gap: theme.spacing.sm,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  summarySectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
  },
  summaryMainText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  summaryStatusChip: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  summaryStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  summaryMetric: {
    width: '48%',
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(255,255,255,0.48)',
    padding: theme.spacing.md,
    gap: 3,
  },
  summaryMetricLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
  },
  summaryMetricValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  summaryHairRow: {
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  summaryActions: {
    gap: theme.spacing.sm,
  },
  inputMethodCard: {
    borderWidth: 1,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    position: 'relative',
    overflow: 'hidden',
    ...theme.shadows.soft,
  },
  inputMethodRecommended: {
    paddingTop: theme.spacing.xl,
  },
  inputMethodCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  inputMethodTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
  },
  recommendedBadge: {
    position: 'absolute',
    right: 0,
    top: 0,
    borderBottomLeftRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  recommendedBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  recipientDefaultCard: {
    borderWidth: 2,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  patientScroll: {
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  patientChoiceCard: {
    width: 210,
    minHeight: 152,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  patientAvatar: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientName: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  patientSelectText: {
    marginTop: 'auto',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  successBanner: {
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  successBannerText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  myDonationFilters: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  myDonationFilterChip: {
    borderWidth: 1,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  myDonationFilterText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  myDonationCard: {
    borderWidth: 1,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  myDonationCardTop: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  myDonationImage: {
    width: 78,
    height: 78,
    borderRadius: theme.radius.lg,
    flexShrink: 0,
  },
  myDonationImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  myDonationCardCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  myDonationTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  myDonationTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
  },
  myDonationStatusBadge: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    maxWidth: 136,
  },
  myDonationStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  myDonationInfoBox: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  myDonationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  myDonationCardActions: {
    gap: theme.spacing.sm,
  },
  timelineHero: {
    borderWidth: 1,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
    ...theme.shadows.soft,
  },
  timelineHeroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  timelineHeroCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.sm,
  },
  timelineHeroTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
  },
  timelineHeroChip: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  timelineHeroChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  timelineMetricGrid: {
    borderTopWidth: 1,
    paddingTop: theme.spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  timelineMetric: {
    flex: 1,
    minWidth: 120,
    gap: 3,
  },
  timelineSection: {
    gap: theme.spacing.lg,
  },
  timelineStageList: {
    gap: theme.spacing.md,
  },
  timelineStageRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing.md,
  },
  timelineMarkerColumn: {
    width: 28,
    alignItems: 'center',
  },
  timelineMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  timelineCurrentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timelineStageConnector: {
    flex: 1,
    width: 2,
    minHeight: 64,
    marginTop: 2,
  },
  timelineStageCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  timelineStageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  timelineStageTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  timelineStageDate: {
    maxWidth: 116,
    textAlign: 'right',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  timelineStageBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  timelineEventRow: {
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
  },
  section: {
    gap: theme.spacing.md,
  },
  flowRail: {
    borderWidth: 1,
    borderRadius: 22,
    padding: theme.spacing.md,
    gap: 0,
  },
  flowStep: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  flowStepMarkerWrap: {
    width: 28,
    alignItems: 'center',
    minHeight: 68,
  },
  flowStepMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  flowStepMarkerText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  flowConnector: {
    position: 'absolute',
    top: 28,
    bottom: 0,
    width: 2,
    borderRadius: theme.radius.full,
  },
  flowStepCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  flowStepLabel: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.snug,
  },
  flowStepState: {
    marginTop: 2,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  loadingBlock: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },

  // Section header
  sectionHeader: {
    gap: theme.spacing.xs,
  },
  sectionEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
  },
  sectionBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },

  // Card base
  card: {
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  donationHome: {
    gap: theme.spacing.xl,
  },
  eligibleBanner: {
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    overflow: 'hidden',
    ...theme.shadows.soft,
  },
  eligibleBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  eligibleBannerIcon: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eligibleBannerTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  eligibleStatsCard: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  eligibleStat: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  eligibleStatCenter: {
    alignItems: 'center',
  },
  eligibleStatEnd: {
    alignItems: 'flex-end',
  },
  eligibleStatLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.45,
  },
  eligibleStatValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  eligibleDivider: {
    width: 1,
    height: 36,
    marginHorizontal: theme.spacing.sm,
  },
  organizationScroll: {
    gap: theme.spacing.md,
    paddingBottom: 2,
  },
  organizationMiniCard: {
    width: 142,
    minHeight: 166,
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
    padding: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.xs,
    ...theme.shadows.soft,
  },
  organizationMiniLogo: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    marginBottom: theme.spacing.xs,
  },
  organizationMiniLogoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  organizationMiniName: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    textAlign: 'center',
    minHeight: 38,
  },
  organizationMiniStatus: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  findMoreCard: {
    width: 142,
    minHeight: 166,
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  findMoreIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findMoreText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    textAlign: 'center',
  },
  eventChipRow: {
    gap: theme.spacing.sm,
    paddingBottom: 2,
  },
  eventChip: {
    borderWidth: 1,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  eventChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  eventList: {
    gap: theme.spacing.md,
  },
  eventCard: {
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.soft,
  },
  eventImage: {
    width: '100%',
    height: 180,
  },
  eventImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventCopy: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  eventHost: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  eventTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
  },
  eventMetaGrid: {
    gap: theme.spacing.sm,
  },
  eventMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  eventMetaText: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  emptyDonationCard: {
    minHeight: 116,
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  emptyDonationText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    textAlign: 'center',
  },
  upcomingDonationCard: {
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  participatedEventList: {
    gap: theme.spacing.md,
  },
  upcomingDonationIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  upcomingDonationCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  upcomingDonationActions: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  activeDonationSummary: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  activeDonationSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  activeDonationSummaryActions: {
    gap: theme.spacing.sm,
  },
  upcomingActionButton: {
    maxWidth: 180,
  },
  upcomingDonationTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  upcomingDonationBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  upcomingStatusChip: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    flexShrink: 0,
  },
  upcomingStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },

  // Profile pending
  pendingList: {
    gap: 0,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: 64,
    borderBottomWidth: 1,
  },
  pendingIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
  },

  // Joined drive card
  driveCardTop: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  driveLogo: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.lg,
  },
  driveLogoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  driveMeta: {
    flex: 1,
    gap: 3,
  },
  driveTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
  },
  driveOrg: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  driveMeta2: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  driveRsvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  driveRsvpLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  rsvpBadge: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  rsvpBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'capitalize',
  },

  // Path cards (hair log + manual)
  pathCard: {
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceCard,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  pathCardPressable: {
    // keep padding/radius from pathCard
  },
  pathCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  pathIconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pathCardCopy: {
    flex: 1,
    gap: 4,
  },
  pathCardTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
  },
  pathCardBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  eligibilityBadge: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  eligibilityBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  hairLogGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  hairLogTile: {
    flex: 1,
    minWidth: 130,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    gap: 3,
  },
  hairLogTileLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hairLogTileValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  ineligibleNote: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },

  // Manual modal form
  manualSectionCard: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  manualSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  manualSectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  manualSectionCopy: {
    flex: 1,
    gap: 2,
  },
  manualSectionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  manualSectionBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  manualSectionContent: {
    gap: theme.spacing.sm,
  },
  donorIdentityFields: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  bundleScanActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    justifyContent: 'flex-end',
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  formRowFlex: {
    flex: 1,
    minWidth: 160,
  },
  formRowUnit: {
    flex: 1,
    minWidth: 140,
  },
  choiceField: {
    gap: theme.spacing.xs,
    flex: 1,
    minWidth: 0,
  },
  manualChoiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  choiceLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.label,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  choiceChipRow: {
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
  choiceChipDisabled: {
    opacity: 0.45,
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
  choiceChipTextDisabled: {
    color: theme.colors.textMuted,
  },
  choiceHelperText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight: theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
  },

  // Photo upload
  photoCard: {
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceCardMuted,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  photoCardTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  photoCardBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  photoPreview: {
    width: '100%',
    height: 228,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  photoPlaceholder: {
    minHeight: 168,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderSubtle,
    padding: theme.spacing.lg,
  },
  uploadIconBubble: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  photoPlaceholderText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    textAlign: 'center',
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  inputError: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textError,
    fontWeight: theme.typography.weights.medium,
  },

  // Parcel images
  parcelImagesWrap: {
    gap: theme.spacing.sm,
  },
  parcelImageThumb: {
    width: '100%',
    height: 180,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
  },
  parcelSubmittedNote: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },

  // QR shipping card
  qrCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  qrEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  qrTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    marginTop: 3,
  },
  qrStatusBadge: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
  },
  qrStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  qrImageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    minHeight: 220,
    gap: theme.spacing.sm,
  },
  qrImage: {
    width: 240,
    height: 240,
  },
  qrLoadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  qrMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  qrMetaTile: {
    flex: 1,
    minWidth: 110,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    gap: 3,
  },
  qrMetaLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  qrMetaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  qrNote: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },

  // Timeline
  timelineContainer: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    minHeight: 56,
  },
  timelineTrack: {
    width: 20,
    alignItems: 'center',
    flexShrink: 0,
  },
  timelineNode: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 4,
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    marginTop: 4,
    minHeight: 28,
  },
  timelineCopy: {
    flex: 1,
    paddingBottom: theme.spacing.md,
    gap: 3,
  },
  timelineLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
  },
  timelineMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },

  // Certificate
  certBadge: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
  },
  certBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  certTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.title,
    lineHeight: theme.typography.semantic.title * 1.16,
  },
  certBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
  },
  certMeta: {
    gap: 0,
  },
  certMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    gap: theme.spacing.sm,
  },
  certMetaLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  certMetaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    textAlign: 'right',
    flex: 1,
  },

  // History
  historyList: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    gap: 0,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    paddingVertical: theme.spacing.sm,
  },
  historyIcon: {
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
  historyCode: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  historyDate: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  historyBundles: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },

  // Bundle preview before final QR
  bundlePreviewPanel: {
    gap: theme.spacing.xs,
  },
  bundlePreviewTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  bundlePreviewBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    marginBottom: theme.spacing.xs,
  },
  bundlePreviewList: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.borderSubtle,
    overflow: 'hidden',
  },
  bundlePreviewRow: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  bundlePreviewRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  bundlePreviewRowTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  bundlePreviewSourceChip: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  bundlePreviewSourceText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  bundlePreviewMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  bundlePreviewMeta: {
    minWidth: '46%',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  previewQrCard: {
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  bundlePreviewQrCard: {
    marginTop: theme.spacing.sm,
  },
  previewQrPrintButton: {
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
  },
  previewQrActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  previewQrActionButton: {
    minWidth: 116,
  },
  previewQrTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  previewQrPayload: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight: theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
  },
  previewQrImage: {
    width: 180,
    height: 180,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
  },

  // Row actions
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    justifyContent: 'flex-start',
  },
  modalFooterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  modalFooterActionHalf: {
    flex: 1,
  },
  bannerSpacing: {
    marginBottom: theme.spacing.md,
  },
  cancelModalText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
    paddingTop: theme.spacing.xxl,
    paddingBottom: 0,
    backgroundColor: theme.colors.overlay,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    backgroundColor: theme.colors.backgroundPrimary,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    paddingTop: theme.spacing.md,
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    maxHeight: '94%',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  modalTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  modalSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  modalBody: {
    flexShrink: 1,
    minHeight: 0,
    paddingHorizontal: theme.spacing.md,
  },
  modalScroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  modalScrollContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  modalFooter: {
    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
});
