import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { DashboardHeader } from '../../src/components/ui/DashboardHeader';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { DashboardSectionHeader } from '../../src/components/ui/DashboardSectionHeader';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import { fetchHairSubmissionsByUserId } from '../../src/features/hairSubmission.api';
import { theme } from '../../src/design-system/theme';
import { useAuth } from '../../src/providers/AuthProvider';

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

const formatLengthLabel = (value) => {
  if (value == null || value === '') return 'Not recorded';
  return `${value} in`;
};

function HistoryCard({ item }) {
  return (
    <AppCard variant="elevated" radius="xl" padding="lg">
      <View style={styles.historyHeader}>
        <View style={styles.historyIconWrap}>
          <AppIcon name="checkHair" state="active" />
        </View>
        <View style={styles.historyCopy}>
          <Text style={styles.historyTitle}>{item.conditionLabel}</Text>
          <Text style={styles.historyMeta}>{item.meta}</Text>
        </View>
      </View>

      <View style={styles.historyStats}>
        <View style={styles.statChip}>
          <Text style={styles.statLabel}>Length</Text>
          <Text style={styles.statValue}>{item.lengthLabel}</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statLabel}>Color</Text>
          <Text style={styles.statValue}>{item.colorLabel}</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statLabel}>Density</Text>
          <Text style={styles.statValue}>{item.densityLabel}</Text>
        </View>
      </View>

      {item.summary ? <Text style={styles.summaryText}>{item.summary}</Text> : null}
      {item.damageNotes ? <Text style={styles.damageText}>{item.damageNotes}</Text> : null}
    </AppCard>
  );
}

export default function DonorHairHistoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [state, setState] = useState({
    isLoading: true,
    error: '',
    history: [],
  });

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

      const result = await fetchHairSubmissionsByUserId(user.id, 24);
      if (cancelled) return;

      if (result.error) {
        setState({
          isLoading: false,
          error: result.error.message || 'Unable to load your hair analysis history right now.',
          history: [],
        });
        return;
      }

      const history = (result.data || [])
        .flatMap((submission) => (
          (submission.ai_screenings || []).map((screening) => ({
            id: screening.ai_screening_id || screening.id || `${submission.submission_id}-${screening.created_at}`,
            conditionLabel: screening.detected_condition || screening.decision || 'Hair analysis saved',
            meta: [
              submission.submission_code || 'Saved submission',
              formatDateLabel(screening.created_at || submission.created_at),
            ].filter(Boolean).join(' | '),
            lengthLabel: formatLengthLabel(screening.estimated_length),
            colorLabel: screening.detected_color || 'Not recorded',
            densityLabel: screening.detected_density || 'Not recorded',
            summary: screening.summary || '',
            damageNotes: screening.visible_damage_notes || '',
            createdAt: screening.created_at || submission.created_at || '',
          }))
        ))
        .sort((left, right) => (
          new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
        ));

      setState({
        isLoading: false,
        error: '',
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
          title="Hair Analysis History"
          subtitle=""
          variant="donor"
          showAvatar={false}
        />
      )}
    >
      <AppCard variant="elevated" radius="xl" padding="lg">
        <Pressable style={styles.backRow} onPress={() => router.back()}>
          <AppIcon name="arrowLeft" state="muted" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <DashboardSectionHeader
          title="Saved Hair Checks"
          description="Your previous donor hair analysis results."
          style={styles.sectionHeader}
        />

        {state.isLoading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color={theme.colors.brandPrimary} />
            <Text style={styles.stateText}>Loading hair analysis history...</Text>
          </View>
        ) : state.error ? (
          <View style={styles.stateWrap}>
            <Text style={styles.stateText}>{state.error}</Text>
          </View>
        ) : historyRows.length ? (
          <View style={styles.list}>
            {historyRows.map((item) => (
              <HistoryCard key={String(item.id)} item={item} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <AppIcon name="checkHair" state="muted" />
            </View>
            <Text style={styles.emptyTitle}>No hair analysis history yet</Text>
            <Text style={styles.emptyMessage}>Saved hair analysis results will appear here after you complete a hair check.</Text>
          </View>
        )}
      </AppCard>
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
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  historyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  historyCopy: {
    flex: 1,
    gap: 2,
  },
  historyTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  historyMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  historyStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  statChip: {
    minWidth: 96,
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  statLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textPrimary,
  },
  summaryText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textPrimary,
  },
  damageText: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
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
});
