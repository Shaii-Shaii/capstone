import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { DashboardHeaderSurface } from '../../src/components/layout/DashboardHeaderSurface';
import { DonorTopBar } from '../../src/components/donor/DonorTopBar';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { EmptyDataState } from '../../src/components/ui/EmptyDataState';
import { SectionTitleRow } from '../../src/components/ui/SectionTitleRow';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import {
  fetchDonationCertificateById,
  fetchDonationCertificatesByUserId,
  fetchDonorPatientImpactByBundleIds,
  fetchHairSubmissionCertificateRecordsByIds,
} from '../../src/features/hairSubmission.api';
import { fetchOrganizationPreview } from '../../src/features/donorHome.api';
import {
  buildDonorCertificateHtml,
  buildDonorCertificateModel,
  buildDonorFullName,
  generateDonorCertificatePdf,
  saveDonorCertificatePdfToDownloads,
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

const resolvePdfViewer = () => {
  if (Platform.OS === 'web' || Constants?.appOwnership === 'expo') return null;
  try {
    const pdfModule = require('react-native-pdf');
    return pdfModule?.default || pdfModule;
  } catch (_error) {
    return null;
  }
};

const Pdf = resolvePdfViewer();

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

const SORT_OPTIONS = [
  { key: 'recent', label: 'Most Recent' },
  { key: 'oldest', label: 'Oldest' },
];

const sortCertificateRows = (rows, sortKey) => {
  const direction = sortKey === 'oldest' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftTime = new Date(left?.issuedAt || left?.donationDate || 0).getTime() || 0;
    const rightTime = new Date(right?.issuedAt || right?.donationDate || 0).getTime() || 0;
    return (leftTime - rightTime) * direction;
  });
};

function AnimatedSection({ children, delay = 0, style }) {
  const progress = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: theme.motion.cardEnter,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [delay, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [14, 0],
            }),
          }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function FloatingToast({ feedback, colors, styles, onDismiss }) {
  const insets = useSafeAreaInsets();
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(-18)).current;

  React.useEffect(() => {
    if (!feedback) return undefined;

    opacity.setValue(0);
    translateY.setValue(-18);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: theme.motion.normal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: theme.motion.normal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(onDismiss, 3200);
    return () => clearTimeout(timer);
  }, [feedback, onDismiss, opacity, translateY]);

  if (!feedback) return null;

  const isError = feedback.type === 'error';
  const icon = isError ? 'alert-circle-outline' : feedback.type === 'success' ? 'check-circle-outline' : 'information-outline';

  return (
    <Modal
      transparent
      visible
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View pointerEvents="box-none" style={[styles.toastOverlay, { paddingTop: Math.max(insets.top + 10, 20) }]}>
        <Animated.View
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.toastCard, { opacity, transform: [{ translateY }] }]}
        >
          <View style={[styles.toastIcon, isError ? styles.toastIconError : null]}>
            <MaterialCommunityIcons name={icon} size={22} color={isError ? colors.onSurface : colors.primary} />
          </View>
          <View style={styles.toastCopy}>
            <Text style={styles.toastTitle}>{feedback.title}</Text>
            <Text style={styles.toastMessage}>{feedback.message}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            hitSlop={10}
            onPress={onDismiss}
            style={({ pressed }) => [styles.toastClose, pressed ? styles.linkPressed : null]}
          >
            <MaterialCommunityIcons name="close" size={18} color={colors.onSurfaceVariant} />
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
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
  onSavePdf,
}) {
  const insets = useSafeAreaInsets();
  const [previewPdfUri, setPreviewPdfUri] = React.useState('');
  const [previewState, setPreviewState] = React.useState('idle');
  const [previewError, setPreviewError] = React.useState('');
  const [isPreviewExpanded, setIsPreviewExpanded] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    if (!visible || !certificate) {
      setPreviewPdfUri('');
      setPreviewState('idle');
      setPreviewError('');
      setIsPreviewExpanded(false);
      return () => {
        active = false;
      };
    }

    const preparePreview = async () => {
      try {
        setPreviewPdfUri('');
        setPreviewState('preparing');
        setPreviewError('');
        const file = await generateDonorCertificatePdf(certificate, { colors });
        if (!active) return;
        setPreviewPdfUri(file.uri);
        setPreviewState(Pdf ? 'rendering' : 'unavailable');
      } catch (error) {
        if (!active) return;
        setPreviewState('error');
        setPreviewError(error?.message || 'Unable to prepare the certificate PDF preview.');
      }
    };

    preparePreview();
    return () => {
      active = false;
    };
  }, [certificate, colors, visible]);

  if (!certificate) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailScreen}>
        <LinearGradient
          colors={[theme.colors.palette.wine900, colors.primary, theme.colors.palette.wine600]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.detailHeader,
            {
              paddingTop: insets.top,
              minHeight: insets.top + 60,
            },
          ]}
        >
          <View pointerEvents="none" style={styles.detailHeaderGlow} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onClose}
            style={({ pressed }) => [
              styles.headerIconButton,
              pressed ? styles.headerButtonPressed : null,
            ]}
          >
            <AppIcon name="arrowLeft" state="inverse" color={colors.onPrimary} />
          </Pressable>
          <View style={styles.detailHeaderCopy}>
            <Text style={[styles.detailHeaderTitle, { color: colors.onPrimary }]}>Your certificate</Text>
            <Text style={styles.detailHeaderSubtitle}>Donation recognition</Text>
          </View>
          <View style={styles.headerSpacer} />
        </LinearGradient>

        <ScrollView
          style={styles.detailScroll}
          contentContainerStyle={styles.detailContent}
          showsVerticalScrollIndicator={false}
        >
          {!certificate.donorName ? (
            <StatusBanner
              variant="info"
              title="Name needed"
              message="Complete your donor full name in Profile before generating this certificate."
            />
          ) : null}

          <AnimatedSection delay={40} style={styles.pdfPreviewEntry}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enlarge certificate PDF preview"
              accessibilityHint="Opens a full-screen zoomable certificate"
              disabled={!previewPdfUri || !Pdf || previewState === 'error'}
              onPress={() => setIsPreviewExpanded(true)}
              style={({ pressed }) => [
                styles.pdfPreviewShell,
                pressed ? styles.pdfPreviewPressed : null,
              ]}
            >
              {previewPdfUri && Pdf ? (
                <Pdf
                  pointerEvents="none"
                  source={{ uri: previewPdfUri, cache: true }}
                  page={1}
                  singlePage
                  trustAllCerts={false}
                  fitPolicy={0}
                  style={styles.pdfPreview}
                  onLoadComplete={() => setPreviewState('ready')}
                  onError={(error) => {
                    setPreviewState('error');
                    setPreviewError(error?.message || 'Unable to display the certificate PDF preview.');
                  }}
                />
              ) : (
                <View style={styles.pdfPreviewFallback}>
                  {previewState === 'preparing' ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <MaterialCommunityIcons name="file-pdf-box" size={38} color={colors.primary} />
                  )}
                  <Text style={styles.pdfPreviewFallbackTitle}>
                    {previewState === 'error'
                      ? 'Preview unavailable'
                      : previewState === 'unavailable'
                        ? 'PDF viewer unavailable'
                        : 'Preparing PDF preview'}
                  </Text>
                  {previewError ? <Text style={styles.pdfPreviewFallbackText}>{previewError}</Text> : null}
                </View>
              )}
              {previewState === 'rendering' ? (
                <View pointerEvents="none" style={styles.pdfLoadingOverlay}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.pdfLoadingText}>Rendering certificate...</Text>
                </View>
              ) : null}
              {previewState === 'ready' ? (
                <View pointerEvents="none" style={styles.expandPreviewBadge}>
                  <MaterialCommunityIcons name="fullscreen" size={16} color={colors.onPrimary} />
                  <Text style={styles.expandPreviewBadgeText}>Enlarge</Text>
                </View>
              ) : null}
            </Pressable>
          </AnimatedSection>

          <AnimatedSection delay={110} style={styles.previewCaption}>
            <MaterialCommunityIcons name="file-check-outline" size={18} color={colors.primary} />
            <Text style={styles.previewCaptionText}>PDF certificate preview</Text>
          </AnimatedSection>
        </ScrollView>

        <View style={[styles.stickyActionArea, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.stickyActionDock}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Print certificate"
              disabled={isBusy}
              onPress={() => onPrint(certificate)}
              style={({ pressed }) => [
                styles.primaryAction,
                pressed ? styles.actionPressed : null,
                isBusy ? styles.disabledAction : null,
              ]}
            >
              <LinearGradient
                colors={[colors.primary, theme.colors.palette.wine700, theme.colors.palette.wine900]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.actionButtonContent}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <MaterialCommunityIcons name="printer-outline" size={19} color={colors.onPrimary} />
                )}
                <Text style={styles.primaryActionText}>{isBusy ? 'Preparing...' : 'Print'}</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save certificate PDF"
              disabled={isBusy || !certificate.donorName}
              style={({ pressed }) => [
                styles.secondaryAction,
                pressed ? styles.actionPressed : null,
                (!certificate.donorName || isBusy) ? styles.disabledAction : null,
              ]}
              onPress={() => onSavePdf(certificate, previewPdfUri)}
            >
              <LinearGradient
                colors={[withOpacity(colors.primary, 0.12), withOpacity(colors.primary, 0.04)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.actionButtonContent}
              >
                <MaterialCommunityIcons name="tray-arrow-down" size={19} color={colors.primary} />
                <Text style={styles.secondaryActionText}>Save PDF</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>

        <Modal
          visible={isPreviewExpanded}
          animationType="fade"
          presentationStyle="fullScreen"
          onRequestClose={() => setIsPreviewExpanded(false)}
        >
          <View style={[styles.expandedPreviewScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={styles.expandedPreviewHeader}>
              <View>
                <Text style={styles.expandedPreviewTitle}>Certificate preview</Text>
                <Text style={styles.expandedPreviewSubtitle}>Pinch to zoom and drag to inspect</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close certificate preview"
                onPress={() => setIsPreviewExpanded(false)}
                style={({ pressed }) => [styles.expandedPreviewClose, pressed ? styles.actionPressed : null]}
              >
                <MaterialCommunityIcons name="close" size={23} color={colors.onSurface} />
              </Pressable>
            </View>
            <View style={styles.expandedPdfStage}>
              {previewPdfUri && Pdf ? (
                <Pdf
                  source={{ uri: previewPdfUri, cache: true }}
                  page={1}
                  trustAllCerts={false}
                  fitPolicy={0}
                  minScale={1}
                  maxScale={5}
                  style={styles.expandedPdf}
                />
              ) : null}
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

function MilestoneBadge({ icon, label, locked = false, colors, styles }) {
  return (
    <LinearGradient
      accessibilityLabel={`${label} milestone ${locked ? 'locked' : 'unlocked'}`}
      colors={locked
        ? [colors.surface, colors.background]
        : [colors.surfaceHigh, colors.surface]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.milestoneItem, locked ? styles.lockedMilestone : null]}
    >
      <View style={[styles.milestoneCircle, locked ? styles.milestoneCircleLocked : null]}>
        <MaterialCommunityIcons name={locked ? 'lock-outline' : icon} size={24} color={locked ? colors.outline : colors.primary} />
        {!locked ? (
          <View style={styles.milestoneCheck}>
            <MaterialCommunityIcons name="check" size={10} color={colors.onPrimary} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.milestoneLabel, locked ? styles.lockedText : null]}>{label}</Text>
      <Text style={[styles.milestoneState, locked ? styles.lockedText : null]}>{locked ? 'Keep going' : 'Unlocked'}</Text>
    </LinearGradient>
  );
}

function CertificateRow({ item, onView, colors, styles }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View certificate for ${item.certificateType || 'donation'}`}
      onPress={() => onView(item)}
      style={({ pressed }) => [
        styles.certificateCard,
        pressed ? styles.certificateCardPressed : null,
      ]}
    >
      <LinearGradient
        colors={[colors.surface, colors.surfaceLow, colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.certificateCardGradient}
      >
        <View style={styles.certificateThumb}>
          <MaterialCommunityIcons name="certificate-outline" size={30} color={colors.primary} />
          <View style={styles.thumbLine} />
          <View style={[styles.thumbLine, styles.thumbLineShort]} />
        </View>

        <View style={styles.cardDetails}>
          <View style={styles.cardTopRow}>
            <View style={styles.issuedPill}>
              <MaterialCommunityIcons name="check-decagram" size={13} color={colors.primary} />
              <Text style={styles.issuedPillText}>Issued</Text>
            </View>
            <Text style={styles.cardDate}>{item.issuedAtLabel}</Text>
          </View>

          <View>
            <Text style={styles.cardTitle}>{item.certificateType || 'Certificate of Donation'}</Text>
            <Text style={styles.cardSubtitle}>{item.organizationName || 'Hair for Hope'}</Text>
            <Text style={styles.cardCertificateNumber} numberOfLines={2}>
              Certificate No. {item.certificateNumber || 'Pending'}
            </Text>
          </View>

          <View style={styles.cardActions}>
            <View style={styles.viewCertificateLink}>
              <Text style={styles.viewCertificateText}>View</Text>
              <MaterialCommunityIcons name="chevron-right" size={17} color={colors.primary} />
            </View>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

export default function DonorAchievementsScreen() {
  const router = useRouter();
  const { certificateId } = useLocalSearchParams();
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
  const [activeSort, setActiveSort] = useState('recent');
  const dismissFeedback = React.useCallback(() => setFeedback(null), []);

  useEffect(() => {
    if (!certificateId || state.isLoading || selectedCertificate) return;

    const requestedId = Array.isArray(certificateId) ? certificateId[0] : certificateId;
    const matchingCertificate = state.certificates.find((item) => (
      String(item.certificateId || item.id || '') === String(requestedId)
    ));

    if (matchingCertificate) {
      setSelectedCertificate(matchingCertificate);
    }
  }, [certificateId, selectedCertificate, state.certificates, state.isLoading]);

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

      const certificateResult = await fetchDonationCertificatesByUserId(user.id, 24);
      const certificateSubmissionIds = (certificateResult.data || [])
        .map((certificate) => certificate?.submission_id)
        .filter(Boolean);
      const submissionsResult = await fetchHairSubmissionCertificateRecordsByIds(certificateSubmissionIds);

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
      const issuedCertificateRows = (certificateResult.data || []).filter((certificate) => (
        certificate?.submission_id && submissionsById[certificate.submission_id]
      ));
      const organizationIds = [
        ...new Set(
          issuedCertificateRows
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
      const certificates = issuedCertificateRows.map((certificate) => {
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
    () => sortCertificateRows(state.certificates, activeSort),
    [activeSort, state.certificates]
  );
  const activeSortLabel = SORT_OPTIONS.find((option) => option.key === activeSort)?.label || SORT_OPTIONS[0].label;
  const totalAchievements = state.certificates.length;
  const patientsHelped = state.patientHelpedCount;
  const unlockedMilestoneCount = [1, 5, 10].filter((target) => totalAchievements >= target).length;

  const toggleSort = () => {
    setActiveSort((current) => (current === 'recent' ? 'oldest' : 'recent'));
  };

  const handleNavPress = (item) => {
    if (!item?.route) return;
    router.replace(item.route);
  };

  const handleViewCertificate = async (certificate) => {
    const certificateIdValue = certificate?.certificateId || certificate?.id;
    if (!certificateIdValue) {
      setFeedback({ type: 'error', title: 'Certificate unavailable', message: 'This certificate record could not be identified.' });
      return;
    }

    const result = await fetchDonationCertificateById(certificateIdValue);
    if (result.error || !result.data) {
      setFeedback({
        type: 'error',
        title: 'Certificate unavailable',
        message: result.error?.message || 'This certificate could not be loaded. Please try again.',
      });
      return;
    }

    setSelectedCertificate({
      ...certificate,
      certificateId: result.data.certificate_id,
      certificateNumber: result.data.certificate_number || certificate.certificateNumber,
      certificateType: result.data.certificate_type || certificate.certificateType,
      fileUrl: result.data.file_url || '',
      issuedAt: result.data.issued_at,
      issuedAtLabel: formatDateLabel(result.data.issued_at),
      remarks: result.data.remarks || '',
      submissionId: result.data.submission_id,
    });
  };

  const ensureDonorName = (certificate) => {
    if (!certificate?.donorName) {
      throw new Error('Complete your donor full name in Profile before generating this certificate.');
    }
  };

  const handleSavePdf = async (certificate, preparedFileUri = '') => {
    try {
      ensureDonorName(certificate);
      setIsBusy(true);
      setFeedback(null);
      const fileUri = preparedFileUri || (await generateDonorCertificatePdf(certificate, { colors })).uri;
      const savedFile = await saveDonorCertificatePdfToDownloads(fileUri, certificate);
      setFeedback({
        type: 'success',
        title: savedFile.location === 'Downloads' ? 'PDF saved' : 'Certificate ready',
        message: savedFile.location === 'Downloads'
          ? `${savedFile.fileName} was saved to your Downloads folder.`
          : 'Choose Save to Files to keep the certificate on your device.',
      });
    } catch (error) {
      setFeedback({ type: 'error', title: 'Unable to save PDF', message: error.message || 'Unable to save the certificate right now.' });
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
      hideNav
      navItems={donorDashboardNavItems}
      activeNavKey="profile"
      navVariant="donor"
      onNavPress={handleNavPress}
      header={(
        <DashboardHeaderSurface>
          <DonorTopBar
            title="Achievements"
            subtitle="Certificates and milestones"
            showBack
            showNotificationsAction={false}
            showLogoutAction={false}
            onBackPress={() => router.back()}
          />
        </DashboardHeaderSurface>
      )}
    >
      <View style={styles.screen}>
        <AnimatedSection delay={20}>
          <LinearGradient
            colors={[colors.primaryContainer, theme.colors.palette.wine700, theme.colors.palette.wine600]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.impactBanner}
          >
              <View pointerEvents="none" style={styles.impactBannerGlow} />
              <View style={styles.bannerHeader}>
                <View style={styles.bannerIconWrap}>
                  <MaterialCommunityIcons name="trophy-outline" size={25} color={colors.onPrimary} />
                </View>
                <View style={styles.bannerHeadingCopy}>
                  <Text style={styles.bannerEyebrow}>YOUR GIVING JOURNEY</Text>
                  <Text style={styles.bannerTitle}>Donation impact</Text>
                </View>
              </View>
              <View style={styles.statsGrid}>
                <StatBlock value={String(totalAchievements)} label="Certificates earned" styles={styles} />
                <StatBlock value={String(patientsHelped)} label="Patients helped" styles={styles} />
              </View>
              <MaterialCommunityIcons name="trophy" size={128} color={colors.bannerWatermark} style={styles.bannerWatermark} />
          </LinearGradient>
        </AnimatedSection>

        {state.isLoading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading donor achievements...</Text>
          </View>
        ) : state.error ? (
          <View style={styles.stateWrap}>
            <Text style={styles.stateText}>{state.error}</Text>
          </View>
        ) : (
          <View style={styles.contentStack}>
            <AnimatedSection delay={100}>
              <LinearGradient
                colors={[colors.surface, colors.surfaceLow, colors.background]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.milestonePanel}
              >
                <View style={styles.sectionHeadingRow}>
                  <SectionTitleRow
                    title="Milestones"
                    icon="trophy-award"
                    color={colors.onSurface}
                    iconColor={colors.primary}
                    accentColor={colors.primary}
                    titleStyle={styles.sectionTitle}
                  />
                  <View style={styles.progressPill}>
                    <Text style={styles.progressPillText}>{unlockedMilestoneCount} of 3 unlocked</Text>
                  </View>
                </View>
                <Text style={styles.sectionSupportText}>Every verified donation moves your impact forward.</Text>
                <View style={styles.milestonesRow}>
                  <MilestoneBadge icon="certificate" label="First donation" locked={totalAchievements < 1} colors={colors} styles={styles} />
                  <MilestoneBadge icon="star-four-points" label="5 donations" locked={totalAchievements < 5} colors={colors} styles={styles} />
                  <MilestoneBadge icon="trophy-award" label="10 donations" locked={totalAchievements < 10} colors={colors} styles={styles} />
                </View>
              </LinearGradient>
            </AnimatedSection>

            <AnimatedSection delay={170} style={styles.section}>
              <View style={styles.sectionHeadingRow}>
                <SectionTitleRow
                  title="Certificates"
                  icon="file-document-outline"
                  color={colors.onSurface}
                  iconColor={colors.primary}
                  accentColor={colors.primary}
                  titleStyle={styles.sectionTitle}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Sort certificates. Current order: ${activeSortLabel}`}
                  style={({ pressed }) => [styles.sortPill, pressed ? styles.sortPillPressed : null]}
                  onPress={toggleSort}
                >
                  <Text style={styles.sortText}>{activeSortLabel}</Text>
                  <MaterialCommunityIcons name="chevron-down" size={18} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>
              <Text style={styles.sectionSupportText}>Your verified donation records, ready to view or share.</Text>
            </AnimatedSection>

            {certificateRows.length ? (
              <View style={styles.cardsGrid}>
                {certificateRows.map((item, index) => (
                  <AnimatedSection key={String(item.id)} delay={220 + Math.min(index, 4) * theme.motion.stagger}>
                    <CertificateRow
                      item={item}
                      onView={handleViewCertificate}
                      colors={colors}
                      styles={styles}
                    />
                  </AnimatedSection>
                ))}
              </View>
            ) : (
              <AnimatedSection delay={220}>
                <EmptyDataState
                  compact
                  showCountBadge={false}
                  title="No certificates yet"
                  message="Your first verified donation certificate will appear here."
                  style={styles.emptyState}
                />
              </AnimatedSection>
            )}
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
        onSavePdf={handleSavePdf}
      />
      <FloatingToast
        feedback={feedback}
        colors={colors}
        styles={styles}
        onDismiss={dismissFeedback}
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
    gap: 18,
    paddingBottom: 28,
  },
  impactBanner: {
    position: 'relative',
    overflow: 'hidden',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: withOpacity(colors.onPrimary, 0.2),
    shadowColor: colors.shadow,
    shadowOpacity: 0.34,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  impactBannerGlow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    right: -56,
    top: -94,
    backgroundColor: withOpacity(colors.onPrimary, 0.11),
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  bannerHeadingCopy: {
    flex: 1,
    gap: 1,
  },
  bannerEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.statLabel,
  },
  bannerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withOpacity(colors.onPrimary, 0.14),
    borderWidth: 1,
    borderColor: withOpacity(colors.onPrimary, 0.2),
  },
  bannerTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
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
    gap: 10,
  },
  statBlock: {
    flex: 1,
    minHeight: 68,
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: withOpacity(colors.onPrimary, 0.18),
    backgroundColor: withOpacity(colors.onPrimary, 0.1),
  },
  statValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  statLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    lineHeight: 15,
    color: colors.statLabel,
  },
  section: {
    gap: 8,
  },
  contentStack: {
    gap: 18,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.onSurface,
  },
  milestonesRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 6,
  },
  milestonePanel: {
    gap: 8,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  milestoneItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 126,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 6,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  lockedMilestone: {
    opacity: 0.68,
  },
  milestoneCircle: {
    position: 'relative',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.impactIconSurface,
  },
  milestoneCircleLocked: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    shadowOpacity: 0,
    elevation: 0,
  },
  milestoneCheck: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  milestoneLabel: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  milestoneState: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    lineHeight: 12,
    color: colors.primary,
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
  sectionSupportText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 18,
    color: colors.onSurfaceVariant,
  },
  progressPill: {
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.impactIconSurface,
  },
  progressPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  sortPillPressed: {
    opacity: 0.72,
  },
  sortText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    color: colors.onSurface,
  },
  cardsGrid: {
    gap: 14,
  },
  certificateCard: {
    borderRadius: 24,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  certificateCardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.992 }],
  },
  certificateCardGradient: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 14,
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  certificateThumb: {
    width: 82,
    height: 112,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLow,
  },
  thumbLine: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    marginTop: 7,
    backgroundColor: colors.outlineVariant,
  },
  thumbLineShort: {
    width: '74%',
    marginTop: 5,
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
  issuedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.impactIconSurface,
  },
  issuedPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  cardDate: {
    flexShrink: 1,
    textAlign: 'right',
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  cardTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    color: colors.onSurface,
  },
  cardSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.secondary,
  },
  cardCertificateNumber: {
    marginTop: 3,
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    lineHeight: 14,
    color: colors.onSurfaceVariant,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 'auto',
  },
  linkPressed: {
    opacity: 0.72,
  },
  viewCertificateLink: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 4,
  },
  viewCertificateText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 48,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  stateText: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    color: colors.secondary,
  },
  emptyState: {
    gap: 0,
    paddingVertical: 32,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  emptyTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
  },
  emptyMessage: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 18,
    color: colors.secondary,
  },
  detailScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  detailHeader: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  detailHeaderGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    right: -42,
    top: -90,
    backgroundColor: withOpacity(colors.onPrimary, 0.12),
  },
  detailHeaderCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 1,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: withOpacity(colors.onPrimary, 0.22),
    backgroundColor: withOpacity(colors.onPrimary, 0.1),
  },
  headerButtonPressed: {
    opacity: 0.82,
  },
  detailHeaderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.primary,
  },
  detailHeaderSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    lineHeight: 12,
    color: withOpacity(colors.onPrimary, 0.78),
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    gap: 18,
    padding: 16,
    paddingTop: 18,
    paddingBottom: 112,
  },
  pdfPreviewEntry: {
    width: '100%',
    maxWidth: 800,
    aspectRatio: 1.414,
    alignSelf: 'center',
    borderRadius: 20,
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  pdfPreviewShell: {
    position: 'relative',
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  pdfPreviewPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.992 }],
  },
  pdfPreview: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
  },
  pdfPreviewFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    backgroundColor: colors.surface,
  },
  pdfPreviewFallbackTitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: colors.onSurface,
  },
  pdfPreviewFallbackText: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    lineHeight: 16,
    color: colors.onSurfaceVariant,
  },
  pdfLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: withOpacity(colors.surface, 0.92),
  },
  pdfLoadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    lineHeight: 16,
    color: colors.onSurfaceVariant,
  },
  expandPreviewBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: withOpacity(colors.primary, 0.92),
  },
  expandPreviewBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  previewCaption: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  previewCaptionText: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    lineHeight: 16,
    color: colors.onSurfaceVariant,
  },
  stickyActionArea: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    zIndex: 10,
    paddingTop: 12,
    backgroundColor: 'transparent',
  },
  stickyActionDock: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  primaryAction: {
    flex: 1,
    height: 52,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    elevation: 3,
  },
  actionButtonContent: {
    flex: 1,
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryActionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.onPrimary,
  },
  secondaryAction: {
    flex: 1,
    height: 52,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  actionPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.988 }],
  },
  disabledAction: {
    opacity: 0.48,
  },
  secondaryActionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.primary,
  },
  expandedPreviewScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  expandedPreviewHeader: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  expandedPreviewTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.onSurface,
  },
  expandedPreviewSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    lineHeight: 14,
    color: colors.onSurfaceVariant,
  },
  expandedPreviewClose: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: colors.surfaceLow,
  },
  expandedPdfStage: {
    flex: 1,
    overflow: 'hidden',
    margin: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  expandedPdf: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
  },
  toastOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  toastCard: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  toastIcon: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.successBg,
  },
  toastIconError: {
    backgroundColor: colors.surfaceHigh,
  },
  toastCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  toastTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: colors.onSurface,
  },
  toastMessage: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    lineHeight: 16,
    color: colors.onSurfaceVariant,
  },
  toastClose: {
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
});
