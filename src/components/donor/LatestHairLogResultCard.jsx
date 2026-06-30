import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppCard } from '../ui/AppCard';
import { AppIcon } from '../ui/AppIcon';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

/**
 * LatestHairLogResultCard - Compact display of latest AI analysis + recommendation
 * Shows actual AI-detected condition and recommendation text from database
 */
export const LatestHairLogResultCard = ({ 
  latestScreening,
  latestRecommendation,
}) => {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  if (!latestScreening) {
    return null;
  }

  const conditionText = latestScreening.detected_condition || 'Not available';
  const recommendationText = latestRecommendation?.recommendation_text 
    ? String(latestRecommendation.recommendation_text).trim().split('\n')[0].slice(0, 120)
    : latestScreening.decision || latestScreening.summary || 'Continue your current routine';

  // Map condition to color/icon
  const conditionLower = String(conditionText).toLowerCase();
  let statusColor = theme.colors.brandPrimary;
  let statusIcon = 'check';

  if (conditionLower.includes('healthy') || conditionLower.includes('good')) {
    statusColor = '#54b86f';
    statusIcon = 'check';
  } else if (conditionLower.includes('fair') || conditionLower.includes('okay')) {
    statusColor = '#f0a856';
    statusIcon = 'info';
  } else if (conditionLower.includes('damaged') || conditionLower.includes('poor') || conditionLower.includes('dry')) {
    statusColor = '#e74c3c';
    statusIcon = 'alert';
  }

  const recommendationLabel = conditionLower.includes('healthy') || conditionLower.includes('good')
    ? 'Maintain routine'
    : conditionLower.includes('fair') || conditionLower.includes('okay')
      ? 'Stay consistent'
      : 'Needs care';
  const statusLabel = conditionLower.includes('healthy') || conditionLower.includes('good')
    ? 'Good'
    : conditionLower.includes('fair') || conditionLower.includes('okay')
      ? 'Watch'
      : 'Needs care';

  return (
    <AppCard variant="default" radius="xl" padding="md" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <AppIcon name={statusIcon} size="sm" state="default" color={statusColor} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.label, { color: roles.metaText }]}>AI Recommendation</Text>
            <Text style={[styles.condition, { color: roles.headingText }]} numberOfLines={2}>
              {recommendationLabel}
            </Text>
          </View>
        </View>
        <View style={[styles.statusChip, { backgroundColor: statusColor + '18', borderColor: statusColor + '26' }]}>
          <Text style={[styles.statusChipText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <Text style={[styles.conditionText, { color: roles.metaText }]} numberOfLines={1}>
        {conditionText}
      </Text>

      <Text style={[styles.recommendation, { color: roles.bodyText }]} numberOfLines={3}>
        {recommendationText}
      </Text>
    </AppCard>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  statusBadge: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  condition: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.snug,
  },
  statusChip: {
    minHeight: 26,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    maxWidth: '42%',
  },
  statusChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  conditionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.snug,
  },
  recommendation: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
});
