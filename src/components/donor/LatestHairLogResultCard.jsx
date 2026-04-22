import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
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
  onViewResult,
  onStartCheckHair,
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

  return (
    <AppCard variant="default" radius="xl" padding="md" style={styles.card}>
      {/* Header with status */}
      <View style={styles.header}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <AppIcon name={statusIcon} size="sm" state="default" color={statusColor} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.label, { color: roles.metaText }]}>Your hair condition</Text>
          <Text style={[styles.condition, { color: statusColor }]}>
            {conditionText}
          </Text>
        </View>
      </View>

      {/* Recommendation */}
      <Text style={[styles.recommendation, { color: roles.bodyText }]}>
        {recommendationText}
      </Text>

      {/* Action button */}
      <View style={styles.actions}>
        <AppButton
          title={latestRecommendation ? 'View latest result' : 'Check again'}
          size="sm"
          fullWidth={false}
          onPress={latestRecommendation ? onViewResult : onStartCheckHair}
        />
      </View>
    </AppCard>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.sm,
  },
  header: {
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
    fontSize: theme.typography.compact.bodyMd,
    fontWeight: theme.typography.weights.semibold,
  },
  recommendation: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  actions: {
    marginTop: theme.spacing.xs,
  },
});
