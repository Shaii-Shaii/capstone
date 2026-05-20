import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Print from 'expo-print';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import {
  ensureCertificatesForScannedEventDonations,
  fetchDonationCertificatesByUserId,
  fetchDonorPatientImpactByBundleIds,
  fetchHairSubmissionsByUserId,
} from '../../src/features/hairSubmission.api';
import { fetchOrganizationPreview } from '../../src/features/donorHome.api';
import {
  buildDonorCertificateHtml,
  buildDonorCertificateModel,
  buildDonorFullName,
  generateDonorCertificatePdf,
  isCertificateSharingSupported,
  shareDonorCertificatePdf,
} from '../../src/features/donorCertificate.service';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';
import { useAuth } from '../../src/providers/AuthProvider';

const withOpacity = (color, opacity) => {
  if (!color || typeof color !== 'string') return color;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    const raw = color.slice(1);
    const expanded = raw.length === 3
      ? raw.split('').map((part) => part + part).join('')
      : raw;
    const red = parseInt(expanded.slice(0, 2), 16);
    const green = parseInt(expanded.slice(2, 4), 16);
    const blue = parseInt(expanded.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`);
  }
  return color;
};

const buildCertificateColors = (resolvedTheme) => {
  const roles = resolveThemeRoles(resolvedTheme);
  const primary = roles.primaryActionBackground;
  const surface = roles.defaultCardBackground;
  const supportSurface = roles.supportCardBackground;
  const accentSurface = roles.accentCardBackground;

  return {
    background: roles.pageBackground,
    surface,
    surfaceLow: supportSurface,
    surfaceHigh: accentSurface,
    surfaceHighest: roles.defaultCardBorder,
    primary,
    primaryContainer: roles.primaryActionBackground,
    onPrimary: roles.primaryActionText,
    onSurface: roles.headingText,
    onSurfaceVariant: roles.bodyText,
    secondary: roles.bodyText,
    outline: roles.metaText,
    outlineVariant: roles.defaultCardBorder,
    tertiary: roles.tertiaryAccentText,
    gold: resolvedTheme?.tertiaryColor || primary,
    successBg: roles.badgeStrongBackground,
    successText: roles.badgeStrongText,
    shadow: theme.colors.palette.black,
    bannerWatermark: withOpacity(roles.primaryActionText, 0.16),
    headerSurface: withOpacity(roles.pageBackground, 0.92),
    statLabel: withOpacity(roles.primaryActionText, 0.9),
    impactIconSurface: roles.iconPrimarySurface,
  };
};

const formatDateLabel = (value) => {
  if (!value) return 'Date not available';

  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getLengthLabel = (certificate) => {
  const length = toNumber(certificate?.declaredLength ?? certificate?.estimatedLength);
  return length > 0 ? `${length.toFixed(length % 1 ? 1 : 0)} inches` : 'Recorded';
};

const getBundleLabel = (certificate) => (
  certificate?.bundleId ? `Bundle #${certificate.bundleId}` : 'No bundle yet'
);

const currentYear = new Date().getFullYear();
const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'this_year', label: 'This Year' },
  { key: String(currentYear - 1), label: String(currentYear - 1) },
  { key: String(currentYear - 2), label: String(currentYear - 2) },
];

const SORT_OPTIONS = [
  { key: 'recent', label: 'Most Recent' },
  { key: 'oldest', label: 'Oldest' },
];

const getCertificateYear = (certificate) => {
  const date = new Date(certificate?.issuedAt || certificate?.donationDate || '');
  return Number.isFinite(date.getTime()) ? date.getFullYear() : null;
};

const filterCertificateRows = (rows, filterKey) => {
  if (filterKey === 'all') return rows;

  const targetYear = filterKey === 'this_year'
    ? currentYear
    : Number(filterKey);

  return rows.filter((certificate) => getCertificateYear(certificate) === targetYear);
};

const sortCertificateRows = (rows, sortKey) => {
  const direction = sortKey === 'oldest' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftTime = new Date(left?.issuedAt || left?.donationDate || 0).getTime() || 0;
    const rightTime = new Date(right?.issuedAt || right?.donationDate || 0).getTime() || 0;
    return (leftTime - rightTime) * direction;
  });
};

const getConditionLabel = (certificate) => certificate?.detectedCondition || certificate?.decision || 'Verified';

function CertificateCanvas({ certificate, colors, styles }) {
  return (
    <View collapsable={false} style={styles.certificateCanvas}>
      <View style={styles.certificatePattern} pointerEvents="none" />
      <View style={styles.canvasHeader}>
        <Text style={styles.canvasBrand}>Donivra</Text>
        <Text style={styles.canvasTitle}>Certificate of Donation</Text>
        <View style={styles.goldRule} />
      </View>

      <View style={styles.canvasBody}>
        <Text style={styles.canvasIntro}>This is to certify that</Text>
        <Text style={styles.canvasName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.62}>
          {certificate?.donorName || 'Full name required'}
        </Text>
        <Text style={styles.canvasCopy}>
          Has generously donated {getLengthLabel(certificate)} of hair on {certificate?.donationDateLabel || certificate?.issuedAtLabel}.
          {'\n'}Your contribution brings hope and confidence to patients experiencing hair loss.
        </Text>
      </View>

      <View style={styles.canvasFooter}>
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Authorized Signature</Text>
        </View>
        <View style={styles.seal}>
          <MaterialCommunityIcons name="check-decagram" size={48} color={colors.gold} />
        </View>
        <View style={styles.qrBox}>
          <MaterialCommunityIcons name="qrcode" size={36} color={colors.onSurfaceVariant} />
        </View>
      </View>
    </View>
  );
}

function CertificateDetailModal({
  certificate,
  visible,
  isBusy,
  colors,
  styles,
  onClose,
  onPrint,
  onSharePdf,
}) {
  if (!certificate) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailScreen}>
        <View style={styles.detailHeader}>
          <Pressable accessibilityLabel="Go back" style={styles.headerIconButton} onPress={onClose}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.primary} />
          </Pressable>
          <Text style={styles.detailHeaderTitle}>Certificate</Text>
          <Pressable accessibilityLabel="Share" style={styles.headerIconButton} onPress={() => onSharePdf(certificate)}>
            <MaterialCommunityIcons name="share-variant-outline" size={24} color={colors.primary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
          {!certificate.donorName ? (
            <StatusBanner
              variant="info"
              title="Name needed"
              message="Complete your donor full name in Profile before generating this certificate."
            />
          ) : null}

          <View style={styles.canvasWrap}>
            <CertificateCanvas certificate={certificate} colors={colors} styles={styles} />
          </View>

          <View style={styles.badgeRow}>
            <View style={styles.infoBadge}>
              <MaterialCommunityIcons name="check-circle" size={16} color={colors.primary} />
              <Text style={styles.infoBadgeText}>Verified Certificate</Text>
            </View>
            <View style={styles.infoBadge}>
              <MaterialCommunityIcons name="calendar-blank" size={16} color={colors.secondary} />
              <Text style={styles.infoBadgeText}>Issued {certificate.issuedAtLabel}</Text>
            </View>
          </View>

          <View style={styles.impactCard}>
            <View style={styles.impactIconWrap}>
              <MaterialCommunityIcons name="heart" size={24} color={colors.primary} />
            </View>
            <View style={styles.impactCopy}>
              <Text style={styles.impactTitle}>Your Impact</Text>
              <Text style={styles.impactText}>
                Your {getLengthLabel(certificate)} donation contributes toward creating a medical-grade wig for a patient in need.
              </Text>
            </View>
          </View>

          <View style={styles.detailGrid}>
            <View style={styles.infoPanel}>
              <Text style={styles.panelTitle}>Donation Details</Text>
              <InfoPair label="Donor Name" value={certificate.donorName || 'Full name required'} styles={styles} />
          <InfoPair label="Donation Date" value={certificate.donationDateLabel || certificate.issuedAtLabel} styles={styles} />
          <InfoPair label="Length Donated" value={getLengthLabel(certificate)} styles={styles} />
          <InfoPair label="Hair Bundle" value={getBundleLabel(certificate)} styles={styles} />
          <InfoPair label="Hair Condition" value={getConditionLabel(certificate)} chip styles={styles} />
              <InfoPair label="Receiving Organization" value={certificate.organizationName || 'Hair for Hope'} styles={styles} />
              <InfoPair label="Certificate ID" value={certificate.certificateNumber || 'Pending certificate number'} styles={styles} />
            </View>

            <View style={styles.actionsPanel}>
              <Text style={[styles.panelTitle, styles.centerText]}>Actions</Text>
              <Pressable disabled={isBusy} style={styles.primaryAction} onPress={() => onPrint(certificate)}>
                <MaterialCommunityIcons name="printer-outline" size={20} color={colors.onPrimary} />
                <Text style={styles.primaryActionText}>{isBusy ? 'Preparing...' : 'Print Certificate'}</Text>
              </Pressable>
              <Pressable
                disabled={isBusy || !certificate.donorName}
                style={[styles.secondaryAction, (!certificate.donorName || isBusy) ? styles.disabledAction : null]}
                onPress={() => onSharePdf(certificate)}
              >
                <MaterialCommunityIcons name="download-outline" size={20} color={colors.primary} />
                <Text style={styles.secondaryActionText}>Save as PDF</Text>
              </Pressable>
              <View style={styles.socialRow}>
                <Pressable disabled={isBusy} style={styles.socialButton} onPress={() => onSharePdf(certificate)}>
                  <MaterialCommunityIcons name="share-variant-outline" size={20} color={colors.primary} />
                </Pressable>
                <Pressable disabled={isBusy} style={styles.socialButton} onPress={() => onSharePdf(certificate)}>
                  <MaterialCommunityIcons name="file-pdf-box" size={20} color={colors.primary} />
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function InfoPair({ label, value, chip = false, styles }) {
  return (
    <View style={styles.infoPair}>
      <Text style={styles.infoLabel}>{label}</Text>
      {chip ? (
        <View style={styles.conditionChip}>
          <View style={styles.conditionDot} />
          <Text style={styles.infoValue}>{value}</Text>
        </View>
      ) : (
        <Text style={styles.infoValue}>{value}</Text>
      )}
    </View>
  );
}

function MilestoneBadge({ icon, label, locked = false, colors, styles }) {
  return (
    <View style={[styles.milestoneItem, locked ? styles.lockedMilestone : null]}>
      <View style={[styles.milestoneCircle, locked ? styles.milestoneCircleLocked : null]}>
        <MaterialCommunityIcons name={locked ? 'lock-outline' : icon} size={30} color={locked ? colors.outline : colors.primary} />
      </View>
      <Text style={[styles.milestoneLabel, locked ? styles.lockedText : null]}>{label}</Text>
    </View>
  );
}

function CertificateRow({ item, onView, onOpenStoredFile, colors, styles }) {
  return (
    <Pressable style={styles.certificateCard} onPress={() => onView(item)}>
      <View style={styles.certificateThumb}>
        <MaterialCommunityIcons name="flower-tulip-outline" size={26} color={colors.primary} />
        <View style={styles.thumbLine} />
        <View style={[styles.thumbLine, styles.thumbLineShort]} />
        <MaterialCommunityIcons name="medal" size={22} color={colors.tertiary} style={styles.thumbMedal} />
      </View>

      <View style={styles.cardDetails}>
        <View style={styles.cardTopRow}>
          <View style={styles.verifiedPill}>
            <MaterialCommunityIcons name="check-decagram-outline" size={14} color={colors.successText} />
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
          <Text style={styles.cardDate}>{item.issuedAtLabel}</Text>
        </View>

        <View>
          <Text style={styles.cardTitle}>{item.certificateType || 'Certificate of Donation'}</Text>
          <Text style={styles.cardSubtitle}>{item.organizationName || 'Hair for Hope'}</Text>
        </View>

        <View style={styles.cardMetaRow}>
          <View style={styles.cardMetaItem}>
            <Text style={styles.cardMetaLabel}>Length</Text>
            <Text style={styles.cardMetaValue}>{getLengthLabel(item)}</Text>
          </View>
          <View style={[styles.cardMetaItem, styles.cardMetaWide]}>
            <Text style={styles.cardMetaLabel}>Bundle</Text>
            <Text style={styles.cardMetaValue} numberOfLines={1}>{getBundleLabel(item)}</Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <Text style={styles.viewLink}>View certificate</Text>
          {item.fileUrl ? (
            <Pressable onPress={() => onOpenStoredFile(item.fileUrl)}>
              <Text style={styles.openStoredLink}>Stored file</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function DonorAchievementsScreen() {
  const router = useRouter();
  const { user, profile, resolvedTheme } = useAuth();
  const colors = useMemo(() => buildCertificateColors(resolvedTheme), [resolvedTheme]);
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [state, setState] = useState({
    isLoading: true,
    error: '',
    certificates: [],
    patientHelpedCount: 0,
  });
  const [feedback, setFeedback] = useState(null);
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isSharingAvailable, setIsSharingAvailable] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeSort, setActiveSort] = useState('recent');

  useEffect(() => {
    let cancelled = false;

    const loadCapabilities = async () => {
      const supported = await isCertificateSharingSupported();
      if (!cancelled) setIsSharingAvailable(supported);
    };

    loadCapabilities();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadAchievements = async () => {
      if (!user?.id) {
        setState({
          isLoading: false,
          error: 'Your donor session is not ready yet.',
          certificates: [],
          patientHelpedCount: 0,
        });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: '' }));

      await ensureCertificatesForScannedEventDonations(user.id, 24);
      const [certificateResult, submissionsResult] = await Promise.all([
        fetchDonationCertificatesByUserId(user.id, 24),
        fetchHairSubmissionsByUserId(user.id, 24),
      ]);

      if (cancelled) return;

      if (certificateResult.error || submissionsResult.error) {
        setState({
          isLoading: false,
          error: certificateResult.error?.message || submissionsResult.error?.message || 'Unable to load donor achievements right now.',
          certificates: [],
          patientHelpedCount: 0,
        });
        return;
      }

      const donorFullName = buildDonorFullName(profile);
      const submissionsById = Object.fromEntries(
        (submissionsResult.data || []).map((submission) => [submission.submission_id, submission])
      );
      const organizationIds = [
        ...new Set(
          (certificateResult.data || [])
            .map((certificate) => submissionsById[certificate.submission_id]?.organization_id)
            .filter(Boolean)
        ),
      ];

      const organizationResults = await Promise.all(
        organizationIds.map(async (organizationId) => {
          const result = await fetchOrganizationPreview(organizationId, profile?.user_id || null, 1);
          return [organizationId, result.data?.organization || result.data || null];
        })
      );

      if (cancelled) return;

      const organizationsById = Object.fromEntries(organizationResults);
      const certificates = (certificateResult.data || []).map((certificate) => {
        const linkedSubmission = submissionsById[certificate.submission_id] || null;
        const linkedScreening = Array.isArray(linkedSubmission?.ai_screenings)
          ? linkedSubmission.ai_screenings[0]
          : linkedSubmission?.ai_screenings || null;
        const organizationName = organizationsById[linkedSubmission?.organization_id]?.organization_name || '';
        const model = buildDonorCertificateModel({
          profile: { ...profile, email: user?.email || '' },
          certificateRow: certificate,
          submission: linkedSubmission,
          screening: linkedScreening,
          organizationName,
        });

        return {
          ...model,
          id: model.certificateId || `${certificate.certificate_number}-${certificate.issued_at}`,
          donorName: donorFullName,
          issuedAtLabel: formatDateLabel(certificate.issued_at || linkedSubmission?.created_at || ''),
          statusLabel: certificate.issued_at ? 'Issued' : 'Pending',
        };
      });

      const bundleIds = certificates.map((certificate) => certificate.bundleId).filter(Boolean);
      const patientImpactResult = await fetchDonorPatientImpactByBundleIds(bundleIds);

      if (cancelled) return;

      const patientIds = [
        ...new Set([
          ...(patientImpactResult.data?.patientIds || []),
          ...certificates.map((certificate) => certificate.recipientPatientId).filter(Boolean),
        ]),
      ];

      setState({
        isLoading: false,
        error: '',
        certificates,
        patientHelpedCount: patientIds.length,
      });
    };

    loadAchievements();
    return () => {
      cancelled = true;
    };
  }, [profile, user?.email, user?.id]);

  const certificateRows = useMemo(
    () => sortCertificateRows(filterCertificateRows(state.certificates, activeFilter), activeSort),
    [activeFilter, activeSort, state.certificates]
  );
  const activeSortLabel = SORT_OPTIONS.find((option) => option.key === activeSort)?.label || SORT_OPTIONS[0].label;
  const totalAchievements = state.certificates.length;
  const patientsHelped = state.patientHelpedCount;

  const toggleSort = () => {
    setActiveSort((current) => (current === 'recent' ? 'oldest' : 'recent'));
  };

  const handleNavPress = (item) => {
    if (!item?.route) return;
    router.replace(item.route);
  };

  const handleOpenStoredCertificate = async (url) => {
    if (!url) {
      setFeedback({ type: 'info', title: 'No stored file', message: 'There is no uploaded certificate file for this record yet.' });
      return;
    }

    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return;
    }

    setFeedback({ type: 'error', title: 'Cannot open file', message: 'This certificate file could not be opened on this device.' });
  };

  const ensureDonorName = (certificate) => {
    if (!certificate?.donorName) {
      throw new Error('Complete your donor full name in Profile before generating this certificate.');
    }
  };

  const handleSharePdf = async (certificate) => {
    try {
      ensureDonorName(certificate);
      if (!isSharingAvailable) throw new Error('Sharing is not available on this device right now.');
      setIsBusy(true);
      setFeedback(null);
      const file = await generateDonorCertificatePdf(certificate, { colors });
      await shareDonorCertificatePdf(file.uri);
      setFeedback({ type: 'success', title: 'Certificate ready', message: 'Your certificate PDF has been opened in the share sheet.' });
    } catch (error) {
      setFeedback({ type: 'error', title: 'Certificate unavailable', message: error.message || 'Unable to prepare the certificate right now.' });
    } finally {
      setIsBusy(false);
    }
  };

  const handlePrintCertificate = async (certificate) => {
    try {
      ensureDonorName(certificate);
      setIsBusy(true);
      setFeedback(null);
      const html = await buildDonorCertificateHtml(certificate, { colors });
      await Print.printAsync({ html });
      setFeedback({ type: 'success', title: 'Print ready', message: 'The print dialog has been opened for this certificate.' });
    } catch (error) {
      setFeedback({ type: 'error', title: 'Print unavailable', message: error.message || 'Unable to open the print dialog right now.' });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <DashboardLayout
      screenVariant="default"
      navItems={donorDashboardNavItems}
      activeNavKey="profile"
      navVariant="donor"
      onNavPress={handleNavPress}
      header={null}
    >
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable style={styles.topBarButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurfaceVariant} />
          </Pressable>
          <Text style={styles.screenTitle}>My Achievements</Text>
          <View style={styles.topBarButton}>
            <MaterialCommunityIcons name="filter-variant" size={24} color={colors.onSurfaceVariant} />
          </View>
        </View>

        {feedback ? (
          <StatusBanner
            variant={feedback.type}
            title={feedback.title}
            message={feedback.message}
            dismissible
            onDismiss={() => setFeedback(null)}
          />
        ) : null}

        <View style={styles.impactBanner}>
          <View style={styles.bannerHeader}>
            <MaterialCommunityIcons name="trophy" size={38} color={colors.onPrimary} />
            <Text style={styles.bannerTitle}>Donation Impact</Text>
          </View>
          <View style={styles.statsGrid}>
            <StatBlock value={String(totalAchievements)} label="Achievements" styles={styles} />
            <StatBlock value={String(patientsHelped)} label="Patients Helped" styles={styles} />
          </View>
          <MaterialCommunityIcons name="trophy" size={128} color={colors.bannerWatermark} style={styles.bannerWatermark} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Milestones</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.milestonesRow}>
            <MilestoneBadge icon="certificate" label="First Donation" locked={certificateRows.length < 1} colors={colors} styles={styles} />
            <MilestoneBadge icon="star-four-points" label="5 Donations" locked={certificateRows.length < 5} colors={colors} styles={styles} />
            <MilestoneBadge icon="trophy-award" label="10 Donations" locked={certificateRows.length < 10} colors={colors} styles={styles} />
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionTitle}>Certificates</Text>
            <Pressable style={styles.sortPill} onPress={toggleSort}>
              <Text style={styles.sortText}>{activeSortLabel}</Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {FILTER_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                style={[styles.filterPill, activeFilter === option.key ? styles.filterPillActive : null]}
                onPress={() => setActiveFilter(option.key)}
              >
                <Text style={[styles.filterText, activeFilter === option.key ? styles.filterTextActive : null]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {state.isLoading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading donor achievements...</Text>
          </View>
        ) : state.error ? (
          <View style={styles.stateWrap}>
            <Text style={styles.stateText}>{state.error}</Text>
          </View>
        ) : certificateRows.length ? (
          <View style={styles.cardsGrid}>
            {certificateRows.map((item) => (
              <CertificateRow
                key={String(item.id)}
                item={item}
                onView={setSelectedCertificate}
                onOpenStoredFile={handleOpenStoredCertificate}
                colors={colors}
                styles={styles}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <AppIcon name="sparkle" state="muted" />
            </View>
            <Text style={styles.emptyTitle}>{state.certificates.length ? 'No certificates in this filter' : 'No achievements yet'}</Text>
            <Text style={styles.emptyMessage}>
              {state.certificates.length ? 'Change the filter to see other certificate records.' : 'Your certificates will appear here once available.'}
            </Text>
          </View>
        )}
      </View>

      <CertificateDetailModal
        certificate={selectedCertificate}
        visible={Boolean(selectedCertificate)}
        isBusy={isBusy}
        colors={colors}
        styles={styles}
        onClose={() => setSelectedCertificate(null)}
        onPrint={handlePrintCertificate}
        onSharePdf={handleSharePdf}
      />
    </DashboardLayout>
  );
}

function StatBlock({ value, label, styles }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: {
    gap: 24,
    paddingBottom: 24,
  },
  topBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLow,
  },
  screenTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
  },
  impactBanner: {
    position: 'relative',
    overflow: 'hidden',
    gap: 16,
    padding: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryContainer,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 20,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  bannerWatermark: {
    position: 'absolute',
    right: -24,
    bottom: -32,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statBlock: {
    flex: 1,
    gap: 2,
  },
  statValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  statLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.statLabel,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    color: colors.onSurface,
  },
  milestonesRow: {
    gap: 16,
    paddingVertical: 6,
  },
  milestoneItem: {
    width: 86,
    alignItems: 'center',
    gap: 8,
  },
  lockedMilestone: {
    opacity: 0.55,
  },
  milestoneCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  milestoneCircleLocked: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    shadowOpacity: 0,
    elevation: 0,
  },
  milestoneLabel: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.onSurfaceVariant,
  },
  lockedText: {
    color: colors.outline,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  sortText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    color: colors.onSurface,
  },
  filterRow: {
    gap: 8,
    paddingVertical: 4,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLow,
  },
  filterPillActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer,
  },
  filterText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.onSurfaceVariant,
  },
  filterTextActive: {
    color: colors.onPrimary,
  },
  cardsGrid: {
    gap: 16,
  },
  certificateCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  certificateThumb: {
    width: 92,
    height: 124,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLow,
  },
  thumbLine: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    marginTop: 7,
    backgroundColor: colors.outlineVariant,
  },
  thumbLineShort: {
    width: '74%',
    marginTop: 5,
  },
  thumbMedal: {
    position: 'absolute',
    right: 8,
    bottom: 8,
  },
  cardDetails: {
    flex: 1,
    gap: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.successBg,
  },
  verifiedText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.successText,
  },
  cardDate: {
    flexShrink: 1,
    textAlign: 'right',
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },
  cardTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '700',
    color: colors.onSurface,
  },
  cardSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.secondary,
  },
  cardMetaRow: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceHighest,
  },
  cardMetaItem: {
    gap: 2,
  },
  cardMetaWide: {
    flex: 1,
  },
  cardMetaLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.outline,
  },
  cardMetaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewLink: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  openStoredLink: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    color: colors.secondary,
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 48,
  },
  stateText: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    color: colors.secondary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 56,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLow,
  },
  emptyTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
  },
  emptyMessage: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.secondary,
  },
  detailScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  detailHeader: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.headerSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceHighest,
  },
  headerIconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },
  detailHeaderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
  },
  detailContent: {
    gap: 24,
    padding: 20,
    paddingBottom: 40,
  },
  canvasWrap: {
    alignItems: 'center',
  },
  certificateCanvas: {
    position: 'relative',
    width: '100%',
    maxWidth: 800,
    aspectRatio: 1.414,
    overflow: 'hidden',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.gold,
    backgroundColor: colors.surface,
  },
  certificatePattern: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.08,
    backgroundColor: colors.surfaceLow,
  },
  canvasHeader: {
    width: '100%',
    alignItems: 'center',
    zIndex: 1,
  },
  canvasBrand: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    color: colors.primary,
  },
  canvasTitle: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.onSurface,
  },
  goldRule: {
    width: 96,
    height: 4,
    marginTop: 12,
    borderRadius: 2,
    backgroundColor: colors.gold,
  },
  canvasBody: {
    zIndex: 1,
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  canvasIntro: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 15,
    fontStyle: 'italic',
    color: colors.secondary,
  },
  canvasName: {
    width: '100%',
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '800',
    color: colors.primary,
  },
  canvasCopy: {
    maxWidth: 520,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    lineHeight: 20,
    color: colors.secondary,
  },
  canvasFooter: {
    zIndex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    alignItems: 'center',
  },
  signatureLine: {
    width: 128,
    height: 1,
    marginBottom: 8,
    backgroundColor: colors.outline,
  },
  signatureLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.secondary,
  },
  seal: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrBox: {
    width: 58,
    height: 58,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.surfaceLow,
  },
  infoBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
  },
  impactCard: {
    flexDirection: 'row',
    gap: 14,
    padding: 20,
    borderRadius: 12,
    backgroundColor: colors.surfaceHigh,
  },
  impactIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.impactIconSurface,
  },
  impactCopy: {
    flex: 1,
    gap: 4,
  },
  impactTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  impactText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    lineHeight: 21,
    color: colors.onSurfaceVariant,
  },
  detailGrid: {
    gap: 16,
  },
  infoPanel: {
    gap: 14,
    padding: 20,
    borderRadius: 12,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  actionsPanel: {
    gap: 12,
    padding: 20,
    borderRadius: 12,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  panelTitle: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    fontFamily: theme.typography.fontFamily,
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  centerText: {
    textAlign: 'center',
  },
  infoPair: {
    gap: 5,
  },
  infoLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.secondary,
  },
  infoValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 15,
    color: colors.onSurface,
  },
  conditionChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceHigh,
  },
  conditionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  primaryAction: {
    minHeight: 48,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
  },
  primaryActionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.onPrimary,
  },
  secondaryAction: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disabledAction: {
    opacity: 0.48,
  },
  secondaryActionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.primary,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  socialButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLow,
  },
});
