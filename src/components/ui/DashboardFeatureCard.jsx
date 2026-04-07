import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppCard } from './AppCard';
import { AppIcon } from './AppIcon';
import { theme } from '../../design-system/theme';

export const DashboardFeatureCard = ({
  title,
  description,
  badgeText,
  meta,
  ctaLabel,
  icon,
  variant = 'donor',
  width,
  onPress,
}) => {
  const tintVariant = variant === 'patient' ? 'patientTint' : 'donorTint';
  const iconState = variant === 'patient' ? 'muted' : 'active';

  const handlePress = async () => {
    if (!onPress) return;
    await Haptics.selectionAsync();
    onPress();
  };

  return (
    <Pressable onPress={handlePress} style={[styles.wrapper, { width }]}>
      <AppCard variant={tintVariant} radius="xl" padding="lg" style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.badgeWrap}>
            {icon ? (
              <View style={styles.iconWrap}>
                <AppIcon name={icon} size="sm" state={iconState} />
              </View>
            ) : null}
            {badgeText ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeText}</Text>
              </View>
            ) : null}
          </View>
          {ctaLabel ? (
            <View style={styles.ctaWrap}>
              <Text style={styles.ctaText}>{ctaLabel}</Text>
              <AppIcon name="chevronRight" size="sm" state="muted" />
            </View>
          ) : null}
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </AppCard>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  card: {
    minHeight: 152,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  badgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
    flex: 1,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.whiteOverlay,
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
  },
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.semibold,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.titleSm,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  description: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
  meta: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textMuted,
  },
  ctaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  ctaText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.semibold,
  },
});
