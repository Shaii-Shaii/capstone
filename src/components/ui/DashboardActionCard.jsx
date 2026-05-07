import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { AppCard } from './AppCard';
import { AppIcon } from './AppIcon';
import { useAuth } from '../../providers/AuthProvider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const paletteMap = {
    donor: {
      cardVariant: 'donorTint',
      titleColor: roles.headingText,
      descriptionColor: roles.bodyText,
      metaColor: roles.metaText,
      accent: roles.primaryActionBackground,
      iconBackground: roles.iconPrimarySurface,
      iconColor: roles.iconPrimaryColor,
      badgeBackground: roles.badgeStrongBackground,
      badgeText: roles.badgeStrongText,
    },
    patient: {
      cardVariant: 'patientTint',
      titleColor: roles.headingText,
      descriptionColor: roles.bodyText,
      metaColor: roles.metaText,
      accent: resolvedTheme?.secondaryColor || roles.supportCardBorder,
      iconBackground: roles.iconSupportSurface,
      iconColor: roles.iconSupportColor,
      badgeBackground: roles.badgeBackground,
      badgeText: roles.badgeText,
    },
    neutral: {
      cardVariant: 'elevated',
      titleColor: roles.headingText,
      descriptionColor: roles.bodyText,
      metaColor: roles.metaText,
      accent: roles.accentCardBorder,
      iconBackground: roles.iconAccentSurface,
      iconColor: roles.iconAccentColor,
      badgeBackground: roles.badgeBackground,
      badgeText: roles.badgeText,
    },
    disabled: {
      cardVariant: 'outline',
      titleColor: theme.colors.textDisabled,
      descriptionColor: roles.metaText,
      metaColor: roles.metaText,
      accent: roles.defaultCardBorder,
      iconBackground: roles.defaultCardBackground,
      iconColor: theme.colors.textDisabled,
      badgeBackground: roles.defaultCardBackground,
      badgeText: theme.colors.textDisabled,
    },
  };
  const config = disabled ? paletteMap.disabled : (paletteMap[variant] || paletteMap.neutral);
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = async () => {
    if (disabled || !onPress) return;
    await Haptics.selectionAsync();
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      disabled={disabled}
      onPressIn={() => {
        if (disabled) return;
        scale.value = withSpring(0.98, theme.motion.spring);
      }}
      onPressOut={() => {
        if (disabled) return;
        scale.value = withSpring(1, theme.motion.spring);
      }}
      style={[styles.wrapper, style, animatedStyle]}
    >
      <AppCard
        variant={config.cardVariant}
        padding={compact ? 'xs' : 'md'}
        radius="xl"
        style={styles.card}
      >
        {compact ? (
          <View style={styles.shortcutCard}>
            <View style={[styles.shortcutIconWrap, { backgroundColor: config.iconBackground }]}>
              {icon ? (
                <AppIcon
                  name={icon}
                  state={disabled ? 'disabled' : 'default'}
                  color={config.iconColor}
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
            {meta ? <Text numberOfLines={1} style={[styles.shortcutMeta, { color: config.metaColor }]}>{meta}</Text> : null}
          </View>
        ) : (
          <>
            <View style={[styles.accent, { backgroundColor: config.accent }]} />
            {icon ? (
              <View style={[styles.iconWrap, { backgroundColor: config.iconBackground }]}>
                <AppIcon name={icon} state={disabled ? 'disabled' : 'default'} color={config.iconColor} />
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
            {meta ? <Text style={[styles.meta, { color: config.metaColor }]}>{meta}</Text> : null}
          </>
        )}
      </AppCard>
    </AnimatedPressable>
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
  },
});
