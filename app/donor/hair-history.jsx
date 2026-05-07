import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { DashboardHeader } from '../../src/components/ui/DashboardHeader';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import {
  fetchHairBundleTrackingHistory,
  fetchHairSubmissionLogisticsBySubmissionId,
  fetchHairSubmissionsByUserId,
} from '../../src/features/hairSubmission.api';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';
import { useAuth } from '../../src/providers/AuthProvider';

const formatDateLabel = (value) => {
  if (!value) return 'Date not available';

  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
};

const formatLengthLabel = (value) => {
  if (value == null || value === '') return 'Not recorded';
  return `${value} in`;
};

const formatDonationSource = (value = '') => {
  const normalized = String(value || '').replace(/[_-]/g, ' ').trim();
  if (!normalized) return 'Donation';
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getLatestDetail = (submission) => (
  [...(submission?.submission_details || [])]
    .sort((left, right) => new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime())[0] || null
);

const makeDetailRows = (rows = []) => (
  rows
    .filter((row) => row?.value !== null && row?.value !== undefined && String(row.value).trim() !== '')
    .map((row) => ({ ...row, value: String(row.value) }))
);

const buildHairAnalysisRows = (submissions = []) => (
  submissions.flatMap((submission) => {
    const latestDetail = getLatestDetail(submission);

    return (submission.ai_screenings || []).map((screening) => ({
      id: `analysis-${screening.ai_screening_id || screening.id || submission.submission_id}`,
      type: 'analysis',
      icon: 'checkHair',
      title: screening.detected_condition || screening.decision || 'Hair analysis saved',
      subtitle: submission.submission_code || 'Saved hair check',
      status: 'Hair Analysis',
      date: screening.created_at || submission.created_at || '',
      dateLabel: formatDateLabel(screening.created_at || submission.created_at),
      description: screening.summary || 'Hair eligibility result was saved.',
      detailsTitle: 'Hair Analysis Details',
      details: makeDetailRows([
        { label: 'Submission Code', value: submission.submission_code },
        { label: 'Decision', value: screening.decision },
        { label: 'Detected Condition', value: screening.detected_condition },
        { label: 'Estimated Length', value: formatLengthLabel(screening.estimated_length) },
        { label: 'Detected Color', value: screening.detected_color || latestDetail?.declared_color },
        { label: 'Detected Texture', value: screening.detected_texture || latestDetail?.declared_texture },
        { label: 'Detected Density', value: screening.detected_density || latestDetail?.declared_density },
        { label: 'Confidence Score', value: screening.confidence_score },
        { label: 'Summary', value: screening.summary },
        { label: 'Visible Damage Notes', value: screening.visible_damage_notes },
      ]),
    }));
  })
);

const buildDonationRows = (submissions = [], donationContextBySubmissionId = new Map()) => (
  submissions.flatMap((submission) => {
    const latestDetail = getLatestDetail(submission);
    const context = donationContextBySubmissionId.get(submission.submission_id) || {};
    const baseDetails = [
      { label: 'Submission Code', value: submission.submission_code },
      { label: 'Donation Source', value: formatDonationSource(submission.donation_source) },
      { label: 'Submission Status', value: submission.status },
      { label: 'Bundle Quantity', value: Array.isArray(submission?.submission_details) ? submission.submission_details.length : 0 },
      { label: 'Donation Drive ID', value: submission.donation_drive_id },
      { label: 'Declared Length', value: latestDetail?.declared_length ? formatLengthLabel(latestDetail.declared_length) : '' },
      { label: 'Declared Color', value: latestDetail?.declared_color },
      { label: 'Declared Density', value: latestDetail?.declared_density },
      { label: 'Donor Notes', value: submission.donor_notes },
    ];
    const rows = [];

    if (submission.status || submission.donation_source || submission.donation_drive_id) {
      rows.push({
        id: `donation-submission-${submission.submission_id}`,
        type: 'donation',
        icon: 'donations',
        title: submission.status || 'Donation status saved',
        subtitle: submission.submission_code || 'Donation record',
        status: formatDonationSource(submission.donation_source),
        date: submission.updated_at || submission.created_at || '',
        dateLabel: formatDateLabel(submission.updated_at || submission.created_at),
        description: 'Donation submission record was updated.',
        detailsTitle: 'Donation Status Details',
        details: makeDetailRows(baseDetails),
      });
    }

    if (context.logistics?.shipment_status || context.logistics?.received_at) {
      rows.push({
        id: `donation-logistics-${context.logistics.submission_logistics_id || submission.submission_id}`,
        type: 'donation',
        icon: 'truck-delivery-outline',
        title: context.logistics.shipment_status || 'Logistics updated',
        subtitle: submission.submission_code || 'Donation logistics',
        status: 'Logistics',
        date: context.logistics.updated_at || context.logistics.created_at || submission.updated_at || '',
        dateLabel: formatDateLabel(context.logistics.updated_at || context.logistics.created_at || submission.updated_at),
        description: context.logistics.notes || 'Donation logistics were updated.',
        detailsTitle: 'Donation Logistics Details',
        details: makeDetailRows([
          ...baseDetails,
          { label: 'Logistics Type', value: context.logistics.logistics_type },
          { label: 'Shipment Status', value: context.logistics.shipment_status },
          { label: 'Courier Name', value: context.logistics.courier_name },
          { label: 'Tracking Number', value: context.logistics.tracking_number },
          { label: 'Pickup Schedule Date', value: context.logistics.pickup_schedule_date },
          { label: 'Received At', value: context.logistics.received_at ? formatDateLabel(context.logistics.received_at) : '' },
          { label: 'Notes', value: context.logistics.notes },
        ]),
      });
    }

    (context.trackingEntries || []).forEach((entry) => {
      rows.push({
        id: `donation-tracking-${entry.tracking_id || entry.id}`,
        type: 'donation',
        icon: 'timeline-check-outline',
        title: entry.title || entry.status || 'Donation update',
        subtitle: submission.submission_code || 'Donation tracking',
        status: entry.status || 'Status Update',
        date: entry.updated_at || submission.updated_at || '',
        dateLabel: formatDateLabel(entry.updated_at || submission.updated_at),
        description: entry.description || 'Donation tracking status was updated.',
        detailsTitle: 'Donation Tracking Details',
        details: makeDetailRows([
          ...baseDetails,
          { label: 'Tracking Status', value: entry.status },
          { label: 'Tracking Title', value: entry.title },
          { label: 'Description', value: entry.description },
          { label: 'Updated At', value: entry.updated_at ? formatDateLabel(entry.updated_at) : '' },
        ]),
      });
    });

    return rows;
  })
);

function HistoryRow({ item, roles, onViewDetails }) {
  const isDonation = item.type === 'donation';

  return (
    <View style={[styles.historyRow, { borderBottomColor: roles.defaultCardBorder }]}>
      <View
        style={[
          styles.historyIconWrap,
          { backgroundColor: isDonation ? roles.iconAccentSurface : roles.iconPrimarySurface },
        ]}
      >
        <AppIcon
          name={item.icon}
          size="sm"
          color={isDonation ? roles.iconAccentColor : roles.iconPrimaryColor}
        />
      </View>

      <View style={styles.historyCopy}>
        <View style={styles.historyTitleRow}>
          <Text numberOfLines={1} style={[styles.historyTitle, { color: roles.headingText }]}>{item.title}</Text>
          <Text style={[styles.historyStatus, { color: roles.primaryActionBackground }]}>{item.status}</Text>
        </View>
        <Text numberOfLines={1} style={[styles.historyMeta, { color: roles.bodyText }]}>{item.subtitle}</Text>
        <Text numberOfLines={1} style={[styles.historyDate, { color: roles.metaText }]}>{item.dateLabel}</Text>
      </View>

      <Pressable
        onPress={() => onViewDetails(item)}
        style={({ pressed }) => [
          styles.viewDetailsButton,
          {
            borderColor: roles.defaultCardBorder,
            backgroundColor: roles.pageBackground,
            opacity: pressed ? 0.78 : 1,
          },
        ]}
      >
        <Text style={[styles.viewDetailsText, { color: roles.primaryActionBackground }]}>View details</Text>
      </Pressable>
    </View>
  );
}

function HistoryDetailsModal({ item, roles, onClose }) {
  return (
    <Modal transparent visible={Boolean(item)} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalSheet, { backgroundColor: roles.pageBackground, borderColor: roles.defaultCardBorder }]}>
          <View style={styles.modalHeader}>
            <View style={[styles.modalIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
              <AppIcon name={item?.icon || 'profile'} color={roles.iconPrimaryColor} />
            </View>
            <View style={styles.modalTitleWrap}>
              <Text style={[styles.modalTitle, { color: roles.headingText }]}>{item?.detailsTitle || 'History Details'}</Text>
              <Text style={[styles.modalSubtitle, { color: roles.bodyText }]}>{item?.dateLabel || ''}</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailList}>
            {item?.description ? (
              <Text style={[styles.detailDescription, { color: roles.bodyText }]}>{item.description}</Text>
            ) : null}

            {(item?.details || []).map((row) => (
              <View key={`${item.id}-${row.label}`} style={[styles.detailRow, { borderBottomColor: roles.defaultCardBorder }]}>
                <Text style={[styles.detailLabel, { color: roles.metaText }]}>{row.label}</Text>
                <Text style={[styles.detailValue, { color: roles.headingText }]}>{row.value}</Text>
              </View>
            ))}
          </ScrollView>

          <AppButton title="Close" fullWidth={false} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

export default function DonorHairHistoryScreen() {
  const router = useRouter();
  const { user, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [state, setState] = useState({
    isLoading: true,
    error: '',
    history: [],
  });
  const [selectedHistory, setSelectedHistory] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      if (!user?.id) {
        setState({
          isLoading: false,
          error: 'Your donor session is not ready yet.',
          history: [],
        });
        return;
      }

      setState((current) => ({
        ...current,
        isLoading: true,
        error: '',
      }));

      const result = await fetchHairSubmissionsByUserId(user.id, 32);
      if (cancelled) return;

      if (result.error) {
        setState({
          isLoading: false,
          error: result.error.message || 'Unable to load your history right now.',
          history: [],
        });
        return;
      }

      const submissions = result.data || [];
      const donationContextResults = await Promise.all(submissions.map(async (submission) => {
        const latestDetail = getLatestDetail(submission);
        const [logisticsResult, trackingResult] = await Promise.all([
          fetchHairSubmissionLogisticsBySubmissionId(submission.submission_id),
          fetchHairBundleTrackingHistory({
            submissionId: submission.submission_id,
            submissionDetailId: latestDetail?.submission_detail_id || null,
            limit: 8,
          }),
        ]);

        return [
          submission.submission_id,
          {
            logistics: logisticsResult.data || null,
            trackingEntries: trackingResult.data || [],
            error: logisticsResult.error || trackingResult.error || null,
          },
        ];
      }));
      if (cancelled) return;

      const donationContextBySubmissionId = new Map(donationContextResults);
      const history = [
        ...buildHairAnalysisRows(submissions),
        ...buildDonationRows(submissions, donationContextBySubmissionId),
      ].sort((left, right) => (
        new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime()
      ));

      const contextError = donationContextResults.map(([, context]) => context.error).find(Boolean);

      setState({
        isLoading: false,
        error: contextError?.message || '',
        history,
      });
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const historyRows = useMemo(() => state.history, [state.history]);

  const handleNavPress = (item) => {
    if (!item?.route) return;
    router.replace(item.route);
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
          title="History"
          subtitle=""
          variant="donor"
          showAvatar={false}
        />
      )}
    >
      <View style={styles.headerBlock}>
        <Pressable style={styles.backRow} onPress={() => router.back()}>
          <AppIcon name="arrowLeft" color={roles.metaText} />
          <Text style={[styles.backText, { color: roles.bodyText }]}>Back</Text>
        </Pressable>

        <Text style={[styles.pageTitle, { color: roles.headingText }]}>Activity History</Text>
        <Text style={[styles.pageSubtitle, { color: roles.bodyText }]}>
          Hair analysis logs and hair donation status updates.
        </Text>
      </View>

      {state.isLoading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={roles.primaryActionBackground || theme.colors.brandPrimary} />
          <Text style={[styles.stateText, { color: roles.bodyText }]}>Loading history...</Text>
        </View>
      ) : state.error && !historyRows.length ? (
        <View style={styles.stateWrap}>
          <Text style={[styles.stateText, { color: roles.bodyText }]}>{state.error}</Text>
        </View>
      ) : historyRows.length ? (
        <View style={styles.historyList}>
          {state.error ? <Text style={[styles.inlineError, { color: roles.bodyText }]}>{state.error}</Text> : null}
          {historyRows.map((item) => (
            <HistoryRow
              key={String(item.id)}
              item={item}
              roles={roles}
              onViewDetails={setSelectedHistory}
            />
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
            <AppIcon name="history" color={roles.iconPrimaryColor} />
          </View>
          <Text style={[styles.emptyTitle, { color: roles.headingText }]}>No history yet</Text>
          <Text style={[styles.emptyMessage, { color: roles.bodyText }]}>
            Hair analysis logs and donation updates will appear here once available.
          </Text>
        </View>
      )}

      <HistoryDetailsModal
        item={selectedHistory}
        roles={roles}
        onClose={() => setSelectedHistory(null)}
      />
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  backText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  pageTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
  },
  pageSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  historyList: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 86,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  historyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  historyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  historyTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  historyStatus: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  historyMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  historyDate: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  viewDetailsButton: {
    borderWidth: 1,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
  },
  viewDetailsText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  inlineError: {
    paddingVertical: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
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
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  emptyMessage: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  modalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleWrap: {
    flex: 1,
    gap: 3,
  },
  modalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  modalSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  detailList: {
    paddingBottom: theme.spacing.md,
  },
  detailDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    marginBottom: theme.spacing.md,
  },
  detailRow: {
    gap: 4,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  detailLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
});
