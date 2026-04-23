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

function TrackerStep({ step, isLast, role }) {
  const palette = STEP_STATE_STYLES[step.state] || STEP_STATE_STYLES.upcoming;
  const isPatient = role === 'patient';
  const iconName = step.state === 'completed'
    ? 'success'
    : step.state === 'current'
      ? 'clock-time-four-outline'
      : step.state === 'attention'
        ? 'error'
        : 'circle-outline';
  const iconColor = step.state === 'upcoming' ? theme.colors.textMuted : theme.colors.textInverse;

  return (
    <View style={[styles.stepRow, isPatient ? styles.stepRowPatient : null]}>
      <View style={[styles.rail, isPatient ? styles.railPatient : null]}>
        <View
          style={[
            styles.stepDot,
            isPatient ? styles.stepDotPatient : null,
            isPatient && step.state === 'upcoming' ? styles.stepDotPatientUpcoming : null,
            { backgroundColor: isPatient && step.state === 'upcoming' ? theme.colors.surfaceSoft : palette.dotColor },
          ]}
        >
          {isPatient ? <AppIcon name={iconName} color={iconColor} size="sm" /> : null}
        </View>
        {!isLast ? (
          <View style={[styles.stepLine, isPatient ? styles.stepLinePatient : null, { backgroundColor: palette.lineColor }]} />
        ) : null}
      </View>

      <View style={[styles.stepCard, isPatient ? styles.stepCardPatient : null, { backgroundColor: palette.cardBackground }]}>
        <View style={[styles.stepTopRow, isPatient ? styles.stepTopRowPatient : null]}>
          <Text numberOfLines={2} style={[styles.stepTitle, { color: palette.titleColor }]}>{step.title}</Text>
          <View style={[styles.stepBadge, isPatient ? styles.stepBadgePatient : null]}>
            <Text numberOfLines={1} style={styles.stepBadgeText}>{step.label}</Text>
          </View>
        </View>
        <Text numberOfLines={isPatient ? 2 : 3} style={[styles.stepDescription, isPatient ? styles.stepDescriptionPatient : null, { color: palette.bodyColor }]}>
          {step.description}
        </Text>
      </View>
    </View>
  );
}

function TrackerEvent({ event, role }) {
  const isPatient = role === 'patient';

  return (
    <View style={[styles.eventCard, isPatient ? styles.eventCardPatient : null]}>
      <View style={styles.eventTopRow}>
        <Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text>
        {event.badge ? (
          <View style={styles.eventBadge}>
            <Text numberOfLines={1} style={styles.eventBadgeText}>{event.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={isPatient ? 2 : 4} style={styles.eventDescription}>{event.description}</Text>
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
  const isPatient = role === 'patient';
  const summaryTone = SUMMARY_TONE_STYLES[tracker?.summary?.tone] || SUMMARY_TONE_STYLES.info;
  const cardVariant = role === 'donor' ? 'donorTint' : 'patientTint';

  return (
    <AppCard variant={cardVariant} radius="xl" padding={isPatient ? 'md' : 'lg'}>
      <DashboardSectionHeader
        title={tracker?.title || (role === 'donor' ? 'Donation Status' : 'Wig Request Status')}
        description={isPatient ? (tracker?.subtitle || 'Track your wig request.') : (tracker?.subtitle || 'Track the latest progress updates here.')}
        style={styles.sectionHeader}
      />

      <View style={[styles.headerActions, isPatient ? styles.headerActionsPatient : null]}>
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
        <View style={[styles.summaryCard, isPatient ? styles.summaryCardPatient : null]}>
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
              role={role}
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
            <TrackerEvent key={event.key} event={event} role={role} />
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
  headerActionsPatient: {
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
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
  summaryCardPatient: {
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
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
  stepRowPatient: {
    gap: theme.spacing.xs,
  },
  rail: {
    width: 22,
    alignItems: 'center',
  },
  railPatient: {
    width: 30,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: theme.radius.full,
    marginTop: 10,
  },
  stepDotPatient: {
    width: 24,
    height: 24,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotPatientUpcoming: {
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  stepLine: {
    width: 2,
    flex: 1,
    marginTop: 6,
    borderRadius: theme.radius.full,
    minHeight: 54,
  },
  stepLinePatient: {
    minHeight: 42,
    marginTop: 4,
  },
  stepCard: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
  },
  stepCardPatient: {
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  stepTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  stepTopRowPatient: {
    alignItems: 'center',
  },
  stepTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  stepBadge: {
    maxWidth: 132,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  stepBadgePatient: {
    maxWidth: 112,
    paddingVertical: 4,
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
  stepDescriptionPatient: {
    lineHeight: theme.typography.semantic.bodySm * 1.35,
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
  eventCardPatient: {
    paddingVertical: theme.spacing.sm,
  },
  eventTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  eventTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  eventBadge: {
    maxWidth: 120,
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
