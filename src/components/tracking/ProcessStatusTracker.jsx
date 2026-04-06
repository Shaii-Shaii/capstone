import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader';
import { StatusBanner } from '../ui/StatusBanner';
import { theme } from '../../design-system/theme';

const SUMMARY_TONE_STYLES = {
  info: {
    backgroundColor: theme.colors.surfaceSoft,
    textColor: theme.colors.textPrimary,
  },
  success: {
    backgroundColor: theme.colors.brandPrimaryMuted,
    textColor: theme.colors.brandPrimary,
  },
  error: {
    backgroundColor: theme.colors.surfaceSoft,
    textColor: theme.colors.textError,
  },
};

const STEP_STATE_STYLES = {
  completed: {
    dotColor: theme.colors.brandPrimary,
    lineColor: theme.colors.brandPrimaryMuted,
    cardBackground: theme.colors.brandPrimaryMuted,
    titleColor: theme.colors.textPrimary,
    bodyColor: theme.colors.textSecondary,
  },
  current: {
    dotColor: theme.colors.brandPrimary,
    lineColor: theme.colors.brandPrimaryMuted,
    cardBackground: theme.colors.surfaceSoft,
    titleColor: theme.colors.textPrimary,
    bodyColor: theme.colors.textSecondary,
  },
  attention: {
    dotColor: theme.colors.textError,
    lineColor: theme.colors.borderSubtle,
    cardBackground: theme.colors.surfaceSoft,
    titleColor: theme.colors.textPrimary,
    bodyColor: theme.colors.textError,
  },
  upcoming: {
    dotColor: theme.colors.borderStrong,
    lineColor: theme.colors.borderSubtle,
    cardBackground: theme.colors.backgroundPrimary,
    titleColor: theme.colors.textMuted,
    bodyColor: theme.colors.textMuted,
  },
};

function TrackerStep({ step, isLast }) {
  const palette = STEP_STATE_STYLES[step.state] || STEP_STATE_STYLES.upcoming;

  return (
    <View style={styles.stepRow}>
      <View style={styles.rail}>
        <View style={[styles.stepDot, { backgroundColor: palette.dotColor }]} />
        {!isLast ? <View style={[styles.stepLine, { backgroundColor: palette.lineColor }]} /> : null}
      </View>

      <View style={[styles.stepCard, { backgroundColor: palette.cardBackground }]}>
        <View style={styles.stepTopRow}>
          <Text style={[styles.stepTitle, { color: palette.titleColor }]}>{step.title}</Text>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>{step.label}</Text>
          </View>
        </View>
        <Text style={[styles.stepDescription, { color: palette.bodyColor }]}>{step.description}</Text>
      </View>
    </View>
  );
}

function TrackerEvent({ event }) {
  return (
    <View style={styles.eventCard}>
      <View style={styles.eventTopRow}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        {event.badge ? (
          <View style={styles.eventBadge}>
            <Text style={styles.eventBadgeText}>{event.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.eventDescription}>{event.description}</Text>
      {event.timestamp ? <Text style={styles.eventTimestamp}>{event.timestamp}</Text> : null}
    </View>
  );
}

export function ProcessStatusTracker({
  tracker,
  role,
  isLoading,
  isRefreshing,
  error,
  onRefresh,
}) {
  const summaryTone = SUMMARY_TONE_STYLES[tracker?.summary?.tone] || SUMMARY_TONE_STYLES.info;
  const cardVariant = role === 'donor' ? 'donorTint' : 'patientTint';

  return (
    <AppCard variant={cardVariant} radius="xl" padding="lg">
      <DashboardSectionHeader
        title={tracker?.title || (role === 'donor' ? 'Donation Status' : 'Wig Request Status')}
        description={tracker?.subtitle || 'Track the latest progress updates here.'}
        style={styles.sectionHeader}
      />

      <View style={styles.headerActions}>
        <View style={[styles.summaryPill, { backgroundColor: summaryTone.backgroundColor }]}>
          <AppIcon name="clock-time-four-outline" color={summaryTone.textColor} size="sm" />
          <Text style={[styles.summaryPillText, { color: summaryTone.textColor }]}>
            {tracker?.summary?.label || 'Waiting for updates'}
          </Text>
        </View>

        <AppButton
          title="Refresh"
          variant="secondary"
          size="md"
          fullWidth={false}
          loading={isRefreshing}
          onPress={onRefresh}
          leading={<AppIcon name="refresh" state="muted" />}
        />
      </View>

      {tracker?.summary?.referenceValue ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryRefLabel}>{tracker.summary.referenceLabel}</Text>
          <Text style={styles.summaryRefValue}>{tracker.summary.referenceValue}</Text>
          {tracker.summary.helperText ? <Text style={styles.summaryHelper}>{tracker.summary.helperText}</Text> : null}
        </View>
      ) : null}

      {error ? (
        <StatusBanner
          message={error}
          variant="error"
          title="Unable to load tracking"
          style={styles.inlineBanner}
        />
      ) : null}

      {isLoading ? (
        <StatusBanner
          message="Loading the latest process updates."
          variant="info"
          title="Checking status"
          style={styles.inlineBanner}
        />
      ) : null}

      {tracker?.steps?.length ? (
        <View style={styles.stepsWrap}>
          {tracker.steps.map((step, index) => (
            <TrackerStep
              key={step.key}
              step={step}
              isLast={index === tracker.steps.length - 1}
            />
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <AppIcon name="timeline-clock-outline" state="muted" />
          <Text style={styles.emptyTitle}>{tracker?.emptyTitle || 'No status yet'}</Text>
          <Text style={styles.emptyBody}>
            {tracker?.emptyDescription || 'Tracking updates will appear here once the first record is available.'}
          </Text>
        </View>
      )}

      {tracker?.events?.length ? (
        <View style={styles.eventsWrap}>
          <Text style={styles.eventsTitle}>Recent updates</Text>
          {tracker.events.slice(0, 4).map((event) => (
            <TrackerEvent key={event.key} event={event} />
          ))}
        </View>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    marginBottom: theme.spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
  },
  summaryPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  summaryCard: {
    gap: 4,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  summaryRefLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryRefValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  summaryHelper: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  inlineBanner: {
    marginBottom: theme.spacing.md,
  },
  stepsWrap: {
    gap: theme.spacing.xs,
  },
  stepRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rail: {
    width: 22,
    alignItems: 'center',
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: theme.radius.full,
    marginTop: 10,
  },
  stepLine: {
    width: 2,
    flex: 1,
    marginTop: 6,
    borderRadius: theme.radius.full,
    minHeight: 54,
  },
  stepCard: {
    flex: 1,
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
  },
  stepTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  stepTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  stepBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  stepBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textSecondary,
  },
  stepDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderStyle: 'dashed',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  emptyTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  emptyBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  eventsWrap: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  eventsTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eventCard: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  eventTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  eventTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  eventBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
  },
  eventBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textSecondary,
  },
  eventDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  eventTimestamp: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
});
