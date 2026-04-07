import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../../design-system/theme';
import { AppCard } from './AppCard';
import { AppIcon } from './AppIcon';

const CARD_VARIANTS = {
  donor: {
    cardVariant: 'donorTint',
    titleColor: theme.colors.textPrimary,
    descriptionColor: theme.colors.textSecondary,
    badgeBackground: theme.colors.brandPrimaryMuted,
    badgeText: theme.colors.brandPrimary,
    accent: theme.colors.dashboardDonorSoft,
  },
  patient: {
    cardVariant: 'patientTint',
    titleColor: theme.colors.textPrimary,
    descriptionColor: theme.colors.textSecondary,
    badgeBackground: theme.colors.backgroundPrimary,
    badgeText: theme.colors.textSecondary,
    accent: theme.colors.dashboardPatientSoft,
  },
  neutral: {
    cardVariant: 'elevated',
    titleColor: theme.colors.textPrimary,
    descriptionColor: theme.colors.textSecondary,
    badgeBackground: theme.colors.surfaceSoft,
    badgeText: theme.colors.textSecondary,
    accent: theme.colors.accentSoft,
  },
  disabled: {
    cardVariant: 'outline',
    titleColor: theme.colors.textDisabled,
    descriptionColor: theme.colors.textMuted,
    badgeBackground: theme.colors.surfaceDisabled,
    badgeText: theme.colors.textDisabled,
    accent: theme.colors.surfaceDisabled,
  },
};

export const DashboardActionCard = ({
  title,
  description,
  badgeText,
  meta,
  icon,
  onPress,
  disabled = false,
  variant = 'neutral',
  style,
  compact = false,
}) => {
  const config = disabled ? CARD_VARIANTS.disabled : (CARD_VARIANTS[variant] || CARD_VARIANTS.neutral);

  const handlePress = async () => {
    if (disabled || !onPress) return;
    await Haptics.selectionAsync();
    onPress();
  };

  return (
    <Pressable onPress={handlePress} disabled={disabled} style={[styles.wrapper, style]}>
      <AppCard
        variant={config.cardVariant}
        padding={compact ? 'xs' : 'md'}
        radius="xl"
        style={styles.card}
      >
        {compact ? (
          <View style={styles.shortcutCard}>
            <View style={[styles.shortcutIconWrap, { backgroundColor: config.accent }]}>
              {icon ? (
                <AppIcon
                  name={icon}
                  state={disabled ? 'disabled' : variant === 'patient' ? 'muted' : 'active'}
                />
              ) : null}
              {badgeText ? (
                <View style={[styles.shortcutBadge, { backgroundColor: config.badgeBackground }]}>
                  <Text style={[styles.shortcutBadgeText, { color: config.badgeText }]}>{badgeText}</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={2} style={[styles.shortcutTitle, { color: config.titleColor }]}>
              {title}
            </Text>
            {meta ? <Text numberOfLines={1} style={styles.shortcutMeta}>{meta}</Text> : null}
          </View>
        ) : (
          <>
            <View style={[styles.accent, { backgroundColor: config.accent }]} />
            {icon ? (
              <View style={styles.iconWrap}>
                <AppIcon name={icon} state={disabled ? 'disabled' : variant === 'patient' ? 'muted' : 'active'} />
              </View>
            ) : null}
            <View style={styles.header}>
              <Text style={[styles.title, { color: config.titleColor }]}>{title}</Text>
              {badgeText ? (
                <View style={[styles.badge, { backgroundColor: config.badgeBackground }]}>
                  <Text style={[styles.badgeText, { color: config.badgeText }]}>{badgeText}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.description, { color: config.descriptionColor }]}>{description}</Text>
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          </>
        )}
      </AppCard>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  card: {
    position: 'relative',
  },
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.whiteOverlay,
    marginBottom: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    lineHeight: theme.typography.compact.bodyLg * theme.typography.lineHeights.snug,
  },
  description: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
  meta: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textMuted,
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
  },
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  shortcutCard: {
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  shortcutIconWrap: {
    position: 'relative',
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutBadge: {
    position: 'absolute',
    top: -2,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  shortcutBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.semibold,
  },
  shortcutTitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 14,
  },
  shortcutMeta: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    color: theme.colors.textMuted,
  },
});
