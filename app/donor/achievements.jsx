import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { DashboardHeader } from '../../src/components/ui/DashboardHeader';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { DashboardSectionHeader } from '../../src/components/ui/DashboardSectionHeader';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import { fetchDonationCertificatesByUserId, fetchHairSubmissionsByUserId } from '../../src/features/hairSubmission.api';
import { fetchOrganizationPreview } from '../../src/features/donorHome.api';
import {
  buildDonorCertificateModel,
  buildDonorFullName,
  generateDonorCertificatePdf,
  getCertificateMetaValueFontSize,
  getCertificateRecipientFontSize,
  isCertificateSharingSupported,
  shareDonorCertificatePdf,
} from '../../src/features/donorCertificate.service';
import { theme } from '../../src/design-system/theme';
import { useAuth } from '../../src/providers/AuthProvider';

const certificateTemplate = require('../../src/assets/images/donivra_certificate_template.png');

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

function CertificatePreviewModal({
  certificate,
  visible,
  canDownload,
  isDownloading,
  onClose,
  onDownload,
}) {
  if (!certificate) return null;

  const recipientFontSize = getCertificateRecipientFontSize(certificate.donorName, {
    max: 24,
    min: 14,
  });
  const certificateNumberFontSize = getCertificateMetaValueFontSize(certificate.certificateNumber || '', {
    max: 12,
    min: 8,
  });
  const issuedFontSize = getCertificateMetaValueFontSize(certificate.issuedAtLabel || '', {
    max: 12,
    min: 8,
  });
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>Certificate Preview</Text>
              <Text style={styles.modalSubtitle}>{certificate.certificateType || 'Certificate of Donation'}</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {!certificate.donorName ? (
              <StatusBanner
                variant="info"
                title="Name needed"
                message="Complete your donor full name in Profile before generating this certificate."
              />
            ) : null}

            <View style={styles.previewWrap}>
              <ImageBackground
                source={certificateTemplate}
                resizeMode="contain"
                style={styles.certificatePreview}
                imageStyle={styles.certificatePreviewImage}
              >
                <View style={styles.previewMetaCard}>
                  <Text style={styles.previewMetaLabel}>Certificate No.</Text>
                  <Text
                    style={[styles.previewMetaValue, { fontSize: certificateNumberFontSize }]}
                    numberOfLines={2}
                  >
                    {certificate.certificateNumber || 'Pending certificate number'}
                  </Text>
                  <Text style={styles.previewMetaLabel}>Issued</Text>
                  <Text
                    style={[styles.previewMetaValue, styles.previewMetaValueLast, { fontSize: issuedFontSize }]}
                    numberOfLines={2}
                  >
                    {certificate.issuedAtLabel}
                  </Text>
                </View>

                <View style={styles.previewRecipientBlock}>
                  <Text
                    style={[
                      styles.previewRecipientName,
                      { fontSize: recipientFontSize, lineHeight: Math.round(recipientFontSize * 1.05) },
                    ]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {certificate.donorName || 'Full name required'}
                  </Text>
                </View>
              </ImageBackground>
            </View>

            <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Certificate</Text>
                <Text style={styles.detailValue}>{certificate.certificateType || 'Certificate of Donation'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Certificate number</Text>
                <Text style={styles.detailValue}>{certificate.certificateNumber || 'Pending certificate number'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Issued</Text>
                <Text style={styles.detailValue}>{certificate.issuedAtLabel}</Text>
              </View>
              {certificate.organizationName ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Organization</Text>
                  <Text style={styles.detailValue}>{certificate.organizationName}</Text>
                </View>
              ) : null}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Submission</Text>
                <Text style={styles.detailValue}>{certificate.submissionCode || 'No linked submission'}</Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <AppButton
                title={isDownloading ? 'Preparing PDF...' : 'Download PDF'}
                loading={isDownloading}
                disabled={!canDownload}
                onPress={() => onDownload(certificate)}
              />
            </View>
          </ScrollView>
        </AppCard>
      </View>
    </Modal>
  );
}

function CertificateRow({ item, canDownload, onView, onDownload, onOpenStoredFile }) {
  return (
    <AppCard variant="elevated" radius="xl" padding="lg">
      <View style={styles.certificateHeader}>
        <View style={styles.certificateIconWrap}>
          <AppIcon name="sparkle" state="active" />
        </View>
        <View style={styles.certificateCopy}>
          <Text style={styles.certificateTitle}>{item.certificateType || 'Certificate of Donation'}</Text>
          <Text style={styles.certificateMeta}>{item.certificateNumber || 'Pending certificate number'}</Text>
        </View>
      </View>

      <View style={styles.detailList}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Issued</Text>
          <Text style={styles.detailValue}>{item.issuedAtLabel}</Text>
        </View>
        {item.organizationName ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Organization</Text>
            <Text style={styles.detailValue}>{item.organizationName}</Text>
          </View>
        ) : null}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Submission</Text>
          <Text style={styles.detailValue}>{item.submissionCode || 'No linked submission'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Status</Text>
          <Text style={styles.detailValue}>{item.statusLabel}</Text>
        </View>
      </View>

      {item.remarks ? <Text style={styles.certificateRemarks}>{item.remarks}</Text> : null}

      {!item.donorName ? (
        <Text style={styles.missingNameText}>Complete your donor full name in Profile before generating this certificate.</Text>
      ) : null}

      <View style={styles.actionRow}>
        <AppButton
          title="View Certificate"
          variant="outline"
          fullWidth={false}
          onPress={() => onView(item)}
        />
        <AppButton
          title="Download PDF"
          fullWidth={false}
          disabled={!canDownload}
          onPress={() => onDownload(item)}
        />
      </View>

      {item.fileUrl ? (
        <Pressable style={styles.linkRow} onPress={() => onOpenStoredFile(item.fileUrl)}>
          <Text style={styles.linkText}>Open stored certificate</Text>
          <AppIcon name="chevronRight" state="muted" size="sm" />
        </Pressable>
      ) : null}
    </AppCard>
  );
}

export default function DonorAchievementsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [state, setState] = useState({
    isLoading: true,
    error: '',
    certificates: [],
  });
  const [feedback, setFeedback] = useState(null);
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSharingAvailable, setIsSharingAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadCapabilities = async () => {
      const supported = await isCertificateSharingSupported();
      if (!cancelled) {
        setIsSharingAvailable(supported);
      }
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
        });
        return;
      }

      setState((current) => ({
        ...current,
        isLoading: true,
        error: '',
      }));

      const [certificateResult, submissionsResult] = await Promise.all([
        fetchDonationCertificatesByUserId(user.id, 24),
        fetchHairSubmissionsByUserId(user.id, 24),
      ]);

      if (cancelled) return;

      if (certificateResult.error) {
        setState({
          isLoading: false,
          error: certificateResult.error.message || 'Unable to load donor achievements right now.',
          certificates: [],
        });
        return;
      }

      if (submissionsResult.error) {
        setState({
          isLoading: false,
          error: submissionsResult.error.message || 'Unable to load donor achievements right now.',
          certificates: [],
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

      setState({
        isLoading: false,
        error: '',
        certificates,
      });
    };

    loadAchievements();

    return () => {
      cancelled = true;
    };
  }, [profile, user?.email, user?.id]);

  const certificateRows = useMemo(() => state.certificates, [state.certificates]);

  const handleNavPress = (item) => {
    if (!item?.route) return;
    router.replace(item.route);
  };

  const handleOpenStoredCertificate = async (url) => {
    if (!url) {
      setFeedback({
        type: 'info',
        title: 'No stored file',
        message: 'There is no uploaded certificate file for this record yet.',
      });
      return;
    }

    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return;
    }

    setFeedback({
      type: 'error',
      title: 'Cannot open file',
      message: 'This certificate file could not be opened on this device.',
    });
  };

  const handleDownloadCertificate = async (certificate) => {
    try {
      if (!certificate?.donorName) {
        throw new Error('Complete your donor full name in Profile before generating a certificate.');
      }

      if (!isSharingAvailable) {
        throw new Error('PDF sharing is not available on this device right now.');
      }

      setIsDownloading(true);
      setFeedback(null);

      const file = await generateDonorCertificatePdf(certificate);
      await shareDonorCertificatePdf(file.uri);

      setFeedback({
        type: 'success',
        title: 'Certificate ready',
        message: 'Your certificate PDF has been prepared and opened in the share sheet.',
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        title: 'Certificate unavailable',
        message: error.message || 'Unable to generate the donor certificate PDF right now.',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <DashboardLayout
      screenVariant="default"
      navItems={donorDashboardNavItems}
      activeNavKey="profile"
      navVariant="donor"
      onNavPress={handleNavPress}
      header={(
        <DashboardHeader
          title="Achievements"
          subtitle=""
          variant="donor"
          showAvatar={false}
        />
      )}
    >
      {feedback ? (
        <StatusBanner
          variant={feedback.type}
          title={feedback.title}
          message={feedback.message}
          dismissible
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      <AppCard variant="elevated" radius="xl" padding="lg">
        <Pressable style={styles.backRow} onPress={() => router.back()}>
          <AppIcon name="arrowLeft" state="muted" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <DashboardSectionHeader
          title="Certificates"
          description="Your donor certificates and recognition milestones."
          style={styles.sectionHeader}
        />

        {state.isLoading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color={theme.colors.brandPrimary} />
            <Text style={styles.stateText}>Loading donor achievements...</Text>
          </View>
        ) : state.error ? (
          <View style={styles.stateWrap}>
            <Text style={styles.stateText}>{state.error}</Text>
          </View>
        ) : certificateRows.length ? (
          <View style={styles.list}>
            {certificateRows.map((item) => (
              <CertificateRow
                key={String(item.id)}
                item={item}
                canDownload={isSharingAvailable}
                onView={setSelectedCertificate}
                onDownload={handleDownloadCertificate}
                onOpenStoredFile={handleOpenStoredCertificate}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <AppIcon name="sparkle" state="muted" />
            </View>
            <Text style={styles.emptyTitle}>No achievements yet</Text>
            <Text style={styles.emptyMessage}>Your certificates will appear here once available.</Text>
          </View>
        )}
      </AppCard>

      <CertificatePreviewModal
        certificate={selectedCertificate}
        visible={Boolean(selectedCertificate)}
        canDownload={isSharingAvailable && !isDownloading}
        isDownloading={isDownloading}
        onClose={() => setSelectedCertificate(null)}
        onDownload={handleDownloadCertificate}
      />
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  backText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  sectionHeader: {
    marginBottom: theme.spacing.md,
  },
  list: {
    gap: theme.spacing.md,
  },
  certificateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  certificateIconWrap: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  certificateCopy: {
    flex: 1,
    gap: 2,
  },
  certificateTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  certificateMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  detailList: {
    gap: theme.spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  detailLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textPrimary,
  },
  certificateRemarks: {
    marginTop: theme.spacing.md,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  missingNameText: {
    marginTop: theme.spacing.md,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  actionRow: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  linkRow: {
    marginTop: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.brandPrimary,
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xl,
  },
  stateText: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xxl,
  },
  emptyIconWrap: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  emptyTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  emptyMessage: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
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
    maxWidth: 520,
    alignSelf: 'center',
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  modalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  modalSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  previewWrap: {
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
  },
  certificatePreview: {
    width: '100%',
    aspectRatio: 1.41,
    justifyContent: 'flex-start',
  },
  certificatePreviewImage: {
    resizeMode: 'cover',
  },
  previewMetaCard: {
    position: 'absolute',
    top: '18%',
    right: '24%',
    width: '21%',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  previewMetaLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#5b7fc7',
    marginBottom: 2,
  },
  previewMetaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    color: '#253041',
    marginBottom: theme.spacing.xs,
    lineHeight: 14,
  },
  previewMetaValueLast: {
    marginBottom: 0,
  },
  previewRecipientBlock: {
    position: 'absolute',
    top: '36%',
    left: '8%',
    width: '58%',
    minHeight: '14%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  previewRecipientName: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 24,
    color: '#1d1d1f',
    letterSpacing: 0.2,
  },
  detailCard: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  modalActions: {
    marginTop: theme.spacing.xs,
  },
});
