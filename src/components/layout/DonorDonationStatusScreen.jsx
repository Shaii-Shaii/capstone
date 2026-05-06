import React from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
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
import {
  buildDonationTrackingQrPayload,
  buildQrImageUrl,
  getDonorDonationsModuleData,
  saveManualDonationQualification,
  ensureIndependentDonationQr,
  activateIndependentDonationQr,
  saveIndependentDonationParcelLog,
} from '../../features/donorDonations.service';
import { buildProfileCompletionMeta } from '../../features/profile/services/profile.service';
import { resolveThemeRoles, theme } from '../../design-system/theme';

// ─── Constants ───────────────────────────────────────────────────────────────

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

const formatDateLabel = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// ─── Shared UI primitives ─────────────────────────────────────────────────────

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
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
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
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange?.(opt.value)}
              style={[styles.choiceChip, active ? styles.choiceChipActive : null]}
            >
              <Text style={[styles.choiceChipText, active ? styles.choiceChipTextActive : null]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Profile pending ──────────────────────────────────────────────────────────

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

// ─── Hair eligibility gate ────────────────────────────────────────────────────

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

// ─── Active joined drive ──────────────────────────────────────────────────────

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
              {formatDateLabel(drive.start_date)}{drive.end_date ? ` – ${formatDateLabel(drive.end_date)}` : ''}
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

// ─── Hair log card (AI path) ──────────────────────────────────────────────────

function HairLogCard({ roles, screening, isEligible, screeningLabel, onProceed, isLoading }) {
  const lengthCm = Number(screening?.estimated_length);
  const lengthIn = lengthCm > 0 ? (lengthCm / 2.54).toFixed(1) : null;

  return (
    <View style={[styles.pathCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      <View style={styles.pathCardTop}>
        <View style={[styles.pathIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
          <AppIcon name="checkHair" color={roles.iconPrimaryColor} />
        </View>
        <View style={styles.pathCardCopy}>
          <Text style={[styles.pathCardTitle, { color: roles.headingText }]}>Use recent hair log</Text>
          <Text style={[styles.pathCardBody, { color: roles.bodyText }]}>
            Donate using your last hair analysis result — no extra input needed.
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
            {lengthIn ? `${lengthIn} in` : '—'}
          </Text>
        </View>
        <View style={[styles.hairLogTile, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.hairLogTileLabel, { color: roles.metaText }]}>Condition</Text>
          <Text style={[styles.hairLogTileValue, { color: roles.headingText }]}>
            {screening?.detected_condition || '—'}
          </Text>
        </View>
        <View style={[styles.hairLogTile, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.hairLogTileLabel, { color: roles.metaText }]}>Decision</Text>
          <Text style={[styles.hairLogTileValue, { color: roles.headingText }]}>
            {screening?.decision || '—'}
          </Text>
        </View>
        <View style={[styles.hairLogTile, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.hairLogTileLabel, { color: roles.metaText }]}>Analyzed</Text>
          <Text style={[styles.hairLogTileValue, { color: roles.headingText }]}>
            {screeningLabel || '—'}
          </Text>
        </View>
      </View>

      {isEligible ? (
        <AppButton
          title={isLoading ? 'Generating QR…' : 'Donate with this hair log'}
          onPress={onProceed}
          loading={isLoading}
          fullWidth
        />
      ) : (
        <Text style={[styles.ineligibleNote, { color: roles.metaText }]}>
          Your hair does not meet the current donation requirements. You may still submit manually.
        </Text>
      )}
    </View>
  );
}

// ─── Manual input path card ───────────────────────────────────────────────────

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
            Input your hair length, bundles, and condition yourself and upload a photo.
          </Text>
        </View>
        <AppIcon name="chevronRight" size="sm" color={roles.metaText} />
      </View>
    </Pressable>
  );
}

// ─── Manual entry modal ───────────────────────────────────────────────────────

function ManualEntryModal({
  visible, form, errors, photo, feedback, isSaving, aiPrefilled,
  onClose, onChangeField, onPickPhoto, onSave,
}) {
  return (
    <ModalShell
      visible={visible}
      title="Hair donation details"
      subtitle="Fill in your hair details and attach a photo."
      onClose={onClose}
      scrollContent
      footer={(
        <View style={styles.rowActions}>
          <AppButton title="Cancel" variant="outline" fullWidth={false} onPress={onClose} />
          <AppButton title={isSaving ? 'Saving…' : 'Save & generate QR'} fullWidth={false} onPress={onSave} loading={isSaving} />
        </View>
      )}
    >
      {aiPrefilled ? (
        <StatusBanner
          message="Hair length pre-filled from your recent AI screening. Adjust if needed."
          variant="info"
          style={styles.bannerSpacing}
        />
      ) : null}
      {feedback?.message ? (
        <StatusBanner message={feedback.message} variant={feedback.variant} style={styles.bannerSpacing} />
      ) : null}

      <View style={styles.formRow}>
        <View style={styles.formRowFlex}>
          <AppInput
            label="Hair length"
            required
            value={form.lengthValue}
            onChangeText={(v) => onChangeField('lengthValue', v.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="14"
            error={errors.lengthValue}
            helperText="Min 14 inches"
          />
        </View>
        <View style={styles.formRowUnit}>
          <ChoiceField
            label="Unit"
            value={form.lengthUnit}
            options={LENGTH_UNIT_OPTIONS}
            onChange={(v) => onChangeField('lengthUnit', v)}
          />
        </View>
      </View>

      <AppInput
        label="Number of bundles"
        required
        value={form.bundleQuantity}
        onChangeText={(v) => onChangeField('bundleQuantity', v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        placeholder="1"
        error={errors.bundleQuantity}
      />

      <ChoiceField label="Treated" value={form.treated} options={YES_NO_OPTIONS} onChange={(v) => onChangeField('treated', v)} />
      <ChoiceField label="Colored" value={form.colored} options={YES_NO_OPTIONS} onChange={(v) => onChangeField('colored', v)} />
      <ChoiceField label="Trimmed" value={form.trimmed} options={YES_NO_OPTIONS} onChange={(v) => onChangeField('trimmed', v)} />
      <ChoiceField label="Hair color" value={form.hairColor} options={HAIR_COLOR_OPTIONS} onChange={(v) => onChangeField('hairColor', v)} />
      <ChoiceField label="Density" value={form.density} options={MANUAL_DENSITY_OPTIONS} onChange={(v) => onChangeField('density', v)} />

      <View style={styles.photoCard}>
        <Text style={styles.photoCardTitle}>Hair photo</Text>
        <Text style={styles.photoCardBody}>Upload a clear photo of your hair for the donation record.</Text>
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
      </View>
    </ModalShell>
  );
}

// ─── Shipping ID / QR card ────────────────────────────────────────────────────

function ShippingIdCard({ roles, qrPayload, qrState, submission, detail }) {
  const qrImageUrl = qrPayload ? buildQrImageUrl(qrPayload, 260) : '';
  const isActivated = Boolean(qrState?.is_activated);
  const submissionCode = submission?.submission_code || '';
  const bundleQty = detail?.bundle_number || submission?.bundle_quantity || '';
  const declaredLength = detail?.declared_length ?? null;

  return (
    <View style={[styles.card, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      <View style={styles.qrCardHeader}>
        <View>
          <Text style={[styles.qrEyebrow, { color: roles.primaryActionBackground }]}>Your Shipping ID</Text>
          <Text style={[styles.qrTitle, { color: roles.headingText }]}>Ready for shipment</Text>
        </View>
        <View style={[styles.qrStatusBadge, {
          backgroundColor: isActivated ? roles.primaryActionBackground : roles.supportCardBackground,
        }]}>
          <Text style={[styles.qrStatusText, {
            color: isActivated ? roles.primaryActionText : roles.bodyText,
          }]}>
            {isActivated ? 'QR Active' : 'Pending Scan'}
          </Text>
        </View>
      </View>

      {qrImageUrl ? (
        <View style={[styles.qrImageWrap, { backgroundColor: roles.supportCardBackground }]}>
          <Image source={{ uri: qrImageUrl }} style={styles.qrImage} resizeMode="contain" />
        </View>
      ) : (
        <View style={[styles.qrImageWrap, { backgroundColor: roles.supportCardBackground }]}>
          <ActivityIndicator color={roles.primaryActionBackground} />
          <Text style={[styles.qrLoadingText, { color: roles.metaText }]}>Building QR…</Text>
        </View>
      )}

      <View style={styles.qrMetaRow}>
        {submissionCode ? (
          <View style={[styles.qrMetaTile, { backgroundColor: roles.supportCardBackground }]}>
            <Text style={[styles.qrMetaLabel, { color: roles.metaText }]}>Submission code</Text>
            <Text style={[styles.qrMetaValue, { color: roles.headingText }]} numberOfLines={1}>{submissionCode}</Text>
          </View>
        ) : null}
        {bundleQty ? (
          <View style={[styles.qrMetaTile, { backgroundColor: roles.supportCardBackground }]}>
            <Text style={[styles.qrMetaLabel, { color: roles.metaText }]}>Bundles</Text>
            <Text style={[styles.qrMetaValue, { color: roles.headingText }]}>{bundleQty}</Text>
          </View>
        ) : null}
        {declaredLength != null ? (
          <View style={[styles.qrMetaTile, { backgroundColor: roles.supportCardBackground }]}>
            <Text style={[styles.qrMetaLabel, { color: roles.metaText }]}>Hair length</Text>
            <Text style={[styles.qrMetaValue, { color: roles.headingText }]}>{declaredLength} in</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.qrNote, { color: roles.bodyText }]}>
        Print or display this QR and attach it to your hair donation package. Staff will scan it upon receipt to confirm your donation.
      </Text>
    </View>
  );
}

// ─── Parcel photo section ─────────────────────────────────────────────────────

function ParcelPhotoSection({
  roles, parcelImages, photo, feedback, isSaving,
  onPickPhoto, onSave,
}) {
  return (
    <View style={[styles.card, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      <SectionHeader
        eyebrow="Step 2"
        title="Submit parcel photo"
        body="Take or upload a photo showing your packaged hair with the QR attached before shipping."
        roles={roles}
      />

      {feedback?.message ? (
        <StatusBanner message={feedback.message} variant={feedback.variant} style={styles.bannerSpacing} />
      ) : null}

      {parcelImages?.length > 0 ? (
        <View style={styles.parcelImagesWrap}>
          {parcelImages.map((img, i) => (
            <Image
              key={img.image_id || i}
              source={{ uri: img.signedUrl || img.file_path }}
              style={styles.parcelImageThumb}
              resizeMode="cover"
            />
          ))}
          <Text style={[styles.parcelSubmittedNote, { color: roles.bodyText }]}>
            {parcelImages.length === 1 ? '1 parcel photo submitted.' : `${parcelImages.length} parcel photos submitted.`}
          </Text>
        </View>
      ) : null}

      <View style={styles.photoCard}>
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
      </View>

      <AppButton
        title={isSaving ? 'Submitting…' : 'Submit parcel photo'}
        onPress={onSave}
        loading={isSaving}
        disabled={!photo}
        fullWidth
      />
    </View>
  );
}

// ─── Donation journey timeline ────────────────────────────────────────────────

function DonationJourneyTimeline({ roles, stages }) {
  if (!stages?.length) return null;
  return (
    <View style={styles.timelineContainer}>
      {stages.map((stage, index) => {
        const isCompleted = stage.state === 'completed';
        const isCurrent = stage.state === 'current';
        const isUpcoming = stage.state === 'upcoming';
        return (
          <View key={stage.key} style={styles.timelineRow}>
            <View style={styles.timelineTrack}>
              <View style={[
                styles.timelineNode,
                isCompleted
                  ? { backgroundColor: roles.primaryActionBackground }
                  : isCurrent
                    ? { backgroundColor: roles.defaultCardBackground, borderColor: roles.primaryActionBackground, borderWidth: 2 }
                    : { backgroundColor: roles.defaultCardBorder },
              ]} />
              {index < stages.length - 1 ? (
                <View style={[
                  styles.timelineConnector,
                  isCompleted ? { backgroundColor: roles.primaryActionBackground } : { backgroundColor: roles.defaultCardBorder },
                ]} />
              ) : null}
            </View>
            <View style={styles.timelineCopy}>
              <Text style={[
                styles.timelineLabel,
                { color: isUpcoming ? roles.metaText : roles.headingText },
                isCurrent ? { fontWeight: '600' } : null,
              ]}>{stage.label}</Text>
              {stage.timestampLabel && !isUpcoming ? (
                <Text style={[styles.timelineMeta, { color: roles.metaText }]}>{stage.timestampLabel}</Text>
              ) : null}
              {isCurrent ? (
                <Text style={[styles.timelineMeta, { color: roles.primaryActionBackground }]}>In progress</Text>
              ) : null}
            </View>
            {isCompleted ? (
              <AppIcon name="success" size="sm" color={roles.primaryActionBackground} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// ─── Certificate card ─────────────────────────────────────────────────────────

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

// ─── Donation history row ─────────────────────────────────────────────────────

function HistoryRow({ item }) {
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyIcon}>
        <AppIcon name="donations" size="sm" state="active" />
      </View>
      <View style={styles.historyCopy}>
        <Text style={styles.historyCode} numberOfLines={1}>{item?.submission_code || 'Donation record'}</Text>
        <Text style={styles.historyDate} numberOfLines={1}>{item?.date_label || 'Date unavailable'}</Text>
      </View>
      <Text style={styles.historyBundles}>
        {item?.bundle_quantity ? `${item.bundle_quantity} bundle${item.bundle_quantity === 1 ? '' : 's'}` : '—'}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function DonorDonationStatusScreen() {
  const router = useRouter();
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

  // ── Module data
  const [moduleData, setModuleData] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [screenError, setScreenError] = React.useState('');
  const [moduleFeedback, setModuleFeedback] = React.useState({ message: '', variant: 'info' });

  // ── Manual form
  const [isManualModalOpen, setIsManualModalOpen] = React.useState(false);
  const [manualForm, setManualForm] = React.useState(MANUAL_FORM_DEFAULTS);
  const [manualFormErrors, setManualFormErrors] = React.useState({});
  const [manualPhoto, setManualPhoto] = React.useState(null);
  const [manualFeedback, setManualFeedback] = React.useState({ message: '', variant: 'info' });
  const [isSavingManual, setIsSavingManual] = React.useState(false);
  const [isGeneratingQr, setIsGeneratingQr] = React.useState(false);

  // ── Parcel photo
  const [parcelPhoto, setParcelPhoto] = React.useState(null);
  const [parcelFeedback, setParcelFeedback] = React.useState({ message: '', variant: 'info' });
  const [isSavingParcel, setIsSavingParcel] = React.useState(false);

  const avatarInitials = `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.trim();

  // ── Load module data
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
    if (result.error) setScreenError(result.error);
  }, [profile?.user_id, user?.id]);

  React.useEffect(() => { loadModuleData(); }, [loadModuleData]);

  // ── Derived state
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
  const independentQrState = moduleData?.independentQrState || null;
  const timelineStages = moduleData?.timelineStages || [];
  const certificate = moduleData?.certificate || null;
  const parcelImages = moduleData?.parcelImages || [];

  // Joined drives: drives the user has already registered for
  const joinedDrives = React.useMemo(() => (
    (moduleData?.drives || []).filter((d) => Boolean(d?.registration))
  ), [moduleData?.drives]);

  // Active drive from submission
  const activeDriveFromSubmission = moduleData?.activeDrive || null;
  const displayDrive = activeDriveFromSubmission || joinedDrives[0] || null;

  // QR payload for the active independent donation
  const activeDonationQrPayload = React.useMemo(() => {
    if (!moduleData?.latestSubmission) return '';
    // Don't wait for independentQrState?.reference - generate QR immediately
    return buildDonationTrackingQrPayload({
      submission: moduleData.latestSubmission,
      detail: moduleData.latestDetail || null,
      logistics: moduleData.logistics || null,
      trackingStatus: moduleData.latestSubmission?.status || '',
    });
  }, [moduleData?.latestSubmission, moduleData?.latestDetail, moduleData?.logistics]);

  const handleNavPress = React.useCallback((item) => {
    if (!item.route || item.route === '/donor/status') return;
    router.navigate(item.route);
  }, [router]);

  // ── AI log path
  const handleProceedWithHairLog = React.useCallback(async () => {
    const aiDonation = moduleData?.latestAiDonation;
    if (!aiDonation?.submission) {
      setModuleFeedback({ message: 'No eligible hair log found.', variant: 'error' });
      return;
    }
    setModuleFeedback({ message: 'Generating your donation QR…', variant: 'info' });
    setIsGeneratingQr(true);
    const qrResult = await ensureIndependentDonationQr({
      userId: user?.id,
      submission: aiDonation.submission,
      databaseUserId: profile?.user_id || null,
    });
    setIsGeneratingQr(false);
    setModuleFeedback({
      message: qrResult.success
        ? 'Donation QR ready. Attach it to your hair package before shipping.'
        : (qrResult.error || 'QR generation failed. Please try again.'),
      variant: qrResult.success ? 'success' : 'error',
    });
    await loadModuleData();
  }, [loadModuleData, moduleData?.latestAiDonation, profile?.user_id, user?.id]);

  // ── Manual path
  const handleOpenManualModal = React.useCallback(() => {
    if (!isProfileComplete) { router.navigate('/profile'); return; }
    if (!isHairFresh) { router.navigate('/donor/donations'); return; }
    if (hasOngoingDonation) {
      setModuleFeedback({ message: 'You have an ongoing donation in progress.', variant: 'info' });
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
    setManualFeedback({ message: '', variant: 'info' });
    setIsManualModalOpen(true);
  }, [hasOngoingDonation, isHairFresh, isProfileComplete, moduleData?.latestScreening, router]);

  const updateManualField = React.useCallback((field, value) => {
    setManualForm((prev) => ({ ...prev, [field]: value }));
    setManualFormErrors((prev) => ({ ...prev, [field]: '' }));
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
    const numericBundleQty = Number.parseInt(manualForm.bundleQuantity, 10);
    if (!Number.isFinite(numericLength) || numericLength <= 0) {
      nextErrors.lengthValue = 'Enter a valid hair length.';
    }
    if (!Number.isInteger(numericBundleQty) || numericBundleQty <= 0) {
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
        bundle_quantity: numericBundleQty,
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
      setManualFeedback({ message: result.error || 'Could not save details. Please try again.', variant: 'error' });
      return;
    }

    setIsManualModalOpen(false);

    if (result.canProceed && result.submission) {
      setModuleFeedback({ message: 'Details saved. Generating your donation QR…', variant: 'info' });
      setIsGeneratingQr(true);
      const qrResult = await ensureIndependentDonationQr({
        userId: user?.id,
        submission: result.submission,
        databaseUserId: profile?.user_id || null,
      });
      setIsGeneratingQr(false);
      setModuleFeedback({
        message: qrResult.success
          ? 'Donation QR ready. Attach it to your hair package before shipping.'
          : (qrResult.error || 'Details saved but QR generation failed.'),
        variant: qrResult.success ? 'success' : 'error',
      });
    } else {
      setModuleFeedback({
        message: result.qualification?.reason || 'Details saved but do not meet donation requirements yet.',
        variant: 'info',
      });
    }

    await loadModuleData();
  }, [loadModuleData, manualForm, manualPhoto, moduleData?.latestDonationRequirement, profile?.user_id, user?.id]);

  // ── Parcel photo
  const handlePickParcelPhoto = React.useCallback(async (mode = 'library') => {
    const picker = mode === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await picker({ mediaTypes: ['images'], allowsEditing: true, quality: 0.72, base64: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setParcelPhoto({ uri: asset.uri, base64: asset.base64 || '', mimeType: asset.mimeType || 'image/jpeg', fileName: asset.fileName || '' });
    setParcelFeedback({ message: '', variant: 'info' });
  }, []);

  const handleSaveParcelPhoto = React.useCallback(async () => {
    const submission = moduleData?.latestSubmission;
    const detail = moduleData?.latestDetail;
    if (!submission || !detail) {
      setParcelFeedback({ message: 'No active donation record found.', variant: 'error' });
      return;
    }
    if (!parcelPhoto) {
      setParcelFeedback({ message: 'Please select a photo first.', variant: 'error' });
      return;
    }

    setIsSavingParcel(true);

    // Ensure QR metadata exists (sync) and activate if not yet activated so parcel log can proceed
    let qrState = independentQrState;
    // If there is no persisted QR metadata, ensure it now (synchronous)
    if (!qrState?.reference) {
      const ensureRes = await ensureIndependentDonationQr({
        userId: user?.id,
        submission,
        databaseUserId: profile?.user_id || null,
      });
      if (!ensureRes.success) {
        setIsSavingParcel(false);
        setParcelFeedback({ message: ensureRes.error || 'Could not prepare the donation QR.', variant: 'error' });
        return;
      }
      // refresh module data to pick up persisted QR state
      await loadModuleData();
      qrState = ensureRes.qrState || null;
    }

    if (!qrState?.is_activated) {
      const activateResult = await activateIndependentDonationQr({
        userId: user?.id,
        submission,
        databaseUserId: profile?.user_id || null,
      });
      if (!activateResult.success) {
        setIsSavingParcel(false);
        setParcelFeedback({ message: activateResult.error || 'Could not activate the donation QR.', variant: 'error' });
        return;
      }
      qrState = activateResult.qrState;
    }

    const result = await saveIndependentDonationParcelLog({
      userId: user?.id,
      databaseUserId: profile?.user_id || null,
      submission,
      detail,
      photo: parcelPhoto,
      qrPayloadText: activeDonationQrPayload,
      qrState,
    });
    setIsSavingParcel(false);

    if (!result.success) {
      setParcelFeedback({ message: result.error || 'Could not save parcel photo. Please try again.', variant: 'error' });
      return;
    }

    setParcelPhoto(null);
    setParcelFeedback({ message: 'Parcel photo submitted. Your donation is ready for shipment!', variant: 'success' });
    await loadModuleData();
  }, [activeDonationQrPayload, independentQrState, loadModuleData, moduleData?.latestDetail, moduleData?.latestSubmission, parcelPhoto, profile?.user_id, user?.id]);

  // ── Render
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
          <Text style={styles.loadingText}>Loading donations…</Text>
        </View>
      ) : (
        <View style={styles.page}>

          {/* ── Profile gate */}
          {!isProfileComplete ? (
            <ProfilePendingCard
              roles={roles}
              completionMeta={donorProfileMeta}
              onManageProfile={() => router.navigate('/profile')}
            />
          ) : !isHairFresh ? (
            /* ── Hair eligibility gate */
            <HairEligibilityGateCard
              roles={roles}
              hasScreening={Boolean(latestScreening)}
              screeningLabel={screeningLabel}
              onCheckHair={() => router.navigate('/donor/donations')}
            />
          ) : (
            <>
              {/* ── Active joined drive */}
              {displayDrive ? (
                <View style={styles.section}>
                  <SectionHeader
                    eyebrow="Your donation drive"
                    title={displayDrive.event_title || 'Donation drive'}
                    roles={roles}
                  />
                  <JoinedDriveCard roles={roles} drive={displayDrive} />
                </View>
              ) : null}

              {/* ── Donation paths (no ongoing donation) */}
              {!hasOngoingDonation ? (
                <View style={styles.section}>
                  <SectionHeader
                    eyebrow="Donate your hair"
                    title="Choose how to donate"
                    body="Use your recent hair analysis or enter your details manually."
                    roles={roles}
                  />

                  {latestScreening ? (
                    <HairLogCard
                      roles={roles}
                      screening={latestScreening}
                      isEligible={isAiEligible}
                      screeningLabel={screeningLabel}
                      onProceed={handleProceedWithHairLog}
                      isLoading={isGeneratingQr}
                    />
                  ) : null}

                  <ManualInputCard roles={roles} onOpen={handleOpenManualModal} />
                </View>
              ) : null}

              {/* ── Active donation: QR + parcel photo */}
              {hasOngoingDonation ? (
                <View style={styles.section}>
                  <SectionHeader
                    eyebrow="Step 1"
                    title="Attach QR to your package"
                    body="Print or display this QR code and attach it to your hair donation parcel."
                    roles={roles}
                  />
                  <ShippingIdCard
                    roles={roles}
                    qrPayload={activeDonationQrPayload}
                    qrState={independentQrState}
                    submission={moduleData?.latestSubmission}
                    detail={moduleData?.latestDetail}
                  />
                </View>
              ) : null}

              {hasOngoingDonation ? (
                <ParcelPhotoSection
                  roles={roles}
                  parcelImages={parcelImages}
                  photo={parcelPhoto}
                  feedback={parcelFeedback}
                  isSaving={isSavingParcel}
                  onPickPhoto={handlePickParcelPhoto}
                  onSave={handleSaveParcelPhoto}
                />
              ) : null}

              {/* ── Donation journey timeline */}
              {timelineStages.length > 0 ? (
                <View style={[styles.card, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
                  <SectionHeader
                    eyebrow="Donation journey"
                    title="Track your package"
                    body="Follow your donation from shipment to delivery."
                    roles={roles}
                  />
                  <DonationJourneyTimeline roles={roles} stages={timelineStages} />
                </View>
              ) : null}

              {/* ── Certificate */}
              {certificate ? (
                <CertificateCard
                  roles={roles}
                  certificate={certificate}
                  donorName={profile?.first_name || ''}
                />
              ) : null}
            </>
          )}

          {/* ── Completed donation history */}
          {moduleData?.completedDonationHistory?.length ? (
            <View style={styles.section}>
              <SectionHeader eyebrow="History" title="Completed donations" roles={roles} />
              <View style={styles.historyList}>
                {moduleData.completedDonationHistory.map((item) => (
                  <HistoryRow key={item.submission_id} item={item} />
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
        aiPrefilled={Boolean(
          moduleData?.latestScreening
          && manualForm.lengthValue
          && manualForm.lengthValue !== MANUAL_FORM_DEFAULTS.lengthValue
        )}
        onClose={() => setIsManualModalOpen(false)}
        onChangeField={updateManualField}
        onPickPhoto={handlePickManualPhoto}
        onSave={handleSaveManualDetails}
      />
    </DashboardLayout>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    gap: theme.spacing.xl,
  },
  section: {
    gap: theme.spacing.md,
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
    gap: theme.spacing.md,
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
    backgroundColor: theme.colors.surfaceElevated,
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
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
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
    marginBottom: theme.spacing.md,
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
  choiceChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  choiceChipTextActive: {
    color: theme.colors.brandPrimary,
    fontWeight: theme.typography.weights.semibold,
  },

  // Photo upload
  photoCard: {
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
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
    height: 220,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  photoPlaceholder: {
    minHeight: 130,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  photoPlaceholderText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
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

  // Row actions
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    justifyContent: 'flex-end',
  },
  bannerSpacing: {
    marginBottom: theme.spacing.md,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xxl,
    backgroundColor: theme.colors.overlay,
  },
  modalCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.lg,
    width: '100%',
    maxWidth: 420,
    maxHeight: '86%',
    alignSelf: 'center',
    overflow: 'hidden',
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
  modalSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  modalBody: {
    flexShrink: 1,
    minHeight: 0,
  },
  modalScroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  modalScrollContent: {
    paddingBottom: theme.spacing.md,
  },
  modalFooter: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
});
