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
  startIndependentDonationDraft,
  addDonationBundleFromAnalysis,
  addDonationBundleFromManualDetails,
  ensureIndependentDonationQr,
  activateIndependentDonationQr,
  saveIndependentDonationParcelLog,
  cancelDonorDonation,
} from '../../features/donorDonations.service';
import { buildProfileCompletionMeta } from '../../features/profile/services/profile.service';
import { resolveThemeRoles, theme } from '../../design-system/theme';

// ─── Constants ───────────────────────────────────────────────────────────────

const MANUAL_FORM_DEFAULTS = {
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

const formatDateLabel = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const buildDonationDecisionText = ({ screening = null, isEligible = false, ineligibilityReason = '' }) => {
  if (isEligible) {
    return screening?.decision || 'Eligible for donation';
  }

  const reason = String(ineligibilityReason || '').trim();
  if (reason) return reason;

  return screening?.decision || 'Hair did not meet current donation requirements.';
};

const inferBundleSourceLabel = (detail = null) => {
  const notesText = String(detail?.detail_notes || '').toLowerCase();
  const conditionText = String(detail?.declared_condition || '').toLowerCase();
  const merged = `${notesText} ${conditionText}`;
  if (merged.includes('different donor hair')) return 'Different donor hair';
  if (merged.includes('own hair')) return 'Own hair';
  return 'Own hair';
};

const formatBundleLengthLabel = (lengthValue) => {
  const numeric = Number(lengthValue);
  if (!Number.isFinite(numeric) || numeric <= 0) return '-';
  const lengthCm = numeric * 2.54;
  return `${numeric.toFixed(1)} in (${lengthCm.toFixed(1)} cm)`;
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
          <Text style={[styles.hairLogTileValue, { color: roles.headingText }]} numberOfLines={3}>
            {decisionText || '—'}
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
          {decisionText}
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
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  return (
    <ModalShell
      visible={visible}
      title="Hair donation details"
      subtitle="Enter your own hair details, then upload one clear photo for review."
      onClose={onClose}
      scrollContent
      footer={(
        <View style={styles.modalFooterActions}>
          <View style={styles.modalFooterActionHalf}>
            <AppButton title="Cancel" variant="outline" onPress={onClose} />
          </View>
          <View style={styles.modalFooterActionHalf}>
            <AppButton title={isSaving ? 'Saving…' : 'Save & generate QR'} onPress={onSave} loading={isSaving} />
          </View>
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
        body="Upload one clear photo with your hair fully visible."
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
            <AppButton title={isSaving ? 'Saving…' : 'Save bundle'} onPress={onSave} loading={isSaving} disabled={isSaving} />
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

// ─── Shipping ID / QR card ────────────────────────────────────────────────────

function ShippingIdCard({ roles, qrPayload, qrState, submission, detail }) {
  const qrImageUrl = qrPayload ? buildQrImageUrl(qrPayload, 260) : '';
  const isActivated = Boolean(qrState?.is_activated);
  const submissionCode = submission?.submission_code || '';
  const bundleQty = Array.isArray(submission?.submission_details)
    ? submission.submission_details.length
    : '';
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

function BundlePreviewPanel({ roles, bundles = [] }) {
  if (!bundles.length) return null;

  return (
    <View style={styles.bundlePreviewPanel}>
      <Text style={[styles.bundlePreviewTitle, { color: roles.headingText }]}>Bundle preview before final QR</Text>
      <Text style={[styles.bundlePreviewBody, { color: roles.metaText }]}>
        Final QR will contain all bundle details listed below.
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
                Bundle {bundle.bundleNumber || index + 1}
              </Text>
              <View style={[styles.bundlePreviewSourceChip, { backgroundColor: roles.iconPrimarySurface }]}>
                <Text style={[styles.bundlePreviewSourceText, { color: roles.iconPrimaryColor }]}>{bundle.sourceLabel}</Text>
              </View>
            </View>
            <View style={styles.bundlePreviewMetaGrid}>
              <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Length: {bundle.lengthLabel}</Text>
              <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Condition: {bundle.condition || '-'}</Text>
              <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Color: {bundle.color || '-'}</Text>
              <Text style={[styles.bundlePreviewMeta, { color: roles.bodyText }]}>Density: {bundle.density || '-'}</Text>
            </View>
          </View>
        ))}
      </View>
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
  const [isAddBundleModalOpen, setIsAddBundleModalOpen] = React.useState(false);
  const [bundleForm, setBundleForm] = React.useState(ADDITIONAL_BUNDLE_DEFAULTS);
  const [bundleErrors, setBundleErrors] = React.useState({});
  const [bundlePhoto, setBundlePhoto] = React.useState(null);
  const [bundleFeedback, setBundleFeedback] = React.useState({ message: '', variant: 'info' });
  const [isSavingBundle, setIsSavingBundle] = React.useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = React.useState(false);
  const [isCancellingDonation, setIsCancellingDonation] = React.useState(false);

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
  const hasGeneratedDonationQr = Boolean(independentQrState?.reference);

  React.useEffect(() => {
    if (!hasGeneratedDonationQr) return;
    if (!moduleFeedback?.message) return;

    const normalizedMessage = String(moduleFeedback.message).toLowerCase();
    if (normalizedMessage.includes('qr was generated but could not be persisted')) {
      setModuleFeedback({ message: '', variant: 'info' });
    }
  }, [hasGeneratedDonationQr, moduleFeedback?.message]);

  const bundlePreviewItems = React.useMemo(() => {
    const details = Array.isArray(moduleData?.latestSubmission?.submission_details) && moduleData.latestSubmission.submission_details.length
      ? moduleData.latestSubmission.submission_details
      : moduleData?.latestDetail ? [moduleData.latestDetail] : [];

    return [...details]
      .sort((left, right) => {
        return new Date(left?.created_at || 0).getTime() - new Date(right?.created_at || 0).getTime();
      })
      .map((detail, index) => ({
        key: String(detail?.submission_detail_id || `bundle-${index}`),
        bundleNumber: index + 1,
        sourceLabel: inferBundleSourceLabel(detail),
        lengthLabel: formatBundleLengthLabel(detail?.declared_length),
        condition: detail?.declared_condition || '',
        color: detail?.declared_color || '',
        density: detail?.declared_density || '',
      }));
  }, [moduleData?.latestDetail, moduleData?.latestSubmission?.submission_details]);
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
      allDetails: moduleData?.latestSubmission?.submission_details || [],
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
      setModuleFeedback({
        message: moduleData?.latestAiEligibility?.reason || 'No eligible hair log found.',
        variant: 'error',
      });
      return;
    }
    setModuleFeedback({ message: 'Saving donation details…', variant: 'info' });
    setIsGeneratingQr(true);
    const draftResult = await startIndependentDonationDraft({
      userId: user?.id,
      submission: aiDonation.submission,
      databaseUserId: profile?.user_id || null,
    });
    setIsGeneratingQr(false);
    setModuleFeedback({
      message: draftResult.success
        ? 'Donation details saved. Add bundles if needed, then generate your QR as the final step.'
        : (draftResult.error || 'Could not save donation details right now.'),
      variant: draftResult.success ? 'success' : 'error',
    });
    await loadModuleData();
  }, [
    loadModuleData,
    moduleData?.latestAiDonation,
    moduleData?.latestAiEligibility?.reason,
    profile?.user_id,
    user?.id,
  ]);

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
    setManualFormErrors((prev) => ({ ...prev, [field]: '', photo: '' }));
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
        bundle_quantity: 1,
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
      setModuleFeedback({ message: 'Details saved. Starting your donation flow…', variant: 'info' });
      setIsGeneratingQr(true);
      const draftResult = await startIndependentDonationDraft({
        userId: user?.id,
        submission: result.submission,
        databaseUserId: profile?.user_id || null,
      });
      setIsGeneratingQr(false);
      setModuleFeedback({
        message: draftResult.success
          ? 'Donation details saved. Add bundles if needed, then generate your QR as the final step.'
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
  }, [
    loadModuleData,
    manualForm,
    manualPhoto,
    moduleData?.latestDonationRequirement,
    profile?.user_id,
    user?.id,
  ]);

  const handleOpenAddBundleModal = React.useCallback(() => {
    if (!moduleData?.latestSubmission?.submission_id) {
      setModuleFeedback({ message: 'No active donation record found.', variant: 'error' });
      return;
    }

    setBundleForm(ADDITIONAL_BUNDLE_DEFAULTS);
    setBundleErrors({});
    setBundlePhoto(null);
    setBundleFeedback({ message: '', variant: 'info' });
    setIsAddBundleModalOpen(true);
  }, [moduleData?.latestSubmission?.submission_id]);

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

  const handleAttachLatestScanForBundle = React.useCallback(async () => {
    const submission = moduleData?.latestSubmission;
    if (!submission?.submission_id) {
      setBundleFeedback({ message: 'No active donation record found.', variant: 'error' });
      return;
    }
    if (!moduleData?.latestScreening) {
      setBundleFeedback({ message: 'No recent scan was found. Open CheckHair and scan first.', variant: 'error' });
      return;
    }

    setIsSavingBundle(true);
    const result = await addDonationBundleFromAnalysis({
      userId: user?.id || null,
      databaseUserId: profile?.user_id || null,
      submission,
      screening: moduleData.latestScreening,
      referenceDetail: moduleData?.latestAnalysisEntry?.detail || moduleData?.latestDetail || null,
      donorType: bundleForm.donorType,
    });
    setIsSavingBundle(false);

    if (!result.success) {
      setBundleFeedback({ message: result.error || 'Could not attach scanned bundle right now.', variant: 'error' });
      return;
    }

    setIsAddBundleModalOpen(false);
    setModuleFeedback({ message: 'Additional scanned bundle added to this donation.', variant: 'success' });
    await loadModuleData();
  }, [
    bundleForm.donorType,
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
  }, [
    bundleForm.colored,
    bundleForm.density,
    bundleForm.donorType,
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

  const handleGenerateDonationQr = React.useCallback(async () => {
    const submission = moduleData?.latestSubmission;
    if (!submission?.submission_id) {
      setModuleFeedback({ message: 'No active donation record found.', variant: 'error' });
      return;
    }

    setModuleFeedback({ message: 'Generating your final donation QR…', variant: 'info' });
    setIsGeneratingQr(true);
    const qrResult = await ensureIndependentDonationQr({
      userId: user?.id,
      submission,
      databaseUserId: profile?.user_id || null,
    });
    setIsGeneratingQr(false);

    if (!qrResult.success) {
      setModuleFeedback({ message: qrResult.error || 'QR generation failed. Please try again.', variant: 'error' });
      return;
    }

    setModuleFeedback({
      message: 'Final QR generated. Attach it to your parcel, then submit parcel photo.',
      variant: 'success',
    });
    await loadModuleData();
  }, [loadModuleData, moduleData?.latestSubmission, profile?.user_id, user?.id]);

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

  const handleConfirmCancelDonation = React.useCallback(async () => {
    const submission = moduleData?.latestSubmission;
    if (!submission?.submission_id) {
      setModuleFeedback({ message: 'No active donation record found.', variant: 'error' });
      setIsCancelModalOpen(false);
      return;
    }

    setIsCancellingDonation(true);
    const result = await cancelDonorDonation({
      userId: user?.id || null,
      databaseUserId: profile?.user_id || null,
      submission,
      detail: moduleData?.latestDetail || null,
      reason: 'Cancelled by donor from donor donation module.',
    });
    setIsCancellingDonation(false);
    setIsCancelModalOpen(false);

    if (!result.success) {
      setModuleFeedback({ message: result.error || 'Unable to cancel donation right now.', variant: 'error' });
      return;
    }

    setModuleFeedback({ message: 'Donation cancelled. You can start a new donation anytime.', variant: 'success' });
    await loadModuleData();
  }, [loadModuleData, moduleData?.latestDetail, moduleData?.latestSubmission, profile?.user_id, user?.id]);

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
                      ineligibilityReason={moduleData?.latestAiEligibility?.reason || ''}
                      onProceed={handleProceedWithHairLog}
                      isLoading={isGeneratingQr}
                    />
                  ) : null}

                  <ManualInputCard roles={roles} onOpen={handleOpenManualModal} />
                </View>
              ) : null}

              {/* ── Active donation: QR + parcel photo */}
              {hasOngoingDonation && hasGeneratedDonationQr ? (
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

              {hasOngoingDonation && hasGeneratedDonationQr ? (
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

          <View style={[styles.card, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            <SectionHeader
              eyebrow="History"
              title="Donation history"
              body={(moduleData?.donationHistory?.length || 0) > 0
                ? `${moduleData.donationHistory.length} record${moduleData.donationHistory.length > 1 ? 's' : ''} saved.`
                : 'View your completed, cancelled, and closed donation records.'}
              roles={roles}
            />
            <AppButton
              title="View history module"
              variant="outline"
              fullWidth={false}
              onPress={() => router.navigate('/donor/donation-history')}
            />
          </View>

          {hasOngoingDonation ? (
            <View style={[styles.card, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
              <SectionHeader
                eyebrow="Last step"
                title="Finalize donation"
                body={hasGeneratedDonationQr
                  ? 'Your final QR is ready. Attach it to your parcel and continue shipment steps.'
                  : 'Add all needed bundles first. Generate QR only when bundle details are final.'}
                roles={roles}
              />
              {!hasGeneratedDonationQr ? (
                <BundlePreviewPanel roles={roles} bundles={bundlePreviewItems} />
              ) : null}
              <View style={styles.rowActions}>
                {!hasGeneratedDonationQr ? (
                  <AppButton
                    title="Add bundle"
                    variant="outline"
                    fullWidth={false}
                    onPress={handleOpenAddBundleModal}
                  />
                ) : null}
                {!hasGeneratedDonationQr ? (
                  <AppButton
                    title={isGeneratingQr ? 'Generating QR…' : 'Generate final QR'}
                    fullWidth={false}
                    onPress={handleGenerateDonationQr}
                    loading={isGeneratingQr}
                    disabled={isGeneratingQr || bundlePreviewItems.length === 0}
                  />
                ) : null}
                <AppButton
                  title="Cancel donation"
                  variant="danger"
                  fullWidth={false}
                  onPress={() => setIsCancelModalOpen(true)}
                />
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
        title="Cancel donation"
        subtitle="This action will mark your active donation as cancelled."
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
              title={isCancellingDonation ? 'Cancelling…' : 'Yes, cancel'}
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
          You can start a new donation after cancellation. This will close your current shipment flow and timeline.
        </Text>
      </ModalShell>
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
